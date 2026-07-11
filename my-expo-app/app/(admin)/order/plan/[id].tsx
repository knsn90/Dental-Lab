// app/(admin)/order/plan/[id].tsx — Plan Önizleme & Onay (yeni triaj akışı)
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PlanReviewScreen } from '../../../../modules/triage/screens/PlanReviewScreen';

export default function PlanRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <PlanReviewScreen orderId={String(id)} />;
}
