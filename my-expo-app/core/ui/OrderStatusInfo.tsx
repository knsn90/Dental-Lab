// core/ui/OrderStatusInfo.tsx
// Sipariş durumunun yanında küçük bilgilendirme (ⓘ) ikonu — tıklayınca duruma
// özel detay gösterir: teslim edildiyse teslim tarih+saati, duraklatıldıysa
// duraklama nedeni, aksi halde durum + hedef teslim tarihi.
//
// TÜM PANELLERDE kullanılır: accent panelden çözülür (usePanelTheme). core → modules
// bağımlılığı olmasın diye durum etiketleri burada minimal biçimde inline tutulur.

import React, { useState, useRef } from 'react';
import { View, Text, Pressable, Modal, Platform, Dimensions } from 'react-native';
import { Info, X } from 'lucide-react-native';
import { usePanelTheme } from '../theme/usePanelTheme';

export interface OrderStatusInfoOrder {
  status?:        string | null;
  hold_status?:   string | null;
  hold_reason?:   string | null;
  updated_at?:    string | null;
  delivery_date?: string | null;
  delivered_at?:  string | null;
  order_number?:  string | null;
}

const STATUS_LABEL: Record<string, string> = {
  atama_bekleniyor:         'Atama Bekliyor',
  alindi:                   'Alındı',
  kutu_atandi:              'Kutu Atandı',
  uretimde:                 'Üretimde',
  asamada:                  'Üretimde',
  kalite_kontrol:           'Final QC',
  tasarim_onayi_bekleniyor: 'Tasarım Onayı Bekliyor',
  teslimata_hazir:          'Teslime Hazır',
  kurye_bekleniyor:         'Kurye Bekleniyor',
  kuryede:                  'Kuryede',
  teslim_edildi:            'Teslim Edildi',
  iptal:                    'İptal',
};

const pad = (n: number) => String(n).padStart(2, '0');
function fmtDateTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function buildInfo(o: OrderStatusInfoOrder): { title: string; lines: { label: string; value: string }[] } {
  // Duraklatıldı, statü ne olursa olsun önceliklidir (Siparişler listesindeki gösterimle birebir)
  if (o.hold_status === 'on_hold') {
    return {
      title: 'Duraklatıldı',
      lines: [{ label: 'Duraklama nedeni', value: (o.hold_reason && o.hold_reason.trim()) || 'Belirtilmemiş' }],
    };
  }
  const s = o.status ?? '';
  if (s === 'teslim_edildi') {
    return {
      title: 'Teslim Edildi',
      lines: [{ label: 'Teslim tarihi ve saati', value: fmtDateTime(o.delivered_at ?? o.updated_at) ?? '—' }],
    };
  }
  const label = STATUS_LABEL[s] ?? s ?? 'Durum';
  const lines: { label: string; value: string }[] = [{ label: 'Durum', value: label }];
  const dd = fmtDate(o.delivery_date);
  if (dd) lines.push({ label: 'Hedef teslim tarihi', value: dd });
  return { title: label, lines };
}

/**
 * Durum rozetinin yanına konur: <OrderStatusInfo order={order} />
 * Kart satırına tıklamayı engellemek için basış olayı durdurulur.
 */
const CARD_W = 260;

export function OrderStatusInfo({ order, size = 15 }: { order: OrderStatusInfoOrder; size?: number }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const triggerRef = useRef<any>(null);
  const theme = usePanelTheme();
  const accent = theme.primary;
  const info = buildInfo(order);

  const openPopover = (e: any) => {
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

  // Popover konumu — ikonun hemen altına; ekran kenarlarına taşarsa kırp, altta
  // yer yoksa ikonun üstüne aç. Ankraj yoksa (ölçülemezse) üstten güvenli konum.
  const win = Dimensions.get('window');
  const estH = 44 + info.lines.length * 40;
  const left = anchor ? Math.min(Math.max(8, anchor.x - 4), win.width - CARD_W - 8) : 12;
  const below = anchor ? anchor.y + anchor.h + 6 : 72;
  const openUp = !!anchor && below + estH > win.height - 12;
  const top = openUp ? Math.max(12, anchor!.y - estH - 6) : below;

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={openPopover}
        hitSlop={10}
        style={{
          width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        }}
        {...(Platform.OS === 'web' ? { title: 'Durum bilgisi' } : {})}
      >
        <Info size={size} color={accent} strokeWidth={2} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Şeffaf backdrop — dışarı tıklama kapatır; kart ikona ankrajlı */}
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1 }}>
          <Pressable
            onPress={(e: any) => e?.stopPropagation?.()}
            style={{
              position: 'absolute', top, left, width: CARD_W,
              backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 10,
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
              // ağır kart gölgesi (tasarım dili)
              shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
              elevation: 8,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: `${accent}1F`, alignItems: 'center', justifyContent: 'center' }}>
                <Info size={14} color={accent} strokeWidth={2} />
              </View>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#0A0A0A' }} numberOfLines={1}>{info.title}</Text>
              {order.order_number ? (
                <Text style={{ fontSize: 10.5, color: '#9A9A9A', fontVariant: ['tabular-nums'] as any }}>{order.order_number}</Text>
              ) : null}
              <Pressable onPress={() => setOpen(false)} hitSlop={8}><X size={16} color="#9A9A9A" strokeWidth={2} /></Pressable>
            </View>
            {info.lines.map((ln, i) => (
              <View key={i} style={{ gap: 1 }}>
                <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#9A9A9A', letterSpacing: 0.4, textTransform: 'uppercase' }}>{ln.label}</Text>
                <Text style={{ fontSize: 13.5, color: '#1A1A1A', fontWeight: '500' }}>{ln.value}</Text>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
