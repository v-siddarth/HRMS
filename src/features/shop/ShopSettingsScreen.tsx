import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Field, PrimaryButton, Screen } from '../../components/ui';
import { useAppSelector } from '../../store/hooks';
import {
  useGetBiometricSettingsQuery,
  useGetPayrollSettingsQuery,
  useUpsertBiometricSettingsMutation,
  useUpsertPayrollSettingsMutation,
} from '../../store/hrmsApi';
import { colors } from '../../theme/colors';

export function ShopSettingsScreen() {
  const user = useAppSelector(state => state.auth.user);
  const shopId = user?.shopId ?? '';

  const { data: settings, isLoading } = useGetPayrollSettingsQuery(shopId, { skip: !shopId });
  const [saveSettings, { isLoading: saving }] = useUpsertPayrollSettingsMutation();
  const { data: biometric } = useGetBiometricSettingsQuery(shopId, { skip: !shopId });
  const [saveBiometric, { isLoading: savingBiometric }] = useUpsertBiometricSettingsMutation();

  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [lateThreshold, setLateThreshold] = useState('3');
  const [lateDeductionDays, setLateDeductionDays] = useState('0.5');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricDeviceName, setBiometricDeviceName] = useState('');
  const [biometricDeviceId, setBiometricDeviceId] = useState('');
  const [syncWindowMinutes, setSyncWindowMinutes] = useState('5');
  const [integrationMode, setIntegrationMode] = useState<'api' | 'pull_agent'>('pull_agent');

  useEffect(() => {
    if (!settings) {
      return;
    }
    setTimezone(settings.timezone);
    setLateThreshold(String(settings.lateThreshold));
    setLateDeductionDays(String(settings.lateDeductionDays));
  }, [settings]);

  useEffect(() => {
    if (!biometric) {
      return;
    }
    setBiometricEnabled(biometric.enabled);
    setBiometricDeviceName(biometric.deviceName);
    setBiometricDeviceId(biometric.deviceId);
    setSyncWindowMinutes(String(biometric.syncWindowMinutes));
    setIntegrationMode(biometric.integrationMode);
  }, [biometric]);

  const onSave = async () => {
    if (!shopId) {
      Alert.alert('Error', 'Shop not linked to this account.');
      return;
    }

    const threshold = Number(lateThreshold);
    const deduction = Number(lateDeductionDays);
    if (!timezone || Number.isNaN(threshold) || Number.isNaN(deduction)) {
      Alert.alert('Validation', 'Please enter valid settings values.');
      return;
    }

    try {
      await saveSettings({
        shopId,
        settings: {
          timezone: timezone.trim(),
          lateThreshold: threshold,
          lateDeductionDays: deduction,
        },
      }).unwrap();
      Alert.alert('Saved', 'Payroll settings updated successfully.');
    } catch (error) {
      Alert.alert('Save failed', (error as Error).message);
    }
  };

  const onResetDefaults = () => {
    setTimezone('Asia/Kolkata');
    setLateThreshold('3');
    setLateDeductionDays('0.5');
  };

  const onSaveBiometric = async () => {
    if (!shopId) {
      Alert.alert('Error', 'Shop not linked to this account.');
      return;
    }

    const syncWindow = Number(syncWindowMinutes);
    if (Number.isNaN(syncWindow) || syncWindow <= 0) {
      Alert.alert('Validation', 'Sync window must be a valid number of minutes.');
      return;
    }

    try {
      await saveBiometric({
        shopId,
        settings: {
          enabled: biometricEnabled,
          deviceName: biometricDeviceName.trim(),
          deviceId: biometricDeviceId.trim(),
          syncWindowMinutes: syncWindow,
          integrationMode,
          lastSyncedAt: biometric?.lastSyncedAt,
        },
      }).unwrap();
      Alert.alert('Saved', 'Biometric integration settings updated.');
    } catch (error) {
      Alert.alert('Save failed', (error as Error).message);
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerWrap}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Configure payroll rules for accurate monthly salary generation.</Text>
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Payroll Configuration</Text>
          <Field label="Timezone" value={timezone} onChangeText={setTimezone} />
          <Field
            label="Late Threshold (count)"
            value={lateThreshold}
            onChangeText={setLateThreshold}
            keyboardType="numeric"
          />
          <Field
            label="Late Deduction Days"
            value={lateDeductionDays}
            onChangeText={setLateDeductionDays}
            keyboardType="numeric"
          />

          <View style={styles.actionsRow}>
            <View style={styles.flex1}>
              <PrimaryButton title={isLoading ? 'Loading...' : 'Save Settings'} onPress={onSave} loading={saving} />
            </View>
          </View>
          <PrimaryButton title="Reset To Defaults" onPress={onResetDefaults} />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Biometric Integration</Text>
          <Text style={styles.helperText}>Prepare your shop for biometric attendance sync agent integration.</Text>

          <Text style={styles.chipLabel}>Integration Mode</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, integrationMode === 'pull_agent' ? styles.chipActive : undefined]}
              onPress={() => setIntegrationMode('pull_agent')}>
              <Text style={[styles.chipText, integrationMode === 'pull_agent' ? styles.chipTextActive : undefined]}>
                Pull Agent
              </Text>
            </Pressable>
            <Pressable
              style={[styles.chip, integrationMode === 'api' ? styles.chipActive : undefined]}
              onPress={() => setIntegrationMode('api')}>
              <Text style={[styles.chipText, integrationMode === 'api' ? styles.chipTextActive : undefined]}>API Push</Text>
            </Pressable>
          </View>

          <Text style={styles.chipLabel}>Biometric Sync</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, biometricEnabled ? styles.chipActive : undefined]}
              onPress={() => setBiometricEnabled(true)}>
              <Text style={[styles.chipText, biometricEnabled ? styles.chipTextActive : undefined]}>Enabled</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, !biometricEnabled ? styles.chipActive : undefined]}
              onPress={() => setBiometricEnabled(false)}>
              <Text style={[styles.chipText, !biometricEnabled ? styles.chipTextActive : undefined]}>Disabled</Text>
            </Pressable>
          </View>

          <Field label="Device Name" value={biometricDeviceName} onChangeText={setBiometricDeviceName} placeholder="e.g. Main Gate ZKTeco" />
          <Field label="Device ID" value={biometricDeviceId} onChangeText={setBiometricDeviceId} placeholder="e.g. ZK-01" />
          <Field
            label="Sync Window (minutes)"
            value={syncWindowMinutes}
            onChangeText={setSyncWindowMinutes}
            keyboardType="numeric"
          />
          <Field label="Last Synced At" value={biometric?.lastSyncedAt ?? '-'} editable={false} />
          <PrimaryButton title="Save Biometric Settings" onPress={onSaveBiometric} loading={savingBiometric} />
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
    fontWeight: '500',
    lineHeight: 20,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 16,
  },
  helperText: {
    color: colors.textSecondary,
    lineHeight: 19,
    fontWeight: '500',
  },
  actionsRow: {
    marginTop: 2,
  },
  flex1: {
    flex: 1,
  },
  chipLabel: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#d1d9e4',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  chipActive: {
    borderColor: '#b7ead3',
    backgroundColor: '#e8f9f1',
  },
  chipText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#0a7a5b',
  },
});
