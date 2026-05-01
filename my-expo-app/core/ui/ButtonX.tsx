/**
 * ButtonX — shadcn/ui style button (React Native + NativeWind)
 *
 *  Variant'lar (shadcn standard):
 *    default     — primary bg, primary-foreground text
 *    secondary   — secondary bg, secondary-foreground text
 *    destructive — destructive bg, destructive-foreground text
 *    outline     — border, foreground text, hover bg-accent
 *    ghost       — transparent, hover bg-accent
 *    link        — text-primary underline-offset-4 hover:underline
 *
 *  Size'lar:
 *    sm   — h-9 px-3
 *    md   — h-10 px-4 (default)
 *    lg   — h-11 px-8
 *    icon — h-10 w-10 (only icon)
 *
 *  Kullanım:
 *    <ButtonX onPress={...}>Click me</ButtonX>
 *    <ButtonX variant="secondary" size="sm">Small</ButtonX>
 *    <ButtonX variant="destructive" leftIcon="trash">Sil</ButtonX>
 */
import React from 'react';
import { Pressable, Text, ActivityIndicator, View, PressableProps } from 'react-native';
import { AppIcon } from './AppIcon';

type Variant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';
type Size    = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, { wrap: string; text: string }> = {
  default: {
    wrap: 'bg-primary web:hover:bg-primary/90 active:opacity-90',
    text: 'text-primary-foreground',
  },
  secondary: {
    wrap: 'bg-secondary web:hover:bg-secondary/80 active:opacity-90',
    text: 'text-secondary-foreground',
  },
  destructive: {
    wrap: 'bg-destructive web:hover:bg-destructive/90 active:opacity-90',
    text: 'text-destructive-foreground',
  },
  outline: {
    wrap: 'border border-input bg-background web:hover:bg-accent active:opacity-80',
    text: 'text-foreground',
  },
  ghost: {
    wrap: 'web:hover:bg-accent active:bg-accent',
    text: 'text-foreground',
  },
  link: {
    wrap: 'web:hover:underline',
    text: 'text-primary underline-offset-4',
  },
};

const SIZES: Record<Size, { wrap: string; text: string; icon: number }> = {
  sm:   { wrap: 'h-9 px-3 rounded-md gap-1.5',  text: 'text-sm font-medium', icon: 14 },
  md:   { wrap: 'h-10 px-4 rounded-md gap-2',   text: 'text-sm font-semibold', icon: 16 },
  lg:   { wrap: 'h-11 px-8 rounded-md gap-2',   text: 'text-base font-semibold', icon: 18 },
  icon: { wrap: 'h-10 w-10 rounded-md',          text: 'text-sm', icon: 18 },
};

export interface ButtonXProps extends Omit<PressableProps, 'children'> {
  children?:  React.ReactNode;
  variant?:   Variant;
  size?:      Size;
  loading?:   boolean;
  disabled?:  boolean;
  leftIcon?:  string;
  rightIcon?: string;
  className?: string;
  /** className text için */
  textClassName?: string;
  /** Tam genişlik (full width) */
  fullWidth?: boolean;
}

export function ButtonX({
  children,
  variant = 'default',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  className,
  textClassName,
  fullWidth = false,
  ...rest
}: ButtonXProps) {
  const v = VARIANTS[variant];
  const sz = SIZES[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      className={`
        flex-row items-center justify-center
        ${sz.wrap}
        ${v.wrap}
        ${fullWidth ? 'w-full' : ''}
        ${isDisabled ? 'opacity-50' : ''}
        web:cursor-pointer
        web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2
        ${className ?? ''}
      `}
      {...rest}
    >
      {loading && <ActivityIndicator size="small" color="currentColor" />}
      {!loading && leftIcon && (
        <AppIcon name={leftIcon as any} size={sz.icon} color={iconColorFor(variant)} strokeWidth={2} />
      )}
      {children !== undefined && (
        <Text className={`${sz.text} ${v.text} ${textClassName ?? ''}`}>{children}</Text>
      )}
      {!loading && rightIcon && (
        <AppIcon name={rightIcon as any} size={sz.icon} color={iconColorFor(variant)} strokeWidth={2} />
      )}
    </Pressable>
  );
}

function iconColorFor(v: Variant): string {
  switch (v) {
    case 'default':     return '#FFFFFF';
    case 'destructive': return '#FFFFFF';
    case 'secondary':   return '#0F172A';
    case 'outline':     return '#0F172A';
    case 'ghost':       return '#0F172A';
    case 'link':        return '#2563EB';
  }
}
