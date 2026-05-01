/**
 * CardX — NativeWind tabanlı Cards Design bileşenleri (web-first)
 *
 *   <CardX>...</CardX>
 *   <CardX.Header>...</CardX.Header>
 *   <CardX.Body>...</CardX.Body>
 *   <CardX.Footer>...</CardX.Footer>
 *
 * Mevcut StyleSheet tabanlı `Card` bileşenini bozmaz — yeni ekranlarda CardX kullan.
 */
import React from 'react';
import { View, Text, ViewProps, TextProps } from 'react-native';

type Variant = 'default' | 'hero' | 'flat' | 'outline';

const BASE = 'bg-surface rounded-card border border-card';
const VARIANTS: Record<Variant, string> = {
  default: BASE + ' shadow-card',
  hero:    BASE + ' shadow-cardHero p-6',
  flat:    BASE + ' shadow-cardLite',
  outline: 'bg-surface rounded-card border border-slate-200',
};

interface CardXProps extends ViewProps {
  variant?: Variant;
  /** Üst kenarda renkli accent strip */
  accent?:  string;
}

export function CardX({ variant = 'default', accent, className, children, ...rest }: CardXProps) {
  return (
    <View
      className={`${VARIANTS[variant]} ${className ?? ''} relative overflow-hidden`}
      {...rest}
    >
      {accent && (
        <View
          className="absolute top-0 left-0 right-0 h-1"
          style={{ backgroundColor: accent }}
        />
      )}
      {children}
    </View>
  );
}

CardX.Header = function CardHeader({ className, children, ...rest }: ViewProps) {
  return (
    <View className={`px-5 py-4 border-b border-slate-100 ${className ?? ''}`} {...rest}>
      {children}
    </View>
  );
};

CardX.Body = function CardBody({ className, children, ...rest }: ViewProps) {
  return (
    <View className={`px-5 py-4 ${className ?? ''}`} {...rest}>
      {children}
    </View>
  );
};

CardX.Footer = function CardFooter({ className, children, ...rest }: ViewProps) {
  return (
    <View
      className={`px-5 py-3 border-t border-slate-100 bg-slate-50/50 ${className ?? ''}`}
      {...rest}
    >
      {children}
    </View>
  );
};

CardX.Title = function CardTitle({ className, children, ...rest }: TextProps) {
  return (
    <Text className={`text-base font-bold text-slate-900 tracking-tight ${className ?? ''}`} {...rest}>
      {children}
    </Text>
  );
};

CardX.Subtitle = function CardSubtitle({ className, children, ...rest }: TextProps) {
  return (
    <Text className={`text-xs text-slate-500 mt-1 ${className ?? ''}`} {...rest}>
      {children}
    </Text>
  );
};
