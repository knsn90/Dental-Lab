/**
 * Lab QR Check-in Ayarları
 * ─ QR kodu göster / yenile
 * ─ GPS konum & yarıçap ayarla
 * ─ Sadece manager veya admin görebilir
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Platform, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import QRCode from 'react-native-qrcode-svg';
import * as Location from 'expo-location';

import { C } from '../../../core/theme/colors';
import { F, FS } from '../../../core/theme/typography';
import { toast } from '../../../core/ui/Toast';
import {
  fetchLabLocation, updateLabLocation, regenerateCheckinToken,
  type LabLocation,
} from '../api';

// ─── Public checkin URL base ─────────────────────────────────────────────────
const APP_URL = 'https://dental-lab-steel.vercel.app/checkin';

interface Props {
  accentColor?: string;
}

export function LabCheckinSettings({ accentColor = '#2563EB' }: Props) {
  const [lab, setLab]         = useState<LabLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [regen, setRegen]     = useState(false);

  // form state
  const [lat, setLat]         = useState('');
  const [lng, setLng]         = useState('');
  const [radius, setRadius]   = useState('150');

  async function load() {
    setLoading(true);
    const { data, error } = await fetchLabLocation();
    if (!error && data) {
      setLab(data);
      setLat(data.location_lat != null ? String(data.location_lat) : '');
      setLng(data.location_lng != null ? String(data.location_lng) : '');
      setRadius(String(data.location_radius ?? 150));
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // ── GPS'ten konum al ────────────────────────────────────────────────────
  async function getCurrentLocation() {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      toast.error('GPS izni reddedildi.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setLat(String(loc.coords.latitude.toFixed(7)));
    setLng(String(loc.coords.longitude.toFixed(7)));
    toast.success('Mevcut konum alındı.');
  }

  // ── Kaydet ──────────────────────────────────────────────────────────────
  async function save() {
    const latNum = lat ? parseFloat(lat) : null;
    const lngNum = lng ? parseFloat(lng) : null;
    const radNum = parseInt(radius, 10) || 150;

    if ((lat && isNaN(latNum!)) || (lng && isNaN(lngNum!))) {
      toast.error('Geçerli bir koordinat girin.');
      return;
    }

    setSaving(true);
    try {
      await updateLabLocation({ lat: latNum, lng: lngNum, radius: radNum });
      toast.success('Konum ayarları kaydedildi.');
      load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Kaydetme başarısız.');
    }
    setSaving(false);
  }

  // ── Token yenile ─────────────────────────────────────────────────────────
  function confirmRegen() {
    Alert.alert(
      'QR Kodu Yenile',
      'Mevcut QR kod geçersiz olacak. Yeni QR kodu bastırmanız gerekecek. Devam?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Yenile', style: 'destructive', onPress: doRegen },
      ],
    );
  }

  async function doRegen() {
    setRegen(true);
    try {
      const { data, error } = await regenerateCheckinToken();
      if (error) throw error;
      setLab(prev => prev ? { ...prev, checkin_token: data!.checkin_token } : null);
      toast.success('Yeni QR kodu oluşturuldu.');
    } catch (e: any) {
      toast.error(e?.message ?? 'Yenileme başarısız.');
    }
    setRegen(false);
  }

  // ── Paylaş/Kopyala ───────────────────────────────────────────────────────
  async function shareQr() {
    if (!lab) return;
    const url = `${APP_URL}?token=${lab.checkin_token}`;
    await Share.share({ message: `QR Check-in URL: ${url}` });
  }

  const qrValue = lab ? `${APP_URL}?token=${lab.checkin_token}` : '';

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View style={[s.headerIcon, { backgroundColor: accentColor + '15' }]}>
            <Feather name="camera" size={22} color={accentColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>QR Check-in Ayarları</Text>
            <Text style={s.headerSub}>Çalışanlar bu QR kodu okutarak giriş/çıkış yapar</Text>
          </View>
        </View>

        {/* ── QR Code Card ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>QR Kodu</Text>
          <Text style={s.cardSub}>Bu kodu lab girişine asın veya yazdırın</Text>

          <View style={s.qrWrapper}>
            {lab?.checkin_token ? (
              <QRCode
                value={qrValue}
                size={200}
                color="#0F172A"
                backgroundColor="#FFFFFF"
                logo={undefined}
              />
            ) : (
              <View style={s.qrPlaceholder}>
                <Feather name="alert-circle" size={32} color="#CBD5E1" />
                <Text style={s.qrPlaceholderText}>QR token yükleniyor...</Text>
              </View>
            )}
          </View>

          {lab?.checkin_token && (
            <View style={s.tokenRow}>
              <Text style={s.tokenLabel}>Token:</Text>
              <Text style={s.tokenValue} numberOfLines={1}>
                {lab.checkin_token.slice(0, 18)}...
              </Text>
            </View>
          )}

          <View style={s.qrActions}>
            <TouchableOpacity style={[s.qrBtn, { borderColor: accentColor }]} onPress={shareQr}>
              <Feather name="share-2" size={15} color={accentColor} />
              <Text style={[s.qrBtnText, { color: accentColor }]}>Paylaş</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.qrBtn, { borderColor: '#DC2626' }]}
              onPress={confirmRegen}
              disabled={regen}
            >
              {regen
                ? <ActivityIndicator size="small" color="#DC2626" />
                : <Feather name="refresh-cw" size={15} color="#DC2626" />
              }
              <Text style={[s.qrBtnText, { color: '#DC2626' }]}>Yenile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── GPS Location Card ── */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle}>GPS Konum Kısıtlaması</Text>
            <TouchableOpacity style={s.gpsBtn} onPress={getCurrentLocation}>
              <Feather name="crosshair" size={14} color={accentColor} />
              <Text style={[s.gpsBtnText, { color: accentColor }]}>Şu An</Text>
            </TouchableOpacity>
          </View>
          <Text style={s.cardSub}>
            Boş bırakılırsa GPS kontrolü yapılmaz (sadece QR yeterli)
          </Text>

          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Enlem (Latitude)</Text>
              <TextInput
                style={s.input}
                value={lat}
                onChangeText={setLat}
                placeholder="41.0082376"
                keyboardType="decimal-pad"
                placeholderTextColor="#CBD5E1"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Boylam (Longitude)</Text>
              <TextInput
                style={s.input}
                value={lng}
                onChangeText={setLng}
                placeholder="28.9783589"
                keyboardType="decimal-pad"
                placeholderTextColor="#CBD5E1"
              />
            </View>
          </View>

          <View style={{ marginTop: 4 }}>
            <Text style={s.label}>İzin Verilen Yarıçap (metre)</Text>
            <TextInput
              style={[s.input, { width: 140 }]}
              value={radius}
              onChangeText={setRadius}
              placeholder="150"
              keyboardType="number-pad"
              placeholderTextColor="#CBD5E1"
            />
            <Text style={s.hint}>
              Varsayılan 150m. QR tarandığında çalışanın bu mesafe içinde olması gerekir.
            </Text>
          </View>
        </View>

        {/* ── Info card ── */}
        <View style={[s.infoCard, { borderLeftColor: accentColor }]}>
          <Feather name="info" size={16} color={accentColor} style={{ marginTop: 2 }} />
          <Text style={s.infoText}>
            GPS'siz check-in için çalışanın sadece QR'ı okuması yeterlidir.
            GPS etkinleştirilirse, çalışanın konum izni vermesi gerekir ve
            belirlenen yarıçap dışındaysa giriş reddedilir.
            {'\n\n'}
            Yetkili kişi (müdür/admin) gerektiğinde İzin & Devam ekranından
            manuel olarak giriş/çıkış kaydı ekleyebilir.
          </Text>
        </View>

        {/* ── Save Button ── */}
        <TouchableOpacity
          style={[s.saveBtn, { backgroundColor: accentColor }, saving && s.saveBtnDisabled]}
          onPress={save}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Feather name="save" size={18} color="#fff" />
          }
          <Text style={s.saveBtnText}>{saving ? 'Kaydediliyor...' : 'Konum Ayarlarını Kaydet'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 20, gap: 16, maxWidth: 640, alignSelf: 'center', width: '100%' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: F.bold,
    fontSize: FS.lg,
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontFamily: F.regular,
    fontSize: FS.sm,
    color: C.textSecondary,
    marginTop: 2,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    gap: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontFamily: F.semibold,
    fontSize: FS.md,
    color: C.textPrimary,
  },
  cardSub: {
    fontFamily: F.regular,
    fontSize: FS.sm,
    color: C.textSecondary,
    marginTop: -4,
  },

  qrWrapper: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    alignSelf: 'center',
  },
  qrPlaceholder: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  qrPlaceholderText: {
    fontFamily: F.regular,
    fontSize: FS.sm,
    color: '#94A3B8',
  },

  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
  },
  tokenLabel: {
    fontFamily: F.semibold,
    fontSize: FS.xs,
    color: C.textSecondary,
  },
  tokenValue: {
    fontFamily: F.regular,
    fontSize: FS.xs,
    color: C.textPrimary,
    flex: 1,
  },

  qrActions: {
    flexDirection: 'row',
    gap: 10,
  },
  qrBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 10,
  },
  qrBtnText: {
    fontFamily: F.semibold,
    fontSize: FS.sm,
  },

  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  gpsBtnText: {
    fontFamily: F.semibold,
    fontSize: FS.xs,
  },

  row: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontFamily: F.semibold,
    fontSize: FS.xs,
    color: C.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: F.regular,
    fontSize: FS.md,
    color: C.textPrimary,
    backgroundColor: '#F8FAFC',
  },
  hint: {
    fontFamily: F.regular,
    fontSize: FS.xs,
    color: C.textSecondary,
    marginTop: 6,
    lineHeight: 17,
  },

  infoCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
  },
  infoText: {
    fontFamily: F.regular,
    fontSize: FS.sm,
    color: '#0369A1',
    lineHeight: 20,
    flex: 1,
  },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
    marginBottom: 24,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    fontFamily: F.bold,
    fontSize: FS.md,
    color: '#fff',
  },
});
