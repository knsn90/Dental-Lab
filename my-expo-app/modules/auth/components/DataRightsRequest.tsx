/**
 * DataRightsRequest — KVKK m.11 / GDPR veri sahibi hakları başvuru kanalı (KVKK-4).
 *
 * Kullanıcı bir hak talebi türü seçer (erişim / düzeltme / silme / itiraz /
 * rıza geri çekme / taşınabilirlik), açıklamasını yazar ve talep, mevcut destek
 * sistemine `kvkk_talebi` kategorisiyle bir kayıt (support_tickets) olarak düşer.
 * Böylece talep izlenebilir, SLA'ya bağlı ve admin panelinde görünür olur —
 * KVKK'nın 30 günlük yanıt yükümlülüğü için gerekli olan budur.
 *
 * Not: Hasta verileri çoğunlukla laboratuvarın veri sorumluluğundadır; bir
 * hastanın talebi ilgili laboratuvara yönlendirilir. Metin bunu açıklar.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, TextInput, ActivityIndicator, Platform } from 'react-native';
import { X } from 'lucide-react-native';
import { createTicket } from '../../support/api';
import { AUTH, AUTH_FONT } from './AuthShell';

type RightKind =
  | 'erisim' | 'duzeltme' | 'silme' | 'itiraz' | 'riza_geri_cekme' | 'tasinabilirlik';

const RIGHTS: { kind: RightKind; label: string; desc: string }[] = [
  { kind: 'erisim',           label: 'Verilerime erişim',     desc: 'Hakkımda hangi verilerin işlendiğini öğrenmek istiyorum.' },
  { kind: 'duzeltme',         label: 'Düzeltme',              desc: 'Eksik/yanlış verilerimin düzeltilmesini istiyorum.' },
  { kind: 'silme',            label: 'Silme / yok etme',      desc: 'Verilerimin silinmesini istiyorum.' },
  { kind: 'itiraz',           label: 'İşlemeye itiraz',        desc: 'Belirli bir işlemeye itiraz ediyorum.' },
  { kind: 'riza_geri_cekme',  label: 'Rızayı geri çekme',     desc: 'Verdiğim açık rızayı geri çekiyorum.' },
  { kind: 'tasinabilirlik',   label: 'Verilerimi dışa aktarma', desc: 'Verilerimin bir kopyasını istiyorum.' },
];

const KIND_LABEL: Record<RightKind, string> = Object.fromEntries(
  RIGHTS.map((r) => [r.kind, r.label]),
) as Record<RightKind, string>;

export function DataRightsRequest({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<RightKind | null>(null);
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const reset = () => { setKind(null); setDetail(''); setDone(false); setErrorMsg(''); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    if (!kind) { setErrorMsg('Lütfen bir talep türü seçin.'); return; }
    setSaving(true); setErrorMsg('');
    try {
      await createTicket({
        subject: `KVKK Talebi — ${KIND_LABEL[kind]}`,
        category: 'kvkk_talebi',
        priority: 'yuksek',
        body:
          `Veri sahibi hak talebi (KVKK m.11).\n` +
          `Talep türü: ${KIND_LABEL[kind]}\n\n` +
          `Açıklama:\n${detail.trim() || '(belirtilmedi)'}`,
        context: { kind, source: 'data_rights_request' } as any,
      });
      setDone(true);
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Talep gönderilemedi. Tekrar dene.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.5)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: AUTH.cardBg, borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: 20, maxHeight: '90%',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ fontFamily: AUTH_FONT.display, fontSize: 19, fontWeight: '700', color: AUTH.ink, letterSpacing: -0.3 }}>
              KVKK Başvurusu
            </Text>
            <Pressable onPress={close} hitSlop={10} style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}>
              <X size={20} color={AUTH.inkMuted} strokeWidth={2} />
            </Pressable>
          </View>

          {done ? (
            <View style={{ paddingVertical: 20 }}>
              <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 14, color: AUTH.ink, lineHeight: 21 }}>
                Talebin alındı. Başvurun bir destek kaydı olarak oluşturuldu ve en geç 30 gün içinde
                sonuçlandırılacak. Gelişmeleri Destek bölümünden takip edebilirsin.
              </Text>
              <Pressable onPress={close} style={{
                marginTop: 18, height: 46, borderRadius: 12, backgroundColor: AUTH.accent,
                alignItems: 'center', justifyContent: 'center',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}>
                <Text style={{ fontFamily: AUTH_FONT.display, fontSize: 15, fontWeight: '700', color: '#0A0A0A' }}>Kapat</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 12.5, color: AUTH.inkSoft, lineHeight: 18, marginBottom: 12 }}>
                Kişisel verilerinle ilgili hangi hakkını kullanmak istiyorsun? Hasta verileri çoğunlukla
                ilgili laboratuvarın sorumluluğundadır; gerekli hâllerde talebin oraya yönlendirilir.
              </Text>

              <View style={{ gap: 8 }}>
                {RIGHTS.map((r) => {
                  const active = kind === r.kind;
                  return (
                    <Pressable
                      key={r.kind}
                      onPress={() => { setKind(r.kind); setErrorMsg(''); }}
                      style={{
                        borderWidth: 1.5, borderColor: active ? AUTH.accentDeep : AUTH.border,
                        backgroundColor: active ? AUTH.accentSoft : '#FFFFFF',
                        borderRadius: 12, padding: 12,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      }}
                    >
                      <Text style={{ fontFamily: AUTH_FONT.display, fontSize: 14, fontWeight: '700', color: AUTH.ink }}>{r.label}</Text>
                      <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 12, color: AUTH.inkSoft, marginTop: 2 }}>{r.desc}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 12, color: AUTH.inkSoft, marginTop: 16, marginBottom: 6, fontWeight: '600' }}>
                Açıklama (opsiyonel)
              </Text>
              <TextInput
                value={detail}
                onChangeText={setDetail}
                multiline
                placeholder="Talebinle ilgili detay ekleyebilirsin."
                placeholderTextColor={AUTH.inkMuted}
                style={{
                  minHeight: 80, borderWidth: 1, borderColor: AUTH.border, borderRadius: 12,
                  padding: 12, fontSize: 14, color: AUTH.ink, textAlignVertical: 'top',
                  fontFamily: AUTH_FONT.sans, backgroundColor: AUTH.inputBg,
                }}
              />

              {errorMsg ? (
                <Text style={{ color: AUTH.danger, fontSize: 12.5, marginTop: 10, fontFamily: AUTH_FONT.sans }}>{errorMsg}</Text>
              ) : null}

              <Pressable
                onPress={submit}
                disabled={saving}
                style={{
                  marginTop: 16, height: 48, borderRadius: 12, backgroundColor: AUTH.accent,
                  alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.7 : 1,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                {saving
                  ? <ActivityIndicator color="#0A0A0A" />
                  : <Text style={{ fontFamily: AUTH_FONT.display, fontSize: 15, fontWeight: '700', color: '#0A0A0A' }}>Başvuruyu Gönder</Text>}
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}
