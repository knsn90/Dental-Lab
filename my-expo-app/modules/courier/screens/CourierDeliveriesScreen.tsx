// modules/courier/screens/CourierDeliveriesScreen.tsx
// Kurye "Teslimatlarım" — Aktif (sıradaki+taşınan) / Tamamlanan (geçmiş) sekmeli liste.
// deliveries.tsx bunu render eder (eskiden dashboard'u tekrar açıyordu → geçmiş yoktu).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { localeTag, isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { MapPin, Package, Check, ChevronRight, ChevronLeft, CheckCircle2 } from '../../../core/ui/icons';
import { DS } from '../../../core/theme/dsTokens';
import { useInkUI } from '../../../core/theme/inkScale';
import { useAuthStore } from '../../../core/store/authStore';
import { fetchMyDeliveries, type CourierDelivery } from '../api';
import { formatAddress } from '../../../core/util/formatAddress';

const TH = DS.tech;
const SUCCESS = '#2D9A6B';
const WARNING = '#E89B2A';
const DANGER  = '#D94B4B';
const STATUS_LABEL: Record<string, string> = {
  beklemede: 'BEKLİYOR', atandi: 'ATANDI', teslim_alindi: 'ALINDI',
  yolda: 'YOLDA', teslim_edildi: 'TESLİM', iptal: 'İPTAL',
};
const STATUS_COLOR: Record<string, string> = {
  beklemede: DS.ink[500], atandi: TH.primary, teslim_alindi: TH.primary,
  yolda: WARNING, teslim_edildi: SUCCESS, iptal: DANGER,
};
const PURPOSE_LABEL: Record<string, string> = {
  teslimat: 'Teslimat', model_alma: 'Model alma', eksik_parca: 'Eksik parça', diger: 'Diğer',
};

export function CourierDeliveriesScreen() {
  const U = useInkUI();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { i18n } = useTranslation();
  const { profile } = useAuthStore();
  const [items, setItems]   = useState<CourierDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'done'>('active');

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try { setItems(await fetchMyDeliveries(profile.id)); }
    finally { setLoading(false); }
  }, [profile?.id]);
  useEffect(() => { load(); }, [load]);

  const { active, done } = useMemo(() => {
    const active = items
      .filter(d => ['beklemede', 'atandi', 'teslim_alindi', 'yolda'].includes(d.status))
      .sort((a, b) => (a.assigned_at ?? '').localeCompare(b.assigned_at ?? '')); // FIFO
    const done = items
      .filter(d => d.status === 'teslim_edildi' || d.status === 'iptal')
      .sort((a, b) => (b.delivered_at ?? b.assigned_at ?? '').localeCompare(a.delivered_at ?? a.assigned_at ?? '')); // yeni önce
    return { active, done };
  }, [items]);

  const list = tab === 'active' ? active : done;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: U.isDark ? U.pageBg : TH.bg }}
      contentContainerStyle={{ paddingBottom: 110 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={TH.primary} />}
    >
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: U.ink[500] }}>{autoT('KURYE')}</Text>
        <Text style={{ fontSize: 28, fontWeight: '300', color: U.ink[900], letterSpacing: -0.8, marginTop: 2 }}>{autoT('Teslimatlarım')}</Text>
      </View>

      {/* Sekmeler — Aktif / Tamamlanan */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
        {([['active', `${autoT('Aktif')} (${active.length})`], ['done', `${autoT('Tamamlanan')} (${done.length})`]] as const).map(([k, lbl]) => (
          <Pressable
            key={k}
            onPress={() => setTab(k)}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: tab === k ? TH.primary : U.plainBtn.bg, borderWidth: 1, borderColor: tab === k ? TH.primary : U.plainBtn.border }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: tab === k ? '#FFF' : U.ink[700] }}>{lbl}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {list.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center', gap: 8, borderRadius: 18, borderWidth: 1, borderColor: U.ink[200], backgroundColor: U.surface }}>
            <CheckCircle2 size={24} color={SUCCESS} strokeWidth={1.6} />
            <Text style={{ fontSize: 13, color: U.ink[500] }}>{tab === 'active' ? autoT('Aktif teslimat yok') : autoT('Tamamlanan teslimat yok')}</Text>
          </View>
        ) : (
          list.map(d => <Row key={d.id} d={d} lng={i18n.language} onPress={() => router.push(`/(courier)/delivery/${d.id}` as any)} />)
        )}
      </View>
    </ScrollView>
  );
}

function Row({ d, onPress, lng }: { d: CourierDelivery; onPress: () => void; lng: string }) {
  const U = useInkUI();
  const notPicked  = d.status === 'atandi' || d.status === 'beklemede';
  const originName = d.origin_name ?? (d.direction === 'clinic_to_lab' ? 'Klinik' : 'Laboratuvar');
  const destName   = d.destination_name ?? (d.direction === 'clinic_to_lab' ? 'Laboratuvar' : 'Klinik');
  const done   = d.status === 'teslim_edildi';
  const point  = done ? destName : (notPicked ? originName : destName);
  const accent = done ? SUCCESS : (notPicked ? TH.primary : WARNING);
  const Icon   = done ? Check : (notPicked ? Package : MapPin);
  const sColor = STATUS_COLOR[d.status] ?? DS.ink[500];
  const purpose = d.purpose ? (PURPOSE_LABEL[d.purpose] ?? null) : null;
  const timeLbl = d.delivered_at
    ? new Date(d.delivered_at).toLocaleString(localeTag(lng), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <Pressable
      onPress={onPress}
      style={{ padding: 14, borderRadius: 18, backgroundColor: U.surface, borderWidth: 1, borderColor: U.ink[200], flexDirection: 'row', alignItems: 'center', gap: 12 }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: accent + '14', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color={accent} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: sColor + '14' }}>
            <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.4, color: sColor }}>{STATUS_LABEL[d.status] ?? d.status}</Text>
          </View>
          {purpose && <Text style={{ fontSize: 10, color: U.ink[400] }}>· {autoT(purpose)}</Text>}
        </View>
        <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{point}</Text>
        <Text style={{ fontSize: 12, color: U.ink[500], marginTop: 2 }} numberOfLines={1}>
          {timeLbl ?? (formatAddress(d.destination_address) || '—')}{d.order_number ? ` · #${d.order_number}` : ''}
        </Text>
      </View>
      {isRTL() ? <ChevronLeft size={14} color={U.ink[400]} /> : <ChevronRight size={14} color={U.ink[400]} />}
    </Pressable>
  );
}
