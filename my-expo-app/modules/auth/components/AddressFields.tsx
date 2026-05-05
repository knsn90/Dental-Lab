/**
 * AddressFields — İl / İlçe dropdown + Mahalle / Sokak text fields
 * Patterns design language, LoginScreen InputField uyumlu.
 */
import React from 'react';
import { View, Text, TextInput, Platform } from 'react-native';
import { MapPin, Home, AlertCircle } from 'lucide-react-native';
import { DS } from '../../../core/theme/dsTokens';
import { ILLER, ILCELER } from '../../../core/data/turkeyLocations';
import { DropdownField } from './DropdownField';

const GREEN = DS.clinic.primary;

export interface AddressData {
  il: string;
  ilce: string;
  mahalle: string;
  sokak: string;
}

interface Props {
  value: AddressData;
  onChange: (data: AddressData) => void;
  errors?: Partial<Record<keyof AddressData, string>>;
}

export function AddressFields({ value, onChange, errors }: Props) {
  const ilceler = value.il ? (ILCELER[value.il] ?? []) : [];

  const set = (key: keyof AddressData) => (val: string) => {
    if (key === 'il') {
      // İl değişince ilçeyi sıfırla
      onChange({ ...value, il: val, ilce: '' });
    } else {
      onChange({ ...value, [key]: val });
    }
  };

  return (
    <View>
      {/* İl + İlçe yan yana (desktop) veya alt alta (mobile) */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <DropdownField
            label="İl *"
            value={value.il}
            options={ILLER}
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
            options={ilceler}
            placeholder="İlçe seçin"
            onSelect={set('ilce')}
            error={errors?.ilce}
            disabled={!value.il}
            icon={<MapPin size={14} color={DS.ink[400]} strokeWidth={1.8} />}
          />
        </View>
      </View>

      {/* Mahalle */}
      <TextInputField
        label="Mahalle *"
        value={value.mahalle}
        onChangeText={set('mahalle')}
        placeholder="Örn: Atatürk Mah."
        error={errors?.mahalle}
        icon={<Home size={14} color={DS.ink[400]} strokeWidth={1.8} />}
      />

      {/* Sokak + No */}
      <TextInputField
        label="Sokak / Cadde / No"
        value={value.sokak}
        onChangeText={set('sokak')}
        placeholder="Örn: Cumhuriyet Cad. No: 12/3"
        error={errors?.sokak}
        icon={<Home size={14} color={DS.ink[400]} strokeWidth={1.8} />}
      />
    </View>
  );
}

// ── Internal InputField (LoginScreen ile aynı stil) ──
function TextInputField({
  label, value, onChangeText, placeholder, error, icon,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder: string; error?: string; icon?: React.ReactNode;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '500', marginBottom: 6, paddingHorizontal: 4 }}>
        {label}
      </Text>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 16, paddingVertical: 13,
        backgroundColor: '#FFFFFF', borderRadius: 12,
        borderWidth: focused ? 1.5 : 1,
        borderColor: error ? DS.clinic.danger : focused ? GREEN : 'rgba(0,0,0,0.08)',
      }}>
        {icon}
        <TextInput
          style={{
            flex: 1, fontSize: 13, color: DS.ink[900],
            fontFamily: DS.font.display as string,
            // @ts-ignore
            outlineStyle: 'none',
          }}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={DS.ink[400]}
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
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
  const parts = [addr.sokak, addr.mahalle, addr.ilce, addr.il].filter(Boolean);
  return parts.join(', ');
}
