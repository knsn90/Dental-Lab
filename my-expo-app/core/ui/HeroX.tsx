/**
 * HeroX — Modern dashboard hero card (Cards Design)
 *
 *  Kullanım (basit):
 *    <HeroX
 *      kicker="Pazartesi, 12 Mayıs"
 *      title="Hoş geldin, Ahmet"
 *      subtitle="Bugün üretim hattında neler oluyor"
 *      stats={[
 *        { label: 'Bugün yeni',    value: 12, accent: '#10B981' },
 *        { label: 'Geciken',       value: 3,  accent: '#DC2626' },
 *        { label: 'Bugün teslimat',value: 8,  accent: '#D97706' },
 *      ]}
 *      actions={[
 *        { icon: 'plus-circle', label: 'Yeni İş Emri', accent: '#2563EB', primary: true, onPress: ... },
 *        { icon: 'list',        label: 'Tüm Siparişler', onPress: ... },
 *      ]}
 *      glow={['#2563EB', '#10B981']}
 *    />
 *
 *  glow prop: arka planda 2 noktada belirsiz blob renk efekti — derinlik için.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { AppIcon } from './AppIcon';

export interface HeroStat {
  label:  string;
  value:  string | number;
  accent: string;
}

export interface HeroAction {
  icon?:    string;
  label:    string;
  /** Primary varsa accent rengiyle dolu buton, yoksa outline */
  primary?: boolean;
  accent?:  string;
  onPress:  () => void;
}

export interface HeroXProps {
  kicker?:   string;
  title:     string;
  subtitle?: string;
  stats?:    HeroStat[];
  actions?:  HeroAction[];
  /** [topRightColor, bottomLeftColor] — arka plan blob'ları */
  glow?:     [string, string];
  /** Status dot — yeşil aktif gibi görsel ipucu */
  statusDot?:string;
}

export function HeroX({
  kicker, title, subtitle, stats, actions, glow,
  statusDot = '#10B981',
}: HeroXProps) {
  return (
    <View className="relative mb-6">
      {/* Gradient blob layers — depth için */}
      {glow && (
        <>
          <View
            pointerEvents="none"
            className="absolute -top-10 -right-16 w-72 h-72 rounded-full opacity-25"
            style={{ backgroundColor: glow[0] }}
          />
          <View
            pointerEvents="none"
            className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full opacity-20"
            style={{ backgroundColor: glow[1] }}
          />
        </>
      )}

      {/* Hero card */}
      <View className="relative bg-surface rounded-card border border-card shadow-cardHero p-6 lg:p-8 overflow-hidden">
        {/* Kicker */}
        {kicker && (
          <View className="flex-row items-center gap-2 mb-3">
            <View className="w-2 h-2 rounded-full" style={{ backgroundColor: statusDot }} />
            <Text className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
              {kicker}
            </Text>
          </View>
        )}

        {/* Title */}
        <Text className="text-3xl lg:text-4xl font-bold text-slate-900 tracking-tight">
          {title}
        </Text>
        {subtitle && (
          <Text className="text-sm lg:text-base text-slate-500 mt-2 max-w-xl">
            {subtitle}
          </Text>
        )}

        {/* Stats strip */}
        {stats && stats.length > 0 && (
          <View className="flex-row flex-wrap gap-3 mt-6">
            {stats.map((s, i) => (
              <View
                key={i}
                className="bg-slate-50 rounded-xl px-4 py-3 min-w-[120px] flex-1 sm:flex-none border-l-4"
                style={{ borderLeftColor: s.accent }}
              >
                <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {s.label}
                </Text>
                <Text
                  className="text-2xl font-bold mt-1 tracking-tight"
                  style={{ color: s.accent }}
                >
                  {s.value}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        {actions && actions.length > 0 && (
          <View className="flex-row flex-wrap gap-3 mt-6">
            {actions.map((a, i) => {
              const isPrimary = !!a.primary;
              const accent    = a.accent ?? '#2563EB';
              return (
                <Pressable
                  key={i}
                  onPress={a.onPress}
                  className={`
                    flex-row items-center gap-2 rounded-xl px-5 py-3
                    active:opacity-70 web:cursor-pointer
                    ${isPrimary
                      ? 'web:hover:opacity-90'
                      : 'bg-surface border border-slate-200 web:hover:bg-slate-50'}
                  `}
                  style={isPrimary ? { backgroundColor: accent } : undefined}
                >
                  {a.icon && (
                    <AppIcon
                      name={a.icon as any}
                      size={16}
                      color={isPrimary ? '#FFFFFF' : accent}
                      strokeWidth={2}
                    />
                  )}
                  <Text
                    className={`font-bold text-sm ${isPrimary ? 'text-white' : 'text-slate-900'}`}
                  >
                    {a.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}
