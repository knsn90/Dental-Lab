import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

import { AppIcon } from '../../core/ui/AppIcon';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const [password,    setPassword]    = useState('');
  const [password2,   setPassword2]   = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [done,        setDone]        = useState(false);
  const [hasSession,  setHasSession]  = useState(false);

  // Supabase hash'ten session kur (reset link açıldığında)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setHasSession(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleReset = async () => {
    setError('');
    if (password.length < 6)       { setError('Şifre en az 6 karakter olmalı'); return; }
    if (password !== password2)    { setError('Şifreler eşleşmiyor'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError('Şifre güncellenemedi: ' + err.message); return; }
    setDone(true);
    setTimeout(() => router.replace('/(auth)/login'), 2500);
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <View style={s.card}>

            {/* Icon */}
            <View style={s.iconWrap}>
              <AppIcon
                name={done ? 'check-circle-outline' : 'lock-reset'}
                size={32}
                color={done ? '#16A34A' : '#0F172A'}
              />
            </View>

            <Text style={s.title}>{done ? 'Şifre Güncellendi' : 'Yeni Şifre Belirle'}</Text>
            <Text style={s.sub}>
              {done
                ? 'Yeni şifrenizle giriş yapabilirsiniz. Yönlendiriliyorsunuz...'
                : 'Hesabınız için güçlü bir şifre belirleyin.'}
            </Text>

            {!done && hasSession && (
              <>
                {error ? (
                  <View style={s.errorBox}>
                    <AppIcon name="alert-circle-outline" size={14} color="#EF4444" />
                    <Text style={s.errorText}>{error}</Text>
                  </View>
                ) : null}

                {/* Yeni şifre */}
                <Text style={s.label}>YENİ ŞİFRE</Text>
                <View style={s.inputRow}>
                  <TextInput
                    style={[s.input, s.inputFlex]}
                    value={password}
                    onChangeText={v => { setPassword(v); setError(''); }}
                    placeholder="En az 6 karakter"
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={!showPass}
                    // @ts-ignore
                    outlineStyle="none"
                  />
                  <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPass(v => !v)}>
                    <AppIcon name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                {/* Tekrar */}
                <Text style={[s.label, { marginTop: 12 }]}>ŞİFRE TEKRAR</Text>
                <TextInput
                  style={s.input}
                  value={password2}
                  onChangeText={v => { setPassword2(v); setError(''); }}
                  placeholder="Şifreyi tekrar girin"
                  placeholderTextColor="#94A3B8"
                  secureTextEntry={!showPass}
                  // @ts-ignore
                  outlineStyle="none"
                />

                <TouchableOpacity
                  style={[s.btn, loading && { opacity: 0.6 }]}
                  onPress={handleReset}
                  disabled={loading}
                >
                  {loading
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Text style={s.btnText}>Şifreyi Güncelle</Text>
                  }
                </TouchableOpacity>
              </>
            )}

            {!done && !hasSession && (
              <View style={s.errorBox}>
                <AppIcon name="alert-circle-outline" size={14} color="#EF4444" />
                <Text style={s.errorText}>Geçersiz veya süresi dolmuş link. Tekrar şifre sıfırlama talep edin.</Text>
              </View>
            )}

            <TouchableOpacity style={s.backLink} onPress={() => router.replace('/(auth)/login')}>
              <AppIcon name="arrow-left" size={14} color="#64748B" />
              <Text style={s.backText}>Giriş sayfasına dön</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:      { width: '100%', maxWidth: 400 },

  iconWrap:  { width: 64, height: 64, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title:     { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5, marginBottom: 6 },
  sub:       { fontSize: 14, color: '#64748B', marginBottom: 24, lineHeight: 20 },

  errorBox:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { flex: 1, fontSize: 13, color: '#EF4444' },

  label:     { fontSize: 11, fontWeight: '600', color: '#64748B', letterSpacing: 0.5, marginBottom: 6 },
  inputRow:  { flexDirection: 'row' },
  input:     { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#0F172A', backgroundColor: '#FAFBFC' },
  inputFlex: { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 },
  eyeBtn:    { borderWidth: 1, borderColor: '#E2E8F0', borderTopRightRadius: 10, borderBottomRightRadius: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFBFC' },

  btn:       { backgroundColor: '#0F172A', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  btnText:   { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  backLink:  { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 24, paddingVertical: 8 },
  backText:  { fontSize: 13, color: '#64748B' },
});
