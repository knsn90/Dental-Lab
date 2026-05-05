/**
 * OrderDetailMockup — V2 handoff bundle tasarımı (NativeWind)
 *
 *   Patterns design language (krem + saffron + Lab teması).
 *   Görsel birebir korundu, inline style → className refactor.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { DS } from '../../../core/theme/dsTokens';
import { LivingToothChart } from '../components/LivingToothChart';
import type { WorkOrder } from '../types';
import { LinearProgressX, PercentRingX, StepsTimelineX } from '../../../core/ui/ProgressX';
import { Bell, Printer, Check, ArrowUpRight, Download, ChevronRight } from 'lucide-react-native';

const T = DS.lab;
const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const, fontWeight: '300' as const };

// VITA Classical shade → yaklaşık doğal diş rengi
const VITA_SHADE_HEX: Record<string, string> = {
  A1:    '#F0E2C0', A2:   '#E6CFA1', A3:   '#D9B27C', 'A3.5': '#C99A5E', A4: '#B07F4A',
  B1:    '#EFDFB6', B2:   '#E5CB94', B3:   '#D4AE6F', B4:    '#BC8F4F',
  C1:    '#D9CFB7', C2:   '#C7B89A', C3:   '#A8987B', C4:    '#897962',
  D2:    '#D7C2A6', D3:   '#C2A98B', D4:   '#A88E72',
};
const readableInk = (hex: string) => {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#3A2E1F' : '#FFFFFF';
};

const orderData = {
  no: 'LAB-2026-0033',
  patient: 'Kaan Esen',
  doctor: 'Dr. Ahmet Kartal',
  doctorPhone: '+90 532 ••• 12 34',
  clinic: 'Merkez Diş Kliniği',
  clinicAddr: 'Kadıköy, İstanbul',
  due: '01.05.2026',
  daysLeft: 3,
  progress: 40,
  currentStation: '3D Baskı',
  responsible: 'Navid İdrisi',
  works: [
    { teeth: [17, 24], name: 'İmplant Üstü Kron (Metal-Seramik)', count: 2, color: '#3B82F6', progress: 60 },
    { teeth: [34, 37], name: 'Gece Plağı', count: 2, color: '#F59E0B', progress: 30 },
    { teeth: [46], name: 'Zirkonyum Köprü', count: 1, color: '#10B981', progress: 20 },
  ],
  stages: ['Alındı', 'Üretim', 'Final QC', 'Hazır', 'Teslim'],
  currentStage: 1,
};

export function OrderDetailMockup() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const [sideTab, setSideTab] = useState<'activity' | 'files' | 'comments'>('activity');
  const [chartW, setChartW] = useState(280);
  const [activeTooth, setActiveTooth] = useState<number | null>(null);
  const [jawView, setJawView] = useState<'both' | 'upper' | 'lower'>('both');

  const allTeeth = orderData.works.flatMap(w => w.teeth);
  const upperTeeth = allTeeth.filter(t => t < 30);
  const lowerTeeth = allTeeth.filter(t => t >= 30);
  const visibleTeeth =
    jawView === 'upper' ? upperTeeth :
    jawView === 'lower' ? lowerTeeth :
                          allTeeth;

  const mockOrder = {
    tooth_numbers: visibleTeeth,
    photos: [{ tooth_number: 17 }, { tooth_number: 46 }],
  } as unknown as WorkOrder;

  return (
    <ScrollView className="flex-1 bg-cream-page" contentContainerStyle={{ padding: 24 }}>
      <View
        className={`w-full self-center gap-4 ${isDesktop ? 'flex-row' : 'flex-col'}`}
        style={{ maxWidth: 1200 }}
      >

        {/* ═══════════════════ SOL KOLON ═══════════════════ */}
        <View className={`gap-4 ${isDesktop ? 'flex-1' : ''}`}>

          {/* HEADER */}
          <View className="flex-row items-center flex-wrap gap-x-3 gap-y-2 py-1">
            <View className="px-2.5 py-1 rounded-md bg-black/5">
              <Text className="text-[11px] font-mono text-ink-700">{orderData.no}</Text>
            </View>
            <ChevronRight size={14} color="#6B6B6B" strokeWidth={1.6} />
            <Text className="text-[13px] text-ink-900 font-medium">Detay</Text>
            <View className="flex-1" />
            <PillBtn variant="ghost" size="sm" icon={Printer}>Yazdır</PillBtn>
            <PillBtn variant="surface" size="sm">Yeniden ata</PillBtn>
            <PillBtn variant="primary" size="sm" icon={Check}>Aşamayı tamamla</PillBtn>
          </View>

          {/* HERO — saffron gradient */}
          <View
            className="rounded-[28px] p-8 relative overflow-hidden"
            style={{
              backgroundColor: '#FFF6D9',
              // @ts-ignore web gradient
              backgroundImage: 'linear-gradient(180deg, #FFF6D9 0%, #F5C24B 200%)',
            }}
          >
            <View className="flex-row justify-between items-start mb-6 flex-wrap gap-4">
              <View>
                <Text className="text-[11px] font-semibold uppercase mb-2" style={{ letterSpacing: 1.32, color: '#6B5A1F' }}>
                  Hasta · 5 diş çalışması
                </Text>
                <Text className="text-ink-900" style={{ ...DISPLAY, fontSize: 54, letterSpacing: -2.16, lineHeight: 51 }}>
                  {orderData.patient}
                </Text>
                <Text className="text-[13px] text-ink-700 mt-2">
                  {orderData.doctor} · {orderData.clinic}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-[11px] font-semibold uppercase" style={{ letterSpacing: 1.32, color: '#6B5A1F' }}>
                  Kalan
                </Text>
                <Text className="text-ink-900 mt-1.5" style={{ ...DISPLAY, fontSize: 48, letterSpacing: -1.92, lineHeight: 48 }}>
                  {orderData.daysLeft}
                  <Text className="ml-1" style={{ fontSize: 18 }}> gün</Text>
                </Text>
                <Text className="text-[12px] text-ink-700 mt-1">Teslim {orderData.due}</Text>
              </View>
            </View>

            <StepsTimelineX
              steps={orderData.stages}
              current={orderData.currentStage}
              theme="lab"
              variant="light"
            />
          </View>

          {/* AKTİF İSTASYON */}
          <View className="bg-ink-900 rounded-3xl p-6 flex-row items-center gap-5">
            <PercentRingX value={38} size={88} theme="lab" />
            <View className="flex-1">
              <Text className="text-[11px] font-semibold uppercase text-saffron" style={{ letterSpacing: 1.1 }}>
                Şu an
              </Text>
              <Text className="text-white mt-0.5" style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.4 }}>
                {orderData.currentStation} istasyonu
              </Text>
              <View className="flex-row items-center gap-1.5 mt-1.5">
                <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#FFD86B' }} />
                <Text className="text-[12px] font-medium" style={{ color: '#FFD86B' }}>2 saat 10 dakika gecikti</Text>
              </View>
            </View>
            <View className="flex-row items-center gap-2.5 pl-2 pr-3.5 py-2 rounded-full bg-white/10">
              <Avatar name={orderData.responsible} size={32} bg={T.primary} fg={T.accent} />
              <View>
                <Text className="text-[13px] font-medium text-white">Navid İ.</Text>
                <Text className="text-[10px] text-white/55">Sorumlu</Text>
              </View>
            </View>
          </View>

          {/* ÇALIŞMALAR TABLOSU */}
          <View className="bg-white rounded-3xl overflow-hidden">
            <View className="px-6 py-5 flex-row items-center flex-wrap gap-3">
              <Text className="text-[11px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 1.1 }}>Çalışmalar</Text>
              <View className="px-2 py-0.5 rounded-full bg-ink-50">
                <Text className="text-[11px] font-medium">3 grup · 5 diş</Text>
              </View>
              <View className="flex-1" />
              {(() => {
                const shade = 'A3';
                const bg = VITA_SHADE_HEX[shade];
                const fg = readableInk(bg);
                return (
                  <View
                    className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full border border-black/[0.08]"
                    style={{ backgroundColor: bg }}
                  >
                    <View className="w-2 h-2 rounded-full opacity-70" style={{ backgroundColor: fg }} />
                    <Text className="text-[11px] font-semibold" style={{ color: fg, letterSpacing: 0.2 }}>{shade} renk</Text>
                  </View>
                );
              })()}
              <Chip tone="neutral">Frezeleme</Chip>
              <Chip tone="neutral">Manuel</Chip>
            </View>

            {/* Table header */}
            <View className="flex-row px-4 py-2.5 bg-cream-panel">
              {['DİŞ', 'ÇALIŞMA', 'ADET', 'İLERLEME', ''].map((h, i) => (
                <Text
                  key={i}
                  className="text-[10px] font-semibold uppercase text-ink-500"
                  style={{
                    flex: i === 1 ? 2 : i === 3 ? 1.4 : i === 4 ? 0.4 : 1,
                    letterSpacing: 0.8,
                  }}
                >
                  {h}
                </Text>
              ))}
            </View>

            {/* Rows */}
            {orderData.works.map((w, i) => (
              <View key={i} className="flex-row px-4 py-3.5 items-center border-t border-black/[0.04]">
                <View className="flex-1 flex-row gap-1 flex-wrap">
                  {w.teeth.map(t => (
                    <View key={t} className="px-2 py-0.5 rounded-md" style={{ backgroundColor: w.color }}>
                      <Text className="text-[11px] font-mono font-semibold text-white">{t}</Text>
                    </View>
                  ))}
                </View>
                <Text className="text-[13px] font-medium text-ink-900" style={{ flex: 2 }}>{w.name}</Text>
                <Text className="text-[13px] text-ink-500" style={{ flex: 1 }}>{w.count} diş</Text>
                <View className="flex-row items-center gap-2.5" style={{ flex: 1.4 }}>
                  <View className="flex-1">
                    <LinearProgressX value={w.progress} theme="lab" compact hideLabel animate />
                  </View>
                  <Text className="text-[11px] text-ink-500 text-right" style={{ width: 32 }}>{w.progress}%</Text>
                </View>
                <View className="items-end" style={{ flex: 0.4 }}>
                  <ArrowUpRight size={16} color="#9A9A9A" strokeWidth={1.6} />
                </View>
              </View>
            ))}
          </View>

          {/* MATERYAL HAREKETLERİ */}
          <View className="bg-white rounded-3xl p-6">
            <View className="flex-row items-center mb-3.5">
              <Text className="text-[11px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 1.1 }}>
                Materyal hareketleri
              </Text>
              <View className="flex-1" />
              <PillBtn variant="surface" size="sm">+ Stok düş</PillBtn>
            </View>
            <View className="flex-row flex-wrap gap-2.5">
              {[
                { name: 'NextDent C&B', amt: '12.4 g', cost: '₺ 10.54', stage: '3D Baskı' },
                { name: 'Ortho IBT',     amt: '3.8 g',  cost: '₺ 4.56',  stage: '3D Baskı' },
                { name: 'Etil alkol',    amt: '50 ml',  cost: '₺ 2.00',  stage: '3D Baskı' },
              ].map((m, i) => (
                <View key={i} className="flex-1 px-4 py-3.5 bg-cream-panel rounded-2xl" style={{ minWidth: 200 }}>
                  <Text className="text-[13px] font-medium text-ink-900">{m.name}</Text>
                  <View className="flex-row justify-between mt-2">
                    <Text className="text-[11px] text-ink-500">{m.amt}</Text>
                    <Text className="text-[11px] font-medium text-ink-900">{m.cost}</Text>
                  </View>
                  <Text className="text-[10px] text-ink-400 mt-1">{m.stage}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* HIZLI ETİKET */}
          <View className="bg-white rounded-3xl p-5">
            <Text className="text-[11px] font-semibold uppercase text-ink-400 mb-3" style={{ letterSpacing: 1.1 }}>
              Hızlı işlem · etiket
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <Chip tone="outline">Doktor bekliyor</Chip>
              <Chip tone="outline">Yoğunluk</Chip>
              <Chip tone="outline">Teknisyen sorunu</Chip>
              <Chip tone="outline">Malzeme sorunu</Chip>
              <Chip tone="outline">Yeniden ata</Chip>
              <View className="px-2.5 py-1 rounded-full border border-dashed border-black/[0.15]">
                <Text className="text-[12px] text-ink-500">+ Not</Text>
              </View>
              <Chip tone="danger" dot>Acil</Chip>
            </View>
          </View>
        </View>

        {/* ═══════════════════ SAĞ KOLON ═══════════════════ */}
        <View className="gap-4" style={{ width: isDesktop ? 360 : undefined }}>

          {/* DOKTOR & KLİNİK */}
          <View className="bg-white rounded-3xl p-5">
            <Text className="text-[11px] font-semibold uppercase text-ink-400 mb-3.5" style={{ letterSpacing: 1.1 }}>
              Doktor & Klinik
            </Text>
            <View className="flex-row items-center gap-3 mb-3">
              <Avatar name={orderData.doctor.replace('Dr. ', '')} size={40} bg="#3B82F6" fg="#FFF" />
              <View className="flex-1">
                <Text className="text-[13px] font-medium text-ink-900">{orderData.doctor}</Text>
                <Text className="text-[11px] text-ink-500">{orderData.clinic}</Text>
              </View>
              <View className="w-8 h-8 rounded-lg border border-black/[0.08] items-center justify-center">
                <Bell size={15} color={T.accent} strokeWidth={1.6} />
              </View>
            </View>
            <View className="px-3 py-2.5 bg-cream-panel rounded-[10px] flex-row justify-between">
              <Text className="text-[11px] text-ink-500">{orderData.doctorPhone}</Text>
              <Text className="text-[11px] text-ink-500">{orderData.clinicAddr}</Text>
            </View>
          </View>

          {/* DİŞ ŞEMASI */}
          <View
            className="bg-white rounded-3xl p-4"
            onLayout={e => {
              const w = e.nativeEvent.layout.width - 32;
              if (w > 0 && Math.abs(w - chartW) > 2) setChartW(w);
            }}
          >
            <View className="flex-row items-center mb-2.5 px-1">
              <Text className="text-[11px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 1.1 }}>
                Diş Şeması
              </Text>
              <View className="flex-1" />
              <Text className="text-[11px] text-ink-500">{visibleTeeth.length} diş</Text>
            </View>

            <LivingToothChart
              order={mockOrder}
              containerWidth={chartW}
              accentColor={T.primary}
              activeTooth={activeTooth}
              onToothPress={(fdi) => setActiveTooth(prev => (prev === fdi ? null : fdi))}
              frameless
            />

            {/* Jaw toggle */}
            <View className="flex-row gap-0.5 p-0.5 bg-cream-panel rounded-full mt-3.5 self-center">
              {([
                { id: 'both',  label: 'Tümü', count: allTeeth.length },
                { id: 'upper', label: 'Üst',  count: upperTeeth.length },
                { id: 'lower', label: 'Alt',  count: lowerTeeth.length },
              ] as const).map(opt => {
                const active = jawView === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setJawView(opt.id)}
                    className={`py-1 px-2.5 rounded-full items-center ${active ? 'bg-ink-900' : ''}`}
                  >
                    <Text className={`text-[9px] font-semibold ${active ? 'text-white' : 'text-ink-500'}`}>
                      {opt.label}{' '}
                      <Text className={active ? 'text-white/60' : 'text-ink-400'}>({opt.count})</Text>
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* TABS */}
          <View className="bg-white rounded-3xl p-5">
            <View className="flex-row gap-1 p-1 bg-cream-panel rounded-xl mb-3.5">
              {[
                { id: 'activity', label: 'Aktivite', count: 12 },
                { id: 'files',    label: 'Dosyalar', count: 8  },
                { id: 'comments', label: 'Yorumlar', count: 3  },
              ].map(tb => {
                const active = sideTab === tb.id;
                return (
                  <Pressable
                    key={tb.id}
                    onPress={() => setSideTab(tb.id as any)}
                    className={`flex-1 px-2.5 py-2 rounded-[9px] flex-row items-center justify-center gap-1.5 ${active ? 'bg-white' : ''}`}
                    style={active ? ({ /* @ts-ignore */ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } as any) : undefined}
                  >
                    <Text className={`text-[12px] font-medium ${active ? 'text-ink-900' : 'text-ink-500'}`}>
                      {tb.label}
                    </Text>
                    <View className={`px-1.5 py-px rounded-full ${active ? 'bg-ink-900' : 'bg-black/5'}`}>
                      <Text className={`text-[10px] font-semibold ${active ? 'text-white' : 'text-ink-500'}`}>
                        {tb.count}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {sideTab === 'activity' && <ActivityFeed />}
            {sideTab === 'files'    && <FilesList />}
            {sideTab === 'comments' && <CommentsList />}
          </View>

          {/* MALİ BİLGİ — dark */}
          <View className="bg-ink-900 rounded-3xl p-5">
            <View className="flex-row items-center mb-3.5">
              <Text className="text-[11px] font-semibold uppercase text-white/50" style={{ letterSpacing: 1.1 }}>
                Mali Bilgi
              </Text>
              <View className="flex-1" />
              <View className="flex-row items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(245,194,75,0.2)' }}>
                <View className="w-1.5 h-1.5 rounded-full bg-saffron" />
                <Text className="text-[10px] font-medium text-saffron">Beklemede</Text>
              </View>
            </View>
            <View className="gap-2.5">
              <View className="flex-row justify-between items-baseline">
                <Text className="text-[12px] text-white/60">Satış fiyatı</Text>
                <Text className="text-white" style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.66 }}>₺ 4.200</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-[12px] text-white/60">Materyal</Text>
                <Text className="text-[12px] text-white">₺ 1.080</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-[12px] text-white/60">İşçilik</Text>
                <Text className="text-[12px] text-white">₺ 850</Text>
              </View>
              <View className="h-px bg-white/10 my-0.5" />
              <View className="flex-row justify-between items-baseline">
                <Text className="text-[12px] text-saffron">Net kâr</Text>
                <Text className="text-saffron" style={{ ...DISPLAY, fontSize: 28, letterSpacing: -0.84 }}>₺ 2.270</Text>
              </View>
              <Pressable className="mt-1.5 py-2.5 rounded-xl border border-white/15 items-center">
                <Text className="text-[12px] text-white">Faturayı oluştur</Text>
              </Pressable>
            </View>
          </View>

          {/* İLGİLİ SİPARİŞLER */}
          <View className="bg-white rounded-3xl p-5">
            <Text className="text-[11px] font-semibold uppercase text-ink-400 mb-3" style={{ letterSpacing: 1.1 }}>
              İlgili siparişler
            </Text>
            {[
              { no: 'LAB-2026-0021', what: 'Geçici kron · 24', date: '12.03.26', status: 'Teslim' },
              { no: 'LAB-2025-0188', what: 'Tek kron · 36',     date: '18.11.25', status: 'Teslim' },
            ].map((o, i) => (
              <View
                key={i}
                className={`px-3 py-2.5 bg-cream-panel rounded-xl flex-row items-center gap-2.5 ${i > 0 ? 'mt-2' : ''}`}
              >
                <View className="flex-1">
                  <Text className="text-[11px] font-mono text-ink-400">{o.no}</Text>
                  <Text className="text-[12px] font-medium text-ink-900 mt-0.5">{o.what}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-[11px] text-ink-500">{o.date}</Text>
                  <View className="px-1.5 py-px rounded mt-0.5" style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}>
                    <Text className="text-[10px] font-medium" style={{ color: '#0F6E50' }}>{o.status}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// ═══════════════ TAB CONTENT ═══════════════
function ActivityFeed() {
  const items = [
    { who: 'Navid İ.',  bg: T.primary, action: '3D Baskı başlattı',     time: '2sa önce' },
    { who: 'Ayşel K.',  bg: '#10B981', action: 'Tasarım QC onayı',       time: '4sa önce' },
    { who: 'Mehmet A.', bg: '#3B82F6', action: 'CAD tasarımını yükledi', time: '1g önce' },
    { who: 'Sistem',    bg: '#9A9A9A', action: 'Sipariş alındı',         time: '2g önce' },
  ];
  return (
    <View className="relative">
      <View className="absolute bg-black/[0.06]" style={{ left: 13, top: 14, bottom: 14, width: 1.5 }} />
      {items.map((a, i) => (
        <View key={i} className="flex-row gap-3 py-2.5 relative z-10">
          <View className="w-7 h-7 rounded-full items-center justify-center" style={{ backgroundColor: a.bg }}>
            <Text className="text-white text-[12px]">•</Text>
          </View>
          <View className="flex-1">
            <Text className="text-[12px]">
              <Text className="font-medium text-ink-900">{a.who}</Text>{' '}
              <Text className="text-ink-500">{a.action}</Text>
            </Text>
            <Text className="text-[11px] text-ink-400 mt-0.5">{a.time}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function FilesList() {
  const files = [
    { name: 'CAD-tasarim-v3.stl',   size: '12.4 MB', type: 'STL', color: '#3B82F6' },
    { name: 'Hasta-fotograf.jpg',    size: '2.1 MB',  type: 'JPG', color: '#10B981' },
    { name: 'CBCT-scan.dcm',         size: '48.0 MB', type: 'DCM', color: '#9C2E2E' },
    { name: 'Renk-A3-referans.jpg',  size: '1.4 MB',  type: 'JPG', color: '#10B981' },
  ];
  return (
    <View className="gap-1.5">
      {files.map((f, i) => (
        <View key={i} className="px-3 py-2.5 bg-cream-panel rounded-xl flex-row items-center gap-2.5">
          <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: f.color + '20' }}>
            <Text className="text-[9px] font-bold" style={{ color: f.color, letterSpacing: 0.5 }}>{f.type}</Text>
          </View>
          <View className="flex-1 min-w-0">
            <Text numberOfLines={1} className="text-[12px] font-medium text-ink-900">{f.name}</Text>
            <Text className="text-[10px] text-ink-400 mt-px">{f.size}</Text>
          </View>
          <Download size={14} color="#9A9A9A" strokeWidth={1.6} />
        </View>
      ))}
      <View className="py-2.5 rounded-xl border border-dashed border-black/[0.15] items-center">
        <Text className="text-[12px] text-ink-500">+ Dosya yükle</Text>
      </View>
    </View>
  );
}

function CommentsList() {
  const comments = [
    { who: 'Dr. Ahmet K.', bg: '#3B82F6', text: '24 numaralı dişte hafif eğrilik istiyorum, lütfen dikkat edin.', time: '1g önce' },
    { who: 'Mehmet A.',    bg: T.primary, text: 'Anladım, tasarımda revize ettim. CBCT\'ye baktım, yeterli.',     time: '1g önce' },
    { who: 'Navid İ.',     bg: '#10B981', text: 'Baskıya geçtim, 2 saat sürer.',                                  time: '2sa önce' },
  ];
  return (
    <View className="gap-2.5">
      {comments.map((c, i) => (
        <View key={i} className="p-3 bg-cream-panel rounded-xl flex-row gap-2.5">
          <Avatar name={c.who} size={28} bg={c.bg} fg="#FFF" />
          <View className="flex-1 min-w-0">
            <View className="flex-row items-baseline gap-1.5">
              <Text className="text-[12px] font-medium text-ink-900">{c.who}</Text>
              <Text className="text-[10px] text-ink-400">{c.time}</Text>
            </View>
            <Text className="text-[12px] text-ink-700 mt-1" style={{ lineHeight: 17 }}>{c.text}</Text>
          </View>
        </View>
      ))}
      <View className="py-2.5 rounded-xl border border-dashed border-black/[0.15] items-center">
        <Text className="text-[12px] text-ink-500">+ Not / yorum ekle</Text>
      </View>
    </View>
  );
}

// ═══════════════ HELPERS ═══════════════
function Avatar({ name, size = 32, bg, fg }: { name: string; size?: number; bg: string; fg: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
  return (
    <View
      className="items-center justify-center shrink-0"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg }}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: '600', color: fg, letterSpacing: -0.3 }}>{initials}</Text>
    </View>
  );
}

function PillBtn({ children, variant = 'primary', size = 'md', icon: Icon }: {
  children: React.ReactNode;
  variant?: 'primary' | 'surface' | 'ghost';
  size?: 'sm' | 'md';
  icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}) {
  const sizeCls = size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2';
  const textSize = size === 'sm' ? 'text-[12px]' : 'text-[13px]';
  const iconSize = size === 'sm' ? 14 : 16;

  const variantCls =
    variant === 'primary' ? 'bg-ink-900 border-ink-900' :
    variant === 'surface' ? 'bg-white border-ink-200' :
                            'bg-transparent border-transparent';
  const fgClass =
    variant === 'primary' ? 'text-white' : 'text-ink-900';
  const fgHex =
    variant === 'primary' ? '#FFFFFF' : T.accent;

  return (
    <View className={`flex-row items-center gap-1.5 rounded-full border ${sizeCls} ${variantCls}`}>
      {Icon && <Icon size={iconSize} color={fgHex} strokeWidth={1.8} />}
      <Text className={`font-medium ${textSize} ${fgClass}`}>{children}</Text>
    </View>
  );
}

function Chip({ children, tone, dot = false }: {
  children: React.ReactNode;
  tone: 'primary' | 'neutral' | 'outline' | 'danger';
  dot?: boolean;
}) {
  const cls =
    tone === 'primary' ? 'bg-saffron'
    : tone === 'neutral' ? 'bg-black/5'
    : tone === 'outline' ? 'bg-transparent border border-ink-300'
    : 'border-0';

  const fgCls =
    tone === 'danger' ? '' :
    tone === 'primary' ? 'text-ink-900' :
                         'text-ink-900';

  // danger tone — özel renkler için inline kalsın
  if (tone === 'danger') {
    return (
      <View
        className="flex-row items-center gap-1.5 px-3 py-1 rounded-full"
        style={{ backgroundColor: 'rgba(217,75,75,0.12)' }}
      >
        {dot && <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#9C2E2E' }} />}
        <Text className="text-[12px] font-medium" style={{ color: '#9C2E2E' }}>{children}</Text>
      </View>
    );
  }

  const dotColorHex = T.accent;
  return (
    <View className={`flex-row items-center gap-1.5 px-3 py-1 rounded-full ${cls}`}>
      {dot && <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColorHex }} />}
      <Text className={`text-[12px] font-medium ${fgCls}`}>{children}</Text>
    </View>
  );
}
