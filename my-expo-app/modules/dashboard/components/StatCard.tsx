import React from 'react';
import { View, Text } from 'react-native';

interface StatCardProps {
  label: string;
  value: number | string;
  accent: string;
  accentBg: string;
  icon: string;
  trend?: string;
  trendUp?: boolean;
}

export function StatCard({ label, value, accent, accentBg, icon, trend, trendUp }: StatCardProps) {
  const up = trendUp !== false;
  return (
    <View
      className="flex-1 bg-white rounded-2xl p-4 gap-2 border border-black/[0.06]"
      // @ts-ignore web shadow
      style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}
    >
      <View
        className="w-10 h-10 rounded-xl items-center justify-center"
        style={{ backgroundColor: accentBg }}
      >
        <Text className="text-[20px]">{icon}</Text>
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="flex-1 text-[12px] font-medium text-ink-500">{label}</Text>
        {trend != null && (
          <View
            className="px-1.5 py-0.5 rounded-md"
            style={{ backgroundColor: up ? '#ECFDF5' : '#FEF2F2' }}
          >
            <Text
              className="text-[10px] font-bold"
              style={{ color: up ? '#059669' : '#DC2626' }}
            >
              {up ? '▲' : '▼'} {trend}
            </Text>
          </View>
        )}
      </View>

      <Text className="text-[28px] font-extrabold" style={{ color: accent, lineHeight: 34 }}>
        {value}
      </Text>
    </View>
  );
}
