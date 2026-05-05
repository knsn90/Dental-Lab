# Design Contract — AI ve Geliştirici İçin Standartlar

Bu dosya, projedeki tüm yeni UI kodu için zorunlu kuralları tanımlar.
Mevcut StyleSheet tabanlı dosyalar dokunulmadan kalır; yeni ekranlar bu kurallarla yazılır.

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
6. **Maksimum 4 nested View** — flatten et
7. **Mobile-only düşünme** — her ekran web'de de güzel olmalı
8. **NativeWind + StyleSheet karıştırma** — bir komponentte tek yöntem

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

Bu dosyayı düzenli güncel tut. Yeni pattern eklendikçe buraya yansıt.
