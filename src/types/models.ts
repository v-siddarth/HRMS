export type UserRole = 'super_admin' | 'shop_manager' | 'staff';

export type ShopStatus = 'active' | 'inactive';
export type EmployeeStatus = 'active' | 'inactive';
export type EmployeeAuthStatus = 'not_created' | 'pending' | 'provisioned' | 'disabled' | 'error';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'leave';
export type AttendanceSource = 'manual' | 'biometric';
export type WeeklyOffDay = 'none' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface AuthUser {
  uid: string;
  email: string;
  role: UserRole;
  shopId?: string;
  employeeId?: string;
  displayName?: string;
}

export interface Shop {
  id: string;
  shopName: string;
  address: string;
  ownerName: string;
  contactNumber: string;
  email: string;
  username: string;
  // One-time password used only for provisioning Firebase Auth user.
  bootstrapPassword?: string;
  // Legacy plaintext field kept optional for backward compatibility during migration.
  password?: string;
  authUid?: string;
  authProvisionStatus?: 'pending' | 'provisioned' | 'error';
  authProvisionedAt?: string;
  authLastSyncedAt?: string;
  authLastError?: string;
  status: ShopStatus;
  createdByAdminUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string;
  shopId: string;
  employeeCode?: string;
  name: string;
  phone: string;
  loginEmail?: string;
  address: string;
  addressLine1?: string;
  taluka?: string;
  district?: string;
  organization?: string;
  designation: string;
  joiningDate: string;
  aadhaarNo?: string;
  salaryType: 'monthly';
  basicSalary: number;
  pfAmount?: number;
  overtimeRatePerHour: number;
  defaultShiftId?: string;
  weeklyOff?: WeeklyOffDay;
  biometricUserId?: string;
  biometricConsent?: boolean;
  biometricRegisteredAt?: string;
  authUid?: string;
  authStatus?: EmployeeAuthStatus;
  authProvisionedAt?: string;
  authDisabledAt?: string;
  lastLoginAt?: string;
  authLastError?: string;
  activatedAt?: string;
  deactivatedAt?: string;
  status: EmployeeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  shopId: string;
  date: string;
  shiftId?: string;
  status: AttendanceStatus;
  lateFlag?: boolean;
  workingHours?: number;
  source?: AttendanceSource;
  punchTime?: string;
  rawLogId?: string;
  biometricDeviceId?: string;
  syncedAt?: string;
  checkInTime?: string;
  checkOutTime?: string;
  checkInAt?: string;
  checkOutAt?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryMonthly {
  id: string;
  employeeId: string;
  shopId: string;
  month: string;
  totalDaysInMonth: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays?: number;
  lateEntries: number;
  lateDeductionDays: number;
  payableDays: number;
  perDaySalary: number;
  overtimeHours: number;
  overtimeAmount: number;
  grossSalary?: number;
  advanceDeduction?: number;
  netSalary: number;
  generatedAt: string;
  salaryPaidAt?: string;
  salaryPaidBy?: string;
}

export interface EmployeeAdvance {
  id: string;
  shopId: string;
  employeeId: string;
  month: string;
  amount: number;
  type: 'advance' | 'loan';
  notes?: string;
  paidAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftMaster {
  id: string;
  shopId: string;
  name: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  active: boolean;
  allowedEarlyMinutes?: number;
  graceTime?: number;
  lateRuleMinutes?: number;
  halfDayHours?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftTemplate {
  id: string;
  shopId: string;
  name: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  allowedEarlyMinutes?: number;
  graceTime: number;
  lateRuleMinutes: number;
  halfDayHours: number;
  createdAt: string;
  updatedAt: string;
}

export interface StaffWeeklyShiftDay {
  id: string;
  shopId: string;
  staffId: string;
  dayOfWeek: number;
  shiftId: string | null;
  isOff: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollSettings {
  lateThreshold: number;
  lateDeductionDays: number;
  timezone: string;
}

export interface BiometricSettings {
  enabled: boolean;
  deviceName: string;
  deviceId: string;
  syncWindowMinutes: number;
  lastSyncedAt?: string;
  integrationMode: 'api' | 'pull_agent';
}
