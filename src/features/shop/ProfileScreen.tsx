import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Field, PrimaryButton, Screen } from '../../components/ui';
import { logout } from '../../services/authService';
import { clearSession, setUser } from '../../store/authSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  useChangeShopManagerPasswordMutation,
  useDeleteShopManagerAccountMutation,
  useGetShopByIdQuery,
  useUpdateShopSelfServiceProfileMutation,
} from '../../store/hrmsApi';
import { colors } from '../../theme/colors';

export function ProfileScreen() {
  const user = useAppSelector(state => state.auth.user);
  const dispatch = useAppDispatch();
  const shopId = user?.shopId ?? '';

  const { data: shop } = useGetShopByIdQuery(shopId, { skip: !shopId });
  const [updateProfile, { isLoading: savingProfile }] = useUpdateShopSelfServiceProfileMutation();
  const [changePassword, { isLoading: changingPassword }] = useChangeShopManagerPasswordMutation();
  const [deleteAccount, { isLoading: deletingAccount }] = useDeleteShopManagerAccountMutation();

  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  useEffect(() => {
    if (!shop) {
      return;
    }
    setShopName(shop.shopName);
    setOwnerName(shop.ownerName);
    setEmail(shop.email);
    setContactNumber(shop.contactNumber);
    setAddress(shop.address);
  }, [shop]);

  const onSave = async () => {
    if (!shop || !user) {
      Alert.alert('Error', 'Shop profile not loaded.');
      return;
    }
    if (!shopName || !ownerName || !email || !contactNumber) {
      Alert.alert('Validation', 'Shop name, owner, email and contact are required.');
      return;
    }

    const normalizedNewEmail = email.trim().toLowerCase();
    const normalizedExistingEmail = shop.email.trim().toLowerCase();
    const isEmailChanged = normalizedNewEmail !== normalizedExistingEmail;
    if (isEmailChanged && !profileCurrentPassword.trim()) {
      Alert.alert('Validation', 'Current password is required when changing login email.');
      return;
    }

    try {
      const updated = await updateProfile({
        shopId: shop.id,
        shopName: shopName.trim(),
        address: address.trim(),
        ownerName: ownerName.trim(),
        contactNumber: contactNumber.trim(),
        email: normalizedNewEmail,
        currentPassword: profileCurrentPassword.trim(),
      }).unwrap();
      dispatch(
        setUser({
          uid: user.uid,
          role: user.role,
          shopId: user.shopId,
          email: updated.email,
          displayName: updated.ownerName,
        }),
      );
      setProfileCurrentPassword('');
      Alert.alert('Saved', 'Shop profile updated successfully.');
    } catch (error) {
      Alert.alert('Update failed', (error as Error).message);
    }
  };

  const onChangePassword = async () => {
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert('Validation', 'Current password, new password and confirm password are required.');
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
      Alert.alert('Password updated', 'Your login password has been changed successfully.');
    } catch (error) {
      Alert.alert('Password update failed', (error as Error).message);
    }
  };

  const runDeleteAccount = async () => {
    if (!shopId) {
      Alert.alert('Delete failed', 'Shop account context is missing.');
      return;
    }
    if (!deletePassword.trim()) {
      Alert.alert('Validation', 'Current password is required to delete account.');
      return;
    }
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      Alert.alert('Validation', "Type DELETE in confirmation field to continue.");
      return;
    }

    try {
      await deleteAccount({ shopId, currentPassword: deletePassword.trim() }).unwrap();
      await logout();
      dispatch(clearSession());
      Alert.alert('Account deleted', 'Your account and shop data have been deleted permanently.');
    } catch (error) {
      Alert.alert('Delete failed', (error as Error).message);
    }
  };

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete account permanently?',
      'This will permanently remove your shop profile, staff, attendance and salary data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete forever', style: 'destructive', onPress: runDeleteAccount },
      ],
    );
  };

  const onLogout = async () => {
    try {
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
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>Profile Control Center</Text>
          </View>
          <Text style={styles.title}>Profile</Text>
          <Text style={styles.subtitle}>
            Update your details, change your password, and manage account security in one place.
          </Text>
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Account Snapshot</Text>
          <InfoRow label="Role" value={user?.role ?? '-'} />
          <InfoRow label="Shop ID" value={shopId || '-'} />
          <InfoRow label="Username" value={shop?.username ?? '-'} />
          <InfoRow label="Status" value={shop?.status?.toUpperCase() ?? '-'} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Business Details</Text>
          <Field label="Shop Name" value={shopName} onChangeText={setShopName} />
          <Field label="Owner Name" value={ownerName} onChangeText={setOwnerName} />
          <Field label="Login Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <Field label="Contact Number" value={contactNumber} onChangeText={setContactNumber} keyboardType="phone-pad" />
          <Field label="Address" value={address} onChangeText={setAddress} />
          <Field
            label="Current Password (Required only if email changes)"
            value={profileCurrentPassword}
            onChangeText={setProfileCurrentPassword}
            secureTextEntry
          />
          <PrimaryButton title="Save Profile Changes" onPress={onSave} loading={savingProfile} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Security</Text>
          <Text style={styles.sectionSub}>Change your login password regularly to keep account access secure.</Text>
          <Field label="Current Password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
          <Field label="New Password" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
          <Field label="Confirm New Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
          <PrimaryButton title="Update Password" onPress={onChangePassword} loading={changingPassword} />
        </Card>

        <Card>
          <Text style={styles.dangerTitle}>Danger Zone</Text>
          <Text style={styles.dangerSub}>
            Permanent action: deleting your account removes all shop records including employees, attendance, salary and settings.
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
  content: {
    gap: 14,
    paddingBottom: 24,
  },
  hero: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#d8e0f0',
    backgroundColor: '#f4f7ff',
    alignItems: 'flex-start',
    paddingVertical: 20,
    paddingHorizontal: 14,
    gap: 8,
  },
  heroBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bfd1f0',
    backgroundColor: '#e4ecfb',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBadgeText: {
    color: '#1b4f9c',
    fontSize: 11,
    fontWeight: '800',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 4,
  },
  sectionSub: {
    color: colors.textSecondary,
    lineHeight: 19,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e6ebf2',
    paddingVertical: 8,
  },
  infoLabel: {
    width: 72,
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    paddingTop: 2,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 18,
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
});
