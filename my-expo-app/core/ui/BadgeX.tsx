/**
 * BadgeX — shadcn/ui style badge
 *
 *  <BadgeX>Default</BadgeX>
 *  <BadgeX variant="secondary">Secondary</BadgeX>
 *  <BadgeX variant="destructive">Hata</BadgeX>
 *  <BadgeX variant="outline">Outline</BadgeX>
 *  <BadgeX variant="success">Başarılı</BadgeX>
 */
import React from 'react';
import { View, Text, ViewProps } from 'react-native';

type Variant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info';

const VARIANTS: Record<Variant, { wrap: string; text: string }> = {
  default:     { wrap: 'bg-primary',                                  text: 'text-primary-foreground' },
  secondary:   { wrap: 'bg-secondary',                                text: 'text-secondary-foreground' },
  destructive: { wrap: 'bg-destructive',                              text: 'text-destructive-foreground' },
  outline:     { wrap: 'border border-input bg-transparent',          text: 'text-foreground' },
  success:     { wrap: 'bg-emerald-100',                              text: 'text-emerald-700' },
  warning:     { wrap: 'bg-amber-100',                                text: 'text-amber-700' },
  info:        { wrap: 'bg-sky-100',                                  text: 'text-sky-700' },
};

export interface BadgeXProps extends ViewProps {
  variant?:   Variant;
  children:   React.ReactNode;
  className?: string;
}

export function BadgeX({ variant = 'default', children, className, ...rest }: BadgeXProps) {
  const v = VARIANTS[variant];
  return (
    <View
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full ${v.wrap} ${className ?? ''}`}
      {...rest}
    >
      <Text className={`text-xs font-semibold ${v.text}`}>{children}</Text>
    </View>
  );
}
