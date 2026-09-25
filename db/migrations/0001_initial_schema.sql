create table if not exists public."ROLES" (
  id        bigint generated always as identity primary key,
  code      varchar(30)  not null unique,
  name      varchar(80)  not null
);

create table if not exists public."USERS" (
  id                   bigint generated always as identity primary key,
  role_id              bigint       not null references public."ROLES"(id),
  full_name            varchar(150) not null,
  user_name            varchar(50)  not null,
  email                varchar(254) not null,
  password_hash        varchar(255) not null,
  job_title            varchar(100),
  failed_attempts      smallint     not null default 0,
  locked_until         timestamp,
  last_login_at        timestamp,
  is_active            boolean      not null default true,
  must_change_password boolean      not null default false,
  constraint "chk_USERS_user_name_lower" check (user_name = lower(user_name)),
  constraint "chk_USERS_email_lower"     check (email = lower(email))
);

create index if not exists "idx_USERS_role_id" on public."USERS" (role_id);
create index if not exists "idx_USERS_is_active" on public."USERS" (is_active);
create unique index if not exists "idx_USERS_lower_user_name" on public."USERS" (lower(user_name));
create unique index if not exists "idx_USERS_lower_email" on public."USERS" (lower(email));

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
  user_id       bigint       references public."USERS"(id) on delete set null,
  is_active     boolean      not null default true
);

create index if not exists "idx_CLIENTS_company_id" on public."CLIENTS" (company_id);
create index if not exists "idx_CLIENTS_user_id" on public."CLIENTS" (user_id);

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
  assignment_code varchar(50),
  contract_type       varchar(12)   not null default 'CONTRACTOR',
  country_code        char(2)       not null default 'MX',
  hours_divisor       numeric(6, 2) not null default 240,
  daily_hours         numeric(4, 2) not null default 8,
  overtime_multiplier numeric(4, 2) not null default 2,
  holiday_multiplier  numeric(4, 2) not null default 2,
  constraint "chk_PROJECT_ASSIGNMENTS_pay_rate" check (pay_rate >= 0),
  constraint "chk_PROJECT_ASSIGNMENTS_dates" check (end_date is null or end_date >= start_date),
  constraint "chk_PROJECT_ASSIGNMENTS_contract_type"
    check (contract_type in ('CONTRACTOR', 'PAYROLL')),
  constraint "chk_PROJECT_ASSIGNMENTS_country_code" check (country_code ~ '^[A-Z]{2}$'),
  constraint "chk_PROJECT_ASSIGNMENTS_pay_terms" check (
    hours_divisor > 0 and
    daily_hours between 1 and 24 and
    overtime_multiplier between 1 and 10 and
    holiday_multiplier between 1 and 10
  )
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

create table if not exists public."APPROVAL_ATTACHMENTS" (
  id           bigint       generated always as identity primary key,
  approval_id  bigint       not null references public."TIMESHEET_APPROVALS"(id) on delete cascade,
  timesheet_id bigint       not null references public."TIMESHEETS"(id) on delete cascade,
  uploaded_by  bigint       not null references public."USERS"(id),
  storage_path varchar(400) not null unique,
  file_name    varchar(255) not null,
  mime_type    varchar(120) not null,
  size_bytes   integer      not null,
  created_at   timestamp    not null default now(),
  constraint "chk_APPROVAL_ATTACHMENTS_size"
    check (size_bytes > 0 and size_bytes <= 10485760)
);

create index if not exists "idx_APPROVAL_ATTACHMENTS_approval_id"
  on public."APPROVAL_ATTACHMENTS" (approval_id);
create index if not exists "idx_APPROVAL_ATTACHMENTS_timesheet_id"
  on public."APPROVAL_ATTACHMENTS" (timesheet_id);

