import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card, Field, Screen } from '../../components/ui';
import { useDeleteShopMutation, useGetShopsQuery } from '../../store/hrmsApi';
import type { AdminShopsStackParamList } from '../../types/navigation';
import { colors } from '../../theme/colors';
import { formatDisplayDate } from '../../utils/date';
import { logError, logInfo } from '../../utils/logger';
import { wp, hp, sp } from '../../utils/responsive';

export function ShopsScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<AdminShopsStackParamList, 'ShopsList'>>();
  const [query, setQuery] = useState('');
  const compactLayout = width < 380;

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
          <View style={[styles.headerTopRow, compactLayout && styles.headerTopRowCompact]}>
            <View style={styles.headerTextBlock}>
              <Text style={styles.title}>Shops</Text>
              <Text style={styles.subtitle}>Manage shop records with dedicated create and update workflows.</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.newButton, compactLayout && styles.newButtonCompact, pressed && styles.newButtonPressed]}
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
                  <SummaryTile label="Owner" value={item.ownerName} fullWidth={compactLayout} />
                  <SummaryTile label="Contact" value={item.contactNumber} fullWidth={compactLayout} />
                  <SummaryTile label="Email" value={item.email} fullWidth={compactLayout} />
                  <SummaryTile label="Username" value={item.username} fullWidth={compactLayout} />
                </View>

                <View style={styles.footerMetaRow}>
                  <Text style={styles.footerMetaText}>Created: {formatDisplayDate(item.createdAt)}</Text>
                  <Text style={styles.footerMetaText}>Updated: {formatDisplayDate(item.updatedAt)}</Text>
                </View>

                <View style={[styles.actionRow, compactLayout && styles.actionRowCompact]}>
                  <Pressable
                    style={({ pressed }) => [styles.editBtn, compactLayout && styles.actionBtnCompact, pressed && styles.editBtnPressed]}
                    onPress={() => navigation.navigate('EditShop', { shopId: item.id })}>
                    <Text style={styles.editTxt}>Update Shop</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.deleteBtn, compactLayout && styles.actionBtnCompact, pressed && styles.deleteBtnPressed]}
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

