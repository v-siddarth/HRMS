import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors } from '../theme/colors';
import { wp, hp, sp } from '../utils/responsive';

export const Screen = ({ children }: { children: React.ReactNode }) => (
  <View style={styles.screen}>{children}</View>
);

export const Field = ({ label, secureTextEntry, ...props }: { label: string } & TextInputProps) => {
  const isPasswordField = secureTextEntry === true;
  const [passwordVisible, setPasswordVisible] = useState(false);
  const resolvedSecureTextEntry = isPasswordField ? !passwordVisible : secureTextEntry;

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          style={[
            styles.input,
            isPasswordField && styles.inputWithAccessory,
            props.editable === false && styles.inputDisabled,
          ]}
          placeholderTextColor="#888"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={label}
          secureTextEntry={resolvedSecureTextEntry}
          {...props}
        />
        {isPasswordField ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? `Hide ${label}` : `Show ${label}`}
            accessibilityHint="Toggles password visibility"
            hitSlop={10}
            onPress={() => setPasswordVisible(current => !current)}
            style={({ pressed }) => [styles.inputAccessory, pressed && styles.inputAccessoryPressed]}>
            <Ionicons
              name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={sp(20)}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
};

export const PrimaryButton = ({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={title}
    style={({ pressed }) => [
      styles.button,
      (loading || disabled) && styles.buttonDisabled,
      pressed && !loading && !disabled && styles.buttonPressed,
    ]}
    disabled={loading || disabled}>
    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{title}</Text>}
  </Pressable>
);

export const Card = ({ children }: { children: React.ReactNode }) => <View style={styles.card}>{children}</View>;

export const ValueRow = ({ label, value }: { label: string; value: string | number }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: wp(16),
    paddingTop: hp(12),
    paddingBottom: hp(24),
    gap: hp(12),
  },
  fieldWrap: {
    gap: hp(6),
  },
  inputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  label: {
    fontSize: sp(13),
    fontWeight: '600',
    color: colors.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: wp(14),
    paddingHorizontal: wp(12),
    paddingVertical: hp(12),
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: sp(15),
  },
  inputWithAccessory: {
    paddingRight: wp(44),
  },
  inputDisabled: {
    backgroundColor: colors.surfaceMuted,
    color: colors.textMuted,
  },
  inputAccessory: {
    position: 'absolute',
    right: wp(12),
    height: hp(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputAccessoryPressed: {
    opacity: 0.7,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: wp(14),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: hp(50),
    paddingHorizontal: wp(16),
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: hp(6) },
    shadowRadius: wp(10),
    elevation: 2,
  },
  buttonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  buttonDisabled: {
    opacity: 0.55,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: sp(15),
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: wp(16),
    padding: wp(14),
    borderColor: '#d8e2ed',
    borderWidth: 1,
    gap: hp(10),
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: hp(5) },
    shadowRadius: wp(10),
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    color: colors.textSecondary,
    fontWeight: '500',
    fontSize: sp(14),
  },
  rowValue: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: sp(14),
  },
});
