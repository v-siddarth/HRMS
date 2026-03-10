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
  } catch (error) {
    // Ignore malformed old cache.
  }

  return null;
};

export const clearLocalSessions = async () => {
  await AsyncStorage.multiRemove([LOCAL_ADMIN_SESSION_KEY, LOCAL_SHOP_SESSION_KEY]);
};

const toShopUser = (shop: Shop): AuthUser => ({
  uid: `shop-${shop.id}`,
  email: shop.email || shop.username,
  role: 'shop_manager',
  shopId: shop.id,
  displayName: shop.ownerName,
});

export const loginShopWithCredentials = async (
  identifier: string,
  password: string,
): Promise<AuthUser | null> => {
  const id = identifier.trim();
  if (!id || !password) {
    return null;
  }

  const normalized = normalize(id);

  const usernameSnap = await shopsCol().where('username', '==', id).limit(1).get();
  const emailSnap = await shopsCol().where('email', '==', id).limit(1).get();

  const docsMap = new Map<string, any>();
  usernameSnap.docs.forEach(doc => docsMap.set(doc.id, doc));
  emailSnap.docs.forEach(doc => docsMap.set(doc.id, doc));

  // Also support case-insensitive identifier check by scanning a small fallback set
  // for same normalized email/username when exact query misses due to casing.
  if (docsMap.size === 0) {
    const scanSnap = await shopsCol().limit(50).get();
    scanSnap.docs.forEach(doc => {
      const data = doc.data() as Shop;
      if (normalize(data.username ?? '') === normalized || normalize(data.email ?? '') === normalized) {
        docsMap.set(doc.id, doc);
      }
    });
  }

  for (const doc of docsMap.values()) {
    const shop = { id: doc.id, ...(doc.data() as Omit<Shop, 'id'>) } as Shop;
    if (shop.password === password && shop.status === 'active') {
      const user = toShopUser(shop);
      await setLocalShopSession(user);
      return user;
    }
  }

  return null;
};

export const logout = async () => {
  await clearLocalSessions();
  if (auth().currentUser) {
    await auth().signOut();
  }
};

export const getHydratedAuthUser = async (): Promise<AuthUser | null> => {
  const current = auth().currentUser;
  if (!current || !current.email) {
    return null;
  }

  // Firebase auth path is kept as fallback only.
  return {
    uid: current.uid,
    email: current.email,
    role: 'shop_manager',
    displayName: current.displayName ?? undefined,
  };
};

export const subscribeAuthState = (
  callback: (user: FirebaseAuthTypes.User | null) => void,
) => auth().onAuthStateChanged(callback);
