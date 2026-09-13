/**
 * FilterMenu — tetikleyiciye ankrajlı seçim menüsü.
 *
 * NEDEN: Uzun seçenek listeleri (6 materyal, 5 sıralama) yan yana pill olarak
 * dizilince araç çubuğu üç satıra taşıyordu. Ekranın üstü filtrelerle dolup
 * asıl içerik aşağı itiliyordu. Az kullanılan seçenekler bir tık geriye alınır;
 * seçili olan tetikleyicide görünür — yani hiçbir bilgi kaybolmaz, yalnız
 * yer kaplamaz.
 *
 * Tetikleyici seçiliyi taşır:  «Materyal · Tümü ▾»
 *
 * Konumlandırma OrderStatusInfo ile aynı: measureInWindow ile ankraj alınır,
 * ekran kenarına taşarsa kırpılır, altta yer yoksa yukarı açılır.
 */

import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Modal, Platform, Dimensions, ScrollView } from 'react-native';
import { ChevronDown, Check } from './icons';
import { useMobileTokens } from '../theme/mobileDesignTokens';

const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};
const MENU_W = 220;

export interface FilterMenuItem {
  key: string;
  label: string;
}

interface Props {
  /** Tetikleyicideki sabit etiket — «Materyal», «Sırala» */
  label: string;
  items: FilterMenuItem[];
  active: string;
  onChange: (key: string) => void;
  /** Seçili öğe accent'i (tik + vurgu). Verilmezse nötr mürekkep. */
  accent?: string;
}

export function FilterMenu({ label, items, active, onChange, accent }: Props) {
  const T = useMobileTokens();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const triggerRef = useRef<any>(null);

  const current = items.find(i => i.key === active);
  const tint = accent ?? T.ink;

  const openMenu = () => {
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
  const estH = Math.min(items.length * 40 + 12, 320);
  const left = anchor ? Math.min(Math.max(8, anchor.x), win.width - MENU_W - 8) : 12;
  const below = anchor ? anchor.y + anchor.h + 6 : 72;
  const openUp = !!anchor && below + estH > win.height - 12;
  const top = openUp ? Math.max(12, anchor!.y - estH - 6) : below;

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={openMenu}
        style={({ pressed }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingStart: 12, paddingEnd: 9, paddingVertical: 7,
          borderRadius: 9999,
          backgroundColor: T.cardSoft,
          opacity: pressed ? 0.65 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
          ...webCursor,
        })}
      >
        <Text style={{ fontSize: 12, fontWeight: '500', color: T.ink3 }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: T.ink }} numberOfLines={1}>
          {current?.label ?? '—'}
        </Text>
        <ChevronDown size={13} color={T.ink3} strokeWidth={2} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Şeffaf backdrop — dışarı tıklama kapatır */}
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1 }}>
          <Pressable
            onPress={(e: any) => e?.stopPropagation?.()}
            style={{
              position: 'absolute', top, left, width: MENU_W, maxHeight: 320,
              backgroundColor: T.card, borderRadius: 16, padding: 6,
              borderWidth: 1, borderColor: T.hairline,
              shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {items.map(it => {
                const on = it.key === active;
                return (
                  <Pressable
                    key={it.key}
                    onPress={() => { onChange(it.key); setOpen(false); }}
                    style={({ pressed }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11,
                      // Seçili satır: %7 alfa beyaz kart üzerinde neredeyse görünmüyordu.
                      // Belirgin ama ağır olmayan bir zemin + accent metin ile ayrışsın.
                      backgroundColor: on ? tint + '1F' : pressed ? T.cardSoft : 'transparent',
                      ...webCursor,
                    })}
                  >
                    <Text style={{
                      flex: 1, fontSize: 13,
                      fontWeight: on ? '700' : '500',
                      color: on ? tint : T.ink2,
                    }}>
                      {it.label}
                    </Text>
                    {on ? <Check size={14} color={tint} strokeWidth={2.4} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default FilterMenu;
