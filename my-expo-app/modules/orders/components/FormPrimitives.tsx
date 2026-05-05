/**
 * FormPrimitives — Patterns Design Language
 * ──────────────────────────────────────────
 * Paylaşılan alt bileşenler: SectionCard, FieldError, Field, SearchableDropdown.
 * NewOrderScreen'in tüm step'leri tarafından kullanılır.
 *
 * Patterns tokenları (dsTokens) + Lucide ikonlar + inline style.
 * StyleSheet kullanılmaz — Patterns felsefesi.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable,
  TextInput, ActivityIndicator, Platform,
} from 'react-native';
import {
  AlertCircle, Search, Lock, XCircle, Check, Plus, Building2,
} from 'lucide-react-native';
import { DS } from '../../../core/theme/dsTokens';

// ── Web-only portal ────────────────────────────────────────────────
let _portal: ((node: React.ReactNode) => React.ReactNode) | null = null;
if (Platform.OS === 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ReactDOM = require('react-dom');
    _portal = (node: React.ReactNode) =>
      typeof document !== 'undefined'
        ? ReactDOM.createPortal(node, document.body)
        : node;
  } catch {}
}
const WebPortal = ({ children }: { children: React.ReactNode }) =>
  _portal ? (_portal(children) as React.ReactElement) : <>{children}</>;

// ── Shared tokens ──────────────────────────────────────────────────
const DISPLAY_FONT = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const CARD_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' } as any,
  default: {
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
});

const INPUT_STYLE: any = {
  height: 44,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.08)',
  backgroundColor: '#FFFFFF',
  paddingHorizontal: 14,
  fontSize: 14,
  color: DS.ink[900],
  outlineWidth: 0,
};

// ── SectionCard ────────────────────────────────────────────────────
export interface SectionCardProps {
  title: string;
  subtitle?: string;
  /** Preferred: pass a Lucide icon node */
  iconNode?: React.ReactNode;
  /** Legacy: MaterialCommunityIcons string name — will be forwarded to AppIcon if iconNode is absent */
  icon?: string;
  children: React.ReactNode;
  errorCount?: number;
  headerRight?: React.ReactNode;
  style?: any;
  accentColor?: string;
}

/**
 * Lazy-loaded AppIcon fallback for legacy `icon` string prop.
 * Avoids hard-importing AppIcon in the new Patterns primitives.
 */
let _AppIcon: any = null;
function LegacyIcon({ name, size, color }: { name: string; size: number; color: string }) {
  if (!_AppIcon) {
    try { _AppIcon = require('../../../core/ui/AppIcon').AppIcon; } catch { return null; }
  }
  return <_AppIcon name={name} size={size} color={color} />;
}

export function SectionCard({
  title, subtitle, icon, iconNode, children,
  errorCount, headerRight, style, accentColor = DS.lab.primary,
}: SectionCardProps) {
  const hasError = !!errorCount;

  return (
    <View
      style={[
        {
          backgroundColor: '#FFFFFF',
          borderRadius: 24,
          padding: 22,
          overflow: 'hidden' as const,
        },
        CARD_SHADOW,
        hasError && { borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.35)' },
        style,
      ]}
    >
      {/* Header */}
      <View
        style={{
          paddingBottom: 14,
          marginBottom: 18,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(0,0,0,0.04)',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          {(iconNode || icon) && (
            <View
              style={{
                width: 32, height: 32, borderRadius: 10,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: hasError ? 'rgba(239,68,68,0.08)' : `${accentColor}14`,
              }}
            >
              {iconNode ?? <LegacyIcon name={icon!} size={14} color={hasError ? '#EF4444' : accentColor} />}
            </View>
          )}
          <Text
            style={{
              ...DISPLAY_FONT,
              fontSize: 16,
              letterSpacing: -0.2,
              color: hasError ? '#EF4444' : DS.ink[900],
            }}
          >
            {title}
          </Text>
          {hasError && (
            <View
              style={{
                minWidth: 18, height: 18, borderRadius: 9,
                backgroundColor: '#EF4444',
                alignItems: 'center', justifyContent: 'center',
                paddingHorizontal: 5,
                marginLeft: 2,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '600', color: '#FFFFFF' }}>
                {errorCount}
              </Text>
            </View>
          )}
          {headerRight && <View style={{ marginLeft: 'auto' }}>{headerRight}</View>}
        </View>
        {subtitle && (
          <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 3, marginLeft: 42 }}>
            {subtitle}
          </Text>
        )}
      </View>

      {/* Body */}
      {children}
    </View>
  );
}

