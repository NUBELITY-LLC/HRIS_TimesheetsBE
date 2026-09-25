import type { APPROVER_TYPES } from '../utils/approvals.js';
import type { ProjectStatus } from '../utils/projects.js';

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

type UserPermissionsRow = {
  user_id: number;
  permission_code: string;
  granted_by: number | null;
  granted_at: string;
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
  user_id: number | null;
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
  status: ProjectStatus;
  closed_at: string | null;
  closed_by: number | null;
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
  assignment_code: string | null;
  contract_type: string;
  country_code: string;
  hours_divisor: number;
  daily_hours: number;
  overtime_multiplier: number;
  holiday_multiplier: number;
};

type PayrollCountryRulesRow = {
  country_code: string;
  overtime_multiplier: number;
  overtime_triple_multiplier: number;
  weekly_double_overtime_hours: number | null;
  holiday_multiplier: number;
  sunday_multiplier: number;
  updated_by: number | null;
  updated_at: string;
};

type HolidaysRow = {
  id: number;
  country_code: string;
  holiday_date: string;
  name: string;
};

export type ApproverType = (typeof APPROVER_TYPES)[number];

type ProjectApprovalStepsRow = {
  id: number;
  project_id: number;
  seq: number;
  approver_type: ApproverType;
  user_id: number | null;
  role_id: number | null;
  client_id: number | null;
  approver_email: string | null;
  approver_name: string | null;
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
  approver_email: string | null;
  approver_name: string | null;
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

export type ApprovalRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

type ApprovalRequestsRow = {
  id: number;
  approval_id: number;
  timesheet_id: number;
  recipient_email: string;
  token: string;
  status: ApprovalRequestStatus;
  sent_at: string;
  responded_at: string | null;
  response_note: string | null;
  raw_payload: Json | null;
  expires_at: string | null;
  created_at: string;
};

type ApprovalAttachmentsRow = {
  id: number;
  approval_id: number;
  timesheet_id: number;
  uploaded_by: number;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
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
  email_status: string;
  email_attempts: number;
  email_claimed_at: string | null;
  email_sent_at: string | null;
  email_error: string | null;
  dedupe_key: string | null;
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
      USER_PERMISSIONS: {
        Row: UserPermissionsRow;
        Insert: Omit<UserPermissionsRow, 'granted_by' | 'granted_at'> &
          Partial<Pick<UserPermissionsRow, 'granted_by' | 'granted_at'>>;
        Update: Partial<UserPermissionsRow>;
        Relationships: [ForeignKey<'user_id', 'USERS'>];
      };
      COMPANIES: {
        Row: CompaniesRow;
        Insert: InsertOf<CompaniesRow, 'rfc' | 'is_active'>;
        Update: Partial<CompaniesRow>;
        Relationships: [];
      };
      CLIENTS: {
        Row: ClientsRow;
        Insert: InsertOf<ClientsRow, 'contact_email' | 'user_id' | 'is_active'>;
        Update: Partial<ClientsRow>;
        Relationships: [ForeignKey<'company_id', 'COMPANIES'>, ForeignKey<'user_id', 'USERS'>];
      };
      PROJECTS: {
        Row: ProjectsRow;
        Insert: InsertOf<
          ProjectsRow,
          'manager_id' | 'code' | 'start_date' | 'end_date' | 'status' | 'closed_at' | 'closed_by'
        >;
        Update: Partial<ProjectsRow>;
        Relationships: [ForeignKey<'client_id', 'CLIENTS'>, ForeignKey<'manager_id', 'USERS'>];
      };
      PROJECT_ASSIGNMENTS: {
        Row: ProjectAssignmentsRow;
        Insert: InsertOf<
          ProjectAssignmentsRow,
          | 'currency'
          | 'end_date'
          | 'is_active'
          | 'assignment_code'
          | 'contract_type'
          | 'country_code'
          | 'hours_divisor'
          | 'daily_hours'
          | 'overtime_multiplier'
          | 'holiday_multiplier'
        >;
        Update: Partial<ProjectAssignmentsRow>;
        Relationships: [
          ForeignKey<'project_id', 'PROJECTS'>,
          ForeignKey<'consultant_id', 'USERS'>,
        ];
      };
      PROJECT_APPROVAL_STEPS: {
        Row: ProjectApprovalStepsRow;
        Insert: InsertOf<
          ProjectApprovalStepsRow,
          'user_id' | 'role_id' | 'client_id' | 'approver_email' | 'approver_name' | 'is_active'
        >;
        Update: Partial<ProjectApprovalStepsRow>;
        Relationships: [
          ForeignKey<'project_id', 'PROJECTS'>,
          ForeignKey<'user_id', 'USERS'>,
          ForeignKey<'role_id', 'ROLES'>,
          ForeignKey<'client_id', 'CLIENTS'>,
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
      PAYROLL_COUNTRY_RULES: {
        Row: PayrollCountryRulesRow;
        Insert: Pick<PayrollCountryRulesRow, 'country_code'> &
          Partial<Omit<PayrollCountryRulesRow, 'country_code'>>;
        Update: Partial<PayrollCountryRulesRow>;
        Relationships: [];
      };
      HOLIDAYS: {
        Row: HolidaysRow;
        Insert: InsertOf<HolidaysRow>;
        Update: Partial<HolidaysRow>;
        Relationships: [];
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
          | 'approver_email'
          | 'approver_name'
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
      APPROVAL_REQUESTS: {
        Row: ApprovalRequestsRow;
        Insert: InsertOf<
          ApprovalRequestsRow,
          | 'status'
          | 'sent_at'
          | 'responded_at'
          | 'response_note'
          | 'raw_payload'
          | 'expires_at'
          | 'created_at'
        >;
        Update: Partial<ApprovalRequestsRow>;
        Relationships: [
          ForeignKey<'approval_id', 'TIMESHEET_APPROVALS'>,
          ForeignKey<'timesheet_id', 'TIMESHEETS'>,
        ];
      };
      APPROVAL_ATTACHMENTS: {
        Row: ApprovalAttachmentsRow;
        Insert: InsertOf<ApprovalAttachmentsRow, 'created_at'>;
        Update: Partial<ApprovalAttachmentsRow>;
        Relationships: [
          ForeignKey<'approval_id', 'TIMESHEET_APPROVALS'>,
          ForeignKey<'timesheet_id', 'TIMESHEETS'>,
          ForeignKey<'uploaded_by', 'USERS'>,
        ];
      };
      NOTIFICATIONS: {
        Row: NotificationsRow;
        Insert: InsertOf<
          NotificationsRow,
          | 'timesheet_id'
          | 'kind'
          | 'body'
          | 'is_read'
          | 'created_at'
          | 'email_status'
          | 'email_attempts'
          | 'email_claimed_at'
          | 'email_sent_at'
          | 'email_error'
          | 'dedupe_key'
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
        Returns: Json;
      };
      fn_route_current_step: {
        Args: {
          p_timesheet_id: number;
          p_actor_id: number;
          p_actor_role_code: string;
        };
        Returns: Json;
      };
      fn_approve_external_step: {
        Args: {
          p_approval_id: number;
          p_actor_id: number;
          p_actor_role_code: string;
          p_comments: string | null;
        };
        Returns: Json;
      };
      fn_decide_internal_step: {
        Args: {
          p_approval_id: number;
          p_actor_id: number;
          p_actor_role_code: string;
          p_decision: string;
          p_comments: string | null;
        };
        Returns: Json;
      };
      fn_replace_user_permissions: {
        Args: { p_user_id: number; p_permissions: Json; p_actor_id: number };
        Returns: number;
      };
      fn_delete_user: {
        Args: { p_user_id: number; p_actor_id: number };
        Returns: Json;
      };
      fn_team_timesheets: {
        Args: {
          p_actor_id: number;
          p_role_code: string;
          p_limit: number;
          p_offset: number;
        };
        Returns: Json;
      };
      fn_team_summary: {
        Args: {
          p_actor_id: number;
          p_role_code: string;
          p_from: string;
          p_to: string;
        };
        Returns: Json;
      };
      fn_pending_approvals: {
        Args: {
          p_user_id: number;
          p_role_code: string;
          p_limit: number;
          p_offset: number;
        };
        Returns: Json;
      };
      fn_close_project: {
        Args: {
          p_project_id: number;
          p_effective_date: string;
          p_actor_id: number;
        };
        Returns: Json;
      };
      fn_reopen_project: {
        Args: {
          p_project_id: number;
        };
        Returns: Json;
      };
      fn_create_timesheet_reminders: {
        Args: { p_week_start: string };
        Returns: number;
      };
      fn_claim_notification_emails: {
        Args: {
          p_timesheet_id?: number | null;
          p_user_id?: number | null;
          p_limit?: number;
          p_max_attempts?: number;
          p_stale_minutes?: number;
          p_max_age_days?: number;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
