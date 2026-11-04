/**
 * Düşük puanlar listesi (spec §7.3): "Aranmadı · n" / "Tümü · n" süzgeci, aranmamışlar
 * üstte (en eski başta), 48 saati geçen aranmamışta kırmızı gün etiketi, düşük puan
 * rozetleri, yorumun ilk satırı, Kliniği ara / Arandı / Siparişe git. Arandıysa yeşil
 * kayıt + not kutusu. Arama kaydı penceresi kaydedince satır yerinde güncellenir.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Linking, Platform, useWindowDimensions } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MobileTableX, MobileTableRowX, useMobileTableText } from '../../../../core/ui/MobileTableX';
import { GlassTooltip } from '../../../../core/ui/GlassTooltip';
import { Phone, Check, ArrowRight, ArrowLeft, Copy } from '../../../../core/ui/icons';
import { useInkUI } from '../../../../core/theme/inkScale';
import { usePanelTheme, onAccentInk } from '../../../../core/theme/usePanelTheme';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { isRTL } from '../../../../core/i18n';
import { sortLows, defaultLowFilter, daysUncalled, callPhone, metaSep } from '../../dashboardRules';
import type { ReviewCallState, ReviewLowRow } from '../../types';
import { ReviewRowSummary } from './ReviewRowSummary';
import { ReviewCallModal } from './ReviewCallModal';
import { PressScale, useReviewTones, fmtInt, callStamp } from './dashboardUi';

type Filter = 'open' | 'all';

export function ReviewLowList({ rows, focusWorkOrderId, onChanged, onRevealFocus }: {
  rows: ReviewLowRow[];
  focusWorkOrderId?: string | null;
  onChanged: (workOrderId: string, state: ReviewCallState) => void;
  /** Bildirimden gelinen satırı görünür alana kaydırır (kaydırma kabı ekrana ait). */
  onRevealFocus?: (node: any) => void;
}) {
  const U = useInkUI();
  const T = useMobileTableText();
  const tones = useReviewTones();
  const panel = usePanelTheme();
  const router = useRouter();
  const panelBase = String((useSegments() as string[])?.[0] ?? '(lab)');
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const rtl = isRTL(lang);
  const sep = metaSep(lang);
  const { width: winW } = useWindowDimensions();
  const dialDirectly = Platform.OS !== 'web' || winW < 768;

  const focus = focusWorkOrderId ?? null;
  const [filter, setFilter] = useState<Filter>(() => {
    const f = rows.find(r => r.work_order_id === focus);
    return f && !f.is_open ? 'all' : defaultLowFilter(rows);
  });
  const [modal, setModal] = useState<{ row: ReviewLowRow; mode: 'mark' | 'edit' } | null>(null);
  const [phoneOpen, setPhoneOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Bildirimden gelinen satır: aranmışsa "Tümü" açılır, sonra satır görünür alana kaydırılır.
  const nodes = useRef<Record<string, any>>({});
  const focusHandled = useRef<string | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  useEffect(() => {
    if (!focus || focusHandled.current === focus) return;
    const f = rows.find(r => r.work_order_id === focus);
    if (!f) return;
    focusHandled.current = focus;
    if (!f.is_open) setFilter('all');
    setRevealId(focus);
  }, [focus, rows]);
  useEffect(() => {
    if (!revealId) return;
    const t = setTimeout(() => {
      const n = nodes.current[revealId];
      if (n) onRevealFocus?.(n);
      setRevealId(null);
    }, 200);
    return () => clearTimeout(t);
  }, [revealId, onRevealFocus]);

  const now = new Date();
  const sorted = sortLows(rows);
  const openCount = rows.filter(r => r.is_open).length;
  const shown = filter === 'open' ? sorted.filter(r => r.is_open) : sorted;

  const stripInk = onAccentInk(panel.primary);
  const segBg = stripInk === '#FFFFFF' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)';
  const seg = (key: Filter, label: string, n: number) => {
    const on = filter === key;
    return (
      <PressScale
        key={key}
        onPress={() => setFilter(key)}
        accessibilityLabel={label}
        style={{ paddingHorizontal: on ? 18 : 12, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? '#FFFFFF' : 'transparent' }}
      >
        <Text style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? '#0A0A0A' : stripInk, opacity: on ? 1 : 0.85 }} numberOfLines={1}>
          {`${label}${sep}${fmtInt(n, lang)}`}
        </Text>
      </PressScale>
    );
  };

  const btn = { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 };
  const darkBtn = { ...btn, backgroundColor: U.ink[900] };
  const plainBtn = { ...btn, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border };
  const ghostBtn = { ...btn, paddingHorizontal: 10 };
  const GoIcon = rtl ? ArrowLeft : ArrowRight;

  const callClinic = (r: ReviewLowRow, phone: string) => {
    if (dialDirectly) {
      Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => {});
      return;
    }
    setPhoneOpen(p => (p === r.work_order_id ? null : r.work_order_id));
  };
  const copyPhone = (id: string, phone: string) => {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav?.clipboard?.writeText) return;
    nav.clipboard.writeText(phone).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(c => (c === id ? null : c)), 1500);
    }).catch(() => {});
  };

  return (
    <>
      <MobileTableX
        title="Düşük puanlar"
        subtitle="Genel puan ya da herhangi bir alt puan 3 ve altı"
        right={(
          <View style={{ flexDirection: 'row', gap: 2, padding: 2, borderRadius: 999, backgroundColor: segBg }}>
            {seg('open', autoT('Aranmadı'), openCount)}
            {seg('all', autoT('Tümü'), rows.length)}
          </View>
        )}
      >
        {shown.length === 0 ? (
          <MobileTableRowX isLast>
            <Text style={T.sub}>{rows.length === 0 ? autoT('Bu ay düşük puan yok') : autoT('Aranmamış düşük puan yok')}</Text>
          </MobileTableRowX>
        ) : shown.map((r, i) => {
          const days = r.is_open ? daysUncalled(r.period_started_at, now) : null;
          const phone = callPhone(r);
          const called = !r.is_open && !!r.called_at;
          const noteEdited = !!r.note_updated_at && r.note_updated_at !== r.called_at;
          return (
            <View
              key={r.work_order_id}
              ref={n => { nodes.current[r.work_order_id] = n; }}
              nativeID={`review-low-${r.work_order_id}`}
              collapsable={false}
            >
              <ReviewRowSummary
                row={r}
                lang={lang}
                isLast={i === shown.length - 1}
                highlighted={r.work_order_id === focus}
                titleExtra={days != null ? (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: tones.bad }}>{`${fmtInt(days, lang)} ${autoT('gündür aranmadı')}`}</Text>
                ) : null}
              >
                {called ? (
                  <View style={{ backgroundColor: U.chipNeutral, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Check size={13} color={tones.good} strokeWidth={2.2} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: tones.good }}>{autoT('Arandı')}</Text>
                      <Text style={{ fontSize: 12, color: U.ink[500] }} numberOfLines={1}>
                        {`${sep.trim()} ${r.called_by_name ?? '—'}${sep}${callStamp(r.called_at as string, lang)}`}
                      </Text>
                    </View>
                    {r.call_note ? <Text style={{ fontSize: 12, color: U.ink[700], lineHeight: 17 }}>{r.call_note}</Text> : null}
                    {noteEdited ? (
                      <Text style={{ fontSize: 11, color: U.ink[400] }} numberOfLines={1}>
                        {`${autoT('Not')}${sep}${r.note_updated_by_name ?? '—'}${sep}${callStamp(r.note_updated_at as string, lang)}`}
                      </Text>
                    ) : null}
                  </View>
                ) : r.previous_call && r.called_at ? (
                  <Text style={{ fontSize: 11, color: U.ink[400] }} numberOfLines={2}>
                    {`${autoT('Önceki arama')}${sep}${r.called_by_name ?? '—'}${sep}${callStamp(r.called_at, lang)}${r.call_note ? `${sep}${r.call_note}` : ''}`}
                  </Text>
                ) : null}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  {called ? (
                    <PressScale onPress={() => setModal({ row: r, mode: 'edit' })} style={plainBtn}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Notu düzenle')}</Text>
                    </PressScale>
                  ) : (
                    <>
                      <GlassTooltip text={autoT('Telefon kayıtlı değil')} enabled={!phone}>
                        <PressScale onPress={phone ? () => callClinic(r, phone) : undefined} disabled={!phone} style={darkBtn}>
                          <Phone size={13} color={U.onDarkPill} strokeWidth={2} />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: U.onDarkPill }}>{autoT('Kliniği ara')}</Text>
                        </PressScale>
                      </GlassTooltip>
                      <PressScale onPress={() => setModal({ row: r, mode: 'mark' })} style={plainBtn}>
                        <Check size={13} color={U.plainBtn.fg} strokeWidth={2} />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Arandı')}</Text>
                      </PressScale>
                    </>
                  )}
                  <PressScale onPress={() => router.push(`/${panelBase}/order/${r.work_order_id}` as any)} style={ghostBtn}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }}>{autoT('Siparişe git')}</Text>
                    <GoIcon size={13} color={U.ink[700]} strokeWidth={2} />
                  </PressScale>
                </View>

                {!called && phoneOpen === r.work_order_id && phone ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border }}>
                    <Phone size={13} color={U.ink[500]} strokeWidth={2} />
                    <Text selectable style={{ fontSize: 14, fontWeight: '600', color: U.ink[900], letterSpacing: 0.3 }}>{phone}</Text>
                    <PressScale onPress={() => copyPhone(r.work_order_id, phone)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Copy size={12} color={U.ink[500]} strokeWidth={2} />
                      <Text style={{ fontSize: 12, color: U.ink[500] }}>{copied === r.work_order_id ? autoT('Kopyalandı') : autoT('Kopyala')}</Text>
                    </PressScale>
                  </View>
                ) : null}
              </ReviewRowSummary>
            </View>
          );
        })}
      </MobileTableX>

      <ReviewCallModal
        row={modal?.row ?? null}
        mode={modal?.mode ?? 'mark'}
        onClose={() => setModal(null)}
        onSaved={onChanged}
      />
    </>
  );
}
