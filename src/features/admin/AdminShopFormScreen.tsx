import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Card, Field, PrimaryButton, Screen } from '../../components/ui';
import { useGetShopsQuery, useUpsertShopMutation } from '../../store/hrmsApi';
import { useAppSelector } from '../../store/hooks';
import type { ShopStatus } from '../../types/models';
import type { AdminShopsStackParamList } from '../../types/navigation';
import { colors } from '../../theme/colors';
import { logError, logInfo } from '../../utils/logger';

type ShopForm = {
  id?: string;
  shopName: string;
  address: string;
  ownerName: string;
  contactNumber: string;
  email: string;
  username: string;
  bootstrapPassword: string;
  status: ShopStatus;
};

const initialForm: ShopForm = {
  shopName: '',
  address: '',
  ownerName: '',
  contactNumber: '',
  email: '',
  username: '',
  bootstrapPassword: '',
  status: 'active',
};

export function AdminShopFormScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AdminShopsStackParamList>>();
  const route = useRoute<RouteProp<AdminShopsStackParamList, 'CreateShop' | 'EditShop'>>();
  const authUser = useAppSelector(state => state.auth.user);
  const { data: shops = [], isLoading: loadingShops } = useGetShopsQuery();
  const [upsertShop, { isLoading: saving }] = useUpsertShopMutation();
  const [form, setForm] = useState<ShopForm>(initialForm);

  const isEdit = route.name === 'EditShop';
  const editingShopId = isEdit ? route.params?.shopId : undefined;
  const editingShop = useMemo(() => shops.find(item => item.id === editingShopId), [editingShopId, shops]);

  useEffect(() => {
    if (!isEdit) {
      setForm(initialForm);
      return;
    }
    if (!editingShop) {
      return;
    }
    setForm({
      id: editingShop.id,
      shopName: editingShop.shopName,
      address: editingShop.address,
      ownerName: editingShop.ownerName,
      contactNumber: editingShop.contactNumber,
      email: editingShop.email,
      username: editingShop.username,
      bootstrapPassword: '',
      status: editingShop.status,
    });
  }, [editingShop, isEdit]);

  const save = async () => {
    if (!authUser || authUser.role !== 'super_admin') {
      Alert.alert('Permission', 'Only super admin can manage shops.');
      return;
    }

    const trimmed = {
      shopName: form.shopName.trim(),
      address: form.address.trim(),
      ownerName: form.ownerName.trim(),
      contactNumber: form.contactNumber.trim(),
      email: form.email.trim(),
      username: form.username.trim(),
      bootstrapPassword: form.bootstrapPassword.trim(),
    };

    if (!trimmed.shopName || !trimmed.ownerName || !trimmed.contactNumber || !trimmed.email || !trimmed.username) {
      Alert.alert('Validation', 'Please fill all required shop details.');
      return;
    }
    if (!form.id && trimmed.bootstrapPassword.length < 6) {
      Alert.alert('Validation', 'Initial login password is required and must be at least 6 characters.');
      return;
    }

    try {
      const payload = {
        id: form.id,
        shopName: trimmed.shopName,
        address: trimmed.address,
        ownerName: trimmed.ownerName,
        contactNumber: trimmed.contactNumber,
        email: trimmed.email,
        username: trimmed.username,
        status: form.status,
        createdByAdminUid: authUser.uid,
      };

      const upsertPayload =
        !form.id || trimmed.bootstrapPassword
          ? { ...payload, bootstrapPassword: trimmed.bootstrapPassword }
          : payload;

      logInfo('ADMIN_SHOP_SAVE_ATTEMPT', {
        mode: form.id ? 'update' : 'create',
        username: trimmed.username,
        email: trimmed.email.toLowerCase(),
      });

      await upsertShop(upsertPayload).unwrap();

      Alert.alert('Success', form.id ? 'Shop updated successfully.' : 'Shop and login user created successfully.');
      navigation.goBack();
    } catch (error) {
      const errorRef = logError('ADMIN_SHOP_SAVE_FAILED', error, {
        mode: form.id ? 'update' : 'create',
        username: trimmed.username,
        email: trimmed.email.toLowerCase(),
      });
      Alert.alert('Failed', `${(error as Error).message}\nRef: ${errorRef}`);
    }
  };

  if (isEdit && !editingShop && !loadingShops) {
    return (
      <Screen>
        <View style={styles.missingWrap}>
          <Text style={styles.missingTitle}>Shop Not Found</Text>
          <Text style={styles.missingSub}>This shop no longer exists or was removed by another admin.</Text>
          <Pressable style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card>
          <Text style={styles.title}>{isEdit ? 'Update Shop Details' : 'Create New Shop'}</Text>
          <Text style={styles.subtitle}>Maintain clean, secure, and complete shop records for stable operations.</Text>
          <Field label="Shop Name" value={form.shopName} onChangeText={v => setForm(prev => ({ ...prev, shopName: v }))} />
          <Field label="Shop Address" value={form.address} onChangeText={v => setForm(prev => ({ ...prev, address: v }))} />
          <Field label="Owner Name" value={form.ownerName} onChangeText={v => setForm(prev => ({ ...prev, ownerName: v }))} />
          <Field
            label="Contact Number"
            keyboardType="phone-pad"
            value={form.contactNumber}
            onChangeText={v => setForm(prev => ({ ...prev, contactNumber: v }))}
          />
          <Field
            label="Email"
            keyboardType="email-address"
            value={form.email}
            onChangeText={v => setForm(prev => ({ ...prev, email: v }))}
          />
          <Field label="Shop Username" value={form.username} onChangeText={v => setForm(prev => ({ ...prev, username: v }))} />
          <Field
            label="Initial Login Password"
            value={form.bootstrapPassword}
            secureTextEntry
            onChangeText={v => setForm(prev => ({ ...prev, bootstrapPassword: v }))}
            placeholder={form.id ? 'Leave blank to keep current auth password' : 'At least 6 characters'}
          />

          <View style={styles.statusWrap}>
            <Text style={styles.statusLabel}>Shop Status</Text>
            <View style={styles.statusRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.statusBtn,
                  form.status === 'active' && styles.statusBtnActive,
                  pressed && form.status !== 'active' && styles.statusBtnPressed,
                ]}
                onPress={() => setForm(prev => ({ ...prev, status: 'active' }))}>
                <Text style={[styles.statusBtnText, form.status === 'active' && styles.statusBtnTextActive]}>Active</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.statusBtn,
                  form.status === 'inactive' && styles.statusBtnInactive,
                  pressed && form.status !== 'inactive' && styles.statusBtnPressed,
                ]}
                onPress={() => setForm(prev => ({ ...prev, status: 'inactive' }))}>
                <Text style={[styles.statusBtnText, form.status === 'inactive' && styles.statusBtnTextInactive]}>Inactive</Text>
              </Pressable>
            </View>
          </View>

          <PrimaryButton title={isEdit ? 'Update Shop' : 'Create Shop'} onPress={save} loading={saving} />
          <Pressable
            style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
            onPress={() => navigation.goBack()}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 36,
    gap: 12,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: 2,
  },
  statusWrap: {
    gap: 8,
  },
  statusLabel: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBtnPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  statusBtnActive: {
    borderColor: '#9ad9c5',
    backgroundColor: colors.successSoft,
  },
  statusBtnInactive: {
    borderColor: '#f0bdbd',
    backgroundColor: colors.dangerSoft,
  },
  statusBtnText: {
    color: colors.textSecondary,
    fontWeight: '800',
  },
  statusBtnTextActive: {
    color: colors.success,
  },
  statusBtnTextInactive: {
    color: colors.danger,
  },
  cancelBtn: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  cancelBtnPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  missingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  missingTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  missingSub: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  backBtn: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    backgroundColor: colors.primaryPressed,
  },
  backBtnText: {
    color: '#fff',
    fontWeight: '800',
  },
});
