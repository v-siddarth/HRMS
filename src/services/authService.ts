import app from '@react-native-firebase/app';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser, Employee, Shop } from '../types/models';
import {
  HARDCODED_ADMIN,
  LOCAL_ADMIN_SESSION_KEY,
  LOCAL_ADMIN_UID,
  LOCAL_SHOP_SESSION_KEY,
} from '../config/auth';
import { auth, employeeDoc, employeesCol, firestore, shopsCol } from './firebase';
import { logError, logInfo } from '../utils/logger';

const normalize = (value: string) => value.trim().toLowerCase();
const DELETED_SHOP_AUTH_HINTS_KEY = 'hrms_deleted_shop_auth_hints_v1';

type DeletedShopAuthHint = {
  uid: string;
  savedAt: string;
};

const FUNCTIONS_REGION = 'us-central1';

const buildSecondaryFirebaseOptions = () => {
  const options = app.app().options;
  const projectId = String(options.projectId ?? '').trim();

  return {
    apiKey: String(options.apiKey ?? '').trim(),
    appId: String(options.appId ?? '').trim(),
    projectId,
    messagingSenderId: String(options.messagingSenderId ?? '').trim(),
    storageBucket: String(options.storageBucket ?? '').trim(),
    databaseURL:
      String(options.databaseURL ?? '').trim() ||
      (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : 'https://placeholder.firebaseio.com'),
  };
};

const getLocalAdminUser = (): AuthUser => ({
  uid: LOCAL_ADMIN_UID,
  email: HARDCODED_ADMIN.email,
  role: 'super_admin',
  displayName: 'Super Admin',
});

const toShopUser = (shop: Shop, uid: string): AuthUser => ({
  uid,
  email: shop.email,
  role: 'shop_manager',
  shopId: shop.id,
  displayName: shop.ownerName,
});

const toStaffUser = (employee: Employee, uid: string): AuthUser => ({
  uid,
  email: employee.loginEmail ?? '',
  role: 'staff',
  shopId: employee.shopId,
  employeeId: employee.id,
  displayName: employee.name,
});

export const isHardcodedAdminCredentials = (email: string, password: string) => {
  return normalize(email) === normalize(HARDCODED_ADMIN.email) && password === HARDCODED_ADMIN.password;
};

export const setLocalAdminSession = async () => {
  const credential = await auth().signInWithEmailAndPassword(HARDCODED_ADMIN.email, HARDCODED_ADMIN.password);
  let tokenResult = await credential.user.getIdTokenResult();
  let role = String(tokenResult.claims.role ?? '');
  if (role !== 'super_admin') {
    tokenResult = await credential.user.getIdTokenResult(true);
    role = String(tokenResult.claims.role ?? '');
  }
  if (role !== 'super_admin') {
    throw new Error('Admin account missing super_admin claim. Configure Firebase custom claims.');
  }
  await AsyncStorage.setItem(LOCAL_ADMIN_SESSION_KEY, '1');
  await AsyncStorage.removeItem(LOCAL_SHOP_SESSION_KEY);
  return getLocalAdminUser();
};

export const getLocalAdminSession = async (): Promise<AuthUser | null> => {
  const token = await AsyncStorage.getItem(LOCAL_ADMIN_SESSION_KEY);
  if (token === '1') {
    return getLocalAdminUser();
  }
  return null;
};

export const setLocalShopSession = async (user: AuthUser) => {
  await AsyncStorage.setItem(LOCAL_SHOP_SESSION_KEY, JSON.stringify(user));
  await AsyncStorage.removeItem(LOCAL_ADMIN_SESSION_KEY);
};

export const getLocalShopSession = async (): Promise<AuthUser | null> => {
  const raw = await AsyncStorage.getItem(LOCAL_SHOP_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AuthUser;
    if ((parsed?.role === 'shop_manager' || parsed?.role === 'staff') && parsed?.shopId) {
      return parsed;
    }
  } catch {
    // Ignore malformed old cache.
  }

  return null;
};

export const clearLocalSessions = async () => {
  await AsyncStorage.multiRemove([LOCAL_ADMIN_SESSION_KEY, LOCAL_SHOP_SESSION_KEY]);
};

