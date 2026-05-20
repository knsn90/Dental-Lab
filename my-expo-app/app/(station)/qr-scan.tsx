/**
 * app/(station)/qr-scan.tsx
 * Teknisyen QR check-in kamera tarayıcısı.
 * expo-camera v16 CameraView ile barkod tarama — web + native.
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  TextInput, KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AppIcon } from '../../core/ui/AppIcon';

const CHECKIN_HOST_PATH = '/checkin';
const ACCENT = '#16A34A';

function extractToken(raw: string): string | null {
  try {
    // Full URL: https://…/checkin?token=xxx
    const url = new URL(raw);
    if (url.pathname.endsWith(CHECKIN_HOST_PATH) || url.pathname === CHECKIN_HOST_PATH) {
      const t = url.searchParams.get('token');
      if (t) return t;
    }
  } catch {
    // Not a valid URL — ignore
  }
  // Bare token (UUID): xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  if (/^[0-9a-f-]{36}$/i.test(raw.trim())) return raw.trim();
  return null;
}

export default function QrScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [manualError, setManualError] = useState('');
  const scanLockRef = useRef(false);

  function navigate(token: string) {
    router.replace(`/checkin?token=${token}`);
  }

  function handleBarcode({ data }: { data: string }) {
    if (scanLockRef.current || scanned) return;
    scanLockRef.current = true;
    setScanned(true);

    const token = extractToken(data);
    if (token) {
      navigate(token);
    } else {
      setScanned(false);
      scanLockRef.current = false;
    }
  }

  function handleManualSubmit() {
    setManualError('');
    const raw = manualToken.trim();
    const token = extractToken(raw) ?? (raw.length > 8 ? raw : null);
    if (!token) {
      setManualError('Geçersiz token. QR kodunu tekrar deneyin.');
      return;
    }
    navigate(token);
  }

  // ─── Permission loading ───────────────────────────────────────────────────
  if (!permission) {
    return (
      <SafeAreaView style={s.center}>
        <AppIcon name="loader" size={28} color={ACCENT} />
        <Text style={s.hint}>Kamera izni kontrol ediliyor...</Text>
      </SafeAreaView>
    );
  }

  // ─── Permission denied ────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <SafeAreaView style={s.center}>
        <View style={s.iconCircle}>
          <AppIcon name="camera-off" size={32} color="#64748B" />
        </View>
        <Text style={s.permTitle}>Kamera İzni Gerekli</Text>
        <Text style={s.permSub}>
          QR kod okutmak için kamera iznine ihtiyaç var.
        </Text>
        <TouchableOpacity style={[s.btn, { backgroundColor: ACCENT }]} onPress={requestPermission}>
          <AppIcon name="camera" size={16} color="#fff" />
          <Text style={s.btnText}>Kamera İznini Ver</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnSecondary]} onPress={() => setShowManual(true)}>
          <AppIcon name="keyboard" size={16} color="#475569" />
          <Text style={[s.btnText, { color: '#475569' }]}>Manuel Token Gir</Text>
        </TouchableOpacity>
        {showManual && <ManualEntry value={manualToken} onChange={setManualToken} error={manualError} onSubmit={handleManualSubmit} />}
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <AppIcon name="arrow-left" size={16} color="#64748B" />
          <Text style={s.backText}>Geri Dön</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ─── Manual entry only (fallback) ─────────────────────────────────────────
  if (showManual) {
    return (
      <SafeAreaView style={s.center}>
        <KeyboardAvoidingView behavior="padding" style={{ width: '100%', alignItems: 'center' }}>
          <View style={s.iconCircle}>
            <AppIcon name="hash" size={32} color={ACCENT} />
          </View>
          <Text style={s.permTitle}>Token Gir</Text>
          <Text style={s.permSub}>QR kodu URL'sini veya token'ı yapıştırın.</Text>
          <ManualEntry value={manualToken} onChange={setManualToken} error={manualError} onSubmit={handleManualSubmit} />
          <TouchableOpacity style={s.backBtn} onPress={() => setShowManual(false)}>
            <AppIcon name="camera" size={16} color="#64748B" />
            <Text style={s.backText}>Kameraya Dön</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ─── Camera view ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.headerBtn} onPress={() => router.back()}>
          <AppIcon name="arrow-left" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>QR Okut</Text>
        <TouchableOpacity style={s.headerBtn} onPress={() => setShowManual(true)}>
          <AppIcon name="keyboard" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Camera */}
      <View style={{ flex: 1 }}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : handleBarcode}
        />

        {/* Overlay */}
        <View style={s.overlay} pointerEvents="none">
          <View style={s.scanFrame}>
            <Corner pos="tl" />
            <Corner pos="tr" />
            <Corner pos="bl" />
            <Corner pos="br" />
          </View>
          <Text style={s.scanHint}>
            {scanned ? 'QR okundu, yönlendiriliyor...' : 'Kamerayı QR koda doğrultu'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Corner decoration ────────────────────────────────────────────────────────
function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const isTop    = pos.startsWith('t');
  const isLeft   = pos.endsWith('l');
  return (
    <View
      style={[
        s.corner,
        isTop  ? { top: 0 }    : { bottom: 0 },
        isLeft ? { left: 0 }   : { right: 0 },
        !isTop  && { borderTopWidth: 0, borderBottomWidth: 3 },
        !isLeft && { borderLeftWidth: 0, borderRightWidth: 3 },
      ]}
    />
  );
}

// ─── Manual entry form ────────────────────────────────────────────────────────
function ManualEntry({
  value, onChange, error, onSubmit,
}: {
  value: string; onChange: (v: string) => void;
  error: string; onSubmit: () => void;
}) {
  return (
    <View style={s.manualBox}>
      <TextInput
        style={s.manualInput}
        placeholder="Token veya URL yapıştır..."
        placeholderTextColor="#94A3B8"
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />
      {!!error && <Text style={s.manualError}>{error}</Text>}
      <TouchableOpacity style={[s.btn, { backgroundColor: ACCENT }]} onPress={onSubmit}>
        <AppIcon name="log-in" size={16} color="#fff" />
        <Text style={s.btnText}>Giriş Yap</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const FRAME = 240;
const CORNER_SIZE = 28;
const CORNER_THICK = 3;

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    padding: 32,
    gap: 16,
  },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  permTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  permSub:   { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  hint:      { fontSize: 13, color: '#64748B', marginTop: 12 },

  btn: {
    width: '100%', maxWidth: 320,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14,
  },
  btnSecondary: { backgroundColor: '#F1F5F9' },
  btnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10, marginTop: 4,
  },
  backText: { fontSize: 13, color: '#64748B', fontWeight: '500' },

  // Camera header
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 50 : 16, paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingTop: 80,
  },
  scanFrame: {
    width: FRAME, height: FRAME,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderColor: '#fff',
    borderTopWidth: CORNER_THICK,
    borderLeftWidth: CORNER_THICK,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderRadius: 2,
  },
  scanHint: {
    fontSize: 14, color: '#fff', fontWeight: '500',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },

  // Manual
  manualBox: { width: '100%', maxWidth: 320, gap: 10, marginTop: 4 },
  manualInput: {
    borderWidth: 1.5, borderColor: '#CBD5E1',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#0F172A', backgroundColor: '#fff',
  },
  manualError: { fontSize: 12, color: '#DC2626', marginTop: -4 },
});
