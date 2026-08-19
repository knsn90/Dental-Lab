# Design Contract — AI ve Geliştirici İçin Standartlar

Bu dosya, projedeki tüm yeni UI kodu için zorunlu kuralları tanımlar.
Mevcut StyleSheet tabanlı dosyalar dokunulmadan kalır; yeni ekranlar bu kurallarla yazılır.

---

## 🛑 Değişiklik & Güvenlik Kuralı (ZORUNLU — her şeyden önce gelir)

Yeni bir özellik veya değişiklik yapılırken **mevcutta çalışan hiçbir yere
dokunmadan önce kullanıcıya sorulur ve ne olacağı açıkça anlatılır.** Onay
gelmeden devam edilmez.

1. **Kapsamı izole et.** Bir panelde / ekranda yapılan değişiklik, **diğer
   panelleri otomatik etkilememeli.** Paylaşılan bir bileşeni/dosyayı
   değiştirmek başka panelleri de değiştirecekse, önce bunu söyle ve onay al
   (gerekiyorsa paylaşılan kodu kopyalayıp panele özel ayır).
2. **Riskli işlemleri önceden bildir.** Login/oturum/auth akışını, RLS
   politikalarını, migration'ları, ortak store/context'i, route guard'larını
   ya da sistemi çökertebilecek (build'i bozabilecek, veriyi bozabilecek)
   işlemleri yapmadan **önce** riski ve olası sonucu açıkla, onay bekle.
3. **Aktif özellikleri silme.** Güvenlik sıkılaştırma, refactor, temizlik veya
   "optimizasyon" yaparken **çalışan/aktif özellikleri kaldırma veya devre dışı
   bırakma.** Bir şeyin silinmesi/kapatılması gerekiyorsa önce sor ve neyin
   etkileneceğini söyle.
4. **Önce açıkla, sonra uygula.** Geri alınması zor (destructive) veya çok yere
   yayılan her değişiklikte: *ne değişecek, nereleri etkileyecek, riski ne* —
   bunları madde madde söyle, kullanıcı "tamam/onay" dedikten sonra uygula.

> Şüphedeysen DUR ve SOR. Sessizce geniş kapsamlı değişiklik yapma.

---

## 🌍 Çok Dillilik Kuralı (ZORUNLU)

**Yeni bir özellik, metin veya değişiklik eklenirken çeviriler AYNI ANDA
dört dilde de yapılır.** "Sonra Farsça'sını ekleriz" diye bırakılmaz — bırakılan
her dize o dilde Türkçe görünür ve kullanıcı ekranı gösterene kadar fark edilmez.

Desteklenen diller: **tr** (kaynak) · **en** · **de** · **fa**

İki katman var, hangisine yazacağın metnin türüne bağlı:

| Katman | Dosya | Ne zaman |
|---|---|---|
| Anahtarlı | `core/i18n/locales/{tr,en,de,fa}.json` | `t('admin.dashboard.newOrder')` ile çağrılan metinler |
| Otomatik sözlük | `core/i18n/locales/auto.{en,de,fa}.json` | Kaynakta düz Türkçe yazılmış her `<Text>` / `placeholder` |

**Otomatik sözlük BİREBİR eşleşir.** Anahtar, ekranda render edilen dizenin
`trim()` hâlidir. Bu yüzden şu kalıplar sözlüğe TAKILMAZ ve çağrı yerinde
`autoT()` ile sarılmalıdır:

```tsx
// ❌ tek parça olur, eşleşmez
`${n} gün gecikti`
<Text>Brüt {tutar}</Text>          // ✅ bu ÇALIŞIR — ayrı string çocuğu
{kosul ? 'Aktif' : 'Pasif'}        // ✅ çalışır — string çocuğu

// ✅ doğrusu
`${n} ${autoT('gün gecikti')}`
```

**Çeviri katmanının GÖREMEDİĞİ yerler** (buralarda `autoT()` zorunlu):
- Yazdırma/PDF şablonları — ham HTML üretir, JSX runtime'ından geçmez
  (`core/i18n/printLocale.ts` + `autoT()` kullan)
- `react-native-svg`'nin `<SvgText>`'i — RN `<Text>` değil, yamalanmaz
- Sabit dizilerdeki `label`/`hint` alanları — JSX değil, veri
- Veritabanına Türkçe YAZILAN metinler (bildirim başlıkları, aktivite kayıtları)
  → render anında `autoT()` çözer; `"Başlık · KOD"` ve `"Başlık: Değer"`
  biçimleri için önek eşleşmesi vardır

**Kontrol:** değişiklikten sonra üç sözlüğün de aynı anahtarları içerdiğini
doğrula. Eksik dil bırakma.

## 🚀 Deploy Kuralı (ZORUNLU)

**Kullanıcı açıkça "deploy" (veya "deploy et / yayınla / online güncelle")
DEMEDİKÇE deploy YAPMA.** Her değişiklikten sonra otomatik deploy etme.

- Değişiklikleri yap → `tsc --noEmit` ile doğrula → **BEKLE**. Değişiklikleri
  biriktir; yalnız kullanıcı "deploy" dediğinde biriken her şeyi tek seferde yayınla.
- Deploy komutu (kullanıcı "deploy" deyince, tekrar sormadan çalıştırılır):
  ```bash
  cd ~/Desktop/DentalSoftware/my-expo-app
  rm -rf dist .expo .vercel/output node_modules/.cache
  NODE_OPTIONS="--max-old-space-size=8192" npm run deploy
  ```
  Sonra `curl -s -o /dev/null -w "%{http_code}" https://siman.app/` → **200** doğrula.
- Deploy sırasında localhost (expo start) kısa süre kapanır; deploy bitince
  otomatik geri başlat.

---

## 🎯 Stack

- **Expo + React Native + react-native-web** — tek codebase, hem web hem mobile
- **NativeWind v4** (Tailwind CSS) — `className` ile stil
- **Supabase** — backend + auth + RLS
- **Cards Design System** — beyaz kart + transparent border + ağır shadow

## 🚨 Yeni Ekran Yazma Kuralları

### 1. ResponsiveCanvas zorunlu
```tsx
import { ResponsiveCanvas } from 'core/layout/ResponsiveCanvas';

export function MyScreen() {
  return (
    <ResponsiveCanvas size="lg">
      {/* içerik */}
    </ResponsiveCanvas>
  );
}
```
- `size`: `sm` (form, 720px) · `md` (980px) · `lg` (default, 1280px) · `xl` (geniş tablo, 1440px)
- Mobile'da otomatik tam genişlik
- Desktop'ta otomatik ortalama + padding
- **Hub içinde yatay dolgu eklemez** — `HubContext` true iken sayfa kenarını hub verir

### 1b. Sayfa kenarı: `PAGE_PADDING` (ZORUNLU)

**Sayfa kenarı için çıplak sayı YAZMA.** Tek kaynak `core/ui/pageMetrics.ts`:

```tsx
import { PAGE_PADDING, PAGE_BLEED } from 'core/ui/pageMetrics';

<ScrollView contentContainerStyle={{ paddingHorizontal: PAGE_PADDING }}>
  {/* tam-genişlik şerit kenara taşacaksa: */}
  <View style={{ marginHorizontal: PAGE_BLEED }}><TabStrip /></View>
</ScrollView>
```

`PAGE_PADDING 16` · `PAGE_BLEED -16` · `CARD_GAP 12` · `CARD_PADDING 18`

**İki tuzak — ikisi de bu projede gerçekten yaşandı:**

1. **Komşu dosyadan kopyalama.** Değer her ekranda elle yazıldığı için 17 farklı
   sayı birikti; aynı ekranda başlık 24, sekmeler 16, kartlar 12 oldu. Komşu
   yanlışsa kopyalamak hatayı çoğaltır — **sözleşmeye bak, komşuya değil.**
2. **Hub içinde çift dolgu.** Hub kabı 16 verirken ekran bir 16 daha eklerse
   kartlar 32'de kalır ve başlıkla hizalanmaz. Hub'a gömülü ekranda yatay dolgu
   **ekleme**; `useContext(HubContext)` ile sıfırla.

Ayrıntı ve gerçek vaka: `docs/DESIGN_LANGUAGE.md` §3.

### 2. Canonical bileşenleri kullan

**Kart:** `CardX` (4 variant)
```tsx
import { CardX } from 'core/ui/CardX';
<CardX><CardX.Header>...</CardX.Header><CardX.Body>...</CardX.Body></CardX>
```

**KPI:** `KPICardX` — değer + ikon + opsiyonel trend
```tsx
import { KPICardX } from 'core/ui/KPICardX';
<KPICardX label="Gelir" value="₺125.430" icon="trending-up" accent="#059669"
          trend={{ value: 12, label: '%12 arttı' }} />
```

**Hero:** `HeroX` — modern dashboard hero (gradient blob + stats + actions)
```tsx
import { HeroX } from 'core/ui/HeroX';
<HeroX
  kicker="Pazartesi, 12 Mayıs"
  title="Hoş geldin, Ahmet"
  subtitle="..."
  glow={['#2563EB', '#10B981']}
  stats={[{ label: 'Yeni', value: 12, accent: '#10B981' }]}
  actions={[{ icon: 'plus', label: 'Yeni İş Emri', primary: true, onPress }]}
/>
```

**Section başlığı:** `SectionLabelX`
```tsx
import { SectionLabelX } from 'core/ui/SectionLabelX';
<SectionLabelX action={{ label: 'Tümünü Gör →', onPress }}>Son Siparişler</SectionLabelX>
```

**Empty state:** `EmptyStateX`
```tsx
import { EmptyStateX } from 'core/ui/EmptyStateX';
<EmptyStateX icon="inbox" title="Henüz sipariş yok" cta={{ label: 'Ekle', onPress }} />
```

> **`X` suffix'i:** mevcut StyleSheet versiyonlarıyla çakışmamak için. Yeni kod `X` ile başlar; eski kod yavaş yavaş geçer.

### 3. Tailwind className — StyleSheet değil
```tsx
// ❌ Eski
<View style={s.card}><Text style={s.title}>X</Text></View>
const s = StyleSheet.create({ card: {...}, title: {...} });

// ✅ Yeni
<View className="bg-surface rounded-card border border-card shadow-card p-4">
  <Text className="text-base font-bold text-slate-900">X</Text>
</View>
```

### 4. Responsive — desktop'ı düşün
Her layout kararında **mobile + desktop** ayrı düşün:
```tsx
<View className="flex-col md:flex-row gap-4">
  {/* Mobile: stacked, Desktop: side-by-side */}
</View>

<View className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  {/* KPI grid */}
</View>
```

Breakpoint'ler:
- `sm:` 640px (büyük telefon)
- `md:` 768px (tablet)
- `lg:` 1024px (laptop)
- `xl:` 1280px (desktop)
- `2xl:` 1536px (geniş ekran)

### 5. Hover & focus state'leri
Web'de tıklanabilir her şey için:
```tsx
<Pressable className="
  active:opacity-70
  web:cursor-pointer
  web:hover:bg-slate-50
  web:focus-visible:ring-2 web:focus-visible:ring-invoice/40
">
```

### 6. Cards Design Token'ları
```
bg-page         → Sayfa arka planı (#F1F5F9)
bg-surface      → Kart yüzeyi (#FFFFFF)
rounded-card    → 14px köşe
border-card     → rgba(255,255,255,0.95) (transparent overlay)
shadow-card     → 0 8px 24px rgba(0,0,0,0.15)
shadow-cardLite → Hafif gölge (toolbar, search)
shadow-cardHero → Hero kart için ağır gölge
```

### 7. Renk Tokenleri

> **🎨 Panel-tutarlılığı kuralı (ZORUNLU):**
> Herhangi bir bölüm/özellik eklerken **her panel kendi renklerini** kullanmalı —
> kartlar, butonlar ve **sayfa arka plan rengi** o panelin accent + zemin paletinden
> gelmeli. Hiçbir ekranda renk/zemin hardcode edilmez; aktif panele göre çözülür.
>
> - Panel accent + zemin için `usePanelTheme()` (route segment'inden çözer) veya
>   `MOBILE_PANEL_THEMES[panel]` kullan. Sayfa zemini her zaman o panelin `bgPage`'i
>   ile aynı olmalı (PatternsShell ile birebir): lab `#F5F1EB` · klinik/hekim
>   `#F9FAFB` · admin `#F7F9FC` · istasyon `#F5F9FD` · kurye `DS.tech.bg`.
> - Birden fazla panelde paylaşılan ekranlar (Destek, Kurye Takip, Mesajlar vb.)
>   panele göre **accent + zemin** almalı; tek bir sabit renk (ör. turuncu) tüm
>   panellerde kullanılmaz.
> - Buton/CTA, seçili sekme, rozet, ilerleme çubuğu vb. accent gerektiren her şey
>   panel `primary` renginden türetilir (`hexA(primary, …)` ile yumuşak tonlar).
> - Nötr metin (graphite/ink) renkleri panelden bağımsız kalabilir.

**Panel accent'leri:**
```
text-lab     bg-lab     → Lab paneli (#2563EB)
text-doctor  bg-doctor  → Hekim (#0EA5E9)
text-clinic  bg-clinic  → Klinik (#0369A1)
text-admin   bg-admin   → Admin (#0F172A)
```

**Mali İşlemler accent'leri:**
```
text-profit    → Kar (#059669)
text-invoice   → Fatura (#2563EB)
text-balance   → Cari (#0EA5E9)
text-expense   → Gider (#DC2626)
text-budget    → Bütçe (#7C3AED)
text-check     → Çek (#D97706)
text-cash      → Kasa (#059669)
text-pricelist → Fiyat (#0891B2)
```

**Status:**
```
text-success bg-success → #10B981
text-warning bg-warning → #F59E0B
text-danger  bg-danger  → #DC2626
text-info    bg-info    → #0EA5E9
```

## 📋 Mobile vs Web Pattern Tablosu

| Kalıp | Mobile | Desktop |
|---|---|---|
| Navigasyon | Bottom tab | Sidebar (DesktopShell) |
| Liste | Kart liste | Tablo (`hidden lg:flex` + `lg:hidden`) |
| Modal | Bottom sheet | Centered dialog |
| Detay | Push route | Split view (master-detail) |
| Filtre | Sticky chip strip | Sidebar facets |
| FAB | Sağ alt FAB | Toolbar button |
| Form | Tek kolon, full-width | Max 720px, label sol |

Örnek:
```tsx
{/* Mobile: kart, Desktop: tablo */}
<View className="lg:hidden">
  {items.map(item => <CardX key={item.id}>...</CardX>)}
</View>
<View className="hidden lg:block">
  <DesktopTable rows={items} />
</View>
```

## 🚫 Yapma Kuralları

1. **`style={...}` ile inline stil yazma** — özel durumlar haricinde
2. **`StyleSheet.create()` ile yeni stil yazma** — eski dosyalar hariç
3. **Default Tailwind blue/indigo kullanma** — proje accent'leri var
4. **`shadow-md` gibi flat shadow** — `shadow-card` veya `shadow-cardLite`
5. **Sabit width değerleri** — responsive kullan
6. **Sayfa kenarına çıplak sayı yazma** — `PAGE_PADDING` kullan (bkz. §1b)
7. **Hub içinde yatay dolgu ekleme** — kenar boşluğu ikiye katlanır
8. **Maksimum 4 nested View** — flatten et
9. **Mobile-only düşünme** — her ekran web'de de güzel olmalı
10. **NativeWind + StyleSheet karıştırma** — bir komponentte tek yöntem
11. **Sabit/tek panel rengi & zemini** — kart, buton, arka plan rengini hardcode etme; her panel kendi paletini kullansın (bkz. §7 Panel-tutarlılığı kuralı). Paylaşılan ekranlar `usePanelTheme()` ile accent + zemin almalı.

## 🎨 Pattern Showcase

`/dev/patterns` route'unu açarak:
- Renk paleti
- Card variant'ları
- Responsive grid
- Form pattern'i
- Buton state'leri
- Tipografi hiyerarşisi

görsel olarak inceleyebilirsin. Yeni komponent eklediğinde buraya örneğini ekle.

### 🎯 İkon Kuralı (zorunlu)

**Her zaman flat 2D linear (line/stroke) ikon kullan.** Pattern showcase, mockup ve yeni
ekranlardaki her ikon bu stilde olmalı.

- ✅ **Kullanılacak**: tek renk, ince stroke, dolgusuz / hafif dolgulu line ikonlar
  (Lucide, Feather, Tabler Icons, Heroicons outline)
- ❌ **Kullanılmayacak**:
  - Emoji (🔔, ⚗, ↗, ✓ vb.) — production veya pattern showcase'inde **yasak**
  - Solid / filled ikon (Material filled, FontAwesome solid)
  - 3D / izometrik / colorful illustration ikonları
  - Skeuomorphic veya gradient'li ikonlar
  - Hand-drawn SVG path'leri (önceki AppIcon glyph'leri yerine library tercih edilecek)

Tek tip kütüphane: **Lucide React Native** (proje standardı). Boyut, stroke-width,
renk panel accent'inden gelir.

```tsx
import { Bell, Printer, Check, ArrowUpRight } from 'lucide-react-native';
<Bell size={16} color={DS.lab.accent} strokeWidth={1.6} />
```

## 📂 Klasör Standardı

```
modules/<modulename>/
├── api.ts                 # Supabase queries
├── types.ts               # Domain types
├── hooks/                 # React hooks
├── screens/               # Tam ekran
├── components/            # Yeniden kullanılabilir UI parçaları
└── README.md              # Modül dokümantasyonu (opsiyonel)
```

## ✅ Yeni Ekran Çıktısı Checklist

- [ ] `<ResponsiveCanvas size="...">` ile sarılı
- [ ] Sayfa kenarı `PAGE_PADDING` (çıplak sayı yok) · hub içindeyse yatay dolgu eklenmemiş
- [ ] StyleSheet yerine className
- [ ] `bg-page` page bg, `bg-surface` card bg
- [ ] Mobile'da test edilebilir + desktop'ta güzel
- [ ] Hover/focus state'leri var
- [ ] Empty state + loading state mevcut
- [ ] Cards tokenları (`shadow-card`, `border-card`, `rounded-card`)
- [ ] Panel accent rengi kullanılmış (text-lab/doctor/clinic vs. doğrudan hex)
- [ ] AppIcon kullanılmış (hand-drawn SVG yok)
- [ ] HubContext kontrol — embedded ise duplicate başlık yok

---

# 📐 Tasarım Dili — Detaylı Referans (`/dev/patterns` + token kaynakları)

> Bu bölüm projenin **gerçek tasarım dilidir.** Tüm yeni bölümler bu değerlerle
> tasarlanır. Renkler/ölçüler `core/theme/dsTokens.ts`, `mobileDesignTokens.ts`,
> `typography.ts`, `shadows.ts`, `spacing.ts` dosyalarından gelir; hardcode etme,
> token kullan. Görsel referans: `/dev/patterns` (desktop) ve `/dev/patterns-mobile`.

## 1. Panel Paletleri (`DS` — dsTokens.ts)

Her panelin tam paleti. `usePanelTheme()` route segment'inden çözer
(`/(lab)`→lab, `/(admin)`→exec, `/(clinic)`&`/(doctor)`→clinic, `/(station)`→tech).

| Panel | primary | primaryDeep | accent (ink) | bg (soft fill) | bgDeep | surface | surfaceAlt (dark) |
|---|---|---|---|---|---|---|---|
| **lab** (Safran) | `#F5C24B` | `#E0A82E` | `#0A0A0A` | `#FBE9B6` | `#F4D078` | `#FFFFFF` | `#1A1A1A` |
| **clinic** (Zümrüt) | `#32BB78` | `#0C8F56` | `#2F313F` | `#D3F8E0` | `#ABEFC7` | `#FFFFFF` | `#2F313F` |
| **exec/admin** (Kobalt) | `#4771AB` | `#314F7E` | `#172235` | `#EAF2FB` | `#E7EEF8` | `#FFFFFF` | `#243041` |
| **tech/station** (Mavi) | `#3B82F6` | `#1E5FBF` | `#0F2840` | `#EAF2FA` | `#D2E1F0` | `#FFFFFF` | `#0F2840` |
| **plum** (Analitik) | `#8B5CB8` | `#6B3F94` | `#2A1A3D` | `#EFE9F5` | `#DDD0EA` | `#FFFFFF` | `#2A1A3D` |
| **teal** (Depo) | `#2BA39B` | `#197872` | `#0E2E2C` | `#E4F1F0` | `#C9E2DF` | `#FFFFFF` | `#0E2E2C` |

**Ortak status renkleri (tüm paneller):** success `#2D9A6B` · warning `#E89B2A` ·
danger `#D94B4B` · info `#4A8FC9`.

**Ink skala:** 900 `#0A0A0A` · 800 `#1A1A1A` · 700 `#2C2C2C` · 500 `#6B6B6B` ·
400 `#9A9A9A` · 300 `#D4D4D4` · 200 `#EAEAEA` · 100 `#F5F5F5` · 50 `#FAFAFA`.

**Klinik/Hekim yeşil skalası (Zümrüt — 400 = primary):** yeni bir yeşil tonu gerektiğinde
elle türetme, bu skaladan seç: 50 `#EDFCF3` · 100 `#D3F8E0` · 200 `#ABEFC7` · 300 `#74E1A8` ·
**400 `#32BB78` (primary)** · 500 `#19B06B` (hover) · 600 `#0C8F56` (primaryDeep) ·
700 `#0A7247` (kicker/koyu metin) · 800 `#0B5A3A` · 900 `#0A4A31` · 950 `#042A1C`.
Koyu ink/hero/surfaceAlt = charcoal `#2F313F`, sayfa zemini = `#F9FAFB` (skala dışı, sabit).

## 2. Sayfa Zeminleri (`MOBILE_PANEL_THEMES.bgPage` — shell ile birebir)

Sayfa arka planı **her zaman** aktif panelin `bgPage`'i olmalı (PatternsShell
content bg ile aynı). Token paletindeki `bg` (soft fill) ≠ sayfa zemini.

