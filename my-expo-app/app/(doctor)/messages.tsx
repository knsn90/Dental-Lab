import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { usePanelTheme } from '../../core/theme/usePanelTheme';
import { MOBILE_PANEL_THEMES } from '../../core/theme/mobileDesignTokens';
const MessagesInboxScreen = lazyRoute(() => import('../../modules/orders/screens/MessagesInboxScreen'), 'MessagesInboxScreen');
import { lazyRoute } from '../../core/_lazyRoute';

export default function DoctorMessagesRoute() {
  const { profile, loading } = useAuthStore();
  // Panel rengi (hekim = zümrüt); eskiden sabit gök mavisi #0EA5E9 geçiyordu
  const theme = usePanelTheme();
  if (loading || !profile) return null;
  if (profile.user_type !== 'doctor') return null;
  return (
    <MessagesInboxScreen
      accentColor={theme.primary}
      desktopMaxWidth={880}
      pageBg={MOBILE_PANEL_THEMES.doctor.bgPage}
      routePrefix="/(doctor)"
      currentUserId={profile.id}
    />
  );
}
