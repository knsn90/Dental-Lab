/**
 * /dev/courier-design — Kurye Panel tasarım önizlemesi
 *
 * 6 ekran (3 Mobile + 3 Desktop) tek bir scrollable previewde:
 *   A1) Mobile  · Dashboard          (HeroCompact F1c + aktif görev + liste)
 *   A2) Mobile  · Teslimat Detayı   (harita üst yarı + sheet)
 *   A3) Mobile  · Geçmiş            (HeroF1 + KPI shelf + son teslimatlar)
 *   B1) Desktop · Dashboard          (sidebar + KPI shelf + 2-col layout)
 *   B2) Desktop · Teslimat Detayı   (split-view: info + harita)
 *   B3) Desktop · Geçmiş & Stat     (F2 hero + 2 chart + tablo)
 *
 * Tema: DS.tech (parlak mavi #3B82F6)
 * Tipografi: Inter Tight 300 Light DISPLAY
 * Geometri: card 18 · hero 28 · pill 999 · 16px sayfa kenarı kuralı
 */

import React from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import {
  Truck, MapPin, Check, Timer, Navigation, TrendingUp, Star,
  ChevronRight, Phone, Camera, PenTool, Bell, Menu, QrCode,
  Home, ClipboardList, Map, BarChart3, HelpCircle, Settings,
  Package, Clock, ArrowLeft, Plus,
} from 'lucide-react-native';
import { DS } from '../../core/theme/dsTokens';

/* ──────────────────────  TOKENS  ────────────────────── */

const TH = DS.tech;
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};
const PAGE_BG = '#F0F2F5';   // outer canvas
const SUCCESS = '#2D9A6B';
const WARNING = '#E89B2A';
const DANGER  = '#D94B4B';

/* ══════════════════════  PAGE  ═══════════════════════ */

export default function CourierDesignPreview() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: PAGE_BG }}
      contentContainerStyle={{ padding: 32, gap: 48, alignItems: 'center' }}
    >
      <PageHeader />

      {/* MOBILE — 3 ekran yan yana */}
      <SectionTitle eyebrow="A · Mobile" title="Kurye uygulaması — 393×852" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 32, justifyContent: 'center' }}>
        <PhoneFrame title="A1 · Dashboard"        ><MobileDashboard /></PhoneFrame>
        <PhoneFrame title="A2 · Aktif Teslimat"   ><MobileDelivery /></PhoneFrame>
        <PhoneFrame title="A3 · Geçmiş & İstat."   ><MobileHistory /></PhoneFrame>
      </View>

      {/* DESKTOP — 3 ekran alt alta */}
      <SectionTitle eyebrow="B · Desktop" title="Kurye paneli — 1440×900" />
      <View style={{ gap: 32, width: '100%', maxWidth: 1440 }}>
        <DesktopFrame title="B1 · Dashboard"             ><DesktopDashboard /></DesktopFrame>
        <DesktopFrame title="B2 · Aktif Teslimat (split)"><DesktopDelivery /></DesktopFrame>
        <DesktopFrame title="B3 · Geçmiş & İstatistik"   ><DesktopHistory /></DesktopFrame>
      </View>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

/* ──────────────────────  HEADER  ────────────────────── */

function PageHeader() {
  return (
    <View style={{ width: '100%', maxWidth: 1280, alignItems: 'flex-start', gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase', color: DS.ink[500] }}>
        Tasarım Önizlemesi · v1
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 48, color: DS.ink[900], letterSpacing: -1.4, lineHeight: 52 }}>
        Kurye Panel · Siman
      </Text>
      <Text style={{ fontSize: 14, color: DS.ink[500], maxWidth: 720, lineHeight: 20 }}>
        DS.tech tema · Inter Tight Light DISPLAY · 16px sayfa kenarı · F1 glass + F1c compact + F2 gradient
        hero pattern'leri. Üretim koduna kopyalanabilir referans.
      </Text>
    </View>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={{ width: '100%', maxWidth: 1280, alignItems: 'flex-start', gap: 4, marginTop: 12 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: TH.primary }}>
        {eyebrow}
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 30, color: DS.ink[900], letterSpacing: -0.9, lineHeight: 34 }}>
        {title}
      </Text>
    </View>
  );
}

/* ──────────────────────  FRAMES  ────────────────────── */

function PhoneFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>
        {title}
      </Text>
      <View style={{
        width: 393, height: 852, backgroundColor: TH.bg, borderRadius: 44,
        borderWidth: 8, borderColor: '#1A1A1A', overflow: 'hidden',
        ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.18)' } as any : {}),
      }}>
        {children}
      </View>
    </View>
  );
}

function DesktopFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 12, width: '100%' }}>
      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500], alignSelf: 'flex-start' }}>
        {title}
      </Text>
      <View style={{
        width: '100%', maxWidth: 1440, height: 900,
        backgroundColor: TH.bg, borderRadius: 16,
        borderWidth: 1, borderColor: DS.ink[200], overflow: 'hidden',
        ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.10)' } as any : {}),
      }}>
        {children}
      </View>
    </View>
  );
}

