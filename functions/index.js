const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const SHOP_CHILD_COLLECTIONS = [
  'managers',
  'employees',
  'attendance',
  'salary',
  'advances',
  'shifts',
  'shift_name_registry',
  'staff_weekly_shifts',
  'weekly_shift_plans',
  'settings',
];

const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6];

async function deleteCollectionBatched(collectionRef, batchSize = 400) {
  while (true) {
    const snapshot = await collectionRef.limit(batchSize).get();
    if (snapshot.empty) {
      break;
    }
    const batch = admin.firestore().batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    if (snapshot.size < batchSize) {
      break;
    }
  }
}

async function verifySuperAdmin(req) {
  const authHeader = String(req.headers.authorization || '');
  const bearerPrefix = 'Bearer ';
  if (!authHeader.startsWith(bearerPrefix)) {
    return { ok: false, status: 401, message: 'Missing bearer token' };
  }

  const idToken = authHeader.slice(bearerPrefix.length).trim();
  const decoded = await admin.auth().verifyIdToken(idToken, true);
  if (String(decoded.role || '') !== 'super_admin') {
    return { ok: false, status: 403, message: 'Only super admin can perform this action.' };
  }
  return { ok: true, uid: decoded.uid };
}

async function verifyShopManager(req) {
  const authHeader = String(req.headers.authorization || '');
  const bearerPrefix = 'Bearer ';
  if (!authHeader.startsWith(bearerPrefix)) {
    return { ok: false, status: 401, message: 'Missing bearer token' };
  }

  const idToken = authHeader.slice(bearerPrefix.length).trim();
  const decoded = await admin.auth().verifyIdToken(idToken, true);
  const claimRole = String(decoded.role || '').trim();
  const claimShopId = String(decoded.shopId || '').trim();
  if (claimRole === 'shop_manager' && claimShopId) {
    return { ok: true, uid: decoded.uid, shopId: claimShopId };
  }

  const authUid = String(decoded.uid || '').trim();
  const authEmail = String(decoded.email || '').trim().toLowerCase();
  if (!authUid && !authEmail) {
    return { ok: false, status: 403, message: 'Only shop manager can perform this action.' };
  }

  let matchedShopDoc = null;

  if (authUid) {
    const shopByUid = await admin.firestore().collection('shops').where('authUid', '==', authUid).limit(1).get();
    if (!shopByUid.empty) {
      matchedShopDoc = shopByUid.docs[0];
    }
  }

  if (!matchedShopDoc && authEmail) {
    const shopByEmail = await admin.firestore().collection('shops').where('email', '==', authEmail).limit(1).get();
    if (!shopByEmail.empty) {
      matchedShopDoc = shopByEmail.docs[0];
    }
  }

  if (!matchedShopDoc) {
    return { ok: false, status: 403, message: 'Only shop manager can perform this action.' };
  }

  const shopData = matchedShopDoc.data() || {};
  if (String(shopData.status || 'active') !== 'active') {
    return { ok: false, status: 403, message: 'Only active shop managers can perform this action.' };
  }

  return { ok: true, uid: authUid, shopId: matchedShopDoc.id };
}

async function verifyStaff(req) {
  const authHeader = String(req.headers.authorization || '');
  const bearerPrefix = 'Bearer ';
  if (!authHeader.startsWith(bearerPrefix)) {
    return { ok: false, status: 401, message: 'Missing bearer token' };
  }

  const idToken = authHeader.slice(bearerPrefix.length).trim();
  const decoded = await admin.auth().verifyIdToken(idToken, true);
  if (String(decoded.role || '') !== 'staff') {
    return { ok: false, status: 403, message: 'Only staff can perform this action.' };
  }

  const shopId = String(decoded.shopId || '').trim();
  const employeeId = String(decoded.employeeId || '').trim();
  if (!shopId || !employeeId) {
    return { ok: false, status: 403, message: 'Staff claims are incomplete.' };
  }

  return { ok: true, uid: decoded.uid, shopId, employeeId };
}

async function getUserByEmailSafe(email) {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (error) {
    if (String(error?.code || '') === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
}

function trimmedString(value) {
  return String(value || '').trim();
}

function optionalString(value) {
  const normalized = trimmedString(value);
  return normalized || undefined;
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendMethodNotAllowed(res) {
  res.status(405).json({ ok: false, message: 'Method not allowed' });
}

function sendApiError(res, error, logLabel) {
  if (error instanceof ApiError) {
    res.status(error.status).json({ ok: false, message: error.message });
    return;
  }

  functions.logger.error(logLabel, error);
  res.status(500).json({
    ok: false,
    message: String(error?.message || error || 'Unknown server error'),
  });
}

function requireShopScope(authResult, requestedShopId) {
  const shopId = trimmedString(requestedShopId);
  if (!shopId || shopId !== authResult.shopId) {
    throw new ApiError(403, 'Shop scope mismatch.');
  }
  return shopId;
}

function normalizeShiftName(value) {
  return trimmedString(value).replace(/\s+/g, ' ').toLowerCase();
}

function parseTimeToMinutes(value, fieldLabel) {
  const normalized = trimmedString(value);
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    throw new ApiError(400, `${fieldLabel} must be in HH:mm format.`);
  }

  const [hourText, minuteText] = normalized.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new ApiError(400, `${fieldLabel} must be a valid time.`);
  }

  return hour * 60 + minute;
}

function parseRequiredNonNegativeNumber(value, fieldLabel) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new ApiError(400, `${fieldLabel} must be a non-negative number.`);
  }
  return numeric;
}

