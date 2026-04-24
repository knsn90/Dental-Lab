import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { MessagesInboxScreen } from '../../modules/orders/screens/MessagesInboxScreen';

export default function DoctorMessagesRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'doctor') return null;
  return (
    <MessagesInboxScreen
      accentColor="#0EA5E9"
      routePrefix="/(doctor)"
      currentUserId={profile.id}
    />
  );
}
