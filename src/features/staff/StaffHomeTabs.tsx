import React from 'react';
import { StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StaffTabParamList } from '../../types/navigation';
import { colors } from '../../theme/colors';
import { StaffHomeScreen } from './StaffHomeScreen';
import { StaffAttendanceScreen } from './StaffAttendanceScreen';
import { StaffSalaryScreen } from './StaffSalaryScreen';
import { StaffProfileScreen } from './StaffProfileScreen';

const Tabs = createBottomTabNavigator<StaffTabParamList>();

export function StaffHomeTabs() {
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
        tabBarIcon: ({ color, focused, size }) => (
          <Ionicons
            name={tabIcon(route.name)}
            size={focused ? size + 2 : size}
            color={focused ? colors.success : color}
            style={focused && styles.iconActive}
          />
        ),
        tabBarStyle: {
          height: 60 + bottomInset,
          paddingTop: 4,
          paddingBottom: bottomInset,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        },
      })}>
      <Tabs.Screen name="Home" component={StaffHomeScreen} />
      <Tabs.Screen name="Attendance" component={StaffAttendanceScreen} />
      <Tabs.Screen name="Salary" component={StaffSalaryScreen} />
      <Tabs.Screen name="Profile" component={StaffProfileScreen} />
    </Tabs.Navigator>
  );
}

function tabIcon(routeName: keyof StaffTabParamList): string {
  switch (routeName) {
    case 'Home':
      return 'home';
    case 'Attendance':
      return 'calendar';
    case 'Salary':
      return 'wallet';
    case 'Profile':
      return 'person-circle';
    default:
      return 'ellipse';
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