function sanitizeShiftPayload(payload = {}) {
  const name = trimmedString(payload.name);
  const startTime = trimmedString(payload.start_time || payload.startTime);
  const endTime = trimmedString(payload.end_time || payload.endTime);
  const rawDurationHours = payload.duration_hours ?? payload.durationHours;
  const graceTime = parseRequiredNonNegativeNumber(payload.grace_time ?? payload.graceTime, 'Grace time');
  const lateRuleMinutes = parseRequiredNonNegativeNumber(
    payload.late_rule_minutes ?? payload.lateRuleMinutes,
    'Late mark rule',
  );
  const halfDayHours = parseRequiredNonNegativeNumber(payload.half_day_hours ?? payload.halfDayHours, 'Half day rule');
  const durationHours =
    rawDurationHours === undefined || rawDurationHours === null || String(rawDurationHours).trim() === ''
      ? 8
      : parseRequiredNonNegativeNumber(rawDurationHours, 'Duration');

  if (!name) {
    throw new ApiError(400, 'Shift name is required.');
  }
  if (!startTime) {
    throw new ApiError(400, 'Start time is required.');
  }
  if (!endTime) {
    throw new ApiError(400, 'End time is required.');
  }

  const startMinutes = parseTimeToMinutes(startTime, 'Start time');
  const endMinutes = parseTimeToMinutes(endTime, 'End time');
  let shiftDurationMinutes = endMinutes - startMinutes;
  if (shiftDurationMinutes < 0) {
    shiftDurationMinutes += 24 * 60;
  }
  if (shiftDurationMinutes === 0) {
    throw new ApiError(400, 'Start time and end time must define a valid shift duration.');
  }

  return {
    name,
    name_normalized: normalizeShiftName(name),
    start_time: startTime,
    end_time: endTime,
    duration_hours: durationHours,
    grace_time: graceTime,
    late_rule_minutes: lateRuleMinutes,
    half_day_hours: halfDayHours,
  };
}

function shopRef(shopId) {
  return admin.firestore().collection('shops').doc(shopId);
}

function shiftsRef(shopId) {
  return shopRef(shopId).collection('shifts');
}

function shiftNameRegistryRef(shopId) {
  return shopRef(shopId).collection('shift_name_registry');
}

function staffRef(shopId, staffId) {
  return shopRef(shopId).collection('employees').doc(staffId);
}

function staffWeeklyShiftsRef(shopId) {
  return shopRef(shopId).collection('staff_weekly_shifts');
}

function buildShiftResponse(id, data = {}) {
  return {
    id,
    shop_id: trimmedString(data.shop_id),
    name: trimmedString(data.name),
    start_time: trimmedString(data.start_time),
    end_time: trimmedString(data.end_time),
    duration_hours: toFiniteNumber(data.duration_hours, 8),
    grace_time: toFiniteNumber(data.grace_time, 0),
    late_rule_minutes: toFiniteNumber(data.late_rule_minutes, 0),
    half_day_hours: toFiniteNumber(data.half_day_hours, 0),
    created_at: trimmedString(data.created_at),
    updated_at: trimmedString(data.updated_at),
  };
}

function sanitizeWeeklyPlanPayload(payload = {}) {
  const entries = Array.isArray(payload.days) ? payload.days : Array.isArray(payload.entries) ? payload.entries : null;
  if (!entries || entries.length !== 7) {
    throw new ApiError(400, 'Weekly plan must include exactly 7 day entries.');
  }

  const seenDays = new Set();
  let workingDayCount = 0;

  const sanitizedEntries = entries.map(rawItem => {
    const dayOfWeek = Number(rawItem?.day_of_week ?? rawItem?.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || !DAYS_OF_WEEK.includes(dayOfWeek)) {
      throw new ApiError(400, 'day_of_week must be an integer between 0 and 6.');
    }
    if (seenDays.has(dayOfWeek)) {
      throw new ApiError(400, 'Each day of week must appear only once.');
    }
    seenDays.add(dayOfWeek);

    const isOff = Boolean(rawItem?.is_off ?? rawItem?.isOff);
    const shiftId = trimmedString(rawItem?.shift_id ?? rawItem?.shiftId);

    if (isOff && shiftId) {
      throw new ApiError(400, 'A day cannot be both off and assigned to a shift.');
    }
    if (!isOff && !shiftId) {
      throw new ApiError(400, 'Each day must have either a shift assignment or be marked as off.');
    }

    if (!isOff) {
      workingDayCount += 1;
    }

    return {
      day_of_week: dayOfWeek,
      shift_id: isOff ? null : shiftId,
      is_off: isOff,
    };
  });

  if (seenDays.size !== 7) {
    throw new ApiError(400, 'Weekly plan must include all 7 days.');
  }
  if (workingDayCount === 0) {
    throw new ApiError(400, 'At least one working day must be assigned.');
  }

  return sanitizedEntries.sort((a, b) => a.day_of_week - b.day_of_week);
}

