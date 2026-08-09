// modules/orders/useCopyOrder.ts
// "Bu siparişten yeni oluştur" — tek eylem, üç giriş noktası (sipariş detayı,
// liste satır menüsü, yeni-sipariş ekranındaki "son siparişlerden seç").
//
// Siparişi okur, forma çevirir, global new-order modal'ını prefill ile açar.
// Modal 5 panelin layout'unda zaten mount olduğu için ayrıca yönlendirme gerekmez.

import { useCallback, useState } from 'react';
import { useNewOrderModalStore } from '../../core/store/newOrderModalStore';
import { fetchOrderPrefill } from './prefillFromOrder';
import { toast } from '../../core/ui/Toast';

export function useCopyOrder() {
  const [copying, setCopying] = useState<string | null>(null);
  const openWithPrefill = useNewOrderModalStore(s => s.openWithPrefill);

  const copyOrder = useCallback(async (orderId: string) => {
    if (!orderId || copying) return;
    setCopying(orderId);
    try {
      const prefill = await fetchOrderPrefill(orderId);
      if (!prefill) {
        toast.error('Sipariş kopyalanamadı — kayıt bulunamadı.');
        return;
      }
      openWithPrefill(prefill);
    } catch {
      toast.error('Sipariş kopyalanamadı.');
    } finally {
      setCopying(null);
    }
  }, [copying, openWithPrefill]);

  return { copyOrder, copying };
}
