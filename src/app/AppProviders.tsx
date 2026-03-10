import React, { useEffect } from 'react';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from '../store';
import { useAppDispatch } from '../store/hooks';
import { clearSession, setBootstrapping, setUser } from '../store/authSlice';
import {
  getHydratedAuthUser,
  getLocalAdminSession,
  getLocalShopSession,
  subscribeAuthState,
} from '../services/authService';
import { RootNavigator } from './RootNavigator';

function Bootstrapper() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const unsubscribe = subscribeAuthState(async user => {
      try {
        if (!user) {
          const localAdmin = await getLocalAdminSession();
          if (localAdmin) {
            dispatch(setUser(localAdmin));
            return;
          }
          const localShop = await getLocalShopSession();
          if (localShop) {
            dispatch(setUser(localShop));
            return;
          }
          dispatch(clearSession());
          return;
        }

        const hydrated = await getHydratedAuthUser();
        dispatch(setUser(hydrated));
      } finally {
        dispatch(setBootstrapping(false));
      }
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
