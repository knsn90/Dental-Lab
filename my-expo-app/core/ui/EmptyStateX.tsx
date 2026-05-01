/**
 * EmptyStateX — NativeWind tabanlı empty state
 *
 *  Kullanım:
 *    <EmptyStateX icon="inbox" title="Henüz sipariş yok" subtitle="Yeni iş emri oluşturun" />
 *
 *    <EmptyStateX
 *      icon="alert-triangle"
 *      title="Bir hata oluştu"
 *      subtitle="Sayfayı yenileyin veya tekrar deneyin"
 *      cta={{ label: 'Tekrar Dene', onPress: refetch }}
 *      variant="error"
 *    />
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { AppIcon } from './AppIcon';

export interface EmptyStateXProps {
  icon?:    string;
  title:    string;
  subtitle?:string;
  cta?:     { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
  variant?: 'default' | 'error' | 'success';
  /** Compact mod (kart içi küçük empty) */
  compact?: boolean;
}

export function EmptyStateX({
  icon = 'inbox', title, subtitle, cta, secondary,
  variant = 'default',
  compact = false,
}: EmptyStateXProps) {
  const iconBg = variant === 'error' ? 'bg-red-50'
              : variant === 'success' ? 'bg-emerald-50'
              : 'bg-slate-100';
  const iconColor = variant === 'error' ? '#DC2626'
                 : variant === 'success' ? '#059669'
                 : '#94A3B8';
  const titleColor = variant === 'error' ? 'text-danger' : 'text-slate-900';

  return (
    <View className={`items-center ${compact ? 'py-8 px-4' : 'py-14 px-8'}`}>
      <View
        className={`
          ${compact ? 'w-14 h-14' : 'w-20 h-20'}
          rounded-full items-center justify-center mb-4
          ${iconBg} shadow-cardLite
        `}
      >
        <AppIcon name={icon as any} size={compact ? 24 : 32} color={iconColor} strokeWidth={1.5} />
      </View>

      <Text
        className={`${compact ? 'text-sm' : 'text-base lg:text-lg'} font-bold ${titleColor} text-center tracking-tight`}
      >
        {title}
      </Text>

      {subtitle && (
        <Text className="text-sm text-slate-500 text-center mt-2 max-w-xs leading-relaxed">
          {subtitle}
        </Text>
      )}

      {cta && (
        <Pressable
          onPress={cta.onPress}
          className={`
            mt-5 px-5 py-2.5 rounded-xl
            ${variant === 'error' ? 'bg-danger' : 'bg-lab'}
            active:opacity-80 web:cursor-pointer web:hover:opacity-90
          `}
        >
          <Text className="text-white font-bold text-sm">{cta.label}</Text>
        </Pressable>
      )}

      {secondary && (
        <Pressable
          onPress={secondary.onPress}
          className="mt-2 px-4 py-2 active:opacity-60 web:cursor-pointer"
        >
          <Text className="text-slate-500 text-sm underline">{secondary.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
