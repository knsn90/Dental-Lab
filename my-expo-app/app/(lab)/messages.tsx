import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { MessagesInboxScreen } from '../../modules/orders/screens/MessagesInboxScreen';

export default function LabMessagesRoute() {
  const { profile, loading } = useAuthStore();
  if (loading || !profile) return null;
  if (!['lab', 'admin'].includes(profile.user_type)) return null;
  return (
    <MessagesInboxScreen
      accentColor="#2563EB"
      routePrefix="/(lab)"
      currentUserId={profile.id}
    />
  );
}
