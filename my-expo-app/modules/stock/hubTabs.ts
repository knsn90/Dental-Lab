/**
 * Stok & Depo hub sekmeleri — tek kaynak.
 *
 * StockScreen bu listeyi hem kenar çubuğunu çizmek hem de aktif sekmenin
 * içeriğini seçmek için kullanır. Ayrı dosyada durmasının sebebi: liste
 * ekranın kendisinden bağımsız (route yönlendirmeleri de anahtarları kullanır).
 *
 * BİRLEŞTİRME (2026-08): kenar çubuğu 11 satırdan 8'e indi. Sebep yalnız
 * uzunluk değildi — aynı soru birden çok sekmede farklı yöntemle
 * cevaplanıyordu: "stok değeri" hem Maliyet'te (miktar × son fiyat) hem
 * FIFO'da (gerçek katman), "ne sipariş edeyim" ise Sipariş Öner + Tahmin +
 * FIFO'da. Artık her soru tek üst sekmede, yöntem farkı alt sekmede.
 */

import {
  Grid3x3, Package, ArrowLeftRight, ShoppingCart, BarChart3,
  MapPin, Layers, TrendingUp, Inbox, Settings,
  Zap, CheckCircle, ScanSearch, Sliders, Coins, List,
} from 'lucide-react-native';

export type TabKey =
  | 'dashboard' | 'list' | 'movements' | 'orders' | 'analytics'
  | 'cost' | 'material_requests' | 'setup';

export interface StockTabDef {
  key:    TabKey;
  label:  string;
  icon:   React.ComponentType<any>;
  accent: string;
  hint:   string;
}

export const STOCK_TABS: StockTabDef[] = [
  { key: 'dashboard',   label: 'Dashboard',        icon: Grid3x3,        accent: '#0F172A', hint: 'Genel bakış, özet ve kritik durumlar'          },
  { key: 'list',        label: 'Ürünler',          icon: Package,        accent: '#2563EB', hint: 'Ürün listesi, kategori ve raf yerleşimi'       },
  { key: 'movements',   label: 'Hareketler',       icon: ArrowLeftRight, accent: '#EA7A4C', hint: 'Giriş, çıkış ve fire hareketleri'              },
  { key: 'orders',      label: 'Sipariş & Tahmin', icon: ShoppingCart,   accent: '#D97706', hint: 'Ne zaman biter, ne sipariş edilmeli'           },
  { key: 'analytics',   label: 'Analiz',           icon: BarChart3,      accent: '#0EA5E9', hint: 'Tüketim ve fire analizi'                       },
  { key: 'cost',        label: 'Maliyet',          icon: Coins,          accent: '#059669', hint: 'Stok değeri ve fiyat geçmişi'                  },
  { key: 'material_requests', label: 'Malzeme Talepleri', icon: Inbox,   accent: '#D97706', hint: 'Teknisyen ve mesul müdür sarf/alet talepleri'  },
  { key: 'setup',       label: 'Kurulum',          icon: Sliders,        accent: '#7C3AED', hint: 'Kategori, marka ve miktarsız tüketim akışı'    },
];

// ── Alt sekmeler ────────────────────────────────────────────────────────────

export interface SubTabDef {
  key:   string;
  label: string;
  icon:  React.ComponentType<any>;
  hint:  string;
}

/** Ürünler: liste ile raf yerleşimi aynı verinin iki görünümü */
export const LIST_SUBTABS: SubTabDef[] = [
  { key: 'items',     label: 'Liste',    icon: List,   hint: 'Ürün listesi, kategori ve stok seviyeleri' },
  { key: 'locations', label: 'Lokasyon', icon: MapPin, hint: 'Raf, bölüm ve barkod yerleşimi' },
];

