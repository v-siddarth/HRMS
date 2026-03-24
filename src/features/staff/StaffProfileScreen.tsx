import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import dayjs from 'dayjs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, Field, PrimaryButton } from '../../components/ui';
import { logout } from '../../services/authService';
import { clearSession } from '../../store/authSlice';
import {
  hrmsApi,
  useChangeStaffPasswordMutation,
  useDeleteStaffAccountMutation,
  useGetShopByIdQuery,
  useGetStaffSelfProfileQuery,
  useGetStaffShiftOverviewQuery,
} from '../../store/hrmsApi';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { colors } from '../../theme/colors';
import type { EmployeeAuthStatus } from '../../types/models';

export function StaffProfileScreen() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';
  const weekStartDate = useMemo(() => dayjs().startOf('week').add(1, 'day').format('YYYY-MM-DD'), []);

  const {
    data: profile,
    isLoading: loadingProfile,
    error: profileError,
  } = useGetStaffSelfProfileQuery();
  const { data: shop } = useGetShopByIdQuery(shopId, { skip: !shopId });
  const { data: shiftOverview } = useGetStaffShiftOverviewQuery({ weekStartDate });
  const [changePassword, { isLoading: changingPassword }] = useChangeStaffPasswordMutation();
  const [deleteStaffAccount, { isLoading: deletingAccount }] = useDeleteStaffAccountMutation();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const authStatus = getAuthStatus(profile?.authStatus);
  const authMeta = getAuthMeta(authStatus);
  const errorMessage = extractErrorMessage(profileError);
  const joinedLabel = formatDate(profile?.joiningDate);
  const activeSinceLabel = formatDate(profile?.activatedAt || profile?.joiningDate);
  const deactivatedLabel = formatDate(profile?.deactivatedAt);
  const accountStatus = profile?.status === 'inactive' ? 'Inactive' : 'Active';
  const durationLabel = getEmploymentDuration(profile?.activatedAt || profile?.joiningDate);

  const onChangePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert('Validation', 'Current password, new password, and confirm password are required.');
      return;
    }
    if (newPassword.trim().length < 6) {
      Alert.alert('Validation', 'New password must be at least 6 characters.');
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      Alert.alert('Validation', 'New password and confirm password do not match.');
      return;
    }

    try {
      await changePassword({
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      }).unwrap();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password updated', 'Your staff login password has been changed successfully.');
    } catch (error) {
      Alert.alert('Password update failed', (error as Error).message);
    }
  };

  const runDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      Alert.alert('Validation', 'Current password is required to delete account.');
      return;
    }
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      Alert.alert('Validation', 'Type DELETE in the confirmation field to continue.');
      return;
    }

    try {
      await deleteStaffAccount({ currentPassword: deletePassword.trim() }).unwrap();
      dispatch(hrmsApi.util.resetApiState());
      await logout();
      dispatch(clearSession());
      Alert.alert('Account deleted', 'Your staff account has been deleted permanently.');
    } catch (error) {
      Alert.alert('Delete failed', (error as Error).message);
    }
  };

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete account permanently?',
      'This will permanently remove your staff login. Continue only if this is truly required.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete forever', style: 'destructive', onPress: runDeleteAccount },
      ],
    );
  };

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
    <View style={styles.page}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { paddingTop: insets.top + 16 }]}>
          <View style={styles.heroGlowLarge} />
          <View style={styles.heroGlowSmall} />

          <View style={styles.heroTopRow}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>Profile</Text>
            </View>
            <View style={[styles.heroStatusPill, authMeta.pill]}>
              <Text style={[styles.heroStatusText, authMeta.text]}>{authMeta.label}</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>{profile?.name || user?.displayName || 'Staff profile'}</Text>
          <Text style={styles.heroSubtitle}>
            {profile?.designation || 'Staff member'} at {shop?.shopName || 'your shop'}
          </Text>

          <View style={styles.heroInfoCard}>
            <HeroStat label="Code" value={profile?.employeeCode || '-'} />
            <HeroStat label="Status" value={accountStatus} />
            <HeroStat label="Duration" value={durationLabel} />
          </View>
        </View>

        <View style={styles.body}>
          <Card>
            <Text style={styles.sectionTitle}>Professional Details</Text>
            <InfoRow label="Full Name" value={profile?.name || '-'} />
            <InfoRow label="Employee Code" value={profile?.employeeCode || '-'} />
            <InfoRow label="Designation" value={profile?.designation || '-'} />
            <InfoRow label="Phone" value={profile?.phone || '-'} />
            <InfoRow label="Joining Date" value={joinedLabel} />
            <InfoRow label="Active Since" value={activeSinceLabel} />
            <InfoRow label="Employment Duration" value={durationLabel} />
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Shop and Work Setup</Text>
            <InfoRow label="Shop Name" value={shop?.shopName || '-'} />
            <InfoRow label="Shop Address" value={shop?.address || '-'} multiline />
            <InfoRow label="Owner Name" value={shop?.ownerName || '-'} />
            <InfoRow label="Weekly Off" value={formatWeeklyOff(shiftOverview?.weeklyOff ?? profile?.weeklyOff)} />
            <InfoRow label="Current Shift" value={shiftOverview?.todayShift?.name || shiftOverview?.defaultShift?.name || 'Not assigned'} />
            <InfoRow
              label="Shift Timing"
              value={
                shiftOverview?.todayShift
                  ? `${shiftOverview.todayShift.startTime} - ${shiftOverview.todayShift.endTime}`
                  : shiftOverview?.defaultShift
                    ? `${shiftOverview.defaultShift.startTime} - ${shiftOverview.defaultShift.endTime}`
                    : 'Not available'
              }
            />
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Identity and Access</Text>
            <InfoRow label="Role" value={user?.role ? sentenceCase(user.role) : '-'} />
            <InfoRow label="Login Email" value={profile?.loginEmail || user?.email || '-'} />
            <InfoRow label="Employee ID" value={profile?.id || user?.employeeId || '-'} />
            <InfoRow label="Shop ID" value={shopId || '-'} />
            <InfoRow label="Aadhaar No" value={profile?.aadhaarNo || '-'} />
            <InfoRow label="Biometric User ID" value={profile?.biometricUserId || '-'} />
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Account Security</Text>
            <Text style={styles.sectionText}>
              Your login state, account provisioning, and latest access timestamps stay visible here for easy review.
            </Text>
            <View style={styles.securityPanel}>
              <SecurityPill label={authMeta.label} tone={authMeta.tone} />
              <InfoRow label="Account Status" value={accountStatus} />
              <InfoRow label="Auth Status" value={authMeta.label} />
              <InfoRow label="Provisioned At" value={formatDateTime(profile?.authProvisionedAt)} />
              <InfoRow label="Last Login" value={formatDateTime(profile?.lastLoginAt)} />
              <InfoRow label="Disabled At" value={formatDateTime(profile?.authDisabledAt)} />
              <InfoRow label="Inactive Since" value={deactivatedLabel} />
              <InfoRow label="Auth Error" value={profile?.authLastError?.trim() || 'None'} multiline />
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Change Password</Text>
            <Text style={styles.sectionText}>Use a fresh password regularly to keep your staff login secure.</Text>
            <Field label="Current Password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
            <Field label="New Password" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
            <Field label="Confirm New Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
            <PrimaryButton title="Update Password" onPress={onChangePassword} loading={changingPassword} />
          </Card>

          <Card>
            <Text style={styles.dangerTitle}>Danger Zone</Text>
            <Text style={styles.dangerSub}>
              Account deletion is permanent. In production, deactivation or managed removal is usually safer, so use this only when required.
            </Text>
            <Field label="Current Password" value={deletePassword} onChangeText={setDeletePassword} secureTextEntry />
            <Field label='Type "DELETE" to Confirm' value={deleteConfirmText} onChangeText={setDeleteConfirmText} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete account"
              onPress={onDeleteAccount}
              disabled={deletingAccount}
              style={({ pressed }) => [
                styles.dangerBtn,
                deletingAccount && styles.dangerBtnDisabled,
                pressed && !deletingAccount && styles.dangerBtnPressed,
              ]}>
              <Text style={styles.dangerBtnText}>{deletingAccount ? 'Deleting...' : 'Delete My Account Permanently'}</Text>
            </Pressable>
          </Card>

          {loadingProfile ? (
            <Card>
              <Text style={styles.sectionTitle}>Loading Profile</Text>
              <Text style={styles.sectionText}>Fetching your staff profile, shop details, and security context.</Text>
            </Card>
          ) : null}

          {!loadingProfile && errorMessage ? (
            <Card>
              <Text style={styles.errorTitle}>Unable to load profile</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </Card>
          ) : null}

          <View style={styles.logoutWrap}>
            <PrimaryButton title="Logout" onPress={onLogout} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroStatCard}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function SecurityPill({
  label,
  tone,
}: {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const style = securityToneStyles(tone);
  return (
    <View style={[styles.securityPill, style.pill]}>
      <Text style={[styles.securityPillText, style.text]}>{label}</Text>
    </View>
  );
}

function InfoRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, multiline && styles.infoValueMultiline]} numberOfLines={multiline ? 3 : 2}>
        {value}
      </Text>
    </View>
  );
}

