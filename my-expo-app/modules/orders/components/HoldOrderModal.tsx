/**
 * HoldOrderModal — "İşi beklet" penceresi (madde 13, spec §4.1 ve §4.3).
 *
 * Sipariş detayındaki satır içi pencerenin yerini alır; listedeki "Hekimi bekliyor"
 * eylemi de bunu `mode='awaitDoctor'` ile açar (yalnız hekim/klinik kaynaklı kategoriler,
 * gün alanı en üstte). Bütün günler LAB gününde (cihaz saat dilimi kullanılmaz):
 * bugün `useLabToday()`, sipariş/bekleme günü `labTodayOf(cachedLabTz(), …)`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, Platform, ScrollView, TextInput } from 'react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme, onAccentInk } from '../../../core/theme/usePanelTheme';
import { labTodayOf } from '../../../core/metrics/orderDefs';
import { cachedLabTz, useLabToday } from '../../../core/metrics/useLabToday';
import { Pause } from '../../../core/ui/icons';
import { holdOrder, fetchPrevHoldEndDay, HOLD_PICKABLE, HOLD_CATEGORIES } from '../holdApi';
import { holdStartFloor, validateHoldStart } from '../holdDates';
import { HoldModalHeader, HoldDayField, HoldModalFooter, dayErrText } from './holdModalParts';

const WEB_PTR: any = Platform.OS === 'web' ? { cursor: 'pointer' } : null;

export type HoldOrderModalProps = {
  visible: boolean;
  order: {
    id: string;
    order_number?: string | null;
    created_at: string;
    doctor_id?: string | null;
    clinicId?: string | null;
  };
  mode?: 'full' | 'awaitDoctor';
  onClose(): void;
  onDone(): void;
};

export function HoldOrderModal({ visible, order, mode = 'full', onClose, onDone }: HoldOrderModalProps) {
  const U = useInkUI();
  const accent = usePanelTheme().primary;
  const today = useLabToday();
  const await_ = mode === 'awaitDoctor';
  const cats = useMemo(() => (await_ ? HOLD_PICKABLE.filter((c) => c.responsible === 'client') : HOLD_PICKABLE), [await_]);
  const defaultCat = await_ ? 'client_approval' : 'client_missing_file';

  const [cat, setCat] = useState<string>(defaultCat);
  const [reason, setReason] = useState('');
  const [day, setDay] = useState(today);
  const [prevEnd, setPrevEnd] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Her açılışta temiz başla; önceki beklemenin bitiş günü taban için okunur.
  useEffect(() => {
    if (!visible) return;
    setCat(defaultCat); setReason(''); setDay(today); setErr(null); setBusy(false); setPrevEnd(null);
    let alive = true;
    fetchPrevHoldEndDay(order.id, cachedLabTz()).then((d) => { if (alive) setPrevEnd(d); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, order.id]);

  const createdDay = labTodayOf(cachedLabTz(), new Date(order.created_at));
  const floor = holdStartFloor({ createdDay, prevEndDay: prevEnd });
  const responsible = HOLD_CATEGORIES.find((c) => c.key === cat)?.responsible ?? 'client';

  const submit = async () => {
    if (busy) return;
    const bad = validateHoldStart(day, { floor, today });
    if (bad) { setErr(dayErrText(bad, 'start', prevEnd)); return; }
    setBusy(true); setErr(null);
    const res = await holdOrder({
      orderId: order.id,
      reason,
      category: cat,
      startedOn: day === today ? null : day,
      orderNumber: order.order_number ?? null,
      doctorId: order.doctor_id ?? null,
      clinicId: order.clinicId ?? null,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error ? autoT(res.error) : autoT('Bekletilemedi')); return; }
    onDone();
  };

  const dayField = (
    <HoldDayField
      label={autoT('Ne zamandan beri bekliyor?')}
      value={day}
      onChange={(d) => { setDay(d); setErr(null); }}
      minDate={floor}
      maxDate={today}
      accent={accent}
      hint={day === today
        ? autoT('Bugün başlıyorsa olduğu gibi bırakın.')
        : autoT('Bekleme seçilen günün başından başlamış sayılır.')}
    />
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={U.modalOverlay}>
        <Pressable
          onPress={onClose}
          accessibilityLabel={autoT('Kapat')}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...(Platform.OS === 'web' ? { cursor: 'default' } as any : null) }}
        />
        <View style={[U.modalCard, { maxWidth: 480 }]} accessibilityViewIsModal>
          <HoldModalHeader
            title={await_ ? autoT('Hekimi bekliyor') : autoT('İşi beklet')}
            subtitle={order.order_number ? `#${order.order_number}` : null}
            onClose={onClose}
          />
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 12.5, color: U.ink[500], lineHeight: 18 }}>
              {autoT("Beklerken gecikme sayacı durur. Bekleme hekim/klinik kaynaklıysa devam ettirdiğinde teslim tarihi bekleme süresi kadar ötelenir — gecikme lab'a yazılmaz.")}
            </Text>

            {await_ ? dayField : null}

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[900] }}>{autoT('Neden kategorisi')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {cats.map((c) => {
                  const sel = cat === c.key;
                  const ink = onAccentInk(accent);
                  return (
                    <Pressable
                      key={c.key}
                      onPress={() => setCat(c.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: sel ? 14 : 11, paddingVertical: 8, borderRadius: 999,
                        backgroundColor: sel ? accent : U.chipNeutral,
                        borderWidth: 1, borderColor: sel ? accent : U.hairline, ...WEB_PTR,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: sel ? ink : U.ink[700] }}>{autoT(c.label)}</Text>
                      {!await_ ? (
                        <Text style={{ fontSize: 9.5, fontWeight: '700', color: sel ? ink : U.ink[400], opacity: sel ? 0.8 : 1 }}>
                          {c.responsible === 'client' ? autoT('MÜŞTERİ') : autoT('LAB')}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontSize: 11, color: U.ink[400] }}>
                {responsible === 'client'
                  ? autoT('Müşteri kaynaklı → teslim tarihi ötelenecek, hekime bildirim gider.')
                  : autoT("Lab kaynaklı → teslim tarihi ÖTELENMEZ, gecikme lab'da kalır.")}
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[900] }}>{autoT('Açıklama')}</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder={autoT('Örn: Üst çene taraması eksik, hekimden bekleniyor')}
                placeholderTextColor={U.ink[400]}
                multiline
                style={[U.inputStyle, { height: undefined, minHeight: 72, paddingVertical: 12, fontSize: 13, textAlignVertical: 'top' }]}
              />
            </View>

            {!await_ ? dayField : null}
          </ScrollView>
          <HoldModalFooter
            error={err}
            busy={busy}
            disabled={!reason.trim()}
            accent={accent}
            primaryLabel={autoT('Beklet')}
            primaryBusyLabel={autoT('Bekletiliyor…')}
            primaryHint={autoT('İşi seçilen günden beri beklemede sayar')}
            primaryIcon={Pause}
            onPrimary={submit}
            onCancel={onClose}
          />
        </View>
      </View>
    </Modal>
  );
}
