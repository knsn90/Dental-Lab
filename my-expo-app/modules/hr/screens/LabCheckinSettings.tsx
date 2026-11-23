/**
 * LabCheckinSettings — QR Check-in ayarları.
 *
 * Kullanıldığı yerler: Ayarlar hub'ı (başlığı hub verir) ve tek başına
 * /(lab)/checkin-settings · /(admin)/checkin-settings rotaları (başlığı kendisi çizer).
 *
 * Konum kuralı (sunucu: qr_checkin, migration 20261123130000):
 *   konum tanımlı  → personel konum izni vermek ve yarıçap içinde olmak ZORUNDA
 *   konum tanımsız → QR'ı okutmak yeterli (mesafe kontrolü yok)
 * Ekrandaki durum satırı ve açıklamalar bu kuralı birebir anlatır.
 */
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform, Share,
  Image, Linking, useWindowDimensions,
} from 'react-native';
import * as Location from 'expo-location';
import {
  QrCode, MapPin, Crosshair, RefreshCw, Printer, Copy, Check, AlertCircle,
  ShieldCheck, ExternalLink, Share2,
} from '../../../core/ui/icons';
import { BrandedQR } from '../../../core/ui/BrandedQR';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { HubContext } from '../../../core/ui/HubContext';
import { PAGE_PADDING, CARD_GAP } from '../../../core/ui/pageMetrics';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useInkUI } from '../../../core/theme/inkScale';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { supabase } from '../../../core/api/supabase';
import { autoT } from '../../../core/i18n/autoTranslate';
import { toast } from '../../../core/ui/Toast';
import {
  fetchLabLocation, updateLabLocation, regenerateCheckinToken,
  type LabLocation,
} from '../api';

const WEB = Platform.OS === 'web';
const DANGER = '#DC2626';
const RADIUS_PRESETS = [50, 100, 150, 250, 500];