async function requireActiveStaff(shopId, staffId) {
  const normalizedStaffId = trimmedString(staffId);
  if (!normalizedStaffId) {
    throw new ApiError(400, 'staff_id is required.');
  }

  const staffSnap = await staffRef(shopId, normalizedStaffId).get();
  if (!staffSnap.exists) {
    throw new ApiError(404, 'Staff member not found.');
  }

  const staffData = staffSnap.data() || {};
  if (trimmedString(staffData.status || 'active') !== 'active') {
    throw new ApiError(400, 'Weekly shifts can only be assigned to active staff members.');
  }

  return { id: normalizedStaffId, data: staffData };
}

async function getShiftDocsById(shopId, shiftIds) {
  const uniqueShiftIds = Array.from(new Set(shiftIds.map(value => trimmedString(value)).filter(Boolean)));
  if (!uniqueShiftIds.length) {
    return new Map();
  }

  const refs = uniqueShiftIds.map(shiftId => shiftsRef(shopId).doc(shiftId));
  const snapshots = await admin.firestore().getAll(...refs);
  const byId = new Map();

  snapshots.forEach(snapshot => {
    if (snapshot.exists) {
      byId.set(snapshot.id, snapshot.data() || {});
    }
  });

  return byId;
}

function buildWeeklyShiftResponse(id, data = {}) {
  return {
    id,
    shop_id: trimmedString(data.shop_id),
    staff_id: trimmedString(data.staff_id),
    day_of_week: Number(data.day_of_week),
    shift_id: data.shift_id ? trimmedString(data.shift_id) : null,
    is_off: Boolean(data.is_off),
    created_at: trimmedString(data.created_at),
    updated_at: trimmedString(data.updated_at),
  };
}

function weekdayFromDate(dateInput) {
  const value = trimmedString(dateInput);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, 'date must be in YYYY-MM-DD format.');
  }

  const [yearText, monthText, dayText] = value.split('-');
  const utcDate = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
  if (Number.isNaN(utcDate.getTime())) {
    throw new ApiError(400, 'date must be a valid calendar date.');
  }

  return (utcDate.getUTCDay() + 6) % 7;
}

function buildEmployeeRegistrationDoc({ shopId, employeeId, payload, loginEmail, authUid }) {
  const employeeCode = trimmedString(payload?.employeeCode);
  const name = trimmedString(payload?.name);
  const phone = trimmedString(payload?.phone);
  const designation = trimmedString(payload?.designation);
  const joiningDate = trimmedString(payload?.joiningDate);
  const taluka = trimmedString(payload?.taluka);
  const district = trimmedString(payload?.district);
  const aadhaarNo = trimmedString(payload?.aadhaarNo);
  const status = trimmedString(payload?.status) === 'inactive' ? 'inactive' : 'active';
  const today = new Date().toISOString().slice(0, 10);

  if (!employeeCode || !name || !phone || !designation || !joiningDate) {
    throw new Error('Required staff details are missing.');
  }
  if (!taluka || !district) {
    throw new Error('Taluka and district are required.');
  }
  if (!aadhaarNo || !/^\d{12}$/.test(aadhaarNo)) {
    throw new Error('Aadhaar number must be 12 digits.');
  }

  const basicSalary = toFiniteNumber(payload?.basicSalary, NaN);
  if (!Number.isFinite(basicSalary) || basicSalary <= 0) {
    throw new Error('Basic salary must be greater than zero.');
  }

  const addressLine1 = optionalString(payload?.addressLine1);
  const address = [addressLine1, taluka, district].filter(Boolean).join(', ');
  const biometricConsent = Boolean(payload?.biometricConsent);
  const biometricUserId = optionalString(payload?.biometricUserId);

  if (biometricConsent && !biometricUserId) {
    throw new Error('Biometric user ID is required when biometric consent is enabled.');
  }

  const activatedAt = optionalString(payload?.activatedAt) || joiningDate || today;
  const deactivatedAt = status === 'inactive' ? optionalString(payload?.deactivatedAt) || today : undefined;
  const now = new Date().toISOString();

  const doc = {
    id: employeeId,
    shopId,
    employeeCode,
    name,
    phone,
    loginEmail,
    address,
    addressLine1,
    taluka,
    district,
    organization: optionalString(payload?.organization),
    designation,
    joiningDate,
    aadhaarNo,
    salaryType: 'monthly',
    basicSalary,
    pfAmount: toFiniteNumber(payload?.pfAmount, 0),
    overtimeRatePerHour: toFiniteNumber(payload?.overtimeRatePerHour, 0),
    defaultShiftId: optionalString(payload?.defaultShiftId),
    weeklyOff: optionalString(payload?.weeklyOff) || 'none',
    biometricUserId,
    biometricConsent,
    biometricRegisteredAt: optionalString(payload?.biometricRegisteredAt),
    authUid,
    authStatus: payload?.authEnabled === false ? 'disabled' : 'provisioned',
    authProvisionedAt: now,
    authDisabledAt: payload?.authEnabled === false ? now : undefined,
    authLastError: undefined,
    status,
    activatedAt,
    deactivatedAt,
    createdAt: optionalString(payload?.createdAt) || now,
    updatedAt: now,
  };

  return Object.fromEntries(
    Object.entries(doc).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  );
}

