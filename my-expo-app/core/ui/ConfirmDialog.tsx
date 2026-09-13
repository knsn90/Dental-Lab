/**
 * ConfirmDialog — Patterns §08 style confirmation dialog
 *
 * Standard "Silmekten emin misiniz?" pattern — used everywhere in the app.
 *
 * Layout:
 *  ┌─────────────────────────────────────┐
 *  │  ⚪ (alert circle, soft tint)        │
 *  │                                     │
 *  │  Vakayı sil               (display) │
 *  │                                     │
 *  │  #DL-2842 · Mehmet Yılmaz kalıcı    │
 *  │  olarak silinecek. Bu işlem geri    │
 *  │  alınamaz.                          │
 *  │                                     │
 *  │                Vazgeç  [Evet, sil]  │
 *  └─────────────────────────────────────┘
 *
 * Usage:
 *  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
 *  ...
 *  setConfirm({
 *    title: 'Vakayı sil',
 *    highlight: '#DL-2842 · Mehmet Yılmaz',
 *    message: 'kalıcı olarak silinecek. Bu işlem geri alınamaz.',
 *    label: 'Evet, sil',
 *    variant: 'danger',
 *    onConfirm: async () => { ... },
 *  });
 *  ...
 *  <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
 */
import React from 'react';
import { View, Text, Pressable, Modal, Platform } from 'react-native';
import { AlertCircle, AlertTriangle, Info } from './icons';

import { DS } from '../theme/dsTokens';
import { MODAL_BACKDROP_COLOR, MODAL_OVERLAY_WEB } from './ModalBackdrop';
import { useMobileTokens } from '../theme/mobileDesignTokens';
import { useThemeModeStore } from '../store/themeModeStore';

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

export type ConfirmVariant = 'danger' | 'warning' | 'info';

export interface ConfirmState {
  title:     string;
  /** Bold prefix in the message (e.g. record name/id). Optional. */
  highlight?: string;
  message:   string;
  /** Confirm button label. Default 'Evet, sil' for danger, 'Onayla' otherwise. */
  label?:    string;
  /** 'Vazgeç' default cancel label override. */
  cancelLabel?: string;
  variant:   ConfirmVariant;
  onConfirm: () => void | Promise<void>;
}

const VARIANT_TONES: Record<ConfirmVariant, { fg: string; bg: string }> = {
  danger:  { fg: '#DC2626', bg: 'rgba(220,38,38,0.10)'  },
  warning: { fg: '#D97706', bg: 'rgba(217,119,6,0.10)'  },
  info:    { fg: '#2563EB', bg: 'rgba(37,99,235,0.10)'  },
};

const VARIANT_ICON = {
  danger:  AlertCircle,
  warning: AlertTriangle,
  info:    Info,
};

export function ConfirmDialog({
  state, onClose,
}: {
  state: ConfirmState | null;
  onClose: () => void;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const tone = state ? VARIANT_TONES[state.variant] : VARIANT_TONES.danger;
  const Icon = state ? VARIANT_ICON[state.variant] : AlertCircle;
  const confirmLabel = state?.label ?? (state?.variant === 'danger' ? 'Evet, sil' : 'Onayla');
  const cancelLabel  = state?.cancelLabel ?? 'Vazgeç';

  return (
    <Modal visible={!!state} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: MODAL_BACKDROP_COLOR,
          alignItems: 'center', justifyContent: 'center',
          padding: 20,
          ...MODAL_OVERLAY_WEB,
        }}
      >
        {state && (
          <View
            // Stop click-through
            onStartShouldSetResponder={() => true}
            style={{
              width: '100%', maxWidth: 480,
              backgroundColor: isDark ? T.card : '#FFFFFF',
              borderRadius: 24,
              paddingHorizontal: 28, paddingTop: 28, paddingBottom: 22,
              borderWidth: 1, borderColor: isDark ? T.hairline : 'rgba(0,0,0,0.05)',
              ...Platform.select({
                web:     { boxShadow: '0 24px 80px rgba(0,0,0,0.18)' },
                default: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.16, shadowRadius: 48, elevation: 12 },
              } as any),
            } as any}
          >
            {/* Alert circle */}
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: tone.bg,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 18,
            }}>
              <Icon size={20} color={tone.fg} strokeWidth={2} />
            </View>

            {/* Title */}
            <Text style={{ ...DISPLAY, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, color: isDark ? T.ink : DS.ink[900] }}>
              {state.title}
            </Text>

            {/* Message — highlight (bold) + body (gray) */}
            <Text style={{ fontSize: 14, lineHeight: 21, color: isDark ? T.ink3 : DS.ink[500], marginTop: 8 }}>
              {state.highlight ? (
                <>
                  <Text style={{ fontWeight: '700', color: isDark ? T.ink : DS.ink[900] }}>{state.highlight}</Text>
                  {' '}
                </>
              ) : null}
              {state.message}
            </Text>

            {/* Footer */}
            <View style={{
              flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18,
              marginTop: 24,
            }}>
              {/* Vazgeç — text only */}
              <Pressable
                onPress={onClose}
                style={{ paddingVertical: 8, paddingHorizontal: 4, cursor: 'pointer' as any }}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: isDark ? T.ink3 : DS.ink[500] }}>{cancelLabel}</Text>
              </Pressable>

              {/* Confirm — dark filled pill */}
              <Pressable
                onPress={async () => { await state.onConfirm(); }}
                style={{
                  paddingHorizontal: 22, paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: DS.ink[900],
                  cursor: 'pointer' as any,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFFFFF' }}>{confirmLabel}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Pressable>
    </Modal>
  );
}