// Check-in hedefi — çalışılan origin'den türetilir (native/fallback siman.app).
const APP_URL =
  typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/checkin`
    : 'https://siman.app/checkin';

interface Props { accentColor?: string }

/** "41,0082" / " 41.0082 " → 41.0082; boş → null; geçersiz → NaN */
function parseCoord(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Yarıçap çemberi için Static Maps path noktaları (kabaca, 24 köşe). */
function circlePath(lat: number, lng: number, r: number): string {
  const pts: string[] = [];
  const dLat = r / 111320;
  const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    pts.push(`${(lat + dLat * Math.sin(a)).toFixed(6)},${(lng + dLng * Math.cos(a)).toFixed(6)}`);
  }
  return pts.join('|');
}

export function LabCheckinSettings({ accentColor = '#004B87' }: Props) {
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const inHub = useContext(HubContext);
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const A = accentColor;

  const [lab, setLab] = useState<LabLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [mapsKey, setMapsKey] = useState<string | null>(null);

  // QR eylemleri
  const [regen, setRegen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  // Konum formu
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState(150);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = useCallback((d: LabLocation | null) => {
    setLat(d?.location_lat != null ? String(d.location_lat) : '');
    setLng(d?.location_lng != null ? String(d.location_lng) : '');
    setRadius(d?.location_radius ?? 150);
    setFormError(null);
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await fetchLabLocation();
    if (error || !data) { setLoadError(error?.message ?? autoT('Laboratuvar bilgisi alınamadı')); setLoading(false); return; }
    setLab(data);
    resetForm(data);
    setLoading(false);
  }, [resetForm]);

  useEffect(() => { load(); }, [load]);

  // Harita önizlemesi için etkin Google Maps anahtarı (yoksa yalnız "Haritada aç")
  useEffect(() => {
    let alive = true;
    supabase.rpc('get_active_provider', { p_type: 'maps' }).then(({ data }) => {
      const m: any = Array.isArray(data) ? data[0] : data;
      if (alive && m?.provider === 'google-maps' && m?.credentials?.api_key) setMapsKey(m.credentials.api_key);
    }, () => {});
    return () => { alive = false; };
  }, []);

  const qrValue = lab?.checkin_token ? `${APP_URL}?token=${lab.checkin_token}` : '';

  // ── Form durumu ─────────────────────────────────────────────────────────
  const latN = parseCoord(lat);
  const lngN = parseCoord(lng);
  const coordsValid =
    latN != null && lngN != null && !Number.isNaN(latN) && !Number.isNaN(lngN)
    && Math.abs(latN) <= 90 && Math.abs(lngN) <= 180;
  const savedOn = lab?.location_lat != null && lab?.location_lng != null;
  const dirty = !!lab && (
    (latN ?? null) !== (lab.location_lat ?? null)
    || (lngN ?? null) !== (lab.location_lng ?? null)
    || radius !== (lab.location_radius ?? 150)
  );
  const presets = useMemo(
    () => (RADIUS_PRESETS.includes(radius) ? RADIUS_PRESETS : [...RADIUS_PRESETS, radius].sort((a, b) => a - b)),
    [radius],
  );

  // ── Eylemler ────────────────────────────────────────────────────────────
  async function useCurrentLocation() {
    setFormError(null);
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { setFormError(autoT('Konum izni verilmedi. Tarayıcı veya cihaz ayarlarından izin verip tekrar deneyin.')); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLat(loc.coords.latitude.toFixed(7));
      setLng(loc.coords.longitude.toFixed(7));
    } catch (e: any) {
      setFormError(autoT('Konum alınamadı. Koordinatları elle girebilirsiniz.'));
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    setFormError(null);
    const bothEmpty = latN == null && lngN == null;
    if (!bothEmpty && !coordsValid) {
      setFormError(autoT('Enlem −90…90, boylam −180…180 arasında olmalı; ikisi birlikte girilmeli.'));
      return;
    }
    setSaving(true);
    const { error } = await updateLabLocation({ lat: bothEmpty ? null : latN, lng: bothEmpty ? null : lngN, radius });
    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setLab(prev => (prev ? { ...prev, location_lat: bothEmpty ? null : latN, location_lng: bothEmpty ? null : lngN, location_radius: radius } as LabLocation : prev));
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function clearLocation() {
    setLat(''); setLng(''); setFormError(null);
  }

  async function copyLink() {
    setQrError(null);
    if (!qrValue) return;
    try {
      if (WEB && (navigator as any)?.clipboard?.writeText) {
        await (navigator as any).clipboard.writeText(qrValue);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } else {
        await Share.share({ message: qrValue });
      }
    } catch {
      setQrError(autoT('Bağlantı kopyalanamadı.'));
    }
  }

  async function printPoster(size: 'A4' | 'A5') {
    setQrError(null);
    if (!lab?.checkin_token) return;
    if (!WEB || typeof window === 'undefined') { setQrError(autoT('Poster yazdırma yalnızca web üzerinden yapılabilir.')); return; }
    const { buildCheckinPosterHtml } = await import('../../../lib/printCheckinPoster');
    const html = buildCheckinPosterHtml({ qrUrl: qrValue, labName: lab.name, size });
    const w = window.open('', '_blank');
    if (!w) { setQrError(autoT('Açılır pencere engellendi. Tarayıcıda bu siteye izin verin.')); return; }
    w.document.write(html);
    w.document.close();
  }

  function confirmRegen() {
    setConfirm({
      title: autoT('QR kodu yenile'),
      message: autoT('Mevcut QR kod ve basılmış posterler hemen geçersiz olur; yeni posteri yazdırıp asmanız gerekir.'),
      label: autoT('Evet, yenile'),
      variant: 'warning',
      onConfirm: async () => {
        setConfirm(null);
        setRegen(true);
        setQrError(null);
        const { data, error } = await regenerateCheckinToken();
        setRegen(false);
        if (error || !data) { setQrError(error?.message ?? autoT('Yenileme başarısız.')); return; }
        setLab(prev => (prev ? { ...prev, checkin_token: data.checkin_token } : prev));
        toast.success(autoT('Yeni QR kodu oluşturuldu. Posteri yeniden yazdırın.'));
      },
    });
  }

  // ── Görünüm ─────────────────────────────────────────────────────────────
  if (loading) {
    return <View style={{ alignItems: 'center', paddingVertical: 80 }}><ActivityIndicator size="large" color={A} /></View>;
  }
  if (loadError) {
    return (
      <View style={{ padding: PAGE_PADDING, alignItems: 'center', gap: 8, paddingVertical: 60 }}>
        <AlertCircle size={28} color={DANGER} strokeWidth={1.8} />
        <Text style={{ fontSize: 13, color: T.ink2, textAlign: 'center' }}>{loadError}</Text>
      </View>
    );
  }

  const card = { backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.hairline, padding: 18 } as const;
  const secondaryBtn = {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 14, height: 40, borderRadius: 999,
    backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
  } as const;
  const tone = savedOn ? U.chipTones.success : U.chipTones.warning;

  const mapUrl = coordsValid && mapsKey
    ? 'https://maps.googleapis.com/maps/api/staticmap'
      + `?size=640x260&scale=2&maptype=roadmap&language=tr`
      + `&markers=size:mid%7Ccolor:red%7C${latN},${lngN}`
      + `&path=color:0x${A.replace('#', '')}CC%7Cweight:2%7Cfillcolor:0x${A.replace('#', '')}22%7C${encodeURIComponent(circlePath(latN!, lngN!, radius)).replace(/%7C/gi, '%7C')}`
      + `&key=${mapsKey}`
    : null;

  // ── QR kartı ──
  const qrCard = (
    <View style={[card, { gap: 16, flex: wide ? 1 : undefined }]}>
      <View style={{ gap: 3 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: T.ink }}>Giriş QR kodu</Text>
        <Text style={{ fontSize: 12.5, color: T.ink2, lineHeight: 18 }}>
          Personel bu kodu okutarak giriş ve çıkış yapar. Posteri laboratuvar girişine asın.
        </Text>
      </View>

      {/* QR her temada beyaz zeminde kalır (okunabilirlik) */}
      <View style={{ alignSelf: 'center', padding: 16, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
        {qrValue ? (
          <BrandedQR value={qrValue} size={184} color="#0A0A0A" backgroundColor="#FFFFFF" />
        ) : (
          <View style={{ width: 184, height: 184, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <QrCode size={28} color="#9A9A9A" strokeWidth={1.6} />
            <Text style={{ fontSize: 12, color: '#6B6B6B' }}>QR kodu oluşturulmamış</Text>
          </View>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => printPoster('A4')}
            disabled={!qrValue}
            accessibilityRole="button"
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 42, borderRadius: 999, backgroundColor: A, opacity: qrValue ? 1 : 0.5, ...(WEB ? { cursor: 'pointer' } as any : {}) }}
          >
            <Printer size={15} color="#FFFFFF" strokeWidth={2} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>A4 poster yazdır</Text>
          </Pressable>
          <GlassTooltip title={autoT('A5 poster')} text={autoT('Daha küçük kağıda yazdırmak için A5 boyutunda poster')}>
            <Pressable onPress={() => printPoster('A5')} disabled={!qrValue} accessibilityRole="button" style={[secondaryBtn, WEB ? ({ cursor: 'pointer' } as any) : null]}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>A5</Text>
            </Pressable>
          </GlassTooltip>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={copyLink} disabled={!qrValue} accessibilityRole="button" style={[secondaryBtn, { flex: 1 }, WEB ? ({ cursor: 'pointer' } as any) : null]}>
            {copied
              ? <Check size={14} color="#059669" strokeWidth={2.4} />
              : WEB ? <Copy size={14} color={U.plainBtn.fg} strokeWidth={1.9} /> : <Share2 size={14} color={U.plainBtn.fg} strokeWidth={1.9} />}
            <Text style={{ fontSize: 13, fontWeight: '600', color: copied ? '#059669' : U.plainBtn.fg }}>
              {copied ? autoT('Kopyalandı') : WEB ? autoT('Bağlantıyı kopyala') : autoT('Bağlantıyı paylaş')}
            </Text>
          </Pressable>
          <GlassTooltip title={autoT('QR kodu yenile')} text={autoT('Eski kod ve basılmış posterler geçersiz olur; QR sızdıysa kullanın')}>
            <Pressable onPress={confirmRegen} disabled={regen} accessibilityRole="button" accessibilityLabel={autoT('QR kodu yenile')} style={[secondaryBtn, WEB ? ({ cursor: 'pointer' } as any) : null]}>
              {regen ? <ActivityIndicator size="small" color={U.plainBtn.fgMuted} /> : <RefreshCw size={14} color={U.plainBtn.fgMuted} strokeWidth={1.9} />}
              <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fgMuted }}>Yenile</Text>
            </Pressable>
          </GlassTooltip>
        </View>

        {!!qrError && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={13} color={DANGER} strokeWidth={2} />
            <Text style={{ flex: 1, fontSize: 12, color: DANGER }}>{qrError}</Text>
          </View>
        )}
      </View>
    </View>
  );

  // ── Konum kartı ──
  const locationCard = (
    <View style={[card, { gap: 16, flex: wide ? 1.25 : undefined }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: T.ink }}>Konum kontrolü</Text>
          <Text style={{ fontSize: 12.5, color: T.ink2, lineHeight: 18 }}>
            Konum girilirse personel giriş için telefonda konum izni vermek ve laboratuvara yakın olmak zorundadır. Konum boşsa QR'ı okutmak yeterlidir.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: tone.bg }}>
          {savedOn ? <ShieldCheck size={13} color={tone.fg} strokeWidth={2} /> : <AlertCircle size={13} color={tone.fg} strokeWidth={2} />}
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: tone.fg }}>
            {savedOn ? `${autoT('Açık')} · ${lab?.location_radius ?? 150} m` : autoT('Kapalı')}
          </Text>
        </View>
      </View>

      {!savedOn && (
        <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: U.chipTones.warning.bg }}>
          <AlertCircle size={14} color={U.chipTones.warning.fg} strokeWidth={2} />
          <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: U.chipTones.warning.fg }}>
            Şu an mesafe kontrolü yok: QR'ın fotoğrafını çeken biri laboratuvar dışından da giriş yapabilir.
          </Text>
        </View>
      )}

      {/* Koordinatlar */}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: T.ink2 }}>Laboratuvar konumu</Text>
          <Pressable onPress={useCurrentLocation} disabled={locating} accessibilityRole="button" style={[secondaryBtn, { height: 34, paddingHorizontal: 12 }, WEB ? ({ cursor: 'pointer' } as any) : null]}>
            {locating ? <ActivityIndicator size="small" color={U.plainBtn.fg} /> : <Crosshair size={13} color={U.plainBtn.fg} strokeWidth={2} />}
            <Text style={{ fontSize: 12, fontWeight: '600', color: U.plainBtn.fg }}>Şu anki konumumu kullan</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 11, color: T.ink3 }}>Enlem</Text>
            <TextInput value={lat} onChangeText={t => { setLat(t); setFormError(null); }} placeholder="41.0082376" placeholderTextColor={T.ink3} keyboardType="numbers-and-punctuation" style={[U.inputStyle, { fontVariant: ['tabular-nums'] }]} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 11, color: T.ink3 }}>Boylam</Text>
            <TextInput value={lng} onChangeText={t => { setLng(t); setFormError(null); }} placeholder="28.9783589" placeholderTextColor={T.ink3} keyboardType="numbers-and-punctuation" style={[U.inputStyle, { fontVariant: ['tabular-nums'] }]} />
          </View>
        </View>
      </View>

      {/* Yarıçap */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: T.ink2 }}>İzin verilen mesafe</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {presets.map(r => {
            const on = r === radius;
            return (
              <Pressable
                key={r}
                onPress={() => setRadius(r)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{
                  paddingHorizontal: on ? 18 : 12, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: on ? A : U.plainBtn.bg, borderWidth: 1, borderColor: on ? A : U.plainBtn.border,
                  ...(WEB ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: on ? '700' : '500', color: on ? '#FFFFFF' : U.plainBtn.fg, fontVariant: ['tabular-nums'] }}>{`${r} m`}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ fontSize: 11.5, color: T.ink3, lineHeight: 16 }}>
          Telefon konumu binalarda 20–50 m sapabilir; çok küçük bir mesafe doğru kişiyi de reddedebilir.
        </Text>
      </View>

      {/* Harita önizlemesi */}
      {coordsValid && (
        <View style={{ gap: 6 }}>
          {mapUrl ? (
            <View style={{ height: 180, borderRadius: 12, overflow: 'hidden', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}>
              <Image source={{ uri: mapUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel={autoT('Laboratuvar konumu ve izin verilen mesafe')} />
            </View>
          ) : null}
          <Pressable
            onPress={() => Linking.openURL(`https://www.google.com/maps?q=${latN},${lngN}`)}
            accessibilityRole="link"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 4, ...(WEB ? { cursor: 'pointer' } as any : {}) }}
          >
            <MapPin size={13} color={isDark ? '#9BC6EC' : A} strokeWidth={2} />
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: isDark ? '#9BC6EC' : A }}>Haritada kontrol et</Text>
            <ExternalLink size={12} color={isDark ? '#9BC6EC' : A} strokeWidth={2} />
          </Pressable>
        </View>
      )}

      {/* Kaydet satırı — hata/sonuç düğmenin yanında */}
      <View style={{ gap: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: T.hairline }}>
        {!!formError && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10 }}>
            <AlertCircle size={13} color={DANGER} strokeWidth={2} />
            <Text style={{ flex: 1, fontSize: 12, color: DANGER }}>{formError}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, flexWrap: 'wrap' }}>
          {(lat || lng) ? (
            <Pressable onPress={clearLocation} accessibilityRole="button" style={{ paddingVertical: 8, paddingHorizontal: 4, ...(WEB ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: T.ink3 }}>Konumu kaldır</Text>
            </Pressable>
          ) : null}
          <View style={{ flex: 1, minWidth: 8 }} />
          {saved && !dirty && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Check size={13} color="#059669" strokeWidth={2.6} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#059669' }}>Kaydedildi</Text>
            </View>
          )}
          {dirty && (
            <>
              <Text style={{ fontSize: 12, color: T.ink3 }}>Kaydedilmemiş değişiklik</Text>
              <Pressable onPress={() => resetForm(lab)} accessibilityRole="button" style={[secondaryBtn, { height: 38 }, WEB ? ({ cursor: 'pointer' } as any) : null]}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>Vazgeç</Text>
              </Pressable>
            </>
          )}
          <Pressable
            onPress={save}
            disabled={!dirty || saving}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 18, borderRadius: 999, backgroundColor: A, opacity: !dirty || saving ? 0.45 : 1, ...(WEB ? { cursor: dirty ? 'pointer' : 'default' } as any : {}) }}
          >
            {saving && <ActivityIndicator size="small" color="#FFFFFF" />}
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>{saving ? autoT('Kaydediliyor…') : autoT('Kaydet')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: PAGE_PADDING, gap: CARD_GAP, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      {!inHub && (
        <View style={{ gap: 2, marginBottom: 4 }}>
          <Text style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300', fontSize: 24, letterSpacing: -0.6, color: T.ink }}>QR Check-in</Text>
          <Text style={{ fontSize: 13, color: T.ink2 }}>Personelin QR ile giriş-çıkış ayarları</Text>
        </View>
      )}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: CARD_GAP, alignItems: wide ? 'flex-start' : 'stretch' }}>
        {qrCard}
        {locationCard}
      </View>

      <Text style={{ fontSize: 11.5, color: T.ink3, lineHeight: 16, paddingHorizontal: 4 }}>
        Gerektiğinde lab yöneticisi, İzin & Devam ekranından elle giriş/çıkış kaydı ekleyebilir.
      </Text>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </ScrollView>
  );
}
