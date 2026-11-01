/**
 * AddressFields — İl / İlçe / Mahalle dropdown'ları (DB destekli)
 *                 + Sokak text input (Nominatim autocomplete önerileri)
 *
 *  ClinicsScreen ile aynı veri kaynağı:
 *    • RPC get_iller          → 81 il (PTT)
 *    • RPC get_ilceler        → ile bağlı ilçeler
 *    • RPC get_mahalleler     → ilçeye bağlı mahalle + posta kodu
 *    • Nominatim OSM API      → sokak / cadde önerileri (klinik düzeyinde)
 *
 *  Static fallback: RPC fail olursa core/data/turkeyLocations'a düşer.
 *
 *  Ülke (2026-10-23): CountryField — yeni formda IP → saat dilimi → Türkiye ile önden
 *  seçilir, kullanıcı değiştirebilir. Kayıt ekranları onu formun EN ÜSTÜNE koyar (Google
 *  kurum araması o ülkede yapılır) ve AddressFields'e showCountry={false} verir.
 *  Türkiye dışında il/ilçe listeleri yerine serbest metin (il = eyalet/bölge, ilce = şehir).
 *  Kayıt JSON'dur — admin "Yeni Sağlık Kurumu" formuyla AYNI biçim
 *  ({ulke, il, ilce, mahalle, sokak, bina_no, daire_no, posta_kodu}).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Platform, Pressable } from 'react-native';
import { MapPin, Home, AlertCircle, Search } from '../../../core/ui/icons';
import { DS } from '../../../core/theme/dsTokens';
import { ILLER, ILCELER } from '../../../core/data/turkeyLocations';
import { DropdownField } from './DropdownField';
import { supabase } from '../../../core/api/supabase';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import i18n from 'i18next';
import { DEFAULT_COUNTRY, countryName, countryOptions, isCountryCode } from '../../../core/data/countries';
import { detectCountry } from '../../../core/geo/detectCountry';
import type { PlaceDetails } from '../api/places';

const GREEN = DS.clinic.primary;

export interface AddressData {
  /** ISO ülke kodu; boşsa form açılışında tahmin edilir (yoksa TR) */
  ulke?: string;
  il: string;
  ilce: string;
  mahalle: string;
  sokak: string;
  bina_no?: string;
  daire_no?: string;
  posta_kodu?: string;
}

interface Props {
  value: AddressData;
  onChange: (data: AddressData) => void;
  errors?: Partial<Record<keyof AddressData, string>>;
  /** false → ülke burada çizilmez (ekran CountryField'i formun başına koyar) */
  showCountry?: boolean;
}

/**
 * Ülke seçimi — değer yoksa form açılışında bir kez tahmin edilir (IP → saat dilimi → TR).
 * Ülke değişince il/ilçe/mahalle/posta kodu sıfırlanır (başka ülkenin listesi geçersiz).
 */
export function CountryField({ value, onChange }: { value: AddressData; onChange: (data: AddressData) => void }) {
  const ulke = value.ulke || DEFAULT_COUNTRY;
  const lang = i18n.language;
  const countryOpts = countryOptions(lang);
  const latest = React.useRef(value);
  latest.current = value;
  useEffect(() => {
    if (value.ulke) return;
    let alive = true;
    detectCountry().then((c) => {
      if (alive && !latest.current.ulke) onChange({ ...latest.current, ulke: c });
    });
    return () => { alive = false; };
  }, []);
  const selectCountry = (name: string) => {
    const code = countryOpts.find((o) => o.name === name)?.code;
    if (!code || code === ulke) return;
    onChange({ ...value, ulke: code, il: '', ilce: '', mahalle: '', posta_kodu: '' });
  };
  return (
    <DropdownField
      label="Ülke *"
      value={countryName(ulke, lang)}
      options={countryOpts.map((o) => o.name)}
      placeholder="Ülke seçin"
      onSelect={selectCountry}
      icon={<MapPin size={14} color={DS.ink[400]} strokeWidth={1.8} />}
    />
  );
}

