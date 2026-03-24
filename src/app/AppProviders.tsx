import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from '../store';
import { useAppDispatch } from '../store/hooks';
import { clearSession, setBootstrapping, setUser } from '../store/authSlice';
import { hrmsApi } from '../store/hrmsApi';
import {
  getHydratedAuthUser,
  getLocalAdminSession,
  subscribeAuthState,
} from '../services/authService';
import { logError, logInfo } from '../utils/logger';
import { RootNavigator } from './RootNavigator';

function isHandledBootstrapNetworkError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string'
        ? String((error as { message?: string }).message)
        : String(error ?? '');

  const lower = message.toLowerCase();
  return (
    lower.includes('auth/network-request-failed') ||
    lower.includes('network request failed') ||
    lower.includes('timeout') ||
    lower.includes('unreachable host')
  );
}

function Bootstrapper() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const hydrateSession = async (user: Parameters<Parameters<typeof subscribeAuthState>[0]>[0]) => {
      try {
        if (!user) {
          const localAdmin = await getLocalAdminSession();
          if (localAdmin) {
            dispatch(setUser(localAdmin));
            return;
          }
          dispatch(hrmsApi.util.resetApiState());
          dispatch(clearSession());
          return;
        }

        const hydrated = await getHydratedAuthUser();
        if (!hydrated) {
          dispatch(hrmsApi.util.resetApiState());
          dispatch(clearSession());
          return;
        }

        dispatch(setUser(hydrated));
      } catch (error) {
        if (isHandledBootstrapNetworkError(error)) {
          logInfo('AUTH_BOOTSTRAP_NETWORK_RECOVERY', {
            uid: user?.uid ?? '',
            message: error instanceof Error ? error.message : String(error ?? ''),
          });
        } else {
          logError('AUTH_BOOTSTRAP_FAILED', error, {
            uid: user?.uid ?? '',
          });
        }
        dispatch(hrmsApi.util.resetApiState());
        dispatch(clearSession());
      } finally {
        dispatch(setBootstrapping(false));
      }
    };

    const unsubscribe = subscribeAuthState(user => {
      void hydrateSession(user);
    });

    return unsubscribe;
  }, [dispatch]);

  return <RootNavigator />;
}

export function AppProviders() {
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <Bootstrapper />
      </SafeAreaProvider>
    </Provider>
  );
}
