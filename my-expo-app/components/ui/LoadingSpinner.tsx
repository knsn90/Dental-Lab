// components/ui/LoadingSpinner.tsx
// Tek panel-aware loading kaynağı → PanelLoader. accent param geriye uyumluluk için.

import React from 'react';
import { PanelLoader } from '../../core/ui/PanelLoader';

interface LoadingSpinnerProps {
  message?: string;
  fullScreen?: boolean;
  accentColor?: string; // legacy — PanelLoader segment'ten otomatik bulur
}

export function LoadingSpinner({ message, fullScreen = false }: LoadingSpinnerProps) {
  return (
    <PanelLoader
      message={message ?? 'Yükleniyor…'}
      fullScreen={fullScreen}
    />
  );
}
