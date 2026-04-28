import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import Svg, { Polyline, Line, Circle, Path } from 'react-native-svg';
import { GOOGLE_FONTS, type GoogleFontOption } from '../theme/googleFonts';
import { useFontStore, FONT_SIZE_OPTIONS, type FontSizeOption } from '../store/fontStore';

// ── Design tokens (match app theme) ──────────────────────────────────
const TEXT    = '#0F172A';
const MUTED   = '#64748B';
const SUBTLE  = '#94A3B8';
const BORDER  = '#E2E8F0';
const BG      = '#F8FAFC';
const SURFACE = '#FFFFFF';
const ACCENT  = '#2563EB';

// ── Tiny icon helpers ─────────────────────────────────────────────────
function CheckIcon({ size = 16, color = ACCENT }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}
function XIcon({ size = 18, color = MUTED }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </Svg>
  );
}
function TypeIcon({ size = 18, color = MUTED }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="4 7 4 4 20 4 20 7" />
      <Line x1="9" y1="20" x2="15" y2="20" />
      <Line x1="12" y1="4" x2="12" y2="20" />
    </Svg>
  );
}

// ── Category label ────────────────────────────────────────────────────
const CATEGORY_LABEL: Record<string, string> = {
  'sans-serif': 'Sans-Serif',
  'serif':      'Serif',
  'monospace':  'Monospace',
};

