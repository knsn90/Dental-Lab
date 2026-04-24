import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { MessagesInboxScreen } from '../../modules/orders/screens/MessagesInboxScreen';

export default function ClinicMessagesRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (profile.user_type !== 'clinic_admin') return null;
  return (
    <MessagesInboxScreen
      accentColor="#0369A1"
      routePrefix="/(clinic)"
      currentUserId={profile.id}
    />
  );
}