function SummaryTile({ label, value, fullWidth }: { label: string; value: string; fullWidth?: boolean }) {
  return (
    <View style={[styles.summaryTile, fullWidth && styles.summaryTileFull]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1} ellipsizeMode="tail">
        {value || '-'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pageContent: { gap: hp(12), paddingBottom: hp(50) },
  headerWrap: {
    gap: hp(10), borderRadius: wp(18), backgroundColor: '#f4f8ff',
    borderWidth: 1, borderColor: '#d7e5fb', padding: wp(14), overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute', right: wp(-55), top: hp(-46),
    width: wp(160), height: wp(160), borderRadius: wp(80),
    backgroundColor: '#d7e9ff', opacity: 0.8,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: wp(12) },
  headerTopRowCompact: { flexDirection: 'column', alignItems: 'stretch' },
  headerTextBlock: { flex: 1, gap: hp(4) },
  title: { fontSize: sp(24), fontWeight: '800', color: colors.textPrimary },
  subtitle: { color: colors.textSecondary, fontWeight: '600', lineHeight: sp(19), fontSize: sp(14) },
  newButton: {
    backgroundColor: colors.primary, minHeight: hp(42), borderRadius: wp(12),
    paddingHorizontal: wp(14), alignItems: 'center', justifyContent: 'center',
  },
  newButtonCompact: { width: '100%' },
  newButtonPressed: { backgroundColor: colors.primaryPressed },
  newButtonText: { color: '#fff', fontWeight: '800', fontSize: sp(14) },
  headerMetaRow: { flexDirection: 'row', gap: wp(8) },
  metaChip: {
    flex: 1, borderRadius: wp(12), borderWidth: 1, borderColor: '#d7dee8',
    backgroundColor: '#ffffff', paddingVertical: hp(8), alignItems: 'center', justifyContent: 'center',
  },
  metaLabel: { color: colors.textMuted, fontSize: sp(11), fontWeight: '700' },
  metaValue: { marginTop: hp(2), color: colors.textPrimary, fontSize: sp(16), fontWeight: '800' },
  clearSearchBtn: {
    marginTop: hp(2), alignSelf: 'flex-start', borderRadius: 999,
    borderWidth: 1, borderColor: '#d7dee8', paddingHorizontal: wp(10), paddingVertical: hp(6), backgroundColor: '#fff',
  },
  clearSearchText: { color: colors.textSecondary, fontWeight: '700', fontSize: sp(12) },
  listTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: sp(15) },
  listContent: { gap: hp(12), paddingBottom: hp(40) },
  shopCard: {
    backgroundColor: '#ffffff', borderRadius: wp(18), borderWidth: 1, borderColor: '#d7dee8',
    padding: wp(14), gap: hp(12), shadowColor: colors.shadow, shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: hp(8) }, shadowRadius: wp(14), elevation: 3,
  },
  shopCardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: wp(10), alignItems: 'center' },
  shopIdentityBlock: { flex: 1, gap: hp(2) },
  shopName: { color: colors.textPrimary, fontWeight: '800', fontSize: sp(20) },
  shopAddress: { color: colors.textSecondary, fontWeight: '500', lineHeight: sp(18), fontSize: sp(13) },
  badge: { borderRadius: 999, paddingHorizontal: wp(10), paddingVertical: hp(5), borderWidth: 1 },
  badgeActive: { backgroundColor: '#e8f9f1', borderColor: '#b7ead3' },
  badgeInactive: { backgroundColor: '#fdeeee', borderColor: '#f7c2c2' },
  badgeText: { fontWeight: '800', fontSize: sp(11) },
  badgeTextActive: { color: '#0f9f63' },
  badgeTextInactive: { color: '#c22a2a' },
  summaryGrid: { gap: wp(8), flexDirection: 'row', flexWrap: 'wrap' },
  summaryTile: {
    flexBasis: '48%', flexGrow: 1, borderRadius: wp(12), borderWidth: 1,
    borderColor: '#e6ebf2', backgroundColor: '#f8fafc', paddingHorizontal: wp(10),
    paddingVertical: hp(9), gap: hp(4), minHeight: hp(62),
  },
  summaryTileFull: { flexBasis: '100%' },
  summaryLabel: { color: colors.textMuted, fontSize: sp(11), fontWeight: '700' },
  summaryValue: { color: colors.textPrimary, fontWeight: '700', fontSize: sp(13) },
  footerMetaRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: wp(12),
    borderTopWidth: 1, borderTopColor: '#e6ebf2', paddingTop: hp(10),
  },
  footerMetaText: { color: colors.textMuted, fontSize: sp(12), fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: wp(10) },
  actionRowCompact: { flexDirection: 'column' },
  actionBtnCompact: { width: '100%', minWidth: 0 },
  editBtn: {
    flex: 1, minHeight: hp(45), borderRadius: wp(12),
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary,
  },
  editBtnPressed: { backgroundColor: colors.primaryPressed },
  editTxt: { color: '#ffffff', fontWeight: '800', fontSize: sp(14) },
  deleteBtn: {
    minHeight: hp(45), minWidth: wp(100), paddingHorizontal: wp(12), borderRadius: wp(12),
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fdeeee', borderWidth: 1, borderColor: '#f7c2c2',
  },
  deleteBtnPressed: { backgroundColor: '#fadede' },
  deleteTxt: { color: '#c22a2a', fontWeight: '800', fontSize: sp(14) },
  emptyWrap: {
    backgroundColor: '#ffffff', borderRadius: wp(16), borderWidth: 1, borderColor: '#d7dee8',
    paddingVertical: hp(22), paddingHorizontal: wp(16), alignItems: 'center', gap: hp(8),
  },
  emptyTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: sp(17) },
  emptySub: { color: colors.textSecondary, textAlign: 'center', lineHeight: sp(20), fontSize: sp(14) },
  newInlineBtn: {
    marginTop: hp(4), backgroundColor: colors.primary, minHeight: hp(42),
    borderRadius: wp(12), paddingHorizontal: wp(14), alignItems: 'center', justifyContent: 'center',
  },
});
