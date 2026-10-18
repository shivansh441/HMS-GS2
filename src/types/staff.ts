export type StaffDepartment =
  | "front_desk"
  | "housekeeping"
  | "maintenance"
  | "fnb_kitchen"
  | "management"
  | "security"
  | "general";

export type EmploymentType = "full_time" | "part_time" | "contract" | "seasonal";

export type StaffStatus = "active" | "on_leave" | "terminated";

export type ShiftType = "morning" | "afternoon" | "evening" | "night" | "split";

export type ShiftStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "swapped";

export type AttendanceStatus = "present" | "late" | "half_day" | "absent" | "on_leave";

export type CleaningType =
  | "checkout_clean"
  | "stayover_clean"
  | "deep_clean"
  | "touch_up"
  | "inspection";

export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type HousekeepingStatus =
  | "pending"
  | "in_progress"
  | "cleaned"
  | "inspected"
  | "cancelled";

export type MaintenanceCategory =
  | "plumbing"
  | "electrical"
  | "hvac"
  | "carpentry"
  | "appliance"
  | "safety"
  | "structural"
  | "other";

export type MaintenancePriority = "low" | "medium" | "high" | "emergency";

export type MaintenanceStatus =
  | "reported"
  | "assigned"
  | "in_progress"
  | "awaiting_parts"
  | "resolved"
  | "closed";

export type MaintenanceLocationType =
  | "room"
  | "bed"
  | "kitchen_mess"
  | "lobby_common"
  | "exterior";

export type DailyLogCategory =
  | "shift_handover"
  | "incident"
  | "lost_and_found"
  | "guest_request"
  | "maintenance_flag"
  | "general";

export type DailyLogPriority = "routine" | "important" | "urgent";

export interface ChecklistItem {
  id: string;
  description: string;
  completed: boolean;
}

export interface StaffMember {
  id: string;
  property_id: string;
  user_id?: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  department: StaffDepartment;
  job_title: string;
  employment_type: EmploymentType;
  status: StaffStatus;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  hourly_rate: number;
  salary?: number;
  hire_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffShift {
  id: string;
  property_id: string;
  staff_id: string;
  staff_name: string;
  department: StaffDepartment;
  shift_type: ShiftType;
  shift_date: string;
  start_time: string;
  end_time: string;
  break_duration_minutes: number;
  status: ShiftStatus;
  station_or_zone?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface StaffAttendance {
  id: string;
  property_id: string;
  staff_id: string;
  staff_name: string;
  attendance_date: string;
  shift_id?: string;
  clock_in_time: string;
  clock_out_time?: string;
  total_work_minutes: number;
  status: AttendanceStatus;
  late_minutes: number;
  verified_by_user_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface HousekeepingTask {
  id: string;
  property_id: string;
  room_id?: string;
  room_number?: string;
  bed_id?: string;
  bed_label?: string;
  cleaning_type: CleaningType;
  priority: TaskPriority;
  status: HousekeepingStatus;
  assigned_staff_id?: string;
  assigned_staff_name?: string;
  started_at?: string;
  completed_at?: string;
  inspected_by_staff_id?: string;
  inspected_by_name?: string;
  inspection_passed?: boolean;
  checklist: ChecklistItem[];
  linen_changed: boolean;
  amenities_restocked: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceWorkOrder {
  id: string;
  property_id: string;
  work_order_number: string;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  location_type: MaintenanceLocationType;
  room_id?: string;
  room_number?: string;
  reported_by_name: string;
  reported_by_user_id?: string;
  assigned_staff_id?: string;
  assigned_staff_name?: string;
  estimated_cost: number;
  actual_cost: number;
  parts_used?: string;
  resolution_notes?: string;
  status: MaintenanceStatus;
  created_at: string;
  resolved_at?: string;
  updated_at: string;
}

export interface OperationalDailyLog {
  id: string;
  property_id: string;
  log_date: string;
  shift_period: "morning" | "evening" | "night";
  author_user_id: string;
  author_name: string;
  category: DailyLogCategory;
  summary: string;
  details: string;
  priority: DailyLogPriority;
  is_resolved: boolean;
  resolved_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface StaffOperationsDashboard {
  property_id: string;
  total_staff: number;
  active_staff_on_duty: number;
  today_scheduled_shifts: number;
  pending_housekeeping_tasks: number;
  dirty_rooms_count: number;
  inspected_rooms_count: number;
  open_maintenance_orders: number;
  emergency_maintenance_count: number;
  open_handover_logs: number;
  department_headcount: Record<string, number>;
  recent_activity: Array<{
    type: "staff" | "shift" | "housekeeping" | "maintenance" | "log";
    title: string;
    time: string;
    severity?: "info" | "warning" | "urgent" | "success";
  }>;
}
