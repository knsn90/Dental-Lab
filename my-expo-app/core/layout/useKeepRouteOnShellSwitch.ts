/**
 * useKeepRouteOnShellSwitch — ekran genişliği 1024px eşiğini geçince sayfayı koru (Y5).
 *
 * NEDEN: panel düzenleri genişliğe göre İKİ AYRI navigator çizer — masaüstünde
 * PatternsShell içindeki <Slot/> (stack), mobilde <Tabs> (tab). İkisi aynı grup
 * rotasının iç durumunu paylaşır. Eşik geçilince iki sorun çıkıyordu (önizlemede
 * ölçüldü, 2026-11-01):
 *  1. ÇÖKME (beyaz ekran): yeni navigator, eskisi söküm temizliğini yapmadan ÇİZİLİR
 *     ve eski türdeki (stack) durumu devralır. Rota parametreleri tüketilmişse (ör.
 *     ekstre /statement/<id>) TabRouter bu durumu olduğu gibi kullanır →
 *     `state.history.filter` → "Cannot read properties of undefined (reading
 *     'filter')" → Uygulama Hatası ekranı.
 *  2. SAYFA KAYBI: çökmeyen durumda yeni navigator index'ten başlar, adres "/" olur.
 *
 * ÇÖZÜM: (1) geçişte bir kare HİÇBİR navigator çizilmez (dönüş `null`) → eski navigator
 * sökülür ve kendi durumunu temizler; yenisi bir sonraki karede temiz başlar.
 * (2) Geçişten önceki son adres saklanır; yeni navigator adresi sıfırlarsa `replace`
 * ile o adrese dönülür (geçmişe kayıt eklenmez).
 *
 * Dönüş: çizilecek kabuk — true masaüstü, false mobil, null geçiş karesi (boş çiz).
 * Düzenin ERKEN RETURN'LERİNDEN ÖNCE çağrılmalı.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter, useUnstableGlobalHref } from 'expo-router';
import { groupHref, restoreStep, splitHref } from './shellSwitchHref';

// Yeni navigator adresi hemen sıfırlamazsa bu süre sonunda izleme bırakılır
const SETTLE_MS = 800;

export function useKeepRouteOnShellSwitch(isDesktop: boolean, group: string): boolean | null {
  const router = useRouter();
  // Yol + sorgu aynı kaynaktan (router deposu) — window.location ile yarışmaz
  const [path, search] = splitHref(useUnstableGlobalHref());
  const href = groupHref(group, path, search);

  const [shell, setShell] = useState(isDesktop);
  const lastHref = useRef(href);                 // geçişten önceki son kararlı adres
  const restoreTo = useRef<string | null>(null);
  const prevDesktop = useRef(isDesktop);

  // Geçiş ANI (render sırasında): adres henüz eski — dönülecek adresi sakla
  if (prevDesktop.current !== isDesktop) {
    prevDesktop.current = isDesktop;
    restoreTo.current = lastHref.current;
  }

  // (1) Geçiş karesi çizildi, eski navigator söküldü → yenisini bir sonraki karede kur
  useEffect(() => {
    if (shell === isDesktop) return;
    const t = setTimeout(() => setShell(isDesktop), 0);
    return () => clearTimeout(t);
  }, [isDesktop, shell]);

  // (2) Yeni navigator kurulunca sayfaya geri dön
  const mounted = shell === isDesktop;
  useEffect(() => {
    const target = restoreTo.current;
    switch (restoreStep(target, href, mounted)) {
      case 'track':
        lastHref.current = href;
        return;
      case 'hold':
        return;
      case 'settle': {
        const t = setTimeout(() => { restoreTo.current = null; }, SETTLE_MS);
        return () => clearTimeout(t);
      }
      case 'replace': {
        const t = setTimeout(() => {
          restoreTo.current = null;
          router.replace(target as any);
        }, 0);
        return () => clearTimeout(t);
      }
    }
  }, [href, mounted, router]);

  return mounted ? shell : null;
}
