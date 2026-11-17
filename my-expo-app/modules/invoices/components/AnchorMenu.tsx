/**
 * AnchorMenu — tetikleyiciye yaslı küçük menü (sıralama, satır "⋯", hero "⋯").
 * Sağlık Kurumları ve Faturalar listesi ortak kullanır.
 */
import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Modal, Platform, Dimensions } from 'react-native';
import { Check } from '../../../core/ui/icons';
import { useInkUI } from '../../../core/theme/inkScale';

/** Tetikleyiciye yaslı küçük menü (sıralama, satır "⋯"). */
export function AnchorMenu({ items, width = 220, renderTrigger }: {
  items: { key: string; label: string; icon?: React.ComponentType<any>; active?: boolean; onPress: () => void }[];
  width?: number;
  renderTrigger: (open: () => void) => React.ReactNode;
}) {
  const U = useInkUI();
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const ref = useRef<any>(null);
  const open = () => {
    const node = ref.current;
    if (node?.measureInWindow) node.measureInWindow((x: number, y: number, w: number, h: number) => { setAnchor({ x, y, w, h }); setVisible(true); });
    else { setAnchor(null); setVisible(true); }
  };
  const win = Dimensions.get('window');
  const estH = items.length * 44 + 12;
  const right = anchor ? Math.max(8, win.width - (anchor.x + anchor.w)) : 12;
  const below = anchor ? anchor.y + anchor.h + 6 : 72;
  const top = anchor && below + estH > win.height - 12 ? Math.max(12, anchor.y - estH - 6) : below;
  return (
    <>
      <View ref={ref} collapsable={false}>{renderTrigger(open)}</View>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable onPress={() => setVisible(false)} style={{ flex: 1 }}>
          <Pressable
            onPress={(e: any) => e?.stopPropagation?.()}
            style={{
              position: 'absolute', top, right, width, padding: 6, borderRadius: 14,
              backgroundColor: U.surface, borderWidth: 1, borderColor: U.hairline,
              shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 10,
            }}
          >
            {items.map(it => {
              const Icon = it.icon;
              return (
                <Pressable
                  key={it.key}
                  onPress={() => { setVisible(false); it.onPress(); }}
                  style={({ pressed, hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 10,
                    borderRadius: 10, backgroundColor: hovered || pressed ? U.rowHover : 'transparent',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  {Icon ? <Icon size={15} color={U.ink[700]} strokeWidth={1.9} /> : null}
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: it.active ? '700' : '600', color: U.ink[900] }}>{it.label}</Text>
                  {it.active ? <Check size={14} color={U.ink[900]} strokeWidth={2.2} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