const readDeletedShopAuthHints = async (): Promise<Record<string, DeletedShopAuthHint>> => {
  const raw = await AsyncStorage.getItem(DELETED_SHOP_AUTH_HINTS_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, DeletedShopAuthHint>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const saveDeletedShopAuthHint = async (email: string, uid?: string) => {
  const normalizedEmail = normalize(email);
  const normalizedUid = String(uid ?? '').trim();
  if (!normalizedEmail || !normalizedEmail.includes('@') || !normalizedUid) {
    return;
  }
  const current = await readDeletedShopAuthHints();
  current[normalizedEmail] = {
    uid: normalizedUid,
    savedAt: new Date().toISOString(),
  };

  const sorted = Object.entries(current).sort((a, b) => b[1].savedAt.localeCompare(a[1].savedAt)).slice(0, 100);
  const trimmed = Object.fromEntries(sorted);
  await AsyncStorage.setItem(DELETED_SHOP_AUTH_HINTS_KEY, JSON.stringify(trimmed));
};

export const getDeletedShopAuthHint = async (email: string): Promise<string | null> => {
  const normalizedEmail = normalize(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return null;
  }
  const current = await readDeletedShopAuthHints();
  const hit = current[normalizedEmail];
  if (!hit?.uid) {
    return null;
  }
  return hit.uid;
};

export const createShopAuthUser = async (email: string, password: string): Promise<{ uid: string }> => {
  const normalizedEmail = normalize(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Valid shop email is required.');
  }
  if (!password || password.trim().length < 6) {
    throw new Error('Initial login password must be at least 6 characters.');
  }

  let createdUid = '';
  let restoreError: unknown = null;
  try {
    const credential = await auth().createUserWithEmailAndPassword(normalizedEmail, password.trim());
    createdUid = credential.user.uid;
  } catch (error) {
    const message = String((error as { message?: string }).message ?? '').toLowerCase();
    if (message.includes('auth/email-already-in-use')) {
      throw new Error('This email already exists in Firebase Auth. Use a different email.');
    }
    if (message.includes('auth/invalid-email')) {
      throw new Error('Invalid shop email.');
    }
    if (message.includes('auth/weak-password')) {
      throw new Error('Password should be at least 6 characters.');
    }
    throw error;
  } finally {
    const currentEmail = normalize(auth().currentUser?.email ?? '');
    if (currentEmail !== normalize(HARDCODED_ADMIN.email)) {
      try {
        await setLocalAdminSession();
      } catch (error) {
        restoreError = error;
      }
    }
  }

  if (restoreError) {
    logError('ADMIN_SESSION_RESTORE_FAILED_AFTER_SHOP_USER_CREATE', restoreError, { email: normalizedEmail });
    throw new Error('Shop auth user created, but admin session restore failed. Please login again.');
  }

  return { uid: createdUid };
};

export const createStaffAuthUserLocally = async ({
  email,
  password,
  displayName,
}: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ uid: string }> => {
  const normalizedEmail = normalize(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Valid staff email is required.');
  }
  if (!password || password.trim().length < 6) {
    throw new Error('Staff password must be at least 6 characters.');
  }

  const appName = `staff-create-${Date.now()}`;
  const secondaryApp = await app.initializeApp(buildSecondaryFirebaseOptions(), appName);

  try {
    const secondaryAuth = secondaryApp.auth();
    const credential = await secondaryAuth.createUserWithEmailAndPassword(normalizedEmail, password.trim());
    if (displayName?.trim()) {
      await credential.user.updateProfile({ displayName: displayName.trim() });
    }
    return { uid: credential.user.uid };
  } catch (error) {
    const message = String((error as { message?: string }).message ?? '').toLowerCase();
    if (message.includes('auth/email-already-in-use')) {
      throw new Error('This email already exists in Firebase Authentication.');
    }
    if (message.includes('auth/invalid-email')) {
      throw new Error('Invalid staff email.');
    }
    if (message.includes('auth/weak-password')) {
      throw new Error('Password should be at least 6 characters.');
    }
    throw error;
  } finally {
    try {
      await secondaryApp.auth().signOut();
    } catch {
      // Ignore cleanup errors from the temporary auth instance.
    }
    try {
      await secondaryApp.delete();
    } catch {
      // Ignore app cleanup issues; the creation result already completed.
    }
  }
};

export const deleteStaffAuthUserLocally = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  const normalizedEmail = normalize(email);
  const appName = `staff-delete-${Date.now()}`;
  const secondaryApp = await app.initializeApp(buildSecondaryFirebaseOptions(), appName);

  try {
    const secondaryAuth = secondaryApp.auth();
    await secondaryAuth.signInWithEmailAndPassword(normalizedEmail, password.trim());
    await secondaryAuth.currentUser?.delete();
  } finally {
    try {
      await secondaryApp.auth().signOut();
    } catch {
      // Ignore cleanup errors from the temporary auth instance.
    }
    try {
      await secondaryApp.delete();
    } catch {
      // Ignore app cleanup issues during rollback.
    }
  }
};

export const deleteShopAuthUser = async ({
  email,
  bootstrapPassword,
  expectedUid,
}: {
  email: string;
  bootstrapPassword?: string;
  expectedUid?: string;
}) => {
  const normalizedEmail = normalize(email);
  const secret = bootstrapPassword?.trim() ?? '';

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Valid shop email is required to delete linked auth user.');
  }
  // Preferred path: privileged server-side delete (works even when shop password is unknown).
  await deleteShopAuthUserViaAdminEndpoint({
    email: normalizedEmail,
    expectedUid,
    bootstrapPassword: secret,
  });
};

