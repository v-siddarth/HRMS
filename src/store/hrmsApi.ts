import app from '@react-native-firebase/app';
import type { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react';
import dayjs from 'dayjs';
import type {
  AttendanceRecord,
  AttendanceSource,
  AttendanceStatus,
  BiometricSettings,
  EmployeeAdvance,
  Employee,
  GeoFencingSettings,
  HolidayCalendarEntry,
  LeaveRequest,
  PayrollSettings,
  SalaryMonthly,
  ShiftAssignmentMode,
  ShiftHistoryEntry,
  ShiftMaster,
  ShiftTemplate,
  StaffWeeklyShiftDay,
  Shop,
} from '../types/models';
import {
  attendanceCol,
  auth,
  advancesCol,
  biometricSettingsDoc,
  employeesCol,
  firestore,
  geoFencingSettingsDoc,
  holidaysCol,
  leavesCol,
  nowIso,
  payrollSettingsDoc,
  salaryCol,
  shopDoc,
  shopsCol,
  shiftHistoryCol,
  shiftsCol,
} from '../services/firebase';
import { calculateAttendanceAnalytics, type AttendanceAnalyticsOutput } from '../utils/attendanceAnalytics';
import { calculateSalary } from '../utils/salary';
import { currentMonth, daysInMonth, monthDateRange, todayDate } from '../utils/date';
import { buildShopLocationConfig, validateGeoFenceForAttendance, validateShopLocationConfig } from '../utils/geofencing';
import { findApprovedLeaveForDate, findHolidayForDate } from '../utils/leaveManagement';
import { logError, logInfo } from '../utils/logger';
import {
  buildShiftHistoryEntry,
  compareShiftDecisions,
  isWeeklyOffDate,
  resolveShiftDecisionForDate,
  weekdayIndexFromDate,
} from '../utils/shiftEngine';
import {
  createShopAuthUser,
  deleteOwnStaffAccountViaEndpoint,
  getDeletedShopAuthHint,
  provisionStaffAuthViaManager,
  registerStaffWithAuthViaManager,
  setStaffAuthDisabledViaManager,
} from '../services/authService';
import type { EmployeeAuthStatus, WeeklyOffDay } from '../types/models';

interface FirestoreError {
  message: string;
}

const FUNCTIONS_REGION = 'us-central1';
const DEFAULT_ALLOWED_EARLY_MINUTES = 30;
const DEFAULT_GEO_FENCING_SETTINGS: GeoFencingSettings = {
  enabled: false,
  location: null,
  accuracyBufferMeters: 20,
  allowAttendanceWhenLocationMissing: true,
  requireGpsAccuracyMeters: 100,
};
const SHOP_CHILD_COLLECTIONS = [
  'managers',
  'employees',
  'attendance',
  'salary',
  'advances',
  'shifts',
  'settings',
] as const;


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

interface ShiftTemplateInput {
  id?: string;
  shopId: string;
  name: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  graceTime: number;
  lateRuleMinutes: number;
  halfDayHours: number;
}

interface StaffWeeklyShiftDayInput {
  dayOfWeek: number;
  shiftId: string | null;
  isOff: boolean;
}

interface SaveStaffWeeklyShiftPlanInput {
  shopId: string;
  staffId: string;
  days: StaffWeeklyShiftDayInput[];
}

interface RotationPatternInput {
  weekIndex: number;
  shiftId: string | null;
  isOff?: boolean;
}

interface SaveAdvancedShiftPlanInput extends SaveStaffWeeklyShiftPlanInput {
  mode: ShiftAssignmentMode;
  fixedShiftId?: string | null;
  rotationStartDate?: string;
  rotationPattern?: RotationPatternInput[];
}

interface BulkAssignShiftPlanInput {
  shopId: string;
  staffIds: string[];
  plan: Omit<SaveAdvancedShiftPlanInput, 'shopId' | 'staffId'>;
}

interface ReportFilter {
  shopId: string;
  fromDate: string;
  toDate: string;
}

interface AttendanceAnalyticsFilter extends ReportFilter {
  staffId?: string;
}

interface ShopDashboard {
  totalStaff: number;
  presentStaff: number;
  punchErrors: number;
  todayDate: string;
  currentMonthProjectedSalary: number;
  advanceSalaryPaid: number;
  advancePaidCount: number;
  salaryPaidCount: number;
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

interface StaffContext {
  shopId: string;
  employeeId: string;
  uid: string;
  email: string;
}

interface StaffAttendanceSummary {
  todayRecord: AttendanceRecord | null;
  todayHours: number;
  month: string;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  halfDayCount: number;
  leaveCount: number;
  checkedInDays: number;
}

interface AttendanceActionResult {
  message: string;
  record: AttendanceRecord;
}

interface StaffSalaryOverview {
  month: string;
  salary: SalaryMonthly | null;
  advances: EmployeeAdvance[];
  totalAdvanceAmount: number;
  totalAdvanceDeduction: number;
  remainingPayableSalary: number;
}

interface StaffShiftOverview {
  weekStartDate: string;
  defaultShift: ShiftMaster | null;
  todayShift: ShiftMaster | null;
  weeklyOff: WeeklyOffDay;
  shifts: ShiftMaster[];
  weeklyAssignments: StaffWeeklyShiftDay[];
}

interface ProvisionEmployeeAuthInput {
  shopId: string;
  employeeId: string;
  loginEmail: string;
  password: string;
  displayName?: string;
}

interface RegisterEmployeeWithAuthInput {
  shopId: string;
  employee: EmployeeInput;
  loginEmail: string;
  password: string;
}

const serialize = <T extends { id: string }>(id: string, data: Omit<T, 'id'>): T =>
  ({ id, ...data }) as T;

async function findAttendanceRecord(shopId: string, employeeId: string, date: string): Promise<AttendanceRecord | null> {
  const snapshot = await withFirestoreRetry(async () =>
    attendanceCol(shopId)
      .where('employeeId', '==', employeeId)
      .where('date', '==', date)
      .limit(1)
      .get(),
  );

  const doc = snapshot.docs[0];
  return doc ? serialize<AttendanceRecord>(doc.id, doc.data() as Omit<AttendanceRecord, 'id'>) : null;
}

async function findSalaryRecord(shopId: string, employeeId: string, month: string): Promise<SalaryMonthly | null> {
  const snapshot = await withFirestoreRetry(async () =>
    salaryCol(shopId)
      .where('employeeId', '==', employeeId)
      .where('month', '==', month)
      .limit(1)
      .get(),
  );

  const doc = snapshot.docs[0];
  return doc ? serialize<SalaryMonthly>(doc.id, doc.data() as Omit<SalaryMonthly, 'id'>) : null;
}

const normalizeGeoFencingSettings = (shopId: string, rawValue: unknown): GeoFencingSettings => {
  const raw = (rawValue ?? {}) as Record<string, unknown>;
  const rawLocation = (raw.location ?? raw.shopLocation ?? null) as Record<string, unknown> | null;
  const locationValidation = rawLocation
    ? validateShopLocationConfig({
        shopId,
        latitude: Number(rawLocation.latitude),
        longitude: Number(rawLocation.longitude),
        radius: Number(rawLocation.radius),
      })
    : null;
  const location = rawLocation && locationValidation?.ok
    ? buildShopLocationConfig({
        shopId,
        latitude: Number(rawLocation.latitude),
        longitude: Number(rawLocation.longitude),
        radius: Number(rawLocation.radius),
        updatedAt: String(rawLocation.updatedAt ?? rawLocation.updated_at ?? nowIso()),
      })
    : null;

  return {
    enabled: Boolean(raw.enabled ?? DEFAULT_GEO_FENCING_SETTINGS.enabled),
    location,
    accuracyBufferMeters: Math.max(
      0,
      Number(raw.accuracyBufferMeters ?? raw.accuracy_buffer_meters ?? DEFAULT_GEO_FENCING_SETTINGS.accuracyBufferMeters),
    ),
    allowAttendanceWhenLocationMissing: Boolean(
      raw.allowAttendanceWhenLocationMissing
      ?? raw.allow_attendance_when_location_missing
      ?? DEFAULT_GEO_FENCING_SETTINGS.allowAttendanceWhenLocationMissing,
    ),
    requireGpsAccuracyMeters: Number(
      raw.requireGpsAccuracyMeters
      ?? raw.require_gps_accuracy_meters
      ?? DEFAULT_GEO_FENCING_SETTINGS.requireGpsAccuracyMeters,
    ),
  };
};

const hasSnapshotDocs = (
  snapshot: FirebaseFirestoreTypes.QuerySnapshot<FirebaseFirestoreTypes.DocumentData> | null | undefined,
): snapshot is FirebaseFirestoreTypes.QuerySnapshot<FirebaseFirestoreTypes.DocumentData> =>
  !!snapshot && Array.isArray(snapshot.docs);

const hasSnapshotExistsMethod = (
  snapshot: FirebaseFirestoreTypes.DocumentSnapshot<FirebaseFirestoreTypes.DocumentData> | null | undefined,
): snapshot is FirebaseFirestoreTypes.DocumentSnapshot<FirebaseFirestoreTypes.DocumentData> =>
  !!snapshot && typeof snapshot.exists === 'function';

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
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeCode === 'string') {
      return maybeCode;
    }
    const maybeDetails = (error as { details?: unknown }).details;
    if (typeof maybeDetails === 'string') {
      return maybeDetails;
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

const isPermissionDeniedError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('permission-denied') || message.includes('permission denied');
};

const logSnapshotListenerError = (listenerName: string, error: unknown) => {
  if (isPermissionDeniedError(error)) {
    logInfo(`${listenerName}_PERMISSION_DENIED`, {
      note: 'Ignored during auth role/session transition.',
    });
    return;
  }

  logError(`${listenerName}_FAILED`, error);
};

const toUserErrorMessage = (error: unknown) => {
  const message = getErrorMessage(error);
  const lower = message.toLowerCase();
  if (lower.includes('firestore/failed-precondition') || lower.includes('requires an index')) {
    return 'Firestore index is still building for this view. Please wait a bit and reopen the screen.';
  }
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

const employeeBlankDeleteFields = [
  'loginEmail',
  'addressLine1',
  'organization',
  'aadhaarNo',
  'biometricUserId',
  'biometricRegisteredAt',
  'defaultShiftId',
  'authUid',
  'authProvisionedAt',
  'authDisabledAt',
  'lastLoginAt',
  'authLastError',
  'activatedAt',
  'deactivatedAt',
] as const;

const withEmployeeFieldCleanup = <T extends object>(payload: T) => {
  const cleaned = omitUndefinedDeep(payload) as unknown as Record<string, unknown>;
  employeeBlankDeleteFields.forEach(field => {
    const current = cleaned[field];
    if (typeof current === 'string' && !current.trim()) {
      cleaned[field] = firestore.FieldValue.delete();
    }
  });
  return cleaned;
};

const isMissingFirestoreIndexError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('firestore/failed-precondition') || message.includes('requires an index');
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const getCurrentStaffContext = async (): Promise<StaffContext> => {
  const currentUser = auth().currentUser;
  if (!currentUser?.uid) {
    throw new Error('Session expired. Please login again.');
  }

  let tokenResult = await currentUser.getIdTokenResult();
  let role = String(tokenResult.claims.role ?? '');
  let shopId = String(tokenResult.claims.shopId ?? '');
  let employeeId = String(tokenResult.claims.employeeId ?? '');

  if (role !== 'staff' || !shopId || !employeeId) {
    tokenResult = await currentUser.getIdTokenResult(true);
    role = String(tokenResult.claims.role ?? '');
    shopId = String(tokenResult.claims.shopId ?? '');
    employeeId = String(tokenResult.claims.employeeId ?? '');
  }

  if (role !== 'staff' || !shopId || !employeeId) {
    const shopsSnapshot = await shopsCol().get();
    for (const shopDocSnap of shopsSnapshot.docs) {
      const employeeSnapshot = await employeesCol(shopDocSnap.id).where('authUid', '==', currentUser.uid).limit(1).get();
      if (employeeSnapshot.empty) {
        continue;
      }

      const employeeDocSnap = employeeSnapshot.docs[0];
      return {
        uid: currentUser.uid,
        email: currentUser.email ?? '',
        shopId: shopDocSnap.id,
        employeeId: employeeDocSnap.id,
      };
    }
    throw new Error('Staff session is not linked properly. Please login again.');
  }

  return {
    uid: currentUser.uid,
    email: currentUser.email ?? '',
    shopId,
    employeeId,
  };
};

const timeStringToMinutes = (value?: string) => {
  const normalized = String(value ?? '').trim();
  const match = /^(\d{2}):(\d{2})$/.exec(normalized);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
};

const calculateWorkedHours = (checkInTime?: string, checkOutTime?: string) => {
  const inMinutes = timeStringToMinutes(checkInTime);
  const outMinutes = timeStringToMinutes(checkOutTime);
  if (inMinutes === null || outMinutes === null) {
    return 0;
  }

  let diffMinutes = outMinutes - inMinutes;
  if (diffMinutes < 0) {
    diffMinutes += 24 * 60;
  }
  if (diffMinutes <= 0) {
    return 0;
  }

  return Number((diffMinutes / 60).toFixed(2));
};

const isValidMonthKey = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

async function deleteCollectionBatchedClient(collectionRef: FirebaseFirestoreTypes.CollectionReference, batchSize = 250) {
  while (true) {
    const snapshot = await collectionRef.limit(batchSize).get();
    if (snapshot.empty) {
      break;
    }
    const batch = firestore().batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    if (snapshot.size < batchSize) {
      break;
    }
  }
}

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

const parseShiftTimeToMinutes = (value: string) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? '').trim());
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
};

