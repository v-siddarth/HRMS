import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
        Alert.alert('Login failed', 'Invalid shop username/email or password, or shop is inactive.');
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.bgBlobTop} />
      <View style={styles.bgBlobBottom} />
      <View style={styles.centerWrap}>
        <View style={styles.card}>
          <View style={styles.headerWrap}>
            <Text style={styles.title}>Welcome Back</Text>
            <Text style={styles.subtitle}>Sign in to continue to your HRMS workspace.</Text>
          </View>
          <Field label="Email / Username" placeholder="Enter your email or username" value={email} onChangeText={setEmail} />
          <Field label="Password" placeholder="Enter your password" value={password} onChangeText={setPassword} secureTextEntry />
          <PrimaryButton title="Sign In" onPress={onLogin} loading={loading} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  centerWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dbe5f2',
    backgroundColor: colors.surface,
    padding: 20,
    gap: 14,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 8,
  },
  headerWrap: {
    gap: 6,
    marginBottom: 6,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  bgBlobTop: {
    position: 'absolute',
    top: -120,
    right: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: colors.primarySoft,
    opacity: 0.9,
  },
  bgBlobBottom: {
    position: 'absolute',
    bottom: -160,
    left: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: '#e3f5ef',
    opacity: 0.9,
  },
});
