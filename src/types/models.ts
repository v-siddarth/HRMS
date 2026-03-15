export type UserRole = 'super_admin' | 'shop_manager';

export type ShopStatus = 'active' | 'inactive';
export type EmployeeStatus = 'active' | 'inactive';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'leave';
export type AttendanceSource = 'manual' | 'biometric';
export type WeeklyOffDay = 'none' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface AuthUser {
  uid: string;
  email: string;
  role: UserRole;
  shopId?: string;
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
  status: AttendanceStatus;
  source?: AttendanceSource;
  punchTime?: string;
  rawLogId?: string;
  biometricDeviceId?: string;
  syncedAt?: string;
  checkInTime?: string;
  checkOutTime?: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyShiftPlan {
  id: string;
  shopId: string;
  weekStartDate: string;
  employeeId: string;
  shiftId: string;
  dayOfWeek: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
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
