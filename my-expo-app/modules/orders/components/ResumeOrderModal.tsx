/**
 * ResumeOrderModal — "Devam ettir" penceresi (madde 13, spec §4.2).
 *
 * İki gün: Başlangıç (açık beklemenin lab günü; yalnız daha erkene çekilir) ve
 * "Parça / onay ne zaman geldi?" (varsayılan bugün). Önizleme uzatmayı ve hekim/klinik
 * kaynaklıysa yeni teslim gününü gösterir. Değiştirilmeyen gün RPC'ye gönderilmez.
 * Prova beklemesinde açılmaz (çağıran gizler; sunucu da reddeder).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, Platform, ScrollView } from 'react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { labTodayOf } from '../../../core/metrics/orderDefs';
import { cachedLabTz, useLabToday } from '../../../core/metrics/useLabToday';
import { Play } from '../../../core/ui/icons';
import { resumeOrder, fetchPrevHoldEndDay, holdCategoryLabel } from '../holdApi';
import {
  holdStartFloor, validateResumeStart, validateHoldEnd, holdExtensionDays, shiftedDelivery,
} from '../holdDates';
import { HoldModalHeader, HoldDayField, HoldModalFooter, dayErrText, fmtHoldDay } from './holdModalParts';

export type ResumeOrderModalProps = {
  visible: boolean;
  order: {
    id: string;
    order_number?: string | null;
    created_at: string;
    delivery_date: string;
    hold_started_at: string;
    hold_responsible?: string | null;
    hold_category?: string | null;
    hold_reason?: string | null;
  };
  onClose(): void;
  onDone(extendedDays: number): void;
};

export function ResumeOrderModal({ visible, order, onClose, onDone }: ResumeOrderModalProps) {
  const U = useInkUI();
  const accent = usePanelTheme().primary;
  const today = useLabToday();
  const tz = cachedLabTz();
  const origStart = labTodayOf(tz, new Date(order.hold_started_at));
  const createdDay = labTodayOf(tz, new Date(order.created_at));
  const responsible: 'client' | 'lab' = order.hold_responsible === 'lab' ? 'lab' : 'client';

  const [start, setStart] = useState(origStart);
  const [end, setEnd] = useState(today);
  const [prevEnd, setPrevEnd] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setStart(origStart); setEnd(today); setErr(null); setBusy(false); setPrevEnd(null);
    let alive = true;
    fetchPrevHoldEndDay(order.id, cachedLabTz()).then((d) => { if (alive) setPrevEnd(d); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, order.id, order.hold_started_at]);

  const floor = holdStartFloor({ createdDay, prevEndDay: prevEnd });
  const ext = holdExtensionDays(start, end);
  const delivery = (order.delivery_date || '').slice(0, 10);
  const newDelivery = delivery ? shiftedDelivery(delivery, ext, responsible) : '';

  const submit = async () => {
    if (busy) return;
    const badStart = validateResumeStart(start, { currentStart: origStart, floor, today });
    if (badStart) { setErr(dayErrText(badStart, 'start', prevEnd)); return; }
    const badEnd = validateHoldEnd(end, { startDay: start, today });
    if (badEnd) { setErr(dayErrText(badEnd, 'end')); return; }
    setBusy(true); setErr(null);
    const res = await resumeOrder(order.id, {
      startedOn: start === origStart ? null : start,
      endedOn: end === today ? null : end,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error ? autoT(res.error) : autoT('Devam ettirilemedi')); return; }
    onDone(res.extendedDays ?? 0);
  };

  const reasonLine = [autoT(holdCategoryLabel(order.hold_category)), order.hold_reason?.trim() || null]
    .filter(Boolean).join(' — ');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={U.modalOverlay}>
        <Pressable
          onPress={onClose}
          accessibilityLabel={autoT('Kapat')}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...(Platform.OS === 'web' ? { cursor: 'default' } as any : null) }}
        />
        <View style={[U.modalCard, { maxWidth: 440 }]} accessibilityViewIsModal>
          <HoldModalHeader
            title={autoT('Devam ettir')}
            subtitle={[order.order_number ? `#${order.order_number}` : null, reasonLine || null].filter(Boolean).join(' · ')}
            onClose={onClose}
          />
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
            <HoldDayField
              label={autoT('Başlangıç')}
              value={start}
              onChange={(d) => { setStart(d); setErr(null); if (end < d) setEnd(d); }}
              minDate={floor}
              maxDate={origStart}
              accent={accent}
              hint={autoT('Bekleme daha önce başladıysa daha erken bir gün seçin.')}
            />
            <HoldDayField
              label={autoT('Parça / onay ne zaman geldi?')}
              value={end}
              onChange={(d) => { setEnd(d); setErr(null); }}
              minDate={start}
              maxDate={today}
              accent={accent}
            />

            {/* Önizleme: uzatma + yeni teslim günü */}
            <View style={{ borderRadius: 14, padding: 12, gap: 4, backgroundColor: U.surfaceSoft, borderWidth: 1, borderColor: U.hairline }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: U.ink[900], fontVariant: ['tabular-nums'] }}>
                {ext > 0 ? `+${ext} ${autoT('gün')}` : autoT('Uzatma yok')}
              </Text>
              <Text style={{ fontSize: 12, color: U.ink[500] }}>
                {responsible === 'lab'
                  ? autoT('Teslim tarihi değişmez')
                  : newDelivery
                    ? `${autoT('Yeni teslim')}: ${fmtHoldDay(newDelivery)}`
                    : autoT('Teslim tarihi değişmez')}
              </Text>
            </View>
          </ScrollView>
          <HoldModalFooter
            error={err}
            busy={busy}
            accent={accent}
            primaryLabel={autoT('Devam ettir')}
            primaryBusyLabel={autoT('Devam ettiriliyor…')}
            primaryHint={autoT('Beklemeyi seçilen günde kapatır; hekim/klinik kaynaklıysa teslim tarihi ötelenir')}
            primaryIcon={Play}
            onPrimary={submit}
            onCancel={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}
