import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AdminTabParamList } from '../../types/navigation';
import { AdminDashboardScreen } from './AdminDashboardScreen';
import { AdminShopsStack } from './AdminShopsStack';
import { AdminProfileScreen } from './AdminProfileScreen';
import { AdminStatusScreen } from './AdminStatusScreen';
import { colors } from '../../theme/colors';

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
        tabBarIcon: ({ color, focused }) => (
          <View style={[styles.iconBubble, focused && styles.iconBubbleActive]}>
            <Text style={[styles.iconText, { color }]}>{tabIcon(route.name)}</Text>
          </View>
        ),
        tabBarStyle: {
          height: 56 + bottomInset,
          paddingTop: 0,
          paddingBottom: bottomInset,
          borderTopWidth: 1,
          borderTopColor: '#d7dee8',
          backgroundColor: '#ffffff',
        },
      })}>
      <Tabs.Screen name="Home" component={AdminDashboardScreen} />
      <Tabs.Screen name="Shops" component={AdminShopsStack} />
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
    marginBottom: 0,
  },
  tabItem: {
    paddingTop: 2,
    paddingBottom: 3,
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