/* ═══════════════════  A1 · MOBILE DASHBOARD  ═══════════════════ */

function MobileDashboard() {
  return (
    <View style={{ flex: 1, backgroundColor: TH.bg }}>
      {/* TopActionBar */}
      <View style={{
        paddingTop: 48, paddingHorizontal: 16, paddingBottom: 12,
        flexDirection: 'row', alignItems: 'center', gap: 12,
      }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: TH.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Menu size={16} color={DS.ink[800]} />
        </View>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: TH.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF' }}>MA</Text>
          </View>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>Mehmet Ali</Text>
            <Text style={{ fontSize: 10, color: DS.ink[500] }}>Kurye · 14:32</Text>
          </View>
        </View>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: TH.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Bell size={15} color={DS.ink[800]} />
        </View>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: TH.surface, alignItems: 'center', justifyContent: 'center' }}>
          <QrCode size={15} color={DS.ink[800]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, gap: 16 }}>
        {/* F1c Compact Hero */}
        <View style={{
          borderRadius: 20, padding: 22, backgroundColor: TH.primary,
          position: 'relative', overflow: 'hidden',
        }}>
          <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.18)' }} />
          <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(0,0,0,0.05)' }} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', marginBottom: 8 }}>
                AKTİF GÖREV
              </Text>
              <Text style={{ ...DISPLAY, fontSize: 26, color: '#FFF', letterSpacing: -1, lineHeight: 30 }}>
                İstanbul Diş Polikliniği
              </Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.78)', marginTop: 4 }}>
                Bağdat Cad. No:127, Kadıköy · 3.2 km
              </Text>
            </View>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Truck size={20} color="#FFF" strokeWidth={1.6} />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            {[
              { label: 'GİDEN', value: '2' },
              { label: 'GELEN', value: '1' },
              { label: 'BUGÜN', value: '8' },
            ].map(s => (
              <View key={s.label} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' }}>
                <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>{s.label}</Text>
                <Text style={{ ...DISPLAY, fontSize: 18, color: '#FFF', letterSpacing: -0.4, lineHeight: 22 }}>{s.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* CTA */}
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 999, backgroundColor: DS.ink[900] }}>
          <Navigation size={15} color="#FFF" strokeWidth={2} />
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFF' }}>Yola Çık → Navigasyon</Text>
        </Pressable>

        {/* Section: Sıradaki */}
        <View style={{ marginTop: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase', color: DS.ink[500] }}>
            BUGÜN · 14 MART
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5 }}>Sıradaki Teslimatlar</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: TH.primary }}>Tümü →</Text>
          </View>
        </View>

        {/* Liste */}
        <View style={{ gap: 12 }}>
          {[
            { no: 2, name: 'Dent Hekim Polikliniği',  addr: 'Acıbadem Cad. No:42, Kadıköy', tag: 'GİDEN',  tagColor: TH.primary, time: '30 DK', timeTone: WARNING },
            { no: 3, name: 'Aydın Diş Sağlık Merkezi', addr: 'Ataşehir Bulvarı, Ataşehir',   tag: 'GELEN',  tagColor: SUCCESS,    time: '45 DK', timeTone: DS.ink[500] },
            { no: 4, name: 'Smile Klinik',             addr: 'Bağdat Cad. No:209, Caddebostan', tag: 'ACİL', tagColor: DANGER,   time: '15 DK', timeTone: DANGER },
            { no: 5, name: 'Marmara Diş',              addr: 'Erenköy, Yalı Bulvarı',         tag: 'GİDEN', tagColor: TH.primary, time: '1 SA',  timeTone: DS.ink[500] },
          ].map(t => (
            <Card key={t.no} padding={14}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ ...DISPLAY, fontSize: 18, color: TH.primary, letterSpacing: -0.3 }}>{t.no}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                    <Chip label={t.tag} color={t.tagColor} />
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>{t.name}</Text>
                  <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }} numberOfLines={1}>{t.addr}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Chip label={t.time} color={t.timeTone} solid />
                  <ChevronRight size={14} color={DS.ink[400]} />
                </View>
              </View>
            </Card>
          ))}
        </View>

        {/* Bugün Tamamlanan */}
        <View style={{ marginTop: 4 }}>
          <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[700], letterSpacing: -0.3 }}>Bugün Tamamlanan</Text>
        </View>
        <View style={{ gap: 8 }}>
          {[
            { name: 'Akdeniz Diş Kliniği', time: '12:48', dur: '14 dk' },
            { name: 'Vatan Diş', time: '11:22', dur: '18 dk' },
            { name: 'Yeni Smile', time: '10:05', dur: '22 dk' },
          ].map(r => (
            <View key={r.name} style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              padding: 12, borderRadius: 14,
              borderWidth: 1, borderColor: DS.ink[100], backgroundColor: TH.surface,
            }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(45,154,107,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={14} color={SUCCESS} strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[800] }}>{r.name}</Text>
                <Text style={{ fontSize: 10, color: DS.ink[500] }}>{r.time} · {r.dur}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <FabTabBar />
    </View>
  );
}