async function provisionOrReuseStaffAuthUser({ shopId, employeeId, email, password, displayName, employeeData, disabled }) {
  const existingByEmail = await getUserByEmailSafe(email);
  const linkedUid = trimmedString(employeeData?.authUid);
  if (existingByEmail && linkedUid && existingByEmail.uid !== linkedUid) {
    throw new Error('Email already belongs to a different auth account.');
  }

  let userRecord = existingByEmail;
  let created = false;

  if (!userRecord && linkedUid) {
    try {
      userRecord = await admin.auth().getUser(linkedUid);
    } catch (error) {
      if (String(error?.code || '') !== 'auth/user-not-found') {
        throw error;
      }
    }
  }

  if (!userRecord) {
    userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || trimmedString(employeeData?.name) || undefined,
      disabled: false,
    });
    created = true;
  } else {
    const currentClaims = userRecord.customClaims || {};
    const currentRole = trimmedString(currentClaims.role);
    const currentShopId = trimmedString(currentClaims.shopId);
    const currentEmployeeId = trimmedString(currentClaims.employeeId);
    if (
      currentRole &&
      (currentRole !== 'staff' || (currentShopId && currentShopId !== shopId) || (currentEmployeeId && currentEmployeeId !== employeeId))
    ) {
      throw new Error('Existing auth account is already linked to another role or staff profile.');
    }

    await admin.auth().updateUser(userRecord.uid, {
      email,
      password,
      displayName: displayName || trimmedString(employeeData?.name) || undefined,
      disabled: false,
    });
    userRecord = await admin.auth().getUser(userRecord.uid);
  }

  await admin.auth().setCustomUserClaims(userRecord.uid, {
    role: 'staff',
    shopId,
    employeeId,
  });

  if (disabled) {
    await admin.auth().updateUser(userRecord.uid, { disabled: true });
    userRecord = await admin.auth().getUser(userRecord.uid);
  }

  return { userRecord, created };
}

exports.deleteShopAuthUserByAdmin = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  try {
    const authHeader = String(req.headers.authorization || '');
    const bearerPrefix = 'Bearer ';
    if (!authHeader.startsWith(bearerPrefix)) {
      res.status(401).json({ ok: false, message: 'Missing bearer token' });
      return;
    }

    const idToken = authHeader.slice(bearerPrefix.length).trim();
    const decoded = await admin.auth().verifyIdToken(idToken, true);
    if (String(decoded.role || '') !== 'super_admin') {
      res.status(403).json({ ok: false, message: 'Only super admin can delete auth users.' });
      return;
    }

    const rawUid = String(req.body?.uid || '').trim();
    const rawEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!rawUid && !rawEmail) {
      res.status(400).json({ ok: false, message: 'uid or email is required' });
      return;
    }

    let targetUid = rawUid;
    if (!targetUid) {
      try {
        const user = await admin.auth().getUserByEmail(rawEmail);
        targetUid = user.uid;
      } catch (error) {
        if (String(error?.code || '') === 'auth/user-not-found') {
          res.status(200).json({ ok: true, deleted: false, reason: 'user-not-found' });
          return;
        }
        throw error;
      }
    }

    try {
      await admin.auth().deleteUser(targetUid);
      res.status(200).json({ ok: true, deleted: true, uid: targetUid });
    } catch (error) {
      if (String(error?.code || '') === 'auth/user-not-found') {
        res.status(200).json({ ok: true, deleted: false, reason: 'user-not-found' });
        return;
      }
      throw error;
    }
  } catch (error) {
    functions.logger.error('deleteShopAuthUserByAdmin failed', error);
    res.status(500).json({
      ok: false,
      message: String(error?.message || error || 'Unknown server error'),
    });
  }
});

