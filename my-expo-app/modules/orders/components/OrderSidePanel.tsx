// modules/orders/components/OrderSidePanel.tsx
// Masaüstü sipariş listesinde sağda açılan detay paneli (split view) — 2026-11.
// Yalnız hekim panelinde kullanılır (OrdersListScreenV2). Renkler aktif panelden gelir;
// showParties ile Hekim/Klinik satırları açılabilir.
// Liste yerinde kalır; Esc kapatır, ↑ ↓ önceki/sonraki sipariş (klavye dinleyicisi
// listede). "Tam sayfa aç" mevcut detay rotasına gider, "Mesaj" detayı sohbet açık
// gelecek biçimde açar (?tab=chat).

import React from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { X, Check, MessageCircle, ArrowUpRight } from '../../../core/ui/icons';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useInkUI } from '../../../core/theme/inkScale';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { usePanelTheme, onAccentInk } from '../../../core/theme/usePanelTheme';
import { autoT } from '../../../core/i18n/autoTranslate';
import { fmtDayMonthYear, localeTag } from '../../../core/i18n';
import { getOrderStageLabel } from '../utils/currentStage';
import { holdBadgeText } from '../holdCategories';
import { titleCaseTR } from '../../../core/utils/textCase';
import type { WorkOrder } from '../types';

const STEPS: { label: string; from: number }[] = [
  { label: 'Alındı',          from: 0 },
  { label: 'Üretimde',        from: 1 },
  { label: 'Kalite kontrol',  from: 2 },
  { label: 'Teslimata hazır', from: 3 },
  { label: 'Teslim edildi',   from: 4 },
];

const STATUS_STEP: Record<string, number> = {
  atama_bekleniyor: 0, alindi: 0, asamada: 1, uretimde: 1, kalite_kontrol: 2,
  teslimata_hazir: 3, kurye_bekleniyor: 3, kuryede: 3, teslim_edildi: 4, iptal: 0,
};

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function safeDate(s?: string | null, withTime = false): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return '—';
  if (!withTime) return fmtDayMonthYear(d);
  return `${fmtDayMonthYear(d)} ${d.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })}`;
}

// Panel accent'inin rozet/aktif metin tonu — açık temada koyu, koyu temada açık.
const ACCENT_TEXT: Record<string, { light: string; dark: string }> = {
  clinic: { light: '#0A7247', dark: '#74E1A8' },
  lab:    { light: '#8A6410', dark: '#F5C24B' },
  exec:   { light: '#314F7E', dark: '#93C5FD' },
  tech:   { light: '#1E5FBF', dark: '#93C5FD' },
};

