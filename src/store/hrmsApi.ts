import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import dayjs from 'dayjs';
import type {
  AttendanceRecord,
  AttendanceSource,
  AttendanceStatus,
  BiometricSettings,
  Employee,
  PayrollSettings,
  SalaryMonthly,
  Shop,
} from '../types/models';
import {
  attendanceCol,
  biometricSettingsDoc,
  employeesCol,
  nowIso,
  payrollSettingsDoc,
  salaryCol,
  shopDoc,
  shopsCol,
} from '../services/firebase';
import { calculateSalary } from '../utils/salary';
import { currentMonth, monthDateRange, todayDate } from '../utils/date';

interface FirestoreError {
  message: string;
}

type ShopInput = Omit<Shop, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };
type EmployeeInput = Omit<Employee, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

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
  }[];
  createdBy: string;
}

interface SalaryGeneratePayload {
  shopId: string;
  month: string;
  overtimeHoursByEmployeeId?: Record<string, number>;
}

interface ReportFilter {
  shopId: string;
  fromDate: string;
  toDate: string;
}

interface ShopDashboard {
  totalStaff: number;
  todayAttendance: number;
  todayDate: string;
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

export const hrmsApi = createApi({
  reducerPath: 'hrmsApi',
  baseQuery: fakeBaseQuery<FirestoreError>(),
  tagTypes: ['Shops', 'Employees', 'Attendance', 'Salary', 'Dashboard', 'Reports', 'Settings', 'Biometric'],
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
          const normalizedUsername = rest.username.trim();
          const normalizedEmail = rest.email.trim().toLowerCase();

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
          const payload: Shop = {
            id,
            ...rest,
            username: normalizedUsername,
            email: normalizedEmail,
            createdAt: existing.exists() ? (existing.data()?.createdAt ?? now) : now,
            updatedAt: now,
          };
          await docRef.set(payload);

          await payrollSettingsDoc(id).set(
            {
              lateThreshold: 3,
              lateDeductionDays: 0.5,
              timezone: 'Asia/Kolkata',
            },
            { merge: true },
          );

          return { data: payload };
        } catch (error) {
          return { error: { message: (error as Error).message } };
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
          const existing = await docRef.get();

          const payload: Employee = {
            ...rest,
            id,
            createdAt: existing.exists() ? (existing.data()?.createdAt ?? now) : now,
            updatedAt: now,
          };

          await docRef.set(payload);
          return { data: payload };
        } catch (error) {
          return { error: { message: (error as Error).message } };
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
          const payrollSnap = await payrollSettingsDoc(shopId).get();
          const payroll = (payrollSnap.data() as PayrollSettings | undefined) ?? {
            lateThreshold: 3,
            lateDeductionDays: 0.5,
            timezone: 'Asia/Kolkata',
          };

          const employeesSnap = await employeesCol(shopId).where('status', '==', 'active').get();
          const employees = employeesSnap.docs.map(doc => doc.data() as Employee);

          const { start, end } = monthDateRange(month);
          const attendanceSnap = await attendanceCol(shopId)
            .where('date', '>=', start)
            .where('date', '<=', end)
            .get();

          const attendanceByEmployee = new Map<string, AttendanceRecord[]>();
          attendanceSnap.docs.forEach(doc => {
            const entry = doc.data() as AttendanceRecord;
            const existing = attendanceByEmployee.get(entry.employeeId) ?? [];
            existing.push(entry);
            attendanceByEmployee.set(entry.employeeId, existing);
          });

          const batch = shopDoc(shopId).firestore.batch();
          const rows: SalaryMonthly[] = [];

          employees.forEach(employee => {
            const attendance = attendanceByEmployee.get(employee.id) ?? [];
            const presentDays = attendance.filter(a => a.status === 'present').length;
            const absentDays = attendance.filter(a => a.status === 'absent').length;
            const halfDays = attendance.filter(a => a.status === 'half_day').length;
            const lateEntries = attendance.filter(a => a.status === 'late').length;
            const overtimeHours = overtimeHoursByEmployeeId?.[employee.id] ?? 0;

            const calc = calculateSalary({
              month,
              basicSalary: employee.basicSalary,
              presentDays,
              absentDays,
              halfDays,
              lateEntries,
              overtimeHours,
              overtimeRatePerHour: employee.overtimeRatePerHour,
              lateThreshold: payroll.lateThreshold,
              lateDeductionDays: payroll.lateDeductionDays,
            });

            const id = `${employee.id}_${month}`;
            const salary: SalaryMonthly = {
              id,
              employeeId: employee.id,
              shopId,
              month,
              totalDaysInMonth: calc.totalDaysInMonth,
              presentDays,
              absentDays,
              halfDays,
              lateEntries,
              lateDeductionDays: calc.lateDeductionDays,
              payableDays: calc.payableDays,
              perDaySalary: calc.perDaySalary,
              overtimeHours,
              overtimeAmount: calc.overtimeAmount,
              netSalary: calc.netSalary,
              generatedAt: nowIso(),
            };

            batch.set(salaryCol(shopId).doc(id), salary, { merge: true });
            rows.push(salary);
          });

          await batch.commit();
          return { data: rows };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      invalidatesTags: ['Salary', 'Reports', 'Dashboard'],
    }),

    getMonthlySalary: builder.query<SalaryMonthly[], { shopId: string; month: string }>({
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
      providesTags: ['Salary'],
    }),

    markSalaryPaid: builder.mutation<{ ok: true }, { shopId: string; salaryId: string; paidBy: string }>({
      async queryFn({ shopId, salaryId, paidBy }) {
        try {
          await salaryCol(shopId).doc(salaryId).set(
            {
              salaryPaidAt: nowIso(),
              salaryPaidBy: paidBy,
            },
            { merge: true },
          );
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
                if (row.status === 'present') {
                  present += 1;
                } else if (row.status === 'absent') {
                  absent += 1;
                } else if (row.status === 'late') {
                  late += 1;
                } else {
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
      async queryFn({ shopId, todayDate, month }) {
        try {
          const employeeSnap = await employeesCol(shopId).where('status', '==', 'active').get();
          const todayAttendanceSnap = await attendanceCol(shopId).where('date', '==', todayDate).get();
          const salarySnap = await salaryCol(shopId).where('month', '==', month).get();

          let monthlyNetSalary = 0;
          let lateEntriesThisMonth = 0;
          salarySnap.docs.forEach(doc => {
            const row = doc.data() as SalaryMonthly;
            monthlyNetSalary += row.netSalary;
            lateEntriesThisMonth += row.lateEntries;
          });

          return {
            data: {
              totalStaff: employeeSnap.size,
              todayAttendance: todayAttendanceSnap.size,
              todayDate,
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
            if (row.status === 'present') {
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
                if (row.status === 'present' || row.status === 'late' || row.status === 'half_day') {
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
