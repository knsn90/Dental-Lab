/**
 * RowActionsMenu — satır sonundaki işlemleri tek bir «⋯» düğmesinde toplar.
 *
 * NEDEN: Sipariş listesinde her satırın sonunda üç ayrı yuvarlak düğme
 * (düzenle · pasife al · sil) duruyordu. Üç sorun:
 *   1. Yıkıcı işlem (Sil) her satırda, tek tıkla erişilebilir mesafedeydi —
 *      liste kaydırırken yanlış satırda tıklama riski.
 *   2. 3 × 26px + boşluklar satırın sağından ~90px yiyordu; HASTA/VAKA/HEKİM
 *      sütunları buna karşılık kırpılıyordu ("Figen Şehit…", "Zirko…").
 *   3. İkonlar etiketsizdi; arşiv ile geri-yükle aynı yere denk geliyordu.
 *
 * Menü etiketli olduğu için ne yapıldığı da netleşir.
 *
 * Konumlandırma FilterMenu/OrderStatusInfo ile aynı: `measureInWindow` ile
 * ankraj alınır, ekran kenarına taşarsa kırpılır, altta yer yoksa yukarı açılır.
 */
import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Modal, Platform, Dimensions } from 'react-native';
import { MoreHorizontal } from 'lucide-react-native';

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};
const MENU_W = 208;
const ITEM_H = 40;

export interface RowAction {
  key: string;
  label: string;
  /** Lucide bileşeni (JSX değil) — renk/boyut menü içinde belirlenir. */
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  /** 'danger' kırmızı ve listenin sonunda ayrılır; 'warning' amber. */
  tone?: 'default' | 'warning' | 'danger';
  onPress: () => void;
  disabled?: boolean;
}

const TONE = {
  default: '#1F5689',
  warning: '#92400E',
  danger:  '#9C2E2E',
} as const;

export function RowActionsMenu({ actions, size = 26 }: { actions: RowAction[]; size?: number }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const triggerRef = useRef<any>(null);

  const items = actions.filter(Boolean);
  if (items.length === 0) return null;

  const openMenu = (e?: any) => {
    // Satırın kendi onPress'i (detaya git) tetiklenmesin.
    e?.stopPropagation?.();
    const node = triggerRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x: number, y: number, w: number, h: number) => {
        setAnchor({ x, y, w, h });
        setOpen(true);
      });
    } else {
      setAnchor(null);
      setOpen(true);
    }
  };

  const win = Dimensions.get('window');
  const estH = items.length * ITEM_H + 12;
  // Menü tetikleyicinin SAĞ kenarına hizalanır — satır sonundaki bir düğmede
  // sola hizalamak menüyü ekran dışına taşırıyordu.
  const right = anchor ? Math.max(8, win.width - (anchor.x + anchor.w)) : 12;
  const below = anchor ? anchor.y + anchor.h + 6 : 72;
  const openUp = !!anchor && below + estH > win.height - 12;
  const top = openUp ? Math.max(12, anchor!.y - estH - 6) : below;

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={openMenu}
        hitSlop={6}
        style={({ pressed, hovered }: any) => ({
          width: size, height: size, borderRadius: size / 2,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: hovered || pressed ? 'rgba(15,23,42,0.08)' : 'transparent',
          ...webCursor,
        })}
      >
        <MoreHorizontal size={Math.round(size * 0.62)} color="#6B6B6B" strokeWidth={2} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1 }}>
          <Pressable
            onPress={(e: any) => e?.stopPropagation?.()}
            style={{
              position: 'absolute', top, right, width: MENU_W,
              backgroundColor: '#FFFFFF', borderRadius: 14, padding: 6,
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
              shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
              elevation: 10,
            }}
          >
            {items.map((it, i) => {
              const color = TONE[it.tone ?? 'default'];
              const Icon = it.icon;
              // Yıkıcı işlemi bir ayırıcıyla ayır — kaydırırken parmağın/imlecin
              // yanlışlıkla "Sil"e denk gelmesi en pahalı hata.
              const showDivider = it.tone === 'danger' && i > 0;
              return (
                <React.Fragment key={it.key}>
                  {showDivider && (
                    <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.06)', marginVertical: 4, marginHorizontal: 6 }} />
                  )}
                  <Pressable
                    onPress={(e: any) => { e?.stopPropagation?.(); setOpen(false); it.onPress(); }}
                    disabled={it.disabled}
                    style={({ pressed, hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      height: ITEM_H, paddingHorizontal: 10, borderRadius: 10,
                      backgroundColor: hovered || pressed ? 'rgba(15,23,42,0.05)' : 'transparent',
                      opacity: it.disabled ? 0.45 : 1,
                      ...webCursor,
                    })}
                  >
                    <Icon size={15} color={color} strokeWidth={1.9} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color }}>{it.label}</Text>
                  </Pressable>
                </React.Fragment>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
