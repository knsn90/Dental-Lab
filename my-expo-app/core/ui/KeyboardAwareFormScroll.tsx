// KeyboardAwareFormScroll — Form ekranlarında klavye açıldığında odaktaki
// TextInput'u her zaman klavyenin üstünde tutar.
//
// 3 katman:
//   1. KeyboardAvoidingView (behavior='padding' iOS / 'height' Android)
//   2. ScrollView automaticallyAdjustKeyboardInsets (iOS 14+ native scroll inset)
//   3. keyboardShouldPersistTaps='handled' — input-dışı tap'larda klavye kapansın
//      ama interaktif elementlere geçilirse açık kalsın
//
// Kullanım:
//   <KeyboardAwareFormScroll>
//     <TextInput ... />
//     <TextInput ... />
//   </KeyboardAwareFormScroll>

import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props extends Omit<ScrollViewProps, 'children'> {
  children: React.ReactNode;
  /** Klavye + tab bar üstü için ekstra alt padding (px). Default: 16 */
  extraBottomPadding?: number;
  /** KeyboardAvoidingView'a header offset (status bar / nav bar varsa). Default: 0 */
  keyboardVerticalOffset?: number;
  /** Outer container style (KeyboardAvoidingView) */
  containerStyle?: StyleProp<ViewStyle>;
  /** ScrollView contentContainerStyle override */
  contentContainerStyle?: StyleProp<ViewStyle>;
}

export function KeyboardAwareFormScroll({
  children,
  extraBottomPadding = 16,
  keyboardVerticalOffset = 0,
  containerStyle,
  contentContainerStyle,
  ...scrollProps
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={[{ flex: 1 }, containerStyle]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        // iOS native: keyboard açıldığında ScrollView içine focused input'u
        // otomatik scroll ile getirir (RN 0.71+)
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        contentInsetAdjustmentBehavior="automatic"
        {...scrollProps}
        contentContainerStyle={[
          {
            flexGrow: 1,
            paddingBottom: insets.bottom + extraBottomPadding,
          },
          contentContainerStyle,
        ]}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