const deleteShopAuthUserViaAdminEndpoint = async ({
  email,
  expectedUid,
  bootstrapPassword,
}: {
  email: string;
  expectedUid?: string;
  bootstrapPassword?: string;
}) => {
  const projectId = app.app().options.projectId;
  const adminToken = await auth().currentUser?.getIdToken();

  if (projectId && adminToken) {
    const endpoint = `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/deleteShopAuthUserByAdmin`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          email,
          uid: expectedUid ?? '',
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (response.ok && payload.ok) {
        logInfo('SHOP_AUTH_DELETE_VIA_ADMIN_ENDPOINT_SUCCESS', { email, expectedUid });
        return;
      }
      logInfo('SHOP_AUTH_DELETE_VIA_ADMIN_ENDPOINT_FAILED', {
        email,
        expectedUid,
        status: response.status,
        message: payload.message ?? 'unknown',
      });
    } catch (error) {
      logInfo('SHOP_AUTH_DELETE_VIA_ADMIN_ENDPOINT_ERROR', {
        email,
        expectedUid,
        message: String((error as Error).message ?? error),
      });
    }
  }

  // Fallback path: client-side delete via shop credentials.
  if (!bootstrapPassword) {
    throw new Error(
      'Unable to delete auth user from app without server endpoint. Deploy functions and retry shop deletion.',
    );
  }

  let restoreError: unknown = null;
  try {
    const credential = await auth().signInWithEmailAndPassword(email, bootstrapPassword);
    const uid = credential.user.uid;

    if (expectedUid && uid !== expectedUid) {
      throw new Error('Linked auth account mismatch. Delete aborted to avoid removing the wrong user.');
    }

    await credential.user.delete();
    logInfo('SHOP_AUTH_DELETE_SUCCESS', {
      email,
      uid,
    });
  } catch (error) {
    const message = String((error as { message?: string }).message ?? '').toLowerCase();
    if (message.includes('auth/wrong-password') || message.includes('auth/invalid-credential')) {
      throw new Error('Shop password changed from bootstrap password. Reset password first, then delete this shop.');
    }
    if (message.includes('auth/user-not-found')) {
      logInfo('SHOP_AUTH_DELETE_SKIP_USER_NOT_FOUND', { email, expectedUid });
      return;
    }
    throw error;
  } finally {
    const currentEmail = normalize(auth().currentUser?.email ?? '');
    if (currentEmail !== normalize(HARDCODED_ADMIN.email)) {
      try {
        await setLocalAdminSession();
      } catch (error) {
        restoreError = error;
      }
    }
  }

  if (restoreError) {
    logError('ADMIN_SESSION_RESTORE_FAILED_AFTER_SHOP_USER_DELETE', restoreError, { email });
    throw new Error('Auth user deleted, but admin session restore failed. Please login again.');
  }
};

