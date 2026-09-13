/**
 * lazyRoute — Expo Router route dosyalarını ayrı chunk'a böler.
 *
 * Kullanım:
 *   export default lazyRoute(() => import('../../modules/x/X'), 'XScreen');
 *
 * Yerel state'li route wrapper içinden de kullanılabilir:
 *   const LazyX = lazyRoute(() => import('../../modules/x/X'), 'XScreen');
 *   return <LazyX panel="admin" />;
 *
 * ── NEDEN React.lazy + Suspense KULLANMIYORUZ ──────────────────────────────
 * Kullanıldığında sayfalar "Yükleniyor…"da DONUYORDU. Ölçüm net: chunk isteği
 * 200 dönüyor (3 ms, disk cache), modül hazır — ama ekran açılmıyor. Başka bir
 * sayfaya gidip dönünce ya da sayfa yenilenince aynı anda açılıyor. Yani React
 * askıya alınmış ağacı yeniden DENEMİYOR; dışarıdan bir güncelleme gelene kadar
 * bekliyor (ekran gizli/offscreen sayılan bir kapta durduğunda bu olur).
 * Önce Siparişler'de, sonra diğer tüm lazy sayfalarda görüldü.
 *
 * Çözüm: Suspense'i tamamen çıkardık. Modül düz `useState` ile yükleniyor —
 * state güncellemesi HER ZAMAN yeniden render planlar, askıda kalacak bir şey
 * kalmıyor. Kod bölme (ayrı chunk) aynen korunuyor; değişen yalnız bekleme
 * mekanizması.
 */
import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { bootMark } from './debug/bootTrace';
import { maybeReloadOnChunkError } from './ui/RootErrorBoundary';
import { useThemeModeStore } from './store/themeModeStore';

/** Chunk yüklenirken gösterilen iskelet.
 *
 *  ÖNCEDEN `fallback={null}` idi: sayfa chunk gelene kadar TAMAMEN boş kalıyordu
 *  ve kullanıcı bunu "sayfa açılmıyor" olarak görüyordu. */
function RouteFallback() {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 10, backgroundColor: isDark ? '#0E0E0E' : 'transparent' }}>
      <ActivityIndicator color="#9A9A9A" />
      <Text style={{ fontSize: 12.5, color: '#9A9A9A' }}>Yükleniyor…</Text>
    </View>
  );
}

export function lazyRoute<P = any>(
  loader: () => Promise<any>,
  exportName?: string,
): React.ComponentType<P> {
  const name = exportName ?? 'default';
  // Modül bir kez yüklenir ve paylaşılır: aynı rotaya ikinci girişte tekrar
  // indirilmez, bileşen anında hazır olur.
  let cached: React.ComponentType<any> | null = null;
  let inFlight: Promise<React.ComponentType<any>> | null = null;

  function load(): Promise<React.ComponentType<any>> {
    if (inFlight) return inFlight;
    const t0 = Date.now();
    bootMark(`chunk istendi: ${name}`);
    inFlight = loader()
      .then((mod: any) => {
        bootMark(`chunk GELDİ: ${name}`, { ms: Date.now() - t0 });
        // Adlandırılmış export bulunamazsa default'a düş — modül grafiği bayat
        // kaldığında React "resolves to undefined" ile tüm sayfayı çökertiyordu.
        const C = (exportName ? mod[exportName] : undefined) ?? mod.default ?? mod;
        cached = C as React.ComponentType<any>;
        return cached;
      })
      .catch((e: any) => {
        inFlight = null;                       // tekrar denenebilsin
        bootMark(`chunk HATA: ${name}`, { msg: String(e?.message ?? e).slice(0, 120) });
        // Deploy sonrası ESKİ chunk adları 404 olur (Vercel yalnız güncel
        // deploy'un dosyalarını sunar; ölçüldü) ve açık sekmeler kilitlenir.
        // Tek seferlik yenileme ile kurtarıyoruz (20 sn koruması döngüyü keser).
        maybeReloadOnChunkError(e);
        throw e;
      });
    return inFlight;
  }

  return function LazyRouteWrapper(props: P) {
    const [Comp, setComp] = React.useState<React.ComponentType<any> | null>(() => cached);

    React.useEffect(() => {
      if (Comp) return;
      let alive = true;
      load().then(
        (C) => { if (alive) setComp(() => C); },
        () => { /* hata zaten loglandı + kurtarma denendi */ },
      );
      return () => { alive = false; };
    }, [Comp]);

    if (!Comp) return <RouteFallback />;
    return <Comp {...(props as any)} />;
  };
}