/* ═══════════════════  A2 · MOBILE TESLİMAT DETAYI  ═══════════════════ */

function MobileDelivery() {
  return (
    <View style={{ flex: 1, backgroundColor: '#FFF' }}>
      {/* Header */}
      <View style={{ paddingTop: 48, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', zIndex: 2 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={16} color={DS.ink[800]} />
        </View>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '600', color: DS.ink[900] }}>İstanbul Diş Polikliniği</Text>
      </View>

      {/* Harita (üst 50%) */}
      <View style={{ height: 320, backgroundColor: TH.bgSoft, position: 'relative', overflow: 'hidden' }}>
        <MapGrid />
        {/* Route line */}
        <View style={{ position: 'absolute', left: 60, top: 120, width: 200, height: 3, backgroundColor: TH.primary, transform: [{ rotate: '32deg' }] }} />
        {/* Origin pulse */}
        <View style={{ position: 'absolute', left: 56, top: 116, width: 16, height: 16, borderRadius: 8, backgroundColor: TH.primary, borderWidth: 3, borderColor: '#FFF' }} />
        {/* Destination */}
        <View style={{ position: 'absolute', right: 80, top: 90, alignItems: 'center' }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: DANGER, alignItems: 'center', justifyContent: 'center' }}>
            <MapPin size={14} color="#FFF" strokeWidth={2.4} />
          </View>
        </View>
        {/* Floating chip */}
        <View style={{ position: 'absolute', top: 16, left: 16, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFF', flexDirection: 'row', gap: 6, alignItems: 'center',
          ...(Platform.OS === 'web' ? { boxShadow: '0 6px 18px rgba(0,0,0,0.12)' } as any : {})
        }}>
          <Navigation size={11} color={TH.primary} strokeWidth={2.2} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: DS.ink[900] }}>3.2 km · 9 dk</Text>
        </View>
      </View>

      {/* Sheet */}
      <View style={{
        flex: 1, marginTop: -28, backgroundColor: '#FFF',
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 16, gap: 16,
      }}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: DS.ink[200] }} />

        {/* Müşteri */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...DISPLAY, fontSize: 18, color: TH.primary }}>İD</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: DS.ink[900] }}>İstanbul Diş Polikliniği</Text>
            <Text style={{ fontSize: 12, color: DS.ink[500] }}>Klinik · 0532 4XX XX XX</Text>
          </View>
          <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: SUCCESS }}>
            <Phone size={13} color="#FFF" strokeWidth={2.2} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFF' }}>Ara</Text>
          </Pressable>
        </View>

        {/* Adres */}
        <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: DS.ink[50], borderWidth: 1, borderColor: DS.ink[100] }}>
          <MapPin size={16} color={TH.primary} strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: DS.ink[800], lineHeight: 17 }}>Bağdat Cad. No:127, Kadıköy / İstanbul</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: TH.primary, marginTop: 6 }}>Haritada Aç →</Text>
          </View>
        </View>

        {/* İçerik */}
        <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: DS.ink[100] }}>
          <Package size={16} color={DS.ink[700]} strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }}>2 paket · 1.2 kg</Text>
            <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>İmplant set + 4 kron</Text>
          </View>
        </View>

        {/* Timeline */}
        <View>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 10 }}>Süreç</Text>
          <StepsTimeline steps={['Alındı', 'Yola Çıkıldı', 'Teslim Et']} current={1} />
        </View>

        {/* CTA'lar */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 'auto' }}>
          <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: DS.ink[900] }}>
            <Camera size={15} color="#FFF" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Foto Çek</Text>
          </Pressable>
          <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: SUCCESS }}>
            <Check size={15} color="#FFF" strokeWidth={2.4} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Teslim Et</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/* ═══════════════════  A3 · MOBILE HISTORY  ═══════════════════ */

