// Nakit kasa pencerelerinin ortak kabuğu (açılış · sayım · bankaya yatırma).
// Kurallar: ortada açılır, arkası bulanık (U.modalOverlay); her düğmede GlassTooltip;
// hata metni birincil düğmenin YANINDA görünür (ScrollView dibinde kaybolmaz).
import React from 'react';
import { View, Text, Pressable, Modal, ActivityIndicator } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { X, Info, AlertTriangle } from '../../../core/ui/icons';
import { formatMoney, type Currency } from '../../../core/money/currency';

export function CashModalShell({
  visible, title, subtitle, onClose, children,
  primaryLabel, primaryHint, onPrimary, busy, disabled, error,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  primaryLabel: string;
  primaryHint: string;
  onPrimary: () => void;
  busy?: boolean;
  disabled?: boolean;
  error?: string | null;
}) {
  const U = useInkUI();
  const off = !!disabled || !!busy;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        <Pressable onPress={onClose} accessibilityLabel={autoT('Kapat')}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View style={[U.modalCard, { width: '100%', maxWidth: 420, padding: 22, gap: 16 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontSize: 17, fontWeight: '600', color: U.ink[900] }}>{title}</Text>
              {subtitle ? <Text style={{ fontSize: 12, color: U.ink[500] }}>{subtitle}</Text> : null}
            </View>
            <GlassTooltip title={autoT('Kapat')} text={autoT('Pencereyi kapatır')}>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={autoT('Kapat')}
                style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border }}>
                <X size={16} color={U.plainBtn.fg} />
              </Pressable>
            </GlassTooltip>
          </View>

          {children}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 12, lineHeight: 16, color: U.chipTones.danger.fg }} numberOfLines={3}>
              {error ?? ''}
            </Text>
            <GlassTooltip title={primaryLabel} text={primaryHint}>
              <Pressable onPress={onPrimary} disabled={off} accessibilityRole="button" accessibilityLabel={primaryLabel}
                style={{ height: 42, paddingHorizontal: 20, borderRadius: 999, flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'center', gap: 8, backgroundColor: U.ink[900], opacity: off ? 0.4 : 1,
                  cursor: (off ? 'default' : 'pointer') as any }}>
                {busy ? <ActivityIndicator size="small" color={U.onDarkPill} /> : null}
                <Text style={{ fontSize: 14, fontWeight: '600', color: U.onDarkPill }}>{primaryLabel}</Text>
              </Pressable>
            </GlassTooltip>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** RPC hatasını kullanıcı diline çevirir (DB mesajları Türkçe yazılır) */
export function cashErrorText(e: any): string {
  const msg = String(e?.message ?? e ?? '').trim();
  return msg ? autoT(msg) : autoT('İşlem kaydedilemedi');
}

/** Pencere içi kısa açıklama / uyarı kutusu */
export function CashNote({ tone = 'info', children }: { tone?: 'info' | 'warning'; children: React.ReactNode }) {
  const U = useInkUI();
  const t = U.chipTones[tone];
  const Icon = tone === 'warning' ? AlertTriangle : Info;
  return (
    <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: t.bg }}>
      <Icon size={15} color={t.fg} strokeWidth={1.8} />
      <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: t.fg }}>{children}</Text>
    </View>
  );
}

/** Etiketli alan sarmalayıcı */
export function CashField({ label, children }: { label: string; children: React.ReactNode }) {
  const U = useInkUI();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[500] }}>{label}</Text>
      {children}
    </View>
  );
}

/** Kasa tutarı — kaydın KENDİ para biriminde (sabit ₺ yok) */
export function fmtCash(n: number | string | null | undefined, currency: string): string {
  return formatMoney(Number(n) || 0, currency as Currency, { fractionDigits: 2 });
}

/** Yerel bugün (YYYY-MM-DD) */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
