/**
 * Değerlendirme satırının ortak gövdesi (spec §7.3): puan karesi, "#no · klinik",
 * hekim · iş türü · WhatsApp cevabı · tarih, düşük puan rozetleri, yorumun ilk satırı.
 * Klinik süzgecinde salt okunur kullanılır; düşük puan listesi `children` ile
 * arama durumunu ve düğmeleri ekler.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { MobileTableRowX, useMobileTableText } from '../../../../core/ui/MobileTableX';
import { useInkUI } from '../../../../core/theme/inkScale';
import { usePanelTheme } from '../../../../core/theme/usePanelTheme';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { fmtDayMonthShort } from '../../../../core/i18n';
import { REVIEW_LOW_MAX, SCORE_SHORT_LABELS, lowChips, waButtonLabel, metaSep } from '../../dashboardRules';
import type { ReviewDashRow } from '../../types';
import { useReviewTones, fmtInt } from './dashboardUi';

export function ReviewRowSummary({ row, lang, isLast, highlighted, titleExtra, children }: {
  row: ReviewDashRow;
  lang: string;
  isLast?: boolean;
  /** Bildirimden gelinen satır */
  highlighted?: boolean;
  /** Başlık satırının sağına (ör. "3 gündür aranmadı") */
  titleExtra?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const U = useInkUI();
  const T = useMobileTableText();
  const tones = useReviewTones();
  const panel = usePanelTheme();

  const score = row.cur_min ?? row.overall;
  const low = score != null && score <= REVIEW_LOW_MAX;
  const wa = waButtonLabel(row.wa_answer);
  const subParts = [
    row.doctor_name && row.doctor_name !== row.clinic_name ? row.doctor_name : null,
    row.work_type_label ? autoT(row.work_type_label) : null,
    wa ? `${autoT("WhatsApp'tan")} "${autoT(wa)}"` : null,
    fmtDayMonthShort(new Date(row.created_at)),
  ].filter(Boolean) as string[];
  const chips = lowChips(row);
  const comment = row.comment?.split('\n').map(l => l.trim()).find(Boolean) ?? null;

  return (
    <MobileTableRowX isLast={isLast} align="flex-start" tint={highlighted ? (U.isDark ? 'rgba(255,255,255,0.08)' : panel.bg) : undefined}>
      <View style={{
        width: 32, height: 32, borderRadius: 10,
        backgroundColor: low ? tones.badTone.bg : U.chipNeutral,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: low ? tones.badTone.fg : U.ink[700] }}>{score != null ? fmtInt(score, lang) : '—'}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={[T.title, { flexShrink: 1 }]} numberOfLines={1}>{`#${row.order_number ?? '—'}${metaSep(lang)}${row.clinic_name ?? '—'}`}</Text>
            {titleExtra}
          </View>
          <Text style={T.sub} numberOfLines={2}>{subParts.join(metaSep(lang))}</Text>
        </View>
        {chips.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {chips.map(c => (
              <View key={c.key} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: tones.badTone.bg }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: tones.badTone.fg }}>
                  {`${c.key === 'whatsapp' ? 'WhatsApp' : autoT(SCORE_SHORT_LABELS[c.key])} ${fmtInt(c.score, lang)}`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {comment ? (
          <Text style={{ fontSize: 12, fontStyle: 'italic', color: U.ink[500] }} numberOfLines={1}>{`“${comment}”`}</Text>
        ) : null}
        {children}
      </View>
    </MobileTableRowX>
  );
}
