/**
 * PenControls — 3D kalem arayüzü (seçenek çubuğu + not metni sorusu).
 *
 * Kalem açıkken kamera kontrolü kapanıyor; bu yüzden çubuk kalemin AÇIK
 * olduğunu ve nasıl kapatılacağını net göstermek zorunda — yoksa kullanıcı
 * "model dönmüyor" diye viewer'ı bozuk sanıyor.
 */
import React from 'react';
import {
  View, Text, Pressable, Platform, TextInput, Modal, useWindowDimensions,
} from 'react-native';
import { PenLine, MoveUpRight, MessageSquare, Undo2, X, Check } from '../../../core/ui/icons';
import { useViewerTheme } from '../lib/viewerTheme';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { autoT } from '../../../core/i18n/autoTranslate';
import { PEN_COLORS, PEN_WIDTHS, type AnnotationKind } from '../annotations/types';

const KINDS: { key: AnnotationKind; icon: any; label: string }[] = [
  { key: 'stroke', icon: PenLine, label: 'Serbest çizim' },
  { key: 'arrow', icon: MoveUpRight, label: 'Ok' },
  { key: 'note', icon: MessageSquare, label: 'Metin notu' },
];

function useChrome() {
  const T = useViewerTheme();
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  return {
    isDark,
    accent: T.accent,
    surface: isDark ? 'rgba(24,23,22,0.97)' : '#FFFFFF',
    border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.10)',
    ink: isDark ? '#F7F2E9' : '#0A0A0A',
    ink3: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)',
    btnBg: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.05)',
    onAccent: '#FFFFFF',
  };
}

