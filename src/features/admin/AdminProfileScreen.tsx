import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, PrimaryButton, Screen } from '../../components/ui';
import { logout } from '../../services/authService';
import { clearSession } from '../../store/authSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { hrmsApi } from '../../store/hrmsApi';
import { colors } from '../../theme/colors';
import { wp, hp, sp } from '../../utils/responsive';

export function AdminProfileScreen() {
  const user = useAppSelector(state => state.auth.user);
  const dispatch = useAppDispatch();

  const onLogout = async () => {
    try {
      dispatch(hrmsApi.util.resetApiState());
      await logout();
      dispatch(clearSession());
    } catch (error) {
      Alert.alert('Logout failed', (error as Error).message);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{(user?.email?.[0] ?? 'A').toUpperCase()}</Text>
          </View>
          <Text style={styles.title}>Admin Profile</Text>
          <Text style={styles.subtitle}>Secure account details and access controls for your admin workspace.</Text>
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Account Information</Text>
          <InfoRow label="Email" value={user?.email ?? '-'} />
          <InfoRow label="Role" value={user?.role ?? '-'} />
          <InfoRow label="UID" value={user?.uid ?? '-'} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Security Notes</Text>
          <Text style={styles.note}>1. Keep admin credentials private and rotate passwords periodically.</Text>
          <Text style={styles.note}>2. Review inactive shops regularly to ensure proper access control.</Text>
          <Text style={styles.note}>3. Logout from shared devices immediately after use.</Text>
        </Card>

        <View style={styles.logoutWrap}>
          <PrimaryButton title="Logout" onPress={onLogout} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2} ellipsizeMode="tail">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: hp(12), paddingBottom: hp(20) },
  hero: {
    borderRadius: wp(20), borderWidth: 1, borderColor: '#d7e5fb',
    backgroundColor: '#f4f8ff', paddingVertical: hp(18), paddingHorizontal: wp(14),
    alignItems: 'center', gap: hp(6),
  },
  avatarCircle: {
    width: wp(68), height: wp(68), borderRadius: wp(34),
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#dbe9fb',
  },
  avatarText: { color: '#fff', fontSize: sp(28), fontWeight: '800' },
  title: { fontSize: sp(25), fontWeight: '800', color: colors.textPrimary, marginTop: hp(2) },
  subtitle: {
    color: colors.textSecondary, fontWeight: '500', textAlign: 'center',
    lineHeight: sp(20), fontSize: sp(14),
  },
  sectionTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: sp(16), marginBottom: hp(4) },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: wp(10), borderBottomWidth: 1, borderBottomColor: '#e6ebf2', paddingVertical: hp(8),
  },
  infoLabel: { minWidth: wp(68), color: colors.textMuted, fontWeight: '700', fontSize: sp(12), paddingTop: hp(2) },
  infoValue: {
    flex: 1, textAlign: 'right', color: colors.textPrimary,
    fontWeight: '800', fontSize: sp(13), lineHeight: sp(18),
  },
  note: { color: colors.textSecondary, lineHeight: sp(20), fontWeight: '500', fontSize: sp(14) },
  logoutWrap: { marginTop: hp(4) },
});
