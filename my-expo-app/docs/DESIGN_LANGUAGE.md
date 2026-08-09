# Siman Tasarım Dili

> Tek kaynak: `/dev/patterns` (desktop + mobile birleşik showcase).
> Token kaynağı: `core/theme/dsTokens.ts` ve `core/theme/mobileDesignTokens.ts`.
>
> **Düstur:** Panele göre değişen zemin · Inter Tight Light (300) display ·
> büyük yumuşak köşeler · glassmorphism · ince modern hatlar · panel başına
> farklı accent.

---

## 1. Panel Temaları

6 panel teması var. Her tema kendi `bg / bgSoft / bgDeep / primary / primaryDeep / accent`
setini taşır. `DS.<panel>` ile erişilir. Lab · Klinik · Yönetim · Teknisyen **canlı**;
Analitik & Depo ileride kullanılmak üzere ayrılmış.

| Panel | Anahtar | Karakter | Primary | primaryDeep | accent (ink) | bg (soft fill) |
|---|---|---|---|---|---|---|
| Lab | `DS.lab` | Safran / açık krem | `#F5C24B` | `#E0A82E` | `#0A0A0A` | `#FBE9B6` |
| Klinik | `DS.clinic` | Zümrüt / koyu yeşil | `#32BB78` | `#0C8F56` | `#2F313F` | `#D3F8E0` |
| Yönetim (Admin) | `DS.exec` | Kobalt / açık mavi | `#4771AB` | `#314F7E` | `#172235` | `#EAF2FB` |
| Teknisyen | `DS.tech` | Parlak mavi (istasyon) | `#3B82F6` | `#1E5FBF` | `#0F2840` | `#EAF2FA` |
| Analitik _(ileride)_ | `DS.plum` | Erik / lavanta | `#8B5CB8` | `#6B3F94` | `#2A1A3D` | `#EFE9F5` |
| Depo _(ileride)_ | `DS.teal` | Petrol / turkuaz | `#2BA39B` | `#197872` | `#0E2E2C` | `#E4F1F0` |

> **Sayfa zemini ≠ `bg` (soft fill).** Gerçek sayfa arka planı her panelin
> `MOBILE_PANEL_THEMES.bgPage`'i: lab `#F5F1EB` · klinik/hekim `#F9FAFB` ·
> admin `#F7F9FC` · istasyon `#F5F9FD`. surface (kart) = `#FFFFFF` her panelde.

**Status renkleri ortak** (tüm temalarda aynı):
- `success: #2D9A6B`
- `warning: #E89B2A`
- `danger: #D94B4B`
- `info: #4A8FC9`

**Mürekkep / nötr** (`DS.ink`):
`900: #0A0A0A · 800: #1A1A1A · 700: #2C2C2C · 500: #6B6B6B · 400: #9A9A9A · 300: #D4D4D4 · 200: #EAEAEA · 100: #F5F5F5 · 50: #FAFAFA`

---

## 2. Tipografi

```ts
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300',  // Light
};
```

| Rol | Font | Boyut | Tracking | Renk | Kullanım |
|---|---|---|---|---|---|
| Hero Display | DISPLAY | 56–88 | -1.96 – -3.1 | `ink[900]` | Sayfa açılışları |
| Section Display | DISPLAY | 22–36 | -0.5 – -0.9 | `ink[900]` | Section başlığı |
| BigStat | DISPLAY | 40 | -1.4 | `ink[900]` | Hero metrikleri |
| KPI Value | DISPLAY | 30 | -0.9 | `ink[900]` | Kart rakamları |
| Card Title | Inter (sans) | 14–15 | -0.2 | `ink[900]` font 600 | Liste/kart başlığı |
| Body | Inter | 13–17 | 0 | `ink[700]` / `ink[500]` | Metin |
| Subtitle | Inter | 12 | 0 | `ink[500]` | Açıklama |
| Eyebrow | Inter | 10–11 | 1.1 – 1.4 uppercase | `ink[500]` | Section üstü |
| Meta | Inter | 10 | 0.5 – 0.8 uppercase | `ink[400]` | Etiket altı |

**Kural:** Display başlıklar daima **light (300)** + **negative tracking**.
Body metinler **normal (400)** veya **medium (500)**, semibold yalnızca
kart başlıklarında.

---