create table if not exists public."NOTIFICATIONS" (
  id           bigint       generated always as identity primary key,
  user_id      bigint       not null references public."USERS"(id) on delete cascade,
  timesheet_id bigint       references public."TIMESHEETS"(id) on delete cascade,
  kind         varchar(30),
  title        varchar(150) not null,
  body         text,
  is_read      boolean      not null default false,
  created_at   timestamp    not null default now(),
  email_status     varchar(10) not null default 'PENDING',
  email_attempts   smallint    not null default 0,
  email_claimed_at timestamp,
  email_sent_at    timestamp,
  email_error      text,
  dedupe_key       varchar(60),
  constraint "chk_NOTIFICATIONS_kind" check (
    kind is null or
    kind in ('TASK_ASSIGNED', 'REVIEW_REQUESTED', 'APPROVED', 'REJECTED', 'CLOSED', 'REMINDER')
  ),
  constraint "chk_NOTIFICATIONS_email_status"
    check (email_status in ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED'))
);

create index if not exists "idx_NOTIFICATIONS_user_id_is_read"
  on public."NOTIFICATIONS" (user_id, is_read);
create index if not exists "idx_NOTIFICATIONS_email_outbox"
  on public."NOTIFICATIONS" (created_at, id)
  where email_status in ('PENDING', 'SENDING', 'FAILED');
create unique index if not exists "idx_NOTIFICATIONS_user_id_kind_dedupe_key"
  on public."NOTIFICATIONS" (user_id, kind, dedupe_key)
  where dedupe_key is not null;

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

create table if not exists public."USER_PERMISSIONS" (
  user_id         bigint      not null references public."USERS"(id) on delete cascade,
  permission_code varchar(40) not null,
  granted_by      bigint,
  granted_at      timestamp   not null default now(),
  primary key (user_id, permission_code),
  constraint "chk_USER_PERMISSIONS_permission_code" check (
    permission_code in (
      'TIMESHEETS_SUBMIT', 'TIMESHEETS_APPROVE', 'CATALOG_MANAGE', 'USERS_MANAGE', 'REPORTS_VIEW',
      'PAYROLL_MANAGE'
    )
  )
);

create index if not exists "idx_USER_PERMISSIONS_permission_code"
  on public."USER_PERMISSIONS" (permission_code);

create table if not exists public."HOLIDAYS" (
  id           bigint       generated always as identity primary key,
  country_code char(2)      not null,
  holiday_date date         not null,
  name         varchar(120) not null,
  constraint "chk_HOLIDAYS_country_code" check (country_code ~ '^[A-Z]{2}$')
);

create unique index if not exists "idx_HOLIDAYS_country_code_holiday_date"
  on public."HOLIDAYS" (country_code, holiday_date);

create table if not exists public."PAYROLL_COUNTRY_RULES" (
  country_code                 char(2)       primary key,
  overtime_multiplier          numeric(4, 2) not null default 2,
  overtime_triple_multiplier   numeric(4, 2) not null default 3,
  weekly_double_overtime_hours numeric(5, 2),
  holiday_multiplier           numeric(4, 2) not null default 2,
  sunday_multiplier            numeric(4, 2) not null default 1,
  updated_by                   bigint,
  updated_at                   timestamp     not null default now(),
  constraint "chk_PAYROLL_COUNTRY_RULES_country_code" check (country_code ~ '^[A-Z]{2}$'),
  constraint "chk_PAYROLL_COUNTRY_RULES_values" check (
    overtime_multiplier between 1 and 10 and
    overtime_triple_multiplier between 1 and 10 and
    holiday_multiplier between 1 and 10 and
    sunday_multiplier between 1 and 10 and
    (weekly_double_overtime_hours is null or weekly_double_overtime_hours between 0 and 168)
  )
);

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

  insert into public."USER_PERMISSIONS" (user_id, permission_code, granted_by)
  select distinct v_user_id, code, (p_user ->> 'createdBy')::bigint
    from jsonb_array_elements_text(coalesce(p_user -> 'permissions', '[]'::jsonb)) as code;

  for v_assignment in select * from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb))
  loop
    if not exists (
      select 1 from public."PROJECTS" where id = (v_assignment ->> 'projectId')::bigint
    ) then
      raise exception 'PROJECT_NOT_FOUND:%', v_assignment ->> 'projectId';
    end if;

    insert into public."PROJECT_ASSIGNMENTS"
      (project_id, consultant_id, pay_rate, currency, start_date, end_date, is_active,
       assignment_code, contract_type, country_code, hours_divisor, daily_hours,
       overtime_multiplier, holiday_multiplier)
    values (
      (v_assignment ->> 'projectId')::bigint,
      v_user_id,
      (v_assignment ->> 'payRate')::numeric,
      coalesce(v_assignment ->> 'currency', 'USD'),
      (v_assignment ->> 'startDate')::date,
      (v_assignment ->> 'endDate')::date,
      true,
      v_assignment ->> 'assignmentCode',
      coalesce(v_assignment ->> 'contractType', 'CONTRACTOR'),
      coalesce(v_assignment ->> 'countryCode', 'MX'),
      coalesce((v_assignment ->> 'hoursDivisor')::numeric, 240),
      coalesce((v_assignment ->> 'dailyHours')::numeric, 8),
      coalesce((v_assignment ->> 'overtimeMultiplier')::numeric, 2),
      coalesce((v_assignment ->> 'holidayMultiplier')::numeric, 2)
    );
  end loop;

  return v_user_id;
end;
$$;

create or replace function public.fn_replace_user_permissions(
  p_user_id     bigint,
  p_permissions jsonb,
  p_actor_id    bigint
) returns integer
language plpgsql
as $$
declare
  v_total integer;
begin
  if not exists (select 1 from public."USERS" where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;

  delete from public."USER_PERMISSIONS"
   where user_id = p_user_id
     and permission_code not in (
       select jsonb_array_elements_text(coalesce(p_permissions, '[]'::jsonb))
     );

  insert into public."USER_PERMISSIONS" (user_id, permission_code, granted_by)
  select p_user_id, code, p_actor_id
    from (
      select distinct jsonb_array_elements_text(coalesce(p_permissions, '[]'::jsonb)) as code
    ) as requested
  on conflict (user_id, permission_code) do nothing;

  select count(*) into v_total from public."USER_PERMISSIONS" where user_id = p_user_id;

  return v_total;
end;
$$;

create or replace function public.fn_notify_project_assignment() returns trigger
language plpgsql
as $$
begin
  if not new.is_active then
    return new;
  end if;

  insert into public."NOTIFICATIONS" (user_id, kind, title, body, dedupe_key)
  select
    new.consultant_id,
    'TASK_ASSIGNED',
    left('Te asignaron al proyecto ' || p.project_name, 150),
    'Cliente: ' || c.client_name || '. A partir del '
      || to_char(new.start_date, 'DD/MM/YYYY') || '.',
    'assignment:' || new.id
    from public."PROJECTS" p
    join public."CLIENTS" c on c.id = p.client_id
   where p.id = new.project_id
  on conflict (user_id, kind, dedupe_key) where dedupe_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists "trg_PROJECT_ASSIGNMENTS_notify" on public."PROJECT_ASSIGNMENTS";
create trigger "trg_PROJECT_ASSIGNMENTS_notify"
  after insert on public."PROJECT_ASSIGNMENTS"
  for each row execute function public.fn_notify_project_assignment();

create or replace function public.fn_create_timesheet_reminders(
  p_week_start date
) returns integer
language plpgsql
as $$
declare
  v_created integer;
begin
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'WEEK_START_NOT_MONDAY';
  end if;

  insert into public."NOTIFICATIONS" (user_id, kind, title, body, dedupe_key)
  select
    a.consultant_id,
    'REMINDER',
    'Tienes horas pendientes de enviar',
    'Semana del ' || to_char(p_week_start, 'DD/MM/YYYY')
      || ' al ' || to_char(p_week_start + 6, 'DD/MM/YYYY') || ': '
      || string_agg(distinct p.project_name, ', ') || '.',
    'week:' || to_char(p_week_start, 'YYYY-MM-DD')
    from public."PROJECT_ASSIGNMENTS" a
    join public."USERS" u    on u.id = a.consultant_id and u.is_active
    join public."ROLES" r    on r.id = u.role_id and r.code <> 'ADMIN'
    join public."PROJECTS" p on p.id = a.project_id and p.status = 'ACTIVE'
    left join public."TIMESHEETS" t
      on t.assignment_id = a.id and t.week_start_date = p_week_start
   where a.is_active
     and a.start_date <= p_week_start + 6
     and (a.end_date is null or a.end_date >= p_week_start)
     and (t.id is null or t.status in ('DRAFT', 'REJECTED'))
   group by a.consultant_id
  on conflict (user_id, kind, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_created = row_count;

  return v_created;
end;
$$;

create or replace function public.fn_claim_notification_emails(
  p_timesheet_id  bigint  default null,
  p_user_id       bigint  default null,
  p_limit         integer default 25,
  p_max_attempts  integer default 5,
  p_stale_minutes integer default 10,
  p_max_age_days  integer default 7
) returns jsonb
language plpgsql
as $$
declare
  v_claimed jsonb;
begin
  with candidates as (
    select n.id
      from public."NOTIFICATIONS" n
     where (p_timesheet_id is null or n.timesheet_id = p_timesheet_id)
       and (p_user_id is null or n.user_id = p_user_id)
       and n.email_attempts < p_max_attempts
       and n.created_at > now() - make_interval(days => p_max_age_days)
       and (
         n.email_status = 'PENDING' or
         (n.email_status in ('SENDING', 'FAILED')
            and n.email_claimed_at < now() - make_interval(mins => p_stale_minutes))
       )
     order by n.created_at, n.id
     limit p_limit
     for update skip locked
  ),
  claimed as (
    update public."NOTIFICATIONS" n
       set email_status     = 'SENDING',
           email_claimed_at = now(),
           email_attempts   = n.email_attempts + 1
      from candidates
     where n.id = candidates.id
    returning n.id, n.user_id, n.timesheet_id, n.kind, n.title, n.body
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', claimed.id,
        'kind', claimed.kind,
        'title', claimed.title,
        'body', claimed.body,
        'timesheetId', claimed.timesheet_id,
        'recipientEmail', u.email,
        'recipientName', u.full_name,
        'recipientActive', u.is_active,
        'submissionCode', t.submission_code,
        'weekStart', t.week_start_date,
        'weekEnd', t.week_end_date,
        'totalHours', t.total_hours,
        'consultantName', consultant.full_name,
        'projectName', p.project_name,
        'clientName', c.client_name
      )
      order by claimed.id
    ),
    '[]'::jsonb
  )
    into v_claimed
    from claimed
    join public."USERS" u on u.id = claimed.user_id
    left join public."TIMESHEETS" t           on t.id = claimed.timesheet_id
    left join public."PROJECT_ASSIGNMENTS" a  on a.id = t.assignment_id
    left join public."USERS" consultant       on consultant.id = a.consultant_id
    left join public."PROJECTS" p             on p.id = a.project_id
    left join public."CLIENTS" c              on c.id = p.client_id;

  return v_claimed;
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

