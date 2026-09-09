create table if not exists public."ROLES" (
  id        bigint generated always as identity primary key,
  code      varchar(30)  not null unique,
  name      varchar(80)  not null
);

create table if not exists public."USERS" (
  id                   bigint generated always as identity primary key,
  role_id              bigint       not null references public."ROLES"(id),
  full_name            varchar(150) not null,
  user_name            varchar(50)  not null unique,
  email                varchar(254) not null unique,
  password_hash        varchar(255) not null,
  job_title            varchar(100),
  failed_attempts      smallint     not null default 0,
  locked_until         timestamp,
  last_login_at        timestamp,
  is_active            boolean      not null default true,
  must_change_password boolean      not null default false
);

create index if not exists "idx_USERS_role_id" on public."USERS" (role_id);
create index if not exists "idx_USERS_is_active" on public."USERS" (is_active);
create index if not exists "idx_USERS_lower_user_name" on public."USERS" (lower(user_name));
create index if not exists "idx_USERS_lower_email" on public."USERS" (lower(email));

create table if not exists public."COMPANIES" (
  id         bigint       generated always as identity primary key,
  legal_name varchar(200) not null,
  trade_name varchar(150) not null,
  rfc        varchar(13),
  is_active  boolean      not null default true,
  constraint "chk_COMPANIES_rfc_length" check (rfc is null or char_length(rfc) in (12, 13)),
  constraint "chk_COMPANIES_rfc_upper"  check (rfc is null or rfc = upper(rfc))
);

create unique index if not exists "idx_COMPANIES_rfc"
  on public."COMPANIES" (rfc) where rfc is not null;
create unique index if not exists "idx_COMPANIES_lower_legal_name"
  on public."COMPANIES" (lower(legal_name));
create index if not exists "idx_COMPANIES_is_active" on public."COMPANIES" (is_active);

create table if not exists public."CLIENTS" (
  id            bigint generated always as identity primary key,
  company_id    bigint       not null references public."COMPANIES"(id),
  client_name   varchar(150) not null,
  contact_email varchar(150),
  is_active     boolean      not null default true
);

create index if not exists "idx_CLIENTS_company_id" on public."CLIENTS" (company_id);

create unique index if not exists "idx_CLIENTS_company_id_lower_client_name"
  on public."CLIENTS" (company_id, lower(client_name));

create table if not exists public."PROJECTS" (
  id           bigint generated always as identity primary key,
  client_id    bigint       not null references public."CLIENTS"(id),
  manager_id   bigint       references public."USERS"(id),
  project_name varchar(150) not null,
  code         varchar(40),
  status       varchar(20)  not null default 'ACTIVE',
  start_date   date,
  end_date     date,
  closed_at    timestamp,
  closed_by    bigint       references public."USERS"(id),
  constraint "chk_PROJECTS_dates" check (end_date is null or start_date is null or end_date >= start_date),
  constraint "chk_PROJECTS_status" check (status in ('ACTIVE', 'CLOSED')),
  constraint "chk_PROJECTS_closed_requires_end_date"
    check (status <> 'CLOSED' or end_date is not null)
);

create index if not exists "idx_PROJECTS_manager_id" on public."PROJECTS" (manager_id);
create index if not exists "idx_PROJECTS_status" on public."PROJECTS" (status);
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
  id             bigint      generated always as identity primary key,
  project_id     bigint      not null references public."PROJECTS"(id),
  seq            smallint    not null,
  approver_type  varchar(20) not null,
  user_id        bigint      references public."USERS"(id),
  role_id        bigint      references public."ROLES"(id),
  client_id      bigint      references public."CLIENTS"(id),
  approver_email varchar(254),
  approver_name  varchar(150),
  is_active      boolean     not null default true,
  constraint "chk_PROJECT_APPROVAL_STEPS_seq" check (seq between 1 and 10),
  constraint "chk_PROJECT_APPROVAL_STEPS_approver_type"
    check (approver_type in ('CLIENT_EMAIL', 'USER', 'ROLE')),
  constraint "chk_PROJECT_APPROVAL_STEPS_approver_ref" check (
    (approver_type = 'USER'
       and user_id is not null and role_id is null and client_id is null
       and approver_email is null) or
    (approver_type = 'ROLE'
       and role_id is not null and user_id is null and client_id is null
       and approver_email is null) or
    (approver_type = 'CLIENT_EMAIL'
       and client_id is not null and user_id is null and role_id is null
       and approver_email is not null)
  ),
  constraint "chk_PROJECT_APPROVAL_STEPS_approver_email" check (
    approver_email is null or (
      approver_email = lower(approver_email) and
      approver_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'
    )
  )
);

