import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { AdminTabParamList } from '../../types/navigation';
import { AdminDashboardScreen } from './AdminDashboardScreen';
import { ShopsScreen } from './ShopsScreen';
import { AdminProfileScreen } from './AdminProfileScreen';
import { AdminStatusScreen } from './AdminStatusScreen';
import { colors } from '../../theme/colors';

const Tabs = createBottomTabNavigator<AdminTabParamList>();

export function AdminHomeTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarShowLabel: true,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color, focused }) => (
          <View style={[styles.iconBubble, focused && styles.iconBubbleActive]}>
            <Text style={[styles.iconText, { color }]}>{tabIcon(route.name)}</Text>
          </View>
        ),
        tabBarStyle: {
          height: 76,
          paddingTop: 10,
          paddingBottom: 10,
          borderTopWidth: 1,
          borderTopColor: '#d7dee8',
          backgroundColor: '#ffffff',
        },
      })}>
      <Tabs.Screen name="Home" component={AdminDashboardScreen} />
      <Tabs.Screen name="Shops" component={ShopsScreen} />
      <Tabs.Screen name="Status" component={AdminStatusScreen} />
      <Tabs.Screen name="Profile" component={AdminProfileScreen} />
    </Tabs.Navigator>
  );
}

function tabIcon(routeName: keyof AdminTabParamList) {
  switch (routeName) {
    case 'Home':
      return '⌂';
    case 'Shops':
      return '▦';
    case 'Status':
      return '◍';
    case 'Profile':
      return '◎';
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
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2f7',
  },
  iconBubbleActive: {
    backgroundColor: colors.primarySoft,
  },
  iconText: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
});
