import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { MessagesInboxScreen } from '../../modules/orders/screens/MessagesInboxScreen';

export default function AdminMessagesRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'admin') return null;
  return (
    <MessagesInboxScreen
      accentColor="#0F172A"
      routePrefix="/(admin)"
      currentUserId={profile.id}
    />
  );
}