create unique index if not exists "idx_PROJECT_APPROVAL_STEPS_project_id_seq"
  on public."PROJECT_APPROVAL_STEPS" (project_id, seq);
create unique index if not exists "idx_PROJECT_APPROVAL_STEPS_project_id_user_id"
  on public."PROJECT_APPROVAL_STEPS" (project_id, user_id) where user_id is not null;
create unique index if not exists "idx_PROJECT_APPROVAL_STEPS_project_id_role_id"
  on public."PROJECT_APPROVAL_STEPS" (project_id, role_id) where role_id is not null;
create unique index if not exists "idx_PROJECT_APPROVAL_STEPS_project_id_client_id"
  on public."PROJECT_APPROVAL_STEPS" (project_id, client_id) where client_id is not null;
create unique index if not exists "idx_PROJECT_APPROVAL_STEPS_project_id_approver_email"
  on public."PROJECT_APPROVAL_STEPS" (project_id, approver_email) where approver_email is not null;

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
  approver_email     varchar(254),
  approver_name      varchar(150),
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

create or replace function public.fn_create_user_with_assignments(
  p_user        jsonb,
  p_assignments jsonb
) returns bigint
language plpgsql
as $$
declare
  v_user_id    bigint;
  v_assignment jsonb;
begin
  insert into public."USERS" (
    role_id, full_name, user_name, email, password_hash, job_title,
    is_active, must_change_password
  ) values (
    (p_user ->> 'roleId')::bigint,
    p_user ->> 'fullName',
    p_user ->> 'userName',
    p_user ->> 'email',
    p_user ->> 'passwordHash',
    p_user ->> 'jobTitle',
    coalesce((p_user ->> 'isActive')::boolean, true),
    coalesce((p_user ->> 'mustChangePassword')::boolean, true)
  )
  returning id into v_user_id;

  for v_assignment in select * from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb))
  loop
    if not exists (
      select 1 from public."PROJECTS" where id = (v_assignment ->> 'projectId')::bigint
    ) then
      raise exception 'PROJECT_NOT_FOUND:%', v_assignment ->> 'projectId';
    end if;

    insert into public."PROJECT_ASSIGNMENTS"
      (project_id, consultant_id, pay_rate, currency, start_date, end_date, is_active)
    values (
      (v_assignment ->> 'projectId')::bigint,
      v_user_id,
      (v_assignment ->> 'payRate')::numeric,
      coalesce(v_assignment ->> 'currency', 'USD'),
      (v_assignment ->> 'startDate')::date,
      (v_assignment ->> 'endDate')::date,
      true
    );
  end loop;

  return v_user_id;
end;
$$;

create or replace function public.fn_replace_project_approval_steps(
  p_project_id bigint,
  p_steps      jsonb
) returns integer
language plpgsql
as $$
declare
  v_step    jsonb;
  v_role_id bigint;
  v_count   integer;
  v_total   integer := 0;