| Panel | bgPage (sayfa zemini) | bgHero (koyu hero) | bgDeep (bantlı bölüm) |
|---|---|---|---|
| lab | `#F5F1EB` | `#3A2E10` | `#E8DDB5` |
| klinik / doctor | `#F9FAFB` | `#2F313F` | `#D3F8E0` |
| exec/admin | `#F7F9FC` | `#243041` | `#E7EEF8` |
| teknisyen/station | `#F5F9FD` | `#1E3A6F` | `#D2E1F0` |

surface (kart) = `#FFFFFF` her panelde.

## 3. Tipografi

- **Display/başlık fontu:** `Inter Tight` (web) / `InterTight_300Light` (native),
  **300 light**, negatif tracking. Büyük başlıklarda letter-spacing ≈ `-0.025 × fontSize`
  (örn. 42px başlık → `-1.05`). Hero/display'de italik *Instrument Serif* görünümü
  showcase'de kullanılır; production'da Inter Tight 300 display standardı.
- **UI/gövde fontu:** `Inter` / `Inter Tight`, 400–600.
- **Mono:** `JetBrains Mono` (tracking no, ID, kod).
- **Boyut skalası (DS.size):** display 72 · h1 56 · h2 40 · h3 28 · h4 20 ·
  body 15 · small 13 · micro 11.