## 3. Geometri

| Token | Değer | Kullanım |
|---|---|---|
| `radius.pill` | `999` | Buton, chip, KPI nokta |
| `radius.card` | `18` | Standart kart |
| `radius.hero` | `28` | Hero kart (dış) |
| `radius.heroInner` | `22–24` | Glass iç katman |
| `border` | `1px ink[200]` | Standart kart kenarı |
| `border.glass` | `1px rgba(255,255,255,0.7)` | Glassmorphism kenar |

### Spacing skalası

`4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 24 · 28 · 32 · 48 · 56`

### 🎯 16px Kuralı (Zorunlu)

**16px, tüm tasarımda block ve kenar mesafeleri için tek standarttır.** İstisna haricinde
bu sayıyı kullan.

| Bağlam | Değer | Not |
|---|---|---|
| **Sayfa kenarı → içerik** | `16` | Outer padding (mobile + desktop) |
| **Hero → KPI shelf** | `16` | Block-to-block dikey gap |
| **Block → block** | `16` | Section frame'ler arası |
| **Tab bar → ilk içerik** | `16` | Hub içi sekme şeridinin altı |
| **Header → content** | `16` | SectionHeader marginBottom |
| **Card grid içi gap** | `12` | İstisna — kartlar nefes alır |
| **Card iç padding** | `18` | İstisna — atom standardı |
| **İkon-text arası** | `8` | İstisna — tight pair |
| **Tight stacks (Pillbar)** | `4–6` | İstisna — micro-grouping |

**Hangi durumda 16 dışına çık:**
- Card iç padding 18 — atom standardı, kart-içi içerik dengesi
- Card gap 12 — kart-kart sıkı düzen
- Tight micro-stacks (button içi `gap: 6`, etiket-değer ikilisi `gap: 8`) — text/icon
  ilişkisi içinde
- Hero outer cream halka padding 14 — glass çerçeve estetiği
- Glass inner padding 16–26 — hero'nun nefesi

