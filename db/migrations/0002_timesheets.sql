create table if not exists public."CLIENTS" (
  id            bigint generated always as identity primary key,
  client_name   varchar(150) not null,
  contact_email varchar(150),
  is_active     boolean      not null default true
);

create table if not exists public."PROJECTS" (
  id           bigint generated always as identity primary key,
  client_id    bigint       not null references public."CLIENTS"(id),
  manager_id   bigint       references public."USERS"(id),
  project_name varchar(150) not null,
  code         varchar(40),
  start_date   date,
  end_date     date,
  constraint "chk_PROJECTS_dates" check (end_date is null or start_date is null or end_date >= start_date)
);

create index if not exists "idx_PROJECTS_manager_id" on public."PROJECTS" (manager_id);
create unique index if not exists "idx_PROJECTS_client_id_project_name"
  on public."PROJECTS" (client_id, project_name);

create table if not exists public."PROJECT_ASSIGNMENTS" (
  id            bigint generated always as identity primary key,
  project_id    bigint         not null references public."PROJECTS"(id),
  consultant_id bigint         not null references public."USERS"(id),
  pay_rate      numeric(10, 2) not null,
  currency      char(3)        not null default 'USD',
  start_date    date           not null,
  end_date      date,
  is_active     boolean        not null default true,
  constraint "chk_PROJECT_ASSIGNMENTS_pay_rate" check (pay_rate >= 0),
  constraint "chk_PROJECT_ASSIGNMENTS_dates" check (end_date is null or end_date >= start_date)
);

create index if not exists "idx_PROJECT_ASSIGNMENTS_consultant_id"
  on public."PROJECT_ASSIGNMENTS" (consultant_id);
create unique index if not exists "idx_PROJECT_ASSIGNMENTS_project_id_consultant_id_start_date"
  on public."PROJECT_ASSIGNMENTS" (project_id, consultant_id, start_date);

create table if not exists public."PROJECT_APPROVAL_STEPS" (
  id            bigint      generated always as identity primary key,
  project_id    bigint      not null references public."PROJECTS"(id),
  seq           smallint    not null,
  approver_type varchar(20) not null,
  user_id       bigint      references public."USERS"(id),
  role_id       bigint      references public."ROLES"(id),
  is_active     boolean     not null default true,
  constraint "chk_PROJECT_APPROVAL_STEPS_seq" check (seq between 1 and 10),
  constraint "chk_PROJECT_APPROVAL_STEPS_approver_type"
    check (approver_type in ('CLIENT_EMAIL', 'USER', 'ROLE')),
  constraint "chk_PROJECT_APPROVAL_STEPS_approver_ref" check (
    (approver_type = 'USER'         and user_id is not null and role_id is null) or
    (approver_type = 'ROLE'         and role_id is not null and user_id is null) or
    (approver_type = 'CLIENT_EMAIL' and user_id is null     and role_id is null)
  )
);

create unique index if not exists "idx_PROJECT_APPROVAL_STEPS_project_id_seq"
  on public."PROJECT_APPROVAL_STEPS" (project_id, seq);

