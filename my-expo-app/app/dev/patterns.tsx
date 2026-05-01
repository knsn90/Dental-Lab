/**
 * /dev/patterns — Tasarım Sistemi Stil Rehberi
 *
 *   Lab management handoff bundle'ına göre yeniden düzenlendi:
 *   • Krem zemin + Instrument Serif italic display
 *   • 3 panel teması: Lab (Saffron), Klinik (Sage), Yönetim (Mercan)
 *   • Büyük yumuşak köşeler, glassmorphism, ince modern hatlar
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Animated, Easing } from 'react-native';
import { Svg, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { DS, dsTheme, type DsTheme } from '../../core/theme/dsTokens';

// Tüm display başlıklar — Inter Tight Light (300), sıkı tracking
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};

export default function PatternsScreen() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: DS.ink[50] }} contentContainerStyle={{ padding: 56 }}>

      {/* ═════ HERO ═════ */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 32, paddingBottom: 32, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)', marginBottom: 64, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, maxWidth: 720, minWidth: 320 }}>
          <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.3, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 16 }}>
            Tasarım Sistemi · v1.0
          </Text>
          <Text style={{ ...DISPLAY, fontSize: 88, letterSpacing: -3.1, lineHeight: 84, color: DS.ink[900] }}>
            Dental Lab{'\n'}
            <Text style={{ color: DS.ink[500] }}>tasarım sistemi</Text>
          </Text>
          <Text style={{ fontSize: 17, color: '#3C3C3C', maxWidth: 560, lineHeight: 25, marginTop: 24 }}>
            Laboratuvar yönetimi için modern, ferah ve premium hisli komponent kütüphanesi.
            Her panel için farklı renk teması, ortak tipografi ve etkileşim dili.
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PillButton variant="dark">Dokümantasyon</PillButton>
          <PillButton variant="light">Figma</PillButton>
        </View>
      </View>

      {/* ═════ 01 — RENK SİSTEMİ (3 PANEL) ═════ */}
      <SecHeader eyebrow="01 · Renk Sistemi" title="Üç panel, üç kişilik" desc="Her panel kendi rengiyle gelir. Aynı bileşenler, farklı kimlikler." />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginBottom: 80 }}>
        {(['lab', 'clinic', 'exec'] as DsTheme[]).map((k, i) => {
          const t = dsTheme(k);
          return (
            <View key={k} style={{ flex: 1, minWidth: 320, backgroundColor: t.bg, borderRadius: 24, padding: 28, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase', color: DS.ink[500] }}>0{i + 1}</Text>
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: t.accent }}>
                  <Text style={{ fontSize: 10, fontWeight: '500', letterSpacing: 0.6, textTransform: 'uppercase', color: t.surface }}>{k}</Text>
                </View>
              </View>
              <Text style={{ ...DISPLAY, fontSize: 36, letterSpacing: -0.7, color: DS.ink[900], marginBottom: 8, lineHeight: 36 }}>
                {t.name}
              </Text>
              <Text style={{ fontSize: 13, color: '#3C3C3C', marginBottom: 32, lineHeight: 19 }}>
                {k === 'lab'    && 'Üretim takibi, sipariş yönetimi, teknisyen panelleri için ana operasyon teması.'}
                {k === 'clinic' && 'Doktorlar ve klinikler için sağlıklı, sakin ve güvenilir hisli arayüz.'}
                {k === 'exec'   && 'Yönetici dashboard\'ları, finans ve raporlama için premium ve sıcak görünüm.'}
              </Text>

              {/* Color swatches */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {[
                  { bg: t.primary,  label: 'primary',  hex: t.primary },
                  { bg: t.accent,   label: 'accent',   hex: t.accent },
                  { bg: t.bgDeep,   label: 'bg deep',  hex: t.bgDeep },
                  { bg: t.surface,  label: 'surface',  hex: t.surface, border: true },
                ].map((s, j) => (
                  <View key={j} style={{ flex: 1, gap: 6 }}>
                    <View style={{ height: 64, borderRadius: 12, backgroundColor: s.bg, borderWidth: s.border ? 1 : 0, borderColor: 'rgba(0,0,0,0.08)' }} />
                    <Text style={{ fontSize: 10, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</Text>
                    <Text style={{ fontSize: 10, color: DS.ink[900], fontFamily: 'monospace' }}>{s.hex}</Text>
                  </View>
                ))}
              </View>

              {/* Status chips */}
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <StatusChip color="#1F6B47" bg="rgba(45,154,107,0.12)" label="success" />
                <StatusChip color="#9C5E0E" bg="rgba(232,155,42,0.15)" label="warning" />
                <StatusChip color="#9C2E2E" bg="rgba(217,75,75,0.12)" label="danger" />
                <StatusChip color="#1F5689" bg="rgba(74,143,201,0.12)" label="info" />
              </View>
            </View>
          );
        })}
      </View>

      {/* ═════ 02 — TİPOGRAFİ ═════ */}
      <SecHeader eyebrow="02 · Tipografi" title="Tek aile, ince ve modern" desc="Display başlıklarda Instrument Serif (italic vurguyla). UI için Inter Tight." />

      <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 40, marginBottom: 80, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
        <TypeRow label="DISPLAY · 88/0.95"  variant="display" sample={<Text>Hoş geldiniz, <Text style={{ color: DS.ink[400] }}>doktor</Text></Text>} />
        <TypeRow label="H1 · 56/1.0"        size={56} sample="Bu hafta 248 sipariş tamamlandı" />
        <TypeRow label="H2 · 40/1.1"        size={40} sample="Üretim hattındaki vakalar" />
        <TypeRow label="H3 · 28/1.2"        size={28} sample="Mehmet Yılmaz · Zirkonya köprü" sansSerif />
        <TypeRow label="BODY · 15/1.5"      size={15} sample="Hasta dosyası açıldı, ölçü teslim alındı. Üretim 5 iş günü içinde tamamlanacak." sansSerif />
        <TypeRow label="MICRO · 11"         size={11} sample="DL-2842 · 09:30" sansSerif noBorder />
      </View>

      {/* ═════ 03 — BUTONLAR ═════ */}
      <SecHeader eyebrow="03 · Butonlar" title="Tek bir doğru çağrı" desc="Pill köşeli, sıkı tipografi. Primary ve secondary için yeterli kontrast." />

      <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 40, marginBottom: 80, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <PillButton variant="dark">Birincil aksiyon</PillButton>
        <PillButton variant="primary">İkincil — Saffron</PillButton>
        <PillButton variant="light">Sade çerçeve</PillButton>
        <PillButton variant="ghost">Hayalet</PillButton>
        <PillButton variant="dark" size="sm">Küçük</PillButton>
        <PillButton variant="dark" size="lg">Büyük çağrı</PillButton>
      </View>

      {/* ═════ 04 — CHIP / TAG ═════ */}
      <SecHeader eyebrow="04 · Chip & Etiket" title="Bilgiyi mini paketlerde göster" />

      <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 40, marginBottom: 80, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip tone="neutral">nötr</Chip>
        <Chip tone="primary">primary</Chip>
        <Chip tone="accent">accent</Chip>
        <Chip tone="success" dot>tamamlandı</Chip>
        <Chip tone="warning" dot>üretimde</Chip>
        <Chip tone="danger"  dot>geciken</Chip>
        <Chip tone="info"    dot>kontrol</Chip>
        <Chip tone="outline">outline</Chip>
      </View>

      {/* ═════ 05 — KARTLAR (3 variant) ═════ */}
      <SecHeader eyebrow="05 · Kartlar" title="Üç katman: solid · flat · dark" />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 80 }}>
        <View style={{ ...cardSolid, flex: 1, minWidth: 240 }}>
          <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 8 }}>Default</Text>
          <Text style={{ ...DISPLAY, fontSize: 32, letterSpacing: -0.6, color: DS.ink[900] }}>248</Text>
          <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>Aktif sipariş</Text>
        </View>
        <View style={{ ...cardFlat, flex: 1, minWidth: 240 }}>
          <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 8 }}>Flat</Text>
          <Text style={{ ...DISPLAY, fontSize: 32, letterSpacing: -0.6, color: DS.ink[900] }}>56</Text>
          <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>Hasta</Text>
        </View>
        <View style={{ ...cardDark, flex: 1, minWidth: 240 }}>
          <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 0.7, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Dark</Text>
          <Text style={{ ...DISPLAY, fontSize: 32, letterSpacing: -0.6, color: '#FFF' }}>2.840</Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>Toplam vaka</Text>
        </View>
      </View>

      {/* ═════ 05.5 — FORM ELEMANLARI ═════ */}
      <SecHeader eyebrow="05 · Form Elemanları" title="Net, sade, dokunmaya davet" desc="Pill yerine yumuşak köşeli (14px) input'lar. Label üstte, hint altta. Hata için kırmızı border + mesaj." />

      <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 40, marginBottom: 80, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>

        {/* 2-kolon form */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginBottom: 32 }}>
          <View style={{ flex: 1, minWidth: 280, gap: 18 }}>
            <FormInput label="Hasta Adı" placeholder="Mehmet Yılmaz" />
            <FormInput label="Telefon" placeholder="+90 555 123 45 67" hint="WhatsApp'tan ulaşılabilir" />
            <FormInput label="E-posta" placeholder="ornek@klinik.com" error="Geçersiz e-posta formatı" />
            <FormInput label="Vergi No (VKN)" placeholder="10 hane" />
          </View>
          <View style={{ flex: 1, minWidth: 280, gap: 18 }}>
            <FormSelect label="Vaka Tipi" value="Zirkonya köprü" />
            <FormSelect label="Renk Skalası" value="A2 — Vita Classic" />
            <FormInput label="Teslim Tarihi" placeholder="GG/AA/YYYY" />
            <FormTextarea label="Notlar" placeholder="Hekimden gelen özel istekler..." />
          </View>
        </View>

        {/* Checkbox + Toggle + Radio */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 32, paddingTop: 24, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
          <View style={{ gap: 12, flex: 1, minWidth: 240 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500] }}>Checkbox</Text>
            <FormCheckbox checked label="E-fatura kes" />
            <FormCheckbox checked={false} label="WhatsApp bildirimi" />
            <FormCheckbox checked={false} label="Tekrarlayan vaka" />
          </View>
          <View style={{ gap: 12, flex: 1, minWidth: 240 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500] }}>Toggle</Text>
            <FormToggle on label="Üretim önceliği" />
            <FormToggle on={false} label="Manuel onay gerekli" />
            <FormToggle on label="Hekim portali görsün" />
          </View>
          <View style={{ gap: 12, flex: 1, minWidth: 240 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500] }}>Radio</Text>
            <FormRadio selected label="Üst çene" />
            <FormRadio selected={false} label="Alt çene" />
            <FormRadio selected={false} label="Her ikisi" />
          </View>
        </View>

        {/* Form footer — actions */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, paddingTop: 32, marginTop: 32, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
          <PillButton variant="ghost">İptal</PillButton>
          <PillButton variant="light">Taslak Kaydet</PillButton>
          <PillButton variant="dark">Vakayı Oluştur</PillButton>
        </View>
      </View>

      {/* ═════ 06 — LİNEER İLERLEME (eski yüzde halkaları kaldırıldı, yenisi 11.7'de) ═════ */}
      <SecHeader eyebrow="06 · Lineer İlerleme" title="Modern bar — gradient + knob + glow" desc="Her panel kendi accent rengiyle. Yüzde halkaları için bkz. bölüm 11.7." />

      {/* Modern lineer ilerleme — 3 panel için ayrı kartlar */}
      {(['lab', 'clinic', 'exec'] as DsTheme[]).map((th) => {
        const t = dsTheme(th);
        const items: { label: string; value: number; trend?: string }[] =
          th === 'lab' ? [
            { label: 'Üretim hattı',    value: 72, trend: '+12% bu hafta'  },
            { label: 'Stok seviyesi',   value: 86, trend: '4 ürün kritik' },
            { label: 'Teslim hedefi',    value: 54, trend: '6/11 yapıldı'  },
          ]
          : th === 'clinic' ? [
            { label: 'Vaka kabul',       value: 64, trend: '+8 yeni'        },
            { label: 'Hekim doluluğu',   value: 92, trend: '11/12 dolu'     },
            { label: 'Hasta memnuniyeti',value: 88, trend: '+3 puan'        },
          ]
          : [
            { label: 'Aylık hedef',      value: 86, trend: '+₺48K'          },
            { label: 'Bütçe kullanımı',  value: 38, trend: '₺52K kaldı'     },
            { label: 'Tahsilat',          value: 72, trend: '14 vade geçen' },
          ];

        return (
          <View key={`bar-${th}`} style={{ backgroundColor: t.bgSoft, borderRadius: 24, padding: 32, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28 }}>
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: t.primary }} />
              <View style={{ flex: 1 }}>
                <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>{t.name} · İlerleme</Text>
                <Text style={{ fontSize: 11, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 }}>
                  Modern bar — gradient + knob + glow
                </Text>
              </View>
            </View>
            <View style={{ gap: 22 }}>
              {items.map((p, i) => (
                <LinearProgress key={i} value={p.value} label={p.label} trend={p.trend} theme={th} />
              ))}
            </View>
          </View>
        );
      })}

      {/* Mini variants (kompakt + segmented) */}
      <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 32, marginBottom: 80, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', gap: 28 }}>
        <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Variantlar</Text>

        {/* Compact (label inline) */}
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500] }}>Kompakt</Text>
          <LinearProgress value={72} label="Tamamlandı" theme="lab" compact />
          <LinearProgress value={54} label="Tamamlandı" theme="clinic" compact />
          <LinearProgress value={86} label="Tamamlandı" theme="exec" compact />
        </View>

        {/* Stacked segmented (multi-status) */}
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[800] }}>Vaka durumu — bu hafta</Text>
            <Text style={{ fontSize: 12, color: DS.ink[500] }}>42 toplam</Text>
          </View>
          <View style={{ height: 12, borderRadius: 999, overflow: 'hidden', flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.05)' }}>
            <View style={{ width: '40%', backgroundColor: DS.lab.primary }} />
            <View style={{ width: '25%', backgroundColor: DS.clinic.primary, marginLeft: 2 }} />
            <View style={{ width: '15%', backgroundColor: DS.exec.primary, marginLeft: 2 }} />
            <View style={{ width: '8%', backgroundColor: DS.ink[900], marginLeft: 2 }} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            {[
              { label: 'Üretim',      value: 17, color: DS.lab.primary },
              { label: 'Onay',         value: 11, color: DS.clinic.primary },
              { label: 'Teslimde',     value: 6,  color: DS.exec.primary },
              { label: 'Tamamlandı',   value: 4,  color: DS.ink[900] },
              { label: 'Bekleyen',     value: 4,  color: DS.ink[300] },
            ].map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }} />
                <Text style={{ fontSize: 11, color: DS.ink[700] }}>{s.label}</Text>
                <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[900] }}>{s.value}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* ═════ 07 — ARAMA ═════ */}
      <SecHeader eyebrow="07 · Arama" title="Hızlı bulma" desc="Pill köşeli, ikonlu, klavye odaklanma için yeterli kontrast." />

      <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 40, marginBottom: 80, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', gap: 16 }}>
        {/* Default search */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 18, backgroundColor: '#F5F5F5', borderRadius: 999, maxWidth: 480 }}>
          <Text style={{ fontSize: 16, color: DS.ink[400] }}>⌕</Text>
          <Text style={{ flex: 1, fontSize: 14, color: DS.ink[400] }}>Sipariş, hasta veya hekim ara...</Text>
          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200] }}>
            <Text style={{ fontSize: 10, color: DS.ink[500], fontFamily: 'monospace' }}>⌘K</Text>
          </View>
        </View>

        {/* Active state — with chip results */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 18, backgroundColor: '#FFF', borderRadius: 999, maxWidth: 480, borderWidth: 1, borderColor: DS.ink[900] }}>
          <Text style={{ fontSize: 16, color: DS.ink[900] }}>⌕</Text>
          <Text style={{ flex: 1, fontSize: 14, color: DS.ink[900] }}>mehmet</Text>
          <Pressable><Text style={{ fontSize: 18, color: DS.ink[400] }}>×</Text></Pressable>
        </View>

        {/* Filter chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[500], letterSpacing: 0.7, textTransform: 'uppercase', alignSelf: 'center', marginRight: 4 }}>Filtrele:</Text>
          <Chip tone="neutral">Tüm vakalar</Chip>
          <Chip tone="primary">Bu hafta</Chip>
          <Chip tone="warning" dot>Üretimde</Chip>
          <Chip tone="danger" dot>Geciken</Chip>
        </View>
      </View>

      {/* ═════ 08 — ONAY DIALOG ═════ */}
      <SecHeader eyebrow="08 · Onay & Uyarılar" title="Geri dönülemez aksiyonlar için" desc="3 ton: nötr (info), tehlikeli (destructive), başarılı (success)." />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 80 }}>
        {/* Destructive */}
        <View style={{ flex: 1, minWidth: 320, backgroundColor: '#FFF', borderRadius: 24, padding: 28, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(217,75,75,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 22, color: '#9C2E2E' }}>!</Text>
          </View>
          <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900], marginBottom: 8 }}>Vakayı sil</Text>
          <Text style={{ fontSize: 13, color: DS.ink[500], lineHeight: 20, marginBottom: 20 }}>
            <Text style={{ fontWeight: '500', color: DS.ink[900] }}>#DL-2842 · Mehmet Yılmaz</Text> kalıcı olarak silinecek. Bu işlem geri alınamaz.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
            <PillButton variant="ghost" size="sm">Vazgeç</PillButton>
            <PillButton variant="dark" size="sm">Evet, sil</PillButton>
          </View>
        </View>

        {/* Success */}
        <View style={{ flex: 1, minWidth: 320, backgroundColor: '#FFF', borderRadius: 24, padding: 28, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(45,154,107,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 22, color: '#1F6B47' }}>✓</Text>
          </View>
          <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900], marginBottom: 8 }}>Sipariş tamamlandı</Text>
          <Text style={{ fontSize: 13, color: DS.ink[500], lineHeight: 20, marginBottom: 20 }}>
            Vaka teslimat aşamasına geçti. Hekim portali otomatik bilgilendirildi.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
            <PillButton variant="dark" size="sm">Tamam</PillButton>
          </View>
        </View>

        {/* Toast */}
        <View style={{ flex: 1, minWidth: 320, backgroundColor: DS.ink[900], borderRadius: 24, padding: 20, alignSelf: 'flex-start' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: DS.lab.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: DS.ink[900], fontWeight: '700' }}>✓</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#FFF' }}>Kaydedildi</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Otomatik kapanır · 3sn</Text>
            </View>
            <Pressable><Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>×</Text></Pressable>
          </View>
        </View>
      </View>

      {/* ═════ 09 — TABLOLAR ═════ */}
      <SecHeader eyebrow="09 · Tablolar" title="Yoğun veri, sıkı tipografi" desc="Zebra yok — sadece hover satırı. Tablo başlıkları büyük UPPERCASE, hücre 13px Inter." />

      <View style={{ backgroundColor: '#FFF', borderRadius: 24, marginBottom: 80, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {/* Toolbar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
          <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Bu hafta · 18 vaka</Text>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: DS.ink[200] }}>
            <Text style={{ fontSize: 12, color: DS.ink[800] }}>↓ Filtrele</Text>
          </View>
          <PillButton variant="dark" size="sm">+ Yeni vaka</PillButton>
        </View>

        {/* Header */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
          {[
            { label: 'NO',     flex: 1 },
            { label: 'HASTA',  flex: 2.5 },
            { label: 'VAKA',   flex: 2 },
            { label: 'HEKİM',  flex: 2 },
            { label: 'TESLİM', flex: 1.4 },
            { label: 'DURUM',  flex: 1.4 },
            { label: 'TUTAR',  flex: 1, align: 'right' as const },
          ].map((h, i) => (
            <Text key={i} style={{ flex: h.flex, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textAlign: h.align }}>
              {h.label}
            </Text>
          ))}
        </View>

        {/* Rows */}
        {[
          ['#DL-2842','Mehmet Yılmaz','Zirkonya köprü','Dr. A. Demir','12 Mar','warning','Üretimde','₺4.200'],
          ['#DL-2841','Ayşe Kaya','Lamine 6 üye','Dr. B. Şahin','11 Mar','success','Tamamlandı','₺7.800'],
          ['#DL-2840','Hakan Doğan','İmplant üst','Dr. A. Demir','10 Mar','danger','Geciken','₺12.500'],
          ['#DL-2839','Selin Aydın','Hareketli protez','Dr. C. Öz','14 Mar','info','Kontrol','₺3.600'],
          ['#DL-2838','Ali Polat','Geçici köprü','Dr. B. Şahin','09 Mar','success','Teslim edildi','₺2.100'],
        ].map((row, i) => (
          <View key={i} style={{
            flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14,
            borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.04)',
            alignItems: 'center',
          }}>
            <Text style={{ flex: 1, fontSize: 11, color: DS.ink[500], fontFamily: 'monospace' }}>{row[0]}</Text>
            <View style={{ flex: 2.5, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: DS.lab.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: DS.ink[900] }}>{(row[1] as string).split(' ').map(w => w[0]).join('').toUpperCase()}</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }}>{row[1]}</Text>
            </View>
            <Text style={{ flex: 2, fontSize: 13, color: DS.ink[800] }}>{row[2]}</Text>
            <Text style={{ flex: 2, fontSize: 13, color: DS.ink[500] }}>{row[3]}</Text>
            <Text style={{ flex: 1.4, fontSize: 13, color: DS.ink[800] }}>{row[4]}</Text>
            <View style={{ flex: 1.4 }}>
              <Chip tone={row[5] as any} dot>{row[6]}</Chip>
            </View>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: DS.ink[900], textAlign: 'right' }}>{row[7]}</Text>
          </View>
        ))}

        {/* Footer */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', backgroundColor: '#FAFAFA' }}>
          <Text style={{ fontSize: 11, color: DS.ink[500] }}>5 satır · 18 toplam</Text>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200], alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13 }}>‹</Text>
            </View>
            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: DS.ink[900], alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, color: '#FFF' }}>1</Text>
            </View>
            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200], alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12 }}>2</Text>
            </View>
            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200], alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12 }}>3</Text>
            </View>
            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200], alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13 }}>›</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ═════ 10 — HERO PATTERNLER ═════ */}
      <SecHeader eyebrow="10 · Hero Patternleri" title="Üç farklı sayfa açılışı" desc="Glassmorphism, full-bleed gradient ve dark inverted versiyonları." />

      <View style={{ gap: 20, marginBottom: 80 }}>
        {/* HERO 1 — Glassmorphism (lab tarzı) */}
        <View style={{ borderRadius: 28, overflow: 'hidden', backgroundColor: DS.lab.bg, padding: 32 }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 24, padding: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 24 }}>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 12 }}>Cuma · 1 Mayıs</Text>
                <Text style={{ ...DISPLAY, fontSize: 56, letterSpacing: -1.96, lineHeight: 56, color: DS.ink[900] }}>
                  Hoş geldin, <Text style={{ color: DS.ink[400] }}>Ali</Text>
                </Text>
                <Text style={{ fontSize: 14, color: DS.ink[500], marginTop: 12, maxWidth: 480 }}>
                  Bugün üretim hattında 18 vaka aktif. 3'ü teslim için hazır.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 32 }}>
                <BigStat value="248" label="Aktif" />
                <BigStat value="56"  label="Hasta" />
                <BigStat value="18"  label="Bugün" />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
              <PillButton variant="dark">+ Yeni vaka</PillButton>
              <PillButton variant="light">Üretim hattını gör</PillButton>
            </View>
          </View>
        </View>

        {/* HERO 2 — Full bleed gradient (yönetim tarzı) */}
        <View style={{ borderRadius: 28, padding: 48, backgroundColor: DS.exec.primary, position: 'relative', overflow: 'hidden' }}>
          <View style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.15)' }} />
          <View style={{ position: 'absolute', bottom: -60, left: -20, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(0,0,0,0.05)' }} />
          <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase', color: DS.ink[900], marginBottom: 14 }}>Mart · Yönetim Özeti</Text>
          <Text style={{ ...DISPLAY, fontSize: 64, letterSpacing: -2.24, lineHeight: 64, color: DS.ink[900] }}>
            Bu ay <Text style={{ color: '#FFFFFF' }}>+%18</Text>{'\n'}büyüme
          </Text>
          <Text style={{ fontSize: 15, color: DS.ink[800], marginTop: 16, maxWidth: 520, lineHeight: 22 }}>
            Klinikten gelen vaka sayısı geçen aya göre 18% arttı. Üretim kapasitesi %72'de.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
            <PillButton variant="dark">Detaylı rapor</PillButton>
          </View>
        </View>

        {/* HERO 3 — Dark inverted */}
        <View style={{ borderRadius: 28, padding: 48, backgroundColor: DS.ink[900], position: 'relative', overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 24 }}>
            <View style={{ maxWidth: 600 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: DS.lab.primary }} />
                <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>Canlı · 3 üretimde</Text>
              </View>
              <Text style={{ ...DISPLAY, fontSize: 64, letterSpacing: -2.24, lineHeight: 64, color: '#FFF' }}>
                Üretim hattı{'\n'}
                <Text style={{ color: DS.lab.primary }}>aktif</Text>
              </Text>
              <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginTop: 14, lineHeight: 22 }}>
                3 vaka şu an üretimde. Ortalama tamamlanma süresi 6.4 gün.
              </Text>
            </View>
            <View style={{ width: 160, height: 160, borderRadius: 80, borderWidth: 10, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              <View style={{ position: 'absolute', alignItems: 'center' }}>
                <Text style={{ ...DISPLAY, fontSize: 40, color: '#FFF', letterSpacing: -1.4 }}>72%</Text>
                <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>Kapasite</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* ═════ 11 — TABS ═════ */}
      <SecHeader eyebrow="11 · Sekmeler (Tabs)" title="3 farklı tab variant" desc="Pill (default), underline ve dolu segment kontrolü." />

      <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 40, marginBottom: 80, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', gap: 32 }}>

        {/* Variant 1 — Pill tabs (mevcut Lab dashboard'da) */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500] }}>Pill (varsayılan)</Text>
          <View style={{ flexDirection: 'row', gap: 2, padding: 4, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 999, alignSelf: 'flex-start' }}>
            {['Dashboard','Siparişler','Üretim','Stok','Hastalar','Faturalar','Ayarlar'].map((tab, i) => (
              <View key={tab} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: i === 0 ? DS.ink[900] : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: '500', color: i === 0 ? '#FFF' : DS.ink[700] }}>{tab}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Variant 2 — Underline tabs */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500] }}>Underline (sayfa içi navigasyon)</Text>
          <View style={{ flexDirection: 'row', gap: 32, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)' }}>
            {['Genel','Vaka detayı','Mali','Mesajlar','Geçmiş'].map((tab, i) => {
              const active = i === 1;
              return (
                <View key={tab} style={{ paddingVertical: 12, borderBottomWidth: active ? 2 : 0, borderBottomColor: DS.ink[900] }}>
                  <Text style={{ fontSize: 14, fontWeight: active ? '600' : '400', color: active ? DS.ink[900] : DS.ink[500], letterSpacing: -0.14 }}>{tab}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Variant 3 — Segmented control (filter / view mode) */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500] }}>Segmented (görünüm modu)</Text>
          <View style={{ flexDirection: 'row', borderRadius: 12, borderWidth: 1, borderColor: DS.ink[200], alignSelf: 'flex-start', overflow: 'hidden' }}>
            {[
              { label: 'Liste', icon: '☰' },
              { label: 'Kart',  icon: '▦' },
              { label: 'Grid',  icon: '▤' },
              { label: 'Takvim',icon: '▦' },
            ].map((v, i) => {
              const active = i === 0;
              return (
                <View key={v.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: active ? DS.ink[900] : '#FFF', borderRightWidth: i < 3 ? 1 : 0, borderRightColor: DS.ink[200] }}>
                  <Text style={{ fontSize: 12, color: active ? '#FFF' : DS.ink[700] }}>{v.icon}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '500', color: active ? '#FFF' : DS.ink[700] }}>{v.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Variant 4 — Vertical sidebar tabs */}
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500] }}>Dikey (settings sidebar)</Text>
          <View style={{ flexDirection: 'row', gap: 24 }}>
            <View style={{ width: 200, gap: 2 }}>
              {['Profil','Bildirimler','Güvenlik','Faturalama','Entegrasyonlar','Ekip','Tercihler'].map((tab, i) => {
                const active = i === 1;
                return (
                  <View key={tab} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: active ? 'rgba(0,0,0,0.05)' : 'transparent' }}>
                    {active && <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: DS.ink[900], marginLeft: -6, marginRight: 4 }} />}
                    <Text style={{ fontSize: 13, fontWeight: active ? '600' : '400', color: active ? DS.ink[900] : DS.ink[700] }}>{tab}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ flex: 1, padding: 24, backgroundColor: '#FAFAFA', borderRadius: 16 }}>
              <Text style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.5, color: DS.ink[900], marginBottom: 8 }}>Bildirimler</Text>
              <Text style={{ fontSize: 13, color: DS.ink[500], lineHeight: 19 }}>
                Hangi durumlarda bildirim alacağınızı seçin. E-posta, push ve in-app olarak ayarlanabilir.
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* ═════ 11.5 — STEPS TIMELINE ═════ */}
      <SecHeader eyebrow="11.5 · Steps Timeline" title="Aşamalı süreç adımları" desc="Tamamlanan ✓ + aktif (glow ring) + bekleyen (boş daire). Yatay çizgili." />

      <View style={{ gap: 16, marginBottom: 80 }}>
        {(['lab', 'clinic', 'exec'] as DsTheme[]).map(th => {
          const t = dsTheme(th);
          return (
            <View key={th} style={{
              borderRadius: 24, padding: 32,
              backgroundColor: t.surfaceAlt,
              // @ts-ignore web gradient
              backgroundImage: `linear-gradient(135deg, ${t.surfaceAlt} 0%, ${t.primaryDeep}33 100%)`,
            }}>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600', marginBottom: 24 }}>
                {t.name} · İlerleme
              </Text>
              <StepsTimeline
                steps={['Alındı', 'Üretim', 'Final QC', 'Hazır']}
                current={1}
                theme={th}
              />
            </View>
          );
        })}
      </View>

      {/* ═════ 11.7 — PERCENTAGE HERO (dark bg variant) ═════ */}
      <SecHeader eyebrow="11.7 · Yüzde Hero" title="Koyu zemin + büyük halka" desc="Dashboard hero blokları için — soluk track + parlak gradient ring + büyük beyaz knob." />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 80 }}>
        {([
          { theme: 'lab',    value: 40 },
          { theme: 'clinic', value: 65 },
          { theme: 'exec',   value: 82 },
        ] as const).map((r, i) => {
          const t = dsTheme(r.theme as DsTheme);
          return (
            <View key={i} style={{
              flex: 1, minWidth: 280, height: 280,
              borderRadius: 24, padding: 32,
              backgroundColor: t.surfaceAlt,
              // @ts-ignore web gradient — koyu accent + biraz primary tint
              backgroundImage: `linear-gradient(135deg, ${t.surfaceAlt} 0%, ${t.primaryDeep}55 100%)`,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <PercentRingHero value={r.value} size={220} theme={r.theme as DsTheme} />
            </View>
          );
        })}
      </View>

      {/* ═════ 11.8 — YÜZDE KULLANIM SENARYOLARI ═════ */}
      <SecHeader eyebrow="11.8 · Kullanım Senaryoları" title="Yüzde halkasının farklı yerleri" desc="KPI bloğu (yatay), inline mini stat, comparison kartı, mini avatar yanında — şekil korunur, boyut/yerleşim değişir." />

      {/* Senaryo 1: KPI yatay kart (icon + değer + ring) */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        {([
          { theme: 'lab',    value: 72, label: 'Üretim hattı',     desc: 'Kapasite kullanımı' },
          { theme: 'clinic', value: 88, label: 'Hekim doluluğu',    desc: '11/12 hekim' },
          { theme: 'exec',   value: 38, label: 'Bütçe kullanımı',   desc: '₺18K / ₺48K' },
        ] as const).map((r, i) => {
          const t = dsTheme(r.theme as DsTheme);
          return (
            <View key={i} style={{
              flex: 1, minWidth: 320, padding: 24, borderRadius: 24,
              backgroundColor: t.surfaceAlt,
              flexDirection: 'row', alignItems: 'center', gap: 20,
            }}>
              <PercentRingHero value={r.value} size={120} theme={r.theme as DsTheme} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600' }}>
                  {r.label}
                </Text>
                <Text style={{ ...DISPLAY, fontSize: 22, color: '#FFF', letterSpacing: -0.5, marginTop: 6 }}>{r.desc}</Text>
                <View style={{ marginTop: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: t.primary + '22', alignSelf: 'flex-start' }}>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: t.primary }}>↑ +%4 bu hafta</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* Senaryo 2: Inline mini ring (text yanında) */}
      <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 32, marginBottom: 24 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 20 }}>
          Inline mini ring — liste satırlarında
        </Text>
        <View style={{ gap: 14 }}>
          {[
            { name: 'Mehmet Yılmaz',  job: 'Zirkonya köprü · #DL-2842', value: 72, theme: 'lab' as DsTheme },
            { name: 'Ayşe Kaya',       job: 'Lamine 6 üye · #DL-2841',   value: 100, theme: 'clinic' as DsTheme },
            { name: 'Hakan Doğan',     job: 'İmplant üst · #DL-2840',     value: 28, theme: 'exec' as DsTheme },
          ].map((row, i) => {
            const t = dsTheme(row.theme);
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 8 }}>
                <View style={{ padding: 6, borderRadius: 14, backgroundColor: t.surfaceAlt }}>
                  <PercentRingHero value={row.value} size={56} theme={row.theme} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[900] }}>{row.name}</Text>
                  <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }}>{row.job}</Text>
                </View>
                <Text style={{ fontSize: 11, color: DS.ink[400], textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  {row.value === 100 ? '✓ tamamlandı' : `${row.value}% ilerleme`}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Senaryo 3: Comparison kartı (3 ring yan yana, beyaz arkaplan) */}
      <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 32, marginBottom: 80 }}>
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500] }}>Comparison kartı</Text>
          <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5, marginTop: 4 }}>
            Bu ayın panel performansı
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, justifyContent: 'space-around' }}>
          {([
            { theme: 'lab',    value: 72, label: 'Lab' },
            { theme: 'clinic', value: 88, label: 'Klinik' },
            { theme: 'exec',   value: 38, label: 'Yönetim' },
          ] as const).map((r, i) => {
            const t = dsTheme(r.theme as DsTheme);
            return (
              <View key={i} style={{ alignItems: 'center', gap: 12 }}>
                <View style={{ padding: 8, borderRadius: 20, backgroundColor: t.surfaceAlt }}>
                  <PercentRingHero value={r.value} size={140} theme={r.theme as DsTheme} />
                </View>
                <Text style={{ fontSize: 11, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '600' }}>
                  {r.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* ═════ 12 — SİPARİŞ DETAY PATTERNLERİ ═════ */}
      <SecHeader eyebrow="12 · Sipariş Detay" title="Hasta vakası kartları" desc="V2 handoff'tan: stage hero (sarı gradient), aktif istasyon, materyal grid, mali özet (dark)." />

      {/* Stage Hero — sarı gradient + büyük rakam + progress + steps */}
      <View style={{ borderRadius: 28, padding: 32, marginBottom: 24, position: 'relative', overflow: 'hidden', backgroundColor: '#FFF6D9' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
          <View>
            <Text style={{ fontSize: 11, color: '#6B5A1F', letterSpacing: 1.32, textTransform: 'uppercase', fontWeight: '600', marginBottom: 8 }}>Hasta · 5 diş çalışması</Text>
            <Text style={{ ...DISPLAY, fontSize: 54, letterSpacing: -2.16, lineHeight: 51, color: DS.ink[900] }}>Kaan Esen</Text>
            <Text style={{ fontSize: 13, color: '#3C3C3C', marginTop: 8 }}>Dr. Ahmet Kartal · Merkez Diş Kliniği</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 11, color: '#6B5A1F', letterSpacing: 1.32, textTransform: 'uppercase', fontWeight: '600' }}>Kalan</Text>
            <Text style={{ ...DISPLAY, fontSize: 48, letterSpacing: -1.92, lineHeight: 48, marginTop: 6, color: DS.ink[900] }}>3<Text style={{ fontSize: 18 }}> gün</Text></Text>
            <Text style={{ fontSize: 12, color: '#3C3C3C', marginTop: 4 }}>Teslim 01.05.2026</Text>
          </View>
        </View>
        <View style={{ backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 999, padding: 6 }}>
          <View style={{ height: 8, backgroundColor: DS.ink[900], borderRadius: 999, width: '40%', position: 'relative' }}>
            <View style={{ position: 'absolute', right: -10, top: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: DS.ink[900], borderWidth: 4, borderColor: DS.lab.primary }} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
          {['Alındı', 'Üretim', 'Final QC', 'Hazır', 'Teslim'].map((s, i) => (
            <Text key={i} style={{
              fontSize: 11,
              color: i <= 1 ? DS.ink[900] : '#6B5A1F',
              fontWeight: i === 1 ? '600' : '400',
              opacity: i > 1 ? 0.5 : 1,
            }}>{s}</Text>
          ))}
        </View>
      </View>

      {/* Aktif istasyon kartı */}
      <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 24, marginBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: DS.ink[900], alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 26, color: DS.lab.primary }}>⚗</Text>
        </View>
        <View style={{ flex: 1, minWidth: 200 }}>
          <Text style={{ fontSize: 11, color: '#9A9A9A', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600' }}>Şu an</Text>
          <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, marginTop: 2, color: DS.ink[900] }}>3D Baskı istasyonu</Text>
          <Text style={{ fontSize: 12, color: '#9C5E0E', marginTop: 4, fontWeight: '500' }}>● 2 saat 10 dakika gecikti · 38% tamamlandı</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, paddingLeft: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: DS.lab.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[900] }}>Nİ</Text>
          </View>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }}>Navid İ.</Text>
            <Text style={{ fontSize: 10, color: '#6B6B6B' }}>Sorumlu</Text>
          </View>
        </View>
      </View>

      {/* Materyal hareketleri grid */}
      <View style={{ backgroundColor: '#FFF', borderRadius: 24, padding: 24, marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ fontSize: 11, color: '#9A9A9A', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600' }}>Materyal hareketleri</Text>
          <View style={{ flex: 1 }} />
          <PillButton variant="light" size="sm">+ Stok düş</PillButton>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[
            { name: 'NextDent C&B', amt: '12.4 g', cost: '₺ 10.54', stage: '3D Baskı' },
            { name: 'Ortho IBT',     amt: '3.8 g',  cost: '₺ 4.56',  stage: '3D Baskı' },
            { name: 'Etil alkol',    amt: '50 ml',  cost: '₺ 2.00',  stage: '3D Baskı' },
          ].map((m, i) => (
            <View key={i} style={{ flex: 1, minWidth: 200, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FBFAF6', borderRadius: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }}>{m.name}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ fontSize: 11, color: '#6B6B6B' }}>{m.amt}</Text>
                <Text style={{ fontSize: 11, color: DS.ink[900], fontWeight: '500' }}>{m.cost}</Text>
              </View>
              <Text style={{ fontSize: 10, color: '#9A9A9A', marginTop: 4 }}>{m.stage}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Aktivite feed + Mali bilgi (yan yana) */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 80 }}>
        <View style={{ flex: 1, minWidth: 320, backgroundColor: '#FFF', borderRadius: 24, padding: 20 }}>
          <Text style={{ fontSize: 11, color: '#9A9A9A', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600', marginBottom: 14 }}>Aktivite</Text>
          <View style={{ position: 'relative' }}>
            <View style={{ position: 'absolute', left: 13, top: 14, bottom: 14, width: 1.5, backgroundColor: 'rgba(0,0,0,0.06)' }} />
            {[
              { who: 'Navid İ.',  bg: DS.lab.primary, action: '3D Baskı başlattı',     time: '2sa önce' },
              { who: 'Ayşel K.',  bg: '#10B981',     action: 'Tasarım QC onayı',       time: '4sa önce' },
              { who: 'Mehmet A.', bg: '#3B82F6',     action: 'CAD tasarımını yükledi', time: '1g önce' },
            ].map((a, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12, paddingVertical: 10, position: 'relative', zIndex: 1 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: a.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#FFF', fontSize: 12 }}>•</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12 }}>
                    <Text style={{ fontWeight: '500', color: DS.ink[900] }}>{a.who}</Text>{' '}
                    <Text style={{ color: '#6B6B6B' }}>{a.action}</Text>
                  </Text>
                  <Text style={{ fontSize: 11, color: '#9A9A9A', marginTop: 2 }}>{a.time}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={{ flex: 1, minWidth: 280, backgroundColor: DS.ink[900], borderRadius: 24, padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600' }}>Mali Bilgi</Text>
            <View style={{ flex: 1 }} />
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(245,194,75,0.2)' }}>
              <Text style={{ fontSize: 10, color: DS.lab.primary, fontWeight: '500' }}>● Beklemede</Text>
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
              <Text style={{ fontSize: 12, color: DS.lab.primary }}>Net kâr</Text>
              <Text style={{ ...DISPLAY, fontSize: 28, letterSpacing: -0.84, color: DS.lab.primary }}>₺ 2.270</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ═════ 13 — MODAL PATTERNI ═════ */}
      <SecHeader eyebrow="13 · Modal" title="Header + body + footer · pill köşeli" desc="Kicker label + büyük başlık + alt açıklama. Backdrop blur arka plan." />

      <View style={{ marginBottom: 80, padding: 40, borderRadius: 24, backgroundColor: 'rgba(20,18,12,0.45)', alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: 560, backgroundColor: '#FFF', borderRadius: 24, overflow: 'hidden' }}>
          {/* Header */}
          <View style={{ padding: 28, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)', flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: '#9A9A9A', letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600', marginBottom: 6 }}>3D Baskı</Text>
              <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.55, lineHeight: 27, color: DS.ink[900] }}>Aşamayı tamamla</Text>
              <Text style={{ fontSize: 13, color: '#6B6B6B', marginTop: 6 }}>Kaan Esen · LAB-2026-0033 · 5 diş</Text>
            </View>
            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14, color: '#3C3C3C' }}>×</Text>
            </View>
          </View>

          {/* Body */}
          <View style={{ padding: 28, gap: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: '#FBFAF6', borderRadius: 16 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: DS.ink[900], alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 18, color: DS.lab.primary }}>⚗</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#9A9A9A', letterSpacing: 0.9, textTransform: 'uppercase', fontWeight: '600' }}>Şu an</Text>
                <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[900], marginTop: 2 }}>3D Baskı</Text>
              </View>
              <Text style={{ fontSize: 18, color: '#9A9A9A' }}>→</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: '#9A9A9A', letterSpacing: 0.9, textTransform: 'uppercase', fontWeight: '600' }}>Sonraki</Text>
                <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[900], marginTop: 2 }}>Tasarım QC</Text>
              </View>
            </View>

            {/* Field grup */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#3C3C3C' }}>QC Sonucu</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { label: '✓ Geçti',  active: true,  color: '#10B981' },
                  { label: '! Revize', active: false, color: '#F59E0B' },
                  { label: '✗ Red',    active: false, color: '#9C2E2E' },
                ].map((opt, i) => (
                  <View key={i} style={{
                    flex: 1, paddingVertical: 10, borderRadius: 12,
                    backgroundColor: opt.active ? opt.color + '15' : 'transparent',
                    borderWidth: 1, borderColor: opt.active ? opt.color : 'rgba(0,0,0,0.1)',
                    alignItems: 'center',
                  }}>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: opt.active ? opt.color : DS.ink[700] }}>{opt.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Note field */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#3C3C3C' }}>Not (opsiyonel)</Text>
              <View style={{ minHeight: 80, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' }}>
                <Text style={{ fontSize: 13, color: '#9A9A9A' }}>Bir sonraki ekibe iletilecek not...</Text>
              </View>
            </View>
          </View>

          {/* Footer */}
          <View style={{ padding: 16, paddingHorizontal: 28, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', backgroundColor: '#FBFAF6', flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <PillButton variant="ghost" size="sm">Vazgeç</PillButton>
            <PillButton variant="dark" size="sm">✓ Onayla & geç</PillButton>
          </View>
        </View>
      </View>

      {/* ═════ 14 — REFERANS LİNKLER ═════ */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', paddingTop: 32, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)' }}>
        <Text style={{ fontSize: 12, color: DS.ink[500] }}>Canlı önizlemeler:</Text>
        <PillButton variant="light" size="sm">/dev/ds-lab</PillButton>
        <PillButton variant="light" size="sm">/dev/order-detail</PillButton>
        <PillButton variant="light" size="sm">/(lab)/dashboard</PillButton>
      </View>

      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function SecHeader({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <View style={{ marginBottom: 24, gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: '500', letterSpacing: 1.4, textTransform: 'uppercase', color: DS.ink[500] }}>{eyebrow}</Text>
      <Text style={{ ...DISPLAY, fontSize: 36, letterSpacing: -0.9, color: DS.ink[900], lineHeight: 38 }}>{title}</Text>
      {desc && <Text style={{ fontSize: 14, color: DS.ink[500], maxWidth: 560, lineHeight: 21 }}>{desc}</Text>}
    </View>
  );
}

function PillButton({ children, variant = 'dark', size = 'md' }: { children: React.ReactNode; variant?: 'dark' | 'light' | 'primary' | 'ghost'; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { paddingHorizontal: 12, paddingVertical: 6, fontSize: 12 },
    md: { paddingHorizontal: 20, paddingVertical: 10, fontSize: 13 },
    lg: { paddingHorizontal: 28, paddingVertical: 14, fontSize: 14 },
  };
  const variants = {
    dark:    { backgroundColor: DS.ink[900], color: '#FFF', borderWidth: 1, borderColor: DS.ink[900] },
    primary: { backgroundColor: DS.lab.primary, color: DS.ink[900], borderWidth: 1, borderColor: DS.lab.primary },
    light:   { backgroundColor: '#FFF', color: DS.ink[900], borderWidth: 1, borderColor: DS.ink[300] },
    ghost:   { backgroundColor: 'transparent', color: DS.ink[900], borderWidth: 1, borderColor: 'transparent' },
  };
  const v = variants[variant];
  const sz = sizes[size];
  return (
    <Pressable style={{
      paddingHorizontal: sz.paddingHorizontal, paddingVertical: sz.paddingVertical,
      backgroundColor: v.backgroundColor, borderRadius: 999,
      borderWidth: v.borderWidth, borderColor: v.borderColor,
      alignSelf: 'flex-start',
    }}>
      <Text style={{ fontSize: sz.fontSize, fontWeight: '500', color: v.color, letterSpacing: -0.13 }}>{children}</Text>
    </Pressable>
  );
}

function Chip({ children, tone, dot }: { children: React.ReactNode; tone: string; dot?: boolean }) {
  const tones: Record<string, { bg: string; fg: string; border?: string }> = {
    neutral: { bg: 'rgba(0,0,0,0.05)', fg: DS.ink[800] },
    primary: { bg: DS.lab.primary,    fg: DS.ink[900] },
    accent:  { bg: DS.ink[900],       fg: '#FFF' },
    success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
    warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
    danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
    info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
    outline: { bg: 'transparent', fg: DS.ink[800], border: DS.ink[300] },
  };
  const t = tones[tone];
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
      backgroundColor: t.bg, borderWidth: t.border ? 1 : 0, borderColor: t.border,
    }}>
      {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.fg, opacity: 0.8 }} />}
      <Text style={{ fontSize: 12, fontWeight: '500', color: t.fg }}>{children}</Text>
    </View>
  );
}