create or replace function public.fn_route_current_step(
  p_timesheet_id    bigint,
  p_actor_id        bigint,
  p_actor_role_code varchar
) returns jsonb
language plpgsql
as $$
declare
  c_email_ttl_days constant integer := 14;
  v_timesheet  public."TIMESHEETS";
  v_current    public."TIMESHEET_APPROVALS";
  v_context    record;
  v_recipients integer := 0;
  v_in_app     integer := 0;
  v_email_reqs jsonb   := '[]'::jsonb;
begin
  select * into v_timesheet
    from public."TIMESHEETS"
   where id = p_timesheet_id;

  if not found then
    raise exception 'TIMESHEET_NOT_FOUND';
  end if;

  select * into v_current
    from public."TIMESHEET_APPROVALS"
   where timesheet_id = v_timesheet.id
     and cycle_no = v_timesheet.cycle_no
     and seq = v_timesheet.current_seq;

  if not found then
    raise exception 'APPROVAL_STEP_NOT_FOUND';
  end if;

  select u.full_name as consultant_name, p.project_name, c.client_name
    into v_context
    from public."PROJECT_ASSIGNMENTS" a
    join public."USERS" u    on u.id = a.consultant_id
    join public."PROJECTS" p on p.id = a.project_id
    join public."CLIENTS" c  on c.id = p.client_id
   where a.id = v_timesheet.assignment_id;

  if v_current.approver_type = 'CLIENT_EMAIL' then
    v_recipients := case when v_current.approver_email is null then 0 else 1 end;
  else
    select count(*)
      into v_recipients
      from public."USERS" u
     where u.is_active
       and (
         (v_current.approver_type = 'USER' and u.id = v_current.approver_id) or
         (v_current.approver_type = 'ROLE' and u.role_id = (
            select r.id from public."ROLES" r where r.code = v_current.approver_role_code
          ))
       );
  end if;

  if v_recipients = 0 then
    raise exception 'NO_APPROVER_AVAILABLE:%', v_current.seq;
  end if;

  insert into public."NOTIFICATIONS" (user_id, timesheet_id, kind, title, body)
  select
    u.id,
    v_timesheet.id,
    'REVIEW_REQUESTED',
    'Timesheet ' || v_timesheet.submission_code || ' pendiente de tu revision',
    'Semana del ' || to_char(v_timesheet.week_start_date, 'DD/MM/YYYY')
      || ' con ' || trim(trailing '.' from trim(to_char(v_timesheet.total_hours, 'FM9990.99')))
      || ' horas.'
    from public."USERS" u
   where u.is_active
     and (
       (v_current.approver_type = 'USER' and u.id = v_current.approver_id) or
       (v_current.approver_type = 'ROLE' and u.role_id = (
          select r.id from public."ROLES" r where r.code = v_current.approver_role_code
        ))
     );

  get diagnostics v_in_app = row_count;

  if v_current.approver_type = 'CLIENT_EMAIL' then
    with created_request as (
      insert into public."APPROVAL_REQUESTS" (
        approval_id, timesheet_id, recipient_email, token, status, expires_at
      )
      values (
        v_current.id,
        v_timesheet.id,
        v_current.approver_email,
        replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
        'PENDING',
        now() + make_interval(days => c_email_ttl_days)
      )
      returning id, approval_id, recipient_email, token, expires_at
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'requestId', created_request.id,
          'approvalId', created_request.approval_id,
          'timesheetId', v_timesheet.id,
          'recipientEmail', created_request.recipient_email,
          'recipientName', v_current.approver_name,
          'token', created_request.token,
          'expiresAt', created_request.expires_at,
          'submissionCode', v_timesheet.submission_code,
          'consultantName', v_context.consultant_name,
          'clientName', v_context.client_name,
          'projectName', v_context.project_name,
          'weekStart', v_timesheet.week_start_date,
          'weekEnd', v_timesheet.week_end_date,
          'totalHours', v_timesheet.total_hours
        )
      ),
      '[]'::jsonb
    )
      into v_email_reqs
      from created_request;
  end if;

  insert into public."TIMESHEET_EVENTS" (
    timesheet_id, actor_id, from_seq, to_seq, cycle_no, event_type,
    actor_role_code, from_status, to_status, metadata
  )
  values (
    v_timesheet.id, p_actor_id, null, v_current.seq, v_timesheet.cycle_no, 'NOTIFIED',
    p_actor_role_code, v_timesheet.status, v_timesheet.status,
    jsonb_build_object(
      'seq', v_current.seq,
      'approvalId', v_current.id,
      'approverType', v_current.approver_type,
      'inAppRecipients', v_in_app,
      'emailRecipients', jsonb_array_length(v_email_reqs)
    )
  );

  return jsonb_build_object(
    'route', jsonb_build_object(
      'approvalId', v_current.id,
      'stepId', v_current.step_id,
      'seq', v_current.seq,
      'approverType', v_current.approver_type,
      'approverId', v_current.approver_id,
      'approverRoleCode', v_current.approver_role_code,
      'approverEmail', v_current.approver_email,
      'approverName', v_current.approver_name
    ),
    'notifications', jsonb_build_object(
      'inApp', v_in_app,
      'email', jsonb_array_length(v_email_reqs)
    ),
    'emailRequests', v_email_reqs
  );
