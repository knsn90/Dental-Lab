import React from 'react';
import { useAuthStore } from '../../core/store/authStore';
import { usePanelTheme } from '../../core/theme/usePanelTheme';
import { MOBILE_PANEL_THEMES } from '../../core/theme/mobileDesignTokens';
const MessagesInboxScreen = lazyRoute(() => import('../../modules/orders/screens/MessagesInboxScreen'), 'MessagesInboxScreen');
import { lazyRoute } from '../../core/_lazyRoute';

export default function ClinicMessagesRoute() {
  const { profile, loading } = useAuthStore();
  // Panel rengi (klinik = zümrüt); eskiden sabit gök mavisi #0369A1 geçiyordu
  const theme = usePanelTheme();
  if (loading || !profile) return null;
  if (!['clinic_admin', 'clinic_secretary'].includes(profile.user_type)) return null;
  return (
    <MessagesInboxScreen
      accentColor={theme.primary}
      desktopMaxWidth={880}
      pageBg={MOBILE_PANEL_THEMES.klinik.bgPage}
      routePrefix="/(clinic)"
      currentUserId={profile.id}
    />
  );
}