function getAuthStatus(value?: EmployeeAuthStatus) {
  return value || 'not_created';
}

function getAuthMeta(status: EmployeeAuthStatus) {
  switch (status) {
    case 'provisioned':
      return {
        label: 'Provisioned',
        tone: 'success' as const,
        pill: styles.heroStatusSuccess,
        text: styles.heroStatusTextSuccess,
      };
    case 'pending':
      return {
        label: 'Pending',
        tone: 'warning' as const,
        pill: styles.heroStatusWarning,
        text: styles.heroStatusTextWarning,
      };
    case 'disabled':
      return {
        label: 'Disabled',
        tone: 'danger' as const,
        pill: styles.heroStatusDanger,
        text: styles.heroStatusTextDanger,
      };
    case 'error':
      return {
        label: 'Error',
        tone: 'danger' as const,
        pill: styles.heroStatusDanger,
        text: styles.heroStatusTextDanger,
      };
    case 'not_created':
    default:
      return {
        label: 'Not Created',
        tone: 'neutral' as const,
        pill: styles.heroStatusNeutral,
        text: styles.heroStatusTextNeutral,
      };
  }
}

function securityToneStyles(tone: 'success' | 'warning' | 'danger' | 'neutral') {
  switch (tone) {
    case 'success':
      return { pill: styles.securityPillSuccess, text: styles.securityTextSuccess };
    case 'warning':
      return { pill: styles.securityPillWarning, text: styles.securityTextWarning };
    case 'danger':
      return { pill: styles.securityPillDanger, text: styles.securityTextDanger };
    case 'neutral':
    default:
      return { pill: styles.securityPillNeutral, text: styles.securityTextNeutral };
  }
}

