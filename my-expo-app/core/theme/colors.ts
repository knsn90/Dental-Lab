export const C = {
  // ─── Brand ────────────────────────────────────────────────────────────────
  primary:       '#2563EB',
  primaryLight:  '#3B82F6',
  primaryBg:     '#EFF6FF',

  // ─── Surfaces ─────────────────────────────────────────────────────────────
  background:    '#FFFFFF',
  surface:       '#FFFFFF',
  surfaceAlt:    '#FAFBFC',
  surfaceHover:  '#F4F6FA',

  // ─── Text ─────────────────────────────────────────────────────────────────
  textPrimary:   '#0F172A',
  textSecondary: '#64748B',
  textMuted:     '#94A3B8',
  textDisabled:  '#CBD5E1',
  textInverse:   '#FFFFFF',

  // ─── Borders ──────────────────────────────────────────────────────────────
  border:        '#F1F5F9',
  borderMid:     '#E2E8F0',
  borderStrong:  '#CBD5E1',
  borderFocus:   '#2563EB',

  // ─── Semantic ─────────────────────────────────────────────────────────────
  success:       '#059669',
  successBg:     '#ECFDF5',
  successBorder: '#6EE7B7',

  warning:       '#D97706',
  warningBg:     '#FFFBEB',
  warningBorder: '#FCD34D',

  danger:        '#DC2626',
  dangerBg:      '#FEF2F2',
  dangerBorder:  '#FCA5A5',
  dangerHover:   '#FFF1F0',

  info:          '#0EA5E9',
  infoBg:        '#F0F9FF',
  infoBorder:    '#7DD3FC',

  // ─── Order status ─────────────────────────────────────────────────────────
  statusAlindi:       '#2563EB',
  statusAlindiBg:     '#DBEAFE',
  statusUretimde:     '#D97706',
  statusUretimdeBg:   '#FEF3C7',
  statusKalite:       '#7C3AED',
  statusKaliteBg:     '#EDE9FE',
  statusHazir:        '#059669',
  statusHazirBg:      '#D1FAE5',
  statusTeslim:       '#374151',
  statusTeslimBg:     '#F3F4F6',
  statusIptal:        '#9CA3AF',
  statusIptalBg:      '#F9FAFB',

  // ─── Invoice status ───────────────────────────────────────────────────────
  invoiceTaslak:      '#64748B',
  invoiceTaslakBg:    '#F8FAFC',
  invoiceGonderildi:  '#D97706',
  invoiceGonderildiBg:'#FEF3C7',
  invoiceOdendi:      '#059669',
  invoiceOdendiBg:    '#D1FAE5',
  invoiceVadesi:      '#DC2626',
  invoiceVadesiBg:    '#FEF2F2',
  invoiceIptal:       '#9CA3AF',
  invoiceIptalBg:     '#F9FAFB',

  // ─── UI accents ───────────────────────────────────────────────────────────
  navHover:      '#EEF2FF',
  navActive:     '#EFF6FF',
  tooltipBg:     '#1E293B',
  overlay:       'rgba(15,23,42,0.3)',
  overlayDark:   'rgba(0,0,0,0.5)',

  // ─── Admin accent ─────────────────────────────────────────────────────────
  admin:         '#0F172A',
  adminBg:       '#F8FAFC',
};

// ─── Convenience maps ─────────────────────────────────────────────────────────
export const ORDER_STATUS_COLOR: Record<string, { fg: string; bg: string }> = {
  alindi:    { fg: C.statusAlindi,   bg: '#DBEAFE' },
  uretimde:  { fg: C.statusUretimde, bg: '#FEF3C7' },
  kalite:    { fg: C.statusKalite,   bg: '#EDE9FE' },
  hazir:     { fg: C.statusHazir,    bg: '#D1FAE5' },
  teslim:    { fg: C.statusTeslim,   bg: '#F3F4F6' },
  iptal:     { fg: C.statusIptal,    bg: '#F9FAFB' },
};

export const INVOICE_STATUS_COLOR: Record<string, { fg: string; bg: string; label: string }> = {
  taslak:      { fg: C.invoiceTaslak,     bg: C.invoiceTaslakBg,     label: 'Taslak' },
  gonderildi:  { fg: C.invoiceGonderildi, bg: C.invoiceGonderildiBg, label: 'Gönderildi' },
  odendi:      { fg: C.invoiceOdendi,     bg: C.invoiceOdendiBg,     label: 'Ödendi' },
  gecikti:     { fg: C.invoiceVadesi,     bg: C.invoiceVadesiBg,     label: 'Gecikti' },
  iptal:       { fg: C.invoiceIptal,      bg: C.invoiceIptalBg,      label: 'İptal' },
};
