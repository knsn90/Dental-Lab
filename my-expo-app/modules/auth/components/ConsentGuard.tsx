/**
 * ConsentGuard — giriş sonrası zorunlu rıza kapısı (KVKK-2 · R-01 back-fill).
 *
 * Yeni kayıtlar rızayı kayıt formunda veriyor (ConsentGate). Ama P0 öncesi var
 * olan kullanıcıların hiç rıza kaydı yok. Bu bileşen, oturum açık VE zorunlu
 * rızalar (gizlilik + koşullar) eksikse uygulamanın üstüne BLOKLAYAN bir modal
 * koyar; kullanıcı iki zorunlu kutuyu işaretleyip onaylamadan devam edemez.
 *
 * ÖNEMLİ — İZOLASYON: Bu bir overlay'dir; routing / route-guard / Stack
 * mantığına DOKUNMAZ. Kabuğun en dışında (DentyFAB yanında) bir kez mount
 * edilir. Oturum yoksa (login/register ekranları) tamamen pasiftir.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import {
  ConsentGate, EMPTY_CONSENTS, hasRequiredConsents, toConsentPayload, type ConsentState,
} from './ConsentGate';
import { AUTH, AUTH_FONT } from './AuthShell';

export function ConsentGuard() {
  const session = useAuthStore((s) => s.session);
  const userId = (session as any)?.user?.id ?? null;

  // null = henüz bilinmiyor, true = eksik (modal göster), false = tamam
  const [needsConsent, setNeedsConsent] = useState<boolean | null>(null);
  const [consents, setConsents] = useState<ConsentState>(EMPTY_CONSENTS);
  const [consentError, setConsentError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Oturum değişince zorunlu rıza durumunu kontrol et.
  useEffect(() => {
    let alive = true;
    if (!userId) { setNeedsConsent(false); return; }
    (async () => {
      const { data, error } = await supabase.rpc('has_required_consents');
      if (!alive) return;
      // Hata durumunda kullanıcıyı KİLİTLEME — güvenli tarafta kal, kapıyı açma.
      if (error) { setNeedsConsent(false); return; }
      setNeedsConsent(data === false);
    })();
    return () => { alive = false; };
  }, [userId]);

  const onAccept = useCallback(async () => {
    if (!hasRequiredConsents(consents)) { setConsentError(true); return; }
    setSaving(true); setErrorMsg('');
    const { error } = await supabase.rpc('record_consents', {
      p_consents: toConsentPayload(consents),
    });
    setSaving(false);
    if (error) { setErrorMsg('Kaydedilemedi. İnternet bağlantını kontrol edip tekrar dene.'); return; }
    setNeedsConsent(false);
  }, [consents]);

  const onSignOut = useCallback(async () => {
    try { await supabase.auth.signOut(); } catch { /* yut */ }
  }, []);

  if (needsConsent !== true) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { /* kapatılamaz */ }}>
      <View style={{
        flex: 1, backgroundColor: 'rgba(10,10,10,0.55)',
        alignItems: 'center', justifyContent: 'center', padding: 20,
        ...(Platform.OS === 'web' ? { backdropFilter: 'blur(3px)' } as any : {}),
      }}>
        <View style={{
          width: '100%', maxWidth: 480, maxHeight: '90%',
          backgroundColor: AUTH.cardBg, borderRadius: 18, padding: 22,
          shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
        }}>
          <Text style={{
            fontFamily: AUTH_FONT.display, fontSize: 20, color: AUTH.ink, fontWeight: '700',
            letterSpacing: -0.3, marginBottom: 4,
          }}>
            Devam etmeden önce
          </Text>
          <Text style={{
            fontFamily: AUTH_FONT.sans, fontSize: 13, color: AUTH.inkSoft, lineHeight: 19, marginBottom: 8,
          }}>
            Gizlilik Politikası ve Kullanım Koşulları güncellendi. Kişisel verilerinin işlenmesine ilişkin
            onayını almadan uygulamayı kullanmaya devam edemeyiz.
          </Text>

          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
            <ConsentGate value={consents} onChange={(c) => { setConsents(c); setConsentError(false); }} showError={consentError} />
          </ScrollView>

          {errorMsg ? (
            <Text style={{ color: AUTH.danger, fontSize: 12.5, marginTop: 10, fontFamily: AUTH_FONT.sans }}>
              {errorMsg}
            </Text>
          ) : null}

          <Pressable
            onPress={onAccept}
            disabled={saving}
            style={{
              marginTop: 16, height: 48, borderRadius: 12,
              backgroundColor: AUTH.accent, alignItems: 'center', justifyContent: 'center',
              opacity: saving ? 0.7 : 1,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            {saving
              ? <ActivityIndicator color="#0A0A0A" />
              : <Text style={{ fontFamily: AUTH_FONT.display, fontSize: 15, fontWeight: '700', color: '#0A0A0A' }}>Onayla ve Devam Et</Text>}
          </Pressable>

          <Pressable
            onPress={onSignOut}
            style={{ marginTop: 10, alignItems: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
          >
            <Text style={{ fontFamily: AUTH_FONT.sans, fontSize: 12.5, color: AUTH.inkMuted }}>
              Şimdilik çıkış yap
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
