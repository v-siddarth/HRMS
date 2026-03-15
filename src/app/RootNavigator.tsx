import React from 'react';
import { ActivityIndicator, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppSelector } from '../store/hooks';
import type { AuthStackParamList, ShopDrawerParamList } from '../types/navigation';
import { LoginScreen } from '../features/auth/LoginScreen';
import { AdminHomeTabs } from '../features/admin/AdminHomeTabs';
import { ShopHomeTabs } from '../features/shop/ShopHomeTabs';
import { ProfileScreen } from '../features/shop/ProfileScreen';
import { ShopSettingsScreen } from '../features/shop/ShopSettingsScreen';
import { ShopSupportScreen } from '../features/shop/ShopSupportScreen';
import { ShopDrawerContent } from '../features/shop/ShopDrawerContent';
import { colors } from '../theme/colors';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AdminStack = createNativeStackNavigator<{ AdminRoot: undefined }>();
const ShopDrawer = createDrawerNavigator<ShopDrawerParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator>
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
    </AuthStack.Navigator>
  );
}

function SuperAdminNavigator() {
  return (
    <AdminStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800' },
      }}>
      <AdminStack.Screen name="AdminRoot" component={AdminHomeTabs} options={{ title: 'Admin' }} />
    </AdminStack.Navigator>
  );
}

function ShopManagerNavigator() {
  return (
    <ShopDrawer.Navigator
      drawerContent={props => <ShopDrawerContent {...props} />}
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: colors.success },
        headerTintColor: '#fff',
        drawerType: 'slide',
        headerTitleStyle: { fontWeight: '800' },
        headerLeft: () => null,
        headerRight: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            onPress={() => navigation.openDrawer()}
            style={({ pressed }) => [
              styles.menuButton,
              styles.shopMenuButton,
              pressed && styles.menuButtonPressed,
              pressed && styles.shopMenuButtonPressed,
            ]}>
            <Text style={styles.menuText}>☰</Text>
          </Pressable>
        ),
      })}>
      <ShopDrawer.Screen
        name="ShopHome"
        component={ShopHomeTabs}
        options={{
          headerShown: false,
        }}
      />
      <ShopDrawer.Screen name="ShopProfile" component={ProfileScreen} options={{ title: 'Shop Profile' }} />
      <ShopDrawer.Screen name="ShopSettings" component={ShopSettingsScreen} options={{ title: 'Settings' }} />
      <ShopDrawer.Screen name="ShopSupport" component={ShopSupportScreen} options={{ title: 'Support' }} />
    </ShopDrawer.Navigator>
  );
}

function ShopAccessMissingScreen() {
  return (
    <View style={styles.fallbackWrap}>
      <Text style={styles.fallbackTitle}>Shop Access Missing</Text>
      <Text style={styles.fallbackSub}>
        Please login with a valid shop username/email and password created by Super Admin.
      </Text>
    </View>
  );
}

function RoleFallbackScreen() {
  return (
    <View style={styles.fallbackWrap}>
      <Text style={styles.fallbackTitle}>Account Role Not Configured</Text>
      <Text style={styles.fallbackSub}>Use admin credentials or login with a valid shop manager account.</Text>
    </View>
  );
}

export function RootNavigator() {
  const { user, bootstrapping } = useAppSelector(state => state.auth);

  if (bootstrapping) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#1166ee" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeRoot} edges={['top']}>
      <StatusBar translucent={false} />
      <NavigationContainer>
        {!user && <AuthNavigator />}
        {user?.role === 'super_admin' && <SuperAdminNavigator />}
        {user?.role === 'shop_manager' && (user.shopId ? <ShopManagerNavigator /> : <ShopAccessMissingScreen />)}
        {user && user.role !== 'super_admin' && user.role !== 'shop_manager' && <RoleFallbackScreen />}
      </NavigationContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButton: {
    marginRight: 12,
    backgroundColor: '#2f6ec6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  menuButtonPressed: {
    backgroundColor: '#2759a0',
  },
  shopMenuButton: {
    backgroundColor: '#0f9672',
  },
  shopMenuButtonPressed: {
    backgroundColor: '#0c7d5f',
  },
  menuText: {
    color: '#fff',
    fontWeight: '700',
  },
  fallbackWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    gap: 8,
  },
  fallbackTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  fallbackSub: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});
