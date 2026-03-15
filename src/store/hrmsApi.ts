import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import dayjs from 'dayjs';
import type {
  AttendanceRecord,
  AttendanceSource,
  AttendanceStatus,
  BiometricSettings,
  EmployeeAdvance,
  Employee,
  PayrollSettings,
  SalaryMonthly,
  ShiftMaster,
  Shop,
  WeeklyShiftPlan,
} from '../types/models';
import {
  attendanceCol,
  advancesCol,
  biometricSettingsDoc,
  employeesCol,
  firestore,
  nowIso,
  payrollSettingsDoc,
  salaryCol,
  shopDoc,
  shopsCol,
  shiftsCol,
  weeklyShiftPlansCol,
} from '../services/firebase';
import { calculateSalary } from '../utils/salary';
import { currentMonth, daysInMonth, monthDateRange, todayDate } from '../utils/date';
import { logError, logInfo } from '../utils/logger';

interface FirestoreError {
  message: string;
}

type ShopInput = {
  id?: string;
  shopName: string;
  address: string;
  ownerName: string;
  contactNumber: string;
  email: string;
  username: string;
  status: Shop['status'];
  createdByAdminUid: string;
  bootstrapPassword?: string;
  // Legacy field kept for migration compatibility.
  password?: string;
  authUid?: string;
  authProvisionStatus?: Shop['authProvisionStatus'];
  authProvisionedAt?: string;
  authLastSyncedAt?: string;
  authLastError?: string;
};
type EmployeeInput = Omit<Employee, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string };

interface BulkAttendancePayload {
  shopId: string;
  date: string;
  records: {
    employeeId: string;
    status: AttendanceStatus;
    notes?: string;
    source?: AttendanceSource;
    punchTime?: string;
    rawLogId?: string;
    biometricDeviceId?: string;
    syncedAt?: string;
    checkInTime?: string;
    checkOutTime?: string;
  }[];
  createdBy: string;
}

interface SalaryGeneratePayload {
  shopId: string;
  month: string;
  overtimeHoursByEmployeeId?: Record<string, number>;
}

interface AdvanceEntryPayload {
  shopId: string;
  employeeId: string;
  month: string;
  amount: number;
  type: 'advance' | 'loan';
  notes?: string;
  paidAt: string;
  createdBy: string;
}

interface ShiftInput extends Omit<ShiftMaster, 'id' | 'createdAt' | 'updatedAt'> {
  id?: string;
  createdAt?: string;
}

interface WeeklyShiftPlanInput extends Omit<WeeklyShiftPlan, 'id' | 'createdAt' | 'updatedAt'> {
  id?: string;
  createdAt?: string;
}

interface ReportFilter {
  shopId: string;
  fromDate: string;
  toDate: string;
}

interface ShopDashboard {
  totalStaff: number;
  presentStaff: number;
  punchErrors: number;
  todayDate: string;
  currentMonthProjectedSalary: number;
  advanceSalaryPaid: number;
  monthlyNetSalary: number;
  lateEntriesThisMonth: number;
}

interface ShopAnalytics {
  todayBreakdown: {
    present: number;
    late: number;
    halfDay: number;
    absent: number;
  };
  attendanceTrend: { date: string; label: string; attendance: number }[];
  salaryTrend: { month: string; label: string; total: number }[];
  staffStatus: { active: number; inactive: number };
}

interface AdminDashboard {
  totalShops: number;
  activeShops: number;
  inactiveShops: number;
  totalEmployees: number;
}

interface AdminAnalytics {
  todayAttendance: {
    present: number;
    absent: number;
    late: number;
    halfDay: number;
  };
  monthlySalaryPayout: number;
  averageSalaryPerActiveShop: number;
  salaryTrend: { month: string; total: number }[];
}

const serialize = <T extends { id: string }>(id: string, data: Omit<T, 'id'>): T =>
  ({ id, ...data }) as T;

const isPresentLikeStatus = (status: AttendanceStatus) =>
  status === 'present' || status === 'late' || status === 'half_day';

const hasPunchError = (row: AttendanceRecord) => {
  if (!isPresentLikeStatus(row.status)) {
    return false;
  }
  const hasIn = !!row.checkInTime || !!row.punchTime;
  const hasOut = !!row.checkOutTime;
  if (!hasIn) {
    return true;
  }
  return !hasOut;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') {
      return maybeMessage;
    }
  }
  return 'Unknown error';
};

const isTransientFirestoreError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('firestore/unavailable') ||
    message.includes('unavailable') ||
    message.includes('deadline') ||
    message.includes('network')
  );
};

const toUserErrorMessage = (error: unknown) => {
  const message = getErrorMessage(error);
  const lower = message.toLowerCase();
  if (
    lower.includes('firestore/unavailable') ||
    lower.includes('unavailable') ||
    lower.includes('network')
  ) {
    return 'Firestore temporarily unavailable. Check internet and retry. If offline, wait and retry when network is back.';
  }
  return message;
};

