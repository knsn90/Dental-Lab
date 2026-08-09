// modules/orders/useContinuationOrder.ts
// "Devam Siparişi" — teslim edilmiş bir işin planlı devamını (ör. geçici→nihai)
// yeni-sipariş formunda önceden-dolu açar.
//   • hasta bilgisi + dişler taşınır (iş tipi/materyal boş → nihai seçilir)
//   • continues_order_id set edilir → sipariş oluşunca tedavi zinciri bağlanır
//   • REVİZYON DEĞİL: normal (tam ücretli) yeni sipariş; kalite KPI'ına sayılmaz
//
// Açma deseni panele/platforma göre (mevcut "Yeni İş Emri" akışıyla birebir):
//   • Mobil → global new-order modal (openWithPrefill: open + prefill)
//   • Desktop → sidebar korunacak şekilde /<panel>/new-order route'una git
//     (NewOrderScreen store'daki prefill'i okur, bkz. effectivePrefill).

import { useCallback, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useNewOrderModalStore } from '../../core/store/newOrderModalStore';
import { useIsDesktop } from '../../core/layout/PatternsShell';
import { fetchContinuationPrefill } from './prefillFromOrder';
import { toast } from '../../core/ui/Toast';

// Aktif panel segment'i → new-order route öneki. Bilinmeyen segment lab'a düşer.
const PANEL_NEW_ORDER: Record<string, string> = {
  '(lab)':    '/(lab)/new-order',
  '(admin)':  '/(admin)/new-order',
  '(doctor)': '/(doctor)/new-order',
  '(clinic)': '/(clinic)/new-order',
};

export function useContinuationOrder() {
  const [starting, setStarting] = useState<string | null>(null);
  const openWithPrefill = useNewOrderModalStore(s => s.openWithPrefill);
  const stagePrefill    = useNewOrderModalStore(s => s.stagePrefill);
  const router = useRouter();
  const segments = useSegments() as string[];
  const isDesktop = useIsDesktop();

  const startContinuation = useCallback(async (orderId: string) => {
    if (!orderId || starting) return;
    setStarting(orderId);
    try {
      const prefill = await fetchContinuationPrefill(orderId);
      if (!prefill) {
        toast.error('Devam siparişi açılamadı — kayıt bulunamadı.');
        return;
      }
      if (isDesktop) {
        // Desktop: modal AÇMA (route akışı) — prefill'i hazırla, route'a git.
        // Yeni-sipariş modal'ı web'de de overlay açar; open:true burada çift-açılma
        // yaratırdı. NewOrderScreen route'ta store'daki prefill'i okur.
        stagePrefill(prefill);
        const target = PANEL_NEW_ORDER[segments?.[0] ?? ''] ?? PANEL_NEW_ORDER['(lab)'];
        router.push(target as any);
      } else {
        // Mobil: global modal'ı prefill ile aç.
        openWithPrefill(prefill);
      }
    } catch {
      toast.error('Devam siparişi açılamadı.');
    } finally {
      setStarting(null);
    }
  }, [starting, openWithPrefill, stagePrefill, isDesktop, router, segments]);

  return { startContinuation, starting };
}