end;
$$;

create or replace function public.fn_submit_timesheet(
  p_timesheet_id    bigint,
  p_actor_id        bigint,
  p_actor_role_code varchar
) returns jsonb
language plpgsql
as $$
declare
  v_timesheet   public."TIMESHEETS";
  v_first       public."TIMESHEET_APPROVALS";
  v_project_id  bigint;
  v_cycle_no    smallint;
  v_step_count  integer;
  v_code        varchar(30);
  v_from_status varchar(20);
  v_routing     jsonb;
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
    v_timesheet.id, s.id, s.seq, v_cycle_no,
    case when cu.id is not null then 'USER' else s.approver_type end,
    coalesce(s.user_id, cu.id),
    r.code,
    case when cu.id is not null then null else s.approver_email end,
    s.approver_name,
    'PENDING'
    from public."PROJECT_APPROVAL_STEPS" s
    left join public."ROLES" r   on r.id = s.role_id
    left join public."CLIENTS" c on c.id = s.client_id and s.approver_type = 'CLIENT_EMAIL'
    left join public."USERS" cu  on cu.id = c.user_id and cu.is_active
   where s.project_id = v_project_id
     and s.is_active
   order by s.seq;

  select * into v_first
    from public."TIMESHEET_APPROVALS"
   where timesheet_id = v_timesheet.id
     and cycle_no = v_cycle_no
   order by seq
   limit 1;

  if not found then
    raise exception 'NO_APPROVAL_WORKFLOW';
  end if;

  v_code := coalesce(
    v_timesheet.submission_code,
    'TS-' || to_char(v_timesheet.week_start_date, 'IYYY"W"IW')
          || '-' || lpad(v_timesheet.id::text, 6, '0')
  );

  update public."TIMESHEETS"
     set status          = 'SUBMITTED',
         current_seq     = v_first.seq,
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
      v_timesheet.id, p_actor_id, null, v_first.seq, v_cycle_no, 'SUBMITTED',
      p_actor_role_code, v_from_status, 'SUBMITTED',
      jsonb_build_object(
        'submissionCode', v_code,
        'totalHours', v_timesheet.total_hours,
        'cycleNo', v_cycle_no,
        'approvalSteps', v_step_count
      )
    ),
    (
      v_timesheet.id, p_actor_id, null, v_first.seq, v_cycle_no, 'STEP_ENTERED',
      p_actor_role_code, 'SUBMITTED', 'SUBMITTED',
      jsonb_build_object('seq', v_first.seq, 'approvalId', v_first.id)
    );

  update public."APPROVAL_REQUESTS"
     set status = 'EXPIRED'
   where timesheet_id = v_timesheet.id
     and status = 'PENDING';

  v_routing := public.fn_route_current_step(v_timesheet.id, p_actor_id, p_actor_role_code);

  return jsonb_build_object(
    'timesheetId', v_timesheet.id,
    'submissionCode', v_code,
    'cycleNo', v_cycle_no,
    'currentSeq', v_first.seq,
    'totalSteps', v_step_count
  ) || v_routing;
end;
$$;

create or replace function public.fn_approve_external_step(
  p_approval_id     bigint,
  p_actor_id        bigint,
  p_actor_role_code varchar,
  p_comments        text default null
) returns jsonb
language plpgsql
as $$
declare
  v_timesheet    public."TIMESHEETS";
  v_current      public."TIMESHEET_APPROVALS";
  v_manager_id   bigint;
  v_consultant_id bigint;
  v_from_status  varchar(20);
  v_next_seq     smallint;
  v_routing      jsonb := jsonb_build_object(
    'route', null,
    'notifications', jsonb_build_object('inApp', 0, 'email', 0),
    'emailRequests', '[]'::jsonb
  );