function MobileHistory() {
  return (
    <View style={{ flex: 1, backgroundColor: TH.bg }}>
      <View style={{ paddingTop: 56, paddingHorizontal: 16, gap: 16 }}>
        {/* HeroF1 Glass */}
        <View style={{ borderRadius: 28, backgroundColor: TH.bg, padding: 14, borderWidth: 1, borderColor: TH.bgDeep }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.62)', borderRadius: 22, padding: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', gap: 12 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: DS.ink[500] }}>KURYE PERFORMANSI</Text>
            <Text style={{ ...DISPLAY, fontSize: 32, color: DS.ink[900], letterSpacing: -0.8, lineHeight: 36 }}>Bu Hafta</Text>
            <View style={{ flexDirection: 'row', gap: 24, marginTop: 4 }}>
              <BigStat value="47" label="Toplam" />
              <BigStat value="%96" label="Başarı" tone="success" />
            </View>
          </View>
        </View>

        {/* Tab pill */}
        <View style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.05)' }}>
          {['Bu Hafta', 'Bu Ay', 'Tüm Zaman'].map((t, i) => (
            <View key={t} style={{ flex: 1, paddingVertical: 8, borderRadius: 999, backgroundColor: i === 0 ? '#FFF' : 'transparent', alignItems: 'center',
              ...(i === 0 && Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any : null)
            }}>
              <Text style={{ fontSize: 12, fontWeight: i === 0 ? '700' : '500', color: i === 0 ? DS.ink[900] : DS.ink[500] }}>{t}</Text>
            </View>
          ))}
        </View>

        {/* KPI 2x2 grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <KPIMini icon={Truck}      label="Toplam Teslim" value="47"     sub="+12 geçen haftaya" accent={TH.primary} />
          <KPIMini icon={Timer}      label="Ortalama Süre" value="18 dk"  sub="-3 dk hızlı"       accent={SUCCESS} />
          <KPIMini icon={Navigation} label="Toplam Mesafe" value="187 km" sub="6 saat sürüş"      accent="#7C3AED" />
          <KPIMini icon={Star}       label="Memnuniyet"    value="4.8★"   sub="34 değerlendirme"  accent={WARNING} />
        </View>

        {/* Son Teslimatlar */}
        <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900], letterSpacing: -0.3, marginTop: 4 }}>Son Teslimatlar</Text>
        <View style={{ gap: 8, paddingBottom: 100 }}>
          {[
            { name: 'Akdeniz Diş', time: '12:48', dur: '14 dk · 3.1 km', star: 5 },
            { name: 'Vatan Diş',   time: '11:22', dur: '18 dk · 4.7 km', star: 4 },
            { name: 'Yeni Smile',  time: '10:05', dur: '22 dk · 6.2 km', star: 5 },
          ].map(r => (
            <View key={r.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[100] }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(45,154,107,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                <Check size={16} color={SUCCESS} strokeWidth={2.4} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{r.name}</Text>
                <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>{r.time} · {r.dur}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 1 }}>
                {[1, 2, 3, 4, 5].map(i => (
                  <Star key={i} size={11} color={i <= r.star ? WARNING : DS.ink[200]} fill={i <= r.star ? WARNING : 'none'} />
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>
      <FabTabBar activeIndex={3} />
    </View>
  );
}

/* ═══════════════════  B1 · DESKTOP DASHBOARD  ═══════════════════ */

function DesktopDashboard() {
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <DesktopSidebar active="Bugün" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
        <PageTitle title="Bugünki Teslimatlar" sub="14 Mart, Cuma · 3 aktif görev" />

        {/* F1c Compact Hero — tek satır desktop varyantı */}
        <View style={{ borderRadius: 28, padding: 14, backgroundColor: TH.bg }}>
          <View style={{ borderRadius: 22, padding: 22, backgroundColor: TH.primary, position: 'relative', overflow: 'hidden' }}>
            <View style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.15)' }} />
            <View style={{ position: 'absolute', bottom: -60, left: -20, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(0,0,0,0.05)' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 24 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)' }}>AKTİF GÖREV</Text>
                <Text style={{ ...DISPLAY, fontSize: 32, color: '#FFF', letterSpacing: -1, lineHeight: 36, marginTop: 6 }}>İstanbul Diş Polikliniği</Text>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.78)', marginTop: 4 }}>Bağdat Cad. No:127, Kadıköy · 3.2 km</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {[
                  { label: 'GİDEN', value: '2' },
                  { label: 'GELEN', value: '1' },
                  { label: 'BUGÜN', value: '8' },
                ].map(s => (
                  <View key={s.label} style={{ minWidth: 100, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>{s.label}</Text>
                    <Text style={{ ...DISPLAY, fontSize: 22, color: '#FFF', letterSpacing: -0.5, marginTop: 2 }}>{s.value}</Text>
                  </View>
                ))}
              </View>
              <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center' }}>
                <Truck size={26} color="#FFF" strokeWidth={1.6} />
              </View>
              <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, backgroundColor: '#FFF' }}>
                <Navigation size={13} color={TH.primary} strokeWidth={2.2} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: TH.primary }}>Navigasyon</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* KPI shelf 4-col */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <KPIDesktop icon={Truck}      label="Aktif Görev" value="3"      accent={TH.primary} />
          <KPIDesktop icon={Check}      label="Tamamlanan"  value="8"      accent={SUCCESS} />
          <KPIDesktop icon={Timer}      label="Ort. Süre"   value="18 dk"  accent={WARNING} />
          <KPIDesktop icon={Navigation} label="Mesafe"      value="47 km"  accent="#7C3AED" />
        </View>

        {/* 2-col body */}
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {/* Liste */}
          <View style={{ flex: 6 }}>
            <SecHeader eyebrow="Liste" title="Sıradaki Teslimatlar" />
            <Card padding={0}>
              {/* Table head */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: DS.ink[50], borderBottomWidth: 1, borderBottomColor: DS.ink[100], gap: 12 }}>
                {['Müşteri', 'Adres', 'Tip', 'Mesafe', 'Vade', ''].map((h, i) => (
                  <Text key={h} style={{ flex: i === 1 ? 2 : 1, fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.6 }}>{h}</Text>
                ))}
              </View>
              {[
                { name: 'Dent Hekim', addr: 'Acıbadem Cad. No:42',     tag: 'GİDEN',  tagColor: TH.primary, dist: '2.1 km', time: '30 DK', timeTone: WARNING },
                { name: 'Aydın Diş',  addr: 'Ataşehir Bulvarı',         tag: 'GELEN',  tagColor: SUCCESS,    dist: '4.5 km', time: '45 DK', timeTone: DS.ink[500] },
                { name: 'Smile',      addr: 'Bağdat Cad. No:209',       tag: 'ACİL',   tagColor: DANGER,     dist: '1.2 km', time: '15 DK', timeTone: DANGER },
                { name: 'Marmara',    addr: 'Erenköy, Yalı Bulvarı',    tag: 'GİDEN',  tagColor: TH.primary, dist: '5.8 km', time: '1 SA',  timeTone: DS.ink[500] },
              ].map((r, i, arr) => (
                <View key={r.name} style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 14, gap: 12, alignItems: 'center', borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: DS.ink[100] }}>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{r.name}</Text>
                  <Text style={{ flex: 2, fontSize: 12, color: DS.ink[500] }} numberOfLines={1}>{r.addr}</Text>
                  <View style={{ flex: 1 }}><Chip label={r.tag} color={r.tagColor} /></View>
                  <Text style={{ flex: 1, fontSize: 12, color: DS.ink[700] }}>{r.dist}</Text>
                  <View style={{ flex: 1 }}><Chip label={r.time} color={r.timeTone} solid /></View>
                  <ChevronRight size={14} color={DS.ink[300]} />
                </View>
              ))}
            </Card>
          </View>

          {/* Map */}
          <View style={{ flex: 4 }}>
            <SecHeader eyebrow="Konum" title="Canlı Harita" />
            <Card padding={0} style={{ overflow: 'hidden' }}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: DS.ink[100] }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SUCCESS }} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700] }}>Aktif Konum · 14:32</Text>
              </View>
              <View style={{ height: 360, backgroundColor: TH.bgSoft, position: 'relative', overflow: 'hidden' }}>
                <MapGrid />
                {[{ x: 80, y: 100 }, { x: 200, y: 180 }, { x: 130, y: 240 }, { x: 280, y: 90 }].map((p, i) => (
                  <View key={i} style={{ position: 'absolute', left: p.x, top: p.y, width: 24, height: 24, borderRadius: 12, backgroundColor: i === 0 ? TH.primary : DANGER, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFF' }}>{i + 1}</Text>
                  </View>
                ))}
              </View>
              <View style={{ padding: 12 }}>
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 999, backgroundColor: DS.ink[900] }}>
                  <Map size={13} color="#FFF" />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFF' }}>Tam Ekran Harita →</Text>
                </Pressable>
              </View>
            </Card>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ═══════════════════  B2 · DESKTOP TESLİMAT DETAYI  ═══════════════════ */