const getEmployeeByClaim = async (shopId: string, employeeId: string): Promise<Employee | null> => {
  if (!shopId || !employeeId) {
    return null;
  }

  const snap = await employeeDoc(shopId, employeeId).get();
  if (!snap.exists()) {
    return null;
  }

  return { id: snap.id, ...(snap.data() as Omit<Employee, 'id'>) } as Employee;
};

const getEmployeeByAuthUid = async (shopId: string, uid: string): Promise<Employee | null> => {
  if (!shopId || !uid) {
    return null;
  }

  const snapshot = await employeesCol(shopId).where('authUid', '==', uid).limit(1).get();
  if (snapshot.empty) {
    return null;
  }

  const found = snapshot.docs[0];
  return { id: found.id, ...(found.data() as Omit<Employee, 'id'>) } as Employee;
};

const getEmployeeByAuthUidAnyShop = async (uid: string): Promise<Employee | null> => {
  if (!uid) {
    return null;
  }

  const shopsSnapshot = await shopsCol().get();
  for (const shopDocSnap of shopsSnapshot.docs) {
    const employeeSnapshot = await employeesCol(shopDocSnap.id).where('authUid', '==', uid).limit(1).get();
    if (!employeeSnapshot.empty) {
      const found = employeeSnapshot.docs[0];
      return { id: found.id, ...(found.data() as Omit<Employee, 'id'>) } as Employee;
    }
  }

  return null;
};

const getEmployeeByLoginEmailAnyShop = async (email: string): Promise<Employee | null> => {
  const normalizedEmail = normalize(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return null;
  }

  const shopsSnapshot = await shopsCol().get();
  for (const shopDocSnap of shopsSnapshot.docs) {
    const employeeSnapshot = await employeesCol(shopDocSnap.id).where('loginEmail', '==', normalizedEmail).limit(1).get();
    if (!employeeSnapshot.empty) {
      const found = employeeSnapshot.docs[0];
      return { id: found.id, ...(found.data() as Omit<Employee, 'id'>) } as Employee;
    }
  }

  return null;
};

const getShopByEmail = async (email: string): Promise<Shop | null> => {
  const normalizedEmail = normalize(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return null;
  }

  const snapshot = await shopsCol().where('email', '==', normalizedEmail).limit(1).get();
  if (snapshot.empty) {
    return null;
  }

  const found = snapshot.docs[0];
  return { id: found.id, ...(found.data() as Omit<Shop, 'id'>) } as Shop;
};

const resolveShopManagerUser = async (
  credentialUser: FirebaseAuthTypes.User,
  normalizedIdentifier?: string,
): Promise<AuthUser> => {
  let tokenResult = await credentialUser.getIdTokenResult();
  let role = String(tokenResult.claims.role ?? '');
  let tokenShopId = String(tokenResult.claims.shopId ?? '');
  if (role !== 'shop_manager' || !tokenShopId) {
    tokenResult = await credentialUser.getIdTokenResult(true);
    role = String(tokenResult.claims.role ?? '');
    tokenShopId = String(tokenResult.claims.shopId ?? '');
  }

  let tokenShop: Shop | null = null;
  if (tokenShopId) {
    const shopSnap = await shopsCol().doc(tokenShopId).get();
    if (shopSnap.exists()) {
      tokenShop = { id: shopSnap.id, ...(shopSnap.data() as Omit<Shop, 'id'>) } as Shop;
    }
  }

  if (!tokenShop) {
    const shopByAuthUid = await shopsCol().where('authUid', '==', credentialUser.uid).limit(1).get();
    if (!shopByAuthUid.empty) {
      const found = shopByAuthUid.docs[0];
      tokenShop = { id: found.id, ...(found.data() as Omit<Shop, 'id'>) } as Shop;
    }
  }

  if (!tokenShop) {
    tokenShop = await getShopByEmail(normalizedIdentifier ?? credentialUser.email ?? '');
  }

  if (!tokenShop) {
    throw new Error('Shop profile not found for this account.');
  }

  if (tokenShop.status !== 'active') {
    throw new Error('Shop is inactive. Contact admin.');
  }
  if (normalizedIdentifier && normalize(tokenShop.email ?? '') !== normalizedIdentifier) {
    throw new Error('This account email does not match assigned shop.');
  }
  if (tokenShop.authUid && tokenShop.authUid !== credentialUser.uid) {
    throw new Error('This auth account is not linked to the shop profile.');
  }

  return toShopUser(tokenShop, credentialUser.uid);
};

