/**
 * Sipariş "Geçmiş" akışı — OrderHistoryModal'ın gövdesi. Tek zaman çizelgesi, en eski üstte
 * (kullanıcı kararı, yerleşim A). Satırlar lab gününe göre gruplanır: gün başlığında tarih,
 * satırda saat. Çipler: Tümü · Teslim · Notlar ve sohbet · Üretim (sayılarıyla).
 * Görünürlük sunucuda (order_history); tüm paneller aynı bileşeni kullanır. Ebeveyn yüksekliğini
 * doldurur: çipler sabit, liste kayar.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag, isRTL } from '../../../core/i18n';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useInkUI } from '../../../core/theme/inkScale';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import {
  FilePlus, CalendarClock, Pencil, Package, RefreshCw, Wrench, PauseCircle, PlayCircle, Truck,
  MessageSquare, Paperclip, FileText, CheckCircle2, Star, Receipt, Banknote, GitMerge, History, AlertCircle, XCircle, ScanLine } from '../../../core/ui/icons';
import { statusLabel } from '../../logs/logDetail';
import { holdCategoryLabel } from '../holdApi';
import { useOrderHistory } from './useOrderHistory';
import {
  HISTORY_CHIPS, FIELD_LABELS, chipCounts, filterRows, fmtDay, fmtDayHeader, fmtTime, groupByDay,
  historyParts, historyTitle, type HistoryChip, type HistoryRow, type Part,
} from './historyModel';

type IconCmp = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null;

/** Çip açıklamaları (cam tooltip). */
const CHIP_HINT: Record<HistoryChip, string> = {
  all: 'Siparişteki bütün olaylar, en eski üstte',
  teslim: 'Oluşturma, söz verilen teslim, teslim tarihi değişiklikleri ve kurye adımları',
  notlar_sohbet: 'Hekim notları, sohbet mesajları ve değerlendirme',
  uretim: 'Aşamalar, bekleme ve hekim onayları',
};

function iconFor(kind: string): IconCmp {
  if (kind === 'created') return FilePlus;
  if (kind === 'delivery_date_changed') return CalendarClock;
  if (kind === 'field_changed') return Pencil;
  if (kind === 'items_changed' || kind === 'implant_part' || kind === 'material_used') return Package;
  if (kind === 'status_changed') return RefreshCw;
  if (kind === 'order_cancelled' || kind === 'delivery_cancelled') return XCircle;
  if (kind.startsWith('stage_')) return Wrench;
  if (kind === 'hold_started') return PauseCircle;
  if (kind === 'hold_ended') return PlayCircle;
  if (kind.startsWith('delivery_') || kind.startsWith('prova_')) return Truck;
  if (kind === 'appointment') return CalendarClock;
  if (kind === 'message' || kind === 'doctor_note') return MessageSquare;
  if (kind === 'photo') return Paperclip;
  if (kind === 'approval_requested' || kind === 'approval_decided') return CheckCircle2;
  if (kind === 'review') return Star;
  if (kind === 'invoice_issued') return Receipt;
  if (kind === 'payment') return Banknote;
  if (kind.startsWith('revision_') || kind.startsWith('continuation_')) return GitMerge;
  if (kind === 'scan') return ScanLine;
  return FileText;
}

/** İkon halkasının tonu: kategoriye göre; iptal/ret kırmızı. */
function toneFor(row: HistoryRow): Tone {
  if (row.kind === 'order_cancelled' || row.kind === 'delivery_cancelled' || row.kind === 'stage_rejected') return 'danger';
  if (row.category === 'teslim') return 'info';
  if (row.category === 'notlar_sohbet') return 'success';
  if (row.category === 'uretim') return 'warning';
  return 'neutral';
}