/** Sipariş & Tahmin: üç yöntem, aynı soru — hangisi neye bakıyor yazılı */
export const ORDER_SUBTABS: SubTabDef[] = [
  { key: 'critical', label: 'Kritik seviye',   icon: ShoppingCart, hint: 'Minimum eşiğinin altına düşen kalemler' },
  { key: 'forecast', label: 'Tükeniş tahmini', icon: TrendingUp,   hint: 'Tüketim hızına göre kaç gün kaldı' },
  { key: 'fifo',     label: 'FIFO önerisi',    icon: Layers,       hint: 'Gerçek alış katmanları + tüketim hızı' },
];

/** Maliyet: değer FIFO'dan (doğru kaynak), geçmiş alış hareketlerinden */
export const COST_SUBTABS: SubTabDef[] = [
  { key: 'value',   label: 'Stok değeri',   icon: Layers, hint: 'Gerçek alış katmanlarından güncel değer' },
  { key: 'history', label: 'Fiyat geçmişi', icon: Coins,  hint: 'Kalem bazında alış fiyatı seyri' },
];

/** Kurulum: genel ayarlar + miktarsız tüketim akışının dört adımı */
export const SETUP_SUBTABS: SubTabDef[] = [
  { key: 'general',                label: 'Kategori & Marka',   icon: Settings,    hint: 'Kategori, marka ve genel yapılandırma' },
  { key: 'material_mapping',       label: 'Malzeme Eşleştirme', icon: Layers,      hint: 'Hangi stok kalemi hangi üretim malzemesi' },
  { key: 'consumption_profile',    label: 'Tüketim Profili',    icon: Zap,         hint: 'Teknisyen miktar girmez — tüketimi kurallar hesaplar' },
  { key: 'inventory_verification', label: 'Stok Sayımı',        icon: CheckCircle, hint: 'Saydığınız gerçek miktarı sistemle karşılaştırın' },
  { key: 'consumption_audit',      label: 'Tüketim Denetimi',   icon: ScanSearch,  hint: 'Girilmiş kayıtları profille karşılaştır' },
];

export const SUBTABS: Partial<Record<TabKey, SubTabDef[]>> = {
  list:   LIST_SUBTABS,
  orders: ORDER_SUBTABS,
  cost:   COST_SUBTABS,
  setup:  SETUP_SUBTABS,
};

/**
 * Eski URL anahtarları → yeni sekme + alt sekme.
 * Kayıtlı bağlantılar ve tarayıcı geçmişi kırılmasın diye.
 */
export const LEGACY_TAB_MAP: Record<string, { tab: TabKey; sub?: string }> = {
  suggestions:            { tab: 'orders', sub: 'critical' },
  forecast:               { tab: 'orders', sub: 'forecast' },
  fifo_reorder:           { tab: 'orders', sub: 'fifo' },
  locations:              { tab: 'list',   sub: 'locations' },
  settings:               { tab: 'setup',  sub: 'general' },
  inventory_config:       { tab: 'setup',  sub: 'material_mapping' },
  material_mapping:       { tab: 'setup',  sub: 'material_mapping' },
  consumption_profile:    { tab: 'setup',  sub: 'consumption_profile' },
  inventory_verification: { tab: 'setup',  sub: 'inventory_verification' },
  consumption_audit:      { tab: 'setup',  sub: 'consumption_audit' },
};

/** Sekmenin görünürlüğü — hub ve alt sayfalar aynı RBAC kurallarını uygular */
export function isTabVisible(
  key: TabKey,
  can: (perm: string) => boolean,
): boolean {
  if (key === 'cost')  return can('view_stock_cost');
  if (key === 'setup') return can('manage_stock_categories');
  return true;
}

/** Alt sekmenin görünürlüğü — birleştirilen eski sekmelerin yetkileri korunur */
export function isSubTabVisible(
  tab: TabKey,
  sub: string,
  can: (perm: string) => boolean,
): boolean {
  if (tab === 'list'   && sub === 'locations') return can('view_stock_locations');
  if (tab === 'orders' && sub === 'forecast')  return can('view_stock_forecast');
  return true;
}
