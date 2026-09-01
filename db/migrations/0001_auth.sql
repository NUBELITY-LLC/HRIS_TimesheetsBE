create table if not exists public."ROLES" (
  id        bigint generated always as identity primary key,
  code      varchar(30)  not null unique,
  name      varchar(80)  not null
);

create table if not exists public."USERS" (
  id              bigint generated always as identity primary key,
  role_id         bigint       not null references public."ROLES"(id),
  full_name       varchar(150) not null,
  user_name       varchar(50)  not null unique,
  email           varchar(254) not null unique,
  password_hash   varchar(255) not null,
  job_title       varchar(100),
  failed_attempts smallint     not null default 0,
  locked_until    timestamp,
  last_login_at   timestamp,
  is_active       boolean      not null default true
);

create index if not exists "idx_USERS_role_id" on public."USERS" (role_id);

create index if not exists "idx_USERS_lower_user_name" on public."USERS" (lower(user_name));
create index if not exists "idx_USERS_lower_email" on public."USERS" (lower(email));

alter table public."ROLES" enable row level security;
alter table public."USERS" enable row level security;

insert into public."ROLES" (code, name) values
  ('CONSULTANT', 'Consultant'),
  ('EMPLOYEE',   'Employee'),
  ('PM',         'Project Manager'),
  ('ADMIN',      'Administrator')
on conflict (code) do nothing;
