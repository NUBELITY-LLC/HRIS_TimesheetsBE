export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type RolesRow = {
  id: number;
  code: string;
  name: string;
};

type UsersRow = {
  id: number;
  role_id: number;
  full_name: string;
  user_name: string;
  email: string;
  password_hash: string;
  job_title: string | null;
  failed_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  is_active: boolean;
  must_change_password: boolean;
};

type CompaniesRow = {
  id: number;
  legal_name: string;
  trade_name: string;
  rfc: string | null;
  is_active: boolean;
};

type ClientsRow = {
  id: number;
  company_id: number;
  client_name: string;
  contact_email: string | null;
  is_active: boolean;
};

type ProjectsRow = {
  id: number;
  client_id: number;
  manager_id: number | null;
  project_name: string;
  code: string | null;
  start_date: string | null;
  end_date: string | null;
};

type ProjectAssignmentsRow = {
  id: number;
  project_id: number;
  consultant_id: number;
  pay_rate: number;
  currency: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
};

export type ApproverType = 'CLIENT_EMAIL' | 'USER' | 'ROLE';

type ProjectApprovalStepsRow = {
  id: number;
  project_id: number;
  seq: number;
  approver_type: ApproverType;
  user_id: number | null;
  role_id: number | null;
  is_active: boolean;
};

export type TimesheetStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'REJECTED'
  | 'APPROVED'
  | 'CLOSED'
  | 'PAID';

