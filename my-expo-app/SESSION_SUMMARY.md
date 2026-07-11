# Nexadent (LabFlow) — iOS TestFlight Seans Özeti

**Tarih aralığı:** ~Mayıs 2026  
**Hedef:** Apple Developer hesabıyla iOS uygulamasını 10 kişilik TestFlight Internal Testing'e ulaştırmak + tasarım/UX iyileştirme.  
**Platform:** Expo SDK 55 · React Native 0.83.6 · Hermes · iOS 26.4 beta cihazda test.

---

## 🚨 Çözülen Kritik Crash'ler (Build #6 → #14)

### 1. Bundle ID & Apple Team
- `com.dentallab.app` rezerve, kullanılamadı → `com.nexadent.app`'a geçildi
- `app.json`, `ios/DentalLab/Info.plist`, `ios/DentalLab.xcodeproj/project.pbxproj` güncellendi
- Apple Team: `772P3JLQ7W (Kaan Esen Individual)` · App ID: `6772297713`

### 2. EAS Build Hataları
- npm peer dep ERESOLVE (`@types/react@18` vs `@react-native/virtualized-lists`) → `legacy-peer-deps=true` (.npmrc) + `overrides` (package.json)
- `babel-preset-expo@12.0.10` (SDK 51 era) → `~55.0.0` upgrade
- `@react-native/codegen` override 0.83.6 eklendi
- `patch-package` ile node_modules patch'leri kalıcılaştırıldı

### 3. Runtime Crash (cold-start)
- **`react-native-css-interop`** `parseAspectRatio` undefined → null check patch
- **`@supabase/supabase-js`** dynamic `import("@opentelemetry/api")` Hermes ile uyumsuz → `Promise.resolve(null)` patch
- **`expo-secure-store`** iOS 26.4 beta Swift `tryDynamicCastNSErrorObjectToValue` patladı → Supabase auth storage **AsyncStorage'a** geçirildi (`lib/supabase.ts`)
- **OrderDetailScreenV2** `stageName` scope hatası → fonksiyon scope'una taşındı
- **dashboardCacheStore** Hermes strict mode duplicate `lastUpdated:` key → düzeltildi

### 4. Post-Login Crash (iOS 26.4 beta UIKit bug)
- `UISystemKeyboardDockControllerAccessibility._axShowsGlobeKeyAsEmoji` Obj-C exception navigation sırasında → app abort
- **Çözüm**: LoginScreen `handleLogin`'de `Keyboard.dismiss()` + `keyboardDidHide` event bekle (450ms fallback)
- `app/_layout.tsx` Stack `animation: 'none'` (iOS) — transition'la keyboard çakışması önlendi
- Post-login native işler (`notificationPrefs.loadFromProfile`, `notificationsStore.init`, push token) `setTimeout` ile defer (600/1500ms)

### 5. TurboModule Queue Genel Defense
- `node_modules/react-native/ReactCommon/react/nativemodule/core/platform/ios/ReactCommon/RCTTurboModule.mm` iki `@throw exception` → log+swallow (`patches/react-native+0.83.6.patch`)
- iOS 26.4 beta'da herhangi bir native module Obj-C exception fırlatırsa app crash etmez, console'a log düşer

### 6. JS Render Error (post-login)
- Supabase Realtime "cannot add `postgres_changes` callbacks after `subscribe()`" hatası — singleton channel ismi çakışması
- **Çözüm**: `lib/supabase.ts`'de `supabase.channel()` global wrap edildi — her çağrıya `Date.now() + Math.random()` suffix ekleniyor → 30+ farklı `.channel()` call site otomatik korumalı

### 7. Pressable Style Callback Bug
- RN 0.83 + new arch iOS'ta `style={({pressed}) => ({...})}` callback bazen boş obj dönüyor (button invisible)
- AuthShell `AuthButton`, MoreMenuSheet row, LoginScreen eye toggle, register form linkleri → static style array'e çevrildi

### 8. Runtime Defansif Ek
- `core/ui/RootErrorBoundary.tsx` — global JS error catch, kırmızı ekranda hata mesajı görünür
- `installGlobalErrorHandler()` — async/promise rejection log'lanır
- Root layout `<RootErrorBoundary>` Stack'i sarıyor

---

## 🎨 Tasarım & UX İyileştirmeleri

