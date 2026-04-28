import React from 'react';
import { AppIcon } from '../../../core/ui/AppIcon';

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {
  COLOR_THEMES,
  type ColorTheme,
  useColorThemeStore,
} from '../../../core/store/colorThemeStore';
import {
  FONT_SIZE_OPTIONS,
  useFontStore,
} from '../../../core/store/fontStore';

interface Props {
  panelType: string;
  accentColor: string;
  defaultAccent: string;
}

export function AppearanceSection({ panelType, accentColor, defaultAccent }: Props) {
  const { getTheme, setTheme } = useColorThemeStore();
  const { fontSize: selectedFontSize, setFontSize } = useFontStore();

  const currentTheme = getTheme(panelType);

  function handleSelectTheme(theme: ColorTheme) {
    setTheme(panelType, theme, defaultAccent);
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.container}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Renk Teması ────────────────────────────────────────────── */}
      <Text style={s.sectionTitle}>Renk Teması</Text>
      <Text style={s.sectionSub}>
        Panel genelinde kullanılan ana rengi seçin.
      </Text>

      <View style={s.themeGrid}>
        {COLOR_THEMES.map((theme) => {
          const active = currentTheme.key === theme.key;
          return (
            <TouchableOpacity
              key={theme.key}
              style={[s.themeCard, active && { borderColor: accentColor, borderWidth: 2 }]}
              onPress={() => handleSelectTheme(theme)}
              activeOpacity={0.8}
            >
              {/* Swatch row */}
              <View style={s.swatchRow}>
                <View style={[s.swatch, s.swatchLarge, { backgroundColor: theme.primary }]} />
                <View style={[s.swatch, s.swatchMed,   { backgroundColor: theme.dark }]} />
                <View style={[s.swatch, s.swatchSmall,  { backgroundColor: theme.muted }]} />
              </View>

              {/* Name + description */}
              <View style={s.themeInfo}>
                <Text style={s.themeName}>{theme.name}</Text>
                <Text style={s.themeDesc} numberOfLines={1}>{theme.description}</Text>
              </View>

              {/* Active badge */}
              {active && (
                <View style={[s.activeBadge, { backgroundColor: accentColor }]}>
                  <AppIcon name="check" size={11} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Yazı Boyutu ────────────────────────────────────────────── */}
      <Text style={[s.sectionTitle, { marginTop: 28 }]}>Yazı Boyutu</Text>
      <Text style={s.sectionSub}>
        Tüm uygulama bu ölçeğe göre boyutlandırılır.
      </Text>

      <View style={s.sizeRow}>
        {FONT_SIZE_OPTIONS.map((opt) => {
          const active = selectedFontSize.key === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              style={[
                s.sizeCard,
                active && { borderColor: accentColor, borderWidth: 2, backgroundColor: accentColor + '0C' },
              ]}
              onPress={() => setFontSize(opt)}
              activeOpacity={0.8}
            >
              <Text style={[s.sizePreview, { fontSize: opt.previewSize, color: active ? accentColor : '#0F172A' }]}>
                Aa
              </Text>
              <Text style={[s.sizeLabel, { color: active ? accentColor : '#64748B', fontWeight: active ? '700' : '500' }]}>
                {opt.label}
              </Text>
              {active && (
                <View style={[s.sizeCheck, { backgroundColor: accentColor }]}>
                  <AppIcon name="check" size={9} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    padding: 28,
    paddingBottom: 48,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
    lineHeight: 19,
  },

  // ── Theme grid ──────────────────────────────────────────────────────────
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  themeCard: {
    width: 'calc(33.33% - 8px)' as any,
    minWidth: 140,
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E8EDF4',
    padding: 14,
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  swatchRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    marginBottom: 12,
  },
  swatch:      { borderRadius: 6 },
  swatchLarge: { width: 32, height: 32 },
  swatchMed:   { width: 24, height: 24 },
  swatchSmall: { width: 18, height: 18 },
  themeInfo:   { gap: 2 },
  themeName:   { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  themeDesc:   { fontSize: 11, color: '#94A3B8' },
  activeBadge: {
    position: 'absolute',
    top: 10, right: 10,
    width: 20, height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Size picker ──────────────────────────────────────────────────────────
  sizeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sizeCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E8EDF4',
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  sizePreview: { fontWeight: '700', marginBottom: 6 },
  sizeLabel:   { fontSize: 11, textAlign: 'center' },
  sizeCheck: {
    position: 'absolute',
    top: 6, right: 6,
    width: 16, height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