create table if not exists public."TIMESHEETS" (
  id              bigint        generated always as identity primary key,
  assignment_id   bigint        not null references public."PROJECT_ASSIGNMENTS"(id),
  submission_code varchar(30)   unique,
  current_seq     smallint,
  week_start_date date          not null,
  week_end_date   date          not null,
  status          varchar(20)   not null default 'DRAFT',
  total_hours     numeric(6, 2) not null default 0,
  cycle_no        smallint      not null default 1,
  submitted_at    timestamp,
  closed_at       timestamp,
  created_at      timestamp     not null default now(),
  updated_at      timestamp     not null default now(),
  constraint "chk_TIMESHEETS_status" check (
    status in ('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'REJECTED', 'APPROVED', 'CLOSED', 'PAID')
  ),
  constraint "chk_TIMESHEETS_week_start_monday" check (extract(isodow from week_start_date) = 1),
  constraint "chk_TIMESHEETS_week_end_sunday"   check (extract(isodow from week_end_date) = 7),
  constraint "chk_TIMESHEETS_week_span"         check (week_end_date = week_start_date + 6),
  constraint "chk_TIMESHEETS_cycle_no"          check (cycle_no >= 1),
  constraint "chk_TIMESHEETS_total_hours"       check (total_hours >= 0)
);

create index if not exists "idx_TIMESHEETS_status" on public."TIMESHEETS" (status);
create index if not exists "idx_TIMESHEETS_week_start_date" on public."TIMESHEETS" (week_start_date);
create unique index if not exists "idx_TIMESHEETS_assignment_id_week_start_date"
  on public."TIMESHEETS" (assignment_id, week_start_date);

create table if not exists public."TIMESHEET_DAYS" (
  id           bigint        generated always as identity primary key,
  timesheet_id bigint        not null references public."TIMESHEETS"(id) on delete cascade,
  work_date    date          not null,
  total_hours  numeric(4, 2) not null default 0,
  note         text,
  constraint "chk_TIMESHEET_DAYS_total_hours" check (total_hours >= 0)
);

create unique index if not exists "idx_TIMESHEET_DAYS_timesheet_id_work_date"
  on public."TIMESHEET_DAYS" (timesheet_id, work_date);

create table if not exists public."TIMESHEET_ACTIVITIES" (
  id         bigint        generated always as identity primary key,
  day_id     bigint        not null references public."TIMESHEET_DAYS"(id) on delete cascade,
  line_no    smallint      not null,
  hours      numeric(4, 2) not null,
  activity   text          not null,
  created_at timestamp     not null default now(),
  constraint "chk_TIMESHEET_ACTIVITIES_hours" check (
    hours >= 0.25 and hours <= 8 and mod(hours, 0.25) = 0
  ),
  constraint "chk_TIMESHEET_ACTIVITIES_line_no" check (line_no >= 1)
);

create unique index if not exists "idx_TIMESHEET_ACTIVITIES_day_id_line_no"
  on public."TIMESHEET_ACTIVITIES" (day_id, line_no);

create table if not exists public."TIMESHEET_APPROVALS" (
  id                 bigint      generated always as identity primary key,
  timesheet_id       bigint      not null references public."TIMESHEETS"(id) on delete cascade,
  step_id            bigint      references public."PROJECT_APPROVAL_STEPS"(id) on delete set null,
  seq                smallint    not null,
  cycle_no           smallint    not null default 1,
  approver_type      varchar(20) not null,
  approver_id        bigint      references public."USERS"(id),
  approver_role_code varchar(30),
  status             varchar(24) not null default 'PENDING',
  resolved_via       varchar(20),
  review_no          smallint    not null default 0,
  comments           text,
  decided_at         timestamp,
  constraint "chk_TIMESHEET_APPROVALS_approver_type"
    check (approver_type in ('CLIENT_EMAIL', 'USER', 'ROLE')),
  constraint "chk_TIMESHEET_APPROVALS_status" check (
    status in ('PENDING', 'APPROVED', 'REJECTED_TO_PREVIOUS', 'REJECTED_TO_CONSULTANT')
  ),
  constraint "chk_TIMESHEET_APPROVALS_resolved_via"
    check (resolved_via is null or resolved_via in ('EMAIL_AUTO', 'PM_MANUAL', 'USER_ACTION')),
  constraint "chk_TIMESHEET_APPROVALS_seq"      check (seq between 1 and 10),
  constraint "chk_TIMESHEET_APPROVALS_cycle_no" check (cycle_no >= 1),
  constraint "chk_TIMESHEET_APPROVALS_decided" check (
    (status = 'PENDING' and decided_at is null) or
    (status <> 'PENDING' and decided_at is not null)
  )
);

create index if not exists "idx_TIMESHEET_APPROVALS_timesheet_id_cycle_no"
  on public."TIMESHEET_APPROVALS" (timesheet_id, cycle_no);
create unique index if not exists "idx_TIMESHEET_APPROVALS_timesheet_id_seq_cycle_no"
  on public."TIMESHEET_APPROVALS" (timesheet_id, seq, cycle_no);

create table if not exists public."TIMESHEET_EVENTS" (
  id              bigint      generated always as identity primary key,
  timesheet_id    bigint      not null references public."TIMESHEETS"(id) on delete cascade,
  actor_id        bigint      references public."USERS"(id),
  from_seq        smallint,
  to_seq          smallint,
  cycle_no        smallint    not null default 1,
  event_type      varchar(30) not null,
  actor_role_code varchar(30),
  from_status     varchar(20),
  to_status       varchar(20),
  comments        text,
  metadata        jsonb       not null default '{}',
  occurred_at     timestamp   not null default now(),
  constraint "chk_TIMESHEET_EVENTS_event_type" check (
    event_type in (
      'CREATED', 'SUBMITTED', 'STEP_ENTERED', 'APPROVED', 'REJECTED_PREV',
      'REJECTED_CONSULTANT', 'NOTIFIED', 'RECALLED', 'MODIFIED', 'CLOSED', 'PAID'
    )
  )
);

create index if not exists "idx_TIMESHEET_EVENTS_actor_id_occurred_at"
  on public."TIMESHEET_EVENTS" (actor_id, occurred_at);
create index if not exists "idx_TIMESHEET_EVENTS_timesheet_id_occurred_at"
  on public."TIMESHEET_EVENTS" (timesheet_id, occurred_at);

create table if not exists public."APPROVAL_REQUESTS" (
  id              bigint       generated always as identity primary key,
  approval_id     bigint       not null references public."TIMESHEET_APPROVALS"(id) on delete cascade,
  timesheet_id    bigint       not null references public."TIMESHEETS"(id) on delete cascade,
  recipient_email varchar(254) not null,
  token           varchar(64)  not null unique,
  status          varchar(20)  not null default 'PENDING',
  sent_at         timestamp    not null default now(),
  responded_at    timestamp,
  response_note   text,
  raw_payload     jsonb,
  expires_at      timestamp,
  created_at      timestamp    not null default now(),
  constraint "chk_APPROVAL_REQUESTS_status"
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'))
);

create index if not exists "idx_APPROVAL_REQUESTS_approval_id"
  on public."APPROVAL_REQUESTS" (approval_id);
create index if not exists "idx_APPROVAL_REQUESTS_status" on public."APPROVAL_REQUESTS" (status);
create index if not exists "idx_APPROVAL_REQUESTS_timesheet_id"
  on public."APPROVAL_REQUESTS" (timesheet_id);

create table if not exists public."NOTIFICATIONS" (
  id           bigint       generated always as identity primary key,
  user_id      bigint       not null references public."USERS"(id) on delete cascade,
  timesheet_id bigint       references public."TIMESHEETS"(id) on delete cascade,
  kind         varchar(30),
  title        varchar(150) not null,
  body         text,
  is_read      boolean      not null default false,
  created_at   timestamp    not null default now(),
  constraint "chk_NOTIFICATIONS_kind" check (
    kind is null or
    kind in ('TASK_ASSIGNED', 'REVIEW_REQUESTED', 'APPROVED', 'REJECTED', 'CLOSED')
  )
);

create index if not exists "idx_NOTIFICATIONS_user_id_is_read"
  on public."NOTIFICATIONS" (user_id, is_read);

create table if not exists public."PAYMENT_BATCHES" (
  id           bigint         generated always as identity primary key,
  created_by   bigint         not null references public."USERS"(id),
  reference    varchar(40)    not null unique,
  total_amount numeric(14, 2) not null default 0,
  status       varchar(20)    not null default 'OPEN',
  created_at   timestamp      not null default now(),
  confirmed_at timestamp
);

create table if not exists public."PAYMENTS" (
  id           bigint         generated always as identity primary key,
  timesheet_id bigint         not null unique references public."TIMESHEETS"(id),
  batch_id     bigint         references public."PAYMENT_BATCHES"(id) on delete set null,
  scheduled_by bigint         references public."USERS"(id),
  hours        numeric(6, 2)  not null,
  hourly_rate  numeric(10, 2) not null,
  amount       numeric(14, 2) not null,
  currency     char(3)        not null default 'USD',
  status       varchar(20)    not null default 'PENDING',
  scheduled_for date,
  scheduled_at timestamp,
  paid_at      timestamp,
  external_ref varchar(60),
  created_at   timestamp      not null default now(),
  constraint "chk_PAYMENTS_amounts" check (hours >= 0 and hourly_rate >= 0 and amount >= 0)
);

create index if not exists "idx_PAYMENTS_batch_id" on public."PAYMENTS" (batch_id);
create index if not exists "idx_PAYMENTS_status" on public."PAYMENTS" (status);

create or replace function public.fn_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists "trg_TIMESHEETS_updated_at" on public."TIMESHEETS";
create trigger "trg_TIMESHEETS_updated_at"
  before update on public."TIMESHEETS"
  for each row execute function public.fn_set_updated_at();

create or replace function public.fn_recalc_day_hours() returns trigger
language plpgsql as $$
declare
  day_ids bigint[];
begin
  if tg_op = 'INSERT' then
    day_ids := array[new.day_id];
  elsif tg_op = 'DELETE' then
    day_ids := array[old.day_id];
  else
    day_ids := array[old.day_id, new.day_id];
  end if;

  update public."TIMESHEET_DAYS" d
     set total_hours = coalesce(
       (select sum(a.hours) from public."TIMESHEET_ACTIVITIES" a where a.day_id = d.id), 0
     )
   where d.id = any(day_ids);

  return null;
end;
$$;

drop trigger if exists "trg_TIMESHEET_ACTIVITIES_recalc_day" on public."TIMESHEET_ACTIVITIES";
create trigger "trg_TIMESHEET_ACTIVITIES_recalc_day"
  after insert or update or delete on public."TIMESHEET_ACTIVITIES"
  for each row execute function public.fn_recalc_day_hours();

create or replace function public.fn_recalc_timesheet_hours() returns trigger
language plpgsql as $$
declare
  timesheet_ids bigint[];
begin
  if tg_op = 'INSERT' then
    timesheet_ids := array[new.timesheet_id];
  elsif tg_op = 'DELETE' then
    timesheet_ids := array[old.timesheet_id];
  else
    timesheet_ids := array[old.timesheet_id, new.timesheet_id];
  end if;

  update public."TIMESHEETS" t
     set total_hours = coalesce(
       (select sum(d.total_hours) from public."TIMESHEET_DAYS" d where d.timesheet_id = t.id), 0
     )
   where t.id = any(timesheet_ids);

  return null;
end;
$$;

drop trigger if exists "trg_TIMESHEET_DAYS_recalc_timesheet" on public."TIMESHEET_DAYS";
create trigger "trg_TIMESHEET_DAYS_recalc_timesheet"
  after insert or update or delete on public."TIMESHEET_DAYS"
  for each row execute function public.fn_recalc_timesheet_hours();

alter table public."CLIENTS"              enable row level security;
alter table public."PROJECTS"             enable row level security;
alter table public."PROJECT_ASSIGNMENTS"  enable row level security;
alter table public."PROJECT_APPROVAL_STEPS" enable row level security;
alter table public."TIMESHEETS"           enable row level security;
alter table public."TIMESHEET_DAYS"       enable row level security;
alter table public."TIMESHEET_ACTIVITIES" enable row level security;
alter table public."TIMESHEET_APPROVALS"  enable row level security;
alter table public."TIMESHEET_EVENTS"     enable row level security;
alter table public."APPROVAL_REQUESTS"    enable row level security;
alter table public."NOTIFICATIONS"        enable row level security;
alter table public."PAYMENT_BATCHES"      enable row level security;
alter table public."PAYMENTS"             enable row level security;
