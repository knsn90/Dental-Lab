/**
 * Sipariş detayında teslim tarihinin altındaki "Hasta randevusu" satırı.
 *
 * Klinik hastaya randevu verdikten sonra bunu siparişe girebilsin diye: randevular (prova + takma)
 * tarih sırasıyla alt alta yazılır ("Prova · 3 Ara · 10:00", "Takma · 12 Ara · 14:00"), yoksa "+ Hasta randevusu" bağlantısı çıkar. Dokununca
 * ProvaModal yalnız-randevu modunda açılır (kayıt/öneri/onay mantığı orada, sunucu yetki denetler).
 */
import React from 'react';
import { Pressable, Text, View, Platform } from 'react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { CalendarClock, Plus } from '../../../core/ui/icons';
import { fmtShortDay, provaName, type ProvaSnapshot, type ApptRow } from './provaModel';

/** Gösterilecek randevular: geçerli (silinmemiş) olanların hepsi, tarih sırasıyla (prova + takma). */
export function heroAppts(s: ProvaSnapshot | null | undefined): ApptRow[] {
  if (!s) return [];
  const day = (a: ApptRow) => a.appt_date ?? a.pending_date ?? '';
  return s.appointments
    .filter((a) => !a.removed && (a.appt_date || a.pending_date))
    .sort((a, b) => day(a).localeCompare(day(b)) || (a.kind === b.kind ? 0 : a.kind === 'prova' ? -1 : 1));
}

function apptLabel(a: ApptRow, loc: string): string {
  // Onaylı gün yoksa (lab onayı bekleyen yeni randevu) önerilen gün gösterilir.
  const day = a.appt_date ?? a.pending_date;
  const time = a.appt_date ? a.appt_time : a.pending_time;
  return [autoT(a.kind === 'prova' ? 'Prova' : 'Takma'), day ? fmtShortDay(day, loc) : null, time ? time.slice(0, 5) : null,
    a.pending_action ? autoT('onay bekliyor') : null].filter(Boolean).join(' · ');
}

export function ApptHeroLine({ snapshot, onPress, color, mutedColor, align = 'flex-end', closed = false }: {
  snapshot: ProvaSnapshot | null | undefined;
  /** Teslim edilmiş iş: salt okunur özet — randevular + provaların gidiş → dönüş tarihleri; ekleme bağlantısı yok. */
  closed?: boolean;
  onPress: () => void;
  color: string;
  mutedColor: string;
  align?: 'flex-end' | 'flex-start';
}) {
  if (!snapshot) return null;
  const rows = heroAppts(snapshot);
  const loc = localeTag();
  // Kapalı işte provaların tarihleri de yazılır (gönderildiği gün → döndüğü gün).
  const provaLabels = closed
    ? [...snapshot.provas].filter((p) => p.sent_date).sort((a, b) => a.number - b.number).map((p) =>
        `${provaName(p, autoT)} · ${fmtShortDay(p.sent_date!, loc)}${p.return_date ? ` → ${fmtShortDay(p.return_date, loc)}` : ''}`)
    : [];
  const canEdit = !closed && (snapshot.can_manage || snapshot.can_propose);
  if (rows.length === 0 && provaLabels.length === 0 && !canEdit) return null;
  const apptLabels = rows.map((a) => apptLabel(a, loc));
  const has = rows.length + provaLabels.length > 0;
  const labels = has ? [...provaLabels, ...apptLabels] : [autoT('Hasta randevusu')];
  const Icon = has ? CalendarClock : Plus;
  return (
    <GlassTooltip
      title={autoT('Hasta randevusu')}
      text={has ? autoT('Hastanın prova/takma randevusunu gösterir ve değiştirir') : autoT('Hastaya verilen prova ya da takma randevusunu ekler')}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={labels.join(', ')}
        hitSlop={6}
        style={({ hovered, pressed }: any) => ({
          alignSelf: align, alignItems: align, gap: 2,
          marginTop: 4, paddingVertical: 3, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 8,
          backgroundColor: hovered ? 'rgba(127,127,127,0.12)' : 'transparent',
          opacity: pressed ? 0.7 : 1,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null),
        })}
      >
        {labels.map((label, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon size={12} color={has ? color : mutedColor} strokeWidth={2} />
            <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: '600', color: has ? color : mutedColor, fontVariant: ['tabular-nums'] }}>
              {label}
            </Text>
          </View>
        ))}
      </Pressable>
    </GlassTooltip>
  );
}

export default ApptHeroLine;
