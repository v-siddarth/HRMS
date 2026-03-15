import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { DrawerContentScrollView, type DrawerContentComponentProps } from '@react-navigation/drawer';
import { logout } from '../../services/authService';
import { clearSession } from '../../store/authSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { colors } from '../../theme/colors';
import {
  useGetAttendanceByDateQuery,
  useGetBiometricSettingsQuery,
  useGetEmployeesQuery,
  useGetShopByIdQuery,
} from '../../store/hrmsApi';
import { todayDate } from '../../utils/date';

export function ShopDrawerContent(props: DrawerContentComponentProps) {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const dispatch = useAppDispatch();
  const { data: shop } = useGetShopByIdQuery(shopId, { skip: !shopId });
  const { data: employees = [] } = useGetEmployeesQuery(shopId, { skip: !shopId });
  const { data: biometric } = useGetBiometricSettingsQuery(shopId, { skip: !shopId });
  const { data: todayAttendance = [] } = useGetAttendanceByDateQuery(
    { shopId, date: todayDate() },
    { skip: !shopId },
  );

  const todayMarked = todayAttendance.length;
  const nav = props.navigation as any;

  const handleLogout = async () => {
    try {
      await logout();
      dispatch(clearSession());
    } catch (error) {
      Alert.alert('Logout failed', (error as Error).message);
    }
  };

  return (
    <DrawerContentScrollView
      {...props}
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}>
      <View style={styles.topBlock}>
        <Text style={styles.heading}>{shop?.shopName ?? 'Shop Panel'}</Text>
        <Text style={styles.subText}>{user?.email ?? 'Manager'}</Text>
        <Text style={styles.subText}>Shop ID: {user?.shopId ?? '-'}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Staff</Text>
          <Text style={styles.statValue}>{employees.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Today Marked</Text>
          <Text style={styles.statValue}>{todayMarked}</Text>
        </View>
      </View>

      <View style={styles.bioCard}>
        <Text style={styles.bioTitle}>Biometric Sync</Text>
        <Text style={styles.bioMeta}>Status: {biometric?.enabled ? 'Enabled' : 'Disabled'}</Text>
        <Text style={styles.bioMeta}>Mode: {biometric?.integrationMode ?? 'pull_agent'}</Text>
        <Text style={styles.bioMeta}>Device: {biometric?.deviceName || biometric?.deviceId || '-'}</Text>
        <Text style={styles.bioMeta}>Last Sync: {biometric?.lastSyncedAt ?? '-'}</Text>
      </View>

      <View style={styles.menuWrap}>
        <Pressable style={styles.menuItem} onPress={() => props.navigation.navigate('ShopHome')}>
          <Text style={styles.menuText}>Home Dashboard</Text>
        </Pressable>
        <Pressable
          style={styles.menuItem}
          onPress={() => nav.navigate('ShopHome', { screen: 'Staff' })}>
          <Text style={styles.menuText}>Staff Management</Text>
        </Pressable>
        <Pressable
          style={styles.menuItem}
          onPress={() => nav.navigate('ShopHome', { screen: 'Attendance' })}>
          <Text style={styles.menuText}>Attendance Desk</Text>
        </Pressable>
        <Pressable
          style={styles.menuItem}
          onPress={() => nav.navigate('ShopHome', { screen: 'Salary' })}>
          <Text style={styles.menuText}>Salary Center</Text>
        </Pressable>
        <Pressable
          style={styles.menuItem}
          onPress={() => nav.navigate('ShopHome', { screen: 'Reports' })}>
          <Text style={styles.menuText}>Reports Center</Text>
        </Pressable>
        <Pressable style={styles.menuItem} onPress={() => props.navigation.navigate('ShopProfile')}>
          <Text style={styles.menuText}>Shop Profile</Text>
        </Pressable>
        <Pressable style={styles.menuItem} onPress={() => props.navigation.navigate('ShopSettings')}>
          <Text style={styles.menuText}>Settings</Text>
        </Pressable>
        <Pressable style={styles.menuItem} onPress={() => props.navigation.navigate('ShopSupport')}>
          <Text style={styles.menuText}>Support & Security</Text>
        </Pressable>
        <Pressable style={[styles.menuItem, styles.logoutItem]} onPress={handleLogout}>
          <Text style={[styles.menuText, styles.logoutText]}>Logout</Text>
        </Pressable>
      </View>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
    backgroundColor: colors.bg,
  },
  topBlock: {
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 18,
    backgroundColor: colors.success,
    gap: 4,
  },
  heading: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '800',
  },
  subText: {
    color: '#cff6e8',
    fontWeight: '600',
  },
  menuWrap: {
    padding: 12,
    gap: 8,
  },
  bioCard: {
    marginTop: 10,
    marginHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7dee8',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  bioTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 14,
  },
  bioMeta: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7dee8',
    backgroundColor: '#f8fafc',
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 11,
  },
  statValue: {
    marginTop: 4,
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 21,
  },
  menuItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#d8e2ed',
  },
  menuText: {
    color: '#17212b',
    fontWeight: '700',
    fontSize: 15,
  },
  logoutItem: {
    borderColor: '#f6c9c9',
    backgroundColor: '#fff3f3',
    marginTop: 8,
  },
  logoutText: {
    color: '#c22a2a',
  },
});
