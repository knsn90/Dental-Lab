// core/ui/StationMobileTopBar.tsx
// Teknisyen panel mobil üst bar — logo + brand sol; mesaj/bildirim/profil sağ.

import React from 'react';
import { View, Text, Pressable, Image, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { MessageSquare, Bell } from 'lucide-react-native';
import { useAuthStore } from '../store/authStore';

const ACCENT = '#3B82F6';

function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function StationMobileTopBar({
  brandName = 'Lab',
  unreadMessages = 0,
  unreadNotifications = 0,
  avatarUrl,
  onPressMessages,
  onPressNotifications,
  onPressProfile,
}: {
  brandName?: string;
  unreadMessages?: number;
  unreadNotifications?: number;
  avatarUrl?: string | null;
  onPressMessages?: () => void;
  onPressNotifications?: () => void;
  onPressProfile?: () => void;
}) {
  const router = useRouter();
  const { profile } = useAuthStore();

  const initials = getInitials(profile?.full_name);
  const handleProfile = onPressProfile ?? (() => router.push('/(station)/profile' as any));

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
      paddingHorizontal: 16, paddingVertical: 10,
      backgroundColor: 'transparent',
    }}>
      {/* Sağ: 3 yuvarlak buton (logo+brand kaldırıldı) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <CircleButton
          icon={<MessageSquare size={17} color="#3C3C3C" strokeWidth={1.9} />}
          badge={unreadMessages > 0}
          onPress={onPressMessages}
        />
        <CircleButton
          icon={<Bell size={17} color="#3C3C3C" strokeWidth={1.9} />}
          badge={unreadNotifications > 0}
          onPress={onPressNotifications}
        />

        {/* Avatar */}
        <Pressable
          onPress={handleProfile}
          style={({ hovered }: any) => ({
            width: 38, height: 38, borderRadius: 19,
            overflow: 'hidden',
            backgroundColor: ACCENT,
            alignItems: 'center', justifyContent: 'center',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            opacity: hovered ? 0.9 : 1,
          })}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} />
          ) : (
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 }}>
              {initials}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function CircleButton({
  icon, badge, onPress,
}: {
  icon: React.ReactNode;
  badge?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: hovered ? '#E5E9F0' : '#EEF2F7',
        alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.15s' } as any : {}),
      })}
    >
      {icon}
      {badge && (
        <View style={{
          position: 'absolute',
          top: 8, right: 9,
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: '#EF4444',
          borderWidth: 1.5, borderColor: '#F5F9FD',
        }} />
      )}
    </Pressable>
  );
}
