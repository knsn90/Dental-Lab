// Admin panel — Kurye Takip
import React from 'react';
const CourierTrackingScreen = lazyRoute(() => import('../../modules/courier/CourierTrackingScreen'), 'CourierTrackingScreen');
import { lazyRoute } from '../../core/_lazyRoute';

export default function AdminCourierTracking() {
  return <CourierTrackingScreen accent="#002A5C" pageBg="#F7F9FC" routePrefix="/(admin)" />;
}