### AuthShell (Login, Register* ekranları)
- Komple yeniden tasarlandı: bottom-sheet style
- Full-screen dental illustration arkaplan
- Beyaz overlay kart üst köşeleri 32px yuvarlak + drag handle
- Klavye açıldığında brand mark + illustration gizlenir (focus)
- `automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}` + `keyboardDismissMode="interactive"`

### LoginScreen
- Forgot password mode toggle (login alanları gizleniyor, sadece email + reset btn)
- "← Giriş sayfasına dön" linki
- Eyebrow/heading dinamik (Şifre Sıfırlama / Şifremi Unuttum)

### NewOrderScreen (4-step form)
- Mobile'da Önizleme + Geri butonları gizlendi → sadece İleri/Gönder
- Outer beyaz pill wrapper kaldırıldı → buton kendi koyu adası
- Sticky absolute → inline footer (form ile birlikte scroll)
- ContentContainerStyle `flexGrow: 1, paddingBottom: 0` → cream şerit yok
- 4 ScrollView'da `keyboardShouldPersistTaps` + auto-adjust insets

### MessagesPopup / MessagesB5Mobile
- Mobile modal → bottom sheet card style
- Backdrop: BlurView (intensity 25, dark tint) + rgba 0.45 overlay
- Sheet alttan slide (spring), %92 height, üst köşeleri 24px
- Drag handle absolute overlay (sheet bg transparent)
- "Sohbetler" başlığı + sağ üst X close
- MessagesB5Mobile içindeki SafeAreaView `edges={[]}` (parent zaten safe area sağlıyor)

