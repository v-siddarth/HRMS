import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AdminShopsStackParamList } from '../../types/navigation';
import { colors } from '../../theme/colors';
import { ShopsScreen } from './ShopsScreen';
import { AdminShopFormScreen } from './AdminShopFormScreen';

const Stack = createNativeStackNavigator<AdminShopsStackParamList>();

export function AdminShopsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '800' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}>
      <Stack.Screen name="ShopsList" component={ShopsScreen} options={{ title: 'Shops' }} />
      <Stack.Screen name="CreateShop" component={AdminShopFormScreen} options={{ title: 'Create Shop' }} />
      <Stack.Screen name="EditShop" component={AdminShopFormScreen} options={{ title: 'Update Shop' }} />
    </Stack.Navigator>
  );
}