begin
  select * into v_current
    from public."TIMESHEET_APPROVALS"
   where id = p_approval_id;

  if not found then
    raise exception 'APPROVAL_STEP_NOT_FOUND';
  end if;

  select * into v_timesheet
    from public."TIMESHEETS"
   where id = v_current.timesheet_id
     for update;

  if not found then
    raise exception 'TIMESHEET_NOT_FOUND';
  end if;

  if v_timesheet.status not in ('SUBMITTED', 'IN_REVIEW') then
    raise exception 'TIMESHEET_NOT_IN_REVIEW:%', v_timesheet.status;
  end if;

  select p.manager_id, a.consultant_id
    into v_manager_id, v_consultant_id
    from public."PROJECT_ASSIGNMENTS" a
    join public."PROJECTS" p on p.id = a.project_id
   where a.id = v_timesheet.assignment_id;

  if p_actor_role_code <> 'ADMIN' and (v_manager_id is null or v_manager_id <> p_actor_id) then
    raise exception 'NOT_PROJECT_MANAGER';
  end if;

  if v_current.approver_type <> 'CLIENT_EMAIL' then
    raise exception 'APPROVAL_STEP_NOT_EXTERNAL:%', v_current.approver_type;
  end if;

  if v_current.cycle_no <> v_timesheet.cycle_no or v_current.seq <> v_timesheet.current_seq then
    raise exception 'APPROVAL_STEP_NOT_CURRENT:%', v_timesheet.current_seq;
  end if;

  if v_current.status <> 'PENDING' then
    raise exception 'APPROVAL_STEP_RESOLVED:%', v_current.status;
  end if;

  v_from_status := v_timesheet.status;

  update public."TIMESHEET_APPROVALS"
     set status       = 'APPROVED',
         decided_at   = now(),
         resolved_via = 'PM_MANUAL',
         comments     = p_comments
   where id = v_current.id;

  update public."APPROVAL_REQUESTS"
     set status        = 'EXPIRED',
         responded_at  = now(),
         response_note = 'Resuelto manualmente por el manager del proyecto'
   where approval_id = v_current.id
     and status = 'PENDING';

  insert into public."TIMESHEET_EVENTS" (
    timesheet_id, actor_id, from_seq, to_seq, cycle_no, event_type,
    actor_role_code, from_status, to_status, comments, metadata
  )
  values (
    v_timesheet.id, p_actor_id, v_current.seq, v_current.seq, v_timesheet.cycle_no, 'APPROVED',
    p_actor_role_code, v_from_status, v_from_status, p_comments,
    jsonb_build_object(
      'approvalId', v_current.id,
      'seq', v_current.seq,
      'resolvedVia', 'PM_MANUAL',
      'onBehalfOf', v_current.approver_email
    )
  );

  select min(seq)
    into v_next_seq
    from public."TIMESHEET_APPROVALS"
   where timesheet_id = v_timesheet.id
     and cycle_no = v_timesheet.cycle_no
     and seq > v_current.seq
     and status = 'PENDING';

  if v_next_seq is null then
    update public."TIMESHEETS"
       set status = 'APPROVED'
     where id = v_timesheet.id
     returning * into v_timesheet;

    insert into public."NOTIFICATIONS" (user_id, timesheet_id, kind, title, body)
    values (
      v_consultant_id,
      v_timesheet.id,
      'APPROVED',
      'Timesheet ' || v_timesheet.submission_code || ' aprobado',
      'Se completo el flujo de aprobacion de la semana del '
        || to_char(v_timesheet.week_start_date, 'DD/MM/YYYY') || '.'
    );

    insert into public."TIMESHEET_EVENTS" (
      timesheet_id, actor_id, from_seq, to_seq, cycle_no, event_type,
      actor_role_code, from_status, to_status, metadata
    )
    values (
      v_timesheet.id, p_actor_id, v_current.seq, null, v_timesheet.cycle_no, 'APPROVED',
      p_actor_role_code, v_from_status, 'APPROVED',
      jsonb_build_object('completedSeq', v_current.seq)
    );
  else
    update public."TIMESHEETS"
       set status      = 'IN_REVIEW',
           current_seq = v_next_seq
     where id = v_timesheet.id
     returning * into v_timesheet;

    insert into public."TIMESHEET_EVENTS" (
      timesheet_id, actor_id, from_seq, to_seq, cycle_no, event_type,
      actor_role_code, from_status, to_status, metadata
    )
    values (
      v_timesheet.id, p_actor_id, v_current.seq, v_next_seq, v_timesheet.cycle_no, 'STEP_ENTERED',
      p_actor_role_code, v_from_status, 'IN_REVIEW',
      jsonb_build_object('seq', v_next_seq)
    );

    v_routing := public.fn_route_current_step(v_timesheet.id, p_actor_id, p_actor_role_code);
  end if;

  return jsonb_build_object(
    'timesheetId', v_timesheet.id,
    'timesheetStatus', v_timesheet.status,
    'submissionCode', v_timesheet.submission_code,
    'cycleNo', v_timesheet.cycle_no,
    'currentSeq', v_timesheet.current_seq,
    'completed', v_next_seq is null,
    'approved', jsonb_build_object(
      'approvalId', v_current.id,
      'seq', v_current.seq,
      'approverEmail', v_current.approver_email,
      'approverName', v_current.approver_name,
      'resolvedVia', 'PM_MANUAL'
    )
  ) || v_routing;
end;
$$;

create or replace function public.fn_decide_internal_step(
  p_approval_id     bigint,
  p_actor_id        bigint,
  p_actor_role_code varchar,
  p_decision        varchar,
  p_comments        text default null
) returns jsonb
language plpgsql
as $$
declare
  v_timesheet     public."TIMESHEETS";
  v_current       public."TIMESHEET_APPROVALS";
  v_previous      public."TIMESHEET_APPROVALS";
  v_consultant_id bigint;
  v_is_approver   boolean;
  v_from_status   varchar(20);
  v_step_status   varchar(24);
  v_next_seq      smallint;
  v_outcome       varchar(30);
  v_routing       jsonb := jsonb_build_object(
    'route', null,
    'notifications', jsonb_build_object('inApp', 0, 'email', 0),
    'emailRequests', '[]'::jsonb
  );
