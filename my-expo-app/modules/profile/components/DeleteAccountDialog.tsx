/**
 * Hesabımı Sil — yaz-onayla ("SİL") diyaloğu (App Store 5.1.1(v)).
 * Geniş (iPad/desktop) ProfileScreen kullanır; telefon düzeni aynı akışı
 * DoctorProfileMobile içinde taşır. Son yönetici koruması sunucudadır
 * (delete-account edge function) — hata mesajı olduğu gibi gösterilir.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, Platform } from 'react-native';
import { AlertTriangle } from '../../../core/ui/icons';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { toast } from '../../../core/ui/Toast';
import { deleteMyAccount } from '../../../lib/auth';

type Props = { visible: boolean; onClose: () => void; onDeleted: () => void };

export function DeleteAccountDialog({ visible, onClose, onDeleted }: Props) {
  const T = useMobileTokens();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Hermes toLocaleUpperCase locale'i yok sayabilir → hem "SİL" hem "SIL" kabul
  const norm = text.trim().toLocaleUpperCase('tr-TR');
  const confirmed = norm === 'SİL' || norm === 'SIL';

  const close = () => { if (busy) return; setText(''); setError(null); onClose(); };
  const run = async () => {
    if (busy || !confirmed) return;
    setBusy(true); setError(null);
    const res = await deleteMyAccount();
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setText('');
    onClose();
    toast.success('Hesabınız silindi.');
    onDeleted();
  };

  const web = Platform.OS === 'web';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable
        onPress={close}
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Pressable
          onPress={(e: any) => e.stopPropagation?.()}
          style={{
            width: '100%', maxWidth: 400, backgroundColor: T.card, borderRadius: 20, padding: 20, gap: 12,
            borderWidth: 1, borderColor: T.hairline,
            ...(web ? { boxShadow: '0 12px 40px rgba(0,0,0,0.28)' } as any : {}),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(217,75,75,0.12)' }}>
              <AlertTriangle size={18} color="#D94B4B" strokeWidth={2} />
            </View>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: T.ink, letterSpacing: -0.2 }}>
              Hesabımı Sil
            </Text>
          </View>

          <Text style={{ fontSize: 13, color: T.ink3, lineHeight: 19 }}>
            Bu işlem <Text style={{ fontWeight: '700', color: T.ink }}>geri alınamaz</Text>. Kişisel bilgilerin ve giriş bilgin kalıcı olarak silinir.
            Oluşturduğun sipariş, fatura ve finans kayıtları yasal saklama gereği kimliksiz olarak korunur.
          </Text>

          <Text style={{ fontSize: 12.5, color: T.ink3 }}>
            Onaylamak için aşağıya <Text style={{ fontWeight: '800', color: T.ink }}>SİL</Text> yaz.
          </Text>
          <TextInput
            value={text}
            onChangeText={(v) => { setText(v); if (error) setError(null); }}
            editable={!busy}
            placeholder="SİL"
            placeholderTextColor={T.ink3}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[
              { height: 46, borderRadius: 12, borderWidth: 1, borderColor: confirmed ? '#D94B4B' : T.hairline, backgroundColor: T.cardSoft, paddingHorizontal: 14, fontSize: 15, color: T.ink },
              web ? ({ outlineStyle: 'none' } as any) : null,
            ]}
          />

          {error && <Text style={{ fontSize: 12.5, color: '#D94B4B', lineHeight: 17 }}>{error}</Text>}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
            <Pressable
              onPress={close}
              style={{
                flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
                backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline,
                ...(web ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={run}
              disabled={!confirmed || busy}
              style={{
                flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                backgroundColor: !confirmed || busy ? 'rgba(217,75,75,0.4)' : '#D94B4B',
                ...(web && confirmed && !busy ? { cursor: 'pointer' } as any : {}),
              }}
            >
              {busy
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Kalıcı Sil</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