const calculateShiftDurationHours = (startTime: string, endTime: string) => {
  const start = parseShiftTimeToMinutes(startTime);
  const end = parseShiftTimeToMinutes(endTime);
  if (start === null || end === null) {
    return 0;
  }
  let diffMinutes = end - start;
  if (diffMinutes < 0) {
    diffMinutes += 24 * 60;
  }
  if (diffMinutes <= 0) {
    return 0;
  }
  return Number((diffMinutes / 60).toFixed(2));
};

const buildFunctionsEndpoint = (endpointName: string, query?: Record<string, string | number | undefined | null>) => {
  const projectId = String(app.app().options.projectId ?? '').trim();
  if (!projectId) {
    throw new Error('Firebase project ID is missing.');
  }

  const queryString = query
    ? Object.entries(query)
        .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join('&')
    : '';

  const baseUrl = `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/${endpointName}`;
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
};

async function callManagerEndpoint<T>({
  endpointName,
  method = 'GET',
  query,
  body,
}: {
  endpointName: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | undefined | null>;
  body?: Record<string, unknown>;
}): Promise<T> {
  const token = await auth().currentUser?.getIdToken(true);
  if (!token) {
    throw new Error('Session expired. Please login again.');
  }

  const response = await fetch(buildFunctionsEndpoint(endpointName, query), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    data?: T;
  };

  if (!response.ok || !payload.ok) {
    throw new Error(payload?.message || 'Request failed.');
  }

  if (payload.data === undefined) {
    throw new Error('Malformed server response.');
  }

  return payload.data;
}

const isFunctionsEndpointUnavailable = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('request failed') ||
    message.includes('network request failed') ||
    message.includes('not found') ||
    message.includes('failed to fetch') ||
    message.includes('functions') ||
    message.includes('html') ||
    message.includes('malformed server response')
  );
};

const normalizeShiftNameClient = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const normalizeNullableShiftId = (value: string | null | undefined) => {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized : null;
};

const shiftTemplateToFirestoreShape = (input: ShiftTemplate) => ({
  id: input.id,
  shop_id: input.shopId,
  name: input.name,
  name_normalized: normalizeShiftNameClient(input.name),
  start_time: input.startTime,
  end_time: input.endTime,
  duration_hours: input.durationHours,
  grace_time: input.graceTime,
  late_rule_minutes: input.lateRuleMinutes,
  half_day_hours: input.halfDayHours,
  created_at: input.createdAt,
  updated_at: input.updatedAt,
});

const weeklyShiftDayToFirestoreShape = (input: StaffWeeklyShiftDay) => ({
  id: input.id,
  shop_id: input.shopId,
  staff_id: input.staffId,
  day_of_week: input.dayOfWeek,
  shift_id: normalizeNullableShiftId(input.shiftId),
  is_off: input.isOff,
  created_at: input.createdAt,
  updated_at: input.updatedAt,
});

const parseStaffWeeklyShiftDays = (rawValue: unknown, shopId: string, staffId: string): StaffWeeklyShiftDay[] => {
  if (!Array.isArray(rawValue)) {
    return [];
  }

  return rawValue
    .map((entry, index) => {
      const raw = (entry ?? {}) as Record<string, unknown>;
      return mapStaffWeeklyShiftDay({
        id: String(raw.id ?? `${staffId}_${Number(raw.day_of_week ?? raw.dayOfWeek ?? index)}`),
        shop_id: String(raw.shop_id ?? raw.shopId ?? shopId),
        staff_id: String(raw.staff_id ?? raw.staffId ?? staffId),
        day_of_week: Number(raw.day_of_week ?? raw.dayOfWeek ?? index),
        shift_id: raw.shift_id ? String(raw.shift_id) : raw.shiftId ? String(raw.shiftId) : null,
        is_off: Boolean(raw.is_off ?? raw.isOff),
        created_at: String(raw.created_at ?? raw.createdAt ?? ''),
        updated_at: String(raw.updated_at ?? raw.updatedAt ?? ''),
      });
    })
    .filter(item => Number.isInteger(item.dayOfWeek) && item.dayOfWeek >= 0 && item.dayOfWeek <= 6)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
};

const normalizeEmployeeSchedulingFields = (employee: Employee, raw?: Record<string, unknown>): Employee => {
  const source = raw ?? (employee as unknown as Record<string, unknown>);
  const shiftModeRaw = String(source.shift_mode ?? source.shiftMode ?? employee.shiftMode ?? '').toLowerCase();
  const shiftMode: ShiftAssignmentMode = shiftModeRaw === 'fixed' || shiftModeRaw === 'rotational' ? shiftModeRaw : 'dynamic';
  const rotationPatternRaw = source.rotation_pattern ?? source.rotationPattern;
  const shiftOverridesRaw = source.shift_overrides ?? source.shiftOverrides;
  const weeklyOffConfigRaw = (source.weekly_off_config ?? source.weeklyOffConfig ?? null) as Record<string, unknown> | null;

  return {
    ...employee,
    shiftMode,
    rotationStartDate: String(source.rotation_start_date ?? source.rotationStartDate ?? employee.rotationStartDate ?? ''),
    rotationPattern: Array.isArray(rotationPatternRaw)
      ? rotationPatternRaw
          .map((item, index) => {
            const rawItem = (item ?? {}) as Record<string, unknown>;
            return {
              weekIndex: Number(rawItem.week_index ?? rawItem.weekIndex ?? index),
              shiftId: rawItem.shift_id ? String(rawItem.shift_id) : rawItem.shiftId ? String(rawItem.shiftId) : null,
              isOff: Boolean(rawItem.is_off ?? rawItem.isOff),
            };
          })
          .filter(item => Number.isInteger(item.weekIndex) && item.weekIndex >= 0)
      : employee.rotationPattern ?? [],
    shiftOverrides: Array.isArray(shiftOverridesRaw)
      ? shiftOverridesRaw.map(item => {
          const rawItem = (item ?? {}) as Record<string, unknown>;
          return {
            date: String(rawItem.date ?? ''),
            shiftId: rawItem.shift_id ? String(rawItem.shift_id) : rawItem.shiftId ? String(rawItem.shiftId) : null,
            isOff: Boolean(rawItem.is_off ?? rawItem.isOff),
            note: String(rawItem.note ?? rawItem.notes ?? ''),
            createdAt: String(rawItem.created_at ?? rawItem.createdAt ?? ''),
            updatedAt: String(rawItem.updated_at ?? rawItem.updatedAt ?? ''),
          };
        })
      : employee.shiftOverrides ?? [],
    weeklyOffConfig: weeklyOffConfigRaw
      ? {
          daysOfWeek: Array.isArray(weeklyOffConfigRaw.days_of_week ?? weeklyOffConfigRaw.daysOfWeek)
            ? ((weeklyOffConfigRaw.days_of_week ?? weeklyOffConfigRaw.daysOfWeek) as unknown[])
                .map(item => String(item).toLowerCase())
                .filter(item => item !== 'none') as Array<Exclude<WeeklyOffDay, 'none'>>
            : employee.weeklyOff && employee.weeklyOff !== 'none'
              ? [employee.weeklyOff]
              : [],
          monthlyRules: Array.isArray(weeklyOffConfigRaw.monthly_rules ?? weeklyOffConfigRaw.monthlyRules)
            ? ((weeklyOffConfigRaw.monthly_rules ?? weeklyOffConfigRaw.monthlyRules) as unknown[])
                .map(item => {
                  const rawItem = (item ?? {}) as Record<string, unknown>;
                  return {
                    weekOrdinal: Number(rawItem.week_ordinal ?? rawItem.weekOrdinal ?? 0) as 1 | 2 | 3 | 4 | 5 | -1,
                    dayOfWeek: String(rawItem.day_of_week ?? rawItem.dayOfWeek ?? 'mon').toLowerCase() as Exclude<WeeklyOffDay, 'none'>,
                  };
                })
                .filter(item => Number.isInteger(item.weekOrdinal))
            : employee.weeklyOffConfig?.monthlyRules ?? [],
          allowAttendanceOnOffDay: Boolean(
            weeklyOffConfigRaw.allow_attendance_on_off_day
            ?? weeklyOffConfigRaw.allowAttendanceOnOffDay
            ?? employee.weeklyOffConfig?.allowAttendanceOnOffDay,
          ),
        }
      : employee.weeklyOffConfig,
  };
};

const mapShiftTemplate = (item: {
  id: string;
  shop_id: string;
  name: string;
  start_time: string;
  end_time: string;
  duration_hours?: number;
  allowed_early_minutes?: number;
  grace_time: number;
  late_rule_minutes: number;
  half_day_hours: number;
  created_at: string;
  updated_at: string;
}): ShiftTemplate => ({
  id: item.id,
  shopId: item.shop_id,
  name: item.name,
  startTime: item.start_time,
  endTime: item.end_time,
  durationHours: Number(item.duration_hours ?? calculateShiftDurationHours(item.start_time, item.end_time) ?? 8),
  allowedEarlyMinutes: item.allowed_early_minutes === undefined ? undefined : Number(item.allowed_early_minutes),
  graceTime: Number(item.grace_time ?? 0),
  lateRuleMinutes: Number(item.late_rule_minutes ?? 0),
  halfDayHours: Number(item.half_day_hours ?? 0),
  createdAt: item.created_at,
  updatedAt: item.updated_at,
});