const omitUndefinedDeep = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(item => omitUndefinedDeep(item)) as T;
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, raw]) => {
      if (raw === undefined) {
        return;
      }
      output[key] = omitUndefinedDeep(raw);
    });
    return output as T;
  }
  return value;
};

const isValidMonthKey = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

async function withFirestoreRetry<T>(operation: () => Promise<T>) {
  const retryDelaysMs = [0, 500, 1200, 2200];
  let lastError: unknown;
  for (const delayMs of retryDelaysMs) {
    if (delayMs > 0) {
      await new Promise<void>(resolve => setTimeout(() => resolve(), delayMs));
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientFirestoreError(error)) {
        throw error;
      }
      try {
        await firestore().disableNetwork();
      } catch {
        // best effort
      }
      try {
        await firestore().enableNetwork();
      } catch {
        // best effort
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Firestore unavailable.');
}

export const hrmsApi = createApi({
  reducerPath: 'hrmsApi',
  baseQuery: fakeBaseQuery<FirestoreError>(),
  tagTypes: ['Shops', 'Employees', 'Attendance', 'Salary', 'Dashboard', 'Reports', 'Settings', 'Biometric', 'Advance'],
  endpoints: builder => ({
    getShops: builder.query<Shop[], void>({
      async queryFn() {
        try {
          const snapshot = await shopsCol().orderBy('createdAt', 'desc').get();
          const data = snapshot.docs.map(doc => serialize<Shop>(doc.id, doc.data() as Omit<Shop, 'id'>));
          return { data };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Shops'],
    }),

    upsertShop: builder.mutation<Shop, ShopInput>({
      async queryFn(input) {
        try {
          const { id: incomingId, ...rest } = input;
          const id = incomingId ?? shopsCol().doc().id;
          const normalizedUsername = String(rest.username ?? '').trim();
          const normalizedEmail = String(rest.email ?? '').trim().toLowerCase();
          if (!normalizedUsername || !normalizedEmail) {
            return { error: { message: 'Username and email are required.' } };
          }

          const usernameSnap = await shopsCol().where('username', '==', normalizedUsername).limit(1).get();
          const usernameConflict = usernameSnap.docs.find(doc => doc.id !== id);
          if (usernameConflict) {
            return { error: { message: 'Shop username already exists.' } };
          }

          const emailSnap = await shopsCol().where('email', '==', normalizedEmail).limit(1).get();
          const emailConflict = emailSnap.docs.find(doc => doc.id !== id);
          if (emailConflict) {
            return { error: { message: 'Shop email already exists.' } };
          }

          const now = nowIso();
          const docRef = shopsCol().doc(id);
          const existing = await docRef.get();
          const existingData = (existing.data() as Partial<Shop> | undefined) ?? {};
          const existingEmail = String(existingData.email ?? '').trim().toLowerCase();
          const emailChanged = !!existingEmail && existingEmail !== normalizedEmail;

          const isCreate = !existing.exists();
          const hasBootstrap = typeof rest.bootstrapPassword === 'string' && rest.bootstrapPassword.trim().length > 0;
          const hasLegacyPassword = typeof rest.password === 'string' && rest.password.trim().length > 0;
          const incomingSecret = (rest.bootstrapPassword ?? rest.password ?? '').trim();
          if (isCreate && incomingSecret.length < 6) {
            return { error: { message: 'Initial login password must be at least 6 characters.' } };
          }

          const authStatus =
            rest.authProvisionStatus ??
            (rest.status === 'inactive'
              ? existingData.authProvisionStatus ?? 'pending'
              : rest.authUid || existingData.authUid
                ? existingData.authProvisionStatus ?? 'provisioned'
                : 'pending');

          const payload: Shop = {
            id,
            shopName: String(rest.shopName ?? '').trim(),
            address: String(rest.address ?? '').trim(),
            ownerName: String(rest.ownerName ?? '').trim(),
            contactNumber: String(rest.contactNumber ?? '').trim(),
            status: rest.status,
            createdByAdminUid: rest.createdByAdminUid,
            username: normalizedUsername,
            email: normalizedEmail,
            authUid: rest.authUid ?? existingData.authUid,
            authProvisionStatus: authStatus,
            authProvisionedAt: rest.authProvisionedAt ?? existingData.authProvisionedAt,
            authLastSyncedAt: rest.authLastSyncedAt ?? existingData.authLastSyncedAt,
            authLastError: rest.authLastError ?? existingData.authLastError,
            createdAt: existing.exists() ? (existing.data()?.createdAt ?? now) : now,
            updatedAt: now,
          };

          if (hasBootstrap) {
            payload.bootstrapPassword = incomingSecret;
            payload.authProvisionStatus = 'pending';
            payload.authLastError = '';
          } else if (emailChanged) {
            payload.authProvisionStatus = 'pending';
            payload.authLastError = '';
          } else if (hasLegacyPassword) {
            payload.password = incomingSecret;
            payload.authProvisionStatus = payload.authProvisionStatus ?? 'pending';
          } else if (existingData.bootstrapPassword) {
            payload.bootstrapPassword = existingData.bootstrapPassword;
          } else if (existingData.password) {
            payload.password = existingData.password;
          }

          const safePayload = omitUndefinedDeep(payload);
          logInfo('SHOP_UPSERT_REQUEST', {
            shopId: id,
            mode: isCreate ? 'create' : 'update',
            status: safePayload.status,
            hasAuthUid: !!safePayload.authUid,
          });

          await docRef.set(safePayload, { merge: true });

          await payrollSettingsDoc(id).set(
            {
              lateThreshold: 3,
              lateDeductionDays: 0.5,
              timezone: 'Asia/Kolkata',
            },
            { merge: true },
          );

          return { data: safePayload };
        } catch (error) {
          const errorRef = logError('SHOP_UPSERT_FAILED', error, {
            shopId: input.id ?? 'new',
            username: input.username,
            email: input.email,
          });
          return { error: { message: `${toUserErrorMessage(error)} (ref: ${errorRef})` } };
        }
      },
      invalidatesTags: ['Shops', 'Dashboard'],
    }),

    getShopById: builder.query<Shop | null, string>({
      async queryFn(shopId) {
        try {
          const snap = await shopDoc(shopId).get();
          if (!snap.exists()) {
            return { data: null };
          }
          return { data: serialize<Shop>(snap.id, snap.data() as Omit<Shop, 'id'>) };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Shops'],
    }),

    deleteShop: builder.mutation<{ ok: true }, string>({
      async queryFn(shopId) {
        try {
          await shopDoc(shopId).delete();
          return { data: { ok: true } };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      invalidatesTags: ['Shops', 'Dashboard'],
    }),

    getEmployees: builder.query<Employee[], string>({
      async queryFn(shopId) {
        try {
          const snapshot = await employeesCol(shopId).orderBy('createdAt', 'desc').get();
          const data = snapshot.docs.map(doc =>
            serialize<Employee>(doc.id, doc.data() as Omit<Employee, 'id'>),
          );
          return { data };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Employees'],
    }),

    upsertEmployee: builder.mutation<Employee, EmployeeInput>({
      async queryFn(input) {
        try {
          const { id: incomingId, ...rest } = input;
          const id = incomingId ?? employeesCol(input.shopId).doc().id;
          const now = nowIso();
          const docRef = employeesCol(rest.shopId).doc(id);

          const payload: Employee = {
            ...rest,
            id,
            createdAt: rest.createdAt ?? now,
            updatedAt: now,
          };

          await withFirestoreRetry(async () => {
            await docRef.set(payload, { merge: true });
          });
          return { data: payload };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Employees', 'Dashboard'],
    }),

    deleteEmployee: builder.mutation<{ ok: true }, { shopId: string; employeeId: string }>({
      async queryFn({ shopId, employeeId }) {
        try {
          await employeesCol(shopId).doc(employeeId).delete();
          return { data: { ok: true } };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      invalidatesTags: ['Employees', 'Dashboard'],
    }),

    getAttendanceByDate: builder.query<AttendanceRecord[], { shopId: string; date: string }>({
      async queryFn({ shopId, date }) {
        try {
          const snapshot = await attendanceCol(shopId).where('date', '==', date).get();
          const data = snapshot.docs.map(doc =>
            serialize<AttendanceRecord>(doc.id, doc.data() as Omit<AttendanceRecord, 'id'>),
          );
          return { data };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Attendance'],
    }),

    upsertBulkAttendance: builder.mutation<{ ok: true }, BulkAttendancePayload>({
      async queryFn(payload) {
        try {
          const batch = shopDoc(payload.shopId).firestore.batch();
          const now = nowIso();
          payload.records.forEach(record => {
            const id = `${record.employeeId}_${payload.date}`;
            const ref = attendanceCol(payload.shopId).doc(id);
            batch.set(
              ref,
              {
                id,
                employeeId: record.employeeId,
                shopId: payload.shopId,
                date: payload.date,
                status: record.status,
                source: record.source ?? 'manual',
                punchTime: record.punchTime ?? now,
                rawLogId: record.rawLogId ?? '',
                biometricDeviceId: record.biometricDeviceId ?? '',
                syncedAt: record.syncedAt ?? '',
                checkInTime: record.checkInTime ?? '',
                checkOutTime: record.checkOutTime ?? '',
                notes: record.notes ?? '',
                createdBy: payload.createdBy,
                createdAt: now,
                updatedAt: now,
              },
              { merge: true },
            );
          });
          await batch.commit();
          return { data: { ok: true } };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      invalidatesTags: ['Attendance', 'Reports', 'Salary', 'Dashboard'],
    }),

    generateMonthlySalary: builder.mutation<SalaryMonthly[], SalaryGeneratePayload>({
      async queryFn({ shopId, month, overtimeHoursByEmployeeId }) {
        try {
          if (!isValidMonthKey(month)) {
            return { error: { message: 'Invalid month format. Use YYYY-MM.' } };
          }
          if (month > currentMonth()) {
            return { error: { message: 'Cannot generate salary for a future month.' } };
          }
          const existingSalary = await withFirestoreRetry(async () => salaryCol(shopId).where('month', '==', month).get());
          if (!existingSalary.empty) {
            const existingRows = existingSalary.docs.map(doc => doc.data() as SalaryMonthly);
            const hasPaidRows = existingRows.some(row => !!row.salaryPaidAt);
            const canRepairZeroRows = existingRows.every(
              row => !row.salaryPaidAt && Number(row.netSalary ?? 0) === 0,
            );
            if (hasPaidRows) {
              return { error: { message: 'Salary already generated and paid entries exist for this month. Regeneration is blocked.' } };
            }
            if (!canRepairZeroRows) {
              return { error: { message: 'Salary already generated for this month. Generation is allowed once per month.' } };
            }
          }

          const payrollSnap = await withFirestoreRetry(async () => payrollSettingsDoc(shopId).get());
          const payroll = (payrollSnap.data() as PayrollSettings | undefined) ?? {
            lateThreshold: 3,
            lateDeductionDays: 0.5,
            timezone: 'Asia/Kolkata',
          };

          const employeesSnap = await withFirestoreRetry(async () =>
            employeesCol(shopId).where('status', '==', 'active').get(),
          );
          const employees = employeesSnap.docs.map(doc => doc.data() as Employee);
          if (employees.length === 0) {
            return { error: { message: 'No active staff found for salary generation.' } };
          }

          const { start, end } = monthDateRange(month);
          const [attendanceSnap, advancesSnap] = await Promise.all([
            withFirestoreRetry(async () =>
              attendanceCol(shopId).where('date', '>=', start).where('date', '<=', end).get(),
            ),
            withFirestoreRetry(async () => advancesCol(shopId).where('month', '==', month).get()),
          ]);

          const attendanceByEmployee = new Map<string, AttendanceRecord[]>();
          attendanceSnap.docs.forEach(doc => {
            const entry = doc.data() as AttendanceRecord;
            const existing = attendanceByEmployee.get(entry.employeeId) ?? [];
            existing.push(entry);
            attendanceByEmployee.set(entry.employeeId, existing);
          });
          const advanceByEmployee = new Map<string, number>();
          advancesSnap.docs.forEach(doc => {
            const entry = doc.data() as EmployeeAdvance;
            const existing = advanceByEmployee.get(entry.employeeId) ?? 0;
            advanceByEmployee.set(entry.employeeId, existing + Number(entry.amount || 0));
          });

          const batch = shopDoc(shopId).firestore.batch();
          const rows: SalaryMonthly[] = [];
          const generatedAt = nowIso();
          const totalDaysInSelectedMonth = daysInMonth(month);

          employees.forEach(employee => {
            const attendance = attendanceByEmployee.get(employee.id) ?? [];
            const presentDaysCount = attendance.filter(a => a.status === 'present').length;
            const absentDaysCount = attendance.filter(a => a.status === 'absent').length;
            const halfDaysCount = attendance.filter(a => a.status === 'half_day').length;
            const leaveDaysCount = attendance.filter(a => a.status === 'leave').length;
            const lateEntriesCount = attendance.filter(a => a.status === 'late').length;
            const hasAttendanceRows = attendance.length > 0;
            const payablePresentDays = hasAttendanceRows
              ? presentDaysCount + leaveDaysCount
              : totalDaysInSelectedMonth;
            const absentDays = hasAttendanceRows ? absentDaysCount : 0;
            const halfDays = hasAttendanceRows ? halfDaysCount : 0;
            const leaveDays = hasAttendanceRows ? leaveDaysCount : 0;
            const lateEntries = hasAttendanceRows ? lateEntriesCount : 0;
            const overtimeHours = Math.max(0, Number(overtimeHoursByEmployeeId?.[employee.id] ?? 0));
            const basicSalary = Math.max(0, Number(employee.basicSalary) || 0);
            const overtimeRatePerHour = Math.max(0, Number(employee.overtimeRatePerHour) || 0);

            const calc = calculateSalary({
              month,
              basicSalary,
              presentDays: payablePresentDays,
              absentDays,
              halfDays,
              lateEntries,
              overtimeHours,
              overtimeRatePerHour,
              lateThreshold: payroll.lateThreshold,
              lateDeductionDays: payroll.lateDeductionDays,
            });

            const id = `${employee.id}_${month}`;
            const grossSalary = calc.netSalary;
            const totalAdvance = Math.max(0, advanceByEmployee.get(employee.id) ?? 0);
            const advanceDeduction = Math.min(grossSalary, totalAdvance);
            const netSalary = Math.max(0, grossSalary - advanceDeduction);
            const salary: SalaryMonthly = {
              id,
              employeeId: employee.id,
              shopId,
              month,
              totalDaysInMonth: calc.totalDaysInMonth,
              presentDays: payablePresentDays,
              absentDays,
              halfDays,
              leaveDays,
              lateEntries,
              lateDeductionDays: calc.lateDeductionDays,
              payableDays: calc.payableDays,
              perDaySalary: calc.perDaySalary,
              overtimeHours,
              overtimeAmount: calc.overtimeAmount,
              grossSalary,
              advanceDeduction,
              netSalary,
              generatedAt,
            };

            batch.set(salaryCol(shopId).doc(id), salary, { merge: true });
            rows.push(salary);
          });

          await withFirestoreRetry(async () => batch.commit());
          return { data: rows };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      invalidatesTags: ['Salary', 'Reports', 'Dashboard', 'Advance'],
    }),

    getEmployeeAdvances: builder.query<EmployeeAdvance[], { shopId: string; month: string }>({
      async queryFn({ shopId, month }) {
        try {
          if (!isValidMonthKey(month)) {
            return { data: [] };
          }
          // Keep this query index-light. Some environments fail on where+orderBy composite indexes.
          const snapshot = await withFirestoreRetry(async () => advancesCol(shopId).where('month', '==', month).get());
          const data = snapshot.docs
            .map(doc => serialize<EmployeeAdvance>(doc.id, doc.data() as Omit<EmployeeAdvance, 'id'>))
            .sort((a, b) => {
              const paidAtDiff = String(b.paidAt ?? '').localeCompare(String(a.paidAt ?? ''));
              if (paidAtDiff !== 0) {
                return paidAtDiff;
              }
              return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
            });
          return { data };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      providesTags: ['Advance'],
    }),

    addEmployeeAdvance: builder.mutation<EmployeeAdvance, AdvanceEntryPayload>({
      async queryFn(input) {
        try {
          if (input.amount <= 0) {
            return { error: { message: 'Advance/Loan amount should be greater than zero.' } };
          }
          const now = nowIso();
          const id = advancesCol(input.shopId).doc().id;
          const payload: EmployeeAdvance = {
            id,
            shopId: input.shopId,
            employeeId: input.employeeId,
            month: input.month,
            amount: Number(input.amount),
            type: input.type,
            notes: input.notes?.trim() || '',
            paidAt: input.paidAt,
            createdBy: input.createdBy,
            createdAt: now,
            updatedAt: now,
          };
          await withFirestoreRetry(async () => {
            await advancesCol(input.shopId).doc(id).set(payload);
          });
          return { data: payload };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Advance', 'Reports', 'Salary'],
    }),

    getShifts: builder.query<ShiftMaster[], string>({
      async queryFn(shopId) {
        try {
          const snapshot = await withFirestoreRetry(async () => shiftsCol(shopId).get());
          const data = snapshot.docs
            .map(doc => serialize<ShiftMaster>(doc.id, doc.data() as Omit<ShiftMaster, 'id'>))
            .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
          return { data };
        } catch (error) {
          try {
            const cacheSnapshot = await shiftsCol(shopId).get({ source: 'cache' });
            const cacheData = cacheSnapshot.docs
              .map(doc => serialize<ShiftMaster>(doc.id, doc.data() as Omit<ShiftMaster, 'id'>))
              .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
            return { data: cacheData };
          } catch {
            return { error: { message: toUserErrorMessage(error) } };
          }
        }
      },
      providesTags: ['Settings'],
    }),

    upsertShift: builder.mutation<ShiftMaster, ShiftInput>({
      async queryFn(input) {
        try {
          const { id: incomingId, ...rest } = input;
          const id = incomingId ?? shiftsCol(input.shopId).doc().id;
          const now = nowIso();
          const docRef = shiftsCol(rest.shopId).doc(id);
          const payload: ShiftMaster = {
            ...rest,
            id,
            createdAt: rest.createdAt ?? now,
            updatedAt: now,
          };
          await withFirestoreRetry(async () => {
            await docRef.set(payload, { merge: true });
          });
          return { data: payload };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Settings', 'Reports'],
    }),

    getWeeklyShiftPlan: builder.query<WeeklyShiftPlan[], { shopId: string; weekStartDate: string }>({
      async queryFn({ shopId, weekStartDate }) {
        try {
          const snapshot = await weeklyShiftPlansCol(shopId).where('weekStartDate', '==', weekStartDate).get();
          const data = snapshot.docs.map(doc =>
            serialize<WeeklyShiftPlan>(doc.id, doc.data() as Omit<WeeklyShiftPlan, 'id'>),
          );
          return { data };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Settings'],
    }),

    upsertWeeklyShiftPlan: builder.mutation<WeeklyShiftPlan, WeeklyShiftPlanInput>({
      async queryFn(input) {
        try {
          const { id: incomingId, ...rest } = input;
          const generated = `${rest.employeeId}_${rest.weekStartDate}_${rest.dayOfWeek}`;
          const id = incomingId ?? generated;
          const now = nowIso();
          const docRef = weeklyShiftPlansCol(rest.shopId).doc(id);
          const payload: WeeklyShiftPlan = {
            ...rest,
            id,
            createdAt: rest.createdAt ?? now,
            updatedAt: now,
          };
          await withFirestoreRetry(async () => {
            await docRef.set(payload, { merge: true });
          });
          return { data: payload };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Settings', 'Reports'],
    }),

    getMonthlySalary: builder.query<SalaryMonthly[], { shopId: string; month: string }>({
      async queryFn({ shopId, month }) {
        try {
          if (!isValidMonthKey(month)) {
            return { data: [] };
          }
          const snapshot = await salaryCol(shopId).where('month', '==', month).get();
          const data = snapshot.docs
            .map(doc => serialize<SalaryMonthly>(doc.id, doc.data() as Omit<SalaryMonthly, 'id'>))
            .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
          return { data };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Salary'],
    }),

    markSalaryPaid: builder.mutation<{ ok: true }, { shopId: string; salaryId: string; paidBy: string }>({
      async queryFn({ shopId, salaryId, paidBy }) {
        try {
          const salaryRef = salaryCol(shopId).doc(salaryId);
          const existing = await withFirestoreRetry(async () => salaryRef.get());
          if (!existing.exists()) {
            return { error: { message: 'Salary row not found.' } };
          }
          if (existing.data()?.salaryPaidAt) {
            return { data: { ok: true } };
          }
          await withFirestoreRetry(async () => {
            await salaryRef.set(
              {
              salaryPaidAt: nowIso(),
              salaryPaidBy: paidBy,
              },
              { merge: true },
            );
          });
          return { data: { ok: true } };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      invalidatesTags: ['Salary'],
    }),

    getAdminDashboard: builder.query<AdminDashboard, void>({
      async queryFn() {
        try {
          const shopSnapshot = await shopsCol().get();
          const shops = shopSnapshot.docs.map(doc => doc.data() as Shop);
          const activeShops = shops.filter(s => s.status === 'active').length;

          const employeeCountPromises = shops.map(async shop => {
            const snap = await employeesCol(shop.id).get();
            return snap.size;
          });
          const counts = await Promise.all(employeeCountPromises);

          return {
            data: {
              totalShops: shops.length,
              activeShops,
              inactiveShops: shops.length - activeShops,
              totalEmployees: counts.reduce((sum, count) => sum + count, 0),
            },
          };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Dashboard'],
    }),

    getAdminAnalytics: builder.query<AdminAnalytics, void>({
      async queryFn() {
        try {
          const month = currentMonth();
          const date = todayDate();
          const trendMonths = Array.from({ length: 6 }, (_, index) =>
            dayjs().subtract(5 - index, 'month').format('YYYY-MM'),
          );
          const shopSnapshot = await shopsCol().get();
          const shops = shopSnapshot.docs.map(doc => doc.data() as Shop);
          const activeShops = shops.filter(shop => shop.status === 'active');

          const aggregates = await Promise.all(
            activeShops.map(async shop => {
              const [attendanceSnap, salarySnap] = await Promise.all([
                attendanceCol(shop.id).where('date', '==', date).get(),
                salaryCol(shop.id).where('month', '==', month).get(),
              ]);

              let present = 0;
              let absent = 0;
              let late = 0;
              let halfDay = 0;
              attendanceSnap.docs.forEach(doc => {
                const row = doc.data() as AttendanceRecord;
                if (row.status === 'present' || row.status === 'leave') {
                  present += 1;
                } else if (row.status === 'absent') {
                  absent += 1;
                } else if (row.status === 'late') {
                  late += 1;
                } else if (row.status === 'half_day') {
                  halfDay += 1;
                }
              });

              let monthlySalary = 0;
              salarySnap.docs.forEach(doc => {
                const row = doc.data() as SalaryMonthly;
                monthlySalary += row.netSalary;
              });

              return { present, absent, late, halfDay, monthlySalary };
            }),
          );

          const trendTotals: Record<string, number> = Object.fromEntries(trendMonths.map(m => [m, 0]));
          await Promise.all(
            activeShops.flatMap(shop =>
              trendMonths.map(async trendMonth => {
                const salarySnap = await salaryCol(shop.id).where('month', '==', trendMonth).get();
                let monthTotal = 0;
                salarySnap.docs.forEach(doc => {
                  const row = doc.data() as SalaryMonthly;
                  monthTotal += row.netSalary;
                });
                trendTotals[trendMonth] += monthTotal;
              }),
            ),
          );

          const totals = aggregates.reduce(
            (acc, item) => {
              acc.present += item.present;
              acc.absent += item.absent;
              acc.late += item.late;
              acc.halfDay += item.halfDay;
              acc.monthlySalaryPayout += item.monthlySalary;
              return acc;
            },
            { present: 0, absent: 0, late: 0, halfDay: 0, monthlySalaryPayout: 0 },
          );

          return {
            data: {
              todayAttendance: {
                present: totals.present,
                absent: totals.absent,
                late: totals.late,
                halfDay: totals.halfDay,
              },
              monthlySalaryPayout: Number(totals.monthlySalaryPayout.toFixed(2)),
              averageSalaryPerActiveShop:
                activeShops.length > 0 ? Number((totals.monthlySalaryPayout / activeShops.length).toFixed(2)) : 0,
              salaryTrend: trendMonths.map(trendMonth => ({
                month: trendMonth,
                total: Number((trendTotals[trendMonth] ?? 0).toFixed(2)),
              })),
            },
          };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Dashboard'],
    }),

    getShopDashboard: builder.query<ShopDashboard, { shopId: string; todayDate: string; month: string }>({
      async queryFn({ shopId, todayDate: selectedDate, month }) {
        try {
          const [employeeSnap, todayAttendanceSnap, salarySnap, advancesSnap] = await Promise.all([
            employeesCol(shopId).where('status', '==', 'active').get(),
            attendanceCol(shopId).where('date', '==', selectedDate).get(),
            salaryCol(shopId).where('month', '==', month).get(),
            advancesCol(shopId).where('month', '==', month).get(),
          ]);

          let monthlyNetSalary = 0;
          let lateEntriesThisMonth = 0;
          salarySnap.docs.forEach(doc => {
            const row = doc.data() as SalaryMonthly;
            monthlyNetSalary += row.netSalary;
            lateEntriesThisMonth += row.lateEntries;
          });

          let presentStaff = 0;
          let punchErrors = 0;
          todayAttendanceSnap.docs.forEach(doc => {
            const row = doc.data() as AttendanceRecord;
            if (isPresentLikeStatus(row.status)) {
              presentStaff += 1;
            }
            if (hasPunchError(row)) {
              punchErrors += 1;
            }
          });

          let currentMonthProjectedSalary = 0;
          employeeSnap.docs.forEach(doc => {
            const employee = doc.data() as Employee;
            currentMonthProjectedSalary += Number(employee.basicSalary || 0);
          });

          let advanceSalaryPaid = 0;
          advancesSnap.docs.forEach(doc => {
            const row = doc.data() as EmployeeAdvance;
            advanceSalaryPaid += Number(row.amount || 0);
          });

          return {
            data: {
              totalStaff: employeeSnap.size,
              presentStaff,
              punchErrors,
              todayDate: selectedDate,
              currentMonthProjectedSalary: Number(currentMonthProjectedSalary.toFixed(2)),
              advanceSalaryPaid: Number(advanceSalaryPaid.toFixed(2)),
              monthlyNetSalary: Number(monthlyNetSalary.toFixed(2)),
              lateEntriesThisMonth,
            },
          };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Dashboard'],
    }),

    getShopAnalytics: builder.query<ShopAnalytics, string>({
      async queryFn(shopId) {
        try {
          if (!shopId) {
            return {
              data: {
                todayBreakdown: { present: 0, late: 0, halfDay: 0, absent: 0 },
                attendanceTrend: [],
                salaryTrend: [],
                staffStatus: { active: 0, inactive: 0 },
              },
            };
          }

          const today = todayDate();
          const attendanceDays = Array.from({ length: 7 }, (_, idx) => dayjs(today).subtract(6 - idx, 'day'));
          const salaryMonths = Array.from({ length: 6 }, (_, idx) => dayjs(`${currentMonth()}-01`).subtract(5 - idx, 'month'));

          const [employeesSnap, todayAttendanceSnap] = await Promise.all([
            employeesCol(shopId).get(),
            attendanceCol(shopId).where('date', '==', today).get(),
          ]);

          let present = 0;
          let late = 0;
          let halfDay = 0;
          let absent = 0;
          todayAttendanceSnap.docs.forEach(doc => {
            const row = doc.data() as AttendanceRecord;
            if (row.status === 'present' || row.status === 'leave') {
              present += 1;
            } else if (row.status === 'late') {
              late += 1;
            } else if (row.status === 'half_day') {
              halfDay += 1;
            } else if (row.status === 'absent') {
              absent += 1;
            }
          });

          const attendanceTrend = await Promise.all(
            attendanceDays.map(async day => {
              const date = day.format('YYYY-MM-DD');
              const snap = await attendanceCol(shopId).where('date', '==', date).get();
              let attendance = 0;
              snap.docs.forEach(doc => {
                const row = doc.data() as AttendanceRecord;
                if (
                  row.status === 'present' ||
                  row.status === 'leave' ||
                  row.status === 'late' ||
                  row.status === 'half_day'
                ) {
                  attendance += 1;
                }
              });
              return { date, label: day.format('DD MMM'), attendance };
            }),
          );

          const salaryTrend = await Promise.all(
            salaryMonths.map(async month => {
              const monthKey = month.format('YYYY-MM');
              const snap = await salaryCol(shopId).where('month', '==', monthKey).get();
              let total = 0;
              snap.docs.forEach(doc => {
                const row = doc.data() as SalaryMonthly;
                total += row.netSalary;
              });
              return { month: monthKey, label: month.format('MMM'), total: Number(total.toFixed(2)) };
            }),
          );

          let active = 0;
          let inactive = 0;
          employeesSnap.docs.forEach(doc => {
            const row = doc.data() as Employee;
            if (row.status === 'active') {
              active += 1;
            } else {
              inactive += 1;
            }
          });

          return {
            data: {
              todayBreakdown: { present, late, halfDay, absent },
              attendanceTrend,
              salaryTrend,
              staffStatus: { active, inactive },
            },
          };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Dashboard', 'Attendance', 'Salary'],
    }),

    getAttendanceReport: builder.query<AttendanceRecord[], ReportFilter>({
      async queryFn({ shopId, fromDate, toDate }) {
        try {
          const snapshot = await attendanceCol(shopId)
            .where('date', '>=', fromDate)
            .where('date', '<=', toDate)
            .get();
          const data = snapshot.docs.map(doc =>
            serialize<AttendanceRecord>(doc.id, doc.data() as Omit<AttendanceRecord, 'id'>),
          );
          return { data };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Reports'],
    }),

    getSalaryReport: builder.query<SalaryMonthly[], { shopId: string; month: string }>({
      async queryFn({ shopId, month }) {
        try {
          const snapshot = await salaryCol(shopId).where('month', '==', month).get();
          const data = snapshot.docs.map(doc =>
            serialize<SalaryMonthly>(doc.id, doc.data() as Omit<SalaryMonthly, 'id'>),
          );
          return { data };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Reports', 'Salary'],
    }),

    getPayrollSettings: builder.query<PayrollSettings, string>({
      async queryFn(shopId) {
        try {
          const snap = await payrollSettingsDoc(shopId).get();
          const data = (snap.data() as PayrollSettings | undefined) ?? {
            lateThreshold: 3,
            lateDeductionDays: 0.5,
            timezone: 'Asia/Kolkata',
          };
          return { data };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Settings'],
    }),

    getBiometricSettings: builder.query<BiometricSettings, string>({
      async queryFn(shopId) {
        try {
          const snap = await biometricSettingsDoc(shopId).get();
          const data = (snap.data() as BiometricSettings | undefined) ?? {
            enabled: false,
            deviceName: '',
            deviceId: '',
            syncWindowMinutes: 5,
            integrationMode: 'pull_agent',
          };
          return { data };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Biometric'],
    }),

    upsertBiometricSettings: builder.mutation<{ ok: true }, { shopId: string; settings: BiometricSettings }>({
      async queryFn({ shopId, settings }) {
        try {
          await biometricSettingsDoc(shopId).set(settings, { merge: true });
          return { data: { ok: true } };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      invalidatesTags: ['Biometric'],
    }),

    upsertPayrollSettings: builder.mutation<{ ok: true }, { shopId: string; settings: PayrollSettings }>({
      async queryFn({ shopId, settings }) {
        try {
          await payrollSettingsDoc(shopId).set(settings, { merge: true });
          return { data: { ok: true } };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      invalidatesTags: ['Settings'],
    }),
  }),
});

export const {
  useGetShopsQuery,
  useUpsertShopMutation,
  useGetShopByIdQuery,
  useDeleteShopMutation,
  useGetEmployeesQuery,
  useUpsertEmployeeMutation,
  useDeleteEmployeeMutation,
  useGetAttendanceByDateQuery,
  useUpsertBulkAttendanceMutation,
  useGenerateMonthlySalaryMutation,
  useGetMonthlySalaryQuery,
  useGetEmployeeAdvancesQuery,
  useAddEmployeeAdvanceMutation,
  useGetShiftsQuery,
  useUpsertShiftMutation,
  useGetWeeklyShiftPlanQuery,
  useUpsertWeeklyShiftPlanMutation,
  useMarkSalaryPaidMutation,
  useGetAdminDashboardQuery,
  useGetAdminAnalyticsQuery,
  useGetShopDashboardQuery,
  useGetShopAnalyticsQuery,
  useGetAttendanceReportQuery,
  useGetSalaryReportQuery,
  useGetPayrollSettingsQuery,
  useUpsertPayrollSettingsMutation,
  useGetBiometricSettingsQuery,
  useUpsertBiometricSettingsMutation,
} = hrmsApi;
