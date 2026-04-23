import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AdminTabParamList } from '../../types/navigation';
import { AdminDashboardScreen } from './AdminDashboardScreen';
import { AdminShopsStack } from './AdminShopsStack';
import { AdminProfileScreen } from './AdminProfileScreen';
import { AdminStatusScreen } from './AdminStatusScreen';
import { colors } from '../../theme/colors';
import { hp, sp } from '../../utils/responsive';

const Tabs = createBottomTabNavigator<AdminTabParamList>();

export function AdminHomeTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarShowLabel: true,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        tabBarIcon: ({ color, focused, size }) => {
          const icon = tabIcon(route.name, focused);
          const scaledSize = sp(size);

          return (
            <Ionicons
              name={icon}
              size={focused ? scaledSize + 2 : scaledSize}
              color={focused ? colors.primary : color}
              style={focused ? styles.iconActive : undefined}
            />
          );
        },
        tabBarStyle: {
          height: hp(62) + bottomInset,
          paddingTop: hp(6),
          paddingBottom: bottomInset,
          borderTopWidth: 1,
          borderTopColor: '#cfd9e8',
          backgroundColor: '#f8fbff',
          shadowColor: colors.shadow,
          shadowOpacity: 0.08,
          shadowOffset: { width: 0, height: hp(-4) },
          shadowRadius: hp(16),
          elevation: 10,
        },
      })}>
      <Tabs.Screen name="Home" component={AdminDashboardScreen} />
      <Tabs.Screen name="Shops" component={AdminShopsStack} />
      <Tabs.Screen name="Status" component={AdminStatusScreen} />
      <Tabs.Screen name="Profile" component={AdminProfileScreen} />
    </Tabs.Navigator>
  );
}

function tabIcon(routeName: keyof AdminTabParamList, focused: boolean) {
  switch (routeName) {
    case 'Home':
      return focused ? 'grid' : 'grid-outline';
    case 'Shops':
      return focused ? 'storefront' : 'storefront-outline';
    case 'Status':
      return focused ? 'stats-chart' : 'stats-chart-outline';
    case 'Profile':
      return focused ? 'shield-checkmark' : 'shield-checkmark-outline';
    default:
      return focused ? 'ellipse' : 'ellipse-outline';
  }
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: sp(12),
    fontWeight: '700',
    marginBottom: hp(2),
  },
  tabItem: {
    paddingTop: hp(2),
    paddingBottom: hp(4),
  },
  iconActive: {
    transform: [{ translateY: -1 }],
  },
});
