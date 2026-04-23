const Colors = {
  // Brand — MED dashboard palette
  primary: '#2563EB',        // Primary blue
  primaryDark: '#1D4ED8',    // Dark blue
  primaryLight: '#EFF6FF',   // Primary light background (blue tint)
  primaryMid: '#3B82F6',     // Mid blue (for accents)
  background: '#FFFFFF',     // Page background
  surface: '#FFFFFF',        // Card/surface background
  border: '#F1F5F9',         // Default border
  borderLight: '#F1F5F9',    // Subtle border

  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',

  // Status: Alındı (mavi)
  statusReceived: '#2563EB',
  statusReceivedBg: '#DBEAFE',

  // Status: Üretimde (amber)
  statusProduction: '#D97706',
  statusProductionBg: '#FEF3C7',

  // Status: Kalite Kontrol (mor)
  statusQC: '#7C3AED',
  statusQCBg: '#EDE9FE',

  // Status: Teslimata Hazır (yeşil)
  statusReady: '#059669',
  statusReadyBg: '#D1FAE5',

  // Status: Teslim Edildi (gri)
  statusDelivered: '#374151',
  statusDeliveredBg: '#F3F4F6',

  // Gecikmiş (kırmızı)
  overdueText: '#DC2626',
  overdueBorder: '#FCA5A5',
  overdueBg: '#FEF2F2',

  // Yardımcı
  error: '#DC2626',
  errorBg: '#FEF2F2',
  success: '#059669',
  successBg: '#D1FAE5',
  warning: '#D97706',
  warningBg: '#FEF3C7',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export default Colors;
