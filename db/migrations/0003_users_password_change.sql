alter table public."USERS"
  add column if not exists must_change_password boolean not null default false;

create index if not exists "idx_USERS_is_active" on public."USERS" (is_active);
