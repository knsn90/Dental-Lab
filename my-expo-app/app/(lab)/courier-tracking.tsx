// Lab panel — Kurye Takip
import React from 'react';
const CourierTrackingScreen = lazyRoute(() => import('../../modules/courier/CourierTrackingScreen'), 'CourierTrackingScreen');
import { lazyRoute } from '../../core/_lazyRoute';

export default function LabCourierTracking() {
  return <CourierTrackingScreen accent="#F5C24B" pageBg="#F5F1EB" routePrefix="/(lab)" />;
}