const resolveStaffUser = async (credentialUser: FirebaseAuthTypes.User): Promise<AuthUser> => {
  let tokenResult = await credentialUser.getIdTokenResult();
  let role = String(tokenResult.claims.role ?? '');
  let tokenShopId = String(tokenResult.claims.shopId ?? '');
  let tokenEmployeeId = String(tokenResult.claims.employeeId ?? '');
  if (role !== 'staff' || !tokenShopId || !tokenEmployeeId) {
    tokenResult = await credentialUser.getIdTokenResult(true);
    role = String(tokenResult.claims.role ?? '');
    tokenShopId = String(tokenResult.claims.shopId ?? '');
    tokenEmployeeId = String(tokenResult.claims.employeeId ?? '');
  }

  let employee = await getEmployeeByClaim(tokenShopId, tokenEmployeeId);
  if (!employee) {
    employee = await getEmployeeByAuthUid(tokenShopId, credentialUser.uid);
  }
  if (!employee) {
    employee = await getEmployeeByAuthUidAnyShop(credentialUser.uid);
  }
  if (!employee) {
    employee = await getEmployeeByLoginEmailAnyShop(credentialUser.email ?? '');
  }
  if (!employee) {
    throw new Error('Staff profile not found for this account.');
  }
  if (employee.status !== 'active') {
    throw new Error('Staff account is inactive. Contact your shop manager.');
  }
  if (employee.authUid && employee.authUid !== credentialUser.uid) {
    throw new Error('This auth account is not linked to the staff profile.');
  }
  if (normalize(employee.loginEmail ?? credentialUser.email ?? '') !== normalize(credentialUser.email ?? '')) {
    throw new Error('This account email does not match assigned staff login.');
  }

  const user = toStaffUser(employee, credentialUser.uid);
  user.email = credentialUser.email ?? employee.loginEmail ?? '';
  return user;
};