type TimesheetsRow = {
  id: number;
  assignment_id: number;
  submission_code: string | null;
  current_seq: number | null;
  week_start_date: string;
  week_end_date: string;
  status: TimesheetStatus;
  total_hours: number;
  cycle_no: number;
  submitted_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

type TimesheetDaysRow = {
  id: number;
  timesheet_id: number;
  work_date: string;
  total_hours: number;
  note: string | null;
};

type TimesheetActivitiesRow = {
  id: number;
  day_id: number;
  line_no: number;
  hours: number;
  activity: string;
  created_at: string;
};

export type ApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED_TO_PREVIOUS'
  | 'REJECTED_TO_CONSULTANT';

type TimesheetApprovalsRow = {
  id: number;
  timesheet_id: number;
  step_id: number | null;
  seq: number;
  cycle_no: number;
  approver_type: ApproverType;
  approver_id: number | null;
  approver_role_code: string | null;
  status: ApprovalStatus;
  resolved_via: string | null;
  review_no: number;
  comments: string | null;
  decided_at: string | null;
};

type TimesheetEventsRow = {
  id: number;
  timesheet_id: number;
  actor_id: number | null;
  from_seq: number | null;
  to_seq: number | null;
  cycle_no: number;
  event_type: string;
  actor_role_code: string | null;
  from_status: string | null;
  to_status: string | null;
  comments: string | null;
  metadata: Json;
  occurred_at: string;
};

type NotificationsRow = {
  id: number;
  user_id: number;
  timesheet_id: number | null;
  kind: string | null;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
};

type InsertOf<Row extends { id: number }, Optional extends keyof Row = never> = Omit<
  Row,
  'id' | Optional
> &
  Partial<Pick<Row, 'id' | Optional>>;

type ForeignKey<Column extends string, Table extends string> = {
  foreignKeyName: string;
  columns: [Column];
  isOneToOne: false;
  referencedRelation: Table;
  referencedColumns: ['id'];
};

export type Database = {
  public: {
    Tables: {
      ROLES: {
        Row: RolesRow;
        Insert: InsertOf<RolesRow>;
        Update: Partial<RolesRow>;
        Relationships: [];
      };
      USERS: {
        Row: UsersRow;
        Insert: InsertOf<
          UsersRow,
          | 'job_title'
          | 'failed_attempts'
          | 'locked_until'
          | 'last_login_at'
          | 'is_active'
          | 'must_change_password'
        >;
        Update: Partial<UsersRow>;
        Relationships: [ForeignKey<'role_id', 'ROLES'>];
      };
      COMPANIES: {
        Row: CompaniesRow;
        Insert: InsertOf<CompaniesRow, 'rfc' | 'is_active'>;
        Update: Partial<CompaniesRow>;
        Relationships: [];
      };
      CLIENTS: {
        Row: ClientsRow;
        Insert: InsertOf<ClientsRow, 'contact_email' | 'is_active'>;
        Update: Partial<ClientsRow>;
        Relationships: [ForeignKey<'company_id', 'COMPANIES'>];
      };
      PROJECTS: {
        Row: ProjectsRow;
        Insert: InsertOf<ProjectsRow, 'manager_id' | 'code' | 'start_date' | 'end_date'>;
        Update: Partial<ProjectsRow>;
        Relationships: [ForeignKey<'client_id', 'CLIENTS'>, ForeignKey<'manager_id', 'USERS'>];
      };
      PROJECT_ASSIGNMENTS: {
        Row: ProjectAssignmentsRow;
        Insert: InsertOf<ProjectAssignmentsRow, 'currency' | 'end_date' | 'is_active'>;
        Update: Partial<ProjectAssignmentsRow>;
        Relationships: [
          ForeignKey<'project_id', 'PROJECTS'>,
          ForeignKey<'consultant_id', 'USERS'>,
        ];
      };
      PROJECT_APPROVAL_STEPS: {
        Row: ProjectApprovalStepsRow;
        Insert: InsertOf<ProjectApprovalStepsRow, 'user_id' | 'role_id' | 'is_active'>;
        Update: Partial<ProjectApprovalStepsRow>;
        Relationships: [
          ForeignKey<'project_id', 'PROJECTS'>,
          ForeignKey<'user_id', 'USERS'>,
          ForeignKey<'role_id', 'ROLES'>,
        ];
      };
      TIMESHEETS: {
        Row: TimesheetsRow;
        Insert: InsertOf<
          TimesheetsRow,
          | 'submission_code'
          | 'current_seq'
          | 'status'
          | 'total_hours'
          | 'cycle_no'
          | 'submitted_at'
          | 'closed_at'
          | 'created_at'
          | 'updated_at'
        >;
        Update: Partial<TimesheetsRow>;
        Relationships: [ForeignKey<'assignment_id', 'PROJECT_ASSIGNMENTS'>];
      };
      TIMESHEET_DAYS: {
        Row: TimesheetDaysRow;
        Insert: InsertOf<TimesheetDaysRow, 'total_hours' | 'note'>;
        Update: Partial<TimesheetDaysRow>;
        Relationships: [ForeignKey<'timesheet_id', 'TIMESHEETS'>];
      };
      TIMESHEET_ACTIVITIES: {
        Row: TimesheetActivitiesRow;
        Insert: InsertOf<TimesheetActivitiesRow, 'created_at'>;
        Update: Partial<TimesheetActivitiesRow>;
        Relationships: [ForeignKey<'day_id', 'TIMESHEET_DAYS'>];
      };
      TIMESHEET_APPROVALS: {
        Row: TimesheetApprovalsRow;
        Insert: InsertOf<
          TimesheetApprovalsRow,
          | 'step_id'
          | 'cycle_no'
          | 'approver_id'
          | 'approver_role_code'
          | 'status'
          | 'resolved_via'
          | 'review_no'
          | 'comments'
          | 'decided_at'
        >;
        Update: Partial<TimesheetApprovalsRow>;
        Relationships: [
          ForeignKey<'timesheet_id', 'TIMESHEETS'>,
          ForeignKey<'step_id', 'PROJECT_APPROVAL_STEPS'>,
          ForeignKey<'approver_id', 'USERS'>,
        ];
      };
      TIMESHEET_EVENTS: {
        Row: TimesheetEventsRow;
        Insert: InsertOf<
          TimesheetEventsRow,
          | 'actor_id'
          | 'from_seq'
          | 'to_seq'
          | 'cycle_no'
          | 'actor_role_code'
          | 'from_status'
          | 'to_status'
          | 'comments'
          | 'metadata'
          | 'occurred_at'
        >;
        Update: Partial<TimesheetEventsRow>;
        Relationships: [
          ForeignKey<'timesheet_id', 'TIMESHEETS'>,
          ForeignKey<'actor_id', 'USERS'>,
        ];
      };
      NOTIFICATIONS: {
        Row: NotificationsRow;
        Insert: InsertOf<
          NotificationsRow,
          'timesheet_id' | 'kind' | 'body' | 'is_read' | 'created_at'
        >;
        Update: Partial<NotificationsRow>;
        Relationships: [
          ForeignKey<'user_id', 'USERS'>,
          ForeignKey<'timesheet_id', 'TIMESHEETS'>,
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      fn_save_timesheet_draft: {
        Args: {
          p_assignment_id: number;
          p_week_start: string;
          p_actor_id: number;
          p_actor_role_code: string;
          p_days: Json;
        };
        Returns: number;
      };
      fn_replace_project_approval_steps: {
        Args: {
          p_project_id: number;
          p_steps: Json;
        };
        Returns: number;
      };
      fn_create_user_with_assignments: {
        Args: {
          p_user: Json;
          p_assignments: Json;
        };
        Returns: number;
      };
      fn_submit_timesheet: {
        Args: {
          p_timesheet_id: number;
          p_actor_id: number;
          p_actor_role_code: string;
        };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
