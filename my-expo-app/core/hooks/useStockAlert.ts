import { useEffect, useState } from 'react';
import { supabase } from '../api/supabase';
import { subscribeShared } from '../api/sharedChannel';

/** Returns the count of stock items below their minimum quantity. */
export function useStockAlert() {
  const [count, setCount] = useState(0);

  const load = async () => {
    try {
      // Supabase JS v2'de iki kolon karşılaştırması native desteklenmiyor
      // (.lt('a', 'b') string olarak yorumlanır). Tüm satırları çek + client-side filtre.
      // Genelde stok kalemi sayısı düşüktür (~yüzlerce) → performanssal bir dert değil.
      const { data, error } = await supabase
        .from('stock_items')
        .select('quantity, min_quantity');
      if (error) { setCount(0); return; }
      const low = (data ?? []).filter(
        (r: any) => Number(r.quantity ?? 0) < Number(r.min_quantity ?? 0),
      ).length;
      setCount(low);
    } catch {
      // Tablo henüz oluşturulmamış — badge gösterme
      setCount(0);
    }
  };

  useEffect(() => {
    load();
    // Bu hook üç yerden mount ediliyor (lab layout, admin layout, admin index).
    // Sabit ad tek başına yetmiyor: supabase.channel(ad) her çağrıda YENİ kanal
    // nesnesi döndürür, sunucu tarafında ayrı abonelik açılır. subscribeShared
    // anahtar başına tek kanal tutar. (Ölçüm: stock_items 6 abonelik / 2 kullanıcı.)
    return subscribeShared(
      'stock_alert',
      [{ event: '*', schema: 'public', table: 'stock_items' }],
      load,
    );
  }, []);

  return count;
}