exports.deleteShopByAdmin = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  try {
    const authResult = await verifySuperAdmin(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, message: authResult.message });
      return;
    }

    const shopId = String(req.body?.shopId || '').trim();
    if (!shopId) {
      res.status(400).json({ ok: false, message: 'shopId is required' });
      return;
    }

    const db = admin.firestore();
    const shopRef = db.collection('shops').doc(shopId);
    const shopSnap = await shopRef.get();
    if (!shopSnap.exists) {
      res.status(200).json({ ok: true, deleted: false, reason: 'shop-not-found' });
      return;
    }

    const shop = shopSnap.data() || {};
    const rawUid = String(shop.authUid || '').trim();
    const rawEmail = String(shop.email || '').trim().toLowerCase();

    let targetUid = rawUid;
    if (!targetUid && rawEmail) {
      try {
        const user = await admin.auth().getUserByEmail(rawEmail);
        targetUid = user.uid;
      } catch (error) {
        if (String(error?.code || '') !== 'auth/user-not-found') {
          throw error;
        }
      }
    }

    if (targetUid) {
      try {
        await admin.auth().deleteUser(targetUid);
      } catch (error) {
        if (String(error?.code || '') !== 'auth/user-not-found') {
          throw error;
        }
      }
    }

    for (const name of SHOP_CHILD_COLLECTIONS) {
      await deleteCollectionBatched(shopRef.collection(name));
    }

    await shopRef.delete();

    res.status(200).json({
      ok: true,
      deleted: true,
      shopId,
      deletedAuthUid: targetUid || null,
    });
  } catch (error) {
    functions.logger.error('deleteShopByAdmin failed', error);
    res.status(500).json({
      ok: false,
      message: String(error?.message || error || 'Unknown server error'),
    });
  }
});

exports.provisionStaffAuthUserByManager = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  try {
    const authResult = await verifyShopManager(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, message: authResult.message });
      return;
    }

    const shopId = String(req.body?.shopId || '').trim();
    const employeeId = String(req.body?.employeeId || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '').trim();
    const displayName = String(req.body?.displayName || '').trim();

    if (!shopId || shopId !== authResult.shopId) {
      res.status(403).json({ ok: false, message: 'Shop scope mismatch.' });
      return;
    }
    if (!employeeId) {
      res.status(400).json({ ok: false, message: 'employeeId is required.' });
      return;
    }
    if (!email || !email.includes('@')) {
      res.status(400).json({ ok: false, message: 'Valid staff login email is required.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ ok: false, message: 'Staff password must be at least 6 characters.' });
      return;
    }

    const employeeRef = admin.firestore().collection('shops').doc(shopId).collection('employees').doc(employeeId);
    const employeeSnap = await employeeRef.get();
    if (!employeeSnap.exists) {
      res.status(404).json({ ok: false, message: 'Employee record not found.' });
      return;
    }

    const employeeData = employeeSnap.data() || {};
    if (String(employeeData.status || 'active') !== 'active') {
      res.status(400).json({ ok: false, message: 'Only active staff can receive login access.' });
      return;
    }

    const { userRecord, created } = await provisionOrReuseStaffAuthUser({
      shopId,
      employeeId,
      email,
      password,
      displayName,
      employeeData,
      disabled: false,
    });

    res.status(200).json({
      ok: true,
      uid: userRecord.uid,
      created,
    });
  } catch (error) {
    functions.logger.error('provisionStaffAuthUserByManager failed', error);
    res.status(500).json({
      ok: false,
      message: String(error?.message || error || 'Unknown server error'),
    });
  }
});

exports.registerStaffByManager = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  let createdUid = '';
  let createdAuthUser = false;

  try {
    const authResult = await verifyShopManager(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, message: authResult.message });
      return;
    }

    const shopId = trimmedString(req.body?.shopId);
    const employeeId = trimmedString(req.body?.employeeId);
    const email = trimmedString(req.body?.email).toLowerCase();
    const password = trimmedString(req.body?.password);
    const employeePayload = req.body?.employee || {};

    if (!shopId || shopId !== authResult.shopId) {
      res.status(403).json({ ok: false, message: 'Shop scope mismatch.' });
      return;
    }
    if (!employeeId) {
      res.status(400).json({ ok: false, message: 'employeeId is required.' });
      return;
    }
    if (!email || !email.includes('@')) {
      res.status(400).json({ ok: false, message: 'Valid staff login email is required.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ ok: false, message: 'Staff password must be at least 6 characters.' });
      return;
    }

    const employeeRef = admin.firestore().collection('shops').doc(shopId).collection('employees').doc(employeeId);
    const employeeSnap = await employeeRef.get();
    if (employeeSnap.exists) {
      res.status(409).json({ ok: false, message: 'Staff member already exists. Open edit mode to update this profile.' });
      return;
    }

    const employeeDoc = buildEmployeeRegistrationDoc({
      shopId,
      employeeId,
      payload: employeePayload,
      loginEmail: email,
      authUid: '',
    });

    const { userRecord, created } = await provisionOrReuseStaffAuthUser({
      shopId,
      employeeId,
      email,
      password,
      displayName: trimmedString(employeePayload?.name),
      employeeData: employeeDoc,
      disabled: employeePayload?.authEnabled === false,
    });
    createdUid = userRecord.uid;
    createdAuthUser = created;

    const finalDoc = buildEmployeeRegistrationDoc({
      shopId,
      employeeId,
      payload: employeePayload,
      loginEmail: email,
      authUid: userRecord.uid,
    });

    await employeeRef.set(finalDoc);

    res.status(200).json({
      ok: true,
      employee: finalDoc,
      uid: userRecord.uid,
      created,
    });
  } catch (error) {
    if (createdAuthUser && createdUid) {
      try {
        await admin.auth().deleteUser(createdUid);
      } catch (rollbackError) {
        functions.logger.error('registerStaffByManager rollback failed', rollbackError);
      }
    }

    functions.logger.error('registerStaffByManager failed', error);
    res.status(500).json({
      ok: false,
      message: String(error?.message || error || 'Unknown server error'),
    });
  }
});

