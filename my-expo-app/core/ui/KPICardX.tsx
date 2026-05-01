/**
 * KPICardX — shadcn/ui style stat card
 *
 *  Tek değer + açıklama + opsiyonel trend
 *  Tarz: shadcn `Card` + ince border + minimal shadow + muted-foreground label
 *
 *  Kullanım:
 *    <KPICardX title="Toplam Gelir" value="₺125.430"
 *              description="bu ay" icon="dollar-sign" />
 *
 *    <KPICardX title="Vadesi Geçen" value={3}
 *              icon="alert-triangle" trend={{ value: -12, direction: 'down' }} />
 */
import React from 'react';
import { View, Text, Pressable, ViewProps } from 'react-native';
import { AppIcon } from './AppIcon';

export interface KPICardXProps extends Omit<ViewProps, 'children'> {
  title?:       string;
  value:        string | number;
  description?: string;
  icon?:        string;
  /** Opsiyonel trend göstergesi (legacy 'label' field de desteklenir) */
  trend?:       { value: number; direction?: 'up' | 'down'; label?: string };
  pressable?:   boolean;
  onPress?:     () => void;
  className?:   string;
  /** İkon rengi override */
  iconColor?:   string;

  // Eski API ile geri uyumluluk
  label?:       string;
  sub?:         string;
  accent?:      string;
  danger?:      boolean;
  active?:      boolean;
  compact?:     boolean;
}

export function KPICardX({
  title, value, description, icon, trend, pressable, onPress,
  className, iconColor,
  // legacy
  label, sub, accent,
  ...rest
}: KPICardXProps) {
  // Legacy props normalize
  const _title = title ?? label ?? '';
  const _desc  = description ?? sub;
  const _iconColor = iconColor ?? '#71717A'; // muted-foreground

  const Wrapper: any = pressable ? Pressable : View;
  const wrapperProps: any = pressable
    ? {
        onPress,
        className: `rounded-lg border border-border bg-card shadow-sm p-6 flex-1 min-w-[180px] active:opacity-80 web:cursor-pointer web:hover:shadow-md ${className ?? ''}`,
      }
    : { className: `rounded-lg border border-border bg-card shadow-sm p-6 flex-1 min-w-[180px] ${className ?? ''}` };

  return (
    <Wrapper {...wrapperProps} {...rest}>
      {/* Header — title + icon */}
      <View className="flex-row items-center justify-between space-y-0 pb-2">
        <Text className="text-sm font-medium text-muted-foreground">{_title}</Text>
        {icon && <AppIcon name={icon as any} size={16} color={accent ?? _iconColor} strokeWidth={1.75} />}
      </View>

      {/* Value */}
      <Text className="text-2xl font-bold text-card-foreground tracking-tight">{value}</Text>

      {/* Description / trend */}
      {(_desc || trend) && (
        <View className="flex-row items-center gap-1 mt-1">
          {trend && (
            <Text
              className={`text-xs font-semibold ${
                (trend.direction ?? (trend.value >= 0 ? 'up' : 'down')) === 'up' ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {(trend.direction ?? (trend.value >= 0 ? 'up' : 'down')) === 'up' ? '↑' : '↓'} {trend.label ?? `${Math.abs(trend.value)}%`}
            </Text>
          )}
          {_desc && <Text className="text-xs text-muted-foreground">{_desc}</Text>}
        </View>
      )}
    </Wrapper>
  );
}
