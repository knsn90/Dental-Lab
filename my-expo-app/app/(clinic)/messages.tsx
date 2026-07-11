import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
const MessagesInboxScreen = lazyRoute(() => import('../../modules/orders/screens/MessagesInboxScreen'), 'MessagesInboxScreen');
import { lazyRoute } from '../../core/_lazyRoute';

export default function ClinicMessagesRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (!['clinic_admin', 'clinic_secretary'].includes(profile.user_type)) return null;
  return (
    <MessagesInboxScreen
      accentColor="#0369A1"
      routePrefix="/(clinic)"
      currentUserId={profile.id}
    />
  );
}
