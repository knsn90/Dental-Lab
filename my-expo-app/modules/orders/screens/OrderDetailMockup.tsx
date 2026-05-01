/**
 * OrderDetailMockup — V2 handoff bundle tasarımı
 *
 *   Krem + Saffron (Lab teması) + büyük yumuşak köşeler + Inter Tight Light
 *   Sol kolon: Header → Hero → Aktif istasyon → Çalışmalar tablo →
 *              Materyal hareketleri → Hızlı etiket
 *   Sağ kolon: Doktor & Klinik → Diş şeması (placeholder) → Tabs
 *              (Aktivite/Dosya/Yorum) → Mali bilgi (dark) → İlgili siparişler
 *
 *   POC — sadece görsel, gerçek veri yok.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { Svg, Circle, Path } from 'react-native-svg';
import { DS } from '../../../core/theme/dsTokens';

const T = DS.lab;
const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const, fontWeight: '300' as const };

// Mock veriler
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F5F2EA' }} contentContainerStyle={{ padding: 24 }}>
      <View style={{ maxWidth: 1200, alignSelf: 'center', width: '100%', flexDirection: isDesktop ? 'row' : 'column', gap: 16 }}>

        {/* ═══════════════════ SOL KOLON ═══════════════════ */}
        <View style={{ flex: isDesktop ? 1 : undefined, gap: 16 }}>

          {/* HEADER */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4, flexWrap: 'wrap' }}>
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.06)' }}>
              <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#3C3C3C' }}>{orderData.no}</Text>
            </View>
            <Text style={{ fontSize: 13, color: '#6B6B6B' }}>›</Text>
            <Text style={{ fontSize: 13, color: '#0A0A0A', fontWeight: '500' }}>Detay</Text>
            <View style={{ flex: 1 }} />
            <PillBtn variant="ghost" size="sm">↓ Yazdır</PillBtn>
            <PillBtn variant="surface" size="sm">Yeniden ata</PillBtn>
            <PillBtn variant="primary" size="sm">✓ Aşamayı tamamla</PillBtn>
          </View>

          {/* HERO — sarı gradient, hasta + kalan gün + progress + stages */}
          <View style={{
            backgroundColor: '#FFF6D9',
            // @ts-ignore web gradient
            backgroundImage: 'linear-gradient(180deg, #FFF6D9 0%, #F5C24B 200%)',
            borderRadius: 28, padding: 32, position: 'relative', overflow: 'hidden',
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
              <View>
                <Text style={{ fontSize: 11, color: '#6B5A1F', letterSpacing: 1.32, textTransform: 'uppercase', fontWeight: '600', marginBottom: 8 }}>
                  Hasta · 5 diş çalışması
                </Text>
                <Text style={{ ...DISPLAY, fontSize: 54, letterSpacing: -2.16, lineHeight: 51, color: T.accent }}>
                  {orderData.patient}
                </Text>
                <Text style={{ fontSize: 13, color: '#3C3C3C', marginTop: 8 }}>
                  {orderData.doctor} · {orderData.clinic}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: '#6B5A1F', letterSpacing: 1.32, textTransform: 'uppercase', fontWeight: '600' }}>Kalan</Text>
                <Text style={{ ...DISPLAY, fontSize: 48, letterSpacing: -1.92, lineHeight: 48, marginTop: 6, color: T.accent }}>
                  {orderData.daysLeft}<Text style={{ fontSize: 18, marginLeft: 4 }}> gün</Text>
                </Text>
                <Text style={{ fontSize: 12, color: '#3C3C3C', marginTop: 4 }}>Teslim {orderData.due}</Text>
              </View>
            </View>

            {/* Progress bar — knob with double-ring */}
            <View style={{ backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 999, padding: 6, position: 'relative' }}>
              <View style={{ height: 8, backgroundColor: T.accent, borderRadius: 999, width: `${orderData.progress}%`, position: 'relative' }}>
                <View style={{
                  position: 'absolute', right: -10, top: -4, width: 20, height: 20, borderRadius: 10,
                  backgroundColor: T.accent, borderWidth: 4, borderColor: T.primary,
                  // @ts-ignore web shadow
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }} />
              </View>
            </View>

            {/* Stages */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
              {orderData.stages.map((s, i) => (
                <Text key={i} style={{
                  fontSize: 11,
                  color: i <= orderData.currentStage ? T.accent : '#6B5A1F',
                  fontWeight: i === orderData.currentStage ? '600' : '400',
                  opacity: i > orderData.currentStage ? 0.5 : 1,
                }}>{s}</Text>
              ))}
            </View>
          </View>

          {/* AKTİF İSTASYON */}
          <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 24, flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 26, color: T.primary }}>⚗</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: '#9A9A9A', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600' }}>Şu an</Text>
              <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, marginTop: 2, color: T.accent }}>{orderData.currentStation} istasyonu</Text>
              <Text style={{ fontSize: 12, color: '#9C5E0E', marginTop: 4, fontWeight: '500' }}>● 2 saat 10 dakika gecikti · 38% tamamlandı</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, paddingLeft: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
              <Avatar name={orderData.responsible} size={32} bg={T.primary} fg={T.accent} />
              <View>
                <Text style={{ fontSize: 13, fontWeight: '500', color: T.accent }}>Navid İ.</Text>
                <Text style={{ fontSize: 10, color: '#6B6B6B' }}>Sorumlu</Text>
              </View>
            </View>
          </View>

          {/* ÇALIŞMALAR TABLOSU */}
          <View style={{ backgroundColor: '#FFF', borderRadius: 24, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 24, paddingVertical: 20, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 11, color: '#9A9A9A', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600' }}>Çalışmalar</Text>
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: '#FAFAFA' }}>
                <Text style={{ fontSize: 11, fontWeight: '500' }}>3 grup · 5 diş</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Chip tone="primary">● A3 renk</Chip>
              <Chip tone="neutral">Frezeleme</Chip>
              <Chip tone="neutral">Manuel</Chip>
            </View>

            {/* Table header */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FBFAF6' }}>
              {['DİŞ', 'ÇALIŞMA', 'ADET', 'İLERLEME', ''].map((h, i) => (
                <Text key={i} style={{
                  flex: i === 1 ? 2 : i === 3 ? 1.4 : i === 4 ? 0.4 : 1,
                  fontSize: 10, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: '#6B6B6B',
                }}>{h}</Text>
              ))}
            </View>

            {/* Rows */}
            {orderData.works.map((w, i) => (
              <View key={i} style={{
                flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14,
                borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', alignItems: 'center',
              }}>
                <View style={{ flex: 1, flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                  {w.teeth.map(t => (
                    <View key={t} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: w.color }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#FFF', fontFamily: 'monospace' }}>{t}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{ flex: 2, fontSize: 13, fontWeight: '500', color: T.accent }}>{w.name}</Text>
                <Text style={{ flex: 1, fontSize: 13, color: '#6B6B6B' }}>{w.count} diş</Text>
                <View style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1, height: 4, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                    <View style={{ width: `${w.progress}%`, height: '100%', backgroundColor: w.color }} />
                  </View>
                  <Text style={{ fontSize: 11, color: '#6B6B6B', width: 32 }}>{w.progress}%</Text>
                </View>
                <Text style={{ flex: 0.4, textAlign: 'right', color: '#9A9A9A', fontSize: 14 }}>↗</Text>
              </View>
            ))}
          </View>

          {/* MATERYAL HAREKETLERİ */}
          <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 11, color: '#9A9A9A', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600' }}>Materyal hareketleri</Text>
              <View style={{ flex: 1 }} />
              <PillBtn variant="surface" size="sm">+ Stok düş</PillBtn>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {[
                { name: 'NextDent C&B',  amt: '12.4 g', cost: '₺ 10.54', stage: '3D Baskı' },
                { name: 'Ortho IBT',      amt: '3.8 g',  cost: '₺ 4.56',  stage: '3D Baskı' },
                { name: 'Etil alkol',     amt: '50 ml',  cost: '₺ 2.00',  stage: '3D Baskı' },
              ].map((m, i) => (
                <View key={i} style={{ flex: 1, minWidth: 200, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FBFAF6', borderRadius: 14 }}>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: T.accent }}>{m.name}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                    <Text style={{ fontSize: 11, color: '#6B6B6B' }}>{m.amt}</Text>
                    <Text style={{ fontSize: 11, color: T.accent, fontWeight: '500' }}>{m.cost}</Text>
                  </View>
                  <Text style={{ fontSize: 10, color: '#9A9A9A', marginTop: 4 }}>{m.stage}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* HIZLI ETİKET */}
          <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 20 }}>
            <Text style={{ fontSize: 11, color: '#9A9A9A', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600', marginBottom: 12 }}>Hızlı işlem · etiket</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip tone="outline">Doktor bekliyor</Chip>
              <Chip tone="outline">Yoğunluk</Chip>
              <Chip tone="outline">Teknisyen sorunu</Chip>
              <Chip tone="outline">Malzeme sorunu</Chip>
              <Chip tone="outline">Yeniden ata</Chip>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderStyle: 'dashed' }}>
                <Text style={{ fontSize: 12, color: '#6B6B6B' }}>+ Not</Text>
              </View>
              <Chip tone="danger">● Acil</Chip>
            </View>
          </View>
        </View>

        {/* ═══════════════════ SAĞ KOLON ═══════════════════ */}
        <View style={{ width: isDesktop ? 360 : undefined, gap: 16 }}>

          {/* DOKTOR & KLİNİK */}
          <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 20 }}>
            <Text style={{ fontSize: 11, color: '#9A9A9A', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600', marginBottom: 14 }}>Doktor & Klinik</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Avatar name={orderData.doctor.replace('Dr. ', '')} size={40} bg="#3B82F6" fg="#FFF" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: T.accent }}>{orderData.doctor}</Text>
                <Text style={{ fontSize: 11, color: '#6B6B6B' }}>{orderData.clinic}</Text>
              </View>
              <View style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13 }}>🔔</Text>
              </View>
            </View>
            <View style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FBFAF6', borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, color: '#6B6B6B' }}>{orderData.doctorPhone}</Text>
              <Text style={{ fontSize: 11, color: '#6B6B6B' }}>{orderData.clinicAddr}</Text>
            </View>
          </View>

          {/* DİŞ ŞEMASI — placeholder (mevcut bileşen kullanılacak) */}
          <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 11, color: '#9A9A9A', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600' }}>Diş Şeması</Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 11, color: '#6B6B6B' }}>tıklayın</Text>
            </View>
            <View style={{ height: 220, backgroundColor: '#FBFAF6', borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)', borderStyle: 'dashed' }}>
              <Svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="#9A9A9A" strokeWidth={1.4}>
                <Path d="M12 2c-3 0-5 2-7 2-1.5 0-2 1-2 3 0 4 2 8 3 11 .5 1.5 1 3 2 3s1.5-2 2-4c.3-1.4 1-2 2-2s1.7.6 2 2c.5 2 1 4 2 4s1.5-1.5 2-3c1-3 3-7 3-11 0-2-.5-3-2-3-2 0-4-2-7-2z" />
              </Svg>
              <Text style={{ fontSize: 12, color: '#9A9A9A', marginTop: 12, fontWeight: '500' }}>Mevcut ToothChart bileşeni</Text>
              <Text style={{ fontSize: 10, color: '#9A9A9A', marginTop: 4 }}>(prod entegrasyonda buraya gelecek)</Text>
            </View>
          </View>

          {/* TABS — Aktivite/Dosya/Yorum */}
          <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 20 }}>
            {/* Tab pills */}
            <View style={{ flexDirection: 'row', gap: 4, padding: 4, backgroundColor: '#FBFAF6', borderRadius: 12, marginBottom: 14 }}>
              {[
                { id: 'activity', label: 'Aktivite', count: 12 },
                { id: 'files',    label: 'Dosyalar', count: 8  },
                { id: 'comments', label: 'Yorumlar', count: 3  },
              ].map(tb => {
                const active = sideTab === tb.id;
                return (
                  <Pressable key={tb.id} onPress={() => setSideTab(tb.id as any)} style={{
                    flex: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9,
                    backgroundColor: active ? '#FFF' : 'transparent',
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                    // @ts-ignore web shadow
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.06)' : undefined,
                  }}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: active ? T.accent : '#6B6B6B' }}>{tb.label}</Text>
                    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: active ? T.accent : 'rgba(0,0,0,0.06)' }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: active ? '#FFF' : '#6B6B6B' }}>{tb.count}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Tab content */}
            {sideTab === 'activity' && <ActivityFeed />}
            {sideTab === 'files'    && <FilesList />}
            {sideTab === 'comments' && <CommentsList />}
          </View>

          {/* MALİ BİLGİ — dark */}
          <View style={{ backgroundColor: T.accent, borderRadius: 24, padding: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600' }}>Mali Bilgi</Text>
              <View style={{ flex: 1 }} />
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(245,194,75,0.2)' }}>
                <Text style={{ fontSize: 10, color: T.primary, fontWeight: '500' }}>● Beklemede</Text>
              </View>
            </View>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Satış fiyatı</Text>
                <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.66, color: '#FFF' }}>₺ 4.200</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Materyal</Text>
                <Text style={{ fontSize: 12, color: '#FFF' }}>₺ 1.080</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>İşçilik</Text>
                <Text style={{ fontSize: 12, color: '#FFF' }}>₺ 850</Text>
              </View>
              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 2 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ fontSize: 12, color: T.primary }}>Net kâr</Text>
                <Text style={{ ...DISPLAY, fontSize: 28, letterSpacing: -0.84, color: T.primary }}>₺ 2.270</Text>
              </View>
              <Pressable style={{
                marginTop: 6, paddingVertical: 10, borderRadius: 12,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center',
              }}>
                <Text style={{ fontSize: 12, color: '#FFF' }}>Faturayı oluştur</Text>
              </Pressable>
            </View>
          </View>

          {/* İLGİLİ SİPARİŞLER */}
          <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 20 }}>
            <Text style={{ fontSize: 11, color: '#9A9A9A', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600', marginBottom: 12 }}>İlgili siparişler</Text>
            {[
              { no: 'LAB-2026-0021', what: 'Geçici kron · 24', date: '12.03.26', status: 'Teslim' },
              { no: 'LAB-2025-0188', what: 'Tek kron · 36',     date: '18.11.25', status: 'Teslim' },
            ].map((o, i) => (
              <View key={i} style={{
                paddingHorizontal: 12, paddingVertical: 10, marginTop: i > 0 ? 8 : 0,
                backgroundColor: '#FBFAF6', borderRadius: 12,
                flexDirection: 'row', alignItems: 'center', gap: 10,
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'monospace', color: '#9A9A9A' }}>{o.no}</Text>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: T.accent, marginTop: 2 }}>{o.what}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: '#6B6B6B' }}>{o.date}</Text>
                  <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(16,185,129,0.12)', marginTop: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '500', color: '#0F6E50' }}>{o.status}</Text>
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
    <View style={{ position: 'relative' }}>
      <View style={{ position: 'absolute', left: 13, top: 14, bottom: 14, width: 1.5, backgroundColor: 'rgba(0,0,0,0.06)' }} />
      {items.map((a, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, position: 'relative', zIndex: 1 }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: a.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFF', fontSize: 12 }}>•</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12 }}>
              <Text style={{ fontWeight: '500', color: T.accent }}>{a.who}</Text>{' '}
              <Text style={{ color: '#6B6B6B' }}>{a.action}</Text>
            </Text>
            <Text style={{ fontSize: 11, color: '#9A9A9A', marginTop: 2 }}>{a.time}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function FilesList() {
  const files = [
    { name: 'CAD-tasarim-v3.stl',    size: '12.4 MB', type: 'STL', color: '#3B82F6' },
    { name: 'Hasta-fotograf.jpg',     size: '2.1 MB',  type: 'JPG', color: '#10B981' },
    { name: 'CBCT-scan.dcm',          size: '48.0 MB', type: 'DCM', color: '#9C2E2E' },
    { name: 'Renk-A3-referans.jpg',   size: '1.4 MB',  type: 'JPG', color: '#10B981' },
  ];
  return (
    <View style={{ gap: 6 }}>
      {files.map((f, i) => (
        <View key={i} style={{ paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FBFAF6', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: f.color + '20', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, color: f.color }}>{f.type}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '500', color: T.accent }}>{f.name}</Text>
            <Text style={{ fontSize: 10, color: '#9A9A9A', marginTop: 1 }}>{f.size}</Text>
          </View>
          <Text style={{ fontSize: 12, color: '#9A9A9A' }}>↓</Text>
        </View>
      ))}
      <View style={{ paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.15)', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: '#6B6B6B' }}>+ Dosya yükle</Text>
      </View>
    </View>
  );
}

function CommentsList() {
  const comments = [
    { who: 'Dr. Ahmet K.', bg: '#3B82F6', text: '24 numaralı dişte hafif eğrilik istiyorum, lütfen dikkat edin.', time: '1g önce' },
    { who: 'Mehmet A.',     bg: T.primary, text: 'Anladım, tasarımda revize ettim. CBCT\'ye baktım, yeterli.',     time: '1g önce' },
    { who: 'Navid İ.',      bg: '#10B981', text: 'Baskıya geçtim, 2 saat sürer.',                                  time: '2sa önce' },
  ];
  return (
    <View style={{ gap: 10 }}>
      {comments.map((c, i) => (
        <View key={i} style={{ padding: 12, backgroundColor: '#FBFAF6', borderRadius: 12, flexDirection: 'row', gap: 10 }}>
          <Avatar name={c.who} size={28} bg={c.bg} fg="#FFF" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: T.accent }}>{c.who}</Text>
              <Text style={{ fontSize: 10, color: '#9A9A9A' }}>{c.time}</Text>
            </View>
            <Text style={{ fontSize: 12, color: '#3C3C3C', marginTop: 4, lineHeight: 17 }}>{c.text}</Text>
          </View>
        </View>
      ))}
      <View style={{ paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.15)', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: '#6B6B6B' }}>+ Not / yorum ekle</Text>
      </View>
    </View>
  );
}

// ═══════════════ HELPERS ═══════════════
function Avatar({ name, size = 32, bg, fg }: { name: string; size?: number; bg: string; fg: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text style={{ fontSize: size * 0.38, fontWeight: '600', color: fg, letterSpacing: -0.3 }}>{initials}</Text>
    </View>
  );
}

function PillBtn({ children, variant = 'primary', size = 'md' }: { children: React.ReactNode; variant?: 'primary' | 'surface' | 'ghost'; size?: 'sm' | 'md' }) {
  const sizes = {
    sm: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 12 },
    md: { paddingHorizontal: 16, paddingVertical: 8, fontSize: 13 },
  };
  const variants = {
    primary: { backgroundColor: T.accent, color: '#FFF',     borderWidth: 1, borderColor: T.accent },
    surface: { backgroundColor: '#FFF',     color: T.accent,  borderWidth: 1, borderColor: '#EAEAEA' },
    ghost:   { backgroundColor: 'transparent', color: T.accent, borderWidth: 1, borderColor: 'transparent' },
  };
  const v = variants[variant];
  const sz = sizes[size];
  return (
    <View style={{ paddingHorizontal: sz.paddingHorizontal, paddingVertical: sz.paddingVertical, borderRadius: 999, backgroundColor: v.backgroundColor, borderWidth: v.borderWidth, borderColor: v.borderColor }}>
      <Text style={{ fontSize: sz.fontSize, fontWeight: '500', color: v.color }}>{children}</Text>
    </View>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: 'primary' | 'neutral' | 'outline' | 'danger' }) {
  const tones = {
    primary: { bg: T.primary,         fg: T.accent },
    neutral: { bg: 'rgba(0,0,0,0.05)', fg: T.accent },
    outline: { bg: 'transparent',      fg: T.accent, border: '#D4D4D4' },
    danger:  { bg: 'rgba(217,75,75,0.12)', fg: '#9C2E2E' },
  };
  const t = tones[tone] as any;
  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: t.bg, borderWidth: t.border ? 1 : 0, borderColor: t.border }}>
      <Text style={{ fontSize: 12, fontWeight: '500', color: t.fg }}>{children}</Text>
    </View>
  );
}
