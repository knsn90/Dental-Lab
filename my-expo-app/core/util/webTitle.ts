// core/util/webTitle.ts
//
// RNW View/Pressable `title` prop'unu DOM'a forward ETMEZ (pickProps listesinde
// yok) → düz `title=` tooltip çıkarmaz. Bu yardımcı web'de ref ile DOM node'un
// `title` özniteliğini set eder → tarayıcının yerel hover tooltip'i çıkar.
//
// Kullanım:  <Pressable {...webTitle('Yazdır')} ... >
// Not: ref taşıyan bir bileşende kullanma (ref çakışır); ikon-only butonlarda ise güvenli.

import { Platform } from 'react-native';

export function webTitle(text?: string | null): Record<string, any> {
  if (Platform.OS !== 'web' || !text) return {};
  return {
    ref: (el: any) => {
      try { if (el && 'title' in el) el.title = text; } catch { /* noop */ }
    },
  };
}
