// Doctor panel — Kurye Takip
import React from 'react';
const CourierTrackingScreen = lazyRoute(() => import('../../modules/courier/CourierTrackingScreen'), 'CourierTrackingScreen');
import { lazyRoute } from '../../core/_lazyRoute';

export default function DoctorCourierTracking() {
  return <CourierTrackingScreen accent="#32BB78" pageBg="#F9FAFB" routePrefix="/(doctor)" />;
}
