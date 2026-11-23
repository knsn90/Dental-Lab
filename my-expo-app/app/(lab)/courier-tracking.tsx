// Lab panel — Kurye Takip · menüdeki yetki anahtarıyla aynı kapı (view_deliveries)
import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { AccessDenied } from '../../core/ui/AccessDenied';

const CourierTrackingScreen = lazyRoute(() => import('../../modules/courier/CourierTrackingScreen'), 'CourierTrackingScreen');

export default function LabCourierTracking() {
  return (
    <PermissionGate requires="view_deliveries" fallback={<AccessDenied />}>
      <CourierTrackingScreen accent="#F5C24B" pageBg="#F5F1EB" routePrefix="/(lab)" />
    </PermissionGate>
  );
}