export const loginShopWithCredentials = async (
  identifier: string,
  password: string,
): Promise<AuthUser | null> => {
  const normalizedIdentifier = normalize(identifier);
  if (!normalizedIdentifier || !password) {
    return null;
  }
  if (!normalizedIdentifier.includes('@')) {
    throw new Error('Use shop email to login. Username login is not enabled yet.');
  }

  try {
    logInfo('SHOP_LOGIN_ATTEMPT', {
      identifier: normalizedIdentifier,
    });

    const credential = await auth().signInWithEmailAndPassword(normalizedIdentifier, password);
    let tokenResult = await credential.user.getIdTokenResult();
    let role = String(tokenResult.claims.role ?? '');
    if (!role) {
      tokenResult = await credential.user.getIdTokenResult(true);
      role = String(tokenResult.claims.role ?? '');
    }

    let user: AuthUser | null = null;
    if (role === 'shop_manager') {
      user = await resolveShopManagerUser(credential.user, normalizedIdentifier);
    } else if (role === 'staff') {
      user = await resolveStaffUser(credential.user);
    } else {
      try {
        user = await resolveShopManagerUser(credential.user, normalizedIdentifier);
      } catch {
        try {
          user = await resolveStaffUser(credential.user);
        } catch {
          user = null;
        }
      }
    }

    if (!user) {
      throw new Error('This account is not linked to a shop or staff profile yet.');
    }

    await setLocalShopSession(user);
    return user;
  } catch (error) {
    const message = String((error as { message?: string }).message ?? '').toLowerCase();
    if (
      message.includes('auth/user-not-found') ||
      message.includes('auth/wrong-password') ||
      message.includes('auth/invalid-credential') ||
      message.includes('auth/invalid-email')
    ) {
      if (message.includes('auth/user-not-found')) {
        throw new Error('Shop auth user not found. Ask admin to run auth sync and try again.');
      }
      return null;
    }
    if (message.includes('auth/user-disabled')) {
      throw new Error('This account is disabled. Contact your shop manager or admin.');
    }
    if (message.includes('auth/too-many-requests')) {
      throw new Error('Too many login attempts. Please wait a moment and try again.');
    }
    if (message.includes('firestore/permission-denied') || message.includes('permission-denied')) {
      throw new Error('Shop profile access denied. Ask admin to relogin once and retry.');
    }
    if (
      message.includes('not provisioned for mobile access') ||
      message.includes('not linked to a shop or staff profile') ||
      message.includes('shop profile not found for this account') ||
      message.includes('staff profile not found for this account') ||
      message.includes('staff account access is not fully synced for mobile use yet') ||
      message.includes('this auth account is not linked to the shop profile') ||
      message.includes('this auth account is not linked to the staff profile') ||
      message.includes('this account email does not match assigned shop') ||
      message.includes('this account email does not match assigned staff login') ||
      message.includes('staff account is inactive') ||
      message.includes('shop is inactive')
    ) {
      logInfo('SHOP_LOGIN_HANDLED_FAILURE', {
        identifier: normalizedIdentifier,
        message: String((error as { message?: string }).message ?? error),
      });
      throw error;
    }

    logError('SHOP_LOGIN_FAILED', error, { identifier: normalizedIdentifier });
    throw error;
  }
};

export const logout = async () => {
  await clearLocalSessions();
  if (auth().currentUser) {
    await auth().signOut();
  }
};

const forceLogoutAndClearSessions = async () => {
  try {
    await clearLocalSessions();
  } catch {
    // ignore local session cleanup failures during recovery
  }

  try {
    if (auth().currentUser) {
      await auth().signOut();
    }
  } catch {
    // ignore sign-out failures during recovery
  }
};

export const getHydratedAuthUser = async (): Promise<AuthUser | null> => {
  const current = auth().currentUser;
  if (!current || current.isAnonymous) {
    return null;
  }

  let tokenResult = await current.getIdTokenResult();
  let role = String(tokenResult.claims.role ?? '');
  let tokenShopId = String(tokenResult.claims.shopId ?? '');
  let tokenEmployeeId = String(tokenResult.claims.employeeId ?? '');
  if (!role || (role === 'shop_manager' && !tokenShopId) || (role === 'staff' && (!tokenShopId || !tokenEmployeeId))) {
    tokenResult = await current.getIdTokenResult(true);
    role = String(tokenResult.claims.role ?? '');
    tokenShopId = String(tokenResult.claims.shopId ?? '');
    tokenEmployeeId = String(tokenResult.claims.employeeId ?? '');
  }

  if (role === 'super_admin') {
    return {
      uid: current.uid,
      email: current.email ?? HARDCODED_ADMIN.email,
      role: 'super_admin',
      displayName: current.displayName ?? 'Super Admin',
    };
  }

  if (role === 'shop_manager') {
    try {
      const user = await resolveShopManagerUser(current);
      user.email = current.email ?? user.email;
      user.displayName = user.displayName || current.displayName || undefined;
      return user;
    } catch (error) {
      logInfo('SHOP_MANAGER_HYDRATION_RECOVERY', {
        uid: current.uid,
        message: String((error as Error).message ?? error),
      });
      await forceLogoutAndClearSessions();
      return null;
    }
  }

  if (role === 'staff') {
    try {
      const user = await resolveStaffUser(current);
      user.email = current.email ?? user.email;
      user.displayName = user.displayName || current.displayName || undefined;
      return user;
    } catch (error) {
      logInfo('STAFF_HYDRATION_RECOVERY', {
        uid: current.uid,
        message: String((error as Error).message ?? error),
      });
      await forceLogoutAndClearSessions();
      return null;
    }
  }

  return null;
};