function DesktopDelivery() {
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <DesktopSidebar active="Teslimatlar" />
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* SOL — info */}
        <ScrollView style={{ flex: 4 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Text style={{ fontSize: 11, color: DS.ink[500] }}>Teslimatlar / İstanbul Diş Polikliniği</Text>

          <Card padding={18}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Chip label="YOLA ÇIKILDI" color={TH.primary} solid />
              <Chip label="2 PAKET" color={DS.ink[700]} />
            </View>
            <Text style={{ ...DISPLAY, fontSize: 24, color: DS.ink[900], letterSpacing: -0.6 }}>İstanbul Diş Polikliniği</Text>
            <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 6 }}>Bağdat Cad. No:127, Kadıköy · <Text style={{ color: TH.primary, fontWeight: '600' }}>Haritada Aç →</Text></Text>
          </Card>

          <View>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 12 }}>Süreç</Text>
            <StepsTimeline steps={['Alındı', 'Üretim', 'Yola Çıkıldı', 'Teslim Et']} current={2} />
          </View>

          {/* 2-col grid */}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Card padding={16} style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 10 }}>Müşteri</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ ...DISPLAY, fontSize: 18, color: TH.primary }}>İD</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>Dr. Aylar Teke</Text>
                  <Text style={{ fontSize: 11, color: DS.ink[500] }}>Klinik · İstanbul</Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: DS.ink[700] }}>📞 0532 4XX XX XX</Text>
              <Text style={{ fontSize: 12, color: DS.ink[700], marginTop: 4 }}>✉ info@istdis.com</Text>
              <Pressable style={{ marginTop: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: DS.ink[100], alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[800] }}>Mesaj Gönder</Text>
              </Pressable>
            </Card>

            <Card padding={16} style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 10 }}>Paket</Text>
              <Text style={{ ...DISPLAY, fontSize: 26, color: DS.ink[900], letterSpacing: -0.6 }}>2 paket · 1.2 kg</Text>
              <Text style={{ fontSize: 12, color: DS.ink[700], marginTop: 8 }}>İmplant set + 4 kron</Text>
              <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 8, fontFamily: 'monospace' }}>Receipt: DL-2842-A</Text>
            </Card>
          </View>

          {/* Admin not */}
          <View style={{ padding: 14, borderRadius: 14, backgroundColor: 'rgba(232,155,42,0.12)', borderWidth: 1, borderColor: 'rgba(232,155,42,0.30)' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: '#9C5E0E' }}>Admin Notu</Text>
            <Text style={{ fontSize: 12, color: DS.ink[800], marginTop: 6, lineHeight: 18 }}>
              Hekim 14:00 sonrası klinikte olacak. Önce arayıp teyit al.
            </Text>
          </View>

          {/* Sticky CTA */}
          <View style={{ flexDirection: 'row', gap: 10, paddingTop: 8 }}>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999, backgroundColor: DS.ink[900] }}>
              <Camera size={13} color="#FFF" />
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFF' }}>Foto Çek</Text>
            </Pressable>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200] }}>
              <PenTool size={13} color={DS.ink[800]} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[800] }}>İmza Al</Text>
            </Pressable>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 999, backgroundColor: SUCCESS }}>
              <Check size={14} color="#FFF" strokeWidth={2.4} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>Teslim Et ✓</Text>
            </Pressable>
          </View>
        </ScrollView>

        {/* SAĞ — harita */}
        <View style={{ flex: 6, padding: 16 }}>
          <Card padding={0} style={{ flex: 1, overflow: 'hidden' }}>
            <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: DS.ink[100] }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SUCCESS }} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700] }}>Konum · 14:32 · GPS aktif</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: TH.bgSoft, position: 'relative' }}>
              <MapGrid dense />
              <View style={{ position: 'absolute', left: 100, top: 200, width: 300, height: 4, backgroundColor: TH.primary, transform: [{ rotate: '24deg' }] }} />
              <View style={{ position: 'absolute', left: 96, top: 196, width: 18, height: 18, borderRadius: 9, backgroundColor: TH.primary, borderWidth: 3, borderColor: '#FFF' }} />
              <View style={{ position: 'absolute', right: 80, top: 100, width: 30, height: 30, borderRadius: 15, backgroundColor: DANGER, alignItems: 'center', justifyContent: 'center' }}>
                <MapPin size={16} color="#FFF" />
              </View>
              <View style={{ position: 'absolute', bottom: 16, left: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', gap: 8,
                ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.16)' } as any : {})
              }}>
                <Navigation size={13} color={TH.primary} strokeWidth={2.2} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>3.2 km · 9 dk kaldı</Text>
              </View>
            </View>
          </Card>
        </View>
      </View>
    </View>
  );
}

