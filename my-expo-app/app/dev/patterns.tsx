/**
 * /dev/patterns — NativeWind POC + Pattern Showcase
 *
 *  Bu route geliştiricinin yeni pattern'leri test etmesi için.
 *  - Cards Design tokenleri (CardX)
 *  - Responsive layout (ResponsiveCanvas)
 *  - Renk paleti
 *  - Tipografi
 *
 *  Production'da kaldırılabilir veya admin panelinde gizli kalabilir.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ResponsiveCanvas } from '../../core/layout/ResponsiveCanvas';
import { CardX } from '../../core/ui/CardX';

export default function PatternsScreen() {
  return (
    <ResponsiveCanvas size="lg">
      {/* Hero */}
      <View className="mb-8">
        <Text className="text-3xl font-bold text-slate-900 tracking-tight">
          Tasarım Patternleri
        </Text>
        <Text className="text-sm text-slate-500 mt-2">
          NativeWind + Cards Design — web ve mobile için ortak
        </Text>
      </View>

      {/* Bölüm 1: Renk paleti */}
      <Section title="Renk Paleti">
        <View className="flex-row flex-wrap gap-3">
          <ColorChip name="profit" hex="#059669" />
          <ColorChip name="invoice" hex="#2563EB" />
          <ColorChip name="balance" hex="#0EA5E9" />
          <ColorChip name="expense" hex="#DC2626" />
          <ColorChip name="budget" hex="#7C3AED" />
          <ColorChip name="check" hex="#D97706" />
          <ColorChip name="lab" hex="#2563EB" />
          <ColorChip name="doctor" hex="#0EA5E9" />
          <ColorChip name="clinic" hex="#0369A1" />
        </View>
      </Section>

      {/* Bölüm 2: Cards */}
      <Section title="Cards (3 variant)">
        <View className="flex-col md:flex-row gap-4">
          <CardX className="flex-1">
            <CardX.Header>
              <CardX.Title>Default Card</CardX.Title>
              <CardX.Subtitle>Standart shadow + transparent border</CardX.Subtitle>
            </CardX.Header>
            <CardX.Body>
              <Text className="text-slate-600 text-sm leading-5">
                İçerik burada. Mali İşlemler kartlarının çoğu bu varyantta.
              </Text>
            </CardX.Body>
          </CardX>

          <CardX variant="hero" className="flex-1" accent="#059669">
            <CardX.Title className="text-xl">Hero Card</CardX.Title>
            <CardX.Subtitle>Üstte accent strip + ağır shadow</CardX.Subtitle>
            <Text className="text-3xl font-bold text-emerald-600 mt-4 tracking-tight">
              +₺125.430
            </Text>
            <Text className="text-xs text-emerald-600 mt-1 font-semibold uppercase">
              Net Kâr · Bu Ay
            </Text>
          </CardX>

          <CardX variant="flat" className="flex-1">
            <CardX.Body>
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Flat Card
              </Text>
              <Text className="text-2xl font-bold text-slate-900 mt-2">42</Text>
              <Text className="text-xs text-slate-500 mt-1">Hafif shadow, KPI için</Text>
            </CardX.Body>
          </CardX>
        </View>
      </Section>

      {/* Bölüm 3: Responsive Grid */}
      <Section title="Responsive Grid (mobile 1col, tablet 2col, desktop 4col)">
        <View className="flex-row flex-wrap gap-3">
          {[1, 2, 3, 4].map(n => (
            <View
              key={n}
              className="bg-surface rounded-card border border-card shadow-cardLite p-4 w-full sm:w-[calc(50%-6px)] lg:w-[calc(25%-9px)]"
            >
              <Text className="text-xs font-bold text-slate-400 uppercase">KPI {n}</Text>
              <Text className="text-2xl font-bold text-slate-900 mt-2">{n * 10}</Text>
            </View>
          ))}
        </View>
      </Section>

      {/* Bölüm 4: Buttons */}
      <Section title="Butonlar">
        <View className="flex-row flex-wrap gap-3">
          <Pressable className="bg-invoice rounded-xl px-5 py-3 active:opacity-70 web:cursor-pointer web:hover:opacity-90">
            <Text className="text-white font-bold text-sm">Birincil Aksiyon</Text>
          </Pressable>
          <Pressable className="bg-surface border border-slate-200 rounded-xl px-5 py-3 active:opacity-70 web:cursor-pointer web:hover:bg-slate-50">
            <Text className="text-slate-900 font-semibold text-sm">İkincil</Text>
          </Pressable>
          <Pressable className="bg-danger/10 border border-danger/30 rounded-xl px-5 py-3 active:opacity-70 web:cursor-pointer">
            <Text className="text-danger font-bold text-sm">Tehlikeli</Text>
          </Pressable>
        </View>
      </Section>

      {/* Bölüm 5: Form */}
      <Section title="Form (max-width sm = 720px)">
        <ResponsiveCanvas size="sm" scroll={false} padClassName="">
          <CardX>
            <CardX.Header>
              <CardX.Title>Hekim Davet Et</CardX.Title>
            </CardX.Header>
            <CardX.Body className="gap-3">
              <FormField label="Ad Soyad" placeholder="Dr. Ayşe Yılmaz" />
              <FormField label="E-posta" placeholder="ornek@klinik.com" />
              <FormField label="Telefon" placeholder="+90 555 000 00 00" />
            </CardX.Body>
            <CardX.Footer className="flex-row gap-2 justify-end">
              <Pressable className="bg-surface border border-slate-200 rounded-xl px-4 py-2">
                <Text className="text-slate-700 font-semibold text-sm">İptal</Text>
              </Pressable>
              <Pressable className="bg-clinic rounded-xl px-5 py-2">
                <Text className="text-white font-bold text-sm">Davet Gönder</Text>
              </Pressable>
            </CardX.Footer>
          </CardX>
        </ResponsiveCanvas>
      </Section>

      {/* Bölüm 6: Tipografi */}
      <Section title="Tipografi">
        <View className="gap-2">
          <Text className="text-4xl font-bold text-slate-900 tracking-tight">Heading 1</Text>
          <Text className="text-2xl font-bold text-slate-900">Heading 2</Text>
          <Text className="text-lg font-semibold text-slate-900">Heading 3</Text>
          <Text className="text-sm text-slate-700 leading-relaxed">
            Body — bu metin uzun bir paragraf için kullanılır. Line height geniş tutulmuş,
            color slate-700 olarak optimize edilmiş.
          </Text>
          <Text className="text-xs text-slate-400">Caption / muted</Text>
        </View>
      </Section>

      <View className="h-20" />
    </ResponsiveCanvas>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-10">
      <Text className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
        {title}
      </Text>
      {children}
    </View>
  );
}

function ColorChip({ name, hex }: { name: string; hex: string }) {
  return (
    <View className="items-center">
      <View
        className="w-16 h-16 rounded-2xl shadow-cardLite"
        style={{ backgroundColor: hex }}
      />
      <Text className="text-xs font-mono text-slate-500 mt-2">{name}</Text>
      <Text className="text-[10px] text-slate-400">{hex}</Text>
    </View>
  );
}

function FormField({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <View>
      <Text className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}
      </Text>
      <View className="border border-slate-200 rounded-xl px-3 py-2.5">
        <Text className="text-slate-400 text-sm">{placeholder}</Text>
      </View>
    </View>
  );
}
