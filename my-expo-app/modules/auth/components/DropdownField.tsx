/**
 * DropdownField — Patterns design language
 * Inline search-enabled dropdown (kendi kutusunda açılır, modal değil).
 */
import React, { useState, useRef, useLayoutEffect } from 'react';
import {
  View, Text, Pressable, TextInput, FlatList, Platform,
  useWindowDimensions,
} from 'react-native';
import { ChevronDown, ChevronUp, Search, X, Check, AlertCircle } from 'lucide-react-native';
import { DS } from '../../../core/theme/dsTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

// Web-only: react-dom portal — parent overflow:hidden / backdrop-filter sızıntısını aşar
let createPortal: ((children: React.ReactNode, container: Element) => React.ReactNode) | null = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch {}
}

const R = { sm: 8, md: 14, lg: 20, xl: 24, pill: 999 };
const GREEN = DS.clinic.primary;

interface Props {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onSelect: (v: string) => void;
  error?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

/**
 * Türkçe-uyumlu arama normalizasyonu.
 *   İstanbul ↔ istanbul ↔ Istanbul ↔ İSTANBUL ↔ ıstanbul   hepsi eşleşir
 *   Diakritikleri ve özel TR harflerini ASCII'ye düşürür.
 */
function normalizeTr(s: string): string {
  return s
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function DropdownField({
  label, value, options, placeholder, onSelect, error, icon, disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Web: trigger DOM ref → portal panel'in koordinatlarını hesaplamak için
  const triggerRef = useRef<any>(null);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number; width: number } | null>(null);

  // Open olduğunda trigger pozisyonunu ölç + scroll/resize'da güncelle
  useLayoutEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    const update = () => {
      const el = triggerRef.current as HTMLElement | null;
      if (!el || !el.getBoundingClientRect) return;
      const r = el.getBoundingClientRect();
      setPanelRect({ top: r.bottom + window.scrollY, left: r.left + window.scrollX, width: r.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // Click-outside → kapat (web only)
  useLayoutEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    const onDoc = (e: MouseEvent) => {
      const triggerEl = triggerRef.current as HTMLElement | null;
      const target = e.target as Node;
      const panelEl = document.getElementById(`dd-panel-${labelKey}`);
      if (triggerEl?.contains(target)) return;
      if (panelEl?.contains(target)) return;
      setOpen(false);
      setSearch('');
    };
    // Sonraki tick'te kuyru ki açan tıklama hemen kapatmasın
    const t = setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDoc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Stable key for panel DOM id (label'dan türetilmiş)
  const labelKey = React.useMemo(() => label.replace(/\s+/g, '_'), [label]);
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const surface     = isDark ? '#1B1916'             : '#FFFFFF';
  const surfaceAlt  = isDark ? '#141312'             : DS.ink[50];
  const inkPrimary  = isDark ? '#F7F2E9'             : DS.ink[900];
  const inkMuted    = isDark ? 'rgba(247,242,233,0.45)' : DS.ink[400];
  const border      = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)';

  const filtered = search.trim()
    ? options.filter(o => normalizeTr(o).includes(normalizeTr(search)))
    : options;

  const handleSelect = (v: string) => {
    onSelect(v);
    setOpen(false);
    setSearch('');
  };

  const toggle = () => {
    if (disabled) return;
    setOpen(!open);
    if (open) setSearch('');
  };

  return (
    <View style={{
      marginBottom: 14,
      zIndex: open ? 9999 : 1,
      // @ts-ignore web: dropdown other content'in üstüne çıksın diye parent overflow'unu aşmasın
      position: open && Platform.OS === 'web' ? 'relative' as any : undefined,
    }}>
      <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '500', marginBottom: 6, paddingHorizontal: 4 }}>
        {label}
      </Text>

      {/* Trigger */}
      <Pressable
        ref={triggerRef as any}
        onPress={toggle}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 14, paddingVertical: 12,
          backgroundColor: disabled ? surfaceAlt : surface,
          borderRadius: 12,
          borderWidth: open ? 1.5 : 1,
          borderColor: error ? DS.clinic.danger : open ? GREEN : border,
          opacity: disabled ? 0.6 : 1,
          minWidth: 0, // flex shrink doğru çalışsın
          ...(open ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}),
        }}
      >
        {icon ? <View style={{ flexShrink: 0 }}>{icon}</View> : null}
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            flex: 1,
            minWidth: 0, // RN-Web: flex child overflow için kritik
            fontSize: 13,
            color: value ? inkPrimary : inkMuted,
            fontFamily: DS.font.display as string,
            // @ts-ignore web — uzun değer baştan değil sondan kessin
            ...(Platform.OS === 'web' ? {
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            } : {}),
          } as any}
        >
          {value || placeholder}
        </Text>
        <View style={{ flexShrink: 0 }}>
          {open
            ? <ChevronUp size={14} color={inkMuted} strokeWidth={1.8} />
            : <ChevronDown size={14} color={inkMuted} strokeWidth={1.8} />
          }
        </View>
      </Pressable>

      {/* Native fallback panel — web olmayan platformlarda inline render */}
      {open && Platform.OS !== 'web' && (
        <View style={{
          backgroundColor: surface,
          borderWidth: 1.5,
          borderTopWidth: 0,
          borderColor: GREEN,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          overflow: 'hidden',
        }}>
          <PanelContent
            options={filtered}
            value={value}
            search={search}
            setSearch={setSearch}
            handleSelect={handleSelect}
            inkPrimary={inkPrimary}
            inkMuted={inkMuted}
            border={border}
            surfaceAlt={surfaceAlt}
            GREEN={GREEN}
            showSearch={options.length > 8}
          />
        </View>
      )}

      {/* Web: portal panel — document.body'ye render → parent overflow:hidden aşılır */}
      {open && Platform.OS === 'web' && createPortal && typeof document !== 'undefined' && panelRect && createPortal(
        <div
          id={`dd-panel-${labelKey}`}
          style={{
            position: 'absolute',
            top: panelRect.top,
            left: panelRect.left,
            width: panelRect.width,
            zIndex: 99999,
            backgroundColor: isDark ? '#1A1A1A' : '#FFFFFF',
            border: `1.5px solid ${GREEN}`,
            borderTop: 'none',
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12,
            overflow: 'hidden',
            boxShadow: isDark ? '0 16px 40px rgba(0,0,0,0.55)' : '0 16px 40px rgba(15,23,42,0.22)',
            backdropFilter: 'none',
            WebkitBackdropFilter: 'none',
          } as any}
        >
          <PanelContent
            options={filtered}
            value={value}
            search={search}
            setSearch={setSearch}
            handleSelect={handleSelect}
            inkPrimary={inkPrimary}
            inkMuted={inkMuted}
            border={border}
            surfaceAlt={surfaceAlt}
            GREEN={GREEN}
            showSearch={options.length > 8}
          />
        </div>,
        document.body
      )}

      {error && !open && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, paddingHorizontal: 4 }}>
          <AlertCircle size={11} color={DS.clinic.danger} strokeWidth={2} />
          <Text style={{ fontSize: 11, color: DS.clinic.danger }}>{error}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Panel içeriği — hem native hem portal aynı render'ı kullansın ─────