exports.setStaffAuthDisabledByManager = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  try {
    const authResult = await verifyShopManager(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, message: authResult.message });
      return;
    }

    const shopId = String(req.body?.shopId || '').trim();
    const employeeId = String(req.body?.employeeId || '').trim();
    const uid = String(req.body?.uid || '').trim();
    const disabled = Boolean(req.body?.disabled);

    if (!shopId || shopId !== authResult.shopId) {
      res.status(403).json({ ok: false, message: 'Shop scope mismatch.' });
      return;
    }
    if (!employeeId || !uid) {
      res.status(400).json({ ok: false, message: 'employeeId and uid are required.' });
      return;
    }

    const employeeRef = admin.firestore().collection('shops').doc(shopId).collection('employees').doc(employeeId);
    const employeeSnap = await employeeRef.get();
    if (!employeeSnap.exists) {
      res.status(404).json({ ok: false, message: 'Employee record not found.' });
      return;
    }

    const userRecord = await admin.auth().getUser(uid);
    const currentClaims = userRecord.customClaims || {};
    if (
      String(currentClaims.role || '') !== 'staff' ||
      String(currentClaims.shopId || '') !== shopId ||
      String(currentClaims.employeeId || '') !== employeeId
    ) {
      res.status(409).json({ ok: false, message: 'Auth account is not linked to the requested staff profile.' });
      return;
    }

    await admin.auth().updateUser(uid, { disabled });
    res.status(200).json({ ok: true, uid, disabled });
  } catch (error) {
    functions.logger.error('setStaffAuthDisabledByManager failed', error);
    res.status(500).json({
      ok: false,
      message: String(error?.message || error || 'Unknown server error'),
    });
  }
});

exports.deleteOwnStaffAccount = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  try {
    const authResult = await verifyStaff(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, message: authResult.message });
      return;
    }

    const employeeRef = admin.firestore().collection('shops').doc(authResult.shopId).collection('employees').doc(authResult.employeeId);
    const employeeSnap = await employeeRef.get();
    if (!employeeSnap.exists) {
      res.status(404).json({ ok: false, message: 'Staff profile not found.' });
      return;
    }

    const employeeData = employeeSnap.data() || {};
    if (String(employeeData.authUid || '').trim() && String(employeeData.authUid || '').trim() !== authResult.uid) {
      res.status(409).json({ ok: false, message: 'Staff auth link mismatch.' });
      return;
    }

    await employeeRef.set(
      {
        authUid: admin.firestore.FieldValue.delete(),
        authStatus: 'not_created',
        authProvisionedAt: admin.firestore.FieldValue.delete(),
        authDisabledAt: admin.firestore.FieldValue.delete(),
        authLastError: admin.firestore.FieldValue.delete(),
        lastLoginAt: admin.firestore.FieldValue.delete(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    await admin.auth().deleteUser(authResult.uid);
    res.status(200).json({ ok: true, deleted: true });
  } catch (error) {
    functions.logger.error('deleteOwnStaffAccount failed', error);
    res.status(500).json({
      ok: false,
      message: String(error?.message || error || 'Unknown server error'),
    });
  }
});

exports.listShopShifts = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'GET') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const authResult = await verifyShopManager(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, message: authResult.message });
      return;
    }

    const shopId = requireShopScope(authResult, req.query?.shopId);
    const snapshot = await shiftsRef(shopId).get();
    const shifts = snapshot.docs
      .map(doc => buildShiftResponse(doc.id, doc.data() || {}))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    res.status(200).json({ ok: true, data: shifts });
  } catch (error) {
    sendApiError(res, error, 'listShopShifts failed');
  }
});

exports.createShopShift = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const authResult = await verifyShopManager(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, message: authResult.message });
      return;
    }

    const shopId = requireShopScope(authResult, req.body?.shopId || req.body?.shop_id);
    const shiftInput = sanitizeShiftPayload(req.body);
    const shiftId = shiftsRef(shopId).doc().id;
    const shiftDocRef = shiftsRef(shopId).doc(shiftId);
    const nameRegistryDocRef = shiftNameRegistryRef(shopId).doc(shiftInput.name_normalized);
    const now = new Date().toISOString();

    await admin.firestore().runTransaction(async transaction => {
      const nameRegistrySnap = await transaction.get(nameRegistryDocRef);
      if (nameRegistrySnap.exists) {
        throw new ApiError(409, 'Shift name must be unique within the shop.');
      }

      transaction.set(shiftDocRef, {
        id: shiftId,
        shop_id: shopId,
        ...shiftInput,
        created_at: now,
        updated_at: now,
      });
      transaction.set(nameRegistryDocRef, {
        shift_id: shiftId,
        shop_id: shopId,
        name_normalized: shiftInput.name_normalized,
        created_at: now,
        updated_at: now,
      });
    });

    const savedShift = await shiftDocRef.get();
    res.status(201).json({
      ok: true,
      message: 'Shift Created Successfully',
      data: buildShiftResponse(savedShift.id, savedShift.data() || {}),
    });
  } catch (error) {
    sendApiError(res, error, 'createShopShift failed');
  }
});