begin
  if not exists (select 1 from public."PROJECTS" where id = p_project_id) then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  v_count := jsonb_array_length(coalesce(p_steps, '[]'::jsonb));

  if v_count < 2 then
    raise exception 'APPROVAL_STEPS_MIN:%', v_count;
  end if;

  if v_count > 10 then
    raise exception 'APPROVAL_STEPS_MAX:%', v_count;
  end if;

  delete from public."PROJECT_APPROVAL_STEPS" where project_id = p_project_id;

  for v_step in select * from jsonb_array_elements(p_steps)
  loop
    v_role_id := null;

    if v_step ->> 'approverType' = 'ROLE' then
      select id into v_role_id from public."ROLES" where code = v_step ->> 'roleCode';

      if v_role_id is null then
        raise exception 'ROLE_NOT_FOUND:%', v_step ->> 'roleCode';
      end if;
    end if;

    insert into public."PROJECT_APPROVAL_STEPS"
      (project_id, seq, approver_type, user_id, role_id, client_id,
       approver_email, approver_name, is_active)
    values (
      p_project_id,
      (v_step ->> 'seq')::smallint,
      v_step ->> 'approverType',
      case when v_step ->> 'approverType' = 'USER' then (v_step ->> 'userId')::bigint end,
      v_role_id,
      case when v_step ->> 'approverType' = 'CLIENT_EMAIL' then (v_step ->> 'clientId')::bigint end,
      case
        when v_step ->> 'approverType' = 'CLIENT_EMAIL' then lower(v_step ->> 'approverEmail')
      end,
      nullif(v_step ->> 'approverName', ''),
      true
    );

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

create or replace function public.fn_close_project(
  p_project_id      bigint,
  p_effective_date  date,
  p_actor_id        bigint
) returns jsonb
language plpgsql
as $$
declare
  v_project    public."PROJECTS";
  v_open       integer;
  v_stranded   integer;
  v_closed     integer;
begin
  select * into v_project
    from public."PROJECTS"
   where id = p_project_id
     for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  if v_project.status = 'CLOSED' then
    raise exception 'PROJECT_ALREADY_CLOSED:%', v_project.end_date;
  end if;

  if v_project.start_date is not null and p_effective_date < v_project.start_date then
    raise exception 'CLOSE_DATE_BEFORE_START:%', v_project.start_date;
  end if;

  select count(*)
    into v_open
    from public."TIMESHEETS" t
    join public."PROJECT_ASSIGNMENTS" a on a.id = t.assignment_id
   where a.project_id = p_project_id
     and t.status in ('SUBMITTED', 'IN_REVIEW')
     and t.week_start_date > p_effective_date;

  if v_open > 0 then
    raise exception 'PROJECT_HAS_OPEN_TIMESHEETS:%', v_open;
  end if;

  select count(*)
    into v_stranded
    from public."TIMESHEETS" t
    join public."PROJECT_ASSIGNMENTS" a on a.id = t.assignment_id
   where a.project_id = p_project_id
     and t.status in ('DRAFT', 'REJECTED')
     and t.week_start_date > p_effective_date;

  update public."PROJECT_ASSIGNMENTS"
     set end_date  = p_effective_date,
         is_active = false
   where project_id = p_project_id
     and (end_date is null or end_date > p_effective_date);

  get diagnostics v_closed = row_count;

  update public."PROJECTS"
     set status    = 'CLOSED',
         end_date  = p_effective_date,
         closed_at = now(),
         closed_by = p_actor_id
   where id = p_project_id;

  return jsonb_build_object(
    'projectId', p_project_id,
    'effectiveDate', p_effective_date,
    'closedAssignments', v_closed,
    'strandedTimesheets', v_stranded
  );
end;
$$;

create or replace function public.fn_reopen_project(
  p_project_id bigint
) returns jsonb
language plpgsql
as $$
declare
  v_project public."PROJECTS";
begin
  select * into v_project
    from public."PROJECTS"
   where id = p_project_id
     for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  if v_project.status <> 'CLOSED' then
    raise exception 'PROJECT_NOT_CLOSED';
  end if;

  update public."PROJECTS"
     set status    = 'ACTIVE',
         end_date  = null,
         closed_at = null,
         closed_by = null
   where id = p_project_id;

  return jsonb_build_object('projectId', p_project_id, 'previousEndDate', v_project.end_date);
end;
$$;

create or replace function public.fn_save_timesheet_draft(
  p_assignment_id bigint,
  p_week_start    date,
  p_actor_id      bigint,
  p_actor_role_code varchar,
  p_days          jsonb
) returns bigint
language plpgsql
as $$
declare
  v_timesheet_id bigint;
  v_status       varchar(20);
  v_created      boolean := false;
  v_day          jsonb;
  v_day_id       bigint;
