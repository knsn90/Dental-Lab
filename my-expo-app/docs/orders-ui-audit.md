# Orders (Siparişler) — UI/UX Audit

> Faz 1 çıktısı. **Kod değişikliği yok** — yalnız mevcut durumun envanteri, sorunlar,
> dokunulmazlar ve önerilen sıra. Hedef: mevcut SIMAN kabuğu + daha premium/net/hızlı
> **içerik alanı** (sadece Orders sayfası). Sidebar, kabuk, marka, auth, routing, iş
> mantığı, RLS, veri yapıları DEĞİŞMEZ.

Tarih: 2026-08-23 · Ana dosya: `modules/orders/screens/OrdersListScreenV2.tsx` (1793 satır)

---

## 1. Mevcut yapı

Sayfa tek dosyada, panel-agnostik (`detectPanel(segments)` → lab/clinic/doctor/admin;
`usePanelTheme()` ile accent+zemin). Kabuk (PatternsShell) sidebar + üst barı sağlar;
sayfa başlığı `usePageTitleStore('Siparişler')` ile üst bara yazılıyor.

**Desktop düzeni (yukarıdan aşağı):**
1. **Kontrol satırı (tek satır, yoğun):** `SlideTabBar` (Tümü/Planlama/Üretim/KK/Hazır/Teslim + sayı) → hemen ardından **Manuel** pill → **Acil**/**Geciken** toggle pill'leri (yumuşak turuncu/kırmızı zemin) → **Arşiv** toggle (admin) → **Arama** (katlanır ikon) → **Sırala** ikon → **Liste/Kanban** görünüm toggle. Hepsi aynı yatay şeritte.
2. **Tablo** (`DesktopTable` + `DesktopRow`): sütunlar
   `HASTA (avatar+ad+sipariş no) · VAKA (work_type, devam/revizyon öneki) · HEKİM · OLUŞTURMA (tarih+saat) · TESLİM · DURUM (ⓘ + statü chip + Acil/Yeni etiketi) · ⋯ (RowActionsMenu)`.
   Revizyon/devam alt-satırları girintili + `CornerDownRight` + `DEVAM SİPARİŞİ`/`REVİZYON` rozeti.
3. **Empty state** (`EmptyStateV2`), **AdminConfirmDialog** (arşiv/sil onayı).

**Mobile düzeni:** ayrı filtre barı + `MobileOrderCard` (kart liste) / `OrdersKanbanB2Mobile`.

**Durum göstergesi:** `OrderStatusInfo` (ⓘ bilgi) + arkası `tone.bg` **dolgulu yumuşak rozet** + etiket.

---

## 2. UX sorunları

- **Birincil/ikincil hiyerarşi yok:** İş-akışı sekmeleri (birincil navigasyon) ile filtre/sırala/görünüm kontrolleri (ikincil) **aynı şeritte** yarışıyor. Operatör "hangi aşamadayım" ile "hangi filtre açık"ı ayırt edemiyor.
- **İçerik başlığı yok:** Sayfa yalnız üst-bar başlığı taşıyor; "Orders / Tüm vakaların operasyonel görünümü" gibi operasyonel çerçeve yok.
- **Arama gizli:** Katlanır ikon; hasta/hekim/sipariş no/vaka no aramasının keşfedilebilirliği düşük.
- **Tarama zorluğu:** DURUM sütununda ⓘ + dolgulu rozet + (bazen) Acil/Yeni etiketi bir arada — göz gürültüsü; "ne acil / ne gecikti / ne onay bekliyor" hızlı taranamıyor.

## 3. Görsel sorunlar

- **Dolgulu yumuşak rozetler** (her satırda renkli zemin) → plan "küçük nokta + etiket" istiyor; mevcut hâli kalabalık.
- **Renkli toggle pill'leri** (Acil turuncu, Geciken kırmızı, Arşiv amber) her zaman renkli → sakin değil.
- **VAKA↔HEKİM çakışması** (devam/revizyon önekinde) — *2026-08-23 düzeltildi* (önek ayrı, work_type kendi içinde kesiliyor).
- Satır ayraç/hiyerarşi iyi ama birincil (hasta/vaka) ile meta (tarih/saat) ağırlık farkı güçlendirilebilir.

---

## 4. DOKUNULMAZ bileşenler (fixed shell / paylaşılan)

| Bileşen | Neden |
|---|---|
| PatternsShell sidebar, üst bar, ProfileMenu, logo, marka | Uygulama kimliği — plan kapsamı dışı |
| **SlideTabBar** (`core/ui/SlideTabBar`) | **12+ ekranda** kullanılıyor (Finans, Faturalar, Klinikler, users, logs…). Dosyası DÜZENLENMEZ; yalnız mevcut prop'larıyla (items/activeKey/accentColor/style) kullanılır. |
| **OrderStatusInfo** (`core/ui/OrderStatusInfo`) | FilterMenu + RowActionsMenu + Orders'ta paylaşık. Düzenlenmez. |
| **RowActionsMenu** (`core/ui/RowActionsMenu`) | Employees + Orders paylaşık. 3-nokta menü tutarlı kalır. |
| usePanelTheme, mobileDesignTokens, dsTokens, Toast | Tasarım sistemi çekirdeği — token tüketilir, değiştirilmez. |
| Auth, routing, Supabase, RLS, iş mantığı, filtreleme mantığı, sipariş durumları | Plan kapsamı dışı — yalnız sunum katmanı. |

## 5. Güvenle yeniden tasarlanabilir (yalnız Orders'ta tanımlı)

Hepsi `OrdersListScreenV2.tsx` içinde, **başka yerden import edilmiyor**:
- `DesktopTable` / `DesktopRow` (masaüstü tablo + satır)
- `MobileOrderCard` (mobil kart)
- `EmptyStateV2`
- Kontrol satırının **düzeni** (başlık bloğu, sekme/filtre ayrımı, arama alanı, toggle'lar)
- Satır içi **durum sunumu** (dolgulu rozet → nokta+etiket) — `OrderStatusInfo`'yu değiştirmeden, satırda yeni sunum

## 6. Korunacak (yeniden kullanılabilir) bileşenler

- `SlideTabBar` (iş-akışı sekmeleri) — yeniden yazma, mevcut kullan.
- `OrderStatusInfo`, `RowActionsMenu` — API'leri korunur.
- `usePanelTheme()` / token'lar — tüm renk/zemin buradan.

---

## 7. Önerilen uygulama sırası (her fazdan sonra: incele → işlev doğrula → deploy yok)

1. **Header** — içerik başlığı "Siparişler" + alt satır ("Tüm vakaların operasyonel görünümü") + sağda kalıcı arama; yükseklik ölçülü.
2. **Birincil/ikincil ayrım** — iş-akışı sekmeleri (SlideTabBar) başlı başına birinci sıra; filtre/sırala/görünüm ikinci, daha sessiz satır.
3. **Filtre/aksiyon barı** — Acil/Geciken/Arşiv/Manuel/Sırala; sakin nötr stil, aktifken belirginleşen.
4. **Tablo yapısı** — sütun hiyerarşisi (Hasta birincil + sipariş no ikincil; Vaka + meta; Hekim; Tarih; Teslim; Durum; Aksiyon).
5. **Satır hiyerarşisi** — birincil güçlü, ikincil/meta sessiz; ince ayraç; ağır gölge/kenar yok.
6. **Durum sistemi** — küçük **nokta + etiket** (dolgulu rozet yerine); Acil/Revizyon/Gecikmiş yerel ve ölçülü vurgu.
7. **Etkileşim** — hover'da sade zemin + aksiyon affordance; satır tıklama davranışı AYNEN korunur.
8. **Responsive** — 1440/1280/1024/768; ikincil meta kısılır, Hasta/Vaka/Durum korunur.
9. **Görsel QA** — hizalama, yoğunluk, tipografi, sidebar ile tutarlılık.

**Kural:** Her faz izole; SlideTabBar/OrderStatusInfo/RowActionsMenu dosyaları düzenlenmez; filtreleme/rota/veri mantığına dokunulmaz; yalnız `OrdersListScreenV2.tsx` içindeki sunum katmanı değişir.
