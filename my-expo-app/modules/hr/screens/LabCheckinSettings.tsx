/**
 * LabCheckinSettings — QR Check-in Ayarları (Patterns Design Language)
 *
 *  • Şeffaf arka plan — hub krem zeminini kullanır
 *  • Panel-aware accentColor (admin coral default)
 *  • Lucide ikonlar (QrCode, MapPin, Crosshair, Share2, RefreshCw, …)
 *  • ConfirmDialog (Alert.alert yerine)
 *  • Display 300 başlık + soft tinted ikon dairesi
 *  • Yetki: sadece manager veya admin görebilir
 */
import React, { useEffect, useState } from "react";
import { useMobileTokens } from "../../../core/theme/mobileDesignTokens";
import { useThemeModeStore } from "../../../core/store/themeModeStore";
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Platform, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  QrCode, MapPin, Crosshair, Share2, RefreshCw,
  Save, Info, AlertCircle, Printer,
} from '../../../core/ui/icons';
import * as Location from 'expo-location';

import { BrandedQR } from '../../../core/ui/BrandedQR';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { DS } from '../../../core/theme/dsTokens';
import { toast } from '../../../core/ui/Toast';

import {
  fetchLabLocation, updateLabLocation, regenerateCheckinToken,
  type LabLocation,
} from '../api';

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// ─── Public checkin URL base ─────────────────────────────────────────────────
// Check-in hedefi — domaine bağlanmadan, çalışılan origin'den türetilir
// (web'de deploy edilen domain neyse onu kullanır; native/fallback siman.app).
const APP_URL =
  typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/checkin`
    : 'https://siman.app/checkin';

interface Props {
  accentColor?: string;
}

export function LabCheckinSettings({ accentColor = '#4771AB' }: Props) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  const [lab, setLab]         = useState<LabLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [regen, setRegen]     = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  // form state
  const [lat, setLat]       = useState('');
  const [lng, setLng]       = useState('');
  const [radius, setRadius] = useState('150');

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
    setConfirm({
      title: 'QR kodu yenile',
      message: 'Mevcut QR kod geçersiz olacak. Yeni QR kodu bastırmanız gerekecek.',
      label: 'Evet, yenile',
      variant: 'warning',
      onConfirm: async () => {
        setConfirm(null);
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
      },
    });
  }

  // ── Paylaş ───────────────────────────────────────────────────────────────
  async function shareQr() {
    if (!lab) return;
    const url = `${APP_URL}?token=${lab.checkin_token}`;
    await Share.share({ message: `QR Check-in URL: ${url}` });
  }

  // ── A4/A5 poster yazdır (web) ─────────────────────────────────────────────
  async function printPoster(size: 'A4' | 'A5') {
    if (!lab?.checkin_token) { toast.error('QR token yüklenmedi.'); return; }
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      toast.error('Poster yazdırma yalnızca web üzerinden yapılabilir.');
      return;
    }
    const { buildCheckinPosterHtml } = await import('../../../lib/printCheckinPoster');
    const html = buildCheckinPosterHtml({ qrUrl: qrValue, labName: lab.name, size });
    const w = window.open('', '_blank');
    if (!w) { toast.error('Açılır pencere engellendi. İzin verin.'); return; }
    w.document.write(html);
    w.document.close();
  }

  const qrValue = lab ? `${APP_URL}?token=${lab.checkin_token}` : '';

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 720, alignSelf: 'center', width: '100%', paddingBottom: 60 }}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 }}>
          <View style={{
            width: 44, height: 44, borderRadius: 14,
            backgroundColor: accentColor + '14',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <QrCode size={20} color={accentColor} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, color: isDark ? T.ink : DS.ink[900], letterSpacing: -0.4 }}>
              QR Check-in
            </Text>
            <Text style={{ fontSize: 13, color: isDark ? T.ink3 : DS.ink[500], marginTop: 2 }}>
              Ekip bu QR kodu okutarak giriş/çıkış yapar
            </Text>
          </View>
        </View>

        {/* ── QR Code Card ──────────────────────────────────────────── */}
        <View style={[cardStyle, isDark ? { backgroundColor: T.card, borderColor: T.hairline } : null]}>
          <View style={{ marginBottom: 12 }}>
            <Text style={{ ...DISPLAY, fontSize: 18, color: isDark ? T.ink : DS.ink[900], letterSpacing: -0.3 }}>QR Kodu</Text>
            <Text style={{ fontSize: 12, color: isDark ? T.ink3 : DS.ink[500], marginTop: 3 }}>
              Bu kodu lab girişine asın veya yazdırın
            </Text>
          </View>

          {/* QR */}
          <View style={{
            alignSelf: 'center',
            padding: 20,
            backgroundColor: isDark ? T.card : "#FFFFFF",
            borderRadius: 16,
            borderWidth: 1, borderColor: isDark ? T.hairline : 'rgba(0,0,0,0.06)',
            marginBottom: 14,
          }}>
            {lab?.checkin_token ? (
              <BrandedQR
                value={qrValue}
                size={200}
                color={DS.ink[900]}
                backgroundColor="#FFFFFF"
              />
            ) : (
              <View style={{ width: 200, height: 200, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <AlertCircle size={32} color={isDark ? T.ink3 : DS.ink[300]} strokeWidth={1.6} />
                <Text style={{ fontSize: 13, color: isDark ? T.ink3 : DS.ink[400] }}>QR token yükleniyor…</Text>
              </View>
            )}
          </View>

          {/* Token chip */}
          {lab?.checkin_token && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              backgroundColor: isDark ? T.cardSoft : "#FAFAFA", borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 10,
              marginBottom: 12,
            }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? T.ink3 : DS.ink[500], letterSpacing: 0.6, textTransform: 'uppercase' }}>
                Token
              </Text>
              <Text style={{ flex: 1, fontSize: 12, color: isDark ? T.ink : DS.ink[800], fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }} numberOfLines={1}>
                {lab.checkin_token.slice(0, 18)}…
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={shareQr}
              style={{
                flex: 1,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 11, borderRadius: 12,
                borderWidth: 1.5, borderColor: accentColor,
                backgroundColor: accentColor + '08',
                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
              }}
            >
              <Share2 size={14} color={accentColor} strokeWidth={1.8} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: accentColor }}>Paylaş</Text>
            </Pressable>
            <Pressable
              onPress={confirmRegen}
              disabled={regen}
              style={{
                flex: 1,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 11, borderRadius: 12,
                borderWidth: 1.5, borderColor: '#DC2626',
                backgroundColor: 'rgba(220,38,38,0.06)',
                opacity: regen ? 0.6 : 1,
                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
              }}
            >
              {regen ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <RefreshCw size={14} color="#DC2626" strokeWidth={1.8} />
              )}
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#DC2626' }}>Yenile</Text>
            </Pressable>
          </View>

          {/* Poster yazdır — girişe asmak için A4/A5 */}
          {lab?.checkin_token && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {(['A4', 'A5'] as const).map(sz => (
                <Pressable
                  key={sz}
                  onPress={() => printPoster(sz)}
                  style={{
                    flex: 1,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    paddingVertical: 11, borderRadius: 12,
                    borderWidth: 1, borderColor: isDark ? T.hairline : DS.ink[200],
                    backgroundColor: isDark ? T.card : "#FFFFFF",
                    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                  }}
                >
                  <Printer size={14} color={isDark ? T.ink2 : DS.ink[700]} strokeWidth={1.8} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? T.ink : DS.ink[800] }}>{sz} Poster</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* ── GPS Location Card ──────────────────────────────────────── */}
        <View style={[cardStyle, isDark ? { backgroundColor: T.card, borderColor: T.hairline } : null]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MapPin size={16} color={accentColor} strokeWidth={1.8} />
                <Text style={{ ...DISPLAY, fontSize: 18, color: isDark ? T.ink : DS.ink[900], letterSpacing: -0.3 }}>
                  GPS Konumu
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: isDark ? T.ink3 : DS.ink[500], marginTop: 4 }}>
                Konum girilmeli — boş bırakılırsa QR ile giriş reddedilir (mesafe kontrolü zorunlu)
              </Text>
            </View>
            <Pressable
              onPress={getCurrentLocation}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
                backgroundColor: accentColor + '14',
                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
              }}
            >
              <Crosshair size={13} color={accentColor} strokeWidth={1.8} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }}>Şu An</Text>
            </Pressable>
          </View>

          {/* Lat / Lng */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[fieldLabel, isDark ? { color: T.ink3 } : null]}>Enlem (Latitude)</Text>
              <TextInput
                style={[inputStyle, isDark ? { backgroundColor: T.cardSoft, borderColor: T.hairline, color: T.ink } : null]}
                value={lat}
                onChangeText={setLat}
                placeholder="41.0082376"
                keyboardType="decimal-pad"
                placeholderTextColor={isDark ? T.ink3 : DS.ink[400]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[fieldLabel, isDark ? { color: T.ink3 } : null]}>Boylam (Longitude)</Text>
              <TextInput
                style={[inputStyle, isDark ? { backgroundColor: T.cardSoft, borderColor: T.hairline, color: T.ink } : null]}
                value={lng}
                onChangeText={setLng}
                placeholder="28.9783589"
                keyboardType="decimal-pad"
                placeholderTextColor={isDark ? T.ink3 : DS.ink[400]}
              />
            </View>
          </View>

          {/* Radius */}
          <View>
            <Text style={[fieldLabel, isDark ? { color: T.ink3 } : null]}>İzin Verilen Yarıçap (metre)</Text>
            <TextInput
              style={[inputStyle, { width: 160 }, isDark ? { backgroundColor: T.cardSoft, borderColor: T.hairline, color: T.ink } : null]}
              value={radius}
              onChangeText={setRadius}
              placeholder="150"
              keyboardType="number-pad"
              placeholderTextColor={isDark ? T.ink3 : DS.ink[400]}
            />
            <Text style={{ fontSize: 11, color: isDark ? T.ink3 : DS.ink[400], marginTop: 6, lineHeight: 16 }}>
              Varsayılan 150m. QR tarandığında personelın bu mesafe içinde olması gerekir.
            </Text>
          </View>
        </View>

        {/* ── Info card ──────────────────────────────────────────────── */}
        <View style={{
          flexDirection: 'row', gap: 12,
          backgroundColor: accentColor + '08',
          borderRadius: 14,
          padding: 14,
          borderWidth: 1, borderColor: accentColor + '20',
        }}>
          <View style={{
            width: 28, height: 28, borderRadius: 9,
            backgroundColor: accentColor + '18',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Info size={14} color={accentColor} strokeWidth={1.8} />
          </View>
          <Text style={{ flex: 1, fontSize: 12, color: isDark ? T.ink2 : DS.ink[700], lineHeight: 18 }}>
            GPS'siz check-in için personelın sadece QR'ı okuması yeterlidir.
            GPS etkinleştirilirse, personelın konum izni vermesi gerekir ve
            belirlenen yarıçap dışındaysa giriş reddedilir.
            {'\n\n'}
            Yetkili kişi (müdür/admin) gerektiğinde İzin & Devam ekranından
            manuel olarak giriş/çıkış kaydı ekleyebilir.
          </Text>
        </View>

        {/* ── Save Button — Patterns §13 dark + accent dot ─────────── */}
        <Pressable
          onPress={save}
          disabled={saving}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            paddingVertical: 14, borderRadius: 999,
            backgroundColor: DS.ink[900],
            opacity: saving ? 0.6 : 1,
            marginTop: 4,
            ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
          }}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: accentColor }} />
              <Save size={15} color="#FFFFFF" strokeWidth={1.8} />
            </>
          )}
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
            {saving ? 'Kaydediliyor…' : 'Konum Ayarlarını Kaydet'}
          </Text>
        </Pressable>

      </ScrollView>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </SafeAreaView>
  );
}

// ─── Style helpers ──────────────────────────────────────────────────────────
const cardStyle: any = {
  backgroundColor: "#FFFFFF",
  borderRadius: 18,
  padding: 18,
  borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
  ...Platform.select({
    web:     { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } as any,
    default: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  }),
};

const fieldLabel: any = {
  fontSize: 10, fontWeight: '600',
  color: DS.ink[500],
  letterSpacing: 0.6, textTransform: 'uppercase',
  marginBottom: 6,
};

const inputStyle: any = {
  height: 44, borderRadius: 14, borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.08)',
  paddingHorizontal: 14,
  fontSize: 14, color: DS.ink[900],
  backgroundColor: "#FFFFFF",
  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
};