function partText(p: Part, tz: string | null, loc: string): string {
  switch (p.t) {
    case 'text': return autoT(p.v);
    case 'date': return fmtDay(p.v, tz, loc);
    case 'status': return autoT(statusLabel(p.v));
    case 'field': return autoT(FIELD_LABELS[p.v] ?? p.v);
    case 'holdCat': return autoT(holdCategoryLabel(p.v));
    case 'arrow': return isRTL() ? '←' : '→';
    default: return p.v;
  }
}

function partsLine(parts: Part[], tz: string | null, loc: string): string {
  let out = '';
  for (const p of parts) {
    const s = partText(p, tz, loc);
    if (!s) continue;
    if (p.t === 'sep') { out += s; continue; }
    out += out && !out.endsWith(' ') ? ` ${s}` : s;
  }
  return out.trim();
}

function Row({ row, last, tz, loc }: { row: HistoryRow; last: boolean; tz: string | null; loc: string }) {
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  const router = useRouter();
  const seg = String((useSegments() as string[])?.[0] ?? '');
  const Icon = iconFor(row.kind);
  const tone = U.chipTones[toneFor(row)];
  const dateOnly = !!row.detail?.date_only;
  const time = dateOnly ? '' : fmtTime(row.at, tz, loc);
  const line = partsLine(historyParts(row), tz, loc);
  const isQuote = row.kind === 'message' || row.kind === 'doctor_note';
  const linkColor = isDark ? '#93C5FD' : '#004B87';
  const goLinked = () => {
    if (!row.link_order_id) return;
    router.push((seg.startsWith('(') ? `/${seg}/order/${row.link_order_id}` : `/order/${row.link_order_id}`) as any);
  };
  return (
    <View style={{ flexDirection: 'row' }}>
      {/* Saat sütunu — gün, grup başlığında */}
      <Text
        style={{ width: 44, paddingTop: 5, textAlign: 'right', fontSize: 12, fontWeight: '600', color: T.ink3, fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
      >
        {time}
      </Text>
      {/* Ray: kategori tonunda ikon halkası + bağlantı çizgisi */}
      <View style={{ width: 44, alignItems: 'center' }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: tone.bg }}>
          <Icon size={13} color={tone.fg} strokeWidth={2} />
        </View>
        {!last && <View style={{ flex: 1, width: 1.5, borderRadius: 1, backgroundColor: T.hairline, marginVertical: 4 }} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingBottom: last ? 4 : 18 }}>
        <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: '600', letterSpacing: -0.15, color: T.ink, paddingTop: 3 }}>
          {autoT(historyTitle(row))}
        </Text>
        {!!row.actor_name && (
          <Text style={{ fontSize: 12, lineHeight: 16, color: T.ink3, marginTop: 1 }} numberOfLines={1}>{row.actor_name}</Text>
        )}
        {!!line && (isQuote ? (
          <View style={{ marginTop: 8, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F6F3EE' }}>
            <Text style={{ fontSize: 13, lineHeight: 19, color: T.ink }} numberOfLines={8}>{line}</Text>
          </View>
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 18, color: T.ink2, marginTop: 3 }} numberOfLines={3}>{line}</Text>
        ))}
        {!!row.link_order_no && (
          <GlassTooltip title={autoT('Bu siparişi aç')} text={autoT('Bağlı siparişin detayına gider')}>
            <Pressable
              onPress={goLinked}
              accessibilityRole="link"
              hitSlop={6}
              style={({ pressed }: any) => ({
                alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6,
                paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                backgroundColor: isDark ? 'rgba(147,197,253,0.12)' : 'rgba(0,75,135,0.08)',
                opacity: pressed ? 0.7 : 1, ...webPointer,
              })}
            >
              <GitMerge size={12} color={linkColor} strokeWidth={2} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: linkColor, fontVariant: ['tabular-nums'] }}>#{row.link_order_no}</Text>
            </Pressable>
          </GlassTooltip>
        )}
      </View>
    </View>
  );
}

