/**
 * Paylaşılan realtime kanalı — referans sayaçlı.
 *
 * NEDEN VAR (ölçüm 2026-08-03, canlı):
 * `realtime.subscription` tablosunda **74 aktif abonelik** vardı ama bunları açan
 * yalnızca **2 kullanıcı** — kişi başına 37 kanal. Tek başına `order_messages`
 * 30 abonelik taşıyordu ve 30'u da filtresizdi. Realtime bu yüzden toplam DB
 * süresinin **%74'ünü** yiyordu (8.991 sn'nin 6.662 sn'si).
 *
 * Sebep: hook'lar kanal adına `Date.now()`/`Math.random()` koyuyordu. Bu bilerek
 * yapılmıştı — aynı adlı ikinci kanal `.on('postgres_changes', …)` çağrısında
 *   "cannot add `postgres_changes` callbacks ... after `subscribe()`"
 * fırlatıp React ağacını çökertiyordu. Ama çözüm çökmeyi sızıntıyla takas etti:
 * benzersiz ad = hiçbir zaman tekilleşme. Hook 12 yerden mount edildiği için
 * (beş panel layout'u + üst bar + popup + kartlar) her mount ayrı kanal açtı.
 *
 * BURADAKİ ÇÖZÜM: anahtar başına TEK kanal. `.on()` bağlamaları kanal
 * oluşturulurken, `subscribe()`'dan ÖNCE, bir kez yapılır — yani o exception
 * yapısal olarak imkânsız hale gelir. Sonraki aboneler yalnızca bellek içi
 * dinleyici listesine eklenir. Son abone gidince kanal kapanır.
 *
 * DİKKAT: `key` bağlamaları (bindings) BİREBİR belirlemelidir. Aynı anahtarla
 * farklı bindings göndermek sessizce yok sayılır — kanal ilk çağrıda kurulur.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type ChannelBinding = {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema: string;
  table: string;
  filter?: string;
};

type Listener = (payload: any) => void;

type Entry = {
  channel: RealtimeChannel;
  listeners: Set<Listener>;
  refs: number;
  teardown?: ReturnType<typeof setTimeout>;
};

const registry = new Map<string, Entry>();

/**
 * Son abone ayrıldıktan sonra kanalı kapatmadan önce beklenen süre.
 * Panel geçişlerinde eski ekran unmount, yeni ekran mount olur; gecikme olmasa
 * kanal saniyede bir kapanıp açılır ve `realtime.subscription` yine çalkalanır
 * (ölçülen eski hâl: 36.007 ekleme / 35.930 silme).
 */
const TEARDOWN_DELAY_MS = 5000;

export function subscribeShared(
  key: string,
  bindings: ChannelBinding[],
  listener: Listener,
): () => void {
  let entry = registry.get(key);

  if (!entry) {
    const listeners = new Set<Listener>();
    let ch = supabase.channel(key);
    // Bağlamalar subscribe()'dan ÖNCE, yalnız bir kez.
    for (const b of bindings) {
      ch = ch.on('postgres_changes', b as any, (payload: any) => {
        // Bir dinleyicinin hatası diğerlerini düşürmesin.
        listeners.forEach((fn) => { try { fn(payload); } catch { /* yut */ } });
      });
    }
    entry = { channel: ch, listeners, refs: 0 };
    registry.set(key, entry);
    ch.subscribe();
  }

  if (entry.teardown) {
    clearTimeout(entry.teardown);
    entry.teardown = undefined;
  }
  entry.listeners.add(listener);
  entry.refs += 1;

  let released = false;
  return () => {
    if (released) return;            // çift cleanup'a karşı (StrictMode)
    released = true;
    const e = registry.get(key);
    if (!e) return;
    e.listeners.delete(listener);
    e.refs -= 1;
    if (e.refs > 0) return;

    e.teardown = setTimeout(() => {
      const cur = registry.get(key);
      if (!cur || cur.refs > 0) return;   // arada yeni abone geldiyse yaşat
      registry.delete(key);
      supabase.removeChannel(cur.channel);
    }, TEARDOWN_DELAY_MS);
  };
}

/** Teşhis / test için: şu an açık paylaşılan kanallar. */
export function sharedChannelStats(): { key: string; refs: number; listeners: number }[] {
  return Array.from(registry.entries()).map(([key, e]) => ({
    key, refs: e.refs, listeners: e.listeners.size,
  }));
}