begin
  select id, status
    into v_timesheet_id, v_status
    from public."TIMESHEETS"
   where assignment_id = p_assignment_id
     and week_start_date = p_week_start
     for update;

  if not found then
    insert into public."TIMESHEETS" (assignment_id, week_start_date, week_end_date, status)
    values (p_assignment_id, p_week_start, p_week_start + 6, 'DRAFT')
    returning id, status into v_timesheet_id, v_status;

    v_created := true;
  elsif v_status not in ('DRAFT', 'REJECTED') then
    raise exception 'TIMESHEET_LOCKED:%', v_status;
  end if;

  delete from public."TIMESHEET_DAYS" where timesheet_id = v_timesheet_id;

  for v_day in select * from jsonb_array_elements(coalesce(p_days, '[]'::jsonb))
  loop
    insert into public."TIMESHEET_DAYS" (timesheet_id, work_date, note)
    values (
      v_timesheet_id,
      (v_day ->> 'workDate')::date,
      nullif(v_day ->> 'note', '')
    )
    returning id into v_day_id;

    insert into public."TIMESHEET_ACTIVITIES" (day_id, line_no, hours, activity)
    select
      v_day_id,
      line_no::smallint,
      (activity ->> 'hours')::numeric,
      activity ->> 'activity'
      from jsonb_array_elements(coalesce(v_day -> 'activities', '[]'::jsonb))
        with ordinality as entries(activity, line_no);
  end loop;

  insert into public."TIMESHEET_EVENTS" (
    timesheet_id, actor_id, cycle_no, event_type, actor_role_code, from_status, to_status
  )
  select
    v_timesheet_id,
    p_actor_id,
    t.cycle_no,
    case when v_created then 'CREATED' else 'MODIFIED' end,
    p_actor_role_code,
    v_status,
    t.status
    from public."TIMESHEETS" t
   where t.id = v_timesheet_id;

  return v_timesheet_id;
end;
$$;

create or replace function public.fn_submit_timesheet(
  p_timesheet_id    bigint,
  p_actor_id        bigint,
  p_actor_role_code varchar
) returns bigint
language plpgsql
as $$
declare
  v_timesheet   public."TIMESHEETS";
  v_project_id  bigint;
  v_cycle_no    smallint;
  v_first_seq   smallint;
  v_step_count  integer;
  v_code        varchar(30);
  v_from_status varchar(20);