export function AddressFields({ value, onChange, errors, showCountry = true }: Props) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const ulke = value.ulke || DEFAULT_COUNTRY;
  const isTR = ulke === DEFAULT_COUNTRY;
  const surface    = isDark ? '#1B1916'                : '#FFFFFF';
  const inkPrimary = isDark ? '#F7F2E9'                : DS.ink[900];
  const inkMuted   = isDark ? 'rgba(247,242,233,0.45)' : DS.ink[400];
  const border     = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  const hairline   = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
  const surfaceAlt = isDark ? '#141312'                : DS.ink[50];

  // DB-driven listeler (PTT mahalle veritabanı RPC'leri)
  const [dbIller,    setDbIller]    = useState<string[]>([]);
  const [dbIlceler,  setDbIlceler]  = useState<string[]>([]);
  const [dbMahalleler, setDbMahalleler] = useState<Array<{ mahalle: string; posta_kodu: string | null }>>([]);

  // İl listesi (bir kez)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('get_iller');
      if (Array.isArray(data) && data.length > 0) {
        setDbIller(data.map((r: any) => r.il).filter(Boolean));
      } else {
        setDbIller(ILLER); // fallback
      }
    })();
  }, []);

  // İlçeler (il değişince)
  useEffect(() => {
    if (!isTR || !value.il) { setDbIlceler([]); return; }
    (async () => {
      const { data } = await supabase.rpc('get_ilceler', { p_il: value.il });
      if (Array.isArray(data) && data.length > 0) {
        setDbIlceler(data.map((r: any) => r.ilce).filter(Boolean));
      } else {
        setDbIlceler(ILCELER[value.il] ?? []); // fallback
      }
    })();
  }, [value.il, isTR]);

  // Mahalleler (il+ilçe değişince)
  useEffect(() => {
    if (!isTR || !value.il || !value.ilce) { setDbMahalleler([]); return; }
    (async () => {
      const { data } = await supabase.rpc('get_mahalleler', { p_il: value.il, p_ilce: value.ilce });
      if (Array.isArray(data)) {
        setDbMahalleler(data.map((r: any) => ({ mahalle: r.mahalle, posta_kodu: r.posta_kodu })));
      } else {
        setDbMahalleler([]);
      }
    })();
  }, [value.il, value.ilce, isTR]);

  // Sokak suggest (Nominatim debounce 400ms)
  const [sokakSuggest, setSokakSuggest] = useState<Array<{ road: string; postcode: string | null }>>([]);
  const [sokakLoading, setSokakLoading] = useState(false);
  const [sokakFocused, setSokakFocused] = useState(false);

  useEffect(() => {
    const q = value.sokak.trim();
    if (!isTR || q.length < 2 || !value.il || !value.ilce) { setSokakSuggest([]); return; }
    let cancelled = false;
    setSokakLoading(true);
    const t = setTimeout(async () => {
      try {
        const streetParam = (value.mahalle ? `${value.mahalle} ${q}` : q).trim();
        const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=tr&limit=8&addressdetails=1`
          + `&street=${encodeURIComponent(streetParam)}`
          + `&city=${encodeURIComponent(value.ilce)}`
          + `&state=${encodeURIComponent(value.il)}`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'tr' } });
        const json = await res.json();
        if (cancelled) return;
        const seen = new Set<string>();
        const list: Array<{ road: string; postcode: string | null }> = [];
        for (const item of (Array.isArray(json) ? json : [])) {
          const road = (item?.address?.road ?? item?.address?.pedestrian ?? item?.address?.residential ?? '').trim();
          if (!road) continue;
          const key = road.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          list.push({ road, postcode: item?.address?.postcode ?? null });
          if (list.length >= 6) break;
        }
        setSokakSuggest(list);
      } catch {
        if (!cancelled) setSokakSuggest([]);
      } finally {
        if (!cancelled) setSokakLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [value.sokak, value.il, value.ilce, value.mahalle, isTR]);

  // ── Setters ─────────────────────────────────────────────────────
  const set = (key: keyof AddressData) => (val: string) => {
    if (key === 'il') {
      onChange({ ...value, il: val, ilce: '', mahalle: '' });
    } else if (key === 'ilce') {
      onChange({ ...value, ilce: val, mahalle: '' });
    } else if (key === 'mahalle') {
      // Mahalle seçilince posta kodunu otomatik doldur
      const found = dbMahalleler.find(m => m.mahalle === val);
      onChange({
        ...value,
        mahalle: val,
        posta_kodu: value.posta_kodu || (found?.posta_kodu ?? ''),
      });
    } else {
      onChange({ ...value, [key]: val });
    }
  };

  const pickSokak = (s: { road: string; postcode: string | null }) => {
    onChange({
      ...value,
      sokak: s.road,
      posta_kodu: value.posta_kodu || (s.postcode ?? ''),
    });
    setSokakSuggest([]);
    setSokakFocused(false);
  };

  return (
    <View>
      {/* Ülke — yeni formda konuma göre önden seçili (kayıt ekranlarında formun başında) */}
      {showCountry && <CountryField value={value} onChange={onChange} />}

      {!isTR ? (
        <View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <TextInputField label="Eyalet / Bölge" value={value.il} onChangeText={set('il')} placeholder="Örn: Bayern" error={errors?.il} />
            </View>
            <View style={{ flex: 1 }}>
              <TextInputField label="Şehir *" value={value.ilce} onChangeText={set('ilce')} placeholder="Örn: München" error={errors?.ilce} />
            </View>
          </View>
          <TextInputField
            label="Adres *"
            value={value.sokak}
            onChangeText={set('sokak')}
            placeholder="Cadde / sokak"
            error={errors?.sokak}
            icon={<Home size={14} color={DS.ink[400]} strokeWidth={1.8} />}
          />
          <BuildingRow value={value} set={set} binaPlaceholder="Örn: 12" />
          <TextInputField label="Posta kodu" value={value.posta_kodu ?? ''} onChangeText={set('posta_kodu')} placeholder="Örn: 80802" error={errors?.posta_kodu} />
        </View>
      ) : (
      <View>
      {/* İl + İlçe yan yana */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <DropdownField
            label="İl *"
            value={value.il}
            options={dbIller.length > 0 ? dbIller : ILLER}
            placeholder="İl seçin"
            onSelect={set('il')}
            error={errors?.il}
            icon={<MapPin size={14} color={DS.ink[400]} strokeWidth={1.8} />}
          />
        </View>
        <View style={{ flex: 1 }}>
          <DropdownField
            label="İlçe *"
            value={value.ilce}
            options={dbIlceler}
            placeholder="İlçe seçin"
            onSelect={set('ilce')}
            error={errors?.ilce}
            disabled={!value.il}
            icon={<MapPin size={14} color={DS.ink[400]} strokeWidth={1.8} />}
          />
        </View>
      </View>

      {/* Sokak / Cadde — Nominatim suggest */}
      <View>
        <TextInputField
          label="Cadde / Sokak"
          value={value.sokak}
          onChangeText={set('sokak')}
          placeholder="Örn: Cumhuriyet Cad."
          error={errors?.sokak}
          icon={<Home size={14} color={DS.ink[400]} strokeWidth={1.8} />}
          onFocus={() => setSokakFocused(true)}
          onBlur={() => setTimeout(() => setSokakFocused(false), 200)}
          loading={sokakLoading}
        />
        {sokakFocused && sokakSuggest.length > 0 && (
          <View
            style={{
              marginTop: -10, marginBottom: 14,
              backgroundColor: surface,
              borderWidth: 1, borderColor: border,
              borderRadius: 12,
              overflow: 'hidden',
              ...(Platform.OS === 'web' ? { boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.10)' } as any : {}),
            }}
          >
            {sokakSuggest.map((s, i) => (
              <Pressable
                key={`${s.road}-${i}`}
                onPress={() => pickSokak(s)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 14, paddingVertical: 10,
                  backgroundColor: pressed ? surfaceAlt : 'transparent',
                  borderBottomWidth: i < sokakSuggest.length - 1 ? 1 : 0,
                  borderBottomColor: hairline,
                })}
              >
                <MapPin size={13} color={inkMuted} strokeWidth={1.8} />
                <Text style={{ flex: 1, fontSize: 13, color: inkPrimary }}>{s.road}</Text>
                {s.postcode && (
                  <Text style={{ fontSize: 10, color: inkMuted, letterSpacing: 0.4 }}>{s.postcode}</Text>
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>
      <BuildingRow value={value} set={set} binaPlaceholder="Örn: 21" />
      </View>
      )}
    </View>
  );
}

/** Bina No + Daire No yan yana (ikisi de isteğe bağlı). */
function BuildingRow({ value, set, binaPlaceholder }: {
  value: AddressData; set: (key: keyof AddressData) => (val: string) => void; binaPlaceholder: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <TextInputField label="Bina No" value={value.bina_no ?? ''} onChangeText={set('bina_no')} placeholder={binaPlaceholder} />
      </View>
      <View style={{ flex: 1 }}>
        <TextInputField label="Daire No" value={value.daire_no ?? ''} onChangeText={set('daire_no')} placeholder="Örn: 3" />
      </View>
    </View>
  );
}

// ── Internal InputField (LoginScreen ile aynı stil) ──
function TextInputField({
  label, value, onChangeText, placeholder, error, icon, onFocus, onBlur, loading,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder: string; error?: string; icon?: React.ReactNode;
  onFocus?: () => void; onBlur?: () => void; loading?: boolean;
}) {
  const [focused, setFocused] = React.useState(false);
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const surface    = isDark ? '#1B1916'             : '#FFFFFF';
  const inkPrimary = isDark ? '#F7F2E9'             : DS.ink[900];
  const inkMuted   = isDark ? 'rgba(247,242,233,0.45)' : DS.ink[400];
  const labelColor = isDark ? 'rgba(247,242,233,0.78)' : DS.ink[500];
  const border     = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 11, color: labelColor, fontWeight: '500', marginBottom: 6, paddingHorizontal: 4 }}>
        {label}
      </Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 16, paddingVertical: 13,
        backgroundColor: surface, borderRadius: 12,
        borderWidth: focused ? 1.5 : 1,
        borderColor: error ? DS.clinic.danger : focused ? GREEN : border,
      }}>
        {icon}
        <TextInput
          style={{
            flex: 1, fontSize: 13, color: inkPrimary,
            fontFamily: DS.font.display as string,
            // @ts-ignore
            outlineStyle: 'none' as any,
          }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={inkMuted}
          autoCorrect={false}
          onFocus={() => { setFocused(true); onFocus?.(); }}
          onBlur={() => { setFocused(false); onBlur?.(); }}
        />
        {loading ? (
          <Search size={12} color={inkMuted} strokeWidth={1.8} />
        ) : null}
      </View>
      {error && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, paddingHorizontal: 4 }}>
          <AlertCircle size={11} color={DS.clinic.danger} strokeWidth={2} />
          <Text style={{ fontSize: 11, color: DS.clinic.danger }}>{error}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * DB'ye kayıt için adres — admin "Yeni Sağlık Kurumu" formuyla AYNI JSON biçimi
 * (eskiden "sokak, mahalle, ilçe, il" düz metniydi → e-fatura adres ayrıştırması tutmuyordu).
 * Ekranda core/util/formatAddress ile okunur hâle gelir.
 */
export function buildAddressString(addr: AddressData): string {
  const t = (v?: string) => String(v ?? '').trim();
  return JSON.stringify({
    ulke: isCountryCode(addr.ulke) ? String(addr.ulke).toUpperCase() : DEFAULT_COUNTRY,
    il: t(addr.il), ilce: t(addr.ilce), mahalle: t(addr.mahalle),
    sokak: t(addr.sokak), bina_no: t(addr.bina_no), daire_no: t(addr.daire_no), posta_kodu: t(addr.posta_kodu),
  });
}

/** Ülkeye göre zorunlu alanlar: TR → il + ilçe; yurt dışı → şehir + adres. */
export function validateAddress(addr: AddressData): Partial<Record<keyof AddressData, string>> {
  const e: Partial<Record<keyof AddressData, string>> = {};
  if ((addr.ulke || DEFAULT_COUNTRY) === DEFAULT_COUNTRY) {
    if (!addr.il) e.il = 'İl seçin';
    if (!addr.ilce) e.ilce = 'İlçe seçin';
  } else {
    if (!addr.ilce.trim()) e.ilce = 'Şehir girin';
    if (!addr.sokak.trim()) e.sokak = 'Adres girin';
  }
  return e;
}

/** Google yer ayrıntısı → adres (ülke dahil; yurt dışında şehir = locality). */
export function addressFromPlace(d: PlaceDetails, prevUlke?: string): AddressData {
  const ulke = isCountryCode(d.ulke) ? d.ulke : (prevUlke || DEFAULT_COUNTRY);
  const foreign = ulke !== DEFAULT_COUNTRY;
  return {
    ulke,
    il: d.il || '',
    ilce: (foreign ? (d.sehir || d.ilce) : d.ilce) || '',
    mahalle: d.mahalle || '',
    // Bina / daire ayrı alanlarda — cadde satırına karışmaz
    sokak: d.cadde || d.sokak || '',
    bina_no: d.binaNo || '',
    daire_no: d.daireNo || '',
    posta_kodu: d.postaKodu || '',
  };
}
