import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DrawerContentScrollView, type DrawerContentComponentProps } from '@react-navigation/drawer';
import { useAppSelector } from '../../store/hooks';

export function AdminDrawerContent(props: DrawerContentComponentProps) {
  const user = useAppSelector(state => state.auth.user);

  return (
    <DrawerContentScrollView
      {...props}
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}>
      <View style={styles.topBlock}>
        <Text style={styles.heading}>HRMS Admin</Text>
        <Text style={styles.email}>{user?.email ?? 'Unknown'}</Text>
      </View>

      <View style={styles.menuWrap}>
        <Pressable style={styles.menuItem} onPress={() => props.navigation.navigate('AdminHome')}>
          <Text style={styles.menuText}>Dashboard & Shops</Text>
        </Pressable>
        <Pressable style={styles.menuItem} onPress={() => props.navigation.navigate('AdminProfile')}>
          <Text style={styles.menuText}>Profile</Text>
        </Pressable>
      </View>
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f8fc',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
    backgroundColor: '#f5f8fc',
  },
  topBlock: {
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 18,
    backgroundColor: '#0f4ea8',
    gap: 4,
  },
  heading: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '800',
  },
  email: {
    color: '#d7e7ff',
    fontWeight: '600',
  },
  menuWrap: {
    padding: 12,
    gap: 8,
  },
  menuItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#d8e2ed',
  },
  menuText: {
    color: '#17212b',
    fontWeight: '700',
    fontSize: 15,
  },
});
