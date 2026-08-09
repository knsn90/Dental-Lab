// AddressAutocompleteField — Google Maps (Places) önerili adres girişi.
// Kullanıcı yazdıkça banabikurye-dispatch { action:'places_search' } ile lab'ın
// Google Maps anahtarı üzerinden arama yapar; bir öneri seçilince adres metnini
// ve konumu (enlem/boylam) üst forma yazar. Anahtar yoksa dispatch hata döndürür
// ve kullanıcı adresi elle yazmaya devam edebilir (input serbest kalır).

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { MapPin, Search } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { DS } from '../../../core/theme/dsTokens';

interface Suggestion { name: string; address: string; lat: string | null; lng: string | null; }

export function AddressAutocompleteField({
  value, onChangeText, onSelect, placeholder, inputStyle, accentColor,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSelect: (address: string, lat: string | null, lng: string | null) => void;
  placeholder?: string;
  inputStyle: any;
  accentColor: string;
}) {
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const debRef = useRef<any>(null);
  const pickedRef = useRef(false); // öneri seçildiyse aynı metinle tekrar aramayı engelle

  useEffect(() => {
    if (pickedRef.current) { pickedRef.current = false; return; }
    const q = (value ?? '').trim();
    if (debRef.current) clearTimeout(debRef.current);
    if (q.length < 3) { setResults([]); setOpen(false); setErr(null); return; }
    debRef.current = setTimeout(async () => {
      setLoading(true); setErr(null);
      try {
        const { data, error } = await supabase.functions.invoke('banabikurye-dispatch', {
          body: { action: 'places_search', query: q },
        });
        if (error) { setErr('Arama yapılamadı'); setResults([]); setOpen(false); return; }
        if ((data as any)?.ok === false) { setErr((data as any)?.message ?? 'Arama yapılamadı'); setResults([]); setOpen(false); return; }
        const rows = ((data as any)?.results ?? []) as Suggestion[];
        setResults(rows); setOpen(rows.length > 0);
      } catch {
        setErr('Arama yapılamadı'); setResults([]); setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 450);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [value]);

  const pick = (s: Suggestion) => {
    pickedRef.current = true;
    onSelect(s.address, s.lat, s.lng);
    setResults([]); setOpen(false); setErr(null);
  };

  return (
    <View style={{ position: 'relative' as any, zIndex: 20 }}>
      <View style={{ position: 'relative' as any }}>
        <TextInput
          style={[inputStyle, { paddingRight: 34 }]}
          value={value ?? ''}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={DS.ink[400]}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={{ position: 'absolute' as any, right: 12, top: 0, bottom: 0, justifyContent: 'center' }}>
          {loading ? <ActivityIndicator size="small" color={accentColor} /> : <Search size={15} color={DS.ink[400]} strokeWidth={1.9} />}
        </View>
      </View>

      {err && <Text style={{ fontSize: 11, color: '#D94B4B', marginTop: 4 }}>{err}</Text>}

      {open && results.length > 0 && (
        <View style={{
          marginTop: 4, borderRadius: 12, backgroundColor: '#FFFFFF',
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', overflow: 'hidden',
          ...(Platform.OS === 'web'
            ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.14)' } as any)
            : { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 }),
        }}>
          {results.map((s, i) => (
            <Pressable
              key={`${s.address}-${i}`}
              onPress={() => pick(s)}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                paddingHorizontal: 12, paddingVertical: 10,
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: 'rgba(0,0,0,0.05)',
                backgroundColor: hovered ? 'rgba(0,0,0,0.03)' : '#FFFFFF',
                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
              })}
            >
              <MapPin size={15} color={accentColor} strokeWidth={1.9} style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                {!!s.name && <Text style={{ fontSize: 12.5, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>{s.name}</Text>}
                <Text style={{ fontSize: 11.5, color: DS.ink[500], lineHeight: 15 }} numberOfLines={2}>{s.address}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