function StatusChip({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: bg }}>
      <Text style={{ fontSize: 10, fontWeight: '500', color }}>● {label}</Text>
    </View>
  );
}

function TypeRow({ label, sample, size, sansSerif, noBorder, variant }: {
  label: string; sample: React.ReactNode; size?: number; sansSerif?: boolean; noBorder?: boolean; variant?: 'display';
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 32, paddingVertical: 24, borderBottomWidth: noBorder ? 0 : 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
      <View style={{ width: 180 }}>
        <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500] }}>{label}</Text>
        <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 4 }}>
          {sansSerif ? 'Inter Tight · Regular' : 'Instrument Serif · Light'}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 240 }}>
        <Text style={{
          ...(sansSerif ? {} : DISPLAY),
          fontSize: variant === 'display' ? 88 : (size ?? 24),
          letterSpacing: -1.0, lineHeight: variant === 'display' ? 84 : (size ?? 24) * 1.05,
          color: DS.ink[900],
        }}>
          {sample}
        </Text>
      </View>
    </View>
  );
}

// ─── Form bileşenleri (sade, NativeWind sansSerif) ───────────────────────────
// ─── Pulse Ring — animasyonlu büyüyen dış halka ────────────────────────────
function PulseRing({ color, size }: { color: string; size: number }) {
  const { scale, opacity } = usePulse({ duration: 1600 });
  return (
    <Animated.View style={{
      position: 'absolute',
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
      transform: [{ scale }],
      opacity,
    }} />
  );
}

