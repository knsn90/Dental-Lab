/**
 * CardX — shadcn/ui style card
 *
 *   <CardX>
 *     <CardX.Header>
 *       <CardX.Title>Başlık</CardX.Title>
 *       <CardX.Description>Alt açıklama</CardX.Description>
 *     </CardX.Header>
 *     <CardX.Content>...</CardX.Content>
 *     <CardX.Footer>...</CardX.Footer>
 *   </CardX>
 */
import React from 'react';
import { View, Text, ViewProps, TextProps } from 'react-native';

interface CardXProps extends ViewProps {
  /** İnce border + shadow (varsayılan shadcn görünümü) */
  variant?: 'default' | 'elevated' | 'flat' | 'hero' | 'outline';
  /** Üst kenarda renkli accent strip (legacy compat) */
  accent?:  string;
}

export function CardX({ variant = 'default', accent, className, children, ...rest }: CardXProps) {
  const variantClass =
    variant === 'elevated' || variant === 'hero' ? 'shadow-md'
    : variant === 'flat' || variant === 'outline' ? ''
    : 'shadow-sm';
  return (
    <View
      className={`rounded-lg border border-border bg-card ${variantClass} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </View>
  );
}

CardX.Header = function CardHeader({ className, children, ...rest }: ViewProps) {
  return (
    <View className={`flex flex-col space-y-1.5 p-6 ${className ?? ''}`} {...rest}>
      {children}
    </View>
  );
};

CardX.Title = function CardTitle({ className, children, ...rest }: TextProps) {
  return (
    <Text
      className={`text-lg font-semibold leading-none tracking-tight text-card-foreground ${className ?? ''}`}
      {...rest}
    >
      {children}
    </Text>
  );
};

CardX.Description = function CardDescription({ className, children, ...rest }: TextProps) {
  return (
    <Text className={`text-sm text-muted-foreground ${className ?? ''}`} {...rest}>
      {children}
    </Text>
  );
};

// Eski API ile geri uyumluluk
CardX.Subtitle = CardX.Description;

CardX.Content = function CardContent({ className, children, ...rest }: ViewProps) {
  return (
    <View className={`p-6 pt-0 ${className ?? ''}`} {...rest}>
      {children}
    </View>
  );
};
// Eski API
CardX.Body = CardX.Content;

CardX.Footer = function CardFooter({ className, children, ...rest }: ViewProps) {
  return (
    <View className={`flex flex-row items-center p-6 pt-0 ${className ?? ''}`} {...rest}>
      {children}
    </View>
  );
};
