export type UserRole = 'super_admin' | 'shop_manager';

export type ShopStatus = 'active' | 'inactive';
export type EmployeeStatus = 'active' | 'inactive';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day';
export type AttendanceSource = 'manual' | 'biometric';

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
  password: string;
  status: ShopStatus;
  createdByAdminUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string;
  shopId: string;
  name: string;
  phone: string;
  address: string;
  designation: string;
  joiningDate: string;
  salaryType: 'monthly';
  basicSalary: number;
  overtimeRatePerHour: number;
  biometricUserId?: string;
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
  lateEntries: number;
  lateDeductionDays: number;
  payableDays: number;
  perDaySalary: number;
  overtimeHours: number;
  overtimeAmount: number;
  netSalary: number;
  generatedAt: string;
  salaryPaidAt?: string;
  salaryPaidBy?: string;
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
