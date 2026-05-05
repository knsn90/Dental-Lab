/**
 * LabDashboardMockup — Handoff bundle "Lab Paneli" tasarımı (NativeWind)
 *
 *   Krem zemin + Saffron sarı accent + siyah CTA
 *   Patterns design language (görsel birebir korundu, inline → className).
 *   Sadece görsel POC — gerçek veri kullanmaz, mock değerler.
 */
import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Svg, Path, Circle } from 'react-native-svg';
import { DS } from '../../../core/theme/dsTokens';
import { Bell, ArrowUpRight, Play, Pause, Square } from 'lucide-react-native';

const T = DS.lab;
const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const, fontWeight: '300' as const };

export function LabDashboardMockup() {
  return (
    <ScrollView className="flex-1 bg-cream-soft" contentContainerStyle={{ padding: 24 }}>
      {/* Outer glassmorphism wrapper */}
      <View
        className="self-center w-full gap-5 p-8 rounded-[32px] border border-white/70"
        style={{
          backgroundColor: 'rgba(255,255,255,0.55)',
          // @ts-ignore web boxShadow
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 24px 64px rgba(0,0,0,0.06)',
          minHeight: 820,
          maxWidth: 1280,
        }}
      >

        {/* ═════════════ HEADER ═════════════ */}
        <View className="flex-row items-center gap-3.5">
          <View className="px-[18px] py-2 rounded-full border border-black/10">
            <Text className="text-ink-900" style={{ fontSize: 18, letterSpacing: -0.01 }}>
              Crextio Lab
            </Text>
          </View>

          <View className="flex-1" />

          <View className="flex-row gap-0.5 p-1 rounded-full bg-black/5">
            {['Dashboard','Siparişler','Üretim','Stok','Hastalar','Faturalar','Ayarlar'].map((tab, i) => (
              <Pressable
                key={tab}
                className={`px-4 py-2 rounded-full ${i === 0 ? 'bg-ink-900' : ''}`}
              >
                <Text className={`text-[13px] font-medium ${i === 0 ? 'text-white' : 'text-ink-700'}`}>
                  {tab}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="flex-1" />

          <View className="w-10 h-10 rounded-full bg-white/70 border border-black/[0.06] items-center justify-center">
            <Bell size={16} color="#0A0A0A" strokeWidth={1.8} />
          </View>
          <View className="w-10 h-10 rounded-full bg-white/70 border border-black/[0.06] items-center justify-center relative">
            <Bell size={16} color="#0A0A0A" strokeWidth={1.8} />
            <View
              className="absolute w-2 h-2 rounded-full bg-saffron border-2"
              style={{ top: 8, right: 10, borderColor: T.bgSoft }}
            />
          </View>
          <Avatar name="Ali Tek" />
        </View>

        {/* ═════════════ HERO ═════════════ */}
        <View className="flex-row items-end justify-between flex-wrap gap-8 pt-2">
          <View>
            <Text className="text-ink-900" style={{ ...DISPLAY, fontSize: 64, letterSpacing: -2.2, lineHeight: 60 }}>
              Hoş geldin, <Text className="text-ink-400">Ali</Text>
            </Text>
            <View className="flex-row items-center flex-wrap gap-3.5 mt-3.5">
              <HeroChip label="Üretim"   value="72%" valueBg={T.accent} valueFg="#FFF" />
              <HeroChip label="Teslim"   value="54%" valueBg={T.primary} valueFg={T.accent} />
              <HeroChip label="Bekleyen" value=" " custom={
                <View className="rounded-full overflow-hidden bg-black/[0.08]" style={{ width: 80, height: 6 }}>
                  <View className="h-full bg-ink-900/60" style={{ width: '42%' }} />
                </View>
              } />
              <HeroChip label="Çıkış" value="18%" valueBg="rgba(0,0,0,0.08)" valueFg={T.accent} />
            </View>
          </View>

          <View className="flex-row gap-8">
            <BigStat value="248"   label="Aktif sipariş" />
            <BigStat value="56"    label="Hasta" />
            <BigStat value="2.840" label="Toplam vaka" />
          </View>
        </View>

        {/* ═════════════ CARDS GRID (4 columns) ═════════════ */}
        <View className="flex-row flex-wrap gap-3.5">

          {/* CARD 1: Aktif Vaka */}
          <View className="bg-white rounded-3xl overflow-hidden" style={{ flex: 1.1, minWidth: 240, ...cardShadow }}>
            <View className="bg-ink-900 items-center justify-center relative" style={{ height: 200 }}>
              <Svg viewBox="0 0 120 140" width="70%" height="70%">
                <Path
                  d="M60 15c-12 0-20 6-28 8-6 0-9 3-9 9 0 14 7 30 12 44 3 8 4 14 9 14 4 0 5-7 7-13 1-4 4-7 9-7s8 3 9 7c2 6 3 13 7 13 5 0 6-6 9-14 5-14 12-30 12-44 0-6-3-9-9-9-8-2-16-8-28-8z"
                  fill="#FAF5E8" stroke={T.primary} strokeWidth="0.5"
                />
              </Svg>
              <View
                className="absolute px-2.5 py-1 rounded-full"
                style={{ top: 14, left: 14, backgroundColor: 'rgba(245,194,75,0.9)' }}
              >
                <Text className="text-ink-900 font-medium" style={{ fontSize: 10, letterSpacing: 0.5 }}>● CANLI</Text>
              </View>
            </View>
            <View className="bg-white p-[18px]">
              <Text className="text-[15px] font-medium text-ink-900">Mehmet Yılmaz</Text>
              <Text className="text-[11px] text-ink-500 mt-0.5 mb-2.5">#DL-2842 · Zirkonya · A2</Text>
              <View className="self-start px-2.5 py-1 rounded-full bg-ink-900">
                <Text className="text-[10px] font-medium text-white">₺4.200</Text>
              </View>
            </View>
          </View>

          {/* CARD 2: Üretim Süresi (bar chart) */}
          <View className="bg-white rounded-3xl p-[22px]" style={{ flex: 1.2, minWidth: 240, ...cardShadow }}>
            <View className="flex-row justify-between items-start mb-3">
              <View>
                <Text className="text-[18px] font-medium" style={{ letterSpacing: -0.27 }}>Üretim Süresi</Text>
                <Text style={{ ...DISPLAY, fontSize: 42, letterSpacing: -1.05, lineHeight: 42, marginTop: 8 }}>
                  6.4<Text className="text-ink-400" style={{ fontSize: 14 }}> gün</Text>
                </Text>
                <Text className="text-[11px] text-ink-500 mt-1">Ortalama bu hafta</Text>
              </View>
              <View className="w-8 h-8 rounded-full bg-ink-100 items-center justify-center">
                <ArrowUpRight size={14} color="#0A0A0A" strokeWidth={1.8} />
              </View>
            </View>
            <View className="flex-row items-end gap-1.5" style={{ height: 100 }}>
              {[3,5,4,7,6,9,4].map((v, i) => (
                <View key={i} className="flex-1 items-center gap-1.5">
                  <View
                    className={`w-full rounded ${i === 5 ? 'bg-saffron' : 'bg-ink-900'} relative`}
                    style={{ height: v * 8 }}
                  >
                    {i === 5 && (
                      <View className="absolute self-center px-2 py-0.5 bg-ink-900 rounded-md" style={{ top: -28 }}>
                        <Text className="text-white text-[10px]">5.2g</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-[9px] text-ink-400 uppercase">
                    {['Pa','Sa','Ça','Pe','Cu','Ct','Pz'][i]}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* CARD 3: Mesai (ring) */}
          <View className="bg-white rounded-3xl p-[22px] items-center" style={{ flex: 1, minWidth: 200, ...cardShadow }}>
            <View className="flex-row justify-between items-center w-full mb-2">
              <Text className="text-[14px] font-medium">Mesai</Text>
              <ArrowUpRight size={14} color="#0A0A0A" strokeWidth={1.8} />
            </View>
            <View className="items-center justify-center relative mt-1.5" style={{ width: 140, height: 140 }}>
              <Svg width={140} height={140} style={{ transform: [{ rotate: '-90deg' }] }}>
                <Circle cx={70} cy={70} r={60} stroke="rgba(0,0,0,0.06)" strokeWidth={10} fill="none" />
                <Circle cx={70} cy={70} r={60} stroke={T.primary} strokeWidth={10} fill="none"
                  strokeDasharray={`${0.68 * 377} 377`} strokeLinecap="round" />
              </Svg>
              <View className="absolute items-center">
                <Text style={{ ...DISPLAY, fontSize: 32, letterSpacing: -0.6, lineHeight: 32 }}>02:35</Text>
                <Text className="text-[9px] text-ink-500 uppercase mt-1" style={{ letterSpacing: 0.7 }}>Çalışma</Text>
              </View>
            </View>
            <View className="flex-row gap-2 mt-3.5">
              <View className="w-8 h-8 rounded-full bg-saffron items-center justify-center">
                <Play size={12} color={T.accent} strokeWidth={2} fill={T.accent} />
              </View>
              <View className="w-8 h-8 rounded-full bg-ink-100 items-center justify-center">
                <Pause size={12} color={T.accent} strokeWidth={2} />
              </View>
              <View className="w-8 h-8 rounded-full bg-ink-900 items-center justify-center">
                <Square size={11} color="#FFF" strokeWidth={2} fill="#FFF" />
              </View>
            </View>
          </View>

          {/* CARD 4: Bugünkü görevler (dark) */}
          <View className="bg-ink-900 rounded-3xl p-[22px]" style={{ flex: 1.4, minWidth: 280 }}>
            <View className="flex-row justify-between items-center mb-3.5">
              <Text className="text-[14px] font-medium text-white">Bugünkü görevler</Text>
              <Text className="text-[11px] text-white/50">3/8</Text>
            </View>
            <View className="gap-2.5">
              {[
                ['Yılmaz · ölçü teslim', '09:30', true],
                ['Demir · zirkonya kesim', '10:30', true],
                ['Şahin · kontrol', '12:00', false],
                ['Stok sayım', '14:00', false],
                ['Kaya kliniği görüşme', '16:00', false],
              ].map((t, i) => (
                <View
                  key={i}
                  className={`flex-row items-center gap-2.5 pb-2.5 ${i < 4 ? 'border-b border-white/[0.08]' : ''}`}
                >
                  <View className="w-7 h-7 rounded-lg bg-white/[0.08] items-center justify-center">
                    <Text className="text-[12px] text-white">•</Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text
                      numberOfLines={1}
                      className="text-[12px] font-medium text-white"
                      style={{
                        textDecorationLine: t[2] ? 'line-through' : 'none',
                        opacity: t[2] ? 0.4 : 1,
                      }}
                    >{t[0]}</Text>
                    <Text className="text-[10px] text-white/40">{t[1] as string}</Text>
                  </View>
                  <View
                    className={`w-[18px] h-[18px] rounded-full items-center justify-center ${t[2] ? 'bg-saffron' : 'border-[1.5px] border-white/20'}`}
                  >
                    {t[2] ? <Text className="text-ink-900 text-[10px] font-bold">✓</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ═════════════ BOTTOM (week strip + quick action) ═════════════ */}
        <View className="flex-row flex-wrap gap-3.5">
          {/* Week strip */}
          <View className="bg-white rounded-3xl p-[22px]" style={{ flex: 2, minWidth: 360, ...cardShadow }}>
            <View className="flex-row items-center gap-3 mb-2.5">
              <Text className="text-[15px] font-medium">Bu hafta</Text>
              <Text className="text-[12px] text-ink-400">9–15 Mart 2026</Text>
              <View className="flex-1" />
              <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: '#FAF5E8' }}>
                <Text className="text-[11px] font-medium" style={{ color: '#9C5E0E' }}>Üretimde 18</Text>
              </View>
              <View className="px-2.5 py-1 rounded-full" style={{ backgroundColor: '#E8F5EE' }}>
                <Text className="text-[11px] font-medium" style={{ color: '#1F6B47' }}>Tamamlandı 24</Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              {['Pa 9','Sa 10','Ça 11','Pe 12','Cu 13','Ct 14','Pz 15'].map((d, i) => {
                const counts = [4,6,3,8,5,9,2];
                const isToday = i === 3;
                return (
                  <View
                    key={i}
                    className={`flex-1 rounded-2xl p-3 gap-2 relative ${isToday ? 'bg-ink-900' : 'bg-ink-50'}`}
                  >
                    <Text className={`text-[10px] uppercase ${isToday ? 'text-white' : 'text-ink-900'}`} style={{ opacity: 0.6, letterSpacing: 0.5 }}>{d}</Text>
                    <Text
                      className={isToday ? 'text-white' : 'text-ink-900'}
                      style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.6, lineHeight: 24 }}
                    >{counts[i]}</Text>
                    <Text className={`text-[9px] ${isToday ? 'text-white' : 'text-ink-900'}`} style={{ opacity: 0.5 }}>sipariş</Text>
                    {isToday && <View className="absolute w-1.5 h-1.5 rounded-full bg-saffron" style={{ top: 10, right: 10 }} />}
                  </View>
                );
              })}
            </View>
          </View>

          {/* Quick action */}
          <View className="bg-saffron rounded-3xl p-[22px] relative overflow-hidden" style={{ flex: 1, minWidth: 240 }}>
            <View
              className="absolute rounded-full bg-white/[0.18]"
              style={{ top: -20, right: -20, width: 140, height: 140 }}
            />
            <Text className="text-[11px] font-medium uppercase mb-3.5 text-ink-900" style={{ letterSpacing: 1.1 }}>
              Hızlı işlem
            </Text>
            <Text className="text-ink-900 mb-4" style={{ ...DISPLAY, fontSize: 32, letterSpacing: -0.6, lineHeight: 36 }}>
              Yeni sipariş{'\n'}oluştur
            </Text>
            <Pressable className="self-start flex-row items-center gap-2 px-[18px] py-2.5 rounded-full bg-ink-900">
              <Text className="text-white text-[13px] font-medium">Başla →</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const cardShadow = {
  // @ts-ignore web shadow
  boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)',
};

function HeroChip({ label, value, valueBg, valueFg, custom }: {
  label: string; value: string; valueBg?: string; valueFg?: string; custom?: React.ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <Text className="text-[11px] text-ink-500 uppercase" style={{ letterSpacing: 0.7 }}>{label}</Text>
      {custom ? custom : (
        <View className="px-2.5 py-0.5 rounded-full" style={{ backgroundColor: valueBg }}>
          <Text className="text-[11px] font-medium" style={{ color: valueFg }}>{value}</Text>
        </View>
      )}
    </View>
  );
}

function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <View className="items-end">
      <Text className="text-ink-900" style={{ ...DISPLAY, fontSize: 48, letterSpacing: -1.2, lineHeight: 48 }}>{value}</Text>
      <Text className="text-[11px] text-ink-500 uppercase mt-1" style={{ letterSpacing: 0.7 }}>{label}</Text>
    </View>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  return (
    <View className="w-10 h-10 rounded-full bg-saffron items-center justify-center">
      <Text className="text-ink-900 text-[14px] font-semibold" style={{ letterSpacing: -0.5 }}>{initials}</Text>
    </View>
  );
}
