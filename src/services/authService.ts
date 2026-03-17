import app from '@react-native-firebase/app';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser, Shop } from '../types/models';
import {
  HARDCODED_ADMIN,
  LOCAL_ADMIN_SESSION_KEY,
  LOCAL_ADMIN_UID,
  LOCAL_SHOP_SESSION_KEY,
} from '../config/auth';
import { auth, shopsCol } from './firebase';
import { logError, logInfo } from '../utils/logger';

const normalize = (value: string) => value.trim().toLowerCase();
const DELETED_SHOP_AUTH_HINTS_KEY = 'hrms_deleted_shop_auth_hints_v1';

type DeletedShopAuthHint = {
  uid: string;
  savedAt: string;
};

const FUNCTIONS_REGION = 'us-central1';

const getLocalAdminUser = (): AuthUser => ({
  uid: LOCAL_ADMIN_UID,
  email: HARDCODED_ADMIN.email,
  role: 'super_admin',
  displayName: 'Super Admin',
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
    if (parsed?.role === 'shop_manager' && parsed?.shopId) {
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

const toShopUser = (shop: Shop, uid: string): AuthUser => ({
  uid,
  email: shop.email,
  role: 'shop_manager',
  shopId: shop.id,
  displayName: shop.ownerName,
});

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
    let tokenShopId = String(tokenResult.claims.shopId ?? '');
    if (role !== 'shop_manager' || !tokenShopId) {
      tokenResult = await credential.user.getIdTokenResult(true);
      role = String(tokenResult.claims.role ?? '');
      tokenShopId = String(tokenResult.claims.shopId ?? '');
    }

    let tokenShop: Shop | null = null;
    if (role === 'shop_manager' && tokenShopId) {
      const shopSnap = await shopsCol().doc(tokenShopId).get();
      if (shopSnap.exists()) {
        tokenShop = { id: shopSnap.id, ...(shopSnap.data() as Omit<Shop, 'id'>) } as Shop;
      }
    }

    if (!tokenShop) {
      const shopByAuthUid = await shopsCol().where('authUid', '==', credential.user.uid).limit(1).get();
      if (shopByAuthUid.empty) {
        throw new Error('Shop profile not found for this account.');
      }
      const found = shopByAuthUid.docs[0];
      tokenShop = { id: found.id, ...(found.data() as Omit<Shop, 'id'>) } as Shop;
    }

    if (tokenShop.status !== 'active') {
      throw new Error('Shop is inactive. Contact admin.');
    }
    if (normalize(tokenShop.email ?? '') !== normalizedIdentifier) {
      throw new Error('This account email does not match assigned shop.');
    }
    if (tokenShop.authUid && tokenShop.authUid !== credential.user.uid) {
      throw new Error('This auth account is not linked to the shop profile.');
    }

    const user = toShopUser(tokenShop, credential.user.uid);
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
    if (message.includes('firestore/permission-denied') || message.includes('permission-denied')) {
      throw new Error('Shop profile access denied. Ask admin to relogin once and retry.');
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

export const getHydratedAuthUser = async (): Promise<AuthUser | null> => {
  const current = auth().currentUser;
  if (!current || current.isAnonymous) {
    return null;
  }

  let tokenResult = await current.getIdTokenResult();
  let role = String(tokenResult.claims.role ?? '');
  let tokenShopId = String(tokenResult.claims.shopId ?? '');
  if (!role || (role === 'shop_manager' && !tokenShopId)) {
    tokenResult = await current.getIdTokenResult(true);
    role = String(tokenResult.claims.role ?? '');
    tokenShopId = String(tokenResult.claims.shopId ?? '');
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
    const shopId = tokenShopId;
    if (!shopId) {
      const uid = String(current.uid || '');
      if (!uid) {
        return null;
      }
      const byAuthUid = await shopsCol().where('authUid', '==', uid).limit(1).get();
      if (byAuthUid.empty) {
        return null;
      }
      const shopSnap = byAuthUid.docs[0];
      const shop = { id: shopSnap.id, ...(shopSnap.data() as Omit<Shop, 'id'>) } as Shop;
      if (shop.status !== 'active') {
        return null;
      }
      if (shop.authUid && shop.authUid !== current.uid) {
        return null;
      }
      return {
        uid: current.uid,
        email: current.email ?? shop.email,
        role: 'shop_manager',
        shopId: shop.id,
        displayName: shop.ownerName || current.displayName || undefined,
      };
    }
    const shopSnap = await shopsCol().doc(shopId).get();
    if (!shopSnap.exists()) {
      return null;
    }
    const shop = { id: shopSnap.id, ...(shopSnap.data() as Omit<Shop, 'id'>) } as Shop;
    if (shop.status !== 'active') {
      return null;
    }
    return {
      uid: current.uid,
      email: current.email ?? shop.email,
      role: 'shop_manager',
      shopId,
      displayName: shop.ownerName || current.displayName || undefined,
    };
  }

  return null;
};

export const subscribeAuthState = (
  callback: (user: FirebaseAuthTypes.User | null) => void,
) => auth().onAuthStateChanged(callback);