/* ═══════════════════  B3 · DESKTOP HISTORY  ═══════════════════ */

function DesktopHistory() {
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <DesktopSidebar active="İstatistik" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
        <PageTitle title="Performansım" sub="Geçmiş analizler ve istatistikler" />

        {/* Tab */}
        <View style={{ flexDirection: 'row', alignSelf: 'flex-start', padding: 4, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.05)' }}>
          {['Bu Hafta', 'Bu Ay', '3 Ay', '1 Yıl'].map((t, i) => (
            <View key={t} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: i === 0 ? '#FFF' : 'transparent',
              ...(i === 0 && Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any : null)
            }}>
              <Text style={{ fontSize: 12, fontWeight: i === 0 ? '700' : '500', color: i === 0 ? DS.ink[900] : DS.ink[500] }}>{t}</Text>
            </View>
          ))}
        </View>

        {/* F2 Hero */}
        <View style={{ borderRadius: 28, padding: 36, backgroundColor: TH.primary, position: 'relative', overflow: 'hidden' }}>
          <View style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.15)' }} />
          <View style={{ position: 'absolute', bottom: -60, left: -20, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(0,0,0,0.05)' }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)' }}>ÖZET</Text>
              <Text style={{ ...DISPLAY, fontSize: 56, color: '#FFF', letterSpacing: -2, lineHeight: 60, marginTop: 8 }}>47 teslim</Text>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>Bu hafta tamamlandı</Text>
            </View>
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: DS.ink[900] }}>
              <BarChart3 size={14} color="#FFF" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>Detaylı Rapor →</Text>
            </Pressable>
          </View>
        </View>

        {/* KPI 4-col */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <KPIDesktop icon={Navigation} label="Toplam Mesafe" value="187 km" accent={TH.primary} />
          <KPIDesktop icon={Timer}      label="Ort. Süre"     value="18 dk"  accent={WARNING} />
          <KPIDesktop icon={Check}      label="Başarı"        value="%96"    accent={SUCCESS} />
          <KPIDesktop icon={Star}       label="Memnuniyet"    value="4.8★"   accent="#7C3AED" />
        </View>

        {/* Charts */}
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Card padding={18} style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>Günlük Teslimat</Text>
            <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5, marginTop: 4 }}>Son 7 gün</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 120, marginTop: 20 }}>
              {[6, 8, 5, 9, 7, 10, 8].map((v, i) => (
                <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                  <View style={{ width: '100%', height: v * 11, backgroundColor: TH.primary, borderRadius: 4 }} />
                  <Text style={{ fontSize: 10, color: DS.ink[500] }}>{['Pt','Sl','Ça','Pe','Cu','Ct','Pz'][i]}</Text>
                </View>
              ))}
            </View>
          </Card>

          <Card padding={18} style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>Ortalama Süre</Text>
            <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5, marginTop: 4 }}>Trend ↓</Text>
            <View style={{ position: 'relative', height: 120, marginTop: 20 }}>
              {[24, 22, 21, 19, 20, 17, 18].map((v, i, arr) => {
                const x = (i / (arr.length - 1)) * 100;
                const y = ((30 - v) / 14) * 100;
                return (
                  <View key={i} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: 8, height: 8, borderRadius: 4, backgroundColor: SUCCESS, marginLeft: -4, marginTop: -4 }} />
                );
              })}
            </View>
          </Card>
        </View>

        {/* Tablo */}
        <View>
          <SecHeader eyebrow="Tüm Teslimatlar" title="Detay Liste" />
          <Card padding={0}>
            <View style={{ flexDirection: 'row', padding: 12, gap: 8 }}>
              {['Tümü', 'Tamamlanan', 'İptal'].map((t, i) => (
                <View key={t} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: i === 0 ? DS.ink[900] : DS.ink[200], backgroundColor: i === 0 ? DS.ink[900] : '#FFF' }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: i === 0 ? '#FFF' : DS.ink[700] }}>{t}</Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: DS.ink[50], borderBottomWidth: 1, borderBottomColor: DS.ink[100] }}>
              {['Tarih', 'Müşteri', 'Mesafe', 'Süre', 'Rating', 'Status'].map((h, i) => (
                <Text key={h} style={{ flex: i === 1 ? 2 : 1, fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.6 }}>{h}</Text>
              ))}
            </View>
            {[
              { d: '14 Mar', name: 'Akdeniz Diş',  dist: '3.1 km', dur: '14 dk', rating: 5, st: 'TAMAM' },
              { d: '14 Mar', name: 'Vatan Diş',    dist: '4.7 km', dur: '18 dk', rating: 4, st: 'TAMAM' },
              { d: '13 Mar', name: 'Yeni Smile',   dist: '6.2 km', dur: '22 dk', rating: 5, st: 'TAMAM' },
              { d: '13 Mar', name: 'Lotus Diş',    dist: '2.8 km', dur: '12 dk', rating: 5, st: 'TAMAM' },
            ].map((r, i, arr) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: DS.ink[100] }}>
                <Text style={{ flex: 1, fontSize: 11, color: DS.ink[500] }}>{r.d}</Text>
                <Text style={{ flex: 2, fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{r.name}</Text>
                <Text style={{ flex: 1, fontSize: 12, color: DS.ink[700] }}>{r.dist}</Text>
                <Text style={{ flex: 1, fontSize: 12, color: DS.ink[700] }}>{r.dur}</Text>
                <View style={{ flex: 1, flexDirection: 'row', gap: 1 }}>
                  {[1, 2, 3, 4, 5].map(s => <Star key={s} size={11} color={s <= r.rating ? WARNING : DS.ink[200]} fill={s <= r.rating ? WARNING : 'none'} />)}
                </View>
                <View style={{ flex: 1 }}><Chip label={r.st} color={SUCCESS} /></View>
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

/* ──────────────────────  ATOMS  ────────────────────── */

function Card({ children, padding = 16, style }: { children: React.ReactNode; padding?: number; style?: any }) {
  return (
    <View style={[{ backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: DS.ink[200], padding }, style]}>
      {children}
    </View>
  );
}

function Chip({ label, color, solid }: { label: string; color: string; solid?: boolean }) {
  return (
    <View style={{
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
      backgroundColor: solid ? color + '14' : color + '14',
      alignSelf: 'flex-start',
    }}>
      <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, color }}>{label}</Text>
    </View>
  );
}