// ── FieldError ─────────────────────────────────────────────────────
export function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, marginBottom: 2 }}>
      <AlertCircle size={12} color="#EF4444" strokeWidth={1.8} />
      <Text style={{ fontSize: 11, fontWeight: '500', color: '#EF4444' }}>{msg}</Text>
    </View>
  );
}

// ── Field ──────────────────────────────────────────────────────────
export interface FieldProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  flex?: boolean;
  style?: any;
  required?: boolean;
  error?: string;
  keyboardType?: string;
}

export function Field({
  label, value, onChangeText, placeholder,
  multiline, flex, style, required, error,
}: FieldProps) {
  return (
    <View style={[{ marginBottom: 0 }, flex && { flex: 1 }]}>
      {/* Label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        {required && (
          <Text
            style={{
              fontSize: 13, fontWeight: '700', lineHeight: 16,
              color: error ? '#EF4444' : DS.ink[900],
            }}
          >
            *
          </Text>
        )}
        <Text
          style={{
            fontSize: 12, fontWeight: '500',
            color: error ? '#EF4444' : DS.ink[800],
          }}
        >
          {label}
        </Text>
      </View>

      {/* Input */}
      <TextInput
        style={[
          INPUT_STYLE,
          multiline && { minHeight: 88, textAlignVertical: 'top' as const, paddingTop: 12, height: undefined },
          error && { borderColor: 'rgba(239,68,68,0.5)', backgroundColor: 'rgba(239,68,68,0.04)' },
          style,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={DS.ink[300]}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'auto'}
      />

      <FieldError msg={error} />
    </View>
  );
}

// ── SearchableDropdown ─────────────────────────────────────────────
export interface DropdownOption {
  id: string;
  label: string;
  sublabel?: string;
}

export interface SearchableDropdownProps {
  label: string;
  placeholder: string;
  options: DropdownOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAddNew?: (name: string) => Promise<void>;
  addNewLabel?: string;
  disabled?: boolean;
  disabledHint?: string;
  required?: boolean;
  error?: string;
  accentColor?: string;
}

export function SearchableDropdown({
  label, placeholder, options, selectedId, onSelect,
  onAddNew, addNewLabel, disabled, disabledHint,
  required, error, accentColor = DS.ink[900],
}: SearchableDropdownProps) {
  const [focused, setFocused] = useState(false);
  const [query, setQuery]     = useState('');
  const [adding, setAdding]   = useState(false);
  const [dropPos, setDropPos] = useState<{
    top?: number; bottom?: number; left: number; width: number;
  } | null>(null);
  const wrapRef = useRef<View>(null);

  const DROP_MAX_H = 260;

  const measureWrap = useCallback(() => {
    if (Platform.OS !== 'web' || !wrapRef.current) return;
    const el = wrapRef.current as any;
    if (el?.getBoundingClientRect) {
      const rect = el.getBoundingClientRect();
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
      const spaceBelow = vh - rect.bottom;
      if (spaceBelow < DROP_MAX_H + 8) {
        setDropPos({ bottom: vh - rect.top + 4, left: rect.left, width: rect.width });
      } else {
        setDropPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      }
    }
  }, []);

  const selected = options.find(o => o.id === selectedId);

  useEffect(() => {
    if (!focused) setQuery(selected ? selected.label : '');
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Türkçe karakter normalizasyonu
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
      .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');

  const filtered = query.trim()
    ? options.filter(o => norm(o.label).includes(norm(query)))
    : options;

  const exactMatch = options.some(o => norm(o.label) === norm(query.trim()));
  const showList = focused && (Platform.OS !== 'web' || dropPos !== null);
  const showAdd  = !!onAddNew && showList && !exactMatch;

  const handleSelect = (id: string, itemLabel: string) => {
    onSelect(id);
    setQuery(itemLabel);
    setFocused(false);
  };

  const handleClear = () => {
    onSelect('');
    setQuery('');
    setFocused(false);
  };

  const handleAdd = async () => {
    if (!onAddNew || adding) return;
    setAdding(true);
    await onAddNew(query.trim());
    setAdding(false);
    setFocused(false);
  };

  // ── Disabled state ──
  if (disabled) {
    return (
      <View style={{ position: 'relative' as const, flex: 1 }}>
        {label ? (
          <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[400], marginBottom: 6 }}>
            {label}
          </Text>
        ) : null}
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            ...INPUT_STYLE,
            backgroundColor: DS.ink[50],
            borderColor: 'rgba(0,0,0,0.04)',
          }}
        >
          <Lock size={14} color={DS.ink[300]} strokeWidth={1.8} />
          <Text
            style={{ flex: 1, fontSize: 14, color: DS.ink[300] }}
            numberOfLines={1}
          >
            {disabledHint ?? placeholder}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View ref={wrapRef} style={{ position: 'relative' as const, flex: 1 }}>
      {/* Label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        {required && (
          <Text
            style={{
              fontSize: 13, fontWeight: '700', lineHeight: 16,
              color: error ? '#EF4444' : DS.ink[900],
            }}
          >
            *
          </Text>
        )}
        <Text
          style={{
            fontSize: 12, fontWeight: '500',
            color: error ? '#EF4444' : DS.ink[800],
          }}
        >
          {label}
        </Text>
      </View>

      {/* Input trigger */}
      <View
        style={[
          {
            flexDirection: 'row', alignItems: 'center', gap: 8,
            ...INPUT_STYLE,
            height: undefined,
            paddingVertical: 11,
          },
          focused && { borderColor: DS.ink[900] },
          error && { borderColor: 'rgba(239,68,68,0.5)', backgroundColor: 'rgba(239,68,68,0.04)' },
        ]}
      >
        <Search size={15} color={DS.ink[300]} strokeWidth={1.8} />
        <TextInput
          style={{
            flex: 1, fontSize: 14, color: DS.ink[900],
            // @ts-ignore
            outlineStyle: 'none',
          }}
          value={query}
          onChangeText={(text) => { setQuery(text); if (!text) onSelect(''); }}
          onFocus={() => { setFocused(true); measureWrap(); }}
          onBlur={() => setTimeout(() => setFocused(false), 250)}
          placeholder={placeholder}
          placeholderTextColor={DS.ink[300]}
        />
        {selectedId ? (
          <Pressable
            onPress={handleClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            // @ts-ignore web
            style={{ cursor: 'pointer' }}
          >
            <XCircle size={16} color={DS.ink[300]} strokeWidth={1.6} />
          </Pressable>
        ) : null}
      </View>

      {/* Error */}
      <FieldError msg={error} />

      {/* Dropdown panel — portalled to body on web */}
      {showList && (
        <WebPortal>
          <View
            style={[
              {
                marginTop: 4,
                backgroundColor: '#FFFFFF',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: 'rgba(0,0,0,0.06)',
                overflow: 'hidden' as const,
              },
              Platform.select({
                web: { boxShadow: '0 4px 20px rgba(0,0,0,0.10)' } as any,
                default: {
                  shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20,
                  shadowOffset: { width: 0, height: 4 }, elevation: 8,
                },
              }),
              dropPos
                ? {
                    position: 'fixed' as any,
                    top: dropPos.top, bottom: dropPos.bottom,
                    left: dropPos.left, width: dropPos.width,
                    marginTop: 0, zIndex: 9999,
                  }
                : { display: 'none' as any },
            ]}
            {...(Platform.OS === 'web' ? { onMouseDown: (e: any) => e.preventDefault() } : {})}
          >
            <ScrollView
              style={{ maxHeight: 240 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {filtered.length === 0 && !showAdd && (
                <Text
                  style={{
                    textAlign: 'center', color: DS.ink[400],
                    paddingVertical: 24, fontSize: 13,
                  }}
                >
                  Sonuc bulunamadi
                </Text>
              )}
              {filtered.map(item => {
                const active = item.id === selectedId;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => handleSelect(item.id, item.label)}
                    style={({ pressed }: any) => [
                      {
                        flexDirection: 'row', alignItems: 'center',
                        paddingHorizontal: 16, paddingVertical: 12,
                        borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.03)',
                        gap: 10,
                      },
                      active && { backgroundColor: DS.ink[50] },
                      pressed && { backgroundColor: DS.ink[100] },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          color: DS.ink[900],
                          fontWeight: active ? '500' : '400',
                        }}
                      >
                        {item.label}
                      </Text>
                      {item.sublabel && (
                        <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 1 }}>
                          {item.sublabel}
                        </Text>
                      )}
                    </View>
                    {active && <Check size={16} color={DS.ink[900]} strokeWidth={2} />}
                  </Pressable>
                );
              })}
            </ScrollView>

            {showAdd && (
              <Pressable
                onPress={handleAdd}
                disabled={adding}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 16, paddingVertical: 13,
                  borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)',
                  backgroundColor: DS.ink[50],
                  // @ts-ignore web
                  cursor: 'pointer',
                }}
              >
                <View
                  style={{
                    width: 26, height: 26, borderRadius: 13,
                    backgroundColor: DS.ink[200],
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {adding
                    ? <ActivityIndicator size="small" color={DS.ink[900]} />
                    : <Plus size={14} color={DS.ink[900]} strokeWidth={2} />
                  }
                </View>
                <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[900] }}>
                  {adding
                    ? 'Ekleniyor...'
                    : query.trim()
                      ? `${addNewLabel ?? 'Ekle'}: "${query.trim()}"`
                      : (addNewLabel ?? 'Yeni ekle')
                  }
                </Text>
              </Pressable>
            )}
          </View>
        </WebPortal>
      )}
    </View>
  );
}