export function OrderSidePanel({ order, overdue, onClose, onOpenFull, onMessage, showParties = false }: {
  order: WorkOrder;
  overdue: boolean;
  onClose: () => void;
  onOpenFull: () => void;
  onMessage: () => void;
  /** Hekim ve klinik satırlarını göster (hekim dışı paneller). */
  showParties?: boolean;
}) {
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const theme = usePanelTheme();
  const accent = theme.primary;
  const onAccent = onAccentInk(accent);
  const tone = ACCENT_TEXT[theme.key] ?? ACCENT_TEXT.clinic;
  const accentText = isDark ? tone.dark : tone.light;
  const step = STATUS_STEP[order.status] ?? 0;
  const cancelled = order.status === 'iptal';
  const teeth = order.tooth_numbers?.length ? order.tooth_numbers.join(', ') : '—';
  const name = order.patient_name ? titleCaseTR(order.patient_name) : autoT('Hasta belirtilmemiş');
  // Listedeki satır rozetiyle aynı: beklemedeyse «Provada» / «Duraklatıldı», değilse aşama adı.
  const onHold = (order as any).hold_status === 'on_hold';
  const statusText = onHold ? autoT(holdBadgeText(order as any)) : getOrderStageLabel(order as any);
  const holdFg = isDark ? '#F0C078' : '#9C5E0E';

  const doctorName = order.doctor?.full_name || '—';
  const clinicName = order.doctor?.clinic?.name || order.doctor?.clinic_name || '—';
  const rows: { label: string; value: string; tone?: string }[] = [
    ...(showParties ? [
      { label: 'Hekim',  value: doctorName },
      { label: 'Klinik', value: clinicName },
    ] : []),
    { label: 'İş',        value: order.work_type || '—' },
    { label: 'Dişler',    value: teeth },
    { label: 'Renk',      value: order.shade || '—' },
    { label: 'Teslim',    value: safeDate(order.delivery_date), tone: overdue ? (isDark ? '#F87171' : '#C2362F') : undefined },
    { label: 'Oluşturma', value: safeDate((order as any).created_at, true) },
  ];

  return (
    <View
      accessibilityLabel={autoT('Sipariş detayı')}
      style={{
        width: 420, flexShrink: 0,
        marginEnd: 16, marginTop: 4,
        borderRadius: 24, overflow: 'hidden',
        backgroundColor: isDark ? T.card : '#FFFFFF',
        borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.05)',
        // Panel kabuğun dış kaydırma alanında durur → liste kayarken ekranda kalsın
        // diye yapışık; yüksekliği görünür alanla sınırlı, içi kendi kayar.
        ...(Platform.OS === 'web'
          ? {
              // top 76: kabuğun sağ üstte yüzen arama/bildirim çubuğunun altı
              position: 'sticky', top: 76, alignSelf: 'flex-start',
              maxHeight: 'calc(100vh - 92px)',
              boxShadow: isDark ? 'none' : '0 8px 28px -12px rgba(16,24,20,0.18)',
            } as any
          : { alignSelf: 'stretch' }),
      }}
    >
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 32 }}>
        {/* Başlık */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 12, color: T.ink3, fontFamily: 'monospace' }}>#{order.order_number}</Text>
            <Text style={{ marginTop: 4, fontSize: 22, fontWeight: '600', letterSpacing: -0.4, color: T.ink }} numberOfLines={2}>
              {name}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: onHold ? (isDark ? 'rgba(232,155,42,0.22)' : 'rgba(232,155,42,0.15)') : hexA(accent, isDark ? 0.2 : 0.14) }}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: onHold ? holdFg : accentText }}>{statusText}</Text>
              </View>
              {order.is_urgent && (
                <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: isDark ? 'rgba(217,75,75,0.22)' : 'rgba(217,75,75,0.1)' }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: isDark ? '#F3A0A0' : '#C2362F' }}>{autoT('ACİL')}</Text>
                </View>
              )}
            </View>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityLabel={autoT('Kapat')}
            style={({ hovered }: any) => ({
              width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
              backgroundColor: hovered ? (isDark ? U.plainBtn.hoverBg : '#F3F4F6') : U.plainBtn.bg,
              borderWidth: 1, borderColor: U.plainBtn.border,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <X size={14} color={U.plainBtn.fg} strokeWidth={2} />
          </Pressable>
        </View>

        {/* İlerleme */}
        {!cancelled && (
          <>
            <Text style={{ marginTop: 26, fontSize: 11.5, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: T.ink3 }}>
              {autoT('İlerleme')}
            </Text>
            <View style={{ marginTop: 12 }}>
              {STEPS.map((s, i) => {
                const done = step > s.from || order.status === 'teslim_edildi';
                const current = !done && step === s.from;
                const last = i === STEPS.length - 1;
                return (
                  <View key={s.label} style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ alignItems: 'center' }}>
                      <View style={{
                        width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: done ? accent : (isDark ? T.card : '#FFFFFF'),
                        borderWidth: done ? 0 : 2,
                        borderColor: current ? accent : (isDark ? 'rgba(255,255,255,0.18)' : '#D4D4D4'),
                        ...(current && Platform.OS === 'web' ? { boxShadow: `0 0 0 4px ${hexA(accent, 0.18)}` } as any : {}),
                      }}>
                        {done && <Check size={10} color={onAccent} strokeWidth={3.2} />}
                      </View>
                      {!last && (
                        <View style={{ width: 2, height: 22, backgroundColor: done ? accent : (isDark ? 'rgba(255,255,255,0.10)' : '#E4E7E5') }} />
                      )}
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: last ? 0 : 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: current ? '600' : '400', color: done || current ? T.ink : T.ink3 }}>
                        {autoT(s.label)}
                      </Text>
                      {i === 0 && (
                        <Text style={{ fontSize: 13, color: T.ink3 }}>{safeDate((order as any).created_at)}</Text>
                      )}
                      {last && order.status !== 'teslim_edildi' && (
                        <Text style={{ fontSize: 13, color: overdue ? (isDark ? '#F87171' : '#C2362F') : T.ink3 }}>
                          {safeDate(order.delivery_date)}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* Bilgi satırları */}
        <View style={{
          marginTop: 24, borderRadius: 14,
          backgroundColor: isDark ? T.cardSoft : '#F9FAFB',
          borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
        }}>
          {rows.map((r, i) => (
            <View key={r.label} style={{
              flexDirection: 'row', justifyContent: 'space-between', gap: 16,
              paddingHorizontal: 14, paddingVertical: 12,
              borderTopWidth: i === 0 ? 0 : 1, borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            }}>
              <Text style={{ fontSize: 14, color: T.ink3 }}>{autoT(r.label)}</Text>
              <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 14, fontWeight: '600', color: r.tone ?? T.ink }}>{r.value}</Text>
            </View>
          ))}
        </View>

        {/* Eylemler */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
          <Pressable
            onPress={onMessage}
            style={({ hovered }: any) => ({
              flex: 1, height: 42, borderRadius: 21, flexDirection: 'row', gap: 6,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: hovered ? (isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6') : U.plainBtn.bg,
              borderWidth: 1, borderColor: U.plainBtn.border,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <MessageCircle size={15} color={U.plainBtn.fg} strokeWidth={1.9} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Mesaj')}</Text>
          </Pressable>
          <Pressable
            onPress={onOpenFull}
            style={({ hovered }: any) => ({
              flex: 1.4, height: 42, borderRadius: 21, flexDirection: 'row', gap: 6,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: accent, opacity: hovered ? 0.9 : 1,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: onAccent }}>{autoT('Tam sayfa aç')}</Text>
            <ArrowUpRight size={15} color={onAccent} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Klavye ipucu */}
        {Platform.OS === 'web' && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 22 }}>
            <Text style={{ fontSize: 12.5, color: T.ink3 }}>
              <Text style={{ fontFamily: 'monospace' }}>Esc</Text> {autoT('kapat')}
            </Text>
            <Text style={{ fontSize: 12.5, color: T.ink3 }}>
              <Text style={{ fontFamily: 'monospace' }}>↑ ↓</Text> {autoT('önceki / sonraki')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