// ─── Pulse Dot — knob için animasyonlu büyüyen halo ────────────────────────
function PulseDot({ color, size, x, y }: { color: string; size: number; x: number; y: number }) {
  const { scale, opacity } = usePulse({ duration: 1400 });
  return (
    <Animated.View style={{
      position: 'absolute',
      left: x - size / 2, top: y - size / 2,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color,
      transform: [{ scale }],
      opacity,
    }} pointerEvents="none" />
  );
}

// ─── Pulse animasyon hook (loop scale + opacity) ────────────────────────────
function usePulse({ duration = 1600 }: { duration?: number } = {}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, duration]);
  // scale: 1 → 1.25, opacity: 0.18 → 0
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });
  return { scale, opacity };
}

// ─── Steps Timeline — yatay süreç adımları (panel temasıyla) ─────────────────
function StepsTimeline({
  steps, current, theme = 'lab',
}: {
  steps: string[]; current: number; theme?: DsTheme;
}) {
  const t = dsTheme(theme);
  const accent = t.primary;
  const lineActive = t.primary;
  const lineRest = 'rgba(255,255,255,0.15)';
  const labelActive = '#FFFFFF';
  const labelRest = 'rgba(255,255,255,0.45)';

  // Aktif node halo dahil dış çapı 56, normal node 40 — her iki taraftan boşluk bırak
  const NODE = 40;
  const HALO = 56;
  const GAP  = 8; // node ile çizgi arasındaki boşluk

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {steps.map((step, i) => {
        const isPast    = i < current;
        const isCurrent = i === current;
        const isFuture  = i > current;
        const isLast    = i === steps.length - 1;
        const nodeW = isCurrent ? HALO : NODE;

        return (
          <React.Fragment key={i}>
            {/* Node + label kolonu — sabit genişlik (halo'lu node 56px) */}
            <View style={{ alignItems: 'center', width: nodeW }}>
              {/* Active node + pulse halo */}
              {isCurrent && (
                <View style={{ width: HALO, height: HALO, alignItems: 'center', justifyContent: 'center' }}>
                  <PulseRing color={accent} size={HALO} />
                  {/* Static outer ring (always visible) */}
                  <View style={{
                    position: 'absolute',
                    width: HALO, height: HALO, borderRadius: HALO / 2,
                    backgroundColor: accent, opacity: 0.18,
                  }} />
                  {/* Node (active) — solid */}
                  <View style={{
                    width: NODE, height: NODE, borderRadius: NODE / 2,
                    backgroundColor: accent,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.accent }} />
                  </View>
                </View>
              )}

              {/* Node (past) */}
              {isPast && (
                <View style={{
                  width: NODE, height: NODE, borderRadius: NODE / 2,
                  backgroundColor: accent, marginTop: (HALO - NODE) / 2,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: t.accent }}>✓</Text>
                </View>
              )}

              {/* Node (future) */}
              {isFuture && (
                <View style={{
                  width: NODE, height: NODE, borderRadius: NODE / 2,
                  borderWidth: 2, borderColor: lineRest, marginTop: (HALO - NODE) / 2,
                }} />
              )}

              {/* Label */}
              <Text style={{
                fontSize: 14, fontWeight: '500',
                color: isPast ? labelActive : isCurrent ? accent : labelRest,
                marginTop: 16,
              }}>
                {step}
              </Text>
            </View>

            {/* Çizgi — node'lar arasında boşlukla */}
            {!isLast && (
              <View style={{
                flex: 1, height: 2,
                backgroundColor: i < current ? lineActive : lineRest,
                marginTop: HALO / 2 - 1,    // ortalama: halo'nun dikey ortası
                marginHorizontal: GAP,       // node ile çizgi arasında boşluk
              }} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── Hero PercentRing — dark wrap + büyük halka (referans görsele yakın) ────
function PercentRingHero({
  value, size = 200, theme = 'lab',
}: { value: number; size?: number; theme?: DsTheme }) {
  const stroke = Math.max(12, size / 16);
  const r = (size - stroke - 8) / 2;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  const t = dsTheme(theme);

  const lightColor = t.primary;
  const deepColor  = t.primaryDeep;
  const id = `pr-hero-${theme}-${value}`;

  // Knob pozisyonu
  const angleDeg = (value / 100) * 360 - 90;
  const angleRad = (angleDeg * Math.PI) / 180;
  const knobX = size / 2 + r * Math.cos(angleRad);
  const knobY = size / 2 + r * Math.sin(angleRad);
  const knobR = stroke * 0.85;

  // Track — accent zemin üzerinde soluk panel rengi
  const trackColor = lightColor + '33'; // %20 opacity

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%"   stopColor={lightColor} stopOpacity="0.95" />
            <Stop offset="100%" stopColor={deepColor}  stopOpacity="1" />
          </LinearGradient>
        </Defs>

        {/* Track */}
        <Circle cx={size / 2} cy={size / 2} r={r}
                stroke={trackColor} strokeWidth={stroke} fill="none" />

        {/* Progress arc */}
        {value > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={r}
                  stroke={`url(#${id})`} strokeWidth={stroke} fill="none"
                  strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}

        {/* Static glow halo arkasında */}
        {value > 0 && value < 100 && (
          <Circle cx={knobX} cy={knobY} r={knobR + 6}
                  fill="#FFFFFF" fillOpacity={0.18} />
        )}

        {/* Beyaz knob — solid */}
        {value > 0 && value < 100 && (
          <Circle cx={knobX} cy={knobY} r={knobR}
                  fill="#FFFFFF" />
        )}
      </Svg>

      {/* Animated pulse halo — knob üzerinde, SVG dışında (RN Animated için) */}
      {value > 0 && value < 100 && (
        <PulseDot color="#FFFFFF" size={knobR * 2.6} x={knobX} y={knobY} />
      )}

      {/* Centered text — büyük rakam + küçük % */}
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{
            fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
            fontWeight: '700',
            fontSize: size * 0.28,
            color: '#FFFFFF',
            letterSpacing: -2,
            lineHeight: size * 0.28,
          }}>
            {value}
          </Text>
          <Text style={{
            fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
            fontWeight: '500',
            fontSize: size * 0.13,
            color: lightColor,
            marginLeft: 4,
            lineHeight: size * 0.13,
          }}>
            %
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Modern lineer ilerleme — gradient + knob + glow ───────────────────────
function LinearProgress({
  value, label, trend, theme = 'lab', compact = false,
}: {
  value: number; label: string; trend?: string; theme?: DsTheme; compact?: boolean;
}) {
  const t = dsTheme(theme);
  const lightColor = t.primary;
  const deepColor  = t.primaryDeep;
  const trackColor = theme === 'lab'    ? 'rgba(245,194,75,0.18)'
                   : theme === 'clinic' ? 'rgba(107,168,136,0.20)'
                   : 'rgba(233,119,87,0.18)';

  const barH = compact ? 8 : 14;
  const knobSize = compact ? 14 : 20;

  return (
    <View style={{ gap: 8 }}>
      {/* Label row */}
      {!compact && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }}>{label}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            {trend && <Text style={{ fontSize: 11, color: DS.ink[500] }}>{trend}</Text>}
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, color: DS.ink[900] }}>
              {value}<Text style={{ fontSize: 12, color: DS.ink[400] }}>%</Text>
            </Text>
          </View>
        </View>
      )}

      {/* Bar wrapper */}
      <View style={{ height: barH + 12, justifyContent: 'center', position: 'relative' }}>
        {/* Track */}
        <View style={{
          height: barH,
          backgroundColor: trackColor,
          borderRadius: 999,
        }} />

        {/* Filled segment — gradient (web boxShadow ile soft glow) */}
        <View style={{
          position: 'absolute', top: 6, left: 0,
          height: barH,
          width: `${value}%`,
          borderRadius: 999,
          backgroundColor: deepColor,
          // @ts-ignore web — linear-gradient gerçek dolum + glow
          backgroundImage: `linear-gradient(90deg, ${lightColor} 0%, ${deepColor} 100%)`,
          boxShadow: `0 4px 12px ${lightColor}66, 0 0 0 1px ${lightColor}44 inset`,
        }} />

        {/* Beyaz knob — bar ucu */}
        {value > 0 && value < 100 && (
          <View style={{
            position: 'absolute',
            left: `${value}%`,
            top: '50%',
            width: knobSize, height: knobSize,
            marginLeft: -knobSize / 2,
            marginTop: -knobSize / 2,
            borderRadius: knobSize / 2,
            backgroundColor: '#FFFFFF',
            borderWidth: 1.5,
            borderColor: deepColor,
            alignItems: 'center', justifyContent: 'center',
            // @ts-ignore web glow
            boxShadow: `0 2px 6px ${lightColor}88, 0 0 0 4px ${lightColor}22`,
          }}>
            <View style={{ width: knobSize / 3.5, height: knobSize / 3.5, borderRadius: knobSize / 7, backgroundColor: deepColor }} />
          </View>
        )}
      </View>

      {/* Compact alt etiket */}
      {compact && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 11, color: DS.ink[500] }}>{label}</Text>
          <Text style={{ fontSize: 11, fontWeight: '500', color: DS.ink[900] }}>{value}%</Text>
        </View>
      )}
    </View>
  );
}

