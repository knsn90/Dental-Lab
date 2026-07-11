// modules/orders/components/StageValidationChecklist.tsx
// İstasyon-spesifik kontrol listesi — workstation footer'ında CTA üstünde durur.
// Tüm "required" maddeler işaretlenmeden CTA disabled olur.

import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Check } from 'lucide-react-native';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';
import type { ValidationItem } from '../stations/registry';
import { NumberTickerX } from '../../../core/ui/NumberTickerX';

export function StageValidationChecklist({
  items, checked, onToggle, embedded = false,
}: {
  items:    ValidationItem[];
  checked:  Set<string>;
  onToggle: (key: string) => void;
  /** true → outer card + header gizlenir (modal içinde kullanım için) */
  embedded?: boolean;
}) {
  const P = useStationTheme();
  if (!items || items.length === 0) return null;

  const required = items.filter(i => i.required !== false);
  const requiredDone = required.every(i => checked.has(i.key));
  const totalDone = items.filter(i => checked.has(i.key)).length;

  // Embedded modda: outer card + header yok, sadece items
  if (embedded) {
    return (
      <View>
        {items.map((item, idx) => (
          <ChecklistItem
            key={item.key}
            item={item}
            checked={checked.has(item.key)}
            onToggle={() => onToggle(item.key)}
            isLast={idx === items.length - 1}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={{
      borderWidth: 1, borderColor: P.ink100, borderRadius: 14,
      backgroundColor: P.surface, overflow: 'hidden',
    }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: P.ink100,
        backgroundColor: P.surfaceAlt,
      }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: P.ink500, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          Aşama Kontrol Listesi
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <NumberTickerX
            value={totalDone}
            duration={500}
            style={{
              fontSize: 11, fontWeight: '700',
              color: requiredDone ? P.success : P.ink400,
            }}
          />
          <Text style={{
            fontSize: 11, fontWeight: '700',
            color: requiredDone ? P.success : P.ink400,
          }}>
            /{items.length}{requiredDone ? ' ✓' : ''}
          </Text>
        </View>
      </View>

      {/* Items */}
      <View>
        {items.map((item, idx) => {
          const isChecked = checked.has(item.key);
          const isOptional = item.required === false;
          return (
            <Pressable
              key={item.key}
              onPress={() => onToggle(item.key)}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'flex-start', gap: 11,
                paddingHorizontal: 16, paddingVertical: 11,
                backgroundColor: hovered ? P.ink50 : 'transparent',
                borderBottomWidth: idx < items.length - 1 ? 1 : 0,
                borderBottomColor: P.ink100,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              {/* Checkbox */}
              <View style={{
                width: 20, height: 20, borderRadius: 6,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: isChecked ? P.accent : 'transparent',
                borderWidth: 1.5,
                borderColor: isChecked ? P.accent : P.ink300,
                marginTop: 1,
              }}>
                {isChecked && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
              </View>

              {/* Label + hint */}
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={{
                    fontSize: 13, fontWeight: '500',
                    color: isChecked ? P.ink500 : P.ink900,
                    textDecorationLine: isChecked ? 'line-through' : 'none',
                  }}>
                    {item.label}
                  </Text>
                  {isOptional && (
                    <View style={{
                      paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
                      backgroundColor: P.ink50, borderWidth: 1, borderColor: P.ink100,
                    }}>
                      <Text style={{ fontSize: 8.5, fontWeight: '700', color: P.ink500, letterSpacing: 0.4 }}>
                        OPSİYONEL
                      </Text>
                    </View>
                  )}
                </View>
                {item.hint && (
                  <Text style={{ fontSize: 11, color: P.ink400 }}>
                    {item.hint}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Footer info — bloklayan madde varsa */}
      {!requiredDone && (
        <View style={{
          paddingHorizontal: 16, paddingVertical: 9,
          backgroundColor: P.warningBg,
          borderTopWidth: 1, borderTopColor: hexA(P.warning, 0.20),
        }}>
          <Text style={{ fontSize: 11, color: P.warning, fontWeight: '600' }}>
            {required.filter(i => !checked.has(i.key)).length} zorunlu madde işaretlenmedi
          </Text>
        </View>
      )}
    </View>
  );
}

/** Required items hepsi checked mi? */
export function isValidationReady(items: ValidationItem[], checked: Set<string>): boolean {
  return items.filter(i => i.required !== false).every(i => checked.has(i.key));
}

// Tek satır checklist item — embedded modda yeniden kullanılır
function ChecklistItem({
  item, checked, onToggle, isLast,
}: {
  item: ValidationItem;
  checked: boolean;
  onToggle: () => void;
  isLast: boolean;
}) {
  const P = useStationTheme();
  const isOptional = item.required === false;
  return (
    <Pressable
      onPress={onToggle}
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'flex-start', gap: 11,
        paddingHorizontal: 4, paddingVertical: 10,
        backgroundColor: hovered ? P.ink50 : 'transparent',
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: P.ink100,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}
    >
      <View style={{
        width: 20, height: 20, borderRadius: 6,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: checked ? P.accent : 'transparent',
        borderWidth: 1.5,
        borderColor: checked ? P.accent : P.ink300,
        marginTop: 1,
      }}>
        {checked && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{
            fontSize: 13, fontWeight: '500',
            color: checked ? P.ink500 : P.ink900,
            textDecorationLine: checked ? 'line-through' : 'none',
          }}>
            {item.label}
          </Text>
          {isOptional && (
            <View style={{
              paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
              backgroundColor: P.ink50, borderWidth: 1, borderColor: P.ink100,
            }}>
              <Text style={{ fontSize: 8.5, fontWeight: '700', color: P.ink500, letterSpacing: 0.4 }}>
                OPSİYONEL
              </Text>
            </View>
          )}
        </View>
        {item.hint && (
          <Text style={{ fontSize: 11, color: P.ink400 }}>
            {item.hint}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
