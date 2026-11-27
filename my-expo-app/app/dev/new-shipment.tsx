// app/dev/new-shipment.tsx — Yeni gönderi penceresi demo sayfası (yalnız __DEV__).
// Kurye takip ekranı giriş istediği için bağımsız gönderi formu (A → B dahil) burada denenir.
// Gönderi OLUŞTURULMAZ: oturum yok, RPC/edge çağrıları yetkisiz döner.
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useInkUI } from '../../core/theme/inkScale';
import { NewShipmentModal } from '../../modules/courier/components/NewShipmentModal';

export default function NewShipmentDemo() {
  const U = useInkUI();
  const [open, setOpen] = useState(true);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: U.surfaceSoft }}>
      <Pressable onPress={() => setOpen(true)}
        style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
                 backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border }}>
        <Text style={{ color: U.plainBtn.fg }}>Yeni gönderi</Text>
      </Pressable>
      <NewShipmentModal visible={open} onClose={() => setOpen(false)} onCreated={() => setOpen(false)} accent="#2563EB" />
    </View>
  );
}