**Hangi durumda 16 zorunlu:**
- Sayfa kenarı (hub içi `marginHorizontal: -4` ile 20→16 düzeltmesi yapılır)
- Hero → KPI shelf
- KPI shelf → body
- SectionHeader → content
- Form group → form group
- Body 2-kolon `gap` (mobile stack'te de 16)

### Tek kaynak: `PAGE_PADDING` (ZORUNLU)

**Sayfa kenarı için çıplak sayı YAZMA.** Değer `core/ui/pageMetrics.ts`'ten gelir:

```ts
import { PAGE_PADDING, PAGE_BLEED } from 'core/ui/pageMetrics';

<ScrollView contentContainerStyle={{ paddingHorizontal: PAGE_PADDING }}>
```

| Token | Değer | Ne için |
|---|---|---|
| `PAGE_PADDING` | `16` | Sayfa kenarı → içerik |
| `PAGE_BLEED` | `-16` | Tam-genişlik şeridi kenara taşırma telafisi |
| `CARD_GAP` | `12` | Kart–kart arası |
| `CARD_PADDING` | `18` | Kart iç dolgusu |

**Neden token:** değer her ekranda elle yazıldığı için kod tabanında **17 farklı
sayı** birikmişti (8·10·12·16·18·20·22·24·28…). Aynı ekranda üç ayrı kenar
oluyordu — başlık 24, sekmeler 16, kartlar 12. Yeni ekran yazan (insan ya da AI)
sözleşmeye değil komşu dosyaya bakıp kopyaladığı için hata kendini çoğaltıyordu.

Full-bleed telafisi de türetilmeli: elle yazılan `marginHorizontal: -12`, sayfa
kenarı değişince senkronu kaybeder. `PAGE_BLEED` kullan.

### ⚠️ Hub içinde YATAY dolgu EKLEME

Bir ekran hub'a (Stok, Finans, İK…) gömülü render ediliyorsa **sayfa kenarını hub
verir.** Ekran bir daha eklerse kenar boşluğu ikiye katlanır.

`ResponsiveCanvas` bunu `HubContext`'ten kendisi çözer — hub içinde yalnız dikey
dolgu uygular. Elle sarmalayıcı yazıyorsan aynı kuralı uygula:

```tsx
const isHub = useContext(HubContext);
<View style={{ paddingHorizontal: isHub ? 0 : PAGE_PADDING }}>
```

> **Gerçek vaka:** Stok › Malzeme Eşleştirme'de StockScreen kabı 16, içindeki
> `ResponsiveCanvas` bir 16 daha ekliyordu → kartlar **32**'de, sekmeler 16'da.
> Kartlar "dar/küçük" görünüyordu; sorun genişlik değil çift dolguydu.


### Gölge (yumuşak, hafif)
- Hero / FAB: `shadowOpacity: 0.06–0.1, shadowRadius: 10–20`
- Standart kart: gölge yok, sadece `border`
- Üstü çıkmış element (palette, dropdown): `shadowOpacity: 0.08, shadowRadius: 14`

---

## 4. Hero Patternleri

### 4.1 F1 — Glassmorphism (Lab / Admin tarzı)
Krem zemin + yarı saydam beyaz iç kart. Soft, ferah, premium.

```tsx
<View style={{ borderRadius: 28, backgroundColor: TH.bg, padding: 24 }}>
  <View style={{
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 24, padding: 28,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
  }}>
    {/* Eyebrow + Display title + body + BigStat row + PillButton'lar */}
  </View>
</View>
```

### 4.2 F2 — Full-bleed Gradient (Yönetim raporu)
Tam dolu accent + dekoratif daireler arka planda.

```tsx
<View style={{ borderRadius: 28, padding: 48, backgroundColor: DS.exec.primary, overflow: 'hidden' }}>
  <View style={{ position: 'absolute', top: -40, right: -40, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.15)' }} />
  <View style={{ position: 'absolute', bottom: -60, left: -20, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(0,0,0,0.05)' }} />
  {/* Eyebrow + huge display title + body + dark CTA */}
</View>
```

### 4.3 F3 — Dark Inverted
Siyah/lacivert zemin + canlı accent vurgusu + sağda halka KPI.

```tsx
<View style={{ borderRadius: 28, padding: 48, backgroundColor: DS.ink[900] }}>
  {/* Live dot + canlı eyebrow + accent renkli display + ring stat */}
</View>
```

### 4.4 F1c — Compact Stat Hero (Performans tarzı)

Hub içine gömülmüş tek satırlık özet için. Full-bleed accent renk + dekoratif daireler +
sağ üst icon kapsülü + altta 3'lü mini-stat şeridi. Beyaz tipografi, koyu accent zemin.
Komponent: **`HeroCompact`** (`modules/payroll/bonus/components/atoms.tsx`).

**Anatomi**
```
┌────────────────────────────────────────────────────────────┐
│  ┌────────────┐                                     ┌──┐ ◉│  ← bg dekor daireleri
│  │ KICKER     │                                     │ $│   │
│  │            │                                     └──┘   │
│  │ ₺0         │  ← display 32, letterSpacing −1, white     │
│  │ Label opt. │  ← 13/85% white                            │
│  │ Sub        │  ← 11/72% white                            │
│  └────────────┘                                            │
│ ┌────────┐ ┌────────┐ ┌────────┐                           │
│ │ EYEBROW│ │ EYEBROW│ │ EYEBROW│  ← rgba(255,255,255,0.16) │
│ │ value  │ │ value  │ │ value  │     radius 14, padding 10 │
│ └────────┘ └────────┘ └────────┘                           │
└────────────────────────────────────────────────────────────┘
   ◉ dekor: bottom-left -50/-20 dia 140                       
```

**Snippet**
```tsx
<View style={{
  borderRadius: 20, backgroundColor: accentColor, padding: 22,
  position: 'relative', overflow: 'hidden',
}}>
  {/* Dekoratif daireler */}
  <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160,
                 borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.18)' }} />
  <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140,
                 borderRadius: 70, backgroundColor: 'rgba(0,0,0,0.05)' }} />

  {/* Üst satır — kicker + value + icon */}
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase',
                     color: 'rgba(255,255,255,0.78)', marginBottom: 8 }}>
        TOPLAM KAR KATKISI
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 32, color: '#FFF', letterSpacing: -1, lineHeight: 38 }}>
        ₺0
      </Text>
      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>
        5 teknisyen · 0 sa toplam süre
      </Text>
    </View>
    <View style={{ width: 44, height: 44, borderRadius: 14,
                   backgroundColor: 'rgba(255,255,255,0.18)',
                   alignItems: 'center', justifyContent: 'center' }}>
      <DollarSign size={20} color="#FFF" strokeWidth={1.6} />
    </View>
  </View>

  {/* Alt mini-stat şeridi */}
  <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
    {[
      { label: 'FIRE',      value: '−0 ₺' },
      { label: 'VERIM',     value: '—' },
      { label: 'TEKNISYEN', value: '5' },
    ].map(s => (
      <View key={s.label} style={{
        flex: 1, paddingVertical: 10, paddingHorizontal: 10,
        borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)',
      }}>
        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5,
                       textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)',
                       marginBottom: 4 }}>{s.label}</Text>
        <Text style={{ ...DISPLAY, fontSize: 18, color: '#FFF',
                       letterSpacing: -0.4, lineHeight: 22 }}>{s.value}</Text>
      </View>
    ))}
  </View>
</View>
```

**Token tablosu**
| Element | Değer |
|---|---|
| Outer radius | `20` |
| Outer padding | `22` |
| Background | `accentColor` (panel primary) |
| Dekoratif daire 1 | top -40 / right -40 / 160×160 / `rgba(255,255,255,0.18)` |
| Dekoratif daire 2 | bottom -50 / left -20 / 140×140 / `rgba(0,0,0,0.05)` |
| Kicker | 10px · weight 600 · tracking 1 · uppercase · `rgba(255,255,255,0.78)` |
| Display value | 32px DISPLAY · tracking −1 · lineHeight 38 · `#FFF` |
| Label | 13px · `rgba(255,255,255,0.85)` |
| Sub | 11px · `rgba(255,255,255,0.72)` |
| Icon kapsülü | 44×44 · radius 14 · `rgba(255,255,255,0.18)` |
| Mini-stat kart | radius 14 · padding 10/10 · `rgba(255,255,255,0.16)` |
| Mini-stat eyebrow | 9px · weight 700 · tracking 0.5 · uppercase · `rgba(255,255,255,0.85)` |
| Mini-stat value | 18px DISPLAY · tracking −0.4 · `#FFF` |
| Üst satır → mini-stat gap | `marginTop: 16` |

**Hangi hero ne zaman?**
- **F1** → Genel dashboard, modül özet sayfası (krem zemin, soft, ferah)
- **F2** → Yönetim sayfaları, KPI raporu, tek odakli büyüme/azalma bilgisi (gradient zemin)
- **F3** → Canlı / aktif üretim ekranları, live monitoring (siyah inverted)
- **F1c** → HRHub / sub-hub içine gömülü tek satırlık özet, finansal liste sayfaları,
  performans/teknisyen detayı (dolu accent + mini-stat şeridi). **Compact yüksekliği
  korur; içerik full-bleed.**

---

## 5. Atom'lar

### BigStat
40px display rakam + 10px uppercase etiket. Hero stat row'ları için.
```tsx
<BigStat value="248" label="Aktif" />
```

### PillButton
4 variant: `dark · primary · light · ghost` · radius 999 · 9–10 px dikey padding.
```tsx
<PillButton variant="dark" onPress={fn}>+ Yeni vaka</PillButton>
```

### SecHeader
Eyebrow (10–11px tracking 1.2 uppercase ink[500]) + display title (22–36px) + opt. action linki.
```tsx
<SecHeader eyebrow="10 · Hero Patternleri" title="Üç farklı sayfa açılışı" />
```

### Chip
Etiket çipi. Tone: `neutral · primary · accent · success · warning · danger · info · outline`.
Opsiyonel `dot` ile leading nokta.
```tsx
<Chip tone="success" dot>Tamamlandı</Chip>
```

### StatusChip
Status mini rozeti — pill, küçük, `● Etiket` formatlı.
```tsx
<StatusChip color="#1F6B47" bg="rgba(45,154,107,0.12)" label="ONAYLI" />
```

### KPI Card
Beyaz kart + 18 radius + `ink[200]` border + accent kapsüllü icon + 30px display rakam + 11px subtitle.
```tsx
<KPI icon={Wallet} label="Toplam Prim" value="₺125.430" sub="Bu ay" accent={TH.primary} />
```

### FormInput / DatePicker / Switch / Radio
Standart form atomları. Hepsi `ink[300]` border + 14px label + 13px placeholder.

### HeroF1
F1 Glassmorphism hero. Krem zemin + iç beyaz cam panel. Sayfa açılışı.
```tsx
<HeroF1
  kicker="Prim Motoru · Mayıs 2026"
  title={<>Bu ay <Text style={{ color: TH.primary }}>₺12.430</Text></>}
  description="3 aktif politika · 7 teknisyen · 248 birim hesaplandı."
  stats={[{ value: '248', label: 'Birim' }, { value: '7', label: 'Kişi' }]}
  actions={<PillButton variant="dark">Politikaları Yönet</PillButton>}
/>
```

### HeroCompact (F1c)
Compact stat hero — full-bleed accent + dekoratif daireler + mini-stat şeridi.
Hub içi tek satırlık özet için. Performans hero anatomisini birebir taşır.
```tsx
<HeroCompact
  kicker="Toplam Kar Katkısı"
  value="₺125.430"
  label="5 teknisyen · 78 sa toplam"
  icon={DollarSign}
  miniStats={[
    { label: 'Fire',      value: '−₺320' },
    { label: 'Verim',     value: '%84.5' },
    { label: 'Teknisyen', value: '5' },
  ]}
/>
```

---

## 6. Tab'lar

| Variant | Görsel | Ne zaman |
|---|---|---|
| **Pill** | `padding 4 + bg rgba(0,0,0,0.05) + radius 999` | Üst nav, dashboard sekmeleri |
| **Underline** | `borderBottom 2 ink[900] aktif` | Sayfa içi sub-nav, detay sayfa sekmeleri |
| **Segmented** | `borderRadius 12 + segment border` | View mode (Liste / Kart / Grid) |
| **Vertical** | Sol sidebar + `bg rgba(0,0,0,0.05)` aktif + sol çubuk | Settings, multi-section hub |

---

## 7. Listeler & Kartlar

### Standart Liste Satırı
```
[icon kapsülü 44×44] [Title 15/600] [Sub 12/500]    [Display ₺]  [chevron]
```
- Padding: 16–18
- Divider: `borderBottom 1 ink[100]` (son satırda yok)
- Hover/pressed: `opacity: 0.85`

### KPI Tile (Mobile)
- Dark/soft variant
- Üst: küçük label + δ trend rozeti
- Orta: büyük display value
- Alt: opt. sub yazı

### Order Card
- Sol: hasta + kod + work_type + diş bilgisi
- Sağ: status pill + due bilgisi
- Acil/overdue durumda kırmızı border accent

### Dağılım Kartı (DistCard)

Dashboard özet kartları için standart: **başlık + sağda büyük metrik → tek
yığılmış oranlı şerit → noktalı lejant listesi**. `Statü Dağılımı`, `İş Tipi
Dağılımı`, `Finansal Özet` bu kalıbı kullanır. Showcase: desktop `/dev/patterns`
bölüm **11.9**, mobile bölüm **F7** (`DistCard`/`DistLegendRow`,
mobile `MDistCard`/`MDistRow`).

**Anatomi**
```
┌────────────────────────────────────────────────┐
│ Statü Dağılımı              18  Toplam sipariş   │  başlık 17/600 · metrik DISPLAY 30
│ ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  yığılmış şerit h8, gap 3, radius 4
│ ● Alındı                        2         11%    │  lejant: nokta 8 · etiket · değer 700 · % ink[400]
│ ● Üretimde                      2         11%    │
│ ● Teslim Edildi                14         78%    │
│ Kalite Kontrol · Kuryeye Teslim — 0             │  footer meta: sıfır kalemler (12 ink[400])
└────────────────────────────────────────────────┘
```

**Token tablosu**
| Element | Değer |
|---|---|
| Kart | `cardSolid` (radius 24, padding 26) |
| Başlık | 17px · weight 600 · ls −0.2 · `ink[900]` |
| Metrik | DISPLAY 30px · ls −0.9 · `ink[900]` + 12px `ink[400]` etiket |
| Yığılmış şerit | height 8 · gap 3 · radius 4 · `flex: ratio/total` segmentler |
| Lejant satırı | nokta 8×8 · etiket 14 `ink[700]` (flex) · değer 14/700 `ink[900]` · yüzde 12 `ink[400]` (w40 sağa) |
| Footer meta | 12px `ink[400]` · marginTop 16 (yalnız sıfır olan kalemler) |

**Kurallar**
- Segment oranları `ratio/total` ile normalize; renk = kalemin lejant noktasıyla **aynı**.
- Sıfır sayılı kalemler lejanttan çıkarılıp footer'da toplanır (`… — 0`).
- Yüzdesiz/noktasız satır olabilir (ör. "Ödenen Fatura Adedi" — düz metrik satırı).
- Renk paleti: statü → nötr/kahve/açık-gri tonları; iş tipi → 5'li ayrık palet
  (`#33456B` · `success` · `plum.primary` · `info` · `plum.primaryDeep`);
  finans → `success` (tahsilat) + `warning` (bekleyen).

---

## 8. Steps Timeline

Yatay süreç çizgisi:
- ✓ Tamamlanan (accent dolu)
- ◉ Aktif (glow ring + nabız)
- ○ Bekleyen (boş daire, ink[300] border)
- Aralar 1px çizgi (`ink[200]`)

```tsx
<StepsTimeline steps={['Alındı', 'Üretim', 'Final QC', 'Hazır']} current={1} theme="lab" />
```

---

## 9. Percent Ring Hero

Koyu zemin + soluk track + parlak gradient ring + büyük beyaz knob.

- Outer pill kapsülü
- Inner track (rgba(255,255,255,0.08))
- Gradient ring (primary → primaryDeep)
- Knob: ince beyaz daire + içte küçük accent nokta
- Boyutlar: 56 (liste satırı) · 120 (kart) · 220 (hero)

---

## 10. Mobile Özel Pattern'ler

`patterns-mobile.tsx`'te ek olarak:

### AppBar (mobile)
Top safe-area + sol icon + ortada başlık + sağda bildirim/menü icon'ları.

### FabTabBar
Alt tab bar + ortada FAB. 5 tab + 1 plus.
```tsx
<FabTabBar items={[Home, ListChecks, MessageSquare, User]} fab={{ icon: Plus }} />
```

### PulseHalo
Aktif iş kartının dış halosu — yumuşak nabız.

### QuickTile
Dashboard üst kısımdaki hızlı erişim kartları (4–6 grid).

### ActionListItem
İkon + başlık + alt kod + sağda değer + etiket. Liste sayfa standardı.

---

## 11. Yapma Kuralları

1. **Default Tailwind blue/indigo kullanma** — proje accent'leri var.
2. **Flat shadow yasak** — `shadow-card` veya hiç gölge.
3. **Display başlıklarda bold/semibold yok** — daima light (300).
4. **Emoji kullanma** — line ikon (Lucide) zorunlu.
5. **3D / izometrik / colorful illustration ikonu yok.**
6. **Sabit width yasak** — responsive (`flex`, `minWidth: 0`).
7. **Mobile-only düşünme** — her ekran web'de de güzel olmalı.
8. **NativeWind + StyleSheet karıştırma** — bir komponentte tek yöntem.
9. **Max 4 nested View** — flatten et.
10. **Default tab/section'lar Pill variant'la başlar** — diğerleri özel sebebe bağlı.

---

## 12. Hızlı Başvuru — Cheat Sheet

```ts
// Renkler
const TH = DS.exec;            // Aktif panel teması
const bg = TH.bgSoft;          // Sayfa zemini
const text = DS.ink[900];      // Ana metin
const muted = DS.ink[500];     // İkincil metin

// Tipografi
const display = { fontFamily: 'Inter Tight, Inter, system-ui', fontWeight: '300' };
const eyebrow = { fontSize: 11, fontWeight: '500', letterSpacing: 1.1, textTransform: 'uppercase', color: DS.ink[500] };

// Geometri
const card = { backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: DS.ink[200], padding: 18 };
const heroOuter = { borderRadius: 28, backgroundColor: TH.bg, padding: 24 };
const heroGlass = { backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', padding: 28 };
```

---

## 13. Showcase Linkleri

- `/dev/patterns` — birleşik showcase (Desktop/Mobile switcher)
- `/dev/ds-lab` — token playground
- `/dev/order-detail` — örnek sayfa kompozisyonu

Yeni bir komponent eklendiğinde **mutlaka** `/dev/patterns` showcase'ine de eklenmeli.
