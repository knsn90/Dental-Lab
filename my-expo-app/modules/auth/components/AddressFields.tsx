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
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Platform, Pressable } from 'react-native';
import { MapPin, Home, AlertCircle, Search } from 'lucide-react-native';
import { DS } from '../../../core/theme/dsTokens';
import { ILLER, ILCELER } from '../../../core/data/turkeyLocations';
import { DropdownField } from './DropdownField';
import { supabase } from '../../../core/api/supabase';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

const GREEN = DS.clinic.primary;

export interface AddressData {
  il: string;
  ilce: string;
  mahalle: string;
  sokak: string;
  posta_kodu?: string;
}

interface Props {
  value: AddressData;
  onChange: (data: AddressData) => void;
  errors?: Partial<Record<keyof AddressData, string>>;
}

export function AddressFields({ value, onChange, errors }: Props) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
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
    if (!value.il) { setDbIlceler([]); return; }
    (async () => {
      const { data } = await supabase.rpc('get_ilceler', { p_il: value.il });
      if (Array.isArray(data) && data.length > 0) {
        setDbIlceler(data.map((r: any) => r.ilce).filter(Boolean));
      } else {
        setDbIlceler(ILCELER[value.il] ?? []); // fallback
      }
    })();
  }, [value.il]);

  // Mahalleler (il+ilçe değişince)
  useEffect(() => {
    if (!value.il || !value.ilce) { setDbMahalleler([]); return; }
    (async () => {
      const { data } = await supabase.rpc('get_mahalleler', { p_il: value.il, p_ilce: value.ilce });
      if (Array.isArray(data)) {
        setDbMahalleler(data.map((r: any) => ({ mahalle: r.mahalle, posta_kodu: r.posta_kodu })));
      } else {
        setDbMahalleler([]);
      }
    })();
  }, [value.il, value.ilce]);

  // Sokak suggest (Nominatim debounce 400ms)
  const [sokakSuggest, setSokakSuggest] = useState<Array<{ road: string; postcode: string | null }>>([]);
  const [sokakLoading, setSokakLoading] = useState(false);
  const [sokakFocused, setSokakFocused] = useState(false);

  useEffect(() => {
    const q = value.sokak.trim();
    if (q.length < 2 || !value.il || !value.ilce) { setSokakSuggest([]); return; }
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
  }, [value.sokak, value.il, value.ilce, value.mahalle]);

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
          label="Sokak / Cadde / No"
          value={value.sokak}
          onChangeText={set('sokak')}
          placeholder="Örn: Cumhuriyet Cad. No: 12/3"
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

/** Birleşik adres string'i oluşturur (DB'ye kayıt için) */
export function buildAddressString(addr: AddressData): string {
  const parts = [addr.sokak, addr.mahalle, addr.ilce, addr.il, addr.posta_kodu].filter(Boolean);
  return parts.join(', ');
}
