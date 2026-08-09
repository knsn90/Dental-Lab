/**
 * uiOverlayStore — Global UI overlay tetikleyicileri.
 *
 * notificationsPulse: artarsa, ilgili sayfada (genelde dashboard) NotificationsSheet
 * açılır. Mobile top-action bar'daki Bell butonu bunu tetikler; her panelin
 * dashboard component'i pulse'ı dinler.
 */
import { useEffect } from 'react';
import { create } from 'zustand';

interface UiOverlayState {
  notificationsPulse: number;
  bumpNotifications: () => void;
  /**
   * Ekranın sağ-alt köşesinde yapışkan bir aksiyon çubuğu varsa yüksekliği.
   * Simanty FAB'ı aynı köşede duruyor ve aynı zIndex'te olduğu için çubuğun
   * altında kalıyordu; FAB bu değer kadar yukarı kayar. Çubuğu olan ekran
   * mount'ta set eder, unmount'ta 0'lar.
   */
  bottomBarHeight: number;
  setBottomBarHeight: (h: number) => void;
  /**
   * Simanty FAB'ını gizlemek isteyen ekranların sayısı. Sayaç, iç içe
   * ekranlarda birinin unmount'u diğerini yanlışlıkla geri açmasın diye
   * boolean yerine kullanılır.
   */
  dentyFabSuppress: number;
  pushDentyFabSuppress: () => void;
  popDentyFabSuppress: () => void;
}

export const useUiOverlayStore = create<UiOverlayState>((set) => ({
  notificationsPulse: 0,
  bumpNotifications: () => set((s) => ({ notificationsPulse: s.notificationsPulse + 1 })),
  bottomBarHeight: 0,
  setBottomBarHeight: (h) => set((s) => (s.bottomBarHeight === h ? s : { bottomBarHeight: h })),
  dentyFabSuppress: 0,
  pushDentyFabSuppress: () => set((s) => ({ dentyFabSuppress: s.dentyFabSuppress + 1 })),
  popDentyFabSuppress: () => set((s) => ({ dentyFabSuppress: Math.max(0, s.dentyFabSuppress - 1) })),
}));

/**
 * Sağ-altta yapışkan aksiyon çubuğu olan ekranlar bunu çağırır; Simanty FAB'ı
 * çubuğun üstüne kayar. Ekrandan çıkınca otomatik sıfırlanır.
 *
 *   useBottomActionBar(76);            // çubuk görünürken
 *   useBottomActionBar(visible ? 76 : 0);
 */
export function useBottomActionBar(height: number) {
  const setBottomBarHeight = useUiOverlayStore((s) => s.setBottomBarHeight);
  useEffect(() => {
    setBottomBarHeight(height);
    return () => setBottomBarHeight(0);
  }, [height, setBottomBarHeight]);
}

/**
 * Simanty FAB'ını bu ekran açıkken gizler. Asistanın yapamayacağı bir işin
 * ortasındaki tam ekran/modal akışlar için — orada yer kaplayıp yanlış
 * beklenti yaratıyor.
 *
 * Kök FAB `zIndex: 9999` ile modalların ÜSTÜNDE çizildiği için modal içinde
 * yerel olarak gizlemek yetmez; gizleme global olmak zorunda.
 *
 *   useSuppressDentyFab(isEdit);
 */
export function useSuppressDentyFab(active: boolean) {
  const push = useUiOverlayStore((s) => s.pushDentyFabSuppress);
  const pop  = useUiOverlayStore((s) => s.popDentyFabSuppress);
  useEffect(() => {
    if (!active) return;
    push();
    return () => pop();
  }, [active, push, pop]);
}