function BigStat({ value, label, tone }: { value: string; label: string; tone?: 'success' }) {
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Text style={{ ...DISPLAY, fontSize: 40, letterSpacing: -1.4, lineHeight: 42, color: tone === 'success' ? SUCCESS : DS.ink[900] }}>{value}</Text>
      <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginTop: 4 }}>{label}</Text>
    </View>
  );
}

function KPIMini({ icon: Icon, label, value, sub, accent }: { icon: any; label: string; value: string; sub: string; accent: string }) {
  return (
    <View style={{ flex: 1, minWidth: '46%', backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: DS.ink[200], padding: 14, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: accent + '14', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={12} color={accent} strokeWidth={2.2} />
        </View>
        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>{label}</Text>
      </View>
      <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.7, lineHeight: 26, color: DS.ink[900] }}>{value}</Text>
      <Text style={{ fontSize: 10, color: DS.ink[500] }}>{sub}</Text>
    </View>
  );
}

function KPIDesktop({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: DS.ink[200], padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: accent + '14', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={accent} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>{label}</Text>
        <Text style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.7, lineHeight: 28, color: DS.ink[900], marginTop: 2 }}>{value}</Text>
      </View>
    </View>
  );
}

function StepsTimeline({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {steps.map((s, i, arr) => (
        <React.Fragment key={s}>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <View style={{
              width: 28, height: 28, borderRadius: 14,
              backgroundColor: i < current ? TH.primary : i === current ? TH.primary : '#FFF',
              borderWidth: i === current ? 3 : i < current ? 0 : 1,
              borderColor: i === current ? TH.primary + '40' : DS.ink[300],
              alignItems: 'center', justifyContent: 'center',
            }}>
              {i < current ? <Check size={12} color="#FFF" strokeWidth={3} /> : i === current ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' }} /> : null}
            </View>
            <Text style={{ fontSize: 9, fontWeight: '600', color: i <= current ? DS.ink[900] : DS.ink[400], marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>{s}</Text>
          </View>
          {i < arr.length - 1 && <View style={{ flex: 0.3, height: 1, backgroundColor: i < current ? TH.primary : DS.ink[200], marginBottom: 18 }} />}
        </React.Fragment>
      ))}
    </View>
  );
}

function SecHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500] }}>{eyebrow}</Text>
      <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5, marginTop: 4 }}>{title}</Text>
    </View>
  );
}

function PageTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <View>
      <Text style={{ ...DISPLAY, fontSize: 30, color: DS.ink[900], letterSpacing: -0.9, lineHeight: 34 }}>{title}</Text>
      <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>{sub}</Text>
    </View>
  );
}

function MapGrid({ dense }: { dense?: boolean }) {
  const step = dense ? 24 : 32;
  return (
    <View style={{ position: 'absolute', inset: 0 as any, opacity: 0.4 }}>
      {Array.from({ length: 20 }).map((_, i) => (
        <View key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, top: i * step, height: 1, backgroundColor: TH.primary + '15' }} />
      ))}
      {Array.from({ length: 20 }).map((_, i) => (
        <View key={`v${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: i * step, width: 1, backgroundColor: TH.primary + '15' }} />
      ))}
    </View>
  );
}

function FabTabBar({ activeIndex = 0 }: { activeIndex?: number }) {
  const items = [Home, ClipboardList, QrCode, Map, Bell];
  return (
    <View style={{
      position: 'absolute', bottom: 24, left: 16, right: 16,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
      paddingVertical: 12, borderRadius: 28, backgroundColor: '#FFF',
      borderWidth: 1, borderColor: DS.ink[200],
      ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.10)' } as any : {}),
    }}>
      {items.map((Icon, i) => {
        const active = i === activeIndex;
        const isFab = i === 2;
        if (isFab) {
          return (
            <View key={i} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: TH.primary, alignItems: 'center', justifyContent: 'center', marginTop: -28,
              ...(Platform.OS === 'web' ? { boxShadow: `0 8px 24px ${TH.primary}66` } as any : {})
            }}>
              <Icon size={22} color="#FFF" strokeWidth={2.2} />
            </View>
          );
        }
        return (
          <View key={i} style={{ padding: 8 }}>
            <Icon size={20} color={active ? TH.primary : DS.ink[400]} strokeWidth={2} />
          </View>
        );
      })}
    </View>
  );
}

function DesktopSidebar({ active }: { active: string }) {
  const items = [
    { label: 'Bugün',        icon: Home,          badge: 0 },
    { label: 'Teslimatlar',  icon: ClipboardList, badge: 3 },
    { label: 'Harita',       icon: Map,           badge: 0 },
    { label: 'İstatistik',   icon: BarChart3,     badge: 0 },
    { label: 'Destek',       icon: HelpCircle,    badge: 0 },
    { label: 'Ayarlar',      icon: Settings,      badge: 0 },
  ];
  return (
    <View style={{ width: 220, backgroundColor: TH.surface, borderRightWidth: 1, borderRightColor: DS.ink[200], padding: 16, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 4, marginBottom: 12 }}>
        <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: TH.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Truck size={16} color="#FFF" />
        </View>
        <View>
          <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>Siman</Text>
          <Text style={{ fontSize: 10, color: DS.ink[500] }}>Kurye Paneli</Text>
        </View>
      </View>

      {items.map(it => {
        const isActive = it.label === active;
        const Icon = it.icon;
        return (
          <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: isActive ? 'rgba(0,0,0,0.05)' : 'transparent' }}>
            <Icon size={15} color={isActive ? DS.ink[900] : DS.ink[700]} strokeWidth={1.8} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: isActive ? '600' : '500', color: isActive ? DS.ink[900] : DS.ink[700] }}>{it.label}</Text>
            {it.badge > 0 && (
              <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: DANGER, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFF' }}>{it.badge}</Text>
              </View>
            )}
          </View>
        );
      })}

      <View style={{ flex: 1 }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.03)' }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: TH.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF' }}>MA</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }}>Mehmet Ali</Text>
          <Text style={{ fontSize: 10, color: DS.ink[500] }}>Kurye</Text>
        </View>
      </View>
    </View>
  );
}
