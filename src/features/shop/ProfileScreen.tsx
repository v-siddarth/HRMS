import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Field, PrimaryButton, Screen } from '../../components/ui';
import { logout } from '../../services/authService';
import { clearSession } from '../../store/authSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { useGetShopByIdQuery, useUpsertShopMutation } from '../../store/hrmsApi';
import { colors } from '../../theme/colors';

export function ProfileScreen() {
  const user = useAppSelector(state => state.auth.user);
  const dispatch = useAppDispatch();
  const shopId = user?.shopId ?? '';

  const { data: shop } = useGetShopByIdQuery(shopId, { skip: !shopId });
  const [updateShop, { isLoading: saving }] = useUpsertShopMutation();

  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');

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

    try {
      await updateShop({
        id: shop.id,
        shopName: shopName.trim(),
        address: address.trim(),
        ownerName: ownerName.trim(),
        contactNumber: contactNumber.trim(),
        email: email.trim(),
        username: shop.username,
        status: shop.status,
        createdByAdminUid: shop.createdByAdminUid,
        bootstrapPassword: undefined,
        authUid: shop.authUid,
        authProvisionStatus: shop.authProvisionStatus,
        authProvisionedAt: shop.authProvisionedAt,
        authLastSyncedAt: shop.authLastSyncedAt,
        authLastError: shop.authLastError,
      }).unwrap();
      Alert.alert('Saved', 'Shop profile updated successfully.');
    } catch (error) {
      Alert.alert('Update failed', (error as Error).message);
    }
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
          <View style={styles.heroCircle}>
            <Text style={styles.heroCircleText}>{(shopName?.[0] ?? 'S').toUpperCase()}</Text>
          </View>
          <Text style={styles.title}>Shop Profile</Text>
          <Text style={styles.subtitle}>Update core shop details for payroll, attendance, and reporting consistency.</Text>
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Account Snapshot</Text>
          <InfoRow label="Role" value={user?.role ?? '-'} />
          <InfoRow label="Shop ID" value={shopId || '-'} />
          <InfoRow label="Username" value={shop?.username ?? '-'} />
          <InfoRow label="Status" value={shop?.status?.toUpperCase() ?? '-'} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Basic Shop Details</Text>
          <Field label="Shop Name" value={shopName} onChangeText={setShopName} />
          <Field label="Owner Name" value={ownerName} onChangeText={setOwnerName} />
          <Field label="Email" value={email} onChangeText={setEmail} />
          <Field label="Contact Number" value={contactNumber} onChangeText={setContactNumber} keyboardType="phone-pad" />
          <Field label="Address" value={address} onChangeText={setAddress} />
          <PrimaryButton title="Save Shop Profile" onPress={onSave} loading={saving} />
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
    gap: 12,
    paddingBottom: 20,
  },
  hero: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cfe5dc',
    backgroundColor: '#eaf8f2',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 14,
    gap: 6,
  },
  heroCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: colors.success,
    borderWidth: 3,
    borderColor: '#d9f3e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCircleText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  subtitle: {
    color: colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 4,
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
});