begin
  select * into v_timesheet
    from public."TIMESHEETS"
   where id = p_timesheet_id
     for update;

  if not found then
    raise exception 'TIMESHEET_NOT_FOUND';
  end if;

  if v_timesheet.status not in ('DRAFT', 'REJECTED') then
    raise exception 'TIMESHEET_NOT_SUBMITTABLE:%', v_timesheet.status;
  end if;

  if v_timesheet.total_hours <= 0 then
    raise exception 'TIMESHEET_EMPTY';
  end if;

  select a.project_id
    into v_project_id
    from public."PROJECT_ASSIGNMENTS" a
   where a.id = v_timesheet.assignment_id;

  select count(*)
    into v_step_count
    from public."PROJECT_APPROVAL_STEPS" s
   where s.project_id = v_project_id
     and s.is_active;

  if v_step_count = 0 then
    raise exception 'NO_APPROVAL_WORKFLOW';
  end if;

  if v_step_count < 2 then
    raise exception 'INCOMPLETE_APPROVAL_WORKFLOW:%', v_step_count;
  end if;

  v_from_status := v_timesheet.status;
  v_cycle_no := case
    when v_timesheet.status = 'REJECTED' then (v_timesheet.cycle_no + 1)::smallint
    else v_timesheet.cycle_no
  end;

  delete from public."TIMESHEET_APPROVALS"
   where timesheet_id = v_timesheet.id
     and cycle_no = v_cycle_no;

  insert into public."TIMESHEET_APPROVALS" (
    timesheet_id, step_id, seq, cycle_no, approver_type,
    approver_id, approver_role_code, approver_email, approver_name, status
  )
  select
    v_timesheet.id, s.id, s.seq, v_cycle_no, s.approver_type,
    s.user_id, r.code, s.approver_email, s.approver_name, 'PENDING'
    from public."PROJECT_APPROVAL_STEPS" s
    left join public."ROLES" r on r.id = s.role_id
   where s.project_id = v_project_id
     and s.is_active
   order by s.seq;

  select min(seq)
    into v_first_seq
    from public."TIMESHEET_APPROVALS"
   where timesheet_id = v_timesheet.id
     and cycle_no = v_cycle_no;

  v_code := coalesce(
    v_timesheet.submission_code,
    'TS-' || to_char(v_timesheet.week_start_date, 'IYYY"W"IW')
          || '-' || lpad(v_timesheet.id::text, 6, '0')
  );

  update public."TIMESHEETS"
     set status          = 'SUBMITTED',
         current_seq     = v_first_seq,
         cycle_no        = v_cycle_no,
         submission_code = v_code,
         submitted_at    = now()
   where id = v_timesheet.id
   returning * into v_timesheet;

  insert into public."TIMESHEET_EVENTS" (
    timesheet_id, actor_id, from_seq, to_seq, cycle_no, event_type,
    actor_role_code, from_status, to_status, metadata
  )
  values
    (
      v_timesheet.id, p_actor_id, null, v_first_seq, v_cycle_no, 'SUBMITTED',
      p_actor_role_code, v_from_status, 'SUBMITTED',
      jsonb_build_object(
        'submissionCode', v_code,
        'totalHours', v_timesheet.total_hours,
        'cycleNo', v_cycle_no,
        'approvalSteps', v_step_count
      )
    ),
    (
      v_timesheet.id, p_actor_id, null, v_first_seq, v_cycle_no, 'STEP_ENTERED',
      p_actor_role_code, 'SUBMITTED', 'SUBMITTED', '{}'::jsonb
    );

  insert into public."NOTIFICATIONS" (user_id, timesheet_id, kind, title, body)
  select
    u.id,
    v_timesheet.id,
    'REVIEW_REQUESTED',
    'Timesheet ' || v_code || ' pendiente de tu revision',
    'Semana del ' || to_char(v_timesheet.week_start_date, 'DD/MM/YYYY')
      || ' con ' || trim(to_char(v_timesheet.total_hours, 'FM9990.99')) || ' horas.'
    from public."TIMESHEET_APPROVALS" ap
    join public."USERS" u
      on (ap.approver_type = 'USER' and u.id = ap.approver_id)
      or (ap.approver_type = 'ROLE' and u.role_id = (
            select r.id from public."ROLES" r where r.code = ap.approver_role_code
          ))
   where ap.timesheet_id = v_timesheet.id
     and ap.cycle_no = v_cycle_no
     and ap.seq = v_first_seq
     and u.is_active;

  return v_timesheet.id;
end;
$$;

alter table public."ROLES"                  enable row level security;
alter table public."USERS"                  enable row level security;
alter table public."COMPANIES"              enable row level security;
alter table public."CLIENTS"                enable row level security;
alter table public."PROJECTS"               enable row level security;
alter table public."PROJECT_ASSIGNMENTS"    enable row level security;
alter table public."PROJECT_APPROVAL_STEPS" enable row level security;
alter table public."TIMESHEETS"             enable row level security;
alter table public."TIMESHEET_DAYS"         enable row level security;
alter table public."TIMESHEET_ACTIVITIES"   enable row level security;
alter table public."TIMESHEET_APPROVALS"    enable row level security;
alter table public."TIMESHEET_EVENTS"       enable row level security;
alter table public."APPROVAL_REQUESTS"      enable row level security;
alter table public."NOTIFICATIONS"          enable row level security;
alter table public."PAYMENT_BATCHES"        enable row level security;
alter table public."PAYMENTS"               enable row level security;

insert into public."ROLES" (code, name) values
  ('CONSULTANT', 'Consultant'),
  ('EMPLOYEE',   'Employee'),
  ('MANAGER',    'Manager'),
  ('FINANCE',    'Finance'),
  ('ADMIN',      'Administrator')
on conflict (code) do nothing;