- **Pratikte sık kullanılan:** sayfa başlığı 22–26 (SERIF, ls −0.4/−0.5) · kart
  başlığı 14–15/600 · section label 10–11/700 UPPERCASE ls 1.2 · gövde 13 ·
  meta/caption 11 (ink-400/500) · büyük metrik 40–52 (SERIF, ls −1…−1.5).

## 4. Köşe Yarıçapı (radius)

`sm 8` · `md 14` (kart — `rounded-card`/`rounded-lg`) · `lg 20` · `xl 28`
(büyük kart/section) · `pill 9999` (chip, buton, sekme, arama). Form input 14.
Pratik: liste kartları 16, büyük panel kartları 22–28, rozet/pill 999.

## 5. Gölgeler (shadows.ts)

`sm` `0 1px 4px rgba(0,0,0,0.06)` · `md` `0 2px 12px /0.08` · `lg` `0 4px 24px /0.10`
· **card** `0 8px 24px rgba(0,0,0,0.15)` (ağır, kart standardı) · **cardLite**
`0 4px 12px /0.08`. Flat `shadow-md` Tailwind kullanma — bu token'ları kullan.
CardSpec: bg `#FFFFFF`, border `rgba(255,255,255,0.95)`, radius 14.

## 6. Boşluk (4px grid — DS.space / spacing.ts)

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80`. Sayfa padding 20 (mobil 16),
kart padding 16–24, gap 8–16. **Kenar boşluğu kuralı: sayfa kenarı her zaman 16px.**

## 7. Bileşen Kalıpları (`/dev/patterns` showcase'i)

Canonical `X`-suffix bileşenleri kullan; aşağıdaki kalıplar showcase'de tanımlı:

- **Kart (CardX):** `variant` = `default | elevated | flat | hero | outline`.
  radius 14, border `rgba(0,0,0,0.08)`, elevated/hero → shadow-md, diğer shadow-sm,
  padding 24. Alt bileşenler: `CardX.Header/Title/Description/Content/Footer`.
- **Glass kart:** `backdropFilter: blur(3px) saturate(120%)`, bg `rgba(255,255,255,0.08)`,
  border `rgba(255,255,255,0.55)`, çift gölge (drop + inset highlight). Harita/overlay
  panelleri için.
- **KPI (KPICardX):** value + opsiyonel trend (↑ emerald-600 / ↓ rose-600), icon,
  radius 14, shadow-sm, value `text-2xl bold`. Animasyonlu sayaç için `NumberTickerX`.
- **Hero (HeroX / F2 full-bleed):** panel `primary→primaryDeep` gradient veya koyu
  `bgHero`; başlık `text-3xl/4xl` 300 display; opsiyonel kicker (UPPERCASE micro),
  breadcrumb, actions satırı, blur orb glow'lar.
- **Buton (ButtonX):** `variant` = `default(primary) | secondary | destructive |
  outline | ghost | link`; `size` = `sm(h-9) | md(h-10) | lg(h-11) | icon`. Pill
  CTA'larda radius 999. Accent = panel primary; web'de cursor-pointer + focus ring.
- **Rozet/Chip (BadgeX):** `default | secondary | destructive | outline | success |
  warning | info`; rounded-full, `text-xs font-semibold`, px-2.5 py-0.5. Opsiyonel
  status dot. Soft ton = `hexA(accent, 0.10–0.14)`.
- **Sekme (TabButton):** animasyonlu pill; aktif → bg panel accent + beyaz metin,
  pasif → transparan + ink-500. Alternatifler: underline, segmented, vertical.
- **İlerleme (ProgressX):** `LinearProgressX` (pill rail + gradient fill + knob glow),
  `PercentRingX` (SVG donut, soft track + accent→accentDeep arc + beyaz knob, 220px
  hero ring), `StepsTimelineX` (✓ tamam / pulse-ring aktif / boş daire bekleyen).
- **Tablo (DesktopTable):** UPPERCASE 10–11px başlık (ink-400), 13px hücre, zebra yok
  (yalnız hover satır vurgusu), ID'ler monospace, satırlar borderBottom hairline.
- **Form:** input radius 14, label üstte (13–14/600), hint altta (12 ink-500), hata =
  kırmızı border + mesaj. Arama: pill, sol lupa ikonu, sağ temizle (X).
- **Onay dialog:** 3 ton — neutral / destructive (kırmızı) / success (yeşil).
- **Empty state (EmptyStateX):** 56–80px daire ikon (cardLite gölge), başlık bold,
  opsiyonel CTA (panel accent / danger). `variant` = `default | error | success`.
- **Section başlığı (SectionLabelX):** 11px bold UPPERCASE tracking-widest (ink-400) +
  opsiyonel "Tümünü Gör →" action (panel accent).

## 8. İkonlar

Yalnız **Lucide React Native**, flat 2D line/stroke, `strokeWidth` 1.6–2.2,
renk panel accent'inden veya ink skaladan. Emoji/solid/3D/gradient ikon YASAK
(detay: §İkon Kuralı).

## 9. Hareket / Animasyon

`transform` + `opacity` tabanlı (layout animasyonu değil): hover scale ~1.015–1.02,
nazik float/glow loop (2.4–3s ease-in-out), knob breathing, sayaç count-up
(ease-out cubic ~700–800ms). Popup arka planlarında ağır blur'dan kaçın (perf).

---

Bu dosyayı düzenli güncel tut. Yeni pattern eklendikçe buraya yansıt.
