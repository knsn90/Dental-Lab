// Klinik/hekim panelinde girişte bir kez açılan ödeme hatırlatması kapısı.
//
// NE ZAMAN AÇILIR: oturum başına EN FAZLA BİR KEZ. Modül seviyesindeki bayrak
// sekmeler arası gezinmede tekrar açılmasını engeller; tam sayfa yenileme /
// yeniden giriş yeni oturum sayılır ve tekrar gösterilir ("her girişte" isteği).
// Kalıcı "bir daha gösterme" bilinçli olarak YOK — istek her girişte görünmesi.
//
// VERİ: my_payment_reminder() RPC'si. Vadesi geçmiş bakiye yoksa satır dönmez ve
// bu bileşen hiçbir şey çizmez — yani borcu olmayan hekim popup görmez.
//
// KARTLA ÖDE (2026-10-19): hatırlatmadan doğrudan kart formuna geçilir. Tek para
// birimi → vadesi geçmiş tutar için toplu ödeme açılır (en eski vadeden başlar),
// kart formu modalde gelir. Birden çok para birimi → toplu ödeme penceresi
// (para birimi/tutar seçimi). Ödeme modülü yalnız düğmeye basılınca yüklenir.

import React, { useEffect, useState } from 'react';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/authStore';
import { autoT } from '../i18n/autoTranslate';
import { PaymentReminderModal, type ReminderRow } from './PaymentReminderModal';
import { useTourBlocker } from '../onboarding/useTourBlocker';

/** Hangi kullanıcıya gösterildi. Boolean bayrak yerine KİMLİK tutuluyor: aynı
 *  sekmede çıkış yapıp başka bir klinikle girildiğinde bayrak true kalıyor ve
 *  ikinci kullanıcı hatırlatmayı hiç görmüyordu. Kimlik değişince yeniden açılır.
 *  Sayfa yenileme de yeni giriş sayılır — istek "her girişte gösterilsin". */
let shownForUserId: string | null = null;

type LazyComp = React.ComponentType<any> | null;

export function PaymentReminderGate() {
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [open, setOpen] = useState(false);
  // Hatırlatma açıkken ilk-giriş turu bekler (tur pencerenin üstüne binmesin).
  useTourBlocker(open);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [payToken, setPayToken] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [Sheet, setSheet] = useState<LazyComp>(null);
  const [Bulk, setBulk] = useState<LazyComp>(null);

  // OTURUMU BEKLE. Panel kabuğu optimistik yönlendirmeyle profil/oturum hazır
  // olmadan monte oluyor; RPC o anda çağrılırsa auth.uid() null olur, sorgu boş
  // döner ve effect bir daha çalışmadığı için popup HİÇ açılmaz. Tam olarak bu
  // yaşandı: RPC sunucuda satır döndürürken ekranda hiçbir şey görünmedi.
  const userId = useAuthStore((st) => st.session?.user?.id ?? null);

  useEffect(() => {
    if (!userId || shownForUserId === userId) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase.rpc('my_payment_reminder');
      if (!alive) return;
      if (error) { console.warn('[payment-reminder]', error.message); return; }
      const list = (data ?? []) as ReminderRow[];
      if (!list.length) return;
      shownForUserId = userId;
      setRows(list);
      setOpen(true);
    })();
    return () => { alive = false; };
  }, [userId]);

  const openSheet = async (token: string) => {
    const m = await import('../../modules/payments/components/PaymentSheetModal');
    setSheet(() => m.PaymentSheetModal);
    setOpen(false);
    setPayToken(token);
  };

  const handlePay = async () => {
    if (payBusy) return;
    setPayError(null);
    setPayBusy(true);
    try {
      if (rows.length === 1) {
        const row = rows[0];
        const { startMyBulkPayment } = await import('../../modules/payments/api');
        const r = await startMyBulkPayment(row.currency, Math.round((Number(row.overdue_amount) || 0) * 100) / 100);
        if (r.error || !r.token) { setPayError(autoT(r.error ?? 'Ödeme başlatılamadı')); return; }
        await openSheet(r.token);
      } else {
        // Birden çok para birimi: hangisinin ödeneceğini kullanıcı seçsin.
        const m = await import('../../modules/finance-clinic/components/BulkPayModal');
        setBulk(() => m.BulkPayModal);
        setOpen(false);
        setBulkOpen(true);
      }
    } catch (e: any) {
      setPayError(autoT('Ödeme başlatılamadı'));
      console.warn('[payment-reminder] pay', e?.message ?? e);
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <>
      {open ? (
        <PaymentReminderModal
          visible={open}
          rows={rows}
          onClose={() => setOpen(false)}
          onPay={handlePay}
          payBusy={payBusy}
          payError={payError}
        />
      ) : null}
      {Bulk ? (
        <Bulk
          visible={bulkOpen}
          onClose={() => setBulkOpen(false)}
          onStarted={(token: string) => { setBulkOpen(false); void openSheet(token); }}
        />
      ) : null}
      {Sheet ? (
        <Sheet
          token={payToken}
          onClose={() => setPayToken(null)}
          onPaid={() => setPayToken(null)}
        />
      ) : null}
    </>
  );
}
