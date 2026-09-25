begin;

create temporary table _keep_users on commit drop as
select id
  from public."USERS"
 where user_name in ('mtorres');

truncate table
  public."APPROVAL_ATTACHMENTS",
  public."APPROVAL_REQUESTS",
  public."PAYMENTS",
  public."PAYMENT_BATCHES",
  public."NOTIFICATIONS",
  public."TIMESHEET_EVENTS",
  public."TIMESHEET_APPROVALS",
  public."TIMESHEET_ACTIVITIES",
  public."TIMESHEET_DAYS",
  public."TIMESHEETS",
  public."PROJECT_APPROVAL_STEPS",
  public."PROJECT_ASSIGNMENTS",
  public."PROJECTS",
  public."CLIENTS",
  public."COMPANIES"
  restart identity cascade;

delete from public."USERS"
 where id not in (select id from _keep_users);

select setval(
  pg_get_serial_sequence('public."USERS"', 'id'),
  coalesce((select max(id) from public."USERS"), 0) + 1,
  false
);

select
  (select count(*) from public."USERS")      as usuarios,
  (select count(*) from public."COMPANIES")  as empresas,
  (select count(*) from public."CLIENTS")    as clientes,
  (select count(*) from public."PROJECTS")   as proyectos,
  (select count(*) from public."TIMESHEETS") as timesheets,
  (select count(*) from public."NOTIFICATIONS") as notificaciones,
  (select count(*) from public."ROLES")      as roles;

commit;
