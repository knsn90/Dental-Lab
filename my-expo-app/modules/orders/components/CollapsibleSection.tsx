// modules/orders/components/CollapsibleSection.tsx
// Genel kullanımlık collapsible — workstation'ın "ikincil" bölümleri için.

import React, { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react-native';
import { isRTL } from '../../../core/i18n';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';

export function CollapsibleSection({
  title, subtitle, icon: Icon, defaultOpen = false, accent, badge, children,
}: {
  title:        string;
  subtitle?:    string;
  icon?:        any;
  defaultOpen?: boolean;
  accent?:      string;
  /** Sağ tarafta küçük rozet (örn "3 kayıt") */
  badge?:       string | number;
  children:     React.ReactNode;
}) {
  const P = useStationTheme();
  const [open, setOpen] = useState(defaultOpen);
  const accentColor = accent ?? P.ink400;

  return (
    <View style={{
      borderRadius: 14,
      backgroundColor: P.surface, overflow: 'hidden',
      ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.06)' } as any : {}),
    }}>
      <Pressable
        onPress={() => setOpen(o => !o)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        }}
      >
        {Icon && (
          <View style={{
            width: 24, height: 24, borderRadius: 7,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: hexA(accentColor, 0.12),
          }}>
            <Icon size={12} color={accentColor} strokeWidth={1.8} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{
            fontSize: 11, fontWeight: '700', color: P.ink900,
            letterSpacing: 1.0, textTransform: 'uppercase',
          }} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={{ fontSize: 11, color: P.ink400, marginTop: 1 }} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {badge !== undefined && (
          <View style={{
            paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999,
            backgroundColor: hexA(accentColor, 0.10),
            borderWidth: 1, borderColor: hexA(accentColor, 0.22),
          }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: accentColor }}>
              {badge}
            </Text>
          </View>
        )}
        {open ? (
          <ChevronDown size={14} color={P.ink400} strokeWidth={2} />
        ) : (
          isRTL()
            ? <ChevronLeft size={14} color={P.ink400} strokeWidth={2} />
            : <ChevronRight size={14} color={P.ink400} strokeWidth={2} />
        )}
      </Pressable>
      {open && (
        <View>
          {children}
        </View>
      )}
    </View>
  );
}