exports.updateShopShift = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'PUT' && req.method !== 'PATCH') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const authResult = await verifyShopManager(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, message: authResult.message });
      return;
    }

    const shopId = requireShopScope(authResult, req.body?.shopId || req.body?.shop_id);
    const shiftId = trimmedString(req.body?.shiftId || req.body?.shift_id);
    if (!shiftId) {
      throw new ApiError(400, 'shift_id is required.');
    }

    const shiftInput = sanitizeShiftPayload(req.body);
    const shiftDocRef = shiftsRef(shopId).doc(shiftId);
    const nextRegistryRef = shiftNameRegistryRef(shopId).doc(shiftInput.name_normalized);
    const now = new Date().toISOString();

    await admin.firestore().runTransaction(async transaction => {
      const shiftSnap = await transaction.get(shiftDocRef);
      if (!shiftSnap.exists) {
        throw new ApiError(404, 'Shift not found.');
      }

      const existingShift = shiftSnap.data() || {};
      const previousNormalizedName = trimmedString(existingShift.name_normalized);
      const previousRegistryRef = previousNormalizedName
        ? shiftNameRegistryRef(shopId).doc(previousNormalizedName)
        : null;

      const nextRegistrySnap = await transaction.get(nextRegistryRef);
      if (nextRegistrySnap.exists && trimmedString(nextRegistrySnap.data()?.shift_id) !== shiftId) {
        throw new ApiError(409, 'Shift name must be unique within the shop.');
      }

      if (previousRegistryRef && previousNormalizedName && previousNormalizedName !== shiftInput.name_normalized) {
        transaction.delete(previousRegistryRef);
      }

      transaction.set(
        shiftDocRef,
        {
          shop_id: shopId,
          ...shiftInput,
          created_at: trimmedString(existingShift.created_at) || now,
          updated_at: now,
        },
        { merge: true },
      );
      transaction.set(
        nextRegistryRef,
        {
          shift_id: shiftId,
          shop_id: shopId,
          name_normalized: shiftInput.name_normalized,
          created_at: nextRegistrySnap.exists ? trimmedString(nextRegistrySnap.data()?.created_at) || now : now,
          updated_at: now,
        },
        { merge: true },
      );
    });

    const savedShift = await shiftDocRef.get();
    res.status(200).json({
      ok: true,
      message: 'Shift Updated Successfully',
      data: buildShiftResponse(savedShift.id, savedShift.data() || {}),
    });
  } catch (error) {
    sendApiError(res, error, 'updateShopShift failed');
  }
});

exports.deleteShopShift = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const authResult = await verifyShopManager(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, message: authResult.message });
      return;
    }

    const input = req.method === 'DELETE' ? req.query : req.body;
    const shopId = requireShopScope(authResult, input?.shopId || input?.shop_id);
    const shiftId = trimmedString(input?.shiftId || input?.shift_id);
    if (!shiftId) {
      throw new ApiError(400, 'shift_id is required.');
    }

    const shiftDocRef = shiftsRef(shopId).doc(shiftId);
    const shiftSnap = await shiftDocRef.get();
    if (!shiftSnap.exists) {
      res.status(404).json({ ok: false, message: 'Shift not found.' });
      return;
    }

    const dependencySnap = await staffWeeklyShiftsRef(shopId).where('shift_id', '==', shiftId).limit(1).get();
    if (!dependencySnap.empty) {
      throw new ApiError(409, 'Shift is assigned in the weekly planner and cannot be deleted.');
    }

    const shiftData = shiftSnap.data() || {};
    const nameRegistryDocRef = shiftNameRegistryRef(shopId).doc(trimmedString(shiftData.name_normalized));

    await admin.firestore().runTransaction(async transaction => {
      transaction.delete(shiftDocRef);
      if (trimmedString(shiftData.name_normalized)) {
        transaction.delete(nameRegistryDocRef);
      }
    });

    res.status(200).json({
      ok: true,
      message: 'Shift Deleted Successfully',
      data: { id: shiftId },
    });
  } catch (error) {
    sendApiError(res, error, 'deleteShopShift failed');
  }
});

