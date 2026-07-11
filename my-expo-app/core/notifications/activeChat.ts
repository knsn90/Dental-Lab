/**
 * activeChat.ts — o an EKRANDA AÇIK olan sohbet thread'inin work_order_id'si.
 *
 * Kullanıcı bir iş emrinin sohbetini açıkken (useChatMessages mount'lu) o thread'e
 * gelen yeni mesaj için in-app toast GÖSTERİLMEZ — kullanıcı zaten okuyor.
 * useChatMessages mount'ta set eder, unmount'ta temizler; tüm thread yüzeyleri
 * (B5 mobil popup, sipariş-detay Mesaj sekmesi, desktop) aynı hook'u kullandığı
 * için tek noktadan kapsanır.
 */
let activeOrderId: string | null = null;

export function setActiveChatOrder(id: string | null) {
  activeOrderId = id;
}

export function getActiveChatOrder(): string | null {
  return activeOrderId;
}
