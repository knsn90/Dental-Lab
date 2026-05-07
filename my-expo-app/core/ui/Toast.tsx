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
}

type Listener = (msg: ToastMessage) => void;

// ─── Event emitter (singleton, context gerektirmez) ───────────────────────────
const listeners = new Set<Listener>();

function emit(msg: Omit<ToastMessage, 'id'>) {
  const full: ToastMessage = { ...msg, id: Date.now().toString(36) + Math.random().toString(36).slice(2) };
  listeners.forEach(fn => fn(full));
}

export const toast = {
  success: (message: string, title?: string) => emit({ type: 'success', message, title }),
  error:   (message: string, title?: string) => emit({ type: 'error',   message, title }),
  warning: (message: string, title?: string) => emit({ type: 'warning', message, title }),
  info:    (message: string, title?: string) => emit({ type: 'info',    message, title }),
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

  return (
    <Animated.View
      style={[
        styles.item,
        { opacity: opac, transform: [{ translateY }] },
      ]}
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

      <Pressable onPress={dismiss} hitSlop={10} style={styles.close}>
        <XIcon size={14} color="#9A9A9A" strokeWidth={2} />
      </Pressable>
    </Animated.View>
  );
}

// ─── Container (render once in root layout) ───────────────────────────────────
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map(t => (
        <ToastItem key={t.id} msg={t} onDismiss={onDismiss} />
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const { width } = Dimensions.get('window');
const MAX_W = Math.min(width - 32, 400);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 20 : 56,
    left: 0,
    right: 0,
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
  textBlock: { flex: 1, paddingTop: 1 },
  title: { ...DISPLAY, fontSize: 16, lineHeight: 20, letterSpacing: -0.3, color: '#0A0A0A' },
  message: { fontSize: 13, fontWeight: '400', color: '#6B6B6B', lineHeight: 18, marginTop: 3 },
  close: {
    width: 24, height: 24, borderRadius: 6,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2, flexShrink: 0,
  },
});