const toShiftMaster = (item: ShiftTemplate): ShiftMaster => ({
  id: item.id,
  shopId: item.shopId,
  name: item.name,
  startTime: item.startTime,
  endTime: item.endTime,
  durationHours: item.durationHours,
  active: true,
  allowedEarlyMinutes: item.allowedEarlyMinutes,
  graceTime: item.graceTime,
  lateRuleMinutes: item.lateRuleMinutes,
  halfDayHours: item.halfDayHours,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const mapStaffWeeklyShiftDay = (item: {
  id: string;
  shop_id: string;
  staff_id: string;
  day_of_week: number;
  shift_id: string | null;
  is_off: boolean;
  created_at: string;
  updated_at: string;
}): StaffWeeklyShiftDay => ({
  id: item.id,
  shopId: item.shop_id,
  staffId: item.staff_id,
  dayOfWeek: Number(item.day_of_week),
  shiftId: item.shift_id ?? null,
  isOff: Boolean(item.is_off),
  createdAt: item.created_at,
  updatedAt: item.updated_at,
});

const buildShiftWindow = (assignmentDate: string, shift: ShiftTemplate) => {
  const start = dayjs(`${assignmentDate}T${shift.startTime}`);
  let end = dayjs(`${assignmentDate}T${shift.endTime}`);
  if (!start.isValid() || !end.isValid()) {
    return null;
  }
  if (!end.isAfter(start)) {
    end = end.add(1, 'day');
  }
  return { start, end };
};

const formatAttendanceClock = (value: dayjs.Dayjs) => value.format('HH:mm');
type AssignedShiftContext =
  | {
      ok: true;
      date: string;
      shift: ShiftTemplate;
      assignment: StaffWeeklyShiftDay;
      mode: ShiftAssignmentMode;
      isOff: boolean;
      leave: LeaveRequest | null;
      holiday: HolidayCalendarEntry | null;
    }
  | { ok: false; message: string };

async function listStaffWeeklyShiftDays(shopId: string, employeeId: string): Promise<StaffWeeklyShiftDay[]> {
  const snapshot = await withFirestoreRetry(async () => employeesCol(shopId).doc(employeeId).get());
  if (!hasSnapshotExistsMethod(snapshot) || !snapshot.exists()) {
    return [];
  }
  const raw = (snapshot.data() ?? {}) as Record<string, unknown>;
  return parseStaffWeeklyShiftDays(raw.weekly_shift_assignments ?? raw.weeklyShiftAssignments, shopId, employeeId);
}

async function getEmployeeById(shopId: string, employeeId: string): Promise<Employee | null> {
  const snapshot = await withFirestoreRetry(async () => employeesCol(shopId).doc(employeeId).get());
  if (!hasSnapshotExistsMethod(snapshot) || !snapshot.exists()) {
    return null;
  }
  const raw = (snapshot.data() ?? {}) as Record<string, unknown>;
  return normalizeEmployeeSchedulingFields(serialize<Employee>(snapshot.id, raw as Omit<Employee, 'id'>), raw);
}

async function listApprovedLeavesForStaff(shopId: string, employeeId: string): Promise<LeaveRequest[]> {
  const snapshot = await withFirestoreRetry(async () =>
    leavesCol(shopId).where('staffId', '==', employeeId).where('status', '==', 'approved').get(),
  );
  return snapshot.docs.map(doc => serialize<LeaveRequest>(doc.id, doc.data() as Omit<LeaveRequest, 'id'>));
}

async function listHolidayEntries(shopId: string): Promise<HolidayCalendarEntry[]> {
  const snapshot = await withFirestoreRetry(async () => holidaysCol(shopId).get());
  return snapshot.docs.map(doc => serialize<HolidayCalendarEntry>(doc.id, doc.data() as Omit<HolidayCalendarEntry, 'id'>));
}

async function getShiftTemplateById(shopId: string, shiftId: string): Promise<ShiftTemplate | null> {
  const snap = await withFirestoreRetry(async () => shiftsCol(shopId).doc(shiftId).get());
  if (!hasSnapshotExistsMethod(snap) || !snap.exists()) {
    return null;
  }
  const raw = (snap.data() ?? {}) as Record<string, unknown>;
  return mapShiftTemplate({
    id: snap.id,
    shop_id: String(raw.shop_id ?? shopId),
    name: String(raw.name ?? ''),
    start_time: String(raw.start_time ?? raw.startTime ?? ''),
    end_time: String(raw.end_time ?? raw.endTime ?? ''),
    duration_hours: Number(raw.duration_hours ?? raw.durationHours ?? 0),
    grace_time: Number(raw.grace_time ?? raw.graceTime ?? 0),
    late_rule_minutes: Number(raw.late_rule_minutes ?? raw.lateRuleMinutes ?? 0),
    half_day_hours: Number(raw.half_day_hours ?? raw.halfDayHours ?? 0),
    created_at: String(raw.created_at ?? raw.createdAt ?? ''),
    updated_at: String(raw.updated_at ?? raw.updatedAt ?? ''),
  });
}

async function resolveAssignedShiftContext(shopId: string, employeeId: string, now = dayjs()): Promise<AssignedShiftContext> {
  const [employee, weeklyDays, approvedLeaves, holidays] = await Promise.all([
    getEmployeeById(shopId, employeeId),
    listStaffWeeklyShiftDays(shopId, employeeId),
    listApprovedLeavesForStaff(shopId, employeeId),
    listHolidayEntries(shopId),
  ]);

  if (!employee) {
    return { ok: false, message: 'Staff profile not found.' };
  }
  if (!weeklyDays.length && !employee.defaultShiftId && !(employee.rotationPattern?.length)) {
    return { ok: false, message: 'Shift not assigned' };
  }

  const todayDateValue = now.format('YYYY-MM-DD');
  const yesterdayDateValue = now.subtract(1, 'day').format('YYYY-MM-DD');
  const todayDecision = resolveShiftDecisionForDate({ date: todayDateValue, employee, weeklyAssignments: weeklyDays });
  const yesterdayDecision = resolveShiftDecisionForDate({ date: yesterdayDateValue, employee, weeklyAssignments: weeklyDays });
  const todayLeave = findApprovedLeaveForDate(employeeId, todayDateValue, approvedLeaves);
  const todayHoliday = findHolidayForDate(todayDateValue, holidays);

  if (todayHoliday) {
    return { ok: false, message: 'Today is Holiday' };
  }
  if (todayLeave) {
    return { ok: false, message: 'Approved leave exists for today.' };
  }
  if (todayDecision.isOff && !(employee.weeklyOffConfig?.allowAttendanceOnOffDay)) {
    return { ok: false, message: 'Today is Off Day' };
  }

  if (!yesterdayDecision.isOff && yesterdayDecision.shiftId) {
    const yesterdayShift = await getShiftTemplateById(shopId, yesterdayDecision.shiftId);
    const yesterdayWindow = yesterdayShift ? buildShiftWindow(yesterdayDateValue, yesterdayShift) : null;
    if (yesterdayShift && yesterdayWindow && now.isBefore(yesterdayWindow.end)) {
      return {
        ok: true,
        date: yesterdayDateValue,
        shift: yesterdayShift,
        assignment: {
          id: `${employeeId}_${weekdayIndexFromDate(yesterdayDateValue)}`,
          shopId,
          staffId: employeeId,
          dayOfWeek: weekdayIndexFromDate(yesterdayDateValue),
          shiftId: yesterdayDecision.shiftId,
          isOff: false,
          createdAt: '',
          updatedAt: '',
        },
        mode: yesterdayDecision.mode,
        isOff: false,
        leave: null,
        holiday: null,
      };
    }
  }

  if (!todayDecision.shiftId) {
    return { ok: false, message: 'Shift not assigned' };
  }

  const todayShift = await getShiftTemplateById(shopId, todayDecision.shiftId);
  if (!todayShift) {
    return { ok: false, message: 'Assigned shift no longer exists.' };
  }

  return {
    ok: true,
    date: todayDateValue,
    shift: todayShift,
    assignment: {
      id: `${employeeId}_${weekdayIndexFromDate(todayDateValue)}`,
      shopId,
      staffId: employeeId,
      dayOfWeek: weekdayIndexFromDate(todayDateValue),
      shiftId: todayDecision.shiftId,
      isOff: todayDecision.isOff,
      createdAt: '',
      updatedAt: '',
    },
    mode: todayDecision.mode,
    isOff: todayDecision.isOff,
    leave: todayLeave,
    holiday: todayHoliday,
  };
}

function getInitialAttendanceStatus(now: dayjs.Dayjs, assignmentDate: string, shift: ShiftTemplate) {
  const window = buildShiftWindow(assignmentDate, shift);
  if (!window) {
    throw new Error('Assigned shift timing is invalid.');
  }

  const allowedEarlyMinutes = Number(shift.allowedEarlyMinutes ?? DEFAULT_ALLOWED_EARLY_MINUTES);
  const earlyAllowedAt = window.start.subtract(allowedEarlyMinutes, 'minute');
  const graceEndsAt = window.start.add(Number(shift.graceTime ?? 0), 'minute');
  const halfDayAt = window.start.add(Number(shift.halfDayHours ?? 0) * 60, 'minute');

  if (now.isBefore(earlyAllowedAt)) {
    return { blocked: true, message: 'Check-in is not allowed yet.', status: null as AttendanceStatus | null, lateFlag: false };
  }
  if (!now.isBefore(window.end)) {
    return { blocked: true, message: 'Shift has already ended for today.', status: null as AttendanceStatus | null, lateFlag: false };
  }
  if (Number(shift.halfDayHours ?? 0) > 0 && now.isAfter(halfDayAt)) {
    return { blocked: false, message: '', status: 'half_day' as AttendanceStatus, lateFlag: true };
  }
  if (now.isAfter(graceEndsAt)) {
    return { blocked: false, message: '', status: 'late' as AttendanceStatus, lateFlag: true };
  }
  return { blocked: false, message: '', status: 'present' as AttendanceStatus, lateFlag: false };
}

function calculateFinalAttendanceStatus(input: { workingHours: number; shift: ShiftTemplate; lateFlag: boolean }): AttendanceStatus {
  const fullDayHours = Number(input.shift.durationHours ?? 0);
  const halfDayHours = Number(input.shift.halfDayHours ?? 0);
  if (fullDayHours > 0 && input.workingHours >= fullDayHours) {
    return input.lateFlag ? 'late' : 'present';
  }
  if (halfDayHours > 0 && input.workingHours >= halfDayHours) {
    return 'half_day';
  }
  return 'absent';
}

function calculateShiftlessAttendanceStatus(record: AttendanceRecord, workingHours: number): AttendanceStatus {
  if (record.status === 'holiday' || record.status === 'leave' || record.status === 'week_off') {
    return record.status;
  }
  if (workingHours <= 0) {
    return 'absent';
  }
  if (workingHours < 4) {
    return 'half_day';
  }
  return record.lateFlag ? 'late' : 'present';
}

async function syncStaffAttendanceForDate(shopId: string, employeeId: string, date: string, now = dayjs()) {
  const [employee, weeklyDays, approvedLeaves, holidays] = await Promise.all([
    getEmployeeById(shopId, employeeId),
    listStaffWeeklyShiftDays(shopId, employeeId),
    listApprovedLeavesForStaff(shopId, employeeId),
    listHolidayEntries(shopId),
  ]);
  if (!employee) {
    return;
  }
  const holiday = findHolidayForDate(date, holidays);
  const leave = findApprovedLeaveForDate(employeeId, date, approvedLeaves);
  const decision = resolveShiftDecisionForDate({ date, employee, weeklyAssignments: weeklyDays });
  const recordId = `${employeeId}_${date}`;
  const recordRef = attendanceCol(shopId).doc(recordId);
  const existing = await findAttendanceRecord(shopId, employeeId, date);

  if (holiday || leave || decision.isOff) {
    const status: AttendanceStatus = holiday ? 'holiday' : leave ? 'leave' : 'week_off';
    const calendarRecord: AttendanceRecord = {
      id: recordId,
      employeeId,
      shopId,
      date,
      shiftId: decision.shiftId ?? undefined,
      status,
      lateFlag: false,
      workingHours: 0,
      source: existing?.source ?? 'manual',
      punchTime: existing?.punchTime ?? '',
      checkInTime: existing?.checkInTime ?? '',
      checkOutTime: existing?.checkOutTime ?? '',
      notes: existing?.notes ?? (holiday ? 'Auto-marked holiday.' : leave ? 'Auto-marked approved leave.' : 'Auto-marked weekly off.'),
      createdBy: existing?.createdBy ?? 'system',
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    await withFirestoreRetry(async () => {
      await recordRef.set(calendarRecord, { merge: true });
    });
    return;
  }

  if (!decision.shiftId) {
    return;
  }

  const shift = await getShiftTemplateById(shopId, decision.shiftId);
  if (!shift) {
    return;
  }

  const window = buildShiftWindow(date, shift);
  if (!window || now.isBefore(window.end)) {
    return;
  }

  if (!existing?.checkInTime) {
    const absentRecord: AttendanceRecord = {
      id: recordId,
      employeeId,
      shopId,
      date,
      shiftId: shift.id,
      status: 'absent',
      lateFlag: false,
      workingHours: 0,
      source: 'manual',
      punchTime: '',
      checkInTime: '',
      checkOutTime: '',
      notes: existing?.notes ?? 'Auto-marked absent after shift end.',
      createdBy: existing?.createdBy ?? 'system',
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
    await withFirestoreRetry(async () => {
      await recordRef.set(absentRecord, { merge: true });
    });
    return;
  }

  if (existing.checkOutTime) {
    return;
  }

  const autoCheckOutTime = shift.endTime;
  const workingHours = calculateWorkedHours(existing.checkInTime, autoCheckOutTime);
  const updatedRecord: AttendanceRecord = {
    ...existing,
    status: calculateFinalAttendanceStatus({
      workingHours,
      shift,
      lateFlag: Boolean(existing.lateFlag),
    }),
    workingHours,
    checkOutTime: autoCheckOutTime,
    checkOutAt: window.end.toISOString(),
    updatedAt: nowIso(),
    notes: existing.notes || 'Auto check-out applied at shift end.',
  };

  await withFirestoreRetry(async () => {
    await recordRef.set(updatedRecord, { merge: true });
  });
}

async function syncStaffAttendanceEngine(shopId: string, employeeId: string, now = dayjs()) {
  const today = now.format('YYYY-MM-DD');
  const yesterday = now.subtract(1, 'day').format('YYYY-MM-DD');
  await syncStaffAttendanceForDate(shopId, employeeId, yesterday, now);
  await syncStaffAttendanceForDate(shopId, employeeId, today, now);
}

async function listShiftTemplatesFromFirestore(shopId: string): Promise<ShiftTemplate[]> {
  const snapshot = await withFirestoreRetry(async () => shiftsCol(shopId).get());
  return snapshot.docs
    .map(doc => {
      const raw = doc.data() as Record<string, unknown>;
      return mapShiftTemplate({
        id: doc.id,
        shop_id: String(raw.shop_id ?? shopId),
        name: String(raw.name ?? ''),
        start_time: String(raw.start_time ?? raw.startTime ?? ''),
        end_time: String(raw.end_time ?? raw.endTime ?? ''),
        duration_hours: Number(raw.duration_hours ?? raw.durationHours ?? calculateShiftDurationHours(String(raw.start_time ?? raw.startTime ?? ''), String(raw.end_time ?? raw.endTime ?? '')) ?? 8),
        grace_time: Number(raw.grace_time ?? raw.graceTime ?? 0),
        late_rule_minutes: Number(raw.late_rule_minutes ?? raw.lateRuleMinutes ?? 0),
        half_day_hours: Number(raw.half_day_hours ?? raw.halfDayHours ?? 0),
        created_at: String(raw.created_at ?? raw.createdAt ?? ''),
        updated_at: String(raw.updated_at ?? raw.updatedAt ?? ''),
      });
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function assertUniqueShiftNameInFirestore(shopId: string, name: string, excludeShiftId?: string) {
  const normalizedName = normalizeShiftNameClient(name);
  const shifts = await listShiftTemplatesFromFirestore(shopId);
  const conflict = shifts.find(item => item.id !== excludeShiftId && normalizeShiftNameClient(item.name) === normalizedName);
  if (conflict) {
    throw new Error('Shift name must be unique within the shop.');
  }
}

async function createShiftTemplateInFirestore(input: ShiftTemplateInput): Promise<ShiftTemplate> {
  await assertUniqueShiftNameInFirestore(input.shopId, input.name);
  const id = shiftsCol(input.shopId).doc().id;
  const now = nowIso();
  const payload: ShiftTemplate = {
    id,
    shopId: input.shopId,
    name: input.name.trim(),
    startTime: input.startTime.trim(),
    endTime: input.endTime.trim(),
    durationHours: input.durationHours,
    graceTime: input.graceTime,
    lateRuleMinutes: input.lateRuleMinutes,
    halfDayHours: input.halfDayHours,
    createdAt: now,
    updatedAt: now,
  };
  await withFirestoreRetry(async () => {
    await shiftsCol(input.shopId).doc(id).set(shiftTemplateToFirestoreShape(payload));
  });
  return payload;
}

async function updateShiftTemplateInFirestore(input: ShiftTemplateInput): Promise<ShiftTemplate> {
  if (!input.id) {
    throw new Error('Shift ID is required.');
  }
  await assertUniqueShiftNameInFirestore(input.shopId, input.name, input.id);
  const docRef = shiftsCol(input.shopId).doc(input.id);
  const existing = await withFirestoreRetry(async () => docRef.get());
  if (!hasSnapshotExistsMethod(existing) || !existing.exists()) {
    throw new Error('Shift not found.');
  }
  const existingData = (existing.data() ?? {}) as Record<string, unknown>;
  const payload: ShiftTemplate = {
    id: input.id,
    shopId: input.shopId,
    name: input.name.trim(),
    startTime: input.startTime.trim(),
    endTime: input.endTime.trim(),
    durationHours: input.durationHours,
    graceTime: input.graceTime,
    lateRuleMinutes: input.lateRuleMinutes,
    halfDayHours: input.halfDayHours,
    createdAt: String(existingData.created_at ?? existingData.createdAt ?? nowIso()),
    updatedAt: nowIso(),
  };
  await withFirestoreRetry(async () => {
    await docRef.set(shiftTemplateToFirestoreShape(payload), { merge: true });
  });
  return payload;
}

async function deleteShiftTemplateInFirestore(shopId: string, shiftId: string) {
  const dependencySnapshot = await withFirestoreRetry(async () => employeesCol(shopId).get());
  const hasDependency = dependencySnapshot.docs.some(doc => {
    const raw = (doc.data() ?? {}) as Record<string, unknown>;
    return parseStaffWeeklyShiftDays(raw.weekly_shift_assignments ?? raw.weeklyShiftAssignments, shopId, doc.id).some(
      item => item.shiftId === shiftId,
    );
  });
  if (hasDependency) {
    throw new Error('Shift is assigned in the weekly planner and cannot be deleted.');
  }
  await withFirestoreRetry(async () => {
    await shiftsCol(shopId).doc(shiftId).delete();
  });
  return { id: shiftId };
}

async function getStaffWeeklyShiftPlanFromFirestore(shopId: string, staffId: string): Promise<StaffWeeklyShiftDay[]> {
  const snapshot = await withFirestoreRetry(async () => employeesCol(shopId).doc(staffId).get());
  const raw = (snapshot.data() ?? {}) as Record<string, unknown>;
  const byDay = new Map(
    parseStaffWeeklyShiftDays(raw.weekly_shift_assignments ?? raw.weeklyShiftAssignments, shopId, staffId).map(item => [item.dayOfWeek, item]),
  );

  return Array.from({ length: 7 }, (_, dayOfWeek) =>
    byDay.get(dayOfWeek) ?? {
      id: `${staffId}_${dayOfWeek}`,
      shopId,
      staffId,
      dayOfWeek,
      shiftId: null,
      isOff: false,
      createdAt: '',
      updatedAt: '',
    },
  );
}

async function saveStaffWeeklyShiftPlanToFirestore({ shopId, staffId, days }: SaveStaffWeeklyShiftPlanInput) {
  if (days.length !== 7) {
    throw new Error('Weekly plan must include exactly 7 day entries.');
  }
  const uniqueDayCount = new Set(days.map(item => item.dayOfWeek)).size;
  if (uniqueDayCount !== 7) {
    throw new Error('Weekly plan must include all 7 days.');
  }
  if (!days.some(item => !item.isOff && item.shiftId)) {
    throw new Error('At least one working day must be assigned.');
  }
  if (days.some(item => !item.isOff && !item.shiftId)) {
    throw new Error('Each day must have either a shift assignment or be marked as off.');
  }

  const shifts = await listShiftTemplatesFromFirestore(shopId);
  const shiftIdSet = new Set(shifts.map(item => item.id));
  const missingShift = days.find(item => !item.isOff && item.shiftId && !shiftIdSet.has(item.shiftId));
  if (missingShift?.shiftId) {
    throw new Error(`Shift ${missingShift.shiftId} does not exist in this shop.`);
  }

  const employeeRef = employeesCol(shopId).doc(staffId);
  const employeeSnap = await withFirestoreRetry(async () => employeeRef.get());
  if (!hasSnapshotExistsMethod(employeeSnap) || !employeeSnap.exists()) {
    throw new Error('Staff profile not found.');
  }

  const existingRaw = (employeeSnap.data() ?? {}) as Record<string, unknown>;
  const existing = parseStaffWeeklyShiftDays(existingRaw.weekly_shift_assignments ?? existingRaw.weeklyShiftAssignments, shopId, staffId);
  const existingByDay = new Map(existing.map(item => [item.dayOfWeek, item]));
  const now = nowIso();
  const payload = days.map(item => {
    const previous = existingByDay.get(item.dayOfWeek);
    return weeklyShiftDayToFirestoreShape({
      id: `${staffId}_${item.dayOfWeek}`,
      shopId,
      staffId,
      dayOfWeek: item.dayOfWeek,
      shiftId: item.isOff ? null : item.shiftId,
      isOff: item.isOff,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    });
  });

  await withFirestoreRetry(async () => {
    await employeeRef.set(
      {
        weekly_shift_assignments: payload,
        updatedAt: now,
      },
      { merge: true },
    );
  });

  return getStaffWeeklyShiftPlanFromFirestore(shopId, staffId);
}

async function appendShiftHistoryEntries(params: {
  shopId: string;
  staffId: string;
  previousEmployee: Employee;
  nextEmployee: Employee;
  previousDays: StaffWeeklyShiftDay[];
  nextDays: StaffWeeklyShiftDay[];
}) {
  const { shopId, staffId, previousEmployee, nextEmployee, previousDays, nextDays } = params;
  const changedBy = auth().currentUser?.uid ?? 'system';
  const createdAt = nowIso();
  const batch = shopDoc(shopId).firestore.batch();

  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    const referenceDate = dayjs().startOf('week').add(1, 'day').add(dayOfWeek, 'day').format('YYYY-MM-DD');
    const previousDecision = resolveShiftDecisionForDate({ date: referenceDate, employee: previousEmployee, weeklyAssignments: previousDays });
    const nextDecision = resolveShiftDecisionForDate({ date: referenceDate, employee: nextEmployee, weeklyAssignments: nextDays });
    if (compareShiftDecisions(previousDecision, nextDecision)) {
      continue;
    }
    const entry = buildShiftHistoryEntry({
      id: shiftHistoryCol(shopId).doc().id,
      shopId,
      staffId,
      date: referenceDate,
      oldDecision: previousDecision,
      newDecision: nextDecision,
      changedBy,
      createdAt,
    });
    batch.set(shiftHistoryCol(shopId).doc(entry.id), entry);
  }

  await batch.commit();
}

async function saveAdvancedShiftPlanToFirestore({
  shopId,
  staffId,
  days,
  mode,
  fixedShiftId,
  rotationStartDate,
  rotationPattern,
}: SaveAdvancedShiftPlanInput) {
  const employeeRef = employeesCol(shopId).doc(staffId);
  const employeeSnap = await withFirestoreRetry(async () => employeeRef.get());
  if (!hasSnapshotExistsMethod(employeeSnap) || !employeeSnap.exists()) {
    throw new Error('Staff profile not found.');
  }

  const raw = (employeeSnap.data() ?? {}) as Record<string, unknown>;
  const previousEmployee = normalizeEmployeeSchedulingFields(serialize<Employee>(employeeSnap.id, raw as Omit<Employee, 'id'>), raw);
  const previousDays = parseStaffWeeklyShiftDays(raw.weekly_shift_assignments ?? raw.weeklyShiftAssignments, shopId, staffId);
  const now = nowIso();
  const nextEmployee: Employee = {
    ...previousEmployee,
    shiftMode: mode,
    defaultShiftId: mode === 'fixed' ? fixedShiftId ?? previousEmployee.defaultShiftId ?? '' : previousEmployee.defaultShiftId,
    rotationStartDate: mode === 'rotational' ? (rotationStartDate ?? previousEmployee.rotationStartDate ?? '') : '',
    rotationPattern: mode === 'rotational'
      ? (rotationPattern ?? []).map(item => ({
          ...item,
          shiftId: normalizeNullableShiftId(item.shiftId),
          isOff: Boolean(item.isOff),
        }))
      : [],
    updatedAt: now,
  };

  await saveStaffWeeklyShiftPlanToFirestore({ shopId, staffId, days });

  await withFirestoreRetry(async () => {
    await employeeRef.set(
      withEmployeeFieldCleanup({
        shiftMode: mode,
        shift_mode: mode,
        defaultShiftId: mode === 'fixed' ? fixedShiftId ?? '' : previousEmployee.defaultShiftId ?? '',
        rotationStartDate: mode === 'rotational' ? (rotationStartDate ?? '') : '',
        rotation_start_date: mode === 'rotational' ? (rotationStartDate ?? '') : '',
        rotationPattern: mode === 'rotational'
          ? (rotationPattern ?? []).map(item => ({
              weekIndex: item.weekIndex,
              shiftId: normalizeNullableShiftId(item.shiftId),
              isOff: Boolean(item.isOff),
            }))
          : [],
        rotation_pattern: mode === 'rotational'
          ? (rotationPattern ?? []).map(item => ({
              week_index: item.weekIndex,
              shift_id: normalizeNullableShiftId(item.shiftId),
              is_off: Boolean(item.isOff),
            }))
          : [],
        updatedAt: now,
      }),
      { merge: true },
    );
  });

  const savedDays = await getStaffWeeklyShiftPlanFromFirestore(shopId, staffId);
  await appendShiftHistoryEntries({
    shopId,
    staffId,
    previousEmployee,
    nextEmployee,
    previousDays,
    nextDays: savedDays,
  });
  return savedDays;
}

async function bulkAssignShiftPlanInFirestore({ shopId, staffIds, plan }: BulkAssignShiftPlanInput) {
  const results = await Promise.allSettled(
    staffIds.map(staffId =>
      saveAdvancedShiftPlanToFirestore({
        shopId,
        staffId,
        days: plan.days,
        mode: plan.mode,
        fixedShiftId: plan.fixedShiftId,
        rotationPattern: plan.rotationPattern,
        rotationStartDate: plan.rotationStartDate,
      }),
    ),
  );

  const failures = results.filter(item => item.status === 'rejected') as PromiseRejectedResult[];
  if (failures.length) {
    throw new Error(failures[0]?.reason instanceof Error ? failures[0].reason.message : 'Bulk assign partially failed.');
  }
  return results
    .filter((item): item is PromiseFulfilledResult<StaffWeeklyShiftDay[]> => item.status === 'fulfilled')
    .flatMap(item => item.value);
}

export const hrmsApi = createApi({
  reducerPath: 'hrmsApi',
  baseQuery: fakeBaseQuery<FirestoreError>(),
  refetchOnFocus: true,
  refetchOnReconnect: true,
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
      async onCacheEntryAdded(_arg, { cacheDataLoaded, cacheEntryRemoved, updateCachedData }) {
        try {
          await cacheDataLoaded;
        } catch {
          // Continue: listener can still recover cache when Firestore becomes reachable.
        }
        const unsubscribe = shopsCol()
          .orderBy('createdAt', 'desc')
          .onSnapshot(
            snapshot => {
              if (!hasSnapshotDocs(snapshot)) {
                return;
              }
              const data = snapshot.docs.map(doc => serialize<Shop>(doc.id, doc.data() as Omit<Shop, 'id'>));
              updateCachedData(() => data);
            },
            error => logSnapshotListenerError('SHOPS_LISTENER', error),
          );
        await cacheEntryRemoved;
        unsubscribe();
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

          let createdAuthUid = '';
          if (isCreate) {
            try {
              const createdUser = await createShopAuthUser(normalizedEmail, incomingSecret);
              createdAuthUid = createdUser.uid;
            } catch (error) {
              const message = String((error as { message?: string }).message ?? '').toLowerCase();
              const isEmailExists = message.includes('already exists in firebase auth');
              if (!isEmailExists) {
                throw error;
              }

              const hintedUid = await getDeletedShopAuthHint(normalizedEmail);
              if (!hintedUid) {
                throw error;
              }
              createdAuthUid = hintedUid;
              logInfo('SHOP_UPSERT_REUSED_AUTH_UID_FROM_HINT', {
                email: normalizedEmail,
                uid: hintedUid,
              });
            }
          }

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
            authUid: createdAuthUid || rest.authUid || existingData.authUid,
            createdAt: existing.exists() ? (existing.data()?.createdAt ?? now) : now,
            updatedAt: now,
          };

          if (!isCreate && hasBootstrap) {
            payload.bootstrapPassword = incomingSecret;
          } else if (emailChanged) {
            // No auth status transitions; auth UID remains linked to created user.
          } else if (hasLegacyPassword) {
            payload.password = incomingSecret;
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

    updateShopSelfServiceProfile: builder.mutation<
      Shop,
      {
        shopId: string;
        shopName: string;
        ownerName: string;
        contactNumber: string;
        address: string;
        email: string;
        currentPassword?: string;
      }
    >({
      async queryFn(input) {
        try {
          const docRef = shopDoc(input.shopId);
          const snap = await docRef.get();
          if (!snap.exists()) {
            return { error: { message: 'Shop profile not found.' } };
          }
          const existing = serialize<Shop>(snap.id, snap.data() as Omit<Shop, 'id'>);
          if (existing.status !== 'active') {
            return { error: { message: 'Only active shops can update profile.' } };
          }

          const currentAuthUser = auth().currentUser;
          if (!currentAuthUser?.uid) {
            return { error: { message: 'Session expired. Please login again.' } };
          }
          if (existing.authUid && existing.authUid !== currentAuthUser.uid) {
            return { error: { message: 'Signed-in account is not linked to this shop.' } };
          }

          const normalizedNextEmail = normalizeEmail(input.email);
          if (!normalizedNextEmail || !normalizedNextEmail.includes('@')) {
            return { error: { message: 'Valid email is required.' } };
          }
          const existingEmail = normalizeEmail(existing.email);
          const emailChanged = existingEmail !== normalizedNextEmail;

          if (emailChanged) {
            const emailSnap = await shopsCol().where('email', '==', normalizedNextEmail).limit(1).get();
            const emailConflict = emailSnap.docs.find(doc => doc.id !== existing.id);
            if (emailConflict) {
              return { error: { message: 'Shop email already exists.' } };
            }
            if (!input.currentPassword?.trim()) {
              return { error: { message: 'Current password is required to change login email.' } };
            }
            await auth().signInWithEmailAndPassword(existingEmail, input.currentPassword.trim());
            await auth().currentUser?.updateEmail(normalizedNextEmail);
          }

          const payload: Shop = {
            ...existing,
            shopName: String(input.shopName ?? '').trim(),
            ownerName: String(input.ownerName ?? '').trim(),
            contactNumber: String(input.contactNumber ?? '').trim(),
            address: String(input.address ?? '').trim(),
            email: normalizedNextEmail,
            updatedAt: nowIso(),
          };

          try {
            await docRef.set(omitUndefinedDeep(payload), { merge: true });
          } catch (writeError) {
            if (emailChanged) {
              try {
                await auth().currentUser?.updateEmail(existingEmail);
              } catch {
                // best effort rollback when Firestore write fails after auth email update
              }
            }
            throw writeError;
          }
          return { data: payload };
        } catch (error) {
          const message = getErrorMessage(error).toLowerCase();
          if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) {
            return { error: { message: 'Current password is incorrect.' } };
          }
          if (message.includes('auth/requires-recent-login')) {
            return { error: { message: 'For security, re-login and try profile update again.' } };
          }
          if (message.includes('auth/email-already-in-use')) {
            return { error: { message: 'This email is already used by another auth account.' } };
          }
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Shops'],
    }),

    changeShopManagerPassword: builder.mutation<{ ok: true }, { currentPassword: string; newPassword: string }>({
      async queryFn(input) {
        try {
          const currentPassword = input.currentPassword.trim();
          const nextPassword = input.newPassword.trim();
          if (!currentPassword || !nextPassword) {
            return { error: { message: 'Current and new password are required.' } };
          }
          if (nextPassword.length < 6) {
            return { error: { message: 'New password must be at least 6 characters.' } };
          }
          if (currentPassword === nextPassword) {
            return { error: { message: 'New password must be different from current password.' } };
          }

          const currentUser = auth().currentUser;
          const currentEmail = normalizeEmail(currentUser?.email ?? '');
          if (!currentUser || !currentEmail) {
            return { error: { message: 'Session expired. Please login again.' } };
          }

          await auth().signInWithEmailAndPassword(currentEmail, currentPassword);
          await auth().currentUser?.updatePassword(nextPassword);
          return { data: { ok: true } };
        } catch (error) {
          const message = getErrorMessage(error).toLowerCase();
          if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) {
            return { error: { message: 'Current password is incorrect.' } };
          }
          if (message.includes('auth/weak-password')) {
            return { error: { message: 'New password is too weak. Use at least 6 characters.' } };
          }
          if (message.includes('auth/requires-recent-login')) {
            return { error: { message: 'For security, re-login and then change password.' } };
          }
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
    }),

    deleteShopManagerAccount: builder.mutation<{ ok: true }, { shopId: string; currentPassword: string }>({
      async queryFn({ shopId, currentPassword }) {
        try {
          const currentUser = auth().currentUser;
          const currentEmail = normalizeEmail(currentUser?.email ?? '');
          if (!currentUser || !currentEmail) {
            return { error: { message: 'Session expired. Please login again.' } };
          }
          const secret = currentPassword.trim();
          if (!secret) {
            return { error: { message: 'Current password is required to delete account.' } };
          }

          const shopRef = shopDoc(shopId);
          const shopSnap = await shopRef.get();
          if (!shopSnap.exists()) {
            return { error: { message: 'Shop account not found.' } };
          }
          const shop = serialize<Shop>(shopSnap.id, shopSnap.data() as Omit<Shop, 'id'>);
          if (shop.authUid && shop.authUid !== currentUser.uid) {
            return { error: { message: 'Signed-in account is not linked to this shop.' } };
          }

          await auth().signInWithEmailAndPassword(currentEmail, secret);

          for (const collectionName of SHOP_CHILD_COLLECTIONS) {
            await deleteCollectionBatchedClient(shopRef.collection(collectionName));
          }
          await shopRef.delete();

          await auth().currentUser?.delete();
          return { data: { ok: true } };
        } catch (error) {
          const message = getErrorMessage(error).toLowerCase();
          if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) {
            return { error: { message: 'Current password is incorrect.' } };
          }
          if (message.includes('auth/requires-recent-login')) {
            return { error: { message: 'For security, re-login and retry account deletion.' } };
          }
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Shops', 'Employees', 'Attendance', 'Salary', 'Dashboard', 'Reports', 'Settings', 'Biometric', 'Advance'],
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
      async onCacheEntryAdded(shopId, { cacheDataLoaded, cacheEntryRemoved, updateCachedData }) {
        try {
          await cacheDataLoaded;
        } catch {
          // Continue: listener can still recover cache when Firestore becomes reachable.
        }
        const unsubscribe = shopDoc(shopId).onSnapshot(
          snapshot => {
            if (!hasSnapshotExistsMethod(snapshot)) {
              return;
            }
            const data = snapshot.exists() ? serialize<Shop>(snapshot.id, snapshot.data() as Omit<Shop, 'id'>) : null;
            updateCachedData(() => data);
          },
          error => logSnapshotListenerError('SHOP_BY_ID_LISTENER', error),
        );
        await cacheEntryRemoved;
        unsubscribe();
      },
      providesTags: ['Shops'],
    }),

    getStaffSelfProfile: builder.query<Employee | null, void>({
      async queryFn() {
        try {
          const { shopId, employeeId, uid } = await getCurrentStaffContext();
          const snap = await employeesCol(shopId).doc(employeeId).get();
          if (!snap.exists()) {
            return { data: null };
          }

          const raw = (snap.data() ?? {}) as Record<string, unknown>;
          const employee = normalizeEmployeeSchedulingFields(serialize<Employee>(snap.id, raw as Omit<Employee, 'id'>), raw);
          if (employee.authUid && employee.authUid !== uid) {
            return { error: { message: 'Signed-in account is not linked to this staff profile.' } };
          }
          return { data: employee };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      async onCacheEntryAdded(_arg, { cacheDataLoaded, cacheEntryRemoved, updateCachedData }) {
        let unsubscribe = () => {};
        try {
          await cacheDataLoaded;
          const { shopId, employeeId } = await getCurrentStaffContext();
          unsubscribe = employeesCol(shopId).doc(employeeId).onSnapshot(
            snapshot => {
              if (!hasSnapshotExistsMethod(snapshot)) {
                return;
              }
              const data = snapshot.exists()
                ? normalizeEmployeeSchedulingFields(
                    serialize<Employee>(snapshot.id, snapshot.data() as Omit<Employee, 'id'>),
                    (snapshot.data() ?? {}) as Record<string, unknown>,
                  )
                : null;
              updateCachedData(() => data);
            },
            error => logSnapshotListenerError('STAFF_SELF_PROFILE_LISTENER', error),
          );
        } catch {
          // ignore hydration/listener setup failures and rely on queryFn result
        }

        await cacheEntryRemoved;
        unsubscribe();
      },
      providesTags: ['Employees'],
    }),

    getStaffAttendanceSummary: builder.query<StaffAttendanceSummary, { month?: string } | void>({
      async queryFn(arg) {
        const month = arg?.month && isValidMonthKey(arg.month) ? arg.month : currentMonth();
        try {
          const { shopId, employeeId } = await getCurrentStaffContext();
          await syncStaffAttendanceEngine(shopId, employeeId);
          const today = todayDate();
          const { start, end } = monthDateRange(month);
          const snapshot = await attendanceCol(shopId)
            .where('employeeId', '==', employeeId)
            .where('date', '>=', start)
            .where('date', '<=', end)
            .get();

          const rows = snapshot.docs.map(doc =>
            serialize<AttendanceRecord>(doc.id, doc.data() as Omit<AttendanceRecord, 'id'>),
          );
          let todayRecord = rows.find(row => row.date === today) ?? null;
          if (!todayRecord) {
            const yesterday = dayjs(today).subtract(1, 'day').format('YYYY-MM-DD');
            const previousRecord = rows.find(row => row.date === yesterday && !!row.checkInTime) ?? null;
            if (previousRecord?.shiftId) {
              const shift = await getShiftTemplateById(shopId, previousRecord.shiftId);
              const window = shift ? buildShiftWindow(yesterday, shift) : null;
              if (window && dayjs().isBefore(window.end)) {
                todayRecord = previousRecord;
              }
            }
          }

          return {
            data: {
              month,
              todayRecord,
              todayHours: calculateWorkedHours(todayRecord?.checkInTime, todayRecord?.checkOutTime),
              presentCount: rows.filter(row => row.status === 'present').length,
              absentCount: rows.filter(row => row.status === 'absent').length,
              lateCount: rows.filter(row => row.status === 'late').length,
              halfDayCount: rows.filter(row => row.status === 'half_day').length,
              leaveCount: rows.filter(row => row.status === 'leave').length,
              checkedInDays: rows.filter(row => !!row.checkInTime || !!row.punchTime).length,
            },
          };
        } catch (error) {
          if (isMissingFirestoreIndexError(error)) {
            return {
              data: {
                month,
                todayRecord: null,
                todayHours: 0,
                presentCount: 0,
                absentCount: 0,
                lateCount: 0,
                halfDayCount: 0,
                leaveCount: 0,
                checkedInDays: 0,
              },
            };
          }
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      providesTags: ['Attendance'],
    }),

    getStaffAttendanceHistory: builder.query<
      AttendanceRecord[],
      { month: string; status?: AttendanceStatus | 'all' }
    >({
      async queryFn({ month, status }) {
        try {
          const { shopId, employeeId } = await getCurrentStaffContext();
          await syncStaffAttendanceEngine(shopId, employeeId);
          if (!isValidMonthKey(month)) {
            return { data: [] };
          }
          const { start, end } = monthDateRange(month);
          const snapshot = await attendanceCol(shopId)
            .where('employeeId', '==', employeeId)
            .where('date', '>=', start)
            .where('date', '<=', end)
            .get();

          const rows = snapshot.docs
            .map(doc => serialize<AttendanceRecord>(doc.id, doc.data() as Omit<AttendanceRecord, 'id'>))
            .filter(row => !status || status === 'all' || row.status === status)
            .sort((a, b) => String(b.date).localeCompare(String(a.date)));
          return { data: rows };
        } catch (error) {
          if (isMissingFirestoreIndexError(error)) {
            return { data: [] };
          }
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      providesTags: ['Attendance'],
    }),

    staffCheckIn: builder.mutation<AttendanceActionResult, void>({
      async queryFn() {
        try {
          const { shopId, employeeId, uid } = await getCurrentStaffContext();
          const now = dayjs();
          await syncStaffAttendanceEngine(shopId, employeeId, now);
          const shiftContext = await resolveAssignedShiftContext(shopId, employeeId, now);
          if (!shiftContext.ok && shiftContext.message !== 'Shift not assigned') {
            return { error: { message: shiftContext.message } };
          }

          const assignmentDate = shiftContext.ok ? shiftContext.date : now.format('YYYY-MM-DD');
          const assignedShift = shiftContext.ok ? shiftContext.shift : null;

          const recordId = `${employeeId}_${assignmentDate}`;
          const recordRef = attendanceCol(shopId).doc(recordId);
          const existingRecord = await findAttendanceRecord(shopId, employeeId, assignmentDate);

          if (existingRecord?.checkInTime) {
            return { error: { message: 'Already checked-in' } };
          }

          const yesterdayRecordId = `${employeeId}_${now.subtract(1, 'day').format('YYYY-MM-DD')}`;
          if (yesterdayRecordId !== recordId) {
            const previousRecord = await findAttendanceRecord(shopId, employeeId, now.subtract(1, 'day').format('YYYY-MM-DD'));
            if (previousRecord?.checkInTime && !previousRecord.checkOutTime) {
              return { error: { message: 'Already checked-in' } };
            }
          }

          const initialStatus = assignedShift
            ? getInitialAttendanceStatus(now, assignmentDate, assignedShift)
            : { blocked: false, message: '', status: 'present' as AttendanceStatus, lateFlag: false };
          if (initialStatus.blocked || !initialStatus.status) {
            return { error: { message: initialStatus.message } };
          }

          const geoSnap = await withFirestoreRetry(async () => geoFencingSettingsDoc(shopId).get());
          const geoSettings = normalizeGeoFencingSettings(shopId, geoSnap.data());
          const geoValidation = await validateGeoFenceForAttendance({ settings: geoSettings });
          if (!geoValidation.ok) {
            return { error: { message: geoValidation.message } };
          }

          const nowIsoValue = now.toISOString();
          const record: AttendanceRecord = {
            id: recordId,
            employeeId,
            shopId,
            date: assignmentDate,
            shiftId: assignedShift?.id,
            status: initialStatus.status,
            lateFlag: initialStatus.lateFlag,
            workingHours: 0,
            source: 'manual',
            punchTime: nowIsoValue,
            checkInTime: formatAttendanceClock(now),
            checkOutTime: existingRecord?.checkOutTime ?? '',
            checkInAt: nowIsoValue,
            checkOutAt: existingRecord?.checkOutAt ?? '',
            notes: existingRecord?.notes ?? (assignedShift ? '' : 'Checked in without assigned shift.'),
            createdBy: uid,
            createdAt: existingRecord?.createdAt ?? nowIsoValue,
            updatedAt: nowIsoValue,
          };

          await withFirestoreRetry(async () => {
            await recordRef.set(record, { merge: true });
          });

          return { data: { message: 'Checked in successfully.', record } };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Attendance', 'Dashboard', 'Reports'],
    }),

    staffCheckOut: builder.mutation<AttendanceActionResult, void>({
      async queryFn() {
        try {
          const { shopId, employeeId, uid } = await getCurrentStaffContext();
          const now = dayjs();
          await syncStaffAttendanceEngine(shopId, employeeId, now);
          const candidateDates = [now.format('YYYY-MM-DD'), now.subtract(1, 'day').format('YYYY-MM-DD')];

          let activeRecord: AttendanceRecord | null = null;
          for (const date of candidateDates) {
            const record = await findAttendanceRecord(shopId, employeeId, date);
            if (!record) {
              continue;
            }
            if (record.checkInTime && !record.checkOutTime) {
              activeRecord = record;
              break;
            }
          }

          if (!activeRecord) {
            return { error: { message: 'Check-in required first' } };
          }
          if (activeRecord.checkOutTime) {
            return { error: { message: 'Already checked-out' } };
          }

          const checkOutTime = formatAttendanceClock(now);
          const workingHours = calculateWorkedHours(activeRecord.checkInTime, checkOutTime);
          let finalStatus: AttendanceStatus;
          if (activeRecord.shiftId) {
            const shift = await getShiftTemplateById(shopId, activeRecord.shiftId);
            finalStatus = shift
              ? calculateFinalAttendanceStatus({
                  workingHours,
                  shift,
                  lateFlag: Boolean(activeRecord.lateFlag),
                })
              : calculateShiftlessAttendanceStatus(activeRecord, workingHours);
          } else {
            finalStatus = calculateShiftlessAttendanceStatus(activeRecord, workingHours);
          }

          const updatedRecord: AttendanceRecord = {
            ...activeRecord,
            status: finalStatus,
            workingHours,
            checkOutTime,
            checkOutAt: now.toISOString(),
            updatedAt: now.toISOString(),
            createdBy: activeRecord.createdBy || uid,
          };

          await withFirestoreRetry(async () => {
            await attendanceCol(shopId).doc(activeRecord.id).set(updatedRecord, { merge: true });
          });

          return { data: { message: 'Checked out successfully.', record: updatedRecord } };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Attendance', 'Dashboard', 'Reports'],
    }),

    getStaffSalaryOverview: builder.query<StaffSalaryOverview, { month?: string } | void>({
      async queryFn(arg) {
        try {
          const { shopId, employeeId } = await getCurrentStaffContext();
          const month = arg?.month && isValidMonthKey(arg.month) ? arg.month : currentMonth();
          const [salarySnap, advanceSnap] = await Promise.all([
            findSalaryRecord(shopId, employeeId, month),
            advancesCol(shopId).where('employeeId', '==', employeeId).where('month', '==', month).get(),
          ]);

          const salary = salarySnap;
          const advances = advanceSnap.docs
            .map(doc => serialize<EmployeeAdvance>(doc.id, doc.data() as Omit<EmployeeAdvance, 'id'>))
            .sort((a, b) => String(b.paidAt ?? '').localeCompare(String(a.paidAt ?? '')));
          const totalAdvanceAmount = advances.reduce((sum, item) => sum + Number(item.amount || 0), 0);
          const totalAdvanceDeduction = Number(salary?.advanceDeduction ?? 0);

          return {
            data: {
              month,
              salary,
              advances,
              totalAdvanceAmount: Number(totalAdvanceAmount.toFixed(2)),
              totalAdvanceDeduction: Number(totalAdvanceDeduction.toFixed(2)),
              remainingPayableSalary: Number((salary?.netSalary ?? 0).toFixed(2)),
            },
          };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      providesTags: ['Salary', 'Advance'],
    }),

    getStaffShiftOverview: builder.query<StaffShiftOverview, { weekStartDate?: string } | void>({
      async queryFn(arg) {
        const weekStartDate = arg?.weekStartDate || dayjs().startOf('week').add(1, 'day').format('YYYY-MM-DD');
        try {
          const { shopId, employeeId } = await getCurrentStaffContext();
          const employeeSnap = await employeesCol(shopId).doc(employeeId).get();
          if (!employeeSnap.exists()) {
            return { error: { message: 'Staff profile not found.' } };
          }

          const employeeRaw = (employeeSnap.data() ?? {}) as Record<string, unknown>;
          const employee = normalizeEmployeeSchedulingFields(serialize<Employee>(employeeSnap.id, employeeRaw as Omit<Employee, 'id'>), employeeRaw);
          const [shiftSnap, weeklyDays] = await Promise.all([
            shiftsCol(shopId).get(),
            listStaffWeeklyShiftDays(shopId, employeeId),
          ]);

          const shifts = shiftSnap.docs.map(doc => {
            const raw = (doc.data() ?? {}) as Record<string, unknown>;
            return toShiftMaster(
              mapShiftTemplate({
                id: doc.id,
                shop_id: String(raw.shop_id ?? raw.shopId ?? shopId),
                name: String(raw.name ?? ''),
                start_time: String(raw.start_time ?? raw.startTime ?? ''),
                end_time: String(raw.end_time ?? raw.endTime ?? ''),
                duration_hours: Number(raw.duration_hours ?? raw.durationHours ?? 0),
                allowed_early_minutes: raw.allowed_early_minutes === undefined ? undefined : Number(raw.allowed_early_minutes),
                grace_time: Number(raw.grace_time ?? raw.graceTime ?? 0),
                late_rule_minutes: Number(raw.late_rule_minutes ?? raw.lateRuleMinutes ?? 0),
                half_day_hours: Number(raw.half_day_hours ?? raw.halfDayHours ?? 0),
                created_at: String(raw.created_at ?? raw.createdAt ?? ''),
                updated_at: String(raw.updated_at ?? raw.updatedAt ?? ''),
              }),
            );
          });
          const shiftById = new Map(shifts.map(item => [item.id, item]));
          const todayDecision = resolveShiftDecisionForDate({ date: todayDate(), employee, weeklyAssignments: weeklyDays });
          const defaultShift = employee.defaultShiftId ? shiftById.get(employee.defaultShiftId) ?? null : null;
          const todayShift = todayDecision.shiftId ? shiftById.get(todayDecision.shiftId) ?? null : null;

          return {
            data: {
              weekStartDate,
              defaultShift,
              todayShift,
              weeklyOff: employee.weeklyOff ?? 'none',
              shifts,
              weeklyAssignments: weeklyDays,
            },
          };
        } catch (error) {
          if (isMissingFirestoreIndexError(error)) {
            try {
              const { shopId, employeeId } = await getCurrentStaffContext();
              const employeeSnap = await employeesCol(shopId).doc(employeeId).get();
              if (!employeeSnap.exists()) {
                return { error: { message: 'Staff profile not found.' } };
              }

              const employeeRaw = (employeeSnap.data() ?? {}) as Record<string, unknown>;
              const employee = normalizeEmployeeSchedulingFields(serialize<Employee>(employeeSnap.id, employeeRaw as Omit<Employee, 'id'>), employeeRaw);
              const shiftSnap = await shiftsCol(shopId).get();
              const shifts = shiftSnap.docs.map(doc => {
                const raw = (doc.data() ?? {}) as Record<string, unknown>;
                return toShiftMaster(
                  mapShiftTemplate({
                    id: doc.id,
                    shop_id: String(raw.shop_id ?? raw.shopId ?? shopId),
                    name: String(raw.name ?? ''),
                    start_time: String(raw.start_time ?? raw.startTime ?? ''),
                    end_time: String(raw.end_time ?? raw.endTime ?? ''),
                    duration_hours: Number(raw.duration_hours ?? raw.durationHours ?? 0),
                    allowed_early_minutes: raw.allowed_early_minutes === undefined ? undefined : Number(raw.allowed_early_minutes),
                    grace_time: Number(raw.grace_time ?? raw.graceTime ?? 0),
                    late_rule_minutes: Number(raw.late_rule_minutes ?? raw.lateRuleMinutes ?? 0),
                    half_day_hours: Number(raw.half_day_hours ?? raw.halfDayHours ?? 0),
                    created_at: String(raw.created_at ?? raw.createdAt ?? ''),
                    updated_at: String(raw.updated_at ?? raw.updatedAt ?? ''),
                  }),
                );
              });
              const shiftById = new Map(shifts.map(item => [item.id, item]));
              const weeklyDays = await listStaffWeeklyShiftDays(shopId, employeeId);
              const defaultShift = employee.defaultShiftId ? shiftById.get(employee.defaultShiftId) ?? null : null;
              const todayDecision = resolveShiftDecisionForDate({ date: todayDate(), employee, weeklyAssignments: weeklyDays });
              const todayShift = todayDecision.shiftId ? shiftById.get(todayDecision.shiftId) ?? null : null;

              return {
                data: {
                  weekStartDate,
                  defaultShift,
                  todayShift,
                  weeklyOff: employee.weeklyOff ?? 'none',
                  shifts,
                  weeklyAssignments: weeklyDays,
                },
              };
            } catch (fallbackError) {
              return { error: { message: toUserErrorMessage(fallbackError) } };
            }
          }
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      providesTags: ['Settings'],
    }),

    registerEmployeeWithAuth: builder.mutation<
      Employee,
      RegisterEmployeeWithAuthInput
    >({
      async queryFn({ shopId, employee, loginEmail, password }) {
        try {
          const normalizedLoginEmail = normalizeEmail(loginEmail);
          if (!normalizedLoginEmail || !normalizedLoginEmail.includes('@')) {
            return { error: { message: 'Valid staff login email is required.' } };
          }
          if (password.trim().length < 6) {
            return { error: { message: 'Staff password must be at least 6 characters.' } };
          }

          const stableEmployeeId = employee.id ?? employeesCol(shopId).doc().id;
          const registeredEmployee = await registerStaffWithAuthViaManager({
            shopId,
            employeeId: stableEmployeeId,
            email: normalizedLoginEmail,
            password: password.trim(),
            employee: {
              ...employee,
              id: stableEmployeeId,
              loginEmail: normalizedLoginEmail,
            },
          });

          return { data: registeredEmployee };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Employees', 'Dashboard'],
    }),

    provisionEmployeeAuth: builder.mutation<
      Employee,
      ProvisionEmployeeAuthInput
    >({
      async queryFn({ shopId, employeeId, loginEmail, password, displayName }) {
        try {
          const employeeRef = employeesCol(shopId).doc(employeeId);
          const employeeSnap = await employeeRef.get();
          if (!employeeSnap.exists()) {
            return { error: { message: 'Employee record not found.' } };
          }

          const employeeRaw = (employeeSnap.data() ?? {}) as Record<string, unknown>;
          const employee = normalizeEmployeeSchedulingFields(serialize<Employee>(employeeSnap.id, employeeRaw as Omit<Employee, 'id'>), employeeRaw);
          if (employee.status !== 'active') {
            return { error: { message: 'Only active staff can receive login access.' } };
          }

          const normalizedLoginEmail = normalizeEmail(loginEmail);
          if (!normalizedLoginEmail || !normalizedLoginEmail.includes('@')) {
            return { error: { message: 'Valid staff login email is required.' } };
          }
          if (password.trim().length < 6) {
            return { error: { message: 'Staff password must be at least 6 characters.' } };
          }

          const result = await provisionStaffAuthViaManager({
            shopId,
            employeeId,
            email: normalizedLoginEmail,
            password: password.trim(),
            displayName: displayName?.trim() || employee.name,
          });

          const updated: Employee = {
            ...employee,
            loginEmail: normalizedLoginEmail,
            authUid: result.uid,
            authStatus: 'provisioned',
            authProvisionedAt: nowIso(),
            authDisabledAt: '',
            authLastError: '',
            updatedAt: nowIso(),
          };

          await employeeRef.set(withEmployeeFieldCleanup(updated), { merge: true });
          return { data: updated };
        } catch (error) {
          const employeeRef = employeesCol(shopId).doc(employeeId);
          await employeeRef.set(
            {
              authStatus: 'error' as EmployeeAuthStatus,
              authLastError: toUserErrorMessage(error),
              updatedAt: nowIso(),
            },
            { merge: true },
          );
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Employees'],
    }),

    setEmployeeAuthAccess: builder.mutation<
      Employee,
      { shopId: string; employeeId: string; disabled: boolean }
    >({
      async queryFn({ shopId, employeeId, disabled }) {
        try {
          const employeeRef = employeesCol(shopId).doc(employeeId);
          const employeeSnap = await employeeRef.get();
          if (!employeeSnap.exists()) {
            return { error: { message: 'Employee record not found.' } };
          }

          const employeeRaw = (employeeSnap.data() ?? {}) as Record<string, unknown>;
          const employee = normalizeEmployeeSchedulingFields(serialize<Employee>(employeeSnap.id, employeeRaw as Omit<Employee, 'id'>), employeeRaw);
          if (!employee.authUid) {
            return { error: { message: 'Staff login is not provisioned yet.' } };
          }

          await setStaffAuthDisabledViaManager({
            shopId,
            employeeId,
            uid: employee.authUid,
            disabled,
          });

          const updated: Employee = {
            ...employee,
            authStatus: disabled ? 'disabled' : 'provisioned',
            authDisabledAt: disabled ? nowIso() : '',
            authLastError: '',
            updatedAt: nowIso(),
          };

          await employeeRef.set(withEmployeeFieldCleanup(updated), { merge: true });
          return { data: updated };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Employees'],
    }),

    changeStaffPassword: builder.mutation<{ ok: true }, { currentPassword: string; newPassword: string }>({
      async queryFn(input) {
        try {
          const currentPassword = input.currentPassword.trim();
          const nextPassword = input.newPassword.trim();
          if (!currentPassword || !nextPassword) {
            return { error: { message: 'Current and new password are required.' } };
          }
          if (nextPassword.length < 6) {
            return { error: { message: 'New password must be at least 6 characters.' } };
          }
          if (currentPassword === nextPassword) {
            return { error: { message: 'New password must be different from current password.' } };
          }

          const currentUser = auth().currentUser;
          const currentEmail = normalizeEmail(currentUser?.email ?? '');
          if (!currentUser || !currentEmail) {
            return { error: { message: 'Session expired. Please login again.' } };
          }

          await getCurrentStaffContext();
          await auth().signInWithEmailAndPassword(currentEmail, currentPassword);
          await auth().currentUser?.updatePassword(nextPassword);
          return { data: { ok: true } };
        } catch (error) {
          const message = getErrorMessage(error).toLowerCase();
          if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) {
            return { error: { message: 'Current password is incorrect.' } };
          }
          if (message.includes('auth/weak-password')) {
            return { error: { message: 'New password is too weak. Use at least 6 characters.' } };
          }
          if (message.includes('auth/requires-recent-login')) {
            return { error: { message: 'For security, re-login and then change password.' } };
          }
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
    }),

    deleteStaffAccount: builder.mutation<{ ok: true }, { currentPassword: string }>({
      async queryFn({ currentPassword }) {
        try {
          const currentUser = auth().currentUser;
          const currentEmail = normalizeEmail(currentUser?.email ?? '');
          if (!currentUser || !currentEmail) {
            return { error: { message: 'Session expired. Please login again.' } };
          }
          const secret = currentPassword.trim();
          if (!secret) {
            return { error: { message: 'Current password is required to delete account.' } };
          }

          await getCurrentStaffContext();
          await auth().signInWithEmailAndPassword(currentEmail, secret);
          await deleteOwnStaffAccountViaEndpoint();
          return { data: { ok: true } };
        } catch (error) {
          const message = getErrorMessage(error).toLowerCase();
          if (message.includes('auth/invalid-credential') || message.includes('auth/wrong-password')) {
            return { error: { message: 'Current password is incorrect.' } };
          }
          if (message.includes('auth/requires-recent-login')) {
            return { error: { message: 'For security, re-login and retry account deletion.' } };
          }
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Employees'],
    }),

    deleteShop: builder.mutation<{ ok: true }, string>({
      async queryFn(shopId) {
        try {
          const projectId = app.app().options.projectId;
          const token = await auth().currentUser?.getIdToken();
          if (!projectId || !token) {
            return { error: { message: 'Admin session missing. Please re-login and retry.' } };
          }

          const endpoint = `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/deleteShopByAdmin`;
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ shopId }),
          });

          const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
          if (!response.ok || !payload.ok) {
            const detail = payload?.message ? `: ${payload.message}` : '';
            return {
              error: {
                message: `Delete endpoint failed${detail}. Ensure Firebase Functions is deployed and project is on Blaze plan.`,
              },
            };
          }

          logInfo('SHOP_DELETE_COMPLETED_VIA_ADMIN_ENDPOINT', { shopId });
          return { data: { ok: true } };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Shops', 'Dashboard'],
    }),

    getEmployees: builder.query<Employee[], string>({
      async queryFn(shopId) {
        try {
          const snapshot = await employeesCol(shopId).orderBy('createdAt', 'desc').get();
          const data = snapshot.docs.map(doc =>
            normalizeEmployeeSchedulingFields(
              serialize<Employee>(doc.id, doc.data() as Omit<Employee, 'id'>),
              (doc.data() ?? {}) as Record<string, unknown>,
            ),
          );
          return { data };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      async onCacheEntryAdded(shopId, { cacheDataLoaded, cacheEntryRemoved, updateCachedData }) {
        try {
          await cacheDataLoaded;
        } catch {
          // Continue: listener can still recover cache when Firestore becomes reachable.
        }
        const unsubscribe = employeesCol(shopId)
          .orderBy('createdAt', 'desc')
          .onSnapshot(
            snapshot => {
              if (!hasSnapshotDocs(snapshot)) {
                return;
              }
              const data = snapshot.docs.map(doc =>
                normalizeEmployeeSchedulingFields(
                  serialize<Employee>(doc.id, doc.data() as Omit<Employee, 'id'>),
                  (doc.data() ?? {}) as Record<string, unknown>,
                ),
              );
              updateCachedData(() => data);
            },
            error => logSnapshotListenerError('EMPLOYEES_LISTENER', error),
          );
        await cacheEntryRemoved;
        unsubscribe();
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
            await docRef.set(withEmployeeFieldCleanup(payload), { merge: true });
          });
          return { data: normalizeEmployeeSchedulingFields(payload) };
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
      async onCacheEntryAdded({ shopId, date }, { cacheDataLoaded, cacheEntryRemoved, updateCachedData }) {
        try {
          await cacheDataLoaded;
        } catch {
          // Continue: listener can still recover cache when Firestore becomes reachable.
        }
        const unsubscribe = attendanceCol(shopId)
          .where('date', '==', date)
          .onSnapshot(
            snapshot => {
              if (!hasSnapshotDocs(snapshot)) {
                return;
              }
              const data = snapshot.docs.map(doc =>
                serialize<AttendanceRecord>(doc.id, doc.data() as Omit<AttendanceRecord, 'id'>),
              );
              updateCachedData(() => data);
            },
            error => logSnapshotListenerError('ATTENDANCE_BY_DATE_LISTENER', error),
          );
        await cacheEntryRemoved;
        unsubscribe();
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
      async onCacheEntryAdded({ shopId, month }, { cacheDataLoaded, cacheEntryRemoved, updateCachedData }) {
        if (!isValidMonthKey(month)) {
          return;
        }
        try {
          await cacheDataLoaded;
        } catch {
          // Continue: listener can still recover cache when Firestore becomes reachable.
        }
        const unsubscribe = advancesCol(shopId)
          .where('month', '==', month)
          .onSnapshot(
            snapshot => {
              if (!hasSnapshotDocs(snapshot)) {
                return;
              }
              const data = snapshot.docs
                .map(doc => serialize<EmployeeAdvance>(doc.id, doc.data() as Omit<EmployeeAdvance, 'id'>))
                .sort((a, b) => {
                  const paidAtDiff = String(b.paidAt ?? '').localeCompare(String(a.paidAt ?? ''));
                  if (paidAtDiff !== 0) {
                    return paidAtDiff;
                  }
                  return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
                });
              updateCachedData(() => data);
            },
            error => logSnapshotListenerError('ADVANCES_LISTENER', error),
          );
        await cacheEntryRemoved;
        unsubscribe();
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
          const templates = await callManagerEndpoint<
            Array<{
              id: string;
              shop_id: string;
              name: string;
              start_time: string;
              end_time: string;
              duration_hours?: number;
              grace_time: number;
              late_rule_minutes: number;
              half_day_hours: number;
              created_at: string;
              updated_at: string;
            }>
          >({
            endpointName: 'listShopShifts',
            method: 'GET',
            query: { shopId },
          });
          const data = templates
            .map(mapShiftTemplate)
            .map(toShiftMaster)
            .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
          return { data };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      providesTags: ['Settings'],
    }),

    getShiftTemplates: builder.query<ShiftTemplate[], string>({
      async queryFn(shopId) {
        try {
          const data = await callManagerEndpoint<
            Array<{
              id: string;
              shop_id: string;
              name: string;
              start_time: string;
              end_time: string;
              duration_hours?: number;
              grace_time: number;
              late_rule_minutes: number;
              half_day_hours: number;
              created_at: string;
              updated_at: string;
            }>
          >({
            endpointName: 'listShopShifts',
            method: 'GET',
            query: { shopId },
          });
          return {
            data: data.map(mapShiftTemplate).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
          };
        } catch (error) {
          try {
            if (isFunctionsEndpointUnavailable(error)) {
              return { data: await listShiftTemplatesFromFirestore(shopId) };
            }
          } catch (fallbackError) {
            return { error: { message: toUserErrorMessage(fallbackError) } };
          }
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      providesTags: ['Settings'],
    }),

    createShiftTemplate: builder.mutation<ShiftTemplate, ShiftTemplateInput>({
      async queryFn(input) {
        try {
          const data = await callManagerEndpoint<{
            id: string;
            shop_id: string;
            name: string;
            start_time: string;
            end_time: string;
            grace_time: number;
            late_rule_minutes: number;
            half_day_hours: number;
            created_at: string;
            updated_at: string;
          }>({
            endpointName: 'createShopShift',
            method: 'POST',
            body: {
              shopId: input.shopId,
              name: input.name,
              start_time: input.startTime,
              end_time: input.endTime,
              duration_hours: input.durationHours,
              grace_time: input.graceTime,
              late_rule_minutes: input.lateRuleMinutes,
              half_day_hours: input.halfDayHours,
            },
          });
          return { data: mapShiftTemplate(data) };
        } catch (error) {
          try {
            if (isFunctionsEndpointUnavailable(error)) {
              return { data: await createShiftTemplateInFirestore(input) };
            }
          } catch (fallbackError) {
            return { error: { message: toUserErrorMessage(fallbackError) } };
          }
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Settings', 'Reports'],
    }),

    updateShiftTemplate: builder.mutation<ShiftTemplate, ShiftTemplateInput>({
      async queryFn(input) {
        try {
          if (!input.id) {
            return { error: { message: 'Shift ID is required.' } };
          }
          const data = await callManagerEndpoint<{
            id: string;
            shop_id: string;
            name: string;
            start_time: string;
            end_time: string;
            duration_hours?: number;
            grace_time: number;
            late_rule_minutes: number;
            half_day_hours: number;
            created_at: string;
            updated_at: string;
          }>({
            endpointName: 'updateShopShift',
            method: 'PUT',
            body: {
              shopId: input.shopId,
              shift_id: input.id,
              name: input.name,
              start_time: input.startTime,
              end_time: input.endTime,
              duration_hours: input.durationHours,
              grace_time: input.graceTime,
              late_rule_minutes: input.lateRuleMinutes,
              half_day_hours: input.halfDayHours,
            },
          });
          return { data: mapShiftTemplate(data) };
        } catch (error) {
          try {
            if (isFunctionsEndpointUnavailable(error)) {
              return { data: await updateShiftTemplateInFirestore(input) };
            }
          } catch (fallbackError) {
            return { error: { message: toUserErrorMessage(fallbackError) } };
          }
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Settings', 'Reports'],
    }),

    cloneShiftTemplate: builder.mutation<ShiftTemplate, { shopId: string; shiftId: string; name?: string }>({
      async queryFn({ shopId, shiftId, name }) {
        try {
          const existing = await getShiftTemplateById(shopId, shiftId);
          if (!existing) {
            return { error: { message: 'Shift not found.' } };
          }
          const cloned = await createShiftTemplateInFirestore({
            shopId,
            name: name?.trim() || `${existing.name} Copy`,
            startTime: existing.startTime,
            endTime: existing.endTime,
            durationHours: existing.durationHours,
            graceTime: existing.graceTime,
            lateRuleMinutes: existing.lateRuleMinutes,
            halfDayHours: existing.halfDayHours,
          });
          return { data: cloned };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Settings', 'Reports'],
    }),

    deleteShiftTemplate: builder.mutation<{ id: string }, { shopId: string; shiftId: string }>({
      async queryFn({ shopId, shiftId }) {
        try {
          const data = await callManagerEndpoint<{ id: string }>({
            endpointName: 'deleteShopShift',
            method: 'POST',
            body: {
              shopId,
              shift_id: shiftId,
            },
          });
          return { data };
        } catch (error) {
          try {
            if (isFunctionsEndpointUnavailable(error)) {
              return { data: await deleteShiftTemplateInFirestore(shopId, shiftId) };
            }
          } catch (fallbackError) {
            return { error: { message: toUserErrorMessage(fallbackError) } };
          }
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Settings', 'Reports'],
    }),

    getStaffWeeklyShiftPlanByStaff: builder.query<StaffWeeklyShiftDay[], { shopId: string; staffId: string }>({
      async queryFn({ shopId, staffId }) {
        try {
          return { data: await getStaffWeeklyShiftPlanFromFirestore(shopId, staffId) };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      providesTags: ['Settings'],
    }),

    saveStaffWeeklyShiftPlanV2: builder.mutation<StaffWeeklyShiftDay[], SaveStaffWeeklyShiftPlanInput>({
      async queryFn({ shopId, staffId, days }) {
        try {
          return { data: await saveAdvancedShiftPlanToFirestore({ shopId, staffId, days, mode: 'dynamic' }) };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Settings', 'Reports'],
    }),

    saveAdvancedShiftPlan: builder.mutation<StaffWeeklyShiftDay[], SaveAdvancedShiftPlanInput>({
      async queryFn(input) {
        try {
          return { data: await saveAdvancedShiftPlanToFirestore(input) };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Settings', 'Reports', 'Employees'],
    }),

    bulkAssignShiftPlan: builder.mutation<StaffWeeklyShiftDay[], BulkAssignShiftPlanInput>({
      async queryFn(input) {
        try {
          return { data: await bulkAssignShiftPlanInFirestore(input) };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      invalidatesTags: ['Settings', 'Reports', 'Employees'],
    }),

    getShopWeeklyShiftAssignments: builder.query<StaffWeeklyShiftDay[], { shopId: string }>({
      async queryFn({ shopId }) {
        try {
          const snapshot = await withFirestoreRetry(async () => employeesCol(shopId).get());
          const data = snapshot.docs
            .flatMap(doc => {
              const raw = (doc.data() ?? {}) as Record<string, unknown>;
              return parseStaffWeeklyShiftDays(raw.weekly_shift_assignments ?? raw.weeklyShiftAssignments, shopId, doc.id);
            })
            .sort((a, b) => a.staffId.localeCompare(b.staffId) || a.dayOfWeek - b.dayOfWeek);
          return { data };
        } catch (error) {
          return { error: { message: toUserErrorMessage(error) } };
        }
      },
      async onCacheEntryAdded({ shopId }, { cacheDataLoaded, cacheEntryRemoved, updateCachedData }) {
        try {
          await cacheDataLoaded;
        } catch {
          // Continue: listener can still recover cache when Firestore becomes reachable.
        }
        const unsubscribe = employeesCol(shopId).onSnapshot(
          snapshot => {
            if (!hasSnapshotDocs(snapshot)) {
              return;
            }
            const data = snapshot.docs
              .flatMap(doc => {
                const raw = (doc.data() ?? {}) as Record<string, unknown>;
                return parseStaffWeeklyShiftDays(raw.weekly_shift_assignments ?? raw.weeklyShiftAssignments, shopId, doc.id);
              })
              .sort((a, b) => a.staffId.localeCompare(b.staffId) || a.dayOfWeek - b.dayOfWeek);
            updateCachedData(() => data);
          },
          error => logSnapshotListenerError('SHOP_WEEKLY_ASSIGNMENTS_LISTENER', error),
        );
        await cacheEntryRemoved;
        unsubscribe();
      },
      providesTags: ['Settings', 'Reports'],
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
      async onCacheEntryAdded({ shopId, month }, { cacheDataLoaded, cacheEntryRemoved, updateCachedData }) {
        if (!isValidMonthKey(month)) {
          return;
        }
        try {
          await cacheDataLoaded;
        } catch {
          // Continue: listener can still recover cache when Firestore becomes reachable.
        }
        const unsubscribe = salaryCol(shopId)
          .where('month', '==', month)
          .onSnapshot(
            snapshot => {
              if (!hasSnapshotDocs(snapshot)) {
                return;
              }
              const data = snapshot.docs
                .map(doc => serialize<SalaryMonthly>(doc.id, doc.data() as Omit<SalaryMonthly, 'id'>))
                .sort((a, b) => a.employeeId.localeCompare(b.employeeId));
              updateCachedData(() => data);
            },
            error => logSnapshotListenerError('MONTHLY_SALARY_LISTENER', error),
          );
        await cacheEntryRemoved;
        unsubscribe();
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
          let salaryPaidCount = 0;
          salarySnap.docs.forEach(doc => {
            const row = doc.data() as SalaryMonthly;
            monthlyNetSalary += row.netSalary;
            lateEntriesThisMonth += row.lateEntries;
            if (row.salaryPaidAt) {
              salaryPaidCount += 1;
            }
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
          let advancePaidCount = 0;
          advancesSnap.docs.forEach(doc => {
            const row = doc.data() as EmployeeAdvance;
            advanceSalaryPaid += Number(row.amount || 0);
            advancePaidCount += 1;
          });

          return {
            data: {
              totalStaff: employeeSnap.size,
              presentStaff,
              punchErrors,
              todayDate: selectedDate,
              currentMonthProjectedSalary: Number(currentMonthProjectedSalary.toFixed(2)),
              advanceSalaryPaid: Number(advanceSalaryPaid.toFixed(2)),
              advancePaidCount,
              salaryPaidCount,
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

    getAttendanceAnalyticsReport: builder.query<AttendanceAnalyticsOutput, AttendanceAnalyticsFilter>({
      async queryFn({ shopId, fromDate, toDate, staffId }) {
        try {
          const [employeeSnap, attendanceSnap] = await Promise.all([
            withFirestoreRetry(async () => employeesCol(shopId).get()),
            withFirestoreRetry(async () =>
              attendanceCol(shopId)
                .where('date', '>=', fromDate)
                .where('date', '<=', toDate)
                .get(),
            ),
          ]);

          const employees = employeeSnap.docs
            .map(doc => {
              const raw = doc.data() as Record<string, unknown>;
              return {
                id: doc.id,
                joiningDate: String(raw.joiningDate ?? raw.joining_date ?? ''),
                weeklyOff: String(raw.weeklyOff ?? raw.weekly_off ?? 'none') as WeeklyOffDay,
              };
            })
            .filter(employee => !staffId || employee.id === staffId);

          const weeklyAssignmentsByStaffId = employeeSnap.docs.reduce<Record<string, StaffWeeklyShiftDay[]>>((acc, doc) => {
            if (staffId && doc.id !== staffId) {
              return acc;
            }
            const raw = doc.data() as Record<string, unknown>;
            acc[doc.id] = parseStaffWeeklyShiftDays(raw.weekly_shift_assignments ?? raw.weeklyShiftAssignments, shopId, doc.id);
            return acc;
          }, {});

          const attendance = attendanceSnap.docs
            .map(doc => serialize<AttendanceRecord>(doc.id, doc.data() as Omit<AttendanceRecord, 'id'>))
            .filter(record => !staffId || record.employeeId === staffId);

          return {
            data: calculateAttendanceAnalytics({
              attendanceRecords: attendance,
              employees,
              dateRange: { startDate: fromDate, endDate: toDate },
              staffId,
              weeklyAssignmentsByStaffId,
            }),
          };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      providesTags: ['Reports', 'Attendance'],
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
      async onCacheEntryAdded(shopId, { cacheDataLoaded, cacheEntryRemoved, updateCachedData }) {
        try {
          await cacheDataLoaded;
        } catch {
          // Continue: listener can still recover cache when Firestore becomes reachable.
        }
        const unsubscribe = payrollSettingsDoc(shopId).onSnapshot(
          snapshot => {
            if (!hasSnapshotExistsMethod(snapshot)) {
              return;
            }
            const data = (snapshot.data() as PayrollSettings | undefined) ?? {
              lateThreshold: 3,
              lateDeductionDays: 0.5,
              timezone: 'Asia/Kolkata',
            };
            updateCachedData(() => data);
          },
          error => logSnapshotListenerError('PAYROLL_SETTINGS_LISTENER', error),
        );
        await cacheEntryRemoved;
        unsubscribe();
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
      async onCacheEntryAdded(shopId, { cacheDataLoaded, cacheEntryRemoved, updateCachedData }) {
        try {
          await cacheDataLoaded;
        } catch {
          // Continue: listener can still recover cache when Firestore becomes reachable.
        }
        const unsubscribe = biometricSettingsDoc(shopId).onSnapshot(
          snapshot => {
            if (!hasSnapshotExistsMethod(snapshot)) {
              return;
            }
            const data = (snapshot.data() as BiometricSettings | undefined) ?? {
              enabled: false,
              deviceName: '',
              deviceId: '',
              syncWindowMinutes: 5,
              integrationMode: 'pull_agent',
            };
            updateCachedData(() => data);
          },
          error => logSnapshotListenerError('BIOMETRIC_SETTINGS_LISTENER', error),
        );
        await cacheEntryRemoved;
        unsubscribe();
      },
      providesTags: ['Biometric'],
    }),

    getGeoFencingSettings: builder.query<GeoFencingSettings, string>({
      async queryFn(shopId) {
        try {
          const snap = await geoFencingSettingsDoc(shopId).get();
          return { data: normalizeGeoFencingSettings(shopId, snap.data()) };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      async onCacheEntryAdded(shopId, { cacheDataLoaded, cacheEntryRemoved, updateCachedData }) {
        try {
          await cacheDataLoaded;
        } catch {
          // Listener can still recover state later.
        }
        const unsubscribe = geoFencingSettingsDoc(shopId).onSnapshot(
          snapshot => {
            if (!hasSnapshotExistsMethod(snapshot)) {
              return;
            }
            updateCachedData(() => normalizeGeoFencingSettings(shopId, snapshot.data()));
          },
          error => logSnapshotListenerError('GEO_FENCING_SETTINGS_LISTENER', error),
        );
        await cacheEntryRemoved;
        unsubscribe();
      },
      providesTags: ['Settings'],
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

    upsertGeoFencingSettings: builder.mutation<
      { ok: true; settings: GeoFencingSettings },
      {
        shopId: string;
        latitude: number;
        longitude: number;
        radius: number;
        enabled?: boolean;
        allowAttendanceWhenLocationMissing?: boolean;
        accuracyBufferMeters?: number;
        requireGpsAccuracyMeters?: number;
      }
    >({
      async queryFn({
        shopId,
        latitude,
        longitude,
        radius,
        enabled = true,
        allowAttendanceWhenLocationMissing,
        accuracyBufferMeters,
        requireGpsAccuracyMeters,
      }) {
        try {
          const validation = validateShopLocationConfig({ shopId, latitude, longitude, radius });
          if (!validation.ok) {
            return { error: { message: validation.message } };
          }

          const location = buildShopLocationConfig({ shopId, latitude, longitude, radius });
          const settings: GeoFencingSettings = {
            enabled,
            location,
            accuracyBufferMeters: Math.max(
              0,
              Number(accuracyBufferMeters ?? DEFAULT_GEO_FENCING_SETTINGS.accuracyBufferMeters),
            ),
            allowAttendanceWhenLocationMissing:
              allowAttendanceWhenLocationMissing ?? DEFAULT_GEO_FENCING_SETTINGS.allowAttendanceWhenLocationMissing,
            requireGpsAccuracyMeters: Math.max(
              0,
              Number(requireGpsAccuracyMeters ?? DEFAULT_GEO_FENCING_SETTINGS.requireGpsAccuracyMeters),
            ),
          };

          await geoFencingSettingsDoc(shopId).set(settings, { merge: true });
          return { data: { ok: true, settings } };
        } catch (error) {
          return { error: { message: (error as Error).message } };
        }
      },
      invalidatesTags: ['Settings'],
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
  useUpdateShopSelfServiceProfileMutation,
  useChangeShopManagerPasswordMutation,
  useDeleteShopManagerAccountMutation,
  useGetShopByIdQuery,
  useDeleteShopMutation,
  useGetStaffSelfProfileQuery,
  useGetStaffAttendanceSummaryQuery,
  useGetStaffAttendanceHistoryQuery,
  useStaffCheckInMutation,
  useStaffCheckOutMutation,
  useGetStaffSalaryOverviewQuery,
  useGetStaffShiftOverviewQuery,
  useRegisterEmployeeWithAuthMutation,
  useProvisionEmployeeAuthMutation,
  useSetEmployeeAuthAccessMutation,
  useChangeStaffPasswordMutation,
  useDeleteStaffAccountMutation,
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
  useGetShiftTemplatesQuery,
  useCreateShiftTemplateMutation,
  useUpdateShiftTemplateMutation,
  useCloneShiftTemplateMutation,
  useDeleteShiftTemplateMutation,
  useGetStaffWeeklyShiftPlanByStaffQuery,
  useSaveStaffWeeklyShiftPlanV2Mutation,
  useSaveAdvancedShiftPlanMutation,
  useBulkAssignShiftPlanMutation,
  useGetShopWeeklyShiftAssignmentsQuery,
  useUpsertShiftMutation,
  useMarkSalaryPaidMutation,
  useGetAdminDashboardQuery,
  useGetAdminAnalyticsQuery,
  useGetShopDashboardQuery,
  useGetShopAnalyticsQuery,
  useGetAttendanceReportQuery,
  useGetAttendanceAnalyticsReportQuery,
  useGetSalaryReportQuery,
  useGetPayrollSettingsQuery,
  useUpsertPayrollSettingsMutation,
  useGetBiometricSettingsQuery,
  useUpsertBiometricSettingsMutation,
  useGetGeoFencingSettingsQuery,
  useUpsertGeoFencingSettingsMutation,
} = hrmsApi;
