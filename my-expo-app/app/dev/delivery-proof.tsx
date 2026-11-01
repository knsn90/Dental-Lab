// app/dev/delivery-proof.tsx — Teslim kanıtı demo sayfası (yalnız __DEV__; ağ çağrısı YOK).
// Canlı hesap salt okunur olduğu için kurye penceresi ve siparişteki kanıt görünümü burada denenir.
// Pencere basılan düğmenin konumundan açılır (spec 6).
import React, { useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { useInkUI } from '../../core/theme/inkScale';
import { DeliveryProofSheet, type DemoDelivery } from '../../modules/delivery/proof/DeliveryProofSheet';
import { measureOrigin, type OriginRect } from '../../modules/delivery/proof/useAnchoredSpring';
import { ProofRow, type ProofLeg } from '../../modules/delivery/proof/ProofRow';
import { ProofViewerModal } from '../../modules/delivery/proof/ProofViewerModal';
import { CloseWithoutProofModal } from '../../modules/delivery/proof/CloseWithoutProofModal';

const NOW = new Date().toISOString();
const BASE: ProofLeg = { id: 'demo-leg', status: 'teslim_edildi', mode: 'internal', direction: 'lab_to_clinic', delivered_at: NOW, courier: { full_name: 'Mehmet K.' } };
const LEGS: { label: string; leg: ProofLeg }[] = [
  { label: 'Kendi kurye', leg: { ...BASE, proof_source: 'courier', recipient_name: 'Ayşe Y.', proof_photo_path: 'demo:photo', signature_path: 'demo:sig', proof_captured_at: NOW } },
  { label: 'İmza alınamadı', leg: { ...BASE, proof_source: 'courier', signature_skipped_reason: 'Resepsiyonda kimse yoktu', proof_photo_path: 'demo:photo', proof_captured_at: NOW } },
  { label: "Lab'a teslim", leg: { ...BASE, direction: 'clinic_to_lab', proof_source: 'courier', proof_photo_path: 'demo:photo', proof_captured_at: NOW } },
  { label: 'BanaBiKurye · adlı', leg: { ...BASE, mode: 'external', external_provider: 'BanaBiKurye', ext_courier_name: 'Can D.', proof_source: 'provider', recipient_name: 'Ayşe Y.', proof_captured_at: NOW, courier: null } },
  { label: 'BanaBiKurye · boş', leg: { ...BASE, mode: 'external', external_provider: 'BanaBiKurye', provider_proof_checked_at: NOW, courier: null } },
  { label: 'Kanıtsız kapatıldı', leg: { ...BASE, proof_source: 'manager_override', proof_override_by_name: 'Selin A.', proof_override_reason: 'Kuryenin telefonu kapandı; klinik telefonla teyit etti.' } },
];

const DEMOS: { label: string; demo: DemoDelivery }[] = [
  { label: 'Kliniğe teslim', demo: { direction: 'lab_to_clinic', destination_name: 'Örnek Diş Kliniği', order_number: '2041', siblings: 0 } },
  { label: "Lab'a teslim", demo: { direction: 'clinic_to_lab', destination_name: 'Laboratuvar', order_number: '2041', siblings: 0 } },
  { label: 'Kliniğe teslim · 2 paket', demo: { direction: 'lab_to_clinic', destination_name: 'Örnek Diş Kliniği', order_number: '2041', siblings: 1 } },
];

function DemoButton({ label, onOpen }: { label: string; onOpen: (o: OriginRect | null) => void }) {
  const ref = useRef<any>(null);
  return (
    <Pressable
      ref={ref}
      onPress={() => measureOrigin(ref.current, onOpen)}
      style={({ pressed }: any) => ({
        height: 48, borderRadius: 14, backgroundColor: '#2D9A6B', alignItems: 'center', justifyContent: 'center',
        transform: [{ scale: pressed ? 0.97 : 1 }], ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null),
      })}
    >
      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export default function DeliveryProofDev() {
  const U = useInkUI();
  const [open, setOpen] = useState<{ demo: DemoDelivery; origin: OriginRect | null } | null>(null);
  const [last, setLast] = useState<string>('');
  const [viewer, setViewer] = useState<{ leg: ProofLeg; origin: OriginRect | null } | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [noProofOrigin, setNoProofOrigin] = useState<OriginRect | null | undefined>(undefined);
  const noProofRef = useRef<any>(null);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: U.isDark ? '#0E0E0E' : '#EAF2FA' }} contentContainerStyle={{ padding: 16, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '300', color: U.ink[900], letterSpacing: -0.5 }}>Teslim kanıtı · demo</Text>
      <Text style={{ fontSize: 12.5, color: U.ink[500] }}>Ağ çağrısı yapılmaz; "Teslimi tamamla" yalnız pencereyi kapatır.</Text>
      {DEMOS.map((d) => (
        <DemoButton key={d.label} label={d.label} onOpen={(origin) => setOpen({ demo: d.demo, origin })} />
      ))}
      {last ? <Text style={{ fontSize: 12.5, color: U.ink[700] }}>{last}</Text> : null}

      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: U.ink[400], marginTop: 18 }}>SİPARİŞTE (LOJİSTİK KARTI)</Text>
      {LEGS.map((x) => (
        <View key={x.label} style={{ padding: 12, borderRadius: 16, backgroundColor: U.surface }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }}>{x.label}</Text>
          <ProofRow leg={x.leg} onOpen={(origin) => { setViewer({ leg: x.leg, origin }); setViewerOpen(true); }} />
        </View>
      ))}
      <View style={{ padding: 12, borderRadius: 16, backgroundColor: U.surface }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }}>Yolda · yönetici</Text>
        <Pressable
          ref={noProofRef}
          onPress={() => measureOrigin(noProofRef.current, (o) => setNoProofOrigin(o))}
          style={{ alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(232,155,42,0.15)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : null) }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#9C5E0E' }}>Kanıtsız kapat</Text>
        </Pressable>
      </View>
      <ProofViewerModal visible={viewerOpen} onClose={() => setViewerOpen(false)} leg={viewer?.leg ?? null} origin={viewer?.origin ?? null} orderNumber="2041" />
      <CloseWithoutProofModal
        visible={noProofOrigin !== undefined}
        onClose={() => setNoProofOrigin(undefined)}
        deliveryId="demo"
        subtitle="Mehmet K. · #2041"
        origin={noProofOrigin ?? null}
        onClosed={(r) => setLast(`Demo: kanıtsız kapatıldı (${r.length} karakter neden)`)}
        demo
      />
      <DeliveryProofSheet
        visible={!!open}
        deliveryId={null}
        demo={open?.demo}
        origin={open?.origin ?? null}
        onClose={() => setOpen(null)}
        onDelivered={(n) => setLast(`Demo: ${n} teslimat kapandı`)}
      />
    </ScrollView>
  );
}
