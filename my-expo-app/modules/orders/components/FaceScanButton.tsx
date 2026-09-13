// modules/orders/components/FaceScanButton.tsx
//
// 3D Yüz Tarama butonu — Dosyalar tab'ında StageFileUpload yanına render edilir.
// Sadece TrueDepth'li iPhone'larda görünür. Diğer platformlarda hiç render olmaz
// (Platform.OS check + ArScanner.isSupported()).
//
// Akış:
//   1. ArScanner.startScan() → modal AR ekranı açar
//   2. Kullanıcı "Yakala" → dosya path'lerini döner (.obj + .mtl + .png + .stl)
//   3. Her dosya work-order-photos bucket'ına upload + work_order_photos'a kayıt
//   4. onUploaded callback → parent FilesList refetch
//
// Caption şeması: "3D Yüz Tarama" — hepsi aynı kategori; CAD yazılımları .obj'yi
// açtığında aynı klasördeki .mtl + .png'yi otomatik bulur.

import React, { useEffect, useState } from 'react';
import { Pressable, Text, ActivityIndicator, Platform } from 'react-native';
import { ScanFace } from '../../../core/ui/icons';
import { toast } from '../../../core/ui/Toast';
import { useAuthStore } from '../../../core/store/authStore';
import { isSupported as arSupported, startScan } from 'ar-scanner';
import { uploadFaceScanResult } from '../utils/uploadFaceScanResult';

interface Props {
  workOrderId: string;
  accentColor: string;
  onUploaded?: () => void;
}

export function FaceScanButton({ workOrderId, accentColor, onUploaded }: Props) {
  const profile = useAuthStore(s => s.profile);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') { setSupported(false); return; }
    try { setSupported(arSupported()); } catch { setSupported(false); }
  }, []);

  if (supported !== true) return null;

  async function handlePress() {
    if (busy || !profile) return;
    setBusy(true);
    try {
      const result = await startScan();
      if (!result) return; // kullanıcı vazgeçti

      const { uploadedCount, errors } = await uploadFaceScanResult({
        result, workOrderId, profile,
      });

      if (uploadedCount > 0) {
        toast.success(`3D Yüz Tarama yüklendi (${uploadedCount} dosya)`);
        onUploaded?.();
      } else {
        toast.error('Hiçbir dosya yüklenemedi' + (errors[0] ? `: ${errors[0]}` : ''));
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Tarama başarısız');
    } finally {
      setBusy(false);
    }
  }

  return (
    // object style ZORUNLU — fonksiyon-stili native'de düşüp satırı column'a
    // çeviriyordu (ikon etiketin üstünde kalıyordu). Solid accent pill yerine
    // yumuşak accent tint: dosya bölümüne uyan, ikincil bir aksiyon gibi durur.
    <Pressable
      onPress={handlePress}
      disabled={busy}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: accentColor + '55',
        backgroundColor: accentColor + '14',
        marginBottom: 8,
        opacity: busy ? 0.6 : 1,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null),
      }}
    >
      {busy
        ? <ActivityIndicator size="small" color={accentColor} />
        : <ScanFace size={16} color={accentColor} strokeWidth={1.9} />}
      <Text style={{ fontSize: 13, fontWeight: '700', color: accentColor }}>
        {busy ? 'Taranıyor…' : '3D Yüz Tarama'}
      </Text>
    </Pressable>
  );
}
