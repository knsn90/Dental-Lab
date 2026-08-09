// Klinik/hekim panelinde girişte bir kez açılan ödeme hatırlatması kapısı.
//
// NE ZAMAN AÇILIR: oturum başına EN FAZLA BİR KEZ. Modül seviyesindeki bayrak
// sekmeler arası gezinmede tekrar açılmasını engeller; tam sayfa yenileme /
// yeniden giriş yeni oturum sayılır ve tekrar gösterilir ("her girişte" isteği).
// Kalıcı "bir daha gösterme" bilinçli olarak YOK — istek her girişte görünmesi.
//
// VERİ: my_payment_reminder() RPC'si. Vadesi geçmiş bakiye yoksa satır dönmez ve
// bu bileşen hiçbir şey çizmez — yani borcu olmayan hekim popup görmez.
import React, { useEffect, useState } from 'react';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/authStore';
import { PaymentReminderModal, type ReminderRow } from './PaymentReminderModal';

/** Hangi kullanıcıya gösterildi. Boolean bayrak yerine KİMLİK tutuluyor: aynı
 *  sekmede çıkış yapıp başka bir klinikle girildiğinde bayrak true kalıyor ve
 *  ikinci kullanıcı hatırlatmayı hiç görmüyordu. Kimlik değişince yeniden açılır.
 *  Sayfa yenileme de yeni giriş sayılır — istek "her girişte gösterilsin". */
let shownForUserId: string | null = null;

export function PaymentReminderGate() {
  const [rows, setRows] = useState<ReminderRow[]>([]);
  const [open, setOpen] = useState(false);

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

  if (!open) return null;
  return <PaymentReminderModal visible={open} rows={rows} onClose={() => setOpen(false)} />;
}