// ── Font card ─────────────────────────────────────────────────────────
function FontCard({
  option,
  selected,
  onPress,
  accentColor,
}: {
  option: GoogleFontOption;
  selected: boolean;
  onPress: () => void;
  accentColor: string;
}) {
  // On web we can set fontFamily via inline style to preview each font.
  // The font must already be loaded (we load all candidates on picker open).
  const previewStyle: any = Platform.OS === 'web'
    ? { fontFamily: `'${option.family}', ${option.fallback}` }
    : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.72}
      style={[
        s.card,
        selected && { borderColor: accentColor, backgroundColor: `${accentColor}08` },
      ]}
    >
      {/* Font name + category */}
      <View style={s.cardHeader}>
        <Text style={[s.cardName, previewStyle]}>{option.name}</Text>
        <View style={[s.catBadge,
          option.category === 'serif'     && { backgroundColor: '#FEF3C7' },
          option.category === 'monospace' && { backgroundColor: '#EDE9FE' },
        ]}>
          <Text style={[s.catLabel,
            option.category === 'serif'     && { color: '#92400E' },
            option.category === 'monospace' && { color: '#5B21B6' },
          ]}>
            {CATEGORY_LABEL[option.category]}
          </Text>
        </View>
      </View>

      {/* Large preview */}
      <Text style={[s.previewLarge, previewStyle]} numberOfLines={1}>
        Aa Bb Cc 0–9
      </Text>
      <Text style={[s.previewSub, previewStyle]} numberOfLines={1}>
        {option.previewText}
      </Text>

      {/* Selected indicator */}
      {selected && (
        <View style={[s.checkBadge, { backgroundColor: accentColor }]}>
          <CheckIcon size={12} color="#FFFFFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Main component ────────────────────────────────────────────────────
interface FontPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  accentColor?: string;
}

export function FontPickerSheet({
  visible,
  onClose,
  accentColor = ACCENT,
}: FontPickerSheetProps) {
  const { font: currentFont, setFont, fontSize: currentSize, setFontSize } = useFontStore();
  const [previewFontsLoaded, setPreviewFontsLoaded] = useState(false);

  // Pre-load all font candidates when the picker opens (web only)
  React.useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return;

    GOOGLE_FONTS.forEach((f) => {
      const id = `preview-font-${f.name.replace(/\s/g, '-')}`;
      if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${f.googleParam}&display=swap`;
        document.head.appendChild(link);
      }
    });

    // Small delay so fonts start loading before we render cards
    const t = setTimeout(() => setPreviewFontsLoaded(true), 120);
    return () => clearTimeout(t);
  }, [visible]);

  const handleSelect = (font: GoogleFontOption) => {
    setFont(font);
  };

  // Group by category
  const sansSerif  = GOOGLE_FONTS.filter((f) => f.category === 'sans-serif');
  const serif      = GOOGLE_FONTS.filter((f) => f.category === 'serif');
  const monospace  = GOOGLE_FONTS.filter((f) => f.category === 'monospace');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>

          {/* Header */}
          <View style={s.header}>
            <View style={[s.headerIcon, { backgroundColor: `${accentColor}12` }]}>
              <TypeIcon size={20} color={accentColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Font Seçimi</Text>
              <Text style={s.subtitle}>
                Seçilen font uygulamanın tamamında geçerli olur
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={s.closeBtn}>
              <XIcon size={18} color={MUTED} />
            </TouchableOpacity>
          </View>

          {/* Current selection preview bar */}
          <View style={[s.currentBar, { borderLeftColor: accentColor }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={s.currentLabel}>Aktif seçim</Text>
              <View style={[s.currentSizePill, { backgroundColor: `${accentColor}14` }]}>
                <Text style={[s.currentSizePillText, { color: accentColor }]}>
                  {currentSize.label}
                </Text>
              </View>
            </View>
            <Text style={[s.currentName, { color: accentColor },
              Platform.OS === 'web'
                ? { fontFamily: `'${currentFont.family}', ${currentFont.fallback}` } as any
                : {}
            ]}>
              {currentFont.name}
            </Text>
            <Text style={[s.currentSample,
              Platform.OS === 'web'
                ? { fontFamily: `'${currentFont.family}', ${currentFont.fallback}` } as any
                : {}
            ]}>
              Merhaba Dünya · 1234567890
            </Text>
          </View>

          {/* Font grid */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}>

            {/* ── Font size picker ───────────────────────────────────── */}
            <View style={s.sizeSection}>
              <View style={s.sectionRow}>
                <Text style={s.sectionLabel}>Yazı Boyutu</Text>
                <View style={s.sectionLine} />
              </View>
              <View style={s.sizeRow}>
                {FONT_SIZE_OPTIONS.map((opt) => {
                  const active = currentSize.key === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => setFontSize(opt)}
                      activeOpacity={0.72}
                      style={[
                        s.sizeCard,
                        active && { borderColor: accentColor, backgroundColor: `${accentColor}08` },
                      ]}
                    >
                      {/* "Aa" rendered at the preview size so the card itself IS the preview */}
                      <Text style={[
                        s.sizeAa,
                        { fontSize: opt.previewSize },
                        active && { color: accentColor },
                      ]}>
                        Aa
                      </Text>
                      <Text style={[s.sizeLabel, active && { color: accentColor, fontWeight: '700' }]}>
                        {opt.label}
                      </Text>
                      {active && (
                        <View style={[s.sizeCheck, { backgroundColor: accentColor }]}>
                          <CheckIcon size={9} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <SectionLabel label="Sans-Serif" />
            <View style={s.grid}>
              {sansSerif.map((f) => (
                <FontCard
                  key={f.name}
                  option={f}
                  selected={currentFont.name === f.name}
                  onPress={() => handleSelect(f)}
                  accentColor={accentColor}
                />
              ))}
            </View>

            <SectionLabel label="Serif" />
            <View style={s.grid}>
              {serif.map((f) => (
                <FontCard
                  key={f.name}
                  option={f}
                  selected={currentFont.name === f.name}
                  onPress={() => handleSelect(f)}
                  accentColor={accentColor}
                />
              ))}
            </View>

            <SectionLabel label="Monospace" />
            <View style={s.grid}>
              {monospace.map((f) => (
                <FontCard
                  key={f.name}
                  option={f}
                  selected={currentFont.name === f.name}
                  onPress={() => handleSelect(f)}
                  accentColor={accentColor}
                />
              ))}
            </View>

          </ScrollView>

          {/* Footer */}
          <View style={s.footer}>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.82}
              style={[s.applyBtn, { backgroundColor: accentColor }]}
            >
              <CheckIcon size={15} color="#FFFFFF" />
              <Text style={s.applyBtnText}>Uygula ve Kapat</Text>
            </TouchableOpacity>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionLabel}>{label}</Text>
      <View style={s.sectionLine} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    ...(Platform.OS === 'web'
      ? ({ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as any)
      : {}),
  },
  sheet: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    width: '100%',
    maxWidth: 620,
    maxHeight: '88%',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 32px 80px rgba(15,23,42,0.24)' } as any)
      : {
          shadowColor: '#0F172A',
          shadowOpacity: 0.24,
          shadowRadius: 40,
          shadowOffset: { width: 0, height: 16 },
          elevation: 24,
        }),
  },

  // ── Header ───────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 16, fontWeight: '800', color: TEXT, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: MUTED, marginTop: 2 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: BG,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Current font bar ─────────────────────────────────────────────
  currentBar: {
    marginHorizontal: 20,
    marginVertical: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: BG,
    borderRadius: 12,
    borderLeftWidth: 3,
    gap: 3,
  },
  currentLabel:       { fontSize: 10, fontWeight: '700', color: SUBTLE, letterSpacing: 0.5, textTransform: 'uppercase' },
  currentSizePill:    { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  currentSizePillText:{ fontSize: 10, fontWeight: '700' },
  currentName:        { fontSize: 18, fontWeight: '700', letterSpacing: -0.4 },
  currentSample:      { fontSize: 13, color: MUTED, marginTop: 2 },

  // ── Section label ────────────────────────────────────────────────
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, marginTop: 16, marginBottom: 10,
  },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: SUBTLE, letterSpacing: 0.6, textTransform: 'uppercase' },
  sectionLine:  { flex: 1, height: 1, backgroundColor: BORDER },

  // ── Font card grid ───────────────────────────────────────────────
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 20,
  },
  card: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    position: 'relative',
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'border-color 0.15s, background-color 0.15s' } as any)
      : {}),
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 6,
    marginBottom: 6,
  },
  cardName:    { fontSize: 13, fontWeight: '700', color: TEXT, flex: 1 },
  catBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 99,
  },
  catLabel:    { fontSize: 9, fontWeight: '700', color: '#166534', letterSpacing: 0.3 },
  previewLarge:{ fontSize: 20, fontWeight: '600', color: TEXT, letterSpacing: -0.5 },
  previewSub:  { fontSize: 11, color: MUTED },
  checkBadge: {
    position: 'absolute',
    top: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Font size section ────────────────────────────────────────────
  sizeSection: { marginBottom: 4 },
  sizeRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 2,
  },
  sizeCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 6,
    gap: 5,
    position: 'relative',
    minHeight: 80,
    ...(Platform.OS === 'web'
      ? ({ cursor: 'pointer', transition: 'border-color 0.15s' } as any)
      : {}),
  },
  sizeAa: {
    fontWeight: '700',
    color: TEXT,
    lineHeight: undefined,   // let font size dictate
  },
  sizeLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: MUTED,
    textAlign: 'center',
  },
  sizeCheck: {
    position: 'absolute',
    top: 8, right: 8,
    width: 18, height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Footer ───────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  applyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  applyBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
