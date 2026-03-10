import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Field, Screen } from '../../components/ui';
import { useGetShopsQuery, useUpsertShopMutation } from '../../store/hrmsApi';
import { colors } from '../../theme/colors';
import type { ShopStatus } from '../../types/models';

export function AdminStatusScreen() {
  const [query, setQuery] = useState('');
  const [updatingShopId, setUpdatingShopId] = useState('');

  const { data: shops = [], isLoading } = useGetShopsQuery();
  const [upsertShop] = useUpsertShopMutation();

  const activeCount = shops.filter(shop => shop.status === 'active').length;
  const inactiveCount = shops.length - activeCount;

  const filteredShops = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return shops;
    }
    return shops.filter(
      shop =>
        shop.shopName.toLowerCase().includes(q) ||
        shop.ownerName.toLowerCase().includes(q) ||
        shop.email.toLowerCase().includes(q) ||
        shop.contactNumber.toLowerCase().includes(q),
    );
  }, [query, shops]);

  const updateStatus = async (shopId: string, nextStatus: ShopStatus) => {
    const shop = shops.find(item => item.id === shopId);
    if (!shop || shop.status === nextStatus) {
      return;
    }

    try {
      setUpdatingShopId(shopId);
      await upsertShop({
        id: shop.id,
        shopName: shop.shopName,
        address: shop.address,
        ownerName: shop.ownerName,
        contactNumber: shop.contactNumber,
        email: shop.email,
        username: shop.username,
        password: shop.password,
        status: nextStatus,
        createdByAdminUid: shop.createdByAdminUid,
      }).unwrap();
      Alert.alert('Updated', `Shop marked as ${nextStatus}.`);
    } catch (error) {
      Alert.alert('Update failed', (error as Error).message);
    } finally {
      setUpdatingShopId('');
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerWrap}>
          <Text style={styles.title}>Shop Status</Text>
          <Text style={styles.subtitle}>Activate or deactivate shop access with clear operational visibility.</Text>
        </View>

        <View style={styles.countRow}>
          <CountCard label="Total Shops" value={isLoading ? '...' : String(shops.length)} tone="slate" />
          <CountCard label="Active" value={isLoading ? '...' : String(activeCount)} tone="green" />
          <CountCard label="Inactive" value={isLoading ? '...' : String(inactiveCount)} tone="red" />
        </View>

        <Card>
          <Field
            label="Search Shops"
            value={query}
            onChangeText={setQuery}
            placeholder="Shop name / owner / email / contact"
          />
        </Card>

        <Text style={styles.sectionTitle}>{isLoading ? 'Loading shops...' : `${filteredShops.length} shops`}</Text>

        {filteredShops.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No Matching Shops</Text>
            <Text style={styles.emptySub}>Try another search to find the right shop.</Text>
          </View>
        ) : (
          <View style={styles.listWrap}>
            {filteredShops.map(shop => {
              const busy = updatingShopId === shop.id;
              return (
                <View key={shop.id} style={styles.shopCard}>
                  <View style={styles.shopTop}>
                    <Text style={styles.shopName} numberOfLines={2} ellipsizeMode="tail">
                      {shop.shopName}
                    </Text>
                    <View style={[styles.statusBadge, shop.status === 'active' ? styles.statusActive : styles.statusInactive]}>
                      <Text style={[styles.statusBadgeText, shop.status === 'active' ? styles.statusTextActive : styles.statusTextInactive]}>
                        {shop.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.infoBox}>
                    <InfoRow label="Owner" value={shop.ownerName} />
                    <InfoRow label="Email" value={shop.email} />
                    <InfoRow label="Contact" value={shop.contactNumber} />
                    <InfoRow label="Username" value={shop.username} />
                  </View>

                  <View style={styles.statusActions}>
                    <Pressable
                      disabled={busy || shop.status === 'active'}
                      style={({ pressed }) => [
                        styles.actionBtn,
                        styles.actionActiveBtn,
                        shop.status === 'active' && styles.actionBtnSelected,
                        pressed && !busy && shop.status !== 'active' && styles.actionActiveBtnPressed,
                      ]}
                      onPress={() => updateStatus(shop.id, 'active')}>
                      <Text style={[styles.actionText, styles.actionTextActive]}>{busy ? 'Updating...' : 'Set Active'}</Text>
                    </Pressable>
                    <Pressable
                      disabled={busy || shop.status === 'inactive'}
                      style={({ pressed }) => [
                        styles.actionBtn,
                        styles.actionInactiveBtn,
                        shop.status === 'inactive' && styles.actionBtnSelected,
                        pressed && !busy && shop.status !== 'inactive' && styles.actionInactiveBtnPressed,
                      ]}
                      onPress={() => updateStatus(shop.id, 'inactive')}>
                      <Text style={[styles.actionText, styles.actionTextInactive]}>{busy ? 'Updating...' : 'Set Inactive'}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function CountCard({ label, value, tone }: { label: string; value: string; tone: 'green' | 'red' | 'slate' }) {
  const bg = tone === 'green' ? '#e8f9f1' : tone === 'red' ? '#fdeeee' : '#eef2f7';
  const fg = tone === 'green' ? '#0f9f63' : tone === 'red' ? '#c22a2a' : '#334155';
  return (
    <View style={[styles.countCard, { backgroundColor: bg }]}>
      <Text style={styles.countLabel}>{label}</Text>
      <Text style={[styles.countValue, { color: fg }]}>{value}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">
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
  headerWrap: {
    gap: 4,
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
  countRow: {
    flexDirection: 'row',
    gap: 10,
  },
  countCard: {
    flex: 1,
    minHeight: 92,
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  countLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
  },
  countValue: {
    marginTop: 6,
    fontSize: 26,
    fontWeight: '800',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
  },
  listWrap: {
    gap: 12,
  },
  shopCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d7dee8',
    padding: 12,
    gap: 10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  shopTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  shopName: {
    flex: 1,
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 17,
    lineHeight: 22,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusActive: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  statusInactive: {
    borderColor: '#f7c2c2',
    backgroundColor: '#fdeeee',
  },
  statusBadgeText: {
    fontWeight: '800',
    fontSize: 11,
  },
  statusTextActive: {
    color: '#0f9f63',
  },
  statusTextInactive: {
    color: '#c22a2a',
  },
  infoBox: {
    borderWidth: 1,
    borderColor: '#e6ebf2',
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
    fontWeight: '800',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'right',
  },
  statusActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionBtnSelected: {
    opacity: 0.7,
  },
  actionActiveBtn: {
    backgroundColor: '#e8f9f1',
    borderColor: '#b7ead3',
  },
  actionInactiveBtn: {
    backgroundColor: '#fdeeee',
    borderColor: '#f7c2c2',
  },
  actionActiveBtnPressed: {
    backgroundColor: '#d7f3e6',
  },
  actionInactiveBtnPressed: {
    backgroundColor: '#fbdede',
  },
  actionText: {
    fontWeight: '800',
    fontSize: 13,
  },
  actionTextActive: {
    color: '#0f9f63',
  },
  actionTextInactive: {
    color: '#c22a2a',
  },
  emptyWrap: {
    borderWidth: 1,
    borderColor: '#d7dee8',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
    gap: 6,
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
});
