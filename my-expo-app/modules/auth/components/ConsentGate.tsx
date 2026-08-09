/**
 * ConsentGate — KVKK / GDPR onay bloğu (P0-5 · R-01).
 *
 * Kayıt ekranlarında ZORUNLU adım. Öncesinde hiçbir onay kaydı tutulmuyordu:
 * `profiles.kvkk_accepted_at` sütunu vardı ama hiçbir kod yolu yazmıyordu
 * (14 profilin 0'ı doluydu). GDPR m.7(1) "ispat edilebilirlik" karşılanmıyordu.
 *
 * Bu bileşen:
 *   • Gizlilik Politikası + Kullanım Koşulları → ZORUNLU, sürüm numarasıyla
 *   • Yapay zekâ, WhatsApp/SMS, yurt dışı aktarım → AYRI ve İSTEĞE BAĞLI
 *
 * Toplanan kararlar `record_consents` RPC'si ile append-only `user_consents`
 * defterine yazılır. Onay geri çekme = yeni satır (granted=false), güncelleme değil.
 */
import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Check } from 'lucide-react-native';
import { AUTH, AUTH_FONT } from './AuthShell';
import { LegalDocModal } from './LegalDocModal';
// Hukuki URL'ler tek kaynaktan (core/legal.ts). Branded dom'e geçiş orada tek satır.
import { LEGAL_PRIVACY_URL, LEGAL_TERMS_URL } from '../../../core/legal';

/** Yayınlanmış hukuki doküman sürümleri.
 *  siman-legal/ içeriği her değiştiğinde BURASI da artırılmalı — kullanıcıya
 *  hangi metnin gösterildiği bu değerle kayda geçer.
 *  v2.0 (2026-07-23): tüm alıcılar + yurt dışı aktarım + AI + KVKK m.11 eklendi. */
export const LEGAL_DOC_VERSION = '2.0';

export { LEGAL_PRIVACY_URL, LEGAL_TERMS_URL };

export type ConsentKind =
  | 'privacy_policy'
  | 'terms'
  | 'ai_processing'
  | 'marketing_whatsapp'
  | 'international_transfer';

export interface ConsentState {
  privacy_policy: boolean;
  terms: boolean;
  ai_processing: boolean;
  marketing_whatsapp: boolean;
  international_transfer: boolean;
}

export const EMPTY_CONSENTS: ConsentState = {
  privacy_policy: false,
  terms: false,
  ai_processing: false,
  marketing_whatsapp: false,
  international_transfer: false,
};

/** Kayıt için zorunlu olan onaylar. */
export const REQUIRED_CONSENTS: ConsentKind[] = ['privacy_policy', 'terms'];

export function hasRequiredConsents(c: ConsentState): boolean {
  return REQUIRED_CONSENTS.every((k) => c[k as keyof ConsentState]);
}

/** ConsentState → record_consents RPC payload'ı. */
export function toConsentPayload(c: ConsentState) {
  const ua = Platform.OS === 'web' && typeof navigator !== 'undefined'
    ? navigator.userAgent
    : `app/${Platform.OS}`;
  return (Object.keys(c) as (keyof ConsentState)[]).map((kind) => ({
    kind,
    granted: c[kind],
    document_version: LEGAL_DOC_VERSION,
    user_agent: ua,
  }));
}

function Box({ checked }: { checked: boolean }) {
  return (
    <View
      style={{
        width: 20, height: 20, borderRadius: 6, borderWidth: 1.5,
        borderColor: checked ? AUTH.accentDeep : AUTH.border,
        backgroundColor: checked ? AUTH.accent : 'transparent',
        alignItems: 'center', justifyContent: 'center', marginTop: 1,
      }}
    >
      {checked ? <Check size={13} color="#0A0A0A" strokeWidth={3} /> : null}
    </View>
  );
}

function Row({
  checked, onToggle, children, error, testID,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  error?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      testID={testID}
      style={{
        flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 7,
        ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}),
      }}
    >
      <Box checked={checked} />
      <Text
        style={{
          flex: 1, fontSize: 12.5, lineHeight: 18,
          color: error ? AUTH.danger : AUTH.inkSoft,
          fontFamily: AUTH_FONT.sans,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function LegalLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Text
      onPress={onPress}
      style={{
        color: AUTH.accentDeep, textDecorationLine: 'underline', fontWeight: '600',
        ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}),
      }}
    >
      {label}
    </Text>
  );
}

export interface ConsentGateProps {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  /** Kullanıcı zorunlu onayları vermeden gönderdiyse true — kırmızı vurgu. */
  showError?: boolean;
}

export function ConsentGate({ value, onChange, showError }: ConsentGateProps) {
  const toggle = (k: keyof ConsentState) => () => onChange({ ...value, [k]: !value[k] });
  const missing = showError && !hasRequiredConsents(value);
  const [doc, setDoc] = React.useState<{ url: string; title: string } | null>(null);

  return (
    <View style={{ marginTop: 4 }}>
      <View
        style={{
          borderWidth: 1,
          borderColor: missing ? AUTH.danger : AUTH.border,
          backgroundColor: AUTH.inputBg,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Row checked={value.privacy_policy} onToggle={toggle('privacy_policy')}
             error={missing && !value.privacy_policy} testID="consent-privacy">
          <LegalLink label="Gizlilik Politikası"
                     onPress={() => setDoc({ url: LEGAL_PRIVACY_URL, title: 'Gizlilik Politikası' })} />
          {'’nı okudum ve kişisel verilerimin işlenmesini kabul ediyorum.'}
          <Text style={{ color: AUTH.danger }}> *</Text>
        </Row>

        <Row checked={value.terms} onToggle={toggle('terms')}
             error={missing && !value.terms} testID="consent-terms">
          <LegalLink label="Kullanım Koşulları"
                     onPress={() => setDoc({ url: LEGAL_TERMS_URL, title: 'Kullanım Koşulları' })} />
          {'’nı kabul ediyorum.'}
          <Text style={{ color: AUTH.danger }}> *</Text>
        </Row>

        <View style={{ height: 1, backgroundColor: AUTH.border, marginVertical: 6 }} />

        <Text style={{
          fontSize: 11, color: AUTH.inkMuted, fontFamily: AUTH_FONT.sans, marginBottom: 2,
        }}>
          İsteğe bağlı — dilediğin zaman ayarlardan değiştirebilirsin:
        </Text>

        <Row checked={value.ai_processing} onToggle={toggle('ai_processing')}
             testID="consent-ai">
          Yapay zekâ asistanının (Simanty) sorularımı yanıtlamak için verileri
          işlemesine izin veriyorum.
        </Row>

        <Row checked={value.marketing_whatsapp} onToggle={toggle('marketing_whatsapp')}
             testID="consent-whatsapp">
          WhatsApp ve SMS ile bildirim almak istiyorum.
        </Row>

        <Row checked={value.international_transfer} onToggle={toggle('international_transfer')}
             testID="consent-transfer">
          Hizmetin sunulması için verilerimin yurt dışındaki hizmet
          sağlayıcılara aktarılmasına izin veriyorum.
        </Row>
      </View>

      {missing ? (
        <Text style={{
          color: AUTH.danger, fontSize: 11.5, marginTop: 6, fontFamily: AUTH_FONT.sans,
        }}>
          Devam etmek için Gizlilik Politikası ve Kullanım Koşulları’nı kabul etmelisin.
        </Text>
      ) : null}

      <LegalDocModal
        visible={!!doc}
        url={doc?.url ?? null}
        title={doc?.title ?? ''}
        onClose={() => setDoc(null)}
      />
    </View>
  );
}