// ─── Modern yüzde halkası — glow halo + büyük knob + delta chip ─────────────
function PercentRing({
  value, size = 84, theme = 'lab', label, delta,
}: {
  value: number; size?: number; theme?: DsTheme;
  label?: string; delta?: { value: number; positive?: boolean };
}) {
  const stroke = Math.max(5, size / 14);  // ince modern halka
  const r = (size - stroke - 4) / 2;       // 4px glow için pay
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  const t = dsTheme(theme);

  const lightColor = t.primary;
  const deepColor  = t.primaryDeep;
  const id        = `pr-grad-${theme}-${size}-${value}`;
  const haloId    = `pr-halo-${theme}-${size}-${value}`;

  // Knob pozisyonu (saat 12'den başlar, saat yönünde)
  const angleDeg = (value / 100) * 360 - 90;
  const angleRad = (angleDeg * Math.PI) / 180;
  const knobX = size / 2 + r * Math.cos(angleRad);
  const knobY = size / 2 + r * Math.sin(angleRad);

  // Track — panel temasından hafif çok soluk
  const trackColor = theme === 'lab'    ? 'rgba(245,194,75,0.18)'
                   : theme === 'clinic' ? 'rgba(107,168,136,0.20)'
                   : 'rgba(233,119,87,0.18)';

  const knobR = Math.max(5, stroke * 0.85);
  const isLarge = size >= 140;
  const numFontSize = isLarge ? 36 : (size >= 100 ? 22 : 14);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%"   stopColor={lightColor} />
            <Stop offset="100%" stopColor={deepColor} />
          </LinearGradient>
          {/* Knob için soft halo gradient */}
          <LinearGradient id={haloId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%"   stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="100%" stopColor={lightColor} stopOpacity="0.3" />
          </LinearGradient>
        </Defs>

        {/* Track — soluk panel rengi */}
        <Circle cx={size / 2} cy={size / 2} r={r}
                stroke={trackColor} strokeWidth={stroke} fill="none" />

        {/* Progress arc */}
        {value > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={r}
                  stroke={`url(#${id})`} strokeWidth={stroke} fill="none"
                  strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        )}

        {/* Glow halo — knob arkasında soft daire */}
        {value > 0 && value < 100 && (
          <Circle cx={knobX} cy={knobY} r={knobR + 3}
                  fill={lightColor} fillOpacity={0.25} />
        )}

        {/* Beyaz knob — büyük + ince accent stroke */}
        {value > 0 && value < 100 && (
          <>
            <Circle cx={knobX} cy={knobY} r={knobR}
                    fill="#FFFFFF"
                    stroke={deepColor} strokeWidth={1.2} />
            {/* iç parlak nokta */}
            <Circle cx={knobX} cy={knobY} r={knobR / 3}
                    fill={deepColor} />
          </>
        )}

        {/* 100%'de tek bir dolu knob (geçiş yok) */}
        {value === 100 && (
          <Circle cx={size / 2} cy={size / 2 - r} r={knobR / 2}
                  fill={deepColor} />
        )}
      </Svg>

      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{
          ...DISPLAY,
          fontSize: numFontSize,
          color: DS.ink[900],
          letterSpacing: numFontSize > 30 ? -1.4 : -0.5,
          lineHeight: numFontSize,
        }}>
          {value}<Text style={{ fontSize: numFontSize * 0.55, color: DS.ink[400] }}>%</Text>
        </Text>
        {label && isLarge && (
          <Text style={{ fontSize: 10, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 6 }}>
            {label}
          </Text>
        )}
        {delta && isLarge && (
          <View style={{
            marginTop: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
            backgroundColor: delta.positive !== false ? 'rgba(45,154,107,0.12)' : 'rgba(217,75,75,0.12)',
          }}>
            <Text style={{
              fontSize: 10, fontWeight: '600',
              color: delta.positive !== false ? '#1F6B47' : '#9C2E2E',
            }}>
              {delta.positive !== false ? '↑' : '↓'} {Math.abs(delta.value)}%
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ ...DISPLAY, fontSize: 40, letterSpacing: -1.4, lineHeight: 40, color: DS.ink[900] }}>{value}</Text>
      <Text style={{ fontSize: 10, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

function FormInput({ label, placeholder, hint, error }: { label: string; placeholder: string; hint?: string; error?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[800] }}>{label}</Text>
      <View style={{
        height: 44, paddingHorizontal: 14, justifyContent: 'center',
        backgroundColor: '#FFF', borderRadius: 14,
        borderWidth: 1, borderColor: error ? '#D94B4B' : 'rgba(0,0,0,0.08)',
      }}>
        <Text style={{ fontSize: 14, color: '#9A9A9A' }}>{placeholder}</Text>
      </View>
      {hint && !error && <Text style={{ fontSize: 11, color: DS.ink[500] }}>{hint}</Text>}
      {error && <Text style={{ fontSize: 11, color: '#D94B4B' }}>{error}</Text>}
    </View>
  );
}

