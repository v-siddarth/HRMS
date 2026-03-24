import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Field, PrimaryButton } from '../../components/ui';
import {
  isHardcodedAdminCredentials,
  loginShopWithCredentials,
  setLocalAdminSession,
} from '../../services/authService';
import { useAppDispatch } from '../../store/hooks';
import { setUser } from '../../store/authSlice';
import { colors } from '../../theme/colors';

export function LoginScreen() {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollContentStyle = useMemo(
    () => ({
      ...styles.centerWrap,
      paddingTop: Math.max(insets.top + 24, 40),
      paddingBottom: 28,
    }),
    [insets.top],
  );

  const onLogin = async () => {
    if (!email || !password) {
      Alert.alert('Validation', 'Please provide email and password.');
      return;
    }

    try {
      setLoading(true);

      if (isHardcodedAdminCredentials(email, password)) {
        const adminUser = await setLocalAdminSession();
        dispatch(setUser(adminUser));
        return;
      }

      const user = await loginShopWithCredentials(email, password);
      if (!user) {
        Alert.alert('Login failed', 'Invalid work email or password, or your access is inactive.');
        return;
      }

      dispatch(setUser(user));
    } catch (error) {
      Alert.alert('Login failed', (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 14 : 0}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <View style={styles.bgBase} />
      <View style={styles.heroGlowTop} />
      <View style={styles.heroGlowBottom} />
      <View style={styles.heroMeshOne} />
      <View style={styles.heroMeshTwo} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={scrollContentStyle}
        showsVerticalScrollIndicator={false}>
        <View style={styles.heroPanel}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandBadgeText}>RVM Attend</Text>
          </View>
          <Text style={styles.heroTitle}>Secure shop access for attendance, staff, salary, and reports</Text>
          <Text style={styles.heroSubtitle}>
            Sign in with your assigned work email and password to continue in your connected workspace.
          </Text>
          <View style={styles.heroHighlights}>
            <View style={styles.heroHighlight}>
              <Ionicons name="shield-checkmark-outline" size={16} color="#d9fff2" />
              <Text style={styles.heroHighlightText}>Role-based access with protected business data</Text>
            </View>
            <View style={styles.heroHighlight}>
              <Ionicons name="speedometer-outline" size={16} color="#d9fff2" />
              <Text style={styles.heroHighlightText}>Fast access to the upgraded HRMS workflow</Text>
            </View>
          </View>

          <View style={styles.loginCard}>
            <View style={styles.loginCardHeader}>
              <View style={styles.loginIconWrap}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.success} />
              </View>
              <View style={styles.loginHeaderText}>
                <Text style={styles.loginTitle}>Sign In</Text>
                <Text style={styles.loginSubtitle}>Use your assigned manager or staff credentials.</Text>
              </View>
            </View>

            <View style={styles.formWrap}>
              <Field
                label="Work Email"
                placeholder="Enter your work email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
              />
              <Field label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry />
            </View>

            <PrimaryButton title="Sign In" onPress={onLogin} loading={loading} />

            <View style={styles.securityStrip}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
              <Text style={styles.securityStripText}>Shop manager login, Admin and staff login are supported here.</Text>
            </View>

            <View style={styles.poweredWrap}>
              <Text style={styles.poweredText}>Powered Nexora RVM Infotech</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#eaf1f8',
  },
  centerWrap: {
    flexGrow: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  heroPanel: {
    width: '100%',
    maxWidth: 420,
    gap: 18,
  },
  brandBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  brandBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 38,
  },
  heroSubtitle: {
    color: '#dffbf2',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  heroHighlights: {
    gap: 10,
  },
  heroHighlight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  heroHighlightText: {
    flex: 1,
    color: '#dbfff5',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  loginCard: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#d9e3ee',
    backgroundColor: 'rgba(255,255,255,0.96)',
    padding: 22,
    gap: 16,
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 28,
    elevation: 10,
  },
  loginCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loginIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: '#bfead8',
  },
  loginHeaderText: {
    flex: 1,
    gap: 3,
  },
  loginTitle: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
  loginSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  formWrap: {
    gap: 14,
  },
  securityStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: '#dce6f1',
    borderRadius: 14,
    backgroundColor: '#f8fbff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  securityStripText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  poweredWrap: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e8edf4',
  },
  poweredText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  bgBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0c8a69',
  },
  heroGlowTop: {
    position: 'absolute',
    top: -120,
    right: -70,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#31b58e',
    opacity: 0.28,
  },
  heroGlowBottom: {
    position: 'absolute',
    bottom: -160,
    left: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#045843',
    opacity: 0.34,
  },
  heroMeshOne: {
    position: 'absolute',
    top: 180,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroMeshTwo: {
    position: 'absolute',
    bottom: 120,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});
