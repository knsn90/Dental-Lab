/**
 * ClinicNameAutocomplete — Klinik adı girerken Google Places önerileri.
 *
 * - AuthInput görsel diliyle aynı (44px pill, icon)
 * - 400ms debounce, min 3 char
 * - Seçilince: name + phone + address (il/ilçe/mahalle/sokak) callback ile döner
 * - Web'de createPortal ile dropdown (DropdownField pattern'i)
 * - Loading spinner inline
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, TextInput as RNTextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Building2, MapPin, Search } from 'lucide-react-native';
import { AUTH, AUTH_FONT } from './AuthShell';
import { searchPlaces, getPlaceDetails, startPlaceSession, PlaceSuggestion, PlaceDetails } from '../api/places';

// Web-only portal (parent overflow:hidden aşmak için)
let createPortal: ((children: React.ReactNode, container: Element) => React.ReactNode) | null = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch {}
}

interface Props {
  value: string;
  onChangeText: (v: string) => void;
  onPlaceSelected: (details: PlaceDetails) => void;
  placeholder?: string;
  error?: string;
}

export function ClinicNameAutocomplete({
  value, onChangeText, onPlaceSelected, placeholder = 'Kurum Adı', error,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const inputRef = useRef<any>(null);
  const wrapRef = useRef<any>(null);
  const debounceRef = useRef<any>(null);
  const skipNextSearch = useRef(false);

  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(null);

  // Session token (autocomplete + details aynı session)
  useEffect(() => {
    startPlaceSession();
  }, []);

  // Debounced search
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value || value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchPlaces(value);
      setSuggestions(results);
      setSearching(false);
      if (results.length > 0 && focused) setOpen(true);
    }, 400);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Web: panel pozisyonu
  useLayoutEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    const update = () => {
      const el = wrapRef.current as HTMLElement | null;
      if (!el || !el.getBoundingClientRect) return;
      const r = el.getBoundingClientRect();
      setPanelRect({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // Click-outside (web)
  useLayoutEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    const onDoc = (e: MouseEvent) => {
      const wrapEl = wrapRef.current as HTMLElement | null;
      const target = e.target as Node;
      const panelEl = document.getElementById('clinic-ac-panel');
      if (wrapEl?.contains(target)) return;
      if (panelEl?.contains(target)) return;
      setOpen(false);
    };
    const t = setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDoc); };
  }, [open]);

  const handleSelect = async (s: PlaceSuggestion) => {
    skipNextSearch.current = true;
    onChangeText(s.mainText);
    setOpen(false);
    setSuggestions([]);
    setLoadingDetails(true);
    const details = await getPlaceDetails(s.placeId);
    setLoadingDetails(false);
    // Sonraki kayıt için yeni session
    startPlaceSession();
    if (details) {
      onPlaceSelected(details);
    }
  };

  return (
    <View style={{ marginBottom: 14 }}>
      <View
        ref={wrapRef as any}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: 16, height: 44,
          backgroundColor: AUTH.inputBg,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: error ? AUTH.danger : focused ? AUTH.primary : 'transparent',
          ...(Platform.OS === 'web' ? {
            boxShadow: focused
              ? `0 0 0 3px ${AUTH.primary}33, 0 1px 2px rgba(0,0,0,0.03)`
              : '0 1px 2px rgba(0,0,0,0.03)',
            transitionProperty: 'box-shadow, border-color' as any,
            transitionDuration: '160ms' as any,
          } as any : {}),
        }}
      >
        <Building2 size={15} color={AUTH.inkMuted} strokeWidth={1.8} />
        <RNTextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          autoCapitalize="sentences"
          autoCorrect={false}
          onFocus={() => {
            setFocused(true);
            if (suggestions.length > 0) setOpen(true);
          }}
          onBlur={() => setFocused(false)}
          placeholderTextColor={AUTH.inkMuted}
          style={{
            flex: 1,
            fontSize: 16, color: AUTH.ink,
            fontFamily: AUTH_FONT.sans,
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
          } as any}
        />
        {(searching || loadingDetails) && (
          <ActivityIndicator size="small" color={AUTH.primary} />
        )}
      </View>

      {error ? (
        <Text style={{
          fontFamily: AUTH_FONT.sans,
          fontSize: 11, color: AUTH.danger, marginTop: 5, marginLeft: 4, fontWeight: '500',
        }}>
          {error}
        </Text>
      ) : null}

      {/* Hint: kullanıcıyı yönlendir */}
      {focused && value.length > 0 && value.length < 3 && (
        <Text style={{
          fontFamily: AUTH_FONT.sans,
          fontSize: 10.5, color: AUTH.inkMuted, marginTop: 4, marginLeft: 4,
        }}>
          En az 3 karakter — adresinizi otomatik dolduralım
        </Text>
      )}

      {/* Web portal dropdown */}
      {open && Platform.OS === 'web' && createPortal && typeof document !== 'undefined' && panelRect && suggestions.length > 0 && createPortal(
        <div
          id="clinic-ac-panel"
          style={{
            position: 'absolute',
            top: panelRect.top,
            left: panelRect.left,
            width: panelRect.width,
            zIndex: 99999,
            backgroundColor: '#FFFFFF',
            border: `1px solid ${AUTH.primary}`,
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 16px 40px rgba(15,23,42,0.18)',
            maxHeight: 280,
            overflowY: 'auto',
          } as any}
        >
          {suggestions.map((s) => (
            <SuggestionRow key={s.placeId} s={s} onPress={() => handleSelect(s)} />
          ))}
          <div style={{
            padding: '6px 12px',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            fontSize: 10,
            color: AUTH.inkMuted,
            fontFamily: AUTH_FONT.sans,
            textAlign: 'right',
          } as any}>
            Powered by Google
          </div>
        </div>,
        document.body,
      )}

      {/* Native fallback inline */}
      {open && Platform.OS !== 'web' && suggestions.length > 0 && (
        <View style={{
          marginTop: 4,
          backgroundColor: '#FFFFFF',
          borderWidth: 1, borderColor: AUTH.primary,
          borderRadius: 12, overflow: 'hidden',
        }}>
          {suggestions.map((s) => (
            <SuggestionRow key={s.placeId} s={s} onPress={() => handleSelect(s)} />
          ))}
        </View>
      )}
    </View>
  );
}

function SuggestionRow({ s, onPress }: { s: PlaceSuggestion; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }: any) => ({
        flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        paddingHorizontal: 14, paddingVertical: 10,
        backgroundColor: pressed ? 'rgba(122,155,133,0.12)' : hovered ? 'rgba(122,155,133,0.06)' : 'transparent',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}
    >
      <MapPin size={14} color={AUTH.inkMuted} strokeWidth={1.8} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: AUTH_FONT.sans,
            fontSize: 13, color: AUTH.ink, fontWeight: '600',
          }}
        >
          {s.mainText}
        </Text>
        {s.secondaryText ? (
          <Text
            numberOfLines={1}
            style={{
              fontFamily: AUTH_FONT.sans,
              fontSize: 11, color: AUTH.inkMuted, marginTop: 1,
            }}
          >
            {s.secondaryText}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
