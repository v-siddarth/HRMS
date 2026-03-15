import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card, Field, Screen } from '../../components/ui';
import { useDeleteShopMutation, useGetShopsQuery } from '../../store/hrmsApi';
import type { AdminShopsStackParamList } from '../../types/navigation';
import { colors } from '../../theme/colors';
import { formatDisplayDate } from '../../utils/date';
import { logError, logInfo } from '../../utils/logger';

export function ShopsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AdminShopsStackParamList, 'ShopsList'>>();
  const [query, setQuery] = useState('');

  const { data: shops = [], isLoading } = useGetShopsQuery();
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
        s.contactNumber.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q),
    );
  }, [query, shops]);

  const onDelete = (shopId: string) => {
    Alert.alert('Delete Shop', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            logInfo('ADMIN_SHOP_DELETE_ATTEMPT', { shopId });
            await deleteShop(shopId).unwrap();
          } catch (error) {
            const errorRef = logError('ADMIN_SHOP_DELETE_FAILED', error, { shopId });
            Alert.alert('Failed', `${(error as Error).message}\nRef: ${errorRef}`);
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
              <Text style={styles.subtitle}>Manage shop records with dedicated create and update workflows.</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.newButton, pressed && styles.newButtonPressed]}
              onPress={() => navigation.navigate('CreateShop')}>
              <Text style={styles.newButtonText}>+ New Shop</Text>
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
          <Field label="Search Shops" value={query} onChangeText={setQuery} placeholder="Shop name / owner / contact / email" />
          {!!query.trim() && (
            <Pressable style={styles.clearSearchBtn} onPress={() => setQuery('')}>
              <Text style={styles.clearSearchText}>Clear Search</Text>
            </Pressable>
          )}
        </Card>

        <Text style={styles.listTitle}>{isLoading ? 'Loading shops...' : `${filtered.length} shops`}</Text>

        {filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No Shops Found</Text>
            <Text style={styles.emptySub}>Try a different search query or create a new shop.</Text>
            <Pressable
              style={({ pressed }) => [styles.newInlineBtn, pressed && styles.newButtonPressed]}
              onPress={() => navigation.navigate('CreateShop')}>
              <Text style={styles.newButtonText}>+ Create New Shop</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.listContent}>
            {filtered.map(item => (
              <View key={item.id} style={styles.shopCard}>
                <View style={styles.shopCardTop}>
                  <View style={styles.shopIdentityBlock}>
                    <Text style={styles.shopName} numberOfLines={1} ellipsizeMode="tail">
                      {item.shopName}
                    </Text>
                    <Text style={styles.shopAddress} numberOfLines={1} ellipsizeMode="tail">
                      {item.address || 'Address not set'}
                    </Text>
                  </View>
                  <View style={[styles.badge, item.status === 'active' ? styles.badgeActive : styles.badgeInactive]}>
                    <Text style={[styles.badgeText, item.status === 'active' ? styles.badgeTextActive : styles.badgeTextInactive]}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.summaryGrid}>
                  <SummaryTile label="Owner" value={item.ownerName} />
                  <SummaryTile label="Contact" value={item.contactNumber} />
                  <SummaryTile label="Email" value={item.email} />
                  <SummaryTile label="Username" value={item.username} />
                </View>

                <View style={styles.footerMetaRow}>
                  <Text style={styles.footerMetaText}>Created: {formatDisplayDate(item.createdAt)}</Text>
                  <Text style={styles.footerMetaText}>Updated: {formatDisplayDate(item.updatedAt)}</Text>
                </View>

                <View style={styles.actionRow}>
                  <Pressable
                    style={({ pressed }) => [styles.editBtn, pressed && styles.editBtnPressed]}
                    onPress={() => navigation.navigate('EditShop', { shopId: item.id })}>
                    <Text style={styles.editTxt}>Update Shop</Text>
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

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryTile}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1} ellipsizeMode="tail">
        {value || '-'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pageContent: {
    gap: 12,
    paddingBottom: 50,
  },
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
  listTitle: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  listContent: {
    gap: 12,
    paddingBottom: 40,
  },
  shopCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7dee8',
    padding: 14,
    gap: 12,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 3,
  },
  shopCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
  },
  shopIdentityBlock: {
    flex: 1,
    gap: 2,
  },
  shopName: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 20,
  },
  shopAddress: {
    color: colors.textSecondary,
    fontWeight: '500',
    lineHeight: 18,
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
  summaryGrid: {
    gap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  summaryTile: {
    width: '48.6%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e6ebf2',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
    minHeight: 62,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  summaryValue: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  footerMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e6ebf2',
    paddingTop: 10,
  },
  footerMetaText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  editBtn: {
    flex: 1,
    minHeight: 45,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  editBtnPressed: {
    backgroundColor: colors.primaryPressed,
  },
  editTxt: {
    color: '#ffffff',
    fontWeight: '800',
  },
  deleteBtn: {
    minHeight: 45,
    minWidth: 100,
    paddingHorizontal: 12,
    borderRadius: 12,
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
