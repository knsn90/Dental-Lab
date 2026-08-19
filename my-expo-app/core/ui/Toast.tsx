/**
 * Toast — non-blocking bildirim sistemi
 *
 * Kullanım:
 *   import { toast } from '../core/ui/Toast';
 *   toast.success('Kayıt oluşturuldu.');
 *   toast.error('Bir hata oluştu.');
 *   toast.warning('Dikkat!');
 *   toast.info('Bilgi mesajı.');
 *
 * Root layout'ta <ToastContainer /> ekle.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
  Dimensions,
} from 'react-native';
import { C } from '../theme/colors';
import { S } from '../theme/spacing';

import { AlertCircle, AlertTriangle, CheckCircle2, Info, X as XIcon } from 'lucide-react-native';

// ─── Types ────────────────────────────────────────────────────────────────────
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number; // ms — varsayılan 3500
  /** Toast'a basınca çalışır (örn. ilgili siparişe git). Verilirse toast tıklanabilir. */
  onPress?: () => void;
}

/** Opsiyonel davranış — toast.info('...', 'Başlık', { onPress }) */
export interface ToastOpts {
  duration?: number;
  onPress?: () => void;
}

type Listener = (msg: ToastMessage) => void;

// ─── Event emitter (singleton, context gerektirmez) ───────────────────────────
const listeners = new Set<Listener>();

function emit(msg: Omit<ToastMessage, 'id'>) {
  const full: ToastMessage = { ...msg, id: Date.now().toString(36) + Math.random().toString(36).slice(2) };
  listeners.forEach(fn => fn(full));
}

export const toast = {
  success: (message: string, title?: string, opts?: ToastOpts) => emit({ type: 'success', message, title, ...opts }),
  error:   (message: string, title?: string, opts?: ToastOpts) => emit({ type: 'error',   message, title, ...opts }),
  warning: (message: string, title?: string, opts?: ToastOpts) => emit({ type: 'warning', message, title, ...opts }),
  info:    (message: string, title?: string, opts?: ToastOpts) => emit({ type: 'info',    message, title, ...opts }),
};

function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ─── Visual config per type — Patterns §08 style ───────────────────────────────
const CFG: Record<ToastType, { fg: string; bg: string; Icon: any; titleDefault: string }> = {
  success: { fg: '#059669', bg: 'rgba(5,150,105,0.10)',  Icon: CheckCircle2, titleDefault: 'Başarılı' },
  error:   { fg: '#DC2626', bg: 'rgba(220,38,38,0.10)',  Icon: AlertCircle,  titleDefault: 'Hata' },
  warning: { fg: '#D97706', bg: 'rgba(217,119,6,0.10)',  Icon: AlertTriangle,titleDefault: 'Uyarı' },
  info:    { fg: '#2563EB', bg: 'rgba(37,99,235,0.10)',  Icon: Info,         titleDefault: 'Bilgi' },
};

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// ─── Single Toast Item ────────────────────────────────────────────────────────
function ToastItem({ msg, onDismiss }: { msg: ToastMessage; onDismiss: (id: string) => void }) {
  const cfg = CFG[msg.type];
  const anim = useRef(new Animated.Value(0)).current;
  const opac = useRef(new Animated.Value(0)).current;
  const duration = msg.duration ?? 3500;

  useEffect(() => {
    // Slide in + fade in
    Animated.parallel([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 10 }),
      Animated.timing(opac, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => dismiss(), duration);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    Animated.parallel([
      Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(opac, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onDismiss(msg.id));
  }

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });

  const Icon = cfg.Icon;
  const tappable = typeof msg.onPress === 'function';

  return (
    <Animated.View
      style={[
        styles.item,
        { opacity: opac, transform: [{ translateY }] },
      ]}
    >
      {/* İçerik — onPress verilmişse tıklanınca aksiyonu çalıştır + kapat */}
      <Pressable
        onPress={tappable ? () => { msg.onPress?.(); dismiss(); } : undefined}
        disabled={!tappable}
        style={styles.tapZone}
        // @ts-ignore web cursor
        {...(Platform.OS === 'web' && tappable ? { dataSet: { cursor: 'pointer' } } : {})}
      >
        {/* Icon circle — soft tinted (Patterns §08) */}
        <View style={[styles.iconCircle, { backgroundColor: cfg.bg }]}>
          <Icon size={18} color={cfg.fg} strokeWidth={2} />
        </View>

        <View style={styles.textBlock}>
          <Text style={styles.title}>{msg.title ?? cfg.titleDefault}</Text>
          {!!msg.message && (
            <Text style={styles.message} numberOfLines={3}>{msg.message}</Text>
          )}
        </View>
      </Pressable>

      <Pressable onPress={dismiss} hitSlop={10} style={styles.close}>
        <XIcon size={14} color="#9A9A9A" strokeWidth={2} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Container (render once in root layout) ───────────────────────────────────
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const insets = useSafeAreaInsets();

  const onDismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const unsub = subscribe(msg => {
      setToasts(prev => {
        // Max 4 toast — eskiyi at
        const next = [...prev, msg];
        return next.length > 4 ? next.slice(next.length - 4) : next;
      });
    });
    return () => { unsub(); };
  }, []);

  if (toasts.length === 0) return null;

  const content = (
    <View
      style={[
        styles.container,
        { top: (insets.top || 0) + (Platform.OS === 'web' ? 12 : 8) },
        // Web: modallar document.body'ye portal'landığından toast'ı da
        // body'ye max z-index + fixed ile taşı ki açık modalın ÜSTÜNDE görünsün.
        Platform.OS === 'web' ? ({ position: 'fixed', zIndex: 2147483647 } as any) : null,
      ]}
      pointerEvents="box-none"
    >
      {toasts.map(t => (
        <ToastItem key={t.id} msg={t} onDismiss={onDismiss} />
      ))}
    </View>
  );

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    try {
      const { createPortal } = require('react-dom');
      return createPortal(content, document.body);
    } catch {
      return content;
    }
  }
  return content;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const { width } = Dimensions.get('window');
const MAX_W = Math.min(width - 32, 400);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    // top runtime'da insets.top + offset ile override edilir
    top: Platform.OS === 'web' ? 20 : 56,
    start: 0,
    end: 0,
    alignItems: 'center',
    zIndex: 99999,
    gap: 10,
    // @ts-ignore
    pointerEvents: 'box-none',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: MAX_W,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    // @ts-ignore web
    boxShadow: '0 16px 40px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 6,
  },
  iconCircle: {
    width: 36, height: 36,
    borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  tapZone: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  textBlock: { flex: 1, paddingTop: 1 },
  title: { ...DISPLAY, fontSize: 16, lineHeight: 20, letterSpacing: -0.3, color: '#0A0A0A' },
  message: { fontSize: 13, fontWeight: '400', color: '#6B6B6B', lineHeight: 18, marginTop: 3 },
  close: {
    width: 24, height: 24, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2, flexShrink: 0,
  },
});
