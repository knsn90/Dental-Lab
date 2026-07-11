/**
 * CancelRequestModal — klinik/hekim sipariş iptal talebi oluşturma.
 * Sebep seçenekleri (radio) + "Diğer" + serbest metin alanı. Panel-temalı.
 */
import React, { useState } from 'react';
import { Modal, View, Text, Pressable, TextInput, Platform, ActivityIndicator } from 'react-native';
import { X, Check, Ban } from 'lucide-react-native';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';
import { CANCEL_REASONS, createCancelRequest, type CancelReasonCode } from '../cancellation';

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export function CancelRequestModal({
  visible, onClose, order, onDone,
}: {
  visible: boolean;
  onClose: () => void;
  order: { id: string; order_number?: number | string | null; lab_id?: string | null } | null;
  onDone?: () => void;
}) {
  const theme = usePanelTheme();
  const A = theme.primary;
  const profile = useAuthStore((s) => s.profile);
  const [code, setCode] = useState<CancelReasonCode | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setCode(null); setDetail(''); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const canSubmit = !!code && (code !== 'other' || detail.trim().length > 0) && !busy;

  const submit = async () => {
    if (!order || !code || !profile?.id) return;
    setBusy(true);
    const { error } = await createCancelRequest({
      workOrderId: order.id,
      labId: order.lab_id ?? null,
      requestedBy: profile.id,
      requesterName: (profile as any)?.full_name ?? null,
      reasonCode: code,
      reasonDetail: detail.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error('Talep gönderilemedi: ' + (error.message ?? ''));
      return;
    }
    toast.success('İptal talebi gönderildi. Onaya düştü.');
    onDone?.();
    close();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable onPress={close} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' }}>
        <Pressable onPress={(e: any) => e.stopPropagation?.()} style={{ backgroundColor: theme.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingBottom: 24, paddingHorizontal: 18 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: hexA(theme.accent, 0.14), marginBottom: 14 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA('#D94B4B', 0.12) }}>
              <Ban size={17} color="#D94B4B" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: theme.accent }}>İptal Talebi</Text>
              <Text style={{ fontSize: 12, color: hexA(theme.accent, 0.55) }}>
                {order?.order_number ? `Sipariş #${order.order_number}` : 'Sipariş'} · onaya gönderilir
              </Text>
            </View>
            <Pressable onPress={close} hitSlop={8} style={{ padding: 6 }}>
              <X size={18} color={hexA(theme.accent, 0.6)} strokeWidth={2} />
            </Pressable>
          </View>

          <Text style={{ fontSize: 12.5, fontWeight: '700', color: hexA(theme.accent, 0.6), marginTop: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            İptal sebebi
          </Text>

          <View style={{ gap: 8 }}>
            {CANCEL_REASONS.map((r) => {
              const sel = code === r.code;
              return (
                <Pressable
                  key={r.code}
                  onPress={() => setCode(r.code)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 11,
                    paddingVertical: 12, paddingHorizontal: 13, borderRadius: 14,
                    borderWidth: 1.5, borderColor: sel ? A : hexA(theme.accent, 0.1),
                    backgroundColor: sel ? hexA(A, 0.08) : theme.bg,
                    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                  }}
                >
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: sel ? A : hexA(theme.accent, 0.25), alignItems: 'center', justifyContent: 'center' }}>
                    {sel && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: A }} />}
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: sel ? '700' : '500', color: theme.accent, flex: 1 }}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {(code === 'other' || code != null) && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 12, color: hexA(theme.accent, 0.55), marginBottom: 6 }}>
                {code === 'other' ? 'Lütfen sebebi yaz (zorunlu)' : 'Açıklama (opsiyonel)'}
              </Text>
              <TextInput
                value={detail}
                onChangeText={setDetail}
                multiline
                placeholder="Detay…"
                placeholderTextColor={hexA(theme.accent, 0.4)}
                style={[
                  { minHeight: 72, maxHeight: 140, borderRadius: 14, borderWidth: 1, borderColor: hexA(theme.accent, 0.12), backgroundColor: theme.bg, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: theme.accent, textAlignVertical: 'top' },
                  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
                ]}
              />
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Pressable onPress={close} style={{ flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: hexA(theme.accent, 0.18), ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: hexA(theme.accent, 0.7) }}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              style={{ flex: 1.4, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', paddingVertical: 13, borderRadius: 14, backgroundColor: canSubmit ? '#D94B4B' : hexA('#D94B4B', 0.4), ...(Platform.OS === 'web' && canSubmit ? ({ cursor: 'pointer' } as any) : {}) }}
            >
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Check size={16} color="#fff" strokeWidth={2.4} />}
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>İptal Talebi Gönder</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
