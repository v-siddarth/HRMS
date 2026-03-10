import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { ShopTabParamList } from '../../types/navigation';
import { ShopDashboardScreen } from './ShopDashboardScreen';
import { StaffScreen } from './StaffScreen';
import { AttendanceScreen } from './AttendanceScreen';
import { SalaryScreen } from './SalaryScreen';
import { ReportsScreen } from './ReportsScreen';
import { colors } from '../../theme/colors';

const Tabs = createBottomTabNavigator<ShopTabParamList>();

export function ShopHomeTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.success,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, focused }) => (
          <View style={[styles.iconBubble, focused && styles.iconBubbleActive]}>
            <Text style={[styles.iconText, { color }]}>{tabIcon(route.name)}</Text>
          </View>
        ),
        tabBarStyle: {
          height: 76,
          paddingTop: 8,
          paddingBottom: 10,
          borderTopWidth: 1,
          borderTopColor: '#d7dee8',
          backgroundColor: '#ffffff',
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
      return '⌂';
    case 'Staff':
      return '◫';
    case 'Attendance':
      return '◍';
    case 'Salary':
      return '◎';
    case 'Reports':
      return '▤';
    default:
      return '?';
  }
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  iconBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2f7',
  },
  iconBubbleActive: {
    backgroundColor: '#ddf3ea',
  },
  iconText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
});