export const provisionStaffAuthViaManager = async ({
  shopId,
  employeeId,
  email,
  password,
  displayName,
}: {
  shopId: string;
  employeeId: string;
  email: string;
  password: string;
  displayName?: string;
}) => {
  const projectId = app.app().options.projectId;
  const token = await auth().currentUser?.getIdToken(true);
  if (!projectId || !token) {
    throw new Error('Shop manager session missing. Please login again.');
  }

  const endpoint = `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/provisionStaffAuthUserByManager`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      shopId,
      employeeId,
      email,
      password,
      displayName,
    }),
  });

  const rawText = await response.text();
  if (rawText.includes('<title>404 Page not found</title>') || rawText.includes('Error: Page not found')) {
    throw new Error('Staff auth service is not deployed on Firebase yet. Deploy cloud functions and try again.');
  }
  let payload: { ok?: boolean; message?: string; uid?: string; created?: boolean } = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as { ok?: boolean; message?: string; uid?: string; created?: boolean };
    } catch {
      payload = {};
    }
  }
  if (!response.ok || !payload.ok || !payload.uid) {
    const fallback =
      payload.message ||
      rawText ||
      `Unable to provision staff auth user. (HTTP ${response.status})`;
    throw new Error(fallback);
  }

  return { uid: payload.uid, created: Boolean(payload.created) };
};

export const registerStaffWithAuthViaManager = async ({
  shopId,
  employeeId,
  email,
  password,
  employee,
}: {
  shopId: string;
  employeeId: string;
  email: string;
  password: string;
  employee: Partial<Employee>;
}) => {
  const projectId = app.app().options.projectId;
  const token = await auth().currentUser?.getIdToken(true);
  if (!projectId || !token) {
    throw new Error('Shop manager session missing. Please login again.');
  }

  const endpoint = `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/registerStaffByManager`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      shopId,
      employeeId,
      email,
      password,
      employee,
    }),
  });

  const rawText = await response.text();
  if (rawText.includes('<title>404 Page not found</title>') || rawText.includes('Error: Page not found')) {
    throw new Error('Staff registration service is not deployed on Firebase yet. Deploy cloud functions and try again.');
  }

  let payload: { ok?: boolean; message?: string; employee?: Employee } = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as { ok?: boolean; message?: string; employee?: Employee };
    } catch {
      payload = {};
    }
  }
  if (!response.ok || !payload.ok || !payload.employee) {
    throw new Error(payload.message || rawText || `Unable to register staff profile. (HTTP ${response.status})`);
  }

  return payload.employee;
};

export const setStaffAuthDisabledViaManager = async ({
  shopId,
  employeeId,
  uid,
  disabled,
}: {
  shopId: string;
  employeeId: string;
  uid: string;
  disabled: boolean;
}) => {
  const projectId = app.app().options.projectId;
  const token = await auth().currentUser?.getIdToken(true);
  if (!projectId || !token) {
    throw new Error('Shop manager session missing. Please login again.');
  }

  const endpoint = `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/setStaffAuthDisabledByManager`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      shopId,
      employeeId,
      uid,
      disabled,
    }),
  });

  const rawText = await response.text();
  if (rawText.includes('<title>404 Page not found</title>') || rawText.includes('Error: Page not found')) {
    throw new Error('Staff access service is not deployed on Firebase yet. Deploy cloud functions and try again.');
  }
  let payload: { ok?: boolean; message?: string } = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as { ok?: boolean; message?: string };
    } catch {
      payload = {};
    }
  }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || rawText || 'Unable to update staff auth access.');
  }
};

export const deleteOwnStaffAccountViaEndpoint = async () => {
  const projectId = app.app().options.projectId;
  const token = await auth().currentUser?.getIdToken();
  if (!projectId || !token) {
    throw new Error('Staff session missing. Please login again.');
  }

  const endpoint = `https://${FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/deleteOwnStaffAccount`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || 'Unable to delete staff account.');
  }
};

export const subscribeAuthState = (
  callback: (user: FirebaseAuthTypes.User | null) => void,
) => auth().onAuthStateChanged(callback);