begin
  if p_decision not in ('APPROVE', 'REJECT_TO_PREVIOUS', 'REJECT_TO_CONSULTANT') then
    raise exception 'UNKNOWN_DECISION:%', p_decision;
  end if;

  select * into v_current
    from public."TIMESHEET_APPROVALS"
   where id = p_approval_id;

  if not found then
    raise exception 'APPROVAL_STEP_NOT_FOUND';
  end if;

  select * into v_timesheet
    from public."TIMESHEETS"
   where id = v_current.timesheet_id
     for update;

  if not found then
    raise exception 'TIMESHEET_NOT_FOUND';
  end if;

  if v_timesheet.status not in ('SUBMITTED', 'IN_REVIEW') then
    raise exception 'TIMESHEET_NOT_IN_REVIEW:%', v_timesheet.status;
  end if;

  if v_current.approver_type = 'CLIENT_EMAIL' then
    raise exception 'APPROVAL_STEP_EXTERNAL:%', v_current.approver_type;
  end if;

  if v_current.cycle_no <> v_timesheet.cycle_no or v_current.seq <> v_timesheet.current_seq then
    raise exception 'APPROVAL_STEP_NOT_CURRENT:%', v_timesheet.current_seq;
  end if;

  if v_current.status <> 'PENDING' then
    raise exception 'APPROVAL_STEP_RESOLVED:%', v_current.status;
  end if;

  select a.consultant_id
    into v_consultant_id
    from public."PROJECT_ASSIGNMENTS" a
   where a.id = v_timesheet.assignment_id;

  v_is_approver :=
    (v_current.approver_type = 'USER' and v_current.approver_id = p_actor_id) or
    (v_current.approver_type = 'ROLE' and v_current.approver_role_code = p_actor_role_code);

  if not v_is_approver and p_actor_role_code <> 'ADMIN' then
    raise exception 'NOT_STEP_APPROVER';
  end if;

  if p_decision <> 'APPROVE' and coalesce(btrim(p_comments), '') = '' then
    raise exception 'COMMENTS_REQUIRED';
  end if;

  v_from_status := v_timesheet.status;
  v_step_status := case p_decision
    when 'APPROVE'            then 'APPROVED'
    when 'REJECT_TO_PREVIOUS' then 'REJECTED_TO_PREVIOUS'
    else                           'REJECTED_TO_CONSULTANT'
  end;

  if p_decision = 'REJECT_TO_PREVIOUS' then
    select * into v_previous
      from public."TIMESHEET_APPROVALS"
     where timesheet_id = v_timesheet.id
       and cycle_no = v_timesheet.cycle_no
       and seq < v_current.seq
     order by seq desc
     limit 1;

    if not found then
      raise exception 'NO_PREVIOUS_STEP:%', v_current.seq;
    end if;
  end if;

  update public."TIMESHEET_APPROVALS"
     set status       = v_step_status,
         decided_at   = now(),
         resolved_via = 'USER_ACTION',
         comments     = p_comments
   where id = v_current.id;

  if p_decision = 'APPROVE' then
    select min(seq)
      into v_next_seq
      from public."TIMESHEET_APPROVALS"
     where timesheet_id = v_timesheet.id
       and cycle_no = v_timesheet.cycle_no
       and seq > v_current.seq
       and status = 'PENDING';

    insert into public."TIMESHEET_EVENTS" (
      timesheet_id, actor_id, from_seq, to_seq, cycle_no, event_type,
      actor_role_code, from_status, to_status, comments, metadata
    )
    values (
      v_timesheet.id, p_actor_id, v_current.seq, v_current.seq, v_timesheet.cycle_no, 'APPROVED',
      p_actor_role_code, v_from_status, v_from_status, p_comments,
      jsonb_build_object(
        'approvalId', v_current.id,
        'seq', v_current.seq,
        'resolvedVia', 'USER_ACTION',
        'approverType', v_current.approver_type
      )
    );

    if v_next_seq is null then
      v_outcome := 'COMPLETED';

      update public."TIMESHEETS"
         set status = 'APPROVED'
       where id = v_timesheet.id
       returning * into v_timesheet;

      insert into public."NOTIFICATIONS" (user_id, timesheet_id, kind, title, body)
      values (
        v_consultant_id,
        v_timesheet.id,
        'APPROVED',
        'Timesheet ' || v_timesheet.submission_code || ' aprobado',
        'Se completo el flujo de aprobacion de la semana del '
          || to_char(v_timesheet.week_start_date, 'DD/MM/YYYY') || '.'
      );

      insert into public."TIMESHEET_EVENTS" (
        timesheet_id, actor_id, from_seq, to_seq, cycle_no, event_type,
        actor_role_code, from_status, to_status, metadata
      )
      values (
        v_timesheet.id, p_actor_id, v_current.seq, null, v_timesheet.cycle_no, 'APPROVED',
        p_actor_role_code, v_from_status, 'APPROVED',
        jsonb_build_object('completedSeq', v_current.seq)
      );
    else
      v_outcome := 'ADVANCED';

      update public."TIMESHEETS"
         set status      = 'IN_REVIEW',
             current_seq = v_next_seq
       where id = v_timesheet.id
       returning * into v_timesheet;

      insert into public."TIMESHEET_EVENTS" (
        timesheet_id, actor_id, from_seq, to_seq, cycle_no, event_type,
        actor_role_code, from_status, to_status, metadata
      )
      values (
        v_timesheet.id, p_actor_id, v_current.seq, v_next_seq, v_timesheet.cycle_no, 'STEP_ENTERED',
        p_actor_role_code, v_from_status, 'IN_REVIEW',
        jsonb_build_object('seq', v_next_seq)
      );

      v_routing := public.fn_route_current_step(v_timesheet.id, p_actor_id, p_actor_role_code);
    end if;

  elsif p_decision = 'REJECT_TO_PREVIOUS' then
    v_outcome := 'RETURNED_TO_PREVIOUS';

    update public."TIMESHEET_APPROVALS"
       set status       = 'PENDING',
           decided_at   = null,
           resolved_via = null,
           comments     = null,
           review_no    = review_no + 1
     where id = v_previous.id;

    update public."TIMESHEETS"
       set status      = 'IN_REVIEW',
           current_seq = v_previous.seq
     where id = v_timesheet.id
     returning * into v_timesheet;

    insert into public."TIMESHEET_EVENTS" (
      timesheet_id, actor_id, from_seq, to_seq, cycle_no, event_type,
      actor_role_code, from_status, to_status, comments, metadata
    )
    values (
      v_timesheet.id, p_actor_id, v_current.seq, v_previous.seq, v_timesheet.cycle_no,
      'REJECTED_PREV', p_actor_role_code, v_from_status, 'IN_REVIEW', p_comments,
      jsonb_build_object(
        'approvalId', v_current.id,
        'returnedToSeq', v_previous.seq,
        'returnedToApprovalId', v_previous.id,
        'reviewNo', v_previous.review_no + 1
      )
    );

    v_routing := public.fn_route_current_step(v_timesheet.id, p_actor_id, p_actor_role_code);

  else
    v_outcome := 'RETURNED_TO_CONSULTANT';

    update public."TIMESHEETS"
       set status      = 'REJECTED',
           current_seq = null
     where id = v_timesheet.id
     returning * into v_timesheet;

    update public."APPROVAL_REQUESTS"
       set status        = 'EXPIRED',
           responded_at  = now(),
           response_note = 'El timesheet regreso al consultor'
     where timesheet_id = v_timesheet.id
       and status = 'PENDING';

    insert into public."NOTIFICATIONS" (user_id, timesheet_id, kind, title, body)
    values (
      v_consultant_id,
      v_timesheet.id,
      'REJECTED',
      'Timesheet ' || v_timesheet.submission_code || ' devuelto',
      'La semana del ' || to_char(v_timesheet.week_start_date, 'DD/MM/YYYY')
        || ' necesita correcciones: ' || p_comments
    );

    insert into public."TIMESHEET_EVENTS" (
      timesheet_id, actor_id, from_seq, to_seq, cycle_no, event_type,
      actor_role_code, from_status, to_status, comments, metadata
    )
    values (
      v_timesheet.id, p_actor_id, v_current.seq, null, v_timesheet.cycle_no,
      'REJECTED_CONSULTANT', p_actor_role_code, v_from_status, 'REJECTED', p_comments,
      jsonb_build_object('approvalId', v_current.id, 'seq', v_current.seq)
    );
  end if;

  return jsonb_build_object(
    'timesheetId', v_timesheet.id,
    'timesheetStatus', v_timesheet.status,
    'submissionCode', v_timesheet.submission_code,
    'cycleNo', v_timesheet.cycle_no,
    'currentSeq', v_timesheet.current_seq,
    'outcome', v_outcome,
    'decided', jsonb_build_object(
      'approvalId', v_current.id,
      'seq', v_current.seq,
      'status', v_step_status,
      'approverType', v_current.approver_type,
      'resolvedVia', 'USER_ACTION'
    )
  ) || v_routing;
