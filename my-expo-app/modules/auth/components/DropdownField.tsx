/**
 * DropdownField — Patterns design language
 * Inline search-enabled dropdown (kendi kutusunda açılır, modal değil).
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, Pressable, TextInput, FlatList, Platform,
  useWindowDimensions,
} from 'react-native';
import { ChevronDown, ChevronUp, Search, X, Check, AlertCircle } from 'lucide-react-native';
import { DS } from '../../../core/theme/dsTokens';

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

export function DropdownField({
  label, value, options, placeholder, onSelect, error, icon, disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
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
    <View style={{ marginBottom: 14, zIndex: open ? 100 : 1 }}>
      <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '500', marginBottom: 6, paddingHorizontal: 4 }}>
        {label}
      </Text>

      {/* Trigger */}
      <Pressable
        onPress={toggle}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 16, paddingVertical: 13,
          backgroundColor: disabled ? DS.ink[100] : '#FFFFFF',
          borderRadius: 12,
          borderWidth: open ? 1.5 : 1,
          borderColor: error ? DS.clinic.danger : open ? GREEN : 'rgba(0,0,0,0.08)',
          opacity: disabled ? 0.6 : 1,
          ...(open ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : {}),
        }}
      >
        {icon}
        <Text style={{
          flex: 1, fontSize: 13,
          color: value ? DS.ink[900] : DS.ink[400],
          fontFamily: DS.font.display as string,
        }}>
          {value || placeholder}
        </Text>
        {open
          ? <ChevronUp size={14} color={DS.ink[400]} strokeWidth={1.8} />
          : <ChevronDown size={14} color={DS.ink[400]} strokeWidth={1.8} />
        }
      </Pressable>

      {/* Inline dropdown panel */}
      {open && (
        <View style={{
          backgroundColor: '#FFFFFF',
          borderWidth: 1.5,
          borderTopWidth: 0,
          borderColor: GREEN,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          overflow: 'hidden',
          // @ts-ignore
          ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.12)' } : {}),
        }}>
          {/* Search bar */}
          {options.length > 8 && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 14, paddingVertical: 10,
              borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)',
              backgroundColor: DS.ink[50],
            }}>
              <Search size={14} color={DS.ink[400]} strokeWidth={1.8} />
              <TextInput
                autoFocus
                value={search}
                onChangeText={setSearch}
                placeholder="Ara..."
                placeholderTextColor={DS.ink[400]}
                style={{
                  flex: 1, fontSize: 12, color: DS.ink[900],
                  fontFamily: DS.font.display as string,
                  // @ts-ignore
                  outlineStyle: 'none',
                }}
              />
              {search ? (
                <Pressable onPress={() => setSearch('')}>
                  <X size={14} color={DS.ink[400]} strokeWidth={1.8} />
                </Pressable>
              ) : null}
            </View>
          )}

          {/* Options list */}
          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 200 }}
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
                      : pressed ? DS.ink[50] : 'transparent',
                  })}
                >
                  <Text style={{
                    flex: 1, fontSize: 13,
                    color: selected ? GREEN : DS.ink[900],
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
                <Text style={{ fontSize: 12, color: DS.ink[400] }}>Sonuç bulunamadı</Text>
              </View>
            }
          />
        </View>
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
