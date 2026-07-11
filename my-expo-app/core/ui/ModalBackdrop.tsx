/**
 * ModalBackdrop — proje geneli standart modal arka planı.
 *
 * Kullanım:
 *   <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
 *     <ModalBackdrop onClose={close}>
 *       <ModalCard maxWidth={520}>
 *         …içerik…
 *       </ModalCard>
 *     </ModalBackdrop>
 *   </Modal>
 *
 * Ya da daha düşük seviyeli:
 *   <View style={[MODAL_OVERLAY_WEB, { flex:1, alignItems:'center', justifyContent:'center' }]}>…</View>
 */

import React from 'react';
import { Pressable, Platform, type ViewStyle } from 'react-native';

/* ─── Sabit tokenlar ──────────────────────────────────────────────────── */

/** Backdrop rengi — koyu + blur on web. */
export const MODAL_BACKDROP_COLOR = 'rgba(10,14,26,0.42)';

/**
 * Web'de `backdropFilter: blur` ekler; native'de sadece backgroundColor.
 * Hem `View style={...}` hem de `StyleSheet.create` içinde spread edilebilir.
 */
export const MODAL_OVERLAY_WEB: any =
  Platform.OS === 'web'
    ? {
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }
    : {};

/** Inline style yaklaşımı isteyenler için tam backdrop stili. */
export const modalBackdropStyle: ViewStyle = {
  flex: 1,
  backgroundColor: MODAL_BACKDROP_COLOR,
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  ...MODAL_OVERLAY_WEB,
};

/** Modal kart shadow'u — web boxShadow / native elevation. */
export const modalCardShadow: any = Platform.OS === 'web'
  ? { boxShadow: '0 24px 60px rgba(0,0,0,0.30)' }
  : { elevation: 24 };

/* ─── ModalBackdrop bileşeni ──────────────────────────────────────────── */

type BackdropProps = {
  children: React.ReactNode;
  onClose?: () => void;
  /** İçerik konumlandırma — varsayılan center */
  align?: 'center' | 'bottom' | 'top';
  /** Padding ayarı — küçük telefon için 12, default 16 */
  padding?: number;
};

export function ModalBackdrop({ children, onClose, align = 'center', padding = 16 }: BackdropProps) {
  const justifyContent: ViewStyle['justifyContent'] =
    align === 'bottom' ? 'flex-end'
    : align === 'top'  ? 'flex-start'
    : 'center';
  return (
    <Pressable
      onPress={onClose}
      style={{
        flex: 1,
        backgroundColor: MODAL_BACKDROP_COLOR,
        alignItems: 'center',
        justifyContent,
        padding,
        ...MODAL_OVERLAY_WEB,
      }}
    >
      {/* İçerik kapsülü — backdrop tıklamasını yutar */}
      <Pressable onPress={(e) => e.stopPropagation()} style={{ width: '100%', alignItems: 'center' }}>
        {children}
      </Pressable>
    </Pressable>
  );
}

/* ─── ModalCard (opsiyonel yardımcı) ──────────────────────────────────── */

type ModalCardProps = {
  children: React.ReactNode;
  maxWidth?: number;
  /** Yüzde olarak max yükseklik — varsayılan '92%' */
  maxHeight?: number | string;
  /** Köşe radius — varsayılan 22 */
  radius?: number;
  /** Card style override */
  style?: ViewStyle;
};

export function ModalCard({ children, maxWidth = 560, maxHeight = '92%', radius = 22, style }: ModalCardProps) {
  return (
    <Pressable
      onPress={(e) => e.stopPropagation()}
      style={{
        width: '100%',
        maxWidth,
        maxHeight: maxHeight as any,
        backgroundColor: '#FFFFFF',
        borderRadius: radius,
        overflow: 'hidden',
        ...modalCardShadow,
        ...(style ?? {}),
      }}
    >
      {children}
    </Pressable>
  );
}
