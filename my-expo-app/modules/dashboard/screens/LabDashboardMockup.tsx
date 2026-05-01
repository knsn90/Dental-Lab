/**
 * LabDashboardMockup — Handoff bundle "Lab Paneli" tasarımı
 *
 *   Krem zemin + Saffron sarı accent + siyah CTA
 *   Glassmorphism + büyük yumuşak köşeler + Instrument Serif italic
 *
 *   Sadece görsel POC — gerçek veri kullanmaz, mock değerler.
 */
import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Svg, Path, Circle } from 'react-native-svg';
import { DS } from '../../../core/theme/dsTokens';

const T = DS.lab; // theme

export function LabDashboardMockup() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bgSoft }}
      contentContainerStyle={{ padding: 24 }}
    >
      {/* Outer glassmorphism wrapper */}
      <View
        style={{
          backgroundColor: 'rgba(255,255,255,0.55)',
          borderRadius: 32,
          padding: 32,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.7)',
          // @ts-ignore web boxShadow
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 24px 64px rgba(0,0,0,0.06)',
          gap: 20,
          minHeight: 820,
          maxWidth: 1280,
          alignSelf: 'center',
          width: '100%',
        }}
      >

        {/* ═════════════ HEADER ═════════════ */}
        <View className="flex-row items-center" style={{ gap: 14 }}>
          <View style={pillSerif}>
            <Text style={{ fontSize: 18, letterSpacing: -0.01, color: T.accent }}>
              Crextio Lab
            </Text>
          </View>

          <View style={{ flex: 1 }} />

          <View style={tabsContainer}>
            {['Dashboard','Siparişler','Üretim','Stok','Hastalar','Faturalar','Ayarlar'].map((tab, i) => (
              <Pressable
                key={tab}
                style={{
                  paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: i === 0 ? T.accent : 'transparent',
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '500', color: i === 0 ? '#FFF' : '#3C3C3C' }}>
                  {tab}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flex: 1 }} />

          <View style={iconBtn}><BellIcon /></View>
          <View style={iconBtn}>
            <BellIcon />
            <View style={{
              position: 'absolute', top: 8, right: 10, width: 8, height: 8,
              borderRadius: 4, backgroundColor: T.primary, borderWidth: 2, borderColor: T.bgSoft,
            }} />
          </View>
          <Avatar name="Ali Tek" />
        </View>

        {/* ═════════════ HERO ═════════════ */}
        <View className="flex-row items-end justify-between" style={{ gap: 32, paddingTop: 8, flexWrap: 'wrap' }}>
          <View>
            <Text style={{
              fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300', fontSize: 64,
              letterSpacing: -2.2, lineHeight: 60, color: T.accent,
            }}>
              Hoş geldin, <Text style={{ color: '#9A9A9A' }}>Ali</Text>
            </Text>
            <View className="flex-row items-center" style={{ gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
              <HeroChip label="Üretim"   value="72%" valueBg={T.accent} valueFg="#FFF" />
              <HeroChip label="Teslim"   value="54%" valueBg={T.primary} valueFg={T.accent} />
              <HeroChip label="Bekleyen" value=" "  custom={
                <View style={{ width: 80, height: 6, backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                  <View style={{ width: '42%', height: '100%', backgroundColor: T.accent, opacity: 0.6 }} />
                </View>
              } />
              <HeroChip label="Çıkış" value="18%" valueBg="rgba(0,0,0,0.08)" valueFg={T.accent} />
            </View>
          </View>

          <View className="flex-row" style={{ gap: 32 }}>
            <BigStat value="248"   label="Aktif sipariş" />
            <BigStat value="56"    label="Hasta" />
            <BigStat value="2.840" label="Toplam vaka" />
          </View>
        </View>

        {/* ═════════════ CARDS GRID (4 columns) ═════════════ */}
        <View className="flex-row" style={{ gap: 14, flexWrap: 'wrap' }}>

          {/* CARD 1: Aktif Vaka (image placeholder + info) */}
          <View style={{ ...cardBase, flex: 1.1, minWidth: 240, padding: 0, overflow: 'hidden' }}>
            <View style={{ height: 200, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <Svg viewBox="0 0 120 140" width="70%" height="70%">
                <Path
                  d="M60 15c-12 0-20 6-28 8-6 0-9 3-9 9 0 14 7 30 12 44 3 8 4 14 9 14 4 0 5-7 7-13 1-4 4-7 9-7s8 3 9 7c2 6 3 13 7 13 5 0 6-6 9-14 5-14 12-30 12-44 0-6-3-9-9-9-8-2-16-8-28-8z"
                  fill="#FAF5E8" stroke={T.primary} strokeWidth="0.5"
                />
              </Svg>
              <View style={{
                position: 'absolute', top: 14, left: 14,
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                backgroundColor: 'rgba(245,194,75,0.9)',
              }}>
                <Text style={{ fontSize: 10, fontWeight: '500', color: T.accent, letterSpacing: 0.5 }}>● CANLI</Text>
              </View>
            </View>
            <View style={{ padding: 18, backgroundColor: '#FFF' }}>
              <Text style={{ fontSize: 15, fontWeight: '500', color: T.accent }}>Mehmet Yılmaz</Text>
              <Text style={{ fontSize: 11, color: '#6B6B6B', marginTop: 2, marginBottom: 10 }}>#DL-2842 · Zirkonya · A2</Text>
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: T.accent }}>
                <Text style={{ fontSize: 10, fontWeight: '500', color: '#FFF' }}>₺4.200</Text>
              </View>
            </View>
          </View>

          {/* CARD 2: Üretim Süresi (bar chart) */}
          <View style={{ ...cardBase, flex: 1.2, minWidth: 240 }}>
            <View className="flex-row justify-between items-start" style={{ marginBottom: 12 }}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '500', letterSpacing: -0.27 }}>Üretim Süresi</Text>
                <Text style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300', fontSize: 42, letterSpacing: -1.05, lineHeight: 42, marginTop: 8 }}>
                  6.4<Text style={{ fontSize: 14, color: '#9A9A9A' }}> gün</Text>
                </Text>
                <Text style={{ fontSize: 11, color: '#6B6B6B', marginTop: 4 }}>Ortalama bu hafta</Text>
              </View>
              <View style={miniIconBtn}><ArrowUR /></View>
            </View>
            <View className="flex-row items-end" style={{ gap: 6, height: 100 }}>
              {[3,5,4,7,6,9,4].map((v, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                  <View style={{ position: 'relative', width: '100%', height: v * 8, backgroundColor: i === 5 ? T.primary : T.accent, borderRadius: 4 }}>
                    {i === 5 && (
                      <View style={{
                        position: 'absolute', top: -28, alignSelf: 'center',
                        paddingHorizontal: 8, paddingVertical: 2,
                        backgroundColor: T.accent, borderRadius: 6,
                      }}>
                        <Text style={{ color: '#FFF', fontSize: 10 }}>5.2g</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 9, color: '#9A9A9A', textTransform: 'uppercase' }}>
                    {['Pa','Sa','Ça','Pe','Cu','Ct','Pz'][i]}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* CARD 3: Mesai (ring) */}
          <View style={{ ...cardBase, flex: 1, minWidth: 200, alignItems: 'center' }}>
            <View className="flex-row justify-between items-center" style={{ width: '100%', marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '500' }}>Mesai</Text>
              <ArrowUR />
            </View>
            <View style={{ width: 140, height: 140, alignItems: 'center', justifyContent: 'center', position: 'relative', marginTop: 6 }}>
              <Svg width={140} height={140} style={{ transform: [{ rotate: '-90deg' }] }}>
                <Circle cx={70} cy={70} r={60} stroke="rgba(0,0,0,0.06)" strokeWidth={10} fill="none" />
                <Circle cx={70} cy={70} r={60} stroke={T.primary} strokeWidth={10} fill="none"
                  strokeDasharray={`${0.68 * 377} 377`} strokeLinecap="round" />
              </Svg>
              <View style={{ position: 'absolute', alignItems: 'center' }}>
                <Text style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300', fontSize: 32, letterSpacing: -0.6, lineHeight: 32 }}>02:35</Text>
                <Text style={{ fontSize: 9, color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 4 }}>Çalışma</Text>
              </View>
            </View>
            <View className="flex-row" style={{ gap: 8, marginTop: 14 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: T.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text>▶</Text>
              </View>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12 }}>‖</Text>
              </View>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#FFF', fontSize: 11 }}>⊙</Text>
              </View>
            </View>
          </View>

          {/* CARD 4: Bugünkü görevler (dark) */}
          <View style={{ flex: 1.4, minWidth: 280, backgroundColor: T.accent, borderRadius: 24, padding: 22 }}>
            <View className="flex-row justify-between items-center" style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#FFF' }}>Bugünkü görevler</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>3/8</Text>
            </View>
            <View style={{ gap: 10 }}>
              {[
                ['Yılmaz · ölçü teslim', '09:30', true],
                ['Demir · zirkonya kesim', '10:30', true],
                ['Şahin · kontrol', '12:00', false],
                ['Stok sayım', '14:00', false],
                ['Kaya kliniği görüşme', '16:00', false],
              ].map((t, i) => (
                <View key={i} className="flex-row items-center" style={{ gap: 10, paddingBottom: 10, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#FFF' }}>•</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{
                      fontSize: 12, fontWeight: '500', color: '#FFF',
                      textDecorationLine: t[2] ? 'line-through' : 'none',
                      opacity: t[2] ? 0.4 : 1,
                    }}>{t[0]}</Text>
                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{t[1] as string}</Text>
                  </View>
                  <View style={{
                    width: 18, height: 18, borderRadius: 9,
                    backgroundColor: t[2] ? T.primary : 'transparent',
                    borderWidth: t[2] ? 0 : 1.5, borderColor: 'rgba(255,255,255,0.2)',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {t[2] ? <Text style={{ color: T.accent, fontSize: 10, fontWeight: '700' }}>✓</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ═════════════ BOTTOM (week strip + quick action) ═════════════ */}
        <View className="flex-row" style={{ gap: 14, flexWrap: 'wrap' }}>
          {/* Week strip */}
          <View style={{ ...cardBase, flex: 2, minWidth: 360 }}>
            <View className="flex-row items-center" style={{ gap: 12, marginBottom: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '500' }}>Bu hafta</Text>
              <Text style={{ fontSize: 12, color: '#9A9A9A' }}>9–15 Mart 2026</Text>
              <View style={{ flex: 1 }} />
              <View style={chipPill('#FAF5E8')}>
                <Text style={{ fontSize: 11, color: '#9C5E0E', fontWeight: '500' }}>Üretimde 18</Text>
              </View>
              <View style={chipPill('#E8F5EE')}>
                <Text style={{ fontSize: 11, color: '#1F6B47', fontWeight: '500' }}>Tamamlandı 24</Text>
              </View>
            </View>
            <View className="flex-row" style={{ gap: 8 }}>
              {['Pa 9','Sa 10','Ça 11','Pe 12','Cu 13','Ct 14','Pz 15'].map((d, i) => {
                const counts = [4,6,3,8,5,9,2];
                const isToday = i === 3;
                return (
                  <View key={i} style={{
                    flex: 1,
                    backgroundColor: isToday ? T.accent : '#FAFAFA',
                    borderRadius: 14, padding: 12, gap: 8, position: 'relative',
                  }}>
                    <Text style={{ fontSize: 10, opacity: 0.6, color: isToday ? '#FFF' : T.accent, letterSpacing: 0.5, textTransform: 'uppercase' }}>{d}</Text>
                    <Text style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300', fontSize: 24, letterSpacing: -0.6, lineHeight: 24, color: isToday ? '#FFF' : T.accent }}>{counts[i]}</Text>
                    <Text style={{ fontSize: 9, opacity: 0.5, color: isToday ? '#FFF' : T.accent }}>sipariş</Text>
                    {isToday && <View style={{ position: 'absolute', top: 10, right: 10, width: 6, height: 6, borderRadius: 3, backgroundColor: T.primary }} />}
                  </View>
                );
              })}
            </View>
          </View>

          {/* Quick action */}
          <View style={{ flex: 1, minWidth: 240, backgroundColor: T.primary, borderRadius: 24, padding: 22, position: 'relative', overflow: 'hidden' }}>
            <View style={{
              position: 'absolute', top: -20, right: -20, width: 140, height: 140,
              borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.18)',
            }} />
            <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 14, color: T.accent }}>
              Hızlı işlem
            </Text>
            <Text style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300', fontSize: 32, letterSpacing: -0.6, lineHeight: 36, marginBottom: 16, color: T.accent }}>
              Yeni sipariş{'\n'}oluştur
            </Text>
            <Pressable style={{
              alignSelf: 'flex-start',
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: T.accent,
            }}>
              <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '500' }}>Başla →</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const cardBase = {
  backgroundColor: '#FFF', borderRadius: 24, padding: 22,
  // @ts-ignore
  boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)',
};

const pillSerif = {
  paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999,
  borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)',
};

const tabsContainer = {
  flexDirection: 'row' as const, gap: 2, padding: 4,
  backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 999,
};

const iconBtn = {
  width: 40, height: 40, borderRadius: 20,
  backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  alignItems: 'center' as const, justifyContent: 'center' as const,
  position: 'relative' as const,
};

const miniIconBtn = {
  width: 32, height: 32, borderRadius: 16, backgroundColor: '#F5F5F5',
  alignItems: 'center' as const, justifyContent: 'center' as const,
};

const chipPill = (bg: string) => ({
  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: bg,
});

function HeroChip({ label, value, valueBg, valueFg, custom }: {
  label: string; value: string; valueBg?: string; valueFg?: string; custom?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: 0.7 }}>{label}</Text>
      {custom ? custom : (
        <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: valueBg }}>
          <Text style={{ fontSize: 11, fontWeight: '500', color: valueFg }}>{value}</Text>
        </View>
      )}
    </View>
  );
}

function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300', fontSize: 48, letterSpacing: -1.2, lineHeight: 48, color: '#0A0A0A' }}>{value}</Text>
      <Text style={{ fontSize: 11, color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View style={{
      width: 40, height: 40, borderRadius: 20, backgroundColor: T.primary,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: T.accent, letterSpacing: -0.5 }}>{initials}</Text>
    </View>
  );
}

function BellIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth={1.8} strokeLinecap="round">
      <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <Path d="M10 21a2 2 0 0 0 4 0" />
    </Svg>
  );
}

function ArrowUR() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7 17 17 7M7 7h10v10" />
    </Svg>
  );
}
