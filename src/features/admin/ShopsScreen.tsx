import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Field, PrimaryButton, Screen } from '../../components/ui';
import { useDeleteShopMutation, useGetShopsQuery, useUpsertShopMutation } from '../../store/hrmsApi';
import { useAppSelector } from '../../store/hooks';
import type { ShopStatus } from '../../types/models';
import { colors } from '../../theme/colors';

interface ShopForm {
  id?: string;
  shopName: string;
  address: string;
  ownerName: string;
  contactNumber: string;
  email: string;
  username: string;
  password: string;
  status: ShopStatus;
}

const initialForm: ShopForm = {
  shopName: '',
  address: '',
  ownerName: '',
  contactNumber: '',
  email: '',
  username: '',
  password: '',
  status: 'active',
};

export function ShopsScreen() {
  const authUser = useAppSelector(state => state.auth.user);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<ShopForm>(initialForm);
  const [showForm, setShowForm] = useState(false);

  const { data: shops = [], isLoading } = useGetShopsQuery();
  const [upsertShop, { isLoading: saving }] = useUpsertShopMutation();
  const [deleteShop] = useDeleteShopMutation();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return shops;
    }
    return shops.filter(
      s =>
        s.shopName.toLowerCase().includes(q) ||
        s.ownerName.toLowerCase().includes(q) ||
        s.contactNumber.toLowerCase().includes(q),
    );
  }, [query, shops]);

  const resetForm = () => setForm(initialForm);

  const openNewForm = () => {
    resetForm();
    setShowForm(true);
  };

  const save = async () => {
    if (!authUser || authUser.role !== 'super_admin') {
      Alert.alert('Permission', 'Only super admin can manage shops.');
      return;
    }

    if (!form.shopName || !form.ownerName || !form.contactNumber || !form.email || !form.username || !form.password) {
      Alert.alert('Validation', 'Please fill all required shop details including password.');
      return;
    }

    try {
      await upsertShop({
        id: form.id,
        shopName: form.shopName,
        address: form.address,
        ownerName: form.ownerName,
        contactNumber: form.contactNumber,
        email: form.email,
        username: form.username,
        password: form.password,
        status: form.status,
        createdByAdminUid: authUser.uid,
      }).unwrap();

      Alert.alert('Success', 'Shop saved successfully.');
      resetForm();
      setShowForm(false);
    } catch (error) {
      Alert.alert('Failed', (error as Error).message);
    }
  };

  const onEdit = (item: (typeof shops)[number]) => {
    setForm({
      id: item.id,
      shopName: item.shopName,
      address: item.address,
      ownerName: item.ownerName,
      contactNumber: item.contactNumber,
      email: item.email,
      username: item.username,
      password: item.password ?? '',
      status: item.status,
    });
    setShowForm(true);
  };

  const onDelete = (shopId: string) => {
    Alert.alert('Delete Shop', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteShop(shopId).unwrap();
          } catch (error) {
            Alert.alert('Failed', (error as Error).message);
          }
        },
      },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerWrap}>
          <View style={styles.heroGlow} />
          <View style={styles.headerTopRow}>
            <View style={styles.headerTextBlock}>
              <Text style={styles.title}>Shops</Text>
              <Text style={styles.subtitle}>Production-ready shop management with fast search and actions.</Text>
            </View>
            <Pressable style={({ pressed }) => [styles.newButton, pressed && styles.newButtonPressed]} onPress={openNewForm}>
              <Text style={styles.newButtonText}>+ New</Text>
            </Pressable>
          </View>
          <View style={styles.headerMetaRow}>
            <View style={styles.metaChip}>
              <Text style={styles.metaLabel}>Total</Text>
              <Text style={styles.metaValue}>{shops.length}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaLabel}>Active</Text>
              <Text style={styles.metaValue}>{shops.filter(shop => shop.status === 'active').length}</Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaLabel}>Visible</Text>
              <Text style={styles.metaValue}>{filtered.length}</Text>
            </View>
          </View>
        </View>

        <Card>
          <Field label="Search Shops" value={query} onChangeText={setQuery} placeholder="Shop name / owner / contact" />
          {!!query.trim() && (
            <Pressable style={styles.clearSearchBtn} onPress={() => setQuery('')}>
              <Text style={styles.clearSearchText}>Clear Search</Text>
            </Pressable>
          )}
        </Card>

        {showForm && (
          <Card>
            <View style={styles.formHeader}>
              <Text style={styles.sectionTitle}>{form.id ? 'Update Shop' : 'Create New Shop'}</Text>
              <Pressable
                style={styles.closeBtn}
                onPress={() => {
                  resetForm();
                  setShowForm(false);
                }}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.formSubTitle}>Fill all required details to keep records consistent and secure.</Text>
            <Field label="Shop Name" value={form.shopName} onChangeText={v => setForm(prev => ({ ...prev, shopName: v }))} />
            <Field label="Shop Address" value={form.address} onChangeText={v => setForm(prev => ({ ...prev, address: v }))} />
            <Field label="Owner Name" value={form.ownerName} onChangeText={v => setForm(prev => ({ ...prev, ownerName: v }))} />
            <Field
              label="Contact Number"
              keyboardType="phone-pad"
              value={form.contactNumber}
              onChangeText={v => setForm(prev => ({ ...prev, contactNumber: v }))}
            />
            <Field label="Email" value={form.email} onChangeText={v => setForm(prev => ({ ...prev, email: v }))} />
            <Field label="Shop Username" value={form.username} onChangeText={v => setForm(prev => ({ ...prev, username: v }))} />
            <Field
              label="Shop Password"
              value={form.password}
              secureTextEntry
              onChangeText={v => setForm(prev => ({ ...prev, password: v }))}
            />

            <View style={styles.buttonRow}>
              <View style={styles.flex1}>
                <PrimaryButton title={form.id ? 'Update Shop' : 'Create Shop'} onPress={save} loading={saving} />
              </View>
              <Pressable style={({ pressed }) => [styles.resetButton, pressed && styles.resetButtonPressed]} onPress={resetForm}>
                <Text style={styles.resetText}>Reset</Text>
              </Pressable>
            </View>
          </Card>
        )}

        <Text style={styles.listTitle}>{isLoading ? 'Loading shops...' : `${filtered.length} shops`}</Text>

        {filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No Shops Found</Text>
            <Text style={styles.emptySub}>Try a different search query or create a new shop.</Text>
            <Pressable style={({ pressed }) => [styles.newInlineBtn, pressed && styles.newButtonPressed]} onPress={openNewForm}>
              <Text style={styles.newButtonText}>+ Create New Shop</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.listContent}>
            {filtered.map(item => (
              <View key={item.id} style={styles.shopCard}>
                <View style={styles.shopCardTop}>
                  <Text style={styles.shopName} numberOfLines={2} ellipsizeMode="tail">
                    {item.shopName}
                  </Text>
                  <View style={[styles.badge, item.status === 'active' ? styles.badgeActive : styles.badgeInactive]}>
                    <Text style={[styles.badgeText, item.status === 'active' ? styles.badgeTextActive : styles.badgeTextInactive]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.shopInfoBlock}>
                  <InfoRow label="Owner" value={item.ownerName} />
                  <InfoRow label="Contact" value={item.contactNumber} />
                  <InfoRow label="Email" value={item.email} />
                  <InfoRow label="Username" value={item.username} />
                  <InfoRow label="Address" value={item.address || '-'} multiline />
                </View>
                <View style={styles.actionRow}>
                  <Pressable style={({ pressed }) => [styles.editBtn, pressed && styles.editBtnPressed]} onPress={() => onEdit(item)}>
                    <Text style={styles.editTxt}>Edit Shop</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
                    onPress={() => onDelete(item.id)}>
                    <Text style={styles.deleteTxt}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function InfoRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={styles.infoValue}
        numberOfLines={multiline ? 3 : 1}
        ellipsizeMode="tail"
        selectable={false}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    gap: 10,
    borderRadius: 18,
    backgroundColor: '#f4f8ff',
    borderWidth: 1,
    borderColor: '#d7e5fb',
    padding: 14,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    right: -55,
    top: -46,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#d7e9ff',
    opacity: 0.8,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTextBlock: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
    fontWeight: '600',
    lineHeight: 19,
  },
  headerMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metaChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d7dee8',
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  metaValue: {
    marginTop: 2,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  newButton: {
    backgroundColor: colors.primary,
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  newButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  clearSearchBtn: {
    marginTop: 2,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d7dee8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  clearSearchText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  formSubTitle: {
    color: colors.textSecondary,
    fontWeight: '500',
    lineHeight: 19,
    marginBottom: 4,
  },
  closeBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  closeText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  buttonRow: {
    marginTop: 4,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  flex1: {
    flex: 1,
  },
  resetButton: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  resetButtonPressed: {
    backgroundColor: '#f4f7fb',
  },
  resetText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  listTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  listContent: {
    gap: 12,
    paddingBottom: 40,
  },
  pageContent: {
    gap: 12,
    paddingBottom: 50,
  },
  shopCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7dee8',
    padding: 12,
    gap: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  shopCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  shopName: {
    flex: 1,
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 18,
    paddingRight: 4,
    lineHeight: 24,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  badgeActive: {
    backgroundColor: '#e8f9f1',
    borderColor: '#b7ead3',
  },
  badgeInactive: {
    backgroundColor: '#fdeeee',
    borderColor: '#f7c2c2',
  },
  badgeText: {
    fontWeight: '800',
    fontSize: 11,
  },
  badgeTextActive: {
    color: '#0f9f63',
  },
  badgeTextInactive: {
    color: '#c22a2a',
  },
  shopInfoBlock: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e6ebf2',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  infoLabel: {
    width: 76,
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    paddingTop: 2,
  },
  infoValue: {
    flex: 1,
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  editBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: '#c8daf7',
  },
  editBtnPressed: {
    backgroundColor: '#d1e3ff',
  },
  editTxt: {
    color: colors.primary,
    fontWeight: '800',
  },
  deleteBtn: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fdeeee',
    borderWidth: 1,
    borderColor: '#f7c2c2',
  },
  deleteBtnPressed: {
    backgroundColor: '#fadede',
  },
  deleteTxt: {
    color: '#c22a2a',
    fontWeight: '800',
  },
  emptyWrap: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7dee8',
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 17,
  },
  emptySub: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  newInlineBtn: {
    marginTop: 4,
    backgroundColor: colors.primary,
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
