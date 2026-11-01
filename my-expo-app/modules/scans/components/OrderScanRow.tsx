// Sipariş detayı hero'su — bu siparişe bağlı tarama randevuları (plan Task 12): "Tarama · GG.AA · hizmetler"
// çipi; dokununca randevu detayı (React.lazy, ayrı parça) açılır. Yalnız lab panellerinde ve modül açıkken
// görünür; veri yoksa hiç yer kaplamaz. Hero'nun mevcut çip diliyle çizilir (koyu hero'da beyaz).
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { router, useSegments } from 'expo-router';
import { autoT } from '../../../core/i18n/autoTranslate';
import { ScanLine } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { fetchOrderScans, type OrderScanRef } from '../api';
import { useScanCatalog } from '../hooks/useScanCatalog';
import { labLocalParts } from '../scanModel';
import { measureOrigin, type OriginRect } from '../../delivery/proof/useAnchoredSpring';
import { useScanCardVisible } from './ScanCalendarCard';

const DetailLazy = React.lazy(() => import('./AppointmentDetailModal').then((m) => ({ default: m.AppointmentDetailModal })));

export function OrderScanRow({ orderId, dark }: { orderId: string; dark: boolean }) {
  const seg = String((useSegments() as string[])?.[0] ?? '');
  const { visible } = useScanCardVisible();
  const labPanel = seg === '(lab)' || seg === '(admin)';
  const [scans, setScans] = useState<OrderScanRef[]>([]);
  useEffect(() => {
    if (!visible || !labPanel || !orderId) { setScans([]); return; }
    let alive = true;
    fetchOrderScans(orderId).then((r) => { if (alive) setScans(r); }).catch(() => { /* çip opsiyonel */ });
    return () => { alive = false; };
  }, [visible, labPanel, orderId]);
  if (!scans.length) return null;
  return <Chips scans={scans} dark={dark} seg={seg} />;
}

/** Katalog (saat dilimi, hizmetler) yalnız çip varken yüklenir */
function Chips({ scans, dark, seg }: { scans: OrderScanRef[]; dark: boolean; seg: string }) {
  const cat = useScanCatalog();
  const { canManage } = useScanCardVisible();
  const [openId, setOpenId] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<OriginRect | null>(null);
  useEffect(() => { if (openId) setLastId(openId); }, [openId]);
  const fg = dark ? '#FFFFFF' : '#2C2C2C';
  const bg = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.05)';
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 }}>
      {scans.map((s) => (
        <Chip key={s.appointmentId} scan={s} tz={cat.tz} fg={fg} bg={bg} onOpen={(o) => { setOrigin(o); setOpenId(s.appointmentId); }} />
      ))}
      <Suspense fallback={null}>
        {lastId && cat.ready ? (
          <DetailLazy
            visible={!!openId} origin={origin} onClose={() => setOpenId(null)} rowId={openId ?? lastId} catalog={cat}
            canManage={canManage} onChanged={() => {}}
            onEdit={(r) => { setOpenId(null); router.push(`/${seg}/scans?id=${r.id}` as any); }}
            onDecide={(r) => { setOpenId(null); router.push(`/${seg}/scans?tab=pending&id=${r.id}` as any); }}
          />
        ) : null}
      </Suspense>
    </View>
  );
}

function Chip({ scan, tz, fg, bg, onOpen }: { scan: OrderScanRef; tz: string; fg: string; bg: string; onOpen: (o: OriginRect | null) => void }) {
  const ref = useRef<any>(null);
  const d = labLocalParts(scan.startsAt, tz).date;
  const label = [autoT('Tarama'), `${d.slice(8, 10)}.${d.slice(5, 7)}`, ...scan.services].join(' · ');
  return (
    <GlassTooltip title={autoT('Tarama randevusu')} text={autoT('Bu siparişe bağlanan taramanın ayrıntısını açar')}>
      <Pressable ref={ref} onPress={() => measureOrigin(ref.current, onOpen)} accessibilityRole="button" accessibilityLabel={label}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: bg,
          ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}>
          <ScanLine size={11} color={fg} strokeWidth={2} />
          <Text style={{ fontSize: 11.5, fontWeight: '500', color: fg }} numberOfLines={1}>{label}</Text>
        </View>
      </Pressable>
    </GlassTooltip>
  );
}
