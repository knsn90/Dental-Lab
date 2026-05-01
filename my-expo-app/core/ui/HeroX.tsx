/**
 * HeroX — shadcn/ui style page header
 *
 *  Tarz: shadcn'in app dashboard'ları gibi minimal — büyük başlık, sade
 *  alt açıklama, ince border altta opsiyonel. Gradient/blob YOK.
 *
 *  Kullanım:
 *    <HeroX
 *      title="Hoş geldin, Ahmet"
 *      description="Bugünkü siparişler ve aktif metrikler"
 *      breadcrumb={['Lab', 'Dashboard']}
 *      actions={[
 *        { label: 'Yeni İş Emri', leftIcon: 'plus', onPress: ... },
 *        { label: 'Tüm Siparişler', variant: 'outline', onPress: ... },
 *      ]}
 *    />
 */
import React from 'react';
import { View, Text } from 'react-native';
import { ButtonX } from './ButtonX';

export interface HeroAction {
  label:     string;
  leftIcon?: string;
  rightIcon?: string;
  variant?:  'default' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  onPress:   () => void;
  // Legacy alias
  icon?:     string;
  primary?:  boolean;
  accent?:   string;
}

export interface HeroXProps {
  title:        string;
  description?: string;
  /** Üst breadcrumb (sadece string array, ayrım: '/' veya '›') */
  breadcrumb?:  string[];
  /** Başlığın üstündeki kicker (kategori/durum etiketi gibi) */
  kicker?:      string;
  actions?:     HeroAction[];
  /** Alt border ile ayır (default: true) */
  divider?:     boolean;

  // Eski API geri uyumluluk
  subtitle?:    string;
  stats?:       any;       // artık ignore — KPI'lar ayrı KPICardX olarak gösterilmeli
  glow?:        any;       // artık ignore
  statusDot?:   any;       // artık ignore
}

export function HeroX({
  title,
  description,
  breadcrumb,
  kicker,
  actions,
  divider = true,
  subtitle, // legacy alias
}: HeroXProps) {
  const _description = description ?? subtitle;

  return (
    <View className={`pb-6 mb-6 ${divider ? 'border-b border-border' : ''}`}>
      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 0 && (
        <View className="flex-row items-center gap-2 mb-3">
          {breadcrumb.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Text className="text-xs text-muted-foreground">/</Text>}
              <Text className={`text-xs ${i === breadcrumb.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                {crumb}
              </Text>
            </React.Fragment>
          ))}
        </View>
      )}

      {/* Kicker */}
      {kicker && (
        <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          {kicker}
        </Text>
      )}

      {/* Title + Actions row */}
      <View className="flex-col md:flex-row md:items-center md:justify-between gap-4">
        <View className="flex-1 min-w-0">
          <Text className="text-3xl lg:text-4xl font-bold text-foreground tracking-tight">
            {title}
          </Text>
          {_description && (
            <Text className="text-sm text-muted-foreground mt-2 max-w-2xl">
              {_description}
            </Text>
          )}
        </View>

        {actions && actions.length > 0 && (
          <View className="flex-row gap-2 flex-wrap">
            {actions.map((a, i) => (
              <ButtonX
                key={i}
                variant={a.variant ?? (a.primary ? 'default' : (i === 0 ? 'default' : 'outline'))}
                leftIcon={a.leftIcon ?? a.icon}
                rightIcon={a.rightIcon}
                onPress={a.onPress}
              >
                {a.label}
              </ButtonX>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}