export function OrderHistoryTimeline({ orderId, bottomInset = 0 }: { orderId: string; bottomInset?: number }) {
  useTranslation(); // dil değişince yeniden çiz
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  const { rows, loading, error, tz, refetch } = useOrderHistory(orderId);
  const [chip, setChip] = useState<HistoryChip>('all');
  const loc = localeTag();
  const counts = useMemo(() => chipCounts(rows), [rows]);
  const groups = useMemo(() => groupByDay(filterRows(rows, chip), tz), [rows, chip, tz]);

  const chips = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 6, paddingHorizontal: 20, paddingVertical: 12 }}
    >
      {HISTORY_CHIPS.map((c) => {
        const on = c.key === chip;
        const n = counts[c.key];
        return (
          <GlassTooltip key={c.key} title={autoT(c.label)} text={autoT(CHIP_HINT[c.key])} placement="bottom">
            <Pressable
              onPress={() => setChip(c.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={({ pressed }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: on ? 18 : 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1,
                backgroundColor: on ? (isDark ? T.ink : '#0E0E0E') : U.plainBtn.bg,
                borderColor: on ? 'transparent' : U.plainBtn.border,
                transform: [{ scale: pressed ? 0.97 : 1 }],
                ...webPointer,
              })}
            >
              <Text style={{ fontSize: 12.5, fontWeight: on ? '700' : '500', color: on ? (isDark ? '#0E0E0E' : '#FFFFFF') : U.plainBtn.fg }}>
                {autoT(c.label)}
              </Text>
              {n > 0 && (
                <Text style={{ fontSize: 11.5, fontWeight: '600', fontVariant: ['tabular-nums'], color: on ? (isDark ? 'rgba(14,14,14,0.55)' : 'rgba(255,255,255,0.6)') : T.ink3 }}>
                  {n}
                </Text>
              )}
            </Pressable>
          </GlassTooltip>
        );
      })}
    </ScrollView>
  );

  let body: React.ReactNode;
  if (loading && !rows.length) {
    body = <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={T.ink3} /></View>;
  } else if (error) {
    body = (
      <View style={{ paddingVertical: 40, alignItems: 'center', gap: 10, paddingHorizontal: 24 }}>
        <AlertCircle size={24} color={isDark ? '#FCA5A5' : '#D94B4B'} strokeWidth={1.8} />
        <Text style={{ fontSize: 13, color: T.ink2, textAlign: 'center' }}>{autoT(error)}</Text>
        <Pressable onPress={refetch} accessibilityRole="button" style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg, ...webPointer }}>
          <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Tekrar dene')}</Text>
        </Pressable>
      </View>
    );
  } else if (!groups.length) {
    body = (
      <View style={{ paddingVertical: 40, alignItems: 'center', gap: 10 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipTones.neutral.bg }}>
          <History size={22} color={T.ink3} strokeWidth={1.8} />
        </View>
        <Text style={{ fontSize: 13.5, color: T.ink3 }}>{autoT(rows.length ? 'Bu filtrede kayıt yok' : 'Henüz kayıt yok')}</Text>
      </View>
    );
  } else {
    body = groups.map((g, gi) => (
      <View key={g.key || String(gi)} style={{ marginTop: gi === 0 ? 4 : 14 }}>
        {/* Gün başlığı — saat sütunuyla hizalı, ince çizgiyle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 0.1, color: T.ink2 }}>
            {fmtDayHeader(g.rows[0].at, tz, loc)}
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: T.hairline }} />
        </View>
        {g.rows.map((r, i) => (
          <Row key={`${r.kind}-${r.at}-${i}`} row={r} last={i === g.rows.length - 1} tz={tz} loc={loc} />
        ))}
      </View>
    ));
  }

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      {chips}
      <View style={{ height: 1, backgroundColor: T.hairline }} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 + bottomInset }}>
        {body}
      </ScrollView>
    </View>
  );
}

export default OrderHistoryTimeline;
