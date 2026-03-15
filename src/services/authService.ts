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