// ── Chip (pill style) ──────────────────────────────────────────────
export interface ChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  accentColor?: string;
}

export function Chip({ label, active, onPress, accentColor = DS.ink[900] }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? accentColor : 'rgba(0,0,0,0.10)',
        backgroundColor: active ? `${accentColor}10` : '#FFFFFF',
        // @ts-ignore web
        cursor: 'pointer',
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: active ? '500' : '400',
          letterSpacing: -0.13,
          color: active ? accentColor : DS.ink[500],
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── TwoCol layout ──────────────────────────────────────────────────
export function TwoCol({
  children, stack, style,
}: {
  children: React.ReactNode;
  stack?: boolean;
  style?: any;
}) {
  return (
    <View
      style={[
        {
          flexDirection: stack ? 'column' : 'row',
          gap: stack ? 14 : 12,
          overflow: 'visible' as const,
          marginBottom: 14,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ── LockedInfoCard — kilitli klinik/hekim kartı ────────────────────
export interface LockedInfoCardProps {
  label: string;
  value: string;
  subtitle?: string;
  /** 'clinic' renders Building2 icon; otherwise renders avatar initials */
  iconVariant?: 'clinic';
  avatarInitials?: string;
  accentColor?: string;
  style?: any;
}

export function LockedInfoCard({
  label, value, subtitle, iconVariant, avatarInitials,
  accentColor, style,
}: LockedInfoCardProps) {
  const isClinic = iconVariant === 'clinic';
  const accent = accentColor ?? DS.ink[500];

  return (
    <View
      style={[
        {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: isClinic ? DS.ink[50] : `${accent}0F`,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isClinic ? 'rgba(0,0,0,0.06)' : `${accent}22`,
          paddingHorizontal: 14,
          paddingVertical: 12,
        },
        style,
      ]}
    >
      {/* Icon / Avatar */}
      {isClinic ? (
        <View
          style={{
            width: 40, height: 40, borderRadius: 12,
            backgroundColor: '#FFFFFF',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
          }}
        >
          <Building2 size={18} color={DS.ink[500]} strokeWidth={1.6} />
        </View>
      ) : (
        <View
          style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: accent,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
            {avatarInitials ?? '?'}
          </Text>
        </View>
      )}

      {/* Content */}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 10, fontWeight: '600', color: DS.ink[400],
            letterSpacing: 0.6, textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
        <Text
          style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900], marginTop: 2 }}
          numberOfLines={1}
        >
          {value}
        </Text>
        {subtitle && (
          <Text
            style={{ fontSize: 11, color: DS.ink[500], marginTop: 1 }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </View>

      {/* Lock icon */}
      <Lock size={14} color={DS.ink[400]} strokeWidth={1.6} />
    </View>
  );
}

// ── Re-export tokens for convenience ───────────────────────────────
export { DISPLAY_FONT, CARD_SHADOW, INPUT_STYLE };
