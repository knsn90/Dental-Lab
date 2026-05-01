/**
 * SectionLabelX — Bölüm başlığı (büyük UPPERCASE küçük metin)
 *
 *  Kullanım:
 *    <SectionLabelX>Hızlı Erişim</SectionLabelX>
 *
 *    <SectionLabelX action={{ label: 'Tümünü Gör →', onPress: () => ... }}>
 *      Son Siparişler
 *    </SectionLabelX>
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';

export interface SectionLabelXProps {
  children: React.ReactNode;
  /** Sağdaki aksiyon (örn. "Tümünü Gör →") */
  action?:  { label: string; onPress: () => void };
  /** İkincil metin (sub) */
  sub?:     string;
  /** Aksent rengi (action text rengi) */
  accent?:  string;
  className?: string;
}

export function SectionLabelX({
  children, action, sub, accent = '#2563EB', className,
}: SectionLabelXProps) {
  return (
    <View className={`flex-row items-end justify-between mb-3 px-0.5 ${className ?? ''}`}>
      <View className="flex-1 min-w-0">
        <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          {children}
        </Text>
        {sub && (
          <Text className="text-xs text-slate-500 mt-1">{sub}</Text>
        )}
      </View>
      {action && (
        <Pressable
          onPress={action.onPress}
          className="active:opacity-60 web:cursor-pointer web:hover:opacity-80"
        >
          <Text className="text-xs font-bold" style={{ color: accent }}>
            {action.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
