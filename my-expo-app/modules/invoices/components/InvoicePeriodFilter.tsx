// Fatura listesi "Dönem" çipi + seçim penceresi (yol haritası 2. dalga madde 7, küçük sürüm).
// Çip filtre satırındaki "Vadesi Geçen" ile aynı dilde; pencere ortada (mobilde de), arkası bulanık
// (useInkUI().modalOverlay). Dönem kesim tarihine (issue_date) göre süzer; dışa aktarım da aynı listeyi alır.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { CalendarDays, Check, X } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { DatePicker } from '../../../core/ui/DatePicker';
import type { InvoicePeriod, PeriodRange } from '../periodRange';

const OPTIONS: { key: InvoicePeriod; label: string }[] = [
  { key: 'all', label: 'Tüm tarihler' },
  { key: 'this_month', label: 'Bu ay' },
  { key: 'last_month', label: 'Geçen ay' },
  { key: 'this_year', label: 'Bu yıl' },
  { key: 'custom', label: 'Özel aralık' },
];

const fmt = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString(localeTag(), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '…';

export function periodLabel(p: InvoicePeriod, r: PeriodRange): string {
  if (p === 'custom') return `${fmt(r.from)} – ${fmt(r.to)}`;
  return autoT(OPTIONS.find((o) => o.key === p)?.label ?? 'Tüm tarihler');
}

export function InvoicePeriodFilter({ period, from, to, range, onChange }: {
  period: InvoicePeriod; from: string | null; to: string | null; range: PeriodRange;
  onChange: (p: InvoicePeriod, from: string | null, to: string | null) => void;
}) {
  const U = useInkUI();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{ p: InvoicePeriod; from: string | null; to: string | null }>({ p: period, from, to });
  useEffect(() => { if (open) setDraft({ p: period, from, to }); }, [open, period, from, to]);
  const active = period !== 'all';
  const tone = U.chipTones.info;

  const pick = (p: InvoicePeriod) => {
    if (p === 'custom') { setDraft((d) => ({ ...d, p })); return; }   // özelde tarih seçilip "Uygula"
    onChange(p, null, null); setOpen(false);
  };

  return (
    <>
      <GlassTooltip title={autoT('Dönem')} text={autoT('Faturaları kesim tarihine göre süzer')}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${autoT('Dönem')}: ${periodLabel(period, range)}`}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999,
            backgroundColor: active ? tone.bg : 'transparent',
            // @ts-ignore web
            cursor: 'pointer',
          }}
        >
          <CalendarDays size={12} strokeWidth={1.8} color={active ? tone.fg : U.ink[400]} />
          <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? tone.fg : U.ink[500] }} numberOfLines={1}>
            {periodLabel(period, range)}
          </Text>
        </Pressable>
      </GlassTooltip>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={U.modalOverlay}>
          <Pressable onPress={() => setOpen(false)} accessibilityLabel={autoT('Kapat')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={[U.modalCard, { width: '100%', maxWidth: 380, gap: 6 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: U.ink[900] }}>{autoT('Dönem')}</Text>
              <GlassTooltip title={autoT('Kapat')} text={autoT('Pencereyi kapatır')}>
                <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={autoT('Kapat')}
                  style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border }}>
                  <X size={16} color={U.plainBtn.fg} />
                </Pressable>
              </GlassTooltip>
            </View>
            {OPTIONS.map((o) => {
              const on = draft.p === o.key;
              return (
                <Pressable key={o.key} onPress={() => pick(o.key)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12,
                    borderRadius: 12, backgroundColor: on ? U.rowHover : hovered ? U.rowHover : 'transparent' })}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: on ? '600' : '400', color: U.ink[900] }}>{autoT(o.label)}</Text>
                  {on ? <Check size={16} color={U.ink[900]} strokeWidth={2} /> : null}
                </Pressable>
              );
            })}
            {draft.p === 'custom' ? (
              <View style={{ gap: 10, marginTop: 6 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[500] }}>{autoT('Başlangıç')}</Text>
                    <DatePicker compact value={draft.from} onChange={(iso) => setDraft((d) => ({ ...d, from: iso }))} accent={U.ink[900]} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[500] }}>{autoT('Bitiş')}</Text>
                    <DatePicker compact value={draft.to} onChange={(iso) => setDraft((d) => ({ ...d, to: iso }))} accent={U.ink[900]} />
                  </View>
                </View>
                <GlassTooltip title={autoT('Uygula')} text={autoT('Seçilen aralığı uygular')}>
                  <Pressable
                    onPress={() => { onChange('custom', draft.from, draft.to); setOpen(false); }}
                    disabled={!draft.from && !draft.to}
                    accessibilityRole="button"
                    style={{ height: 42, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: U.ink[900], opacity: !draft.from && !draft.to ? 0.4 : 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: U.onDarkPill }}>{autoT('Uygula')}</Text>
                  </Pressable>
                </GlassTooltip>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}
