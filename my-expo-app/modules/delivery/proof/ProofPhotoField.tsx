// modules/delivery/proof/ProofPhotoField.tsx
// Teslim fotoğrafı. Telefonda yalnız kamera (galeri yok: eski fotoğraf seçilmesin); masaüstü
// tarayıcıda dosya seçici. Web'de fotoğraf tuvalle uzun kenar 1600 px / JPEG 0.82'ye küçültülür.
// Çekim anı (spec 6): deklanşör ışığı + yerine oturma yayı + kısa titreşim — aynı karede.
import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Platform, Animated, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import type { ProofAsset } from './api';
import { haptic, useReduceMotion } from './useAnchoredSpring';

const NATIVE_DRIVER = Platform.OS !== 'web';
const MAX_EDGE = 1600;

export type CapturedPhoto = ProofAsset & { takenAt: Date };

async function shrinkWeb(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img: HTMLImageElement = await new Promise((res, rej) => {
      const i = new (window as any).Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
    });
    const k = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise((res) => cv.toBlob((b) => res(b ?? file), 'image/jpeg', 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Web: <input capture> — kullanıcı dokunuşunun içinde eşzamanlı açılmalı (tarayıcı kuralı). */
function pickWeb(onPicked: (p: CapturedPhoto) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.setAttribute('capture', 'environment');
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const blob = await shrinkWeb(f);
    onPicked({ uri: URL.createObjectURL(blob), blob, mimeType: 'image/jpeg', takenAt: new Date() });
  };
  input.click();
}

async function pickNative(onPicked: (p: CapturedPhoto) => void) {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(autoT('İzin gerekli'), autoT('Fotoğraf çekmek için kamera izni gerekiyor.'));
    return;
  }
  const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
  if (res.canceled || !res.assets?.length) return;
  const a = res.assets[0];
  onPicked({ uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg', takenAt: new Date() });
}

/** Demo sayfası için örnek görsel (kamera açılmaz; ağ yok). */
export function demoPhoto(): CapturedPhoto {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAIAAAAUMWhjAAAA40lEQVR42rXNV1bCAABE0dm7XbFirygEQgKBQBTTe5cmCLob2cSc877vw1+p/RbDdT5YZ+oq66/S3k+iLOPuMu4sInkRSt+BNA/ac1+cea2Z25y6wsRpTOz62HobW69fZq00aqX+UujPxedTPnrMRw/Zx336fpdqt4l2A6qeDK9B1ePBZsDUI/UKVD1SL0HVw34VVD3sXYCqB8o5qLqvnIGq+91TUHWvcwKq7snHoOquXAFVd6QKqLrTPgJVt8VDUHVbPABVt1r7oOpmcw9U3RR2QdUNYQdU3Whsg6rr9S1Q9U3/XLBOdjgJ47oAAAAASUVORK5CYII=';
  return { uri: `data:image/png;base64,${png}`, mimeType: 'image/png', takenAt: new Date() };
}

export function ProofPhotoField({ value, onChange, disabled, demo }: {
  value: CapturedPhoto | null;
  onChange: (p: CapturedPhoto | null) => void;
  disabled?: boolean;
  /** Demo: kamera yerine örnek görsel. */
  demo?: boolean;
}) {
  const U = useInkUI();
  const reduce = useReduceMotion();
  const settle = useRef(new Animated.Value(1)).current;   // 0 = yeni çekildi, 1 = yerinde
  const flash = useRef(new Animated.Value(0)).current;
  const prevUri = useRef<string | null>(null);

  useEffect(() => {
    if (value && value.uri !== prevUri.current) {
      haptic(8);
      if (!reduce) {
        settle.setValue(0); flash.setValue(0.85);
        Animated.parallel([
          Animated.spring(settle, { toValue: 1, stiffness: 260, damping: 32, mass: 1, useNativeDriver: NATIVE_DRIVER }),
          Animated.timing(flash, { toValue: 0, duration: 380, useNativeDriver: NATIVE_DRIVER }),
        ]).start();
      }
    }
    prevUri.current = value?.uri ?? null;
  }, [value, reduce, settle, flash]);

  const take = () => {
    if (disabled) return;
    if (demo) { onChange(demoPhoto()); return; }
    if (Platform.OS === 'web') pickWeb(onChange);
    else void pickNative(onChange);
  };

  const pill = { position: 'absolute' as const, bottom: 10, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.45)' };
  const hhmm = value ? `${String(value.takenAt.getHours()).padStart(2, '0')}:${String(value.takenAt.getMinutes()).padStart(2, '0')}` : '';

  if (!value) {
    return (
      <GlassTooltip title={autoT('Fotoğraf çek')} text={autoT('Paket ve bırakıldığı yer görünsün')} placement="top">
        <Pressable
          onPress={take}
          accessibilityRole="button"
          accessibilityLabel={autoT('Fotoğraf çek')}
          style={({ pressed }: any) => ({
            aspectRatio: 4 / 3, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: U.fieldBorder,
            backgroundColor: U.surfaceSoft, alignItems: 'center', justifyContent: 'center', gap: 10,
            transform: [{ scale: pressed ? 0.985 : 1 }],
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null),
          })}
        >
          <Camera size={30} color={U.ink[700]} strokeWidth={1.7} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[800] }}>{autoT('Fotoğraf çek')}</Text>
          <Text style={{ fontSize: 11.5, color: U.ink[400] }}>{autoT('Paket ve bırakıldığı yer görünsün')}</Text>
        </Pressable>
      </GlassTooltip>
    );
  }

  return (
    <View style={{ aspectRatio: 4 / 3, borderRadius: 18, overflow: 'hidden', backgroundColor: U.surfaceSoft }}>
      <Animated.Image
        source={{ uri: value.uri }}
        resizeMode="cover"
        style={{
          width: '100%', height: '100%',
          transform: [{ scale: settle.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1] }) }],
        }}
      />
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', opacity: flash }} />
      <View style={[pill, { left: 10 }]}>
        <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{hhmm}</Text>
      </View>
      <GlassTooltip title={autoT('Yeniden çek')} text={autoT('Fotoğrafı değiştirir')} placement="top">
        <Pressable
          onPress={take}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={autoT('Yeniden çek')}
          style={({ pressed }: any) => ({ ...pill, right: 10, opacity: pressed ? 0.7 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null) })}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 11.5, fontWeight: '600' }}>{autoT('Yeniden çek')}</Text>
        </Pressable>
      </GlassTooltip>
    </View>
  );
}