### MoreMenuSheet (Daha menüsü)
- Radial speed-dial → **iOS Settings list style** bottom sheet
- Beyaz sheet, drag handle + "Daha" başlığı
- Grouped list card (#F6F5F1, 18px radius)
- Her item: solid accent squircle (36x36, 10px) + label + chevron ›
- Items arası hairline divider (ikon hizasından sonra)
- `style={(state) => ({...})}` → static `rowStyle` (RN 0.83 bug fix)
- Backdrop: BlurView + dark overlay

### AdminApprovalsScreen
- Modern page title "Onaylar" + subtitle
- iOS-style segmented control (full-width, 38px, beyaz active pill + shadow)
- Tab badge counts (kırmızı bullet)

### LabMobileDashboard
- "Aktif üretim" card: web radial gradient + **native solid circle overlays** (saffron warm glow sol üst)
- "Bu hafta" card pill'leri: web `repeating-linear-gradient` + **native SVG Pattern diagonal stripes**

### PillTabBar (alt navbar)
- WhatsApp-style sliding indicator pill
- Cell layouts onLayout ile measure → shared indicator spring x+width
- iOS 26+ `GlassView` (expo-glass-effect), iOS 25- `BlurView`, web `backdrop-filter`

### Search Button (above FAB)
- Plain rgba 0.08 → **liquid glass**: GlassView (iOS 26+) / BlurView (older) / web blur

### ScanB6Mobile (QR Scanner) X butonu
- paddingTop 6 → 16 (dynamic island clearance)
- 36×36 → 44×44 (Apple HIG minimum)
- hitSlop 8 → 16

### RegisterChoiceScreen
- Card içindeki chevron arrow kaldırıldı (cleaner)

---

## 📐 Safe Zone Audit (Phase 2-3)

### `core/ui/useScreenInsets.ts` (reusable hook)
```ts
const { contentContainerStyle } = useScreenInsets({ isDesktop, paddingX: 16 });
```
- paddingTop = `isDesktop ? 8 : insets.top + 8`
- paddingBottom = 120 (PillTabBar clearance)

### Güncellenmiş ekranlar (paddingTop insets + paddingBottom 120)
- **Dashboards**: LabDashboardScreen, DoctorDashboardScreen, ClinicDashboardScreen, AdminDashboard (app/(admin)/index.tsx), StationDashboard (app/(station)/stats.tsx)
- **Liste/Detay**: OrdersListScreenV2 (+ mobile filter bar), OrderDetailScreenV2, ClinicsScreen, EmployeesScreen, DocumentsScreen
- **Finance**: FinanceReportScreen, ProfitabilityScreen, SalariesScreen, AdvancesScreen, TechnicianPerformanceScreen, BudgetScreen
- **Modules**: HRScreen, ServicesScreen, CourierTrackingScreen, StockScreen (top tab bar + ScrollView)

---

## ⌨️ Faz 1 — Keyboard Handling

`core/ui/KeyboardAwareFormScroll.tsx` reusable wrapper oluşturuldu.

Tüm form ScrollView'larına eklenen pattern:
```tsx
keyboardShouldPersistTaps="handled"
keyboardDismissMode="interactive"
automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
```

**Etkilenen 15 dosya**: AuthShell, admin-login, reset-password, ProfileSection, ProfileScreen, ClinicsScreen, HRScreen, PriceListScreen, ServicesScreen, SetupWizardScreen, SupportScreen, GlobalSupportTrigger, checkin, NewOrderScreen (4 step)

---

## 📦 EAS Build Konfigürasyonu

### `eas.json`
- Tüm 3 profile'a (development/preview/production) **env** vars eklendi (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_VAPID_PUBLIC_KEY)
- `submit.production.ios`: `ascAppId: 6772297713`, `appleTeamId: 772P3JLQ7W` (auto-submit hazır)

### `package.json`
- `postinstall: patch-package` script
- `babel-preset-expo: ~55.0.0`
- `@types/react: ~19.0.0` (dev)
- `patch-package: ^8.0.1` (dev)
- `overrides`: `@types/react: ~19.0.0`, `@react-native/codegen: 0.83.6`

### `patches/`
- `react-native-css-interop+0.2.4.patch` — parseAspectRatio null check
- `@supabase+supabase-js+2.106.1.patch` — opentelemetry dynamic import
- `react-native+0.83.6.patch` — TurboModule Obj-C exception swallow

### `ios/Podfile.properties.json`
- `newArchEnabled: "true"` (Reanimated 4 zorunluluğu)

---

## 🏗️ Build Geçmişi

| Build | Sorun / Düzeltme |
|---|---|
| #6 | Post-login UIKeyboardScene crash |
| #7-10 | Çeşitli native crash'ler (TurboModule queue) |
| #11 | `SecureStore` → `AsyncStorage` geçişi |
| #12 | Login keyboard fix + Stack animation none |
| #13 | New arch off denedi (Reanimated 4 fail) → geri alındı |
| #14 | RN TurboModule patch → cold-start sorunsuz |
| #15-16 | JS realtime channel collision fix |
| #17 | Dev Client (simulator) build |
| #18 | Production: tüm seans değişiklikleri (icon değişmedi — Nexadent N-tooth lacivert kaldı) |

---

## ⚠️ Bilinen / Kalan İşler

1. **App Icon**: Mavi tooth + `</>` code symbol icon'u istendi. `assets/images/icon.png` HENÜZ DEĞİŞMEDİ — Nexadent N-tooth lacivert build'lerde aktif. Yeni icon dosyaya kaydedilince bir sonraki build'de aktif olur.
2. **Yeni iş emri formu** "Yeni iş emri oluştur" CTA card'dan açıldığında farklı şekilde açılıyormuş — incelenmedi.
3. **Pressable callback bug** projedeki ~35+ noktada (style fn yerine static) hâlâ uygulanmamış (sadece AuthButton + MoreMenuSheet row + birkaç login form Pressable'ında düzeltildi).
4. **Metro hot reload** seans sonunda bozulmuş gibi davrandı — yeni build cache sıfırlandığında düzelir.

---

## 🛠️ Reusable Bileşenler/Hook'lar (Yeni)

- `core/ui/KeyboardAwareFormScroll.tsx`
- `core/ui/useScreenInsets.ts`
- `core/ui/RootErrorBoundary.tsx`

---

## 📂 Dokümantasyon Linkleri

- **TestFlight URL**: https://appstoreconnect.apple.com/apps/6772297713/testflight/ios
- **EAS Project**: @kaanesen/dental-lab-app
- **Apple Team**: 772P3JLQ7W (Kaan Esen Individual)

---

## ▶️ Sonraki Seans için Komutlar

```bash
# Build + TestFlight auto-submit
cd /Users/saber/Desktop/DentalSoftware/my-expo-app
npx eas-cli@latest build --platform ios --profile production --auto-submit --non-interactive

# Metro dev (simulator)
npx expo start --dev-client --clear

# Local Metro yeniden başlat (cache reset)
rm -rf node_modules/.cache .expo
npm start
```
