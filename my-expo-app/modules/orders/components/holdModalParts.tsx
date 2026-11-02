/**
 * Bekletme / devam ettirme pencerelerinin ortak parçaları (madde 13).
 *
 * HoldOrderModal ve ResumeOrderModal aynı başlığı, gün alanını, hata metnini ve
 * düğme satırını kullanır. Zemin `U.modalOverlay`; hata düğmenin yanında (footer).
 */
import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { useInkUI } from '../../../core/theme/inkScale';
import { onAccentInk } from '../../../core/theme/usePanelTheme';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { DatePicker } from '../../../core/ui/DatePicker';
import { X } from '../../../core/ui/icons';
import { fmtDayMonth } from '../prova/provaModel';
import type { DayErr } from '../holdDates';

const WEB_PTR: any = Platform.OS === 'web' ? { cursor: 'pointer' } : null;

/** "31 Eki" — sınır gününü kullanıcının dilinde gösterir. */
export function fmtHoldDay(day: string): string {
  return fmtDayMonth(day, localeTag());
}

/**
 * Gün hatası → metin. Sabitler sunucu metinleriyle (20261102100000) aynı; sunucudan gelen
 * "<sabit>: GG.AA.YYYY" hatası `autoT` önek eşleşmesiyle aynı çeviriyi bulur.
 * `prevEndDay`: taban önceki beklemenin bitişinden geliyorsa hangi metnin seçileceğini söyler.
 */
export function dayErrText(err: DayErr, field: 'start' | 'end', prevEndDay?: string | null): string {
  const at = (msg: string) => (err.boundary ? `${autoT(msg)}: ${fmtHoldDay(err.boundary)}` : autoT(msg));
  if (field === 'end') {
    return err.code === 'future' ? autoT('Bitiş günü gelecekte olamaz') : at('Bitiş günü başlangıçtan önce olamaz');
  }
  if (err.code === 'future') return autoT('Bekleme başlangıcı gelecekte olamaz');
  if (err.code === 'later_than_current') return at('Başlangıç yalnız daha erken bir güne çekilebilir');
  return prevEndDay && err.boundary === prevEndDay
    ? at('Bekleme başlangıcı önceki beklemenin bittiği günden önce olamaz')
    : at('Bekleme başlangıcı siparişin açıldığı günden önce olamaz');
}

export function HoldModalHeader({ title, subtitle, onClose }: { title: string; subtitle?: string | null; onClose: () => void }) {
  const U = useInkUI();
  return (
    <View style={[U.modalHeaderRow, { gap: 12 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[U.modalTitle, { letterSpacing: -0.2 }]} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 2 }} numberOfLines={2}>{subtitle}</Text>
        ) : null}
      </View>
      <GlassTooltip title={autoT('Kapat')} text={autoT('Pencereyi kaydetmeden kapatır')} placement="bottom">
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={autoT('Kapat')}
          style={({ pressed }: any) => ({ ...U.modalCloseBtn, opacity: pressed ? 0.6 : 1, ...WEB_PTR })}
        >
          <X size={15} color={U.ink[500]} strokeWidth={2} />
        </Pressable>
      </GlassTooltip>
    </View>
  );
}

/** Etiket + gün seçici + (varsa) açıklama satırı. */
export function HoldDayField({
  label, value, onChange, minDate, maxDate, accent, hint,
}: {
  label: string; value: string; onChange: (day: string) => void;
  minDate?: string; maxDate?: string; accent: string; hint?: string | null;
}) {
  const U = useInkUI();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[900] }}>{label}</Text>
      <DatePicker value={value} onChange={onChange} accent={accent} minDate={minDate} maxDate={maxDate} compact />
      {hint ? <Text style={{ fontSize: 11, color: U.ink[400], lineHeight: 15 }}>{hint}</Text> : null}
    </View>
  );
}

/** Alt satır: hata (düğmenin yanında) + Vazgeç + ana düğme. */
export function HoldModalFooter({
  error, busy, disabled, accent, primaryLabel, primaryBusyLabel, primaryHint, primaryIcon: Icon, onPrimary, onCancel,
}: {
  error?: string | null; busy: boolean; disabled?: boolean; accent: string;
  primaryLabel: string; primaryBusyLabel: string; primaryHint: string; primaryIcon?: any;
  onPrimary: () => void; onCancel: () => void;
}) {
  const U = useInkUI();
  const ink = onAccentInk(accent);
  const off = busy || !!disabled;
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18, borderTopWidth: 1, borderTopColor: U.ink[100], gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        {error ? (
          <Text style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 16, color: U.chipTones.danger.fg }} numberOfLines={3}>
            {error}
          </Text>
        ) : null}
        <GlassTooltip title={autoT('Vazgeç')} text={autoT('Pencereyi kaydetmeden kapatır')}>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel={autoT('Vazgeç')}
            style={({ pressed, hovered }: any) => ({
              height: 40, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
              backgroundColor: hovered ? U.plainBtn.hoverBg : U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
              transform: [{ scale: pressed ? 0.97 : 1 }], ...WEB_PTR,
            })}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Vazgeç')}</Text>
          </Pressable>
        </GlassTooltip>
        <GlassTooltip title={primaryLabel} text={primaryHint}>
          <Pressable
            onPress={onPrimary}
            disabled={off}
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            accessibilityState={{ disabled: off, busy }}
            style={({ pressed, hovered }: any) => ({
              height: 40, paddingHorizontal: 18, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 7,
              backgroundColor: accent, opacity: off ? 0.5 : hovered ? 0.92 : 1,
              transform: [{ scale: pressed && !off ? 0.97 : 1 }], ...WEB_PTR,
            })}
          >
            {Icon ? <Icon size={14} color={ink} strokeWidth={2} /> : null}
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: ink }}>{busy ? primaryBusyLabel : primaryLabel}</Text>
          </Pressable>
        </GlassTooltip>
      </View>
    </View>
  );
}