end;
$$;

create or replace function public.fn_pending_approvals(
  p_user_id   bigint,
  p_role_code varchar,
  p_limit     integer default 10,
  p_offset    integer default 0
) returns jsonb
language sql
stable
as $$
  with pending as (
    select
      ap.id,
      ap.timesheet_id,
      ap.seq,
      ap.cycle_no,
      ap.approver_type,
      ap.approver_role_code,
      ap.approver_email,
      ap.approver_name,
      (ap.approver_type = 'CLIENT_EMAIL' and p.manager_id = p_user_id) as on_behalf,
      t.submission_code,
      t.status as timesheet_status,
      t.week_start_date,
      t.week_end_date,
      t.total_hours,
      t.submitted_at,
      a.pay_rate,
      a.currency,
      a.assignment_code,
      u.id   as consultant_id,
      u.full_name as consultant_name,
      p.id   as project_id,
      p.project_name,
      p.code as project_code,
      c.id   as client_id,
      c.client_name,
      co.id  as company_id,
      co.trade_name as company_name
      from public."TIMESHEET_APPROVALS" ap
      join public."TIMESHEETS" t           on t.id = ap.timesheet_id
      join public."PROJECT_ASSIGNMENTS" a  on a.id = t.assignment_id
      join public."USERS" u                on u.id = a.consultant_id
      join public."PROJECTS" p             on p.id = a.project_id
      join public."CLIENTS" c              on c.id = p.client_id
      join public."COMPANIES" co           on co.id = c.company_id
     where ap.status = 'PENDING'
       and ap.cycle_no = t.cycle_no
       and ap.seq = t.current_seq
       and t.status in ('SUBMITTED', 'IN_REVIEW')
       and (
         (ap.approver_type = 'USER' and ap.approver_id = p_user_id) or
         (ap.approver_type = 'ROLE' and ap.approver_role_code = p_role_code) or
         (ap.approver_type = 'CLIENT_EMAIL' and p.manager_id = p_user_id)
       )
  )
  select jsonb_build_object(
    'total', (select count(*) from pending),
    'rows', coalesce(
      (
        select jsonb_agg(to_jsonb(page) order by page.submitted_at, page.id)
          from (
            select *
              from pending
             order by submitted_at, id
             limit greatest(coalesce(p_limit, 10), 0)
            offset greatest(coalesce(p_offset, 0), 0)
          ) as page
      ),
      '[]'::jsonb
    )
  );
$$;

create or replace function public.fn_team_scope_ok(
  p_role_code   varchar,
  p_actor_id    bigint,
  p_manager_id  bigint,
  p_timesheet_id bigint,
  p_cycle_no    smallint,
  p_current_seq smallint,
  p_status      varchar
) returns boolean
language sql
stable
as $$
  select
    p_role_code = 'ADMIN'
    or coalesce(p_manager_id = p_actor_id, false)
    or (p_role_code = 'FINANCE' and p_status in ('APPROVED', 'CLOSED', 'PAID'))
    or exists (
      select 1
        from public."TIMESHEET_APPROVALS" ap
       where ap.timesheet_id = p_timesheet_id
         and ap.cycle_no = p_cycle_no
         and (
           ap.approver_id = p_actor_id
           or (ap.approver_type = 'ROLE' and ap.approver_role_code = p_role_code)
         )
    );
$$;

create or replace function public.fn_team_timesheets(
  p_actor_id  bigint,
  p_role_code varchar,
  p_limit     integer default 10,
  p_offset    integer default 0
) returns jsonb
language sql
stable
as $$
  with scoped as (
    select
      t.id,
      t.submission_code,
      t.assignment_id,
      t.week_start_date,
      t.week_end_date,
      t.status,
      t.total_hours,
      t.cycle_no,
      t.current_seq,
      t.submitted_at,
      t.updated_at,
      a.pay_rate,
      a.currency,
      a.assignment_code,
      u.id        as consultant_id,
      u.full_name as consultant_name,
      u.job_title as consultant_job_title,
      r.code      as consultant_role_code,
      p.id        as project_id,
      p.project_name,
      p.code      as project_code,
      c.id        as client_id,
      c.client_name,
      co.id       as company_id,
      co.trade_name as company_name
      from public."TIMESHEETS" t
      join public."PROJECT_ASSIGNMENTS" a on a.id = t.assignment_id
      join public."USERS" u               on u.id = a.consultant_id
      join public."ROLES" r               on r.id = u.role_id
      join public."PROJECTS" p            on p.id = a.project_id
      join public."CLIENTS" c             on c.id = p.client_id
      join public."COMPANIES" co          on co.id = c.company_id
     where t.status <> 'DRAFT'
       and public.fn_team_scope_ok(
             p_role_code, p_actor_id, p.manager_id,
             t.id, t.cycle_no, t.current_seq, t.status
           )
  )
  select jsonb_build_object(
    'total', (select count(*) from scoped),
    'rows', coalesce(
      (
        select jsonb_agg(to_jsonb(page) order by page.week_start_date desc, page.id desc)
          from (
            select *
              from scoped
             order by week_start_date desc, id desc
             limit greatest(coalesce(p_limit, 10), 0)
            offset greatest(coalesce(p_offset, 0), 0)
          ) as page
      ),
      '[]'::jsonb
    )
  );
$$;