function sentenceCase(value: string) {
  return value
    .split('_')
    .map(part => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(' ');
}

function formatDate(value?: string) {
  if (!value || !dayjs(value).isValid()) {
    return '-';
  }
  return dayjs(value).format('DD MMM YYYY');
}

function formatDateTime(value?: string) {
  if (!value || !dayjs(value).isValid()) {
    return '-';
  }
  return dayjs(value).format('DD MMM YYYY, hh:mm A');
}

function formatWeeklyOff(value?: string) {
  if (!value || value === 'none') {
    return 'None';
  }
  return value.toUpperCase();
}

function getEmploymentDuration(value?: string) {
  if (!value || !dayjs(value).isValid()) {
    return '-';
  }
  const start = dayjs(value);
  const now = dayjs();
  const years = now.diff(start, 'year');
  const months = now.diff(start.add(years, 'year'), 'month');

  if (years <= 0 && months <= 0) {
    const days = Math.max(0, now.diff(start, 'day'));
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  if (years > 0 && months > 0) {
    return `${years}y ${months}m`;
  }
  if (years > 0) {
    return `${years} year${years === 1 ? '' : 's'}`;
  }
  return `${months} month${months === 1 ? '' : 's'}`;
}

function extractErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return '';
  }
  return (
    (error as { data?: { message?: string }; message?: string }).data?.message ||
    (error as { message?: string }).message ||
    ''
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: 28,
  },
  hero: {
    overflow: 'hidden',
    backgroundColor: colors.success,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    gap: 12,
  },
  heroGlowLarge: {
    position: 'absolute',
    top: -88,
    right: -46,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#33ba90',
    opacity: 0.22,
  },
  heroGlowSmall: {
    position: 'absolute',
    left: -42,
    bottom: -90,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: '#05654d',
    opacity: 0.22,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  heroStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  heroStatusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: '#defbf1',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  heroInfoCard: {
    flexDirection: 'row',
    gap: 10,
  },
  heroStatCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 4,
  },
  heroStatValue: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  heroStatLabel: {
    color: '#d2f5e8',
    fontSize: 12,
    fontWeight: '600',
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 16,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e6ebf2',
    paddingVertical: 8,
  },
  infoLabel: {
    width: 110,
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    paddingTop: 2,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  infoValueMultiline: {
    textAlign: 'right',
  },
  securityPanel: {
    backgroundColor: colors.bgSoft,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dfe7f0',
    padding: 12,
    gap: 4,
  },
  securityPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 4,
  },
  securityPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  logoutWrap: {
    marginTop: 4,
  },
  dangerTitle: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: 16,
  },
  dangerSub: {
    color: '#7f1d1d',
    backgroundColor: '#fff1f1',
    borderColor: '#ffd1d1',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    lineHeight: 19,
    fontWeight: '600',
  },
  dangerBtn: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d23a3a',
    backgroundColor: '#c72f2f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  dangerBtnPressed: {
    backgroundColor: '#ab2626',
  },
  dangerBtnDisabled: {
    opacity: 0.6,
  },
  dangerBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '800',
  },
  errorText: {
    color: colors.textSecondary,
    lineHeight: 20,
    fontWeight: '500',
  },
  heroStatusSuccess: {
    backgroundColor: '#dff5ee',
  },
  heroStatusWarning: {
    backgroundColor: '#fff3de',
  },
  heroStatusDanger: {
    backgroundColor: '#fdecec',
  },
  heroStatusNeutral: {
    backgroundColor: '#edf2f7',
  },
  heroStatusTextSuccess: {
    color: colors.success,
  },
  heroStatusTextWarning: {
    color: colors.warning,
  },
  heroStatusTextDanger: {
    color: colors.danger,
  },
  heroStatusTextNeutral: {
    color: colors.textSecondary,
  },
  securityPillSuccess: {
    backgroundColor: '#dff5ee',
  },
  securityPillWarning: {
    backgroundColor: '#fff3de',
  },
  securityPillDanger: {
    backgroundColor: '#fdecec',
  },
  securityPillNeutral: {
    backgroundColor: '#edf2f7',
  },
  securityTextSuccess: {
    color: colors.success,
  },
  securityTextWarning: {
    color: colors.warning,
  },
  securityTextDanger: {
    color: colors.danger,
  },
  securityTextNeutral: {
    color: colors.textSecondary,
  },
});
