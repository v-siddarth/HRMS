import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ShopTabParamList } from '../../types/navigation';
import { ShopDashboardScreen } from './ShopDashboardScreen';
import { StaffScreen } from './StaffScreen';
import { AttendanceScreen } from './AttendanceScreen';
import { SalaryScreen } from './SalaryScreen';
import { ReportsScreen } from './ReportsScreen';
import { colors } from '../../theme/colors';

const Tabs = createBottomTabNavigator<ShopTabParamList>();

export function ShopHomeTabs() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.success,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        tabBarIcon: ({ color, focused, size }) => {
          const icon = tabIcon(route.name);

          return (
            <Ionicons
              name={icon.name}
              size={focused ? size + 2 : size}
              color={focused ? colors.success : color}
              style={focused && styles.iconActive}
            />
          );
        },
        tabBarStyle: {
          height: 58 + bottomInset,
          paddingTop: 4,
          paddingBottom: bottomInset,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        },
      })}>
      <Tabs.Screen name="Home" component={ShopDashboardScreen} />
      <Tabs.Screen name="Staff" component={StaffScreen} />
      <Tabs.Screen name="Attendance" component={AttendanceScreen} />
      <Tabs.Screen name="Salary" component={SalaryScreen} />
      <Tabs.Screen name="Reports" component={ReportsScreen} />
    </Tabs.Navigator>
  );
}

function tabIcon(routeName: keyof ShopTabParamList) {
  switch (routeName) {
    case 'Home':
      return {
        name: 'home',
      };
    case 'Staff':
      return {
        name: 'people',
      };
    case 'Attendance':
      return {
        name: 'calendar',
      };
    case 'Salary':
      return {
        name: 'wallet',
      };
    case 'Reports':
      return {
        name: 'document-text',
      };
    default:
      return {
        name: 'circle-outline',
      };
  }
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  tabItem: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  iconActive: {
    transform: [{ translateY: -1 }],
  },
});