function PanelContent({
  options, value, search, setSearch, handleSelect,
  inkPrimary, inkMuted, border, surfaceAlt, GREEN, showSearch,
}: {
  options: string[];
  value: string;
  search: string;
  setSearch: (s: string) => void;
  handleSelect: (v: string) => void;
  inkPrimary: string;
  inkMuted: string;
  border: string;
  surfaceAlt: string;
  GREEN: string;
  showSearch: boolean;
}) {
  return (
    <>
      {showSearch && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 14, paddingVertical: 10,
          borderBottomWidth: 1, borderBottomColor: border,
          backgroundColor: surfaceAlt,
        }}>
          <Search size={14} color={inkMuted} strokeWidth={1.8} />
          <TextInput
            autoFocus
            value={search}
            onChangeText={setSearch}
            placeholder="Ara..."
            placeholderTextColor={inkMuted}
            style={{
              flex: 1, fontSize: 12, color: inkPrimary,
              fontFamily: DS.font.display as string,
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
            } as any}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')}>
              <X size={14} color={inkMuted} strokeWidth={1.8} />
            </Pressable>
          ) : null}
        </View>
      )}
      <FlatList
        data={options}
        keyExtractor={(item) => item}
        keyboardShouldPersistTaps="handled"
        style={{ maxHeight: 240 }}
        renderItem={({ item }) => {
          const selected = item === value;
          return (
            <Pressable
              onPress={() => handleSelect(item)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 16, paddingVertical: 10,
                backgroundColor: selected
                  ? `${GREEN}12`
                  : pressed ? surfaceAlt : 'transparent',
              })}
            >
              <Text style={{
                flex: 1, fontSize: 13,
                color: selected ? GREEN : inkPrimary,
                fontWeight: selected ? '600' : '400',
              }}>
                {item}
              </Text>
              {selected && <Check size={14} color={GREEN} strokeWidth={2} />}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: inkMuted }}>Sonuç bulunamadı</Text>
          </View>
        }
      />
    </>
  );
}
