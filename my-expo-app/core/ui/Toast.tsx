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
import Feather from '@expo/vector-icons/Feather';
import { C } from '../theme/colors';
import { S } from '../theme/spacing';

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

// ─── Visual config per type ───────────────────────────────────────────────────
const CFG: Record<ToastType, { bg: string; border: string; icon: string; iconColor: string; titleDefault: string }> = {
  success: { bg: C.successBg,  border: C.success,  icon: 'check-circle',       iconColor: C.success,  titleDefault: 'Başarılı' },
  error:   { bg: C.dangerBg,   border: C.danger,   icon: 'alert-circle',       iconColor: C.danger,   titleDefault: 'Hata' },
  warning: { bg: C.warningBg,  border: C.warning,  icon: 'alert-triangle',     iconColor: C.warning,  titleDefault: 'Uyarı' },
  info:    { bg: C.infoBg,     border: C.info,     icon: 'info',               iconColor: C.info,     titleDefault: 'Bilgi' },
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

  return (
    <Animated.View
      style={[
        styles.item,
        { backgroundColor: cfg.bg, borderLeftColor: cfg.border },
        { opacity: opac, transform: [{ translateY }] },
      ]}
    >
      <Feather name={cfg.icon as any} size={20} color={cfg.iconColor} style={styles.icon} />
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: cfg.iconColor }]}>
          {msg.title ?? cfg.titleDefault}
        </Text>
        {!!msg.message && (
          <Text style={styles.message} numberOfLines={3}>{msg.message}</Text>
        )}
      </View>
      <Pressable onPress={dismiss} hitSlop={10} style={styles.close}>
        <Feather name="x" size={16} color={C.textMuted} />
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
    return subscribe(msg => {
      setToasts(prev => {
        // Max 4 toast — eskiyi at
        const next = [...prev, msg];
        return next.length > 4 ? next.slice(next.length - 4) : next;
      });
    });
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
    gap: 8,
    // @ts-ignore
    pointerEvents: 'box-none',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: MAX_W,
    borderRadius: S.cardRadius,
    borderLeftWidth: 4,
    paddingVertical: 12,
    paddingRight: 12,
    paddingLeft: 14,
    gap: 10,
    // @ts-ignore
    boxShadow: '0 4px 24px rgba(15,23,42,0.12)',
    // Native shadow
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  icon: { marginTop: 1 },
  textBlock: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700', marginBottom: 1 },
  message: { fontSize: 13, fontWeight: '400', color: C.textSecondary, lineHeight: 18 },
  close: { padding: 2, marginTop: 2 },
});