function FormSelect({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[800] }}>{label}</Text>
      <View style={{
        height: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FFF', borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
      }}>
        <Text style={{ flex: 1, fontSize: 14, color: DS.ink[900] }}>{value}</Text>
        <Text style={{ color: DS.ink[400] }}>▾</Text>
      </View>
    </View>
  );
}

function FormTextarea({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[800] }}>{label}</Text>
      <View style={{
        minHeight: 80, padding: 14,
        backgroundColor: '#FFF', borderRadius: 14,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
      }}>
        <Text style={{ fontSize: 14, color: '#9A9A9A' }}>{placeholder}</Text>
      </View>
    </View>
  );
}

function FormCheckbox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{
        width: 20, height: 20, borderRadius: 6,
        backgroundColor: checked ? DS.ink[900] : '#FFF',
        borderWidth: checked ? 0 : 1, borderColor: 'rgba(0,0,0,0.18)',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {checked && <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>✓</Text>}
      </View>
      <Text style={{ fontSize: 14, color: DS.ink[900] }}>{label}</Text>
    </View>
  );
}

function FormToggle({ on, label }: { on: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{
        width: 44, height: 24, borderRadius: 999,
        backgroundColor: on ? DS.ink[900] : 'rgba(0,0,0,0.15)',
        padding: 2, justifyContent: 'center',
      }}>
        <View style={{
          width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF',
          alignSelf: on ? 'flex-end' : 'flex-start',
          // @ts-ignore
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </View>
      <Text style={{ fontSize: 14, color: DS.ink[900] }}>{label}</Text>
    </View>
  );
}

function FormRadio({ selected, label }: { selected: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{
        width: 20, height: 20, borderRadius: 10,
        borderWidth: selected ? 6 : 1.5,
        borderColor: selected ? DS.ink[900] : 'rgba(0,0,0,0.18)',
        backgroundColor: '#FFF',
      }} />
      <Text style={{ fontSize: 14, color: DS.ink[900] }}>{label}</Text>
    </View>
  );
}

const cardSolid = {
  backgroundColor: '#FFF', borderRadius: 24, padding: 22,
  // @ts-ignore
  boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)',
};
const cardFlat = {
  backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 24, padding: 22,
  borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
};
const cardDark = {
  backgroundColor: DS.ink[900], borderRadius: 24, padding: 22,
};
