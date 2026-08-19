/**
 * useRevisionParents — özet listelerindeki "eksik ebeveyn" boşluğunu kapatır.
 *
 * Dashboard'lar yalnızca son N siparişi çeker. Bir revizyon pencereye girip
 * ebeveyni dışarıda kalabilir; o zaman revizyon köksüz görünür ve alt-liste
 * kurulamaz. Bu hook eksik ebeveynleri tek ek sorguyla getirir.
 *
 * Yalnız geçmiş satırında gösterilen alanlar çekilir (numara + durum + tarih),
 * tam LIST_SELECT değil — geri getirilen kayıt hiçbir zaman "anchor" olmaz,
 * çünkü revizyonun revision_no'su daha yüksektir.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../core/api/supabase';
import { missingParentIds, type RevisionGroupable } from '../revisionGroups';

const PARENT_SELECT =
  'id, order_number, status, hold_status, delivery_date, work_type, patient_name, revision_of_id, revision_no, continues_order_id';

export function useRevisionParents<T extends RevisionGroupable>(rows: T[]): any[] {
  const [parents, setParents] = useState<any[]>([]);

  const ids = useMemo(() => missingParentIds(rows ?? []), [rows]);
  // Dizi kimliği her render değiştiği için efekt anahtarı stabil string olmalı
  const key = ids.join(',');

  useEffect(() => {
    let alive = true;
    if (!key) { setParents(p => (p.length ? [] : p)); return; }
    (async () => {
      const { data, error } = await supabase
        .from('work_orders')
        .select(PARENT_SELECT)
        .in('id', key.split(','));
      if (!alive) return;
      // Hata durumunda sessizce boş bırak — liste revizyonu köksüz gösterir,
      // çökme yerine düşük bilgi tercih edilir.
      setParents(error ? [] : (data ?? []));
    })();
    return () => { alive = false; };
  }, [key]);

  // Ebeveyn satırı yalnız PARENT_SELECT alanlarını taşır — hekim adı (lab'da
  // `doctor` objesi, adminde `doctor_name`) ve klinik logosu ayrı sorgudan
  // geliyor ve bu satıra hiç uğramıyordu → tabloda "ORİJİNAL" satırı boş hekim
  // + '--' avatar ile çiziliyordu. Revizyon çocuğu aynı hekim/klinikten
  // kopyalandığı için görsel alanları ondan devral.
  //
  // `clinic_logo_url` DA devralınmalı: ismi devralıp logoyu unutmak, ORİJİNAL
  // satırlarında logonun yerine hekim adının baş harflerini ("Dr. Aylin" → DA)
  // bırakıyordu. Aynı klinikten gelen iki satır yan yana farklı avatar
  // gösterdiği için logo "siliniyor" gibi görünüyordu.
  //
  // Ayrıca: `parents` efekt state'i olduğu için `rows` bir render önde olabilir;
  // ebeveyn pencereye girdiği anda aynı id iki kez listelenip React "duplicate
  // key" hatası veriyordu. Zaten listede olanları ele.
  return useMemo(() => {
    const have = new Set((rows ?? []).map((r: any) => r.id));
    return parents
      .filter((p: any) => !have.has(p.id))
      .map((p: any) => {
        const child: any = (rows ?? []).find((r: any) => (r as any).revision_of_id === p.id || (r as any).continues_order_id === p.id);
        if (!child) return p;
        return {
          doctor: child.doctor,
          doctor_name: child.doctor_name,
          clinic_logo_url: child.clinic_logo_url,
          ...p,
        };
      });
  }, [parents, rows]);
}