create or replace function public.fn_team_summary(
  p_actor_id  bigint,
  p_role_code varchar,
  p_from      date,
  p_to        date
) returns jsonb
language sql
stable
as $$
  with scoped as (
    select t.id, t.status, t.total_hours, t.week_start_date
      from public."TIMESHEETS" t
      join public."PROJECT_ASSIGNMENTS" a on a.id = t.assignment_id
      join public."PROJECTS" p            on p.id = a.project_id
     where t.status <> 'DRAFT'
       and public.fn_team_scope_ok(
             p_role_code, p_actor_id, p.manager_id,
             t.id, t.cycle_no, t.current_seq, t.status
           )
  )
  select jsonb_build_object(
    'monthHours', coalesce(
      (
        select sum(d.total_hours)
          from public."TIMESHEET_DAYS" d
          join scoped s on s.id = d.timesheet_id
         where d.work_date between p_from and p_to
           and s.status <> 'REJECTED'
      ),
      0
    ),
    'approvedCount', (
      select count(*) from scoped where status in ('APPROVED', 'CLOSED', 'PAID')
    ),
    'openCount', (
      select count(*) from scoped where status in ('SUBMITTED', 'IN_REVIEW')
    )
  );
$$;

create or replace function public.fn_delete_user(
  p_user_id  bigint,
  p_actor_id bigint
) returns jsonb
language plpgsql
as $$
declare
  v_user     public."USERS";
  v_blockers jsonb := '{}'::jsonb;
  v_count    integer;
begin
  if p_user_id = p_actor_id then
    raise exception 'SELF_DELETION';
  end if;

  select * into v_user
    from public."USERS"
   where id = p_user_id
     for update;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  if v_user.is_active then
    raise exception 'USER_STILL_ACTIVE';
  end if;

  select count(*) into v_count
    from public."PROJECT_ASSIGNMENTS" where consultant_id = p_user_id;
  if v_count > 0 then
    v_blockers := v_blockers || jsonb_build_object('assignments', v_count);
  end if;

  select count(*) into v_count
    from public."PROJECTS" where manager_id = p_user_id or closed_by = p_user_id;
  if v_count > 0 then
    v_blockers := v_blockers || jsonb_build_object('projects', v_count);
  end if;

  select count(*) into v_count
    from public."PROJECT_APPROVAL_STEPS" where user_id = p_user_id;
  if v_count > 0 then
    v_blockers := v_blockers || jsonb_build_object('approvalSteps', v_count);
  end if;

  select count(*) into v_count
    from public."TIMESHEET_APPROVALS" where approver_id = p_user_id;
  if v_count > 0 then
    v_blockers := v_blockers || jsonb_build_object('approvals', v_count);
  end if;

  select count(*) into v_count
    from public."TIMESHEET_EVENTS" where actor_id = p_user_id;
  if v_count > 0 then
    v_blockers := v_blockers || jsonb_build_object('events', v_count);
  end if;

  select count(*) into v_count
    from public."APPROVAL_ATTACHMENTS" where uploaded_by = p_user_id;
  if v_count > 0 then
    v_blockers := v_blockers || jsonb_build_object('attachments', v_count);
  end if;

  select count(*) into v_count
    from public."PAYMENT_BATCHES" where created_by = p_user_id;
  if v_count > 0 then
    v_blockers := v_blockers || jsonb_build_object('paymentBatches', v_count);
  end if;

  select count(*) into v_count
    from public."PAYMENTS" where scheduled_by = p_user_id;
  if v_count > 0 then
    v_blockers := v_blockers || jsonb_build_object('payments', v_count);
  end if;

  if v_blockers <> '{}'::jsonb then
    raise exception 'USER_HAS_HISTORY:%', v_blockers::text;
  end if;

  delete from public."NOTIFICATIONS" where user_id = p_user_id;
  delete from public."USERS" where id = p_user_id;

  return jsonb_build_object(
    'userId', p_user_id,
    'userName', v_user.user_name,
    'fullName', v_user.full_name
  );
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
alter table public."USER_PERMISSIONS"       enable row level security;
alter table public."HOLIDAYS"               enable row level security;
alter table public."PAYROLL_COUNTRY_RULES"  enable row level security;

insert into public."ROLES" (code, name) values
  ('CONSULTANT',       'Consultant'),
  ('EMPLOYEE',         'Employee'),
  ('MANAGER',          'Manager'),
  ('FINANCE',          'Finance'),
  ('ADMIN',            'Administrator'),
  ('EXTERNAL_MANAGER', 'External manager')
on conflict (code) do nothing;

insert into public."HOLIDAYS" (country_code, holiday_date, name) values
  ('MX', '2025-01-01', 'Año Nuevo'),
  ('MX', '2025-02-03', 'Día de la Constitución'),
  ('MX', '2025-03-17', 'Natalicio de Benito Juárez'),
  ('MX', '2025-05-01', 'Día del Trabajo'),
  ('MX', '2025-09-16', 'Día de la Independencia'),
  ('MX', '2025-11-17', 'Día de la Revolución'),
  ('MX', '2025-12-25', 'Navidad'),
  ('MX', '2026-01-01', 'Año Nuevo'),
  ('MX', '2026-02-02', 'Día de la Constitución'),
  ('MX', '2026-03-16', 'Natalicio de Benito Juárez'),
  ('MX', '2026-05-01', 'Día del Trabajo'),
  ('MX', '2026-09-16', 'Día de la Independencia'),
  ('MX', '2026-11-16', 'Día de la Revolución'),
  ('MX', '2026-12-25', 'Navidad'),
  ('MX', '2027-01-01', 'Año Nuevo'),
  ('MX', '2027-02-01', 'Día de la Constitución'),
  ('MX', '2027-03-15', 'Natalicio de Benito Juárez'),
  ('MX', '2027-05-01', 'Día del Trabajo'),
  ('MX', '2027-09-16', 'Día de la Independencia'),
  ('MX', '2027-11-15', 'Día de la Revolución'),
  ('MX', '2027-12-25', 'Navidad')
on conflict (country_code, holiday_date) do nothing;

insert into public."PAYROLL_COUNTRY_RULES" (
  country_code, overtime_multiplier, overtime_triple_multiplier,
  weekly_double_overtime_hours, holiday_multiplier, sunday_multiplier
) values ('MX', 2, 3, 9, 3, 1.25)
on conflict (country_code) do nothing;

do $$
begin
  if to_regclass('storage.buckets') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'timesheet-evidence',
    'timesheet-evidence',
    false,
    10485760,
    array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
  )
  on conflict (id) do update
    set public             = false,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end;
$$;
