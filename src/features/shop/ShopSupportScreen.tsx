import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Screen } from '../../components/ui';
import { colors } from '../../theme/colors';

export function ShopSupportScreen() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerWrap}>
          <Text style={styles.title}>Support & Security</Text>
          <Text style={styles.subtitle}>Operational best practices for secure and reliable HRMS usage.</Text>
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Daily Checklist</Text>
          <Text style={styles.note}>1. Mark attendance before end of working day.</Text>
          <Text style={styles.note}>2. Validate base salary and OT rate before salary generation.</Text>
          <Text style={styles.note}>3. Verify salary paid entries after payout completion.</Text>
          <Text style={styles.note}>4. Export monthly reports and keep backups for audits.</Text>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Security Controls</Text>
          <Text style={styles.note}>1. Do not share shop login credentials with unauthorized users.</Text>
          <Text style={styles.note}>2. Logout on shared or public devices after every session.</Text>
          <Text style={styles.note}>3. Keep contact and owner details updated in Profile.</Text>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Version</Text>
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Application</Text>
            <Text style={styles.versionValue}>HRMS Mobile</Text>
          </View>
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Release</Text>
            <Text style={styles.versionValue}>Production Build</Text>
          </View>
        </Card>
      </ScrollView>
    </Screen>
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
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 4,
  },
  note: {
    color: colors.textSecondary,
    lineHeight: 20,
    fontWeight: '500',
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e6ebf2',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  versionLabel: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  versionValue: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
});