export function PenOptionsBar({
  kind, onKind, color, onColor, width, onWidth, onUndo, canUndo, count, onClose,
}: {
  kind: AnnotationKind;
  onKind: (k: AnnotationKind) => void;
  color: string;
  onColor: (c: string) => void;
  width: number;
  onWidth: (w: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  count: number;
  onClose: () => void;
}) {
  const C = useChrome();
  const { width: winW } = useWindowDimensions();
  const isNarrow = winW < 768;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center', zIndex: 22 }}
    >
      <View style={{
        flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
        justifyContent: 'center', gap: 8,
        maxWidth: isNarrow ? winW - 24 : 620,
        paddingHorizontal: 10, paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: C.surface,
        borderWidth: 1, borderColor: C.border,
        ...(Platform.OS === 'web'
          ? { boxShadow: '0 18px 40px -14px rgba(15,23,42,0.34)' } as any
          : { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 16 }),
      }}>
        {/* Çizim tipi */}
        {KINDS.map(({ key, icon: Icon, label }) => {
          const active = kind === key;
          return (
            <Pressable
              key={key}
              onPress={() => onKind(key)}
              accessibilityLabel={autoT(label)}
              hitSlop={6}
              style={{
                width: 34, height: 34, borderRadius: 17,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: active ? C.accent : C.btnBg,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Icon size={16} color={active ? C.onAccent : C.ink} strokeWidth={2} />
            </Pressable>
          );
        })}

        <View style={{ width: 1, height: 20, backgroundColor: C.border }} />

        {/* Renk */}
        {PEN_COLORS.map((c) => {
          const active = c.toLowerCase() === color.toLowerCase();
          return (
            <Pressable
              key={c}
              onPress={() => onColor(c)}
              accessibilityLabel={autoT('Kalem rengi')}
              hitSlop={6}
              style={{
                width: 24, height: 24, borderRadius: 12, backgroundColor: c,
                borderWidth: active ? 3 : 1,
                borderColor: active ? (C.isDark ? '#FFFFFF' : '#0A0A0A') : C.border,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            />
          );
        })}

        <View style={{ width: 1, height: 20, backgroundColor: C.border }} />

        {/* Kalınlık */}
        {PEN_WIDTHS.map((w, i) => {
          const active = Math.abs(w - width) < 1e-6;
          const dot = 6 + i * 4;
          return (
            <Pressable
              key={w}
              onPress={() => onWidth(w)}
              accessibilityLabel={autoT('Kalem kalınlığı')}
              hitSlop={6}
              style={{
                width: 30, height: 30, borderRadius: 15,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: active ? C.accent : C.btnBg,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <View style={{
                width: dot, height: dot, borderRadius: dot / 2,
                backgroundColor: active ? C.onAccent : C.ink,
              }} />
            </Pressable>
          );
        })}

        <View style={{ width: 1, height: 20, backgroundColor: C.border }} />

        {/* Geri al (son notu sil) */}
        <Pressable
          onPress={onUndo}
          disabled={!canUndo}
          accessibilityLabel={autoT('Son notu sil')}
          hitSlop={6}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 10, height: 32, borderRadius: 16,
            backgroundColor: C.btnBg, opacity: canUndo ? 1 : 0.4,
            ...(Platform.OS === 'web' && canUndo ? { cursor: 'pointer' } as any : {}),
          }}
        >
          <Undo2 size={14} color={C.ink} strokeWidth={2} />
          <Text style={{ color: C.ink, fontSize: 11.5, fontWeight: '700' }}>{count}</Text>
        </Pressable>

        {/* Kalemi kapat — kamera geri gelir */}
        <Pressable
          onPress={onClose}
          accessibilityLabel={autoT('Kalemi kapat')}
          hitSlop={6}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, height: 32, borderRadius: 16,
            backgroundColor: C.accent,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          }}
        >
          <X size={14} color={C.onAccent} strokeWidth={2.4} />
          <Text style={{ color: C.onAccent, fontSize: 11.5, fontWeight: '800' }}>{autoT('Bitti')}</Text>
        </Pressable>
      </View>

      {/* Kısa ipucu — kalem açıkken modelin dönmediği şaşırtmasın */}
      <Text style={{ marginTop: 6, fontSize: 10.5, color: C.ink3, textAlign: 'center' }}>
        {kind === 'note'
          ? autoT('Modele dokun: not ekle')
          : kind === 'arrow'
            ? autoT('Bir noktadan diğerine sürükle')
            : autoT('Model üzerinde sürükleyerek çiz')}
      </Text>
    </View>
  );
}

/** Metin notu için küçük giriş kartı. */
export function NoteTextPrompt({
  visible, value, onChange, onCancel, onSave,
}: {
  visible: boolean;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const C = useChrome();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.52)', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      >
        {/* İçeriye dokunmak kapatmasın */}
        <Pressable
          onPress={() => {}}
          style={{
            width: '100%', maxWidth: 420,
            backgroundColor: C.surface, borderRadius: 20,
            borderWidth: 1, borderColor: C.border, padding: 16, gap: 12,
          }}
        >
          <Text style={{ color: C.ink, fontSize: 15, fontWeight: '700' }}>{autoT('Not ekle')}</Text>
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={autoT('Örn: bu bölgeyi 0,3 mm kaldır')}
            placeholderTextColor={C.ink3}
            multiline
            autoFocus
            maxLength={1000}
            style={{
              minHeight: 88, borderRadius: 14, borderWidth: 1, borderColor: C.border,
              paddingHorizontal: 12, paddingVertical: 10,
              color: C.ink, fontSize: 14,
              textAlignVertical: 'top',
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
            }}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Pressable
              onPress={onCancel}
              style={{
                paddingHorizontal: 14, height: 38, borderRadius: 19,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: C.btnBg,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Text style={{ color: C.ink, fontSize: 13, fontWeight: '600' }}>{autoT('İptal')}</Text>
            </Pressable>
            <Pressable
              onPress={onSave}
              disabled={!value.trim()}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 16, height: 38, borderRadius: 19,
                backgroundColor: C.accent, opacity: value.trim() ? 1 : 0.5,
                ...(Platform.OS === 'web' && value.trim() ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Check size={15} color={C.onAccent} strokeWidth={2.4} />
              <Text style={{ color: C.onAccent, fontSize: 13, fontWeight: '800' }}>{autoT('Kaydet')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
