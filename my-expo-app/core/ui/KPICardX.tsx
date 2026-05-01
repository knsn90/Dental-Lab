/**
 * KPICardX — Canonical NativeWind KPI kart bileşeni
 *
 *  Tek değer + ikon + opsiyonel alt metin/trend.
 *  Cards Design System uyumlu — beyaz bg, transparent border, shadow-card.
 *
 *  Kullanım:
 *    <KPICardX label="Bugün Yeni" value={12} icon="plus" accent="#10B981" sub="sipariş" />
 *
 *    <KPICardX
 *      label="Vadesi Geçen"
 *      value="₺125.430"
 *      icon="alert-triangle"
 *      accent="#DC2626"
 *      trend={{ value: -12, label: '%12 azaldı' }}
 *      pressable onPress={...}
 *    />
 */
import React from 'react';
import { View, Text, Pressable, ViewProps } from 'react-native';
import { AppIcon } from './AppIcon';

export interface KPICardXProps extends Omit<ViewProps, 'children'> {
  label:    string;
  value:    string | number;
  icon?:    string;
  accent?:  string;             // Default: lab #2563EB
  /** Alt açıklama, ikincil bilgi */
  sub?:     string;
  /** Trend göstergesi: pozitif = yeşil, negatif = kırmızı */
  trend?:   { value: number; label: string };
  /** Tehlike modu — kırmızı border */
  danger?:  boolean;
  /** Tıklanabilir mi? */
  pressable?: boolean;
  onPress?: () => void;
  /** Aktif durumu (filtre seçili gibi) */
  active?:  boolean;
  /** Sıkı mod (mini KPI strip için) */
  compact?: boolean;
}

export function KPICardX({
  label, value, icon, sub, trend,
  accent = '#2563EB',
  danger = false,
  pressable = false,
  onPress,
  active = false,
  compact = false,
  className,
  ...rest
}: KPICardXProps) {
  const baseClass = `
    flex-1 min-w-[140px]
    bg-surface rounded-card border border-card shadow-card
    ${compact ? 'p-3' : 'p-4'}
    ${danger ? 'border-danger/40' : ''}
    ${active ? 'ring-2 ring-offset-2' : ''}
  `;

  const Wrapper: any = pressable ? Pressable : View;
  const wrapperProps: any = pressable
    ? {
        onPress,
        className: `${baseClass} active:opacity-80 web:cursor-pointer web:hover:opacity-95 ${className ?? ''}`,
      }
    : {
        className: `${baseClass} ${className ?? ''}`,
      };

  return (
    <Wrapper {...wrapperProps} {...rest}>
      {/* Top: icon + trend chip */}
      <View className="flex-row items-center justify-between mb-2">
        {icon ? (
          <View
            className={`${compact ? 'w-7 h-7' : 'w-9 h-9'} rounded-xl items-center justify-center`}
            style={{ backgroundColor: accent + '15' }}
          >
            <AppIcon name={icon as any} size={compact ? 14 : 16} color={accent} />
          </View>
        ) : <View />}
        {trend && (
          <View
            className="px-2 py-0.5 rounded-full"
            style={{ backgroundColor: trend.value >= 0 ? '#ECFDF5' : '#FEF2F2' }}
          >
            <Text
              className="text-[10px] font-bold"
              style={{ color: trend.value >= 0 ? '#059669' : '#DC2626' }}
            >
              {trend.value > 0 ? '↑' : '↓'} {trend.label}
            </Text>
          </View>
        )}
      </View>

      {/* Value */}
      <Text
        className={`font-bold text-slate-900 tracking-tight ${compact ? 'text-xl' : 'text-2xl lg:text-3xl'}`}
        numberOfLines={1}
      >
        {value}
      </Text>

      {/* Label */}
      <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">
        {label}
      </Text>

      {/* Sub */}
      {sub && (
        <Text className="text-xs text-slate-400 mt-0.5" numberOfLines={1}>{sub}</Text>
      )}
    </Wrapper>
  );
}