exports.getStaffWeeklyShiftPlan = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'GET') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const authResult = await verifyShopManager(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, message: authResult.message });
      return;
    }

    const shopId = requireShopScope(authResult, req.query?.shopId || req.query?.shop_id);
    const staffId = trimmedString(req.query?.staffId || req.query?.staff_id);
    await requireActiveStaff(shopId, staffId);

    const snapshot = await staffWeeklyShiftsRef(shopId).where('staff_id', '==', staffId).get();
    const byDay = new Map(
      snapshot.docs.map(doc => {
        const item = buildWeeklyShiftResponse(doc.id, doc.data() || {});
        return [item.day_of_week, item];
      }),
    );

    const data = DAYS_OF_WEEK.map(dayOfWeek => {
      const existing = byDay.get(dayOfWeek);
      if (existing) {
        return existing;
      }

      return {
        id: `${staffId}_${dayOfWeek}`,
        shop_id: shopId,
        staff_id: staffId,
        day_of_week: dayOfWeek,
        shift_id: null,
        is_off: false,
        created_at: '',
        updated_at: '',
      };
    });

    res.status(200).json({ ok: true, data });
  } catch (error) {
    sendApiError(res, error, 'getStaffWeeklyShiftPlan failed');
  }
});

exports.saveStaffWeeklyShiftPlan = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'PUT') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const authResult = await verifyShopManager(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, message: authResult.message });
      return;
    }

    const shopId = requireShopScope(authResult, req.body?.shopId || req.body?.shop_id);
    const staffId = trimmedString(req.body?.staffId || req.body?.staff_id);
    await requireActiveStaff(shopId, staffId);

    const days = sanitizeWeeklyPlanPayload(req.body);
    const workingShiftIds = days.filter(item => !item.is_off).map(item => item.shift_id);
    const shiftsById = await getShiftDocsById(shopId, workingShiftIds);

    for (const shiftId of workingShiftIds) {
      if (!shiftsById.has(shiftId)) {
        throw new ApiError(400, `Shift ${shiftId} does not exist in this shop.`);
      }
    }

    const collectionRef = staffWeeklyShiftsRef(shopId);
    const now = new Date().toISOString();
    const batch = admin.firestore().batch();
    const existingSnapshot = await collectionRef.where('staff_id', '==', staffId).get();
    const existingByDay = new Map(
      existingSnapshot.docs.map(doc => {
        const data = doc.data() || {};
        return [Number(data.day_of_week), doc];
      }),
    );

    days.forEach(item => {
      const docId = `${staffId}_${item.day_of_week}`;
      const existingDoc = existingByDay.get(item.day_of_week);
      const docRef = collectionRef.doc(docId);
      const createdAt = existingDoc?.data()?.created_at || now;

      batch.set(
        docRef,
        {
          id: docId,
          shop_id: shopId,
          staff_id: staffId,
          day_of_week: item.day_of_week,
          shift_id: item.is_off ? null : item.shift_id,
          is_off: item.is_off,
          created_at: createdAt,
          updated_at: now,
        },
        { merge: true },
      );
    });

    await batch.commit();

    const savedSnapshot = await collectionRef.where('staff_id', '==', staffId).get();
    const data = savedSnapshot.docs
      .map(doc => buildWeeklyShiftResponse(doc.id, doc.data() || {}))
      .sort((a, b) => a.day_of_week - b.day_of_week);

    res.status(200).json({
      ok: true,
      message: 'Weekly Shift Plan Saved',
      data,
    });
  } catch (error) {
    sendApiError(res, error, 'saveStaffWeeklyShiftPlan failed');
  }
});

exports.getStaffAssignedShiftForDay = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'GET') {
    sendMethodNotAllowed(res);
    return;
  }

  try {
    const authResult = await verifyShopManager(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ ok: false, message: authResult.message });
      return;
    }

    const shopId = requireShopScope(authResult, req.query?.shopId || req.query?.shop_id);
    const staffId = trimmedString(req.query?.staffId || req.query?.staff_id);
    await requireActiveStaff(shopId, staffId);

    const requestedDayRaw = req.query?.dayOfWeek ?? req.query?.day_of_week;
    const requestedDate = req.query?.date;
    const dayOfWeek =
      requestedDayRaw !== undefined && requestedDayRaw !== null && String(requestedDayRaw).trim() !== ''
        ? Number(requestedDayRaw)
        : weekdayFromDate(requestedDate);

    if (!Number.isInteger(dayOfWeek) || !DAYS_OF_WEEK.includes(dayOfWeek)) {
      throw new ApiError(400, 'day_of_week must be an integer between 0 and 6.');
    }

    const assignmentDocId = `${staffId}_${dayOfWeek}`;
    const assignmentSnap = await staffWeeklyShiftsRef(shopId).doc(assignmentDocId).get();
    if (!assignmentSnap.exists) {
      res.status(404).json({
        ok: false,
        message: 'Staff has no weekly shift plan for the requested day.',
      });
      return;
    }

    const assignment = buildWeeklyShiftResponse(assignmentSnap.id, assignmentSnap.data() || {});
    let shift = null;
    if (!assignment.is_off && assignment.shift_id) {
      const shiftSnap = await shiftsRef(shopId).doc(assignment.shift_id).get();
      if (!shiftSnap.exists) {
        throw new ApiError(409, 'Assigned shift no longer exists.');
      }
      shift = buildShiftResponse(shiftSnap.id, shiftSnap.data() || {});
    }

    res.status(200).json({
      ok: true,
      data: {
        assignment,
        shift,
      },
    });
  } catch (error) {
    sendApiError(res, error, 'getStaffAssignedShiftForDay failed');
  }
});
