/**
 * PermissionsScreen — Yetkiler Yönetim Paneli (Patterns Design Language)
 *
 * Left: role selector (admin, lab_manager, technician, courier, clinic_admin, doctor)
 * Right: grouped toggle permissions
 * Desktop sidebar + content, mobile stacked.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  useWindowDimensions, Platform, Animated, AccessibilityInfo,
} from 'react-native';

// ── Toggle → uygulamanın ortak iOS anahtarı (AppSwitch: yaylı kayma, RTL, koyu tema) ──
function Toggle({ on, disabled, onPress, accentColor, label }: { on: boolean; disabled?: boolean; onPress: () => void; accentColor: string; label?: string }) {
  return <AppSwitch value={on} onValueChange={() => onPress()} accentColor={accentColor} disabled={disabled} accessibilityLabel={label} />;
}
import { supabase } from '../../../core/api/supabase';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import {
  type RoleKey,
  type PermissionKey,
  ROLE_LABELS,
  PERMISSION_CATEGORIES,
  FEATURES,
  usePermissionStore,
} from '../../../core/store/permissionStore';
import {
  Shield, Users, Wrench, Stethoscope, Building2, Truck,
  Check, Save, RotateCcw, Lock, User as UserIcon, Search, X, ChevronDown,
  ChevronRight, ChevronLeft, AlertTriangle,
} from '../../../core/ui/icons';
import { useAuthStore } from '../../../core/store/authStore';
import { isRTL } from '../../../core/i18n';
import { toast } from '../../../core/ui/Toast';
import { autoT } from '../../../core/i18n/autoTranslate';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';

/** Accent zemin üstündeki yazı/ikon rengi — safran (#F5C24B) üstünde beyaz okunmaz. */
function onAccent(accent: string): string {
  return (accent ?? '').toUpperCase() === '#F5C24B' ? '#0A0A0A' : '#FFFFFF';
}

/** Rolde gösterilen (whitelist + sadece-görüntüle süzgecinden geçen) yetki anahtarları. */
function visibleKeysForRole(role: RoleKey | null): string[] {
  const allowed = allowedFeatureSetForRole(role);
  const viewOnly = viewOnlyFeaturesForRole(role);
  const out: string[] = [];
  for (const f of FEATURES) {
    if (allowed && !allowed.has(f.key)) continue;
    if (f.hasView) out.push(`view_${f.key}`);
    if (f.hasManage && !viewOnly.has(f.key)) out.push(`manage_${f.key}`);
  }
  return out;
}

// ─── Patterns Tokens ─────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// ─── Role config ─────────────────────────────────────────────
// Admin is excluded — admin always has full access, no need to manage
// Renkler panel `accentColor` prop'undan gelir; her rol için sadece ikon farklı.
const ROLE_CONFIG: { key: RoleKey; icon: React.ComponentType<any> }[] = [
  { key: 'lab_manager',  icon: Users      },
  { key: 'technician',   icon: Wrench     },
  { key: 'doctor',       icon: Stethoscope },
  { key: 'clinic_admin', icon: Building2  },
  { key: 'courier',      icon: Truck      },
];

// ── Hekim/klinik rollerinin görebileceği feature'lar (whitelist) ──────────
// Hekim ve klinik yöneticisinin ASLA erişmemesi gereken lab-özel alanlar
// (mali, HR, stok, üretim-içi, fiyat/bütçe, yetkiler, entegrasyon, log,
// analitik, kurye, tedarikçi, demirbaş vb.) yetki ekranında bu roller için
// HİÇ GÖSTERİLMEZ — bir gün yanlışlıkla açılıp veriye erişilmesin diye.
// (Veri erişimi ayrıca RLS ile kiracı-bazlı korunur; bu ek bir emniyet katmanı.)
const DOCTOR_ALLOWED_FEATURES = new Set<string>([
  'orders', 'order_create', 'order_pricing', 'approvals', 'design',
  'invoices', 'deliveries', 'messages', 'support', 'settings',
]);
const CLINIC_ADMIN_ALLOWED_FEATURES = new Set<string>([
  ...DOCTOR_ALLOWED_FEATURES, 'customers', 'users',
]);
// Teknisyen: üretim alanı (üretim/tasarım/QC/fire/istasyon) + kendi işi (sipariş,
// mesaj, devam) + envanter GÖRME. Mali/İK-hassas/kullanıcı/yetki/ayar/fiyat vb. YOK.
const TECHNICIAN_ALLOWED_FEATURES = new Set<string>([
  'orders', 'design', 'messages', 'production', 'waste', 'stages', 'qc',
  'attendance', 'stock', 'stock_movements', 'stock_locations',
]);
// Kurye: teslimat + sipariş görme + mesaj. Başka hiçbir lab alanı YOK.
const COURIER_ALLOWED_FEATURES = new Set<string>([
  'deliveries', 'orders', 'messages',
]);
/** Rol için izinli feature seti; lab_manager/admin → null (kısıtlama yok). */
function allowedFeatureSetForRole(role: RoleKey | null): Set<string> | null {
  if (role === 'doctor')       return DOCTOR_ALLOWED_FEATURES;
  if (role === 'clinic_admin') return CLINIC_ADMIN_ALLOWED_FEATURES;
  if (role === 'technician')   return TECHNICIAN_ALLOWED_FEATURES;
  if (role === 'courier')      return COURIER_ALLOWED_FEATURES;
  return null;
}

// ── Sadece-görüntüle feature'lar (YÖNET toggle'ı gizlenir) ────────────────
// Bu feature'ları hekim/klinik yalnız GÖREBİLİR, yönetemez:
//   • invoices  → fatura kesme/tahsilat lab tarafıdır (hekim yalnız görür)
//   • deliveries→ kurye atama/durum lab operasyonudur
//   • settings  → LAB genel ayarları; müşteri kendi ayarını zaten başka yerden yönetir
const DOCTOR_VIEW_ONLY = new Set<string>(['invoices', 'deliveries', 'settings']);
const CLINIC_ADMIN_VIEW_ONLY = new Set<string>(['deliveries', 'settings']);
// Teknisyen: envanter ve devam kayıtlarını yalnız görür (tanım/İK yönetimi değil).
const TECHNICIAN_VIEW_ONLY = new Set<string>(['attendance', 'stock', 'stock_movements', 'stock_locations']);
// Kurye: siparişleri yalnız görür (teslimat durumunu yönetir).
const COURIER_VIEW_ONLY = new Set<string>(['orders']);
const _EMPTY_SET = new Set<string>();
function viewOnlyFeaturesForRole(role: RoleKey | null): Set<string> {
  if (role === 'doctor')       return DOCTOR_VIEW_ONLY;
  if (role === 'clinic_admin') return CLINIC_ADMIN_VIEW_ONLY;
  if (role === 'technician')   return TECHNICIAN_VIEW_ONLY;
  if (role === 'courier')      return COURIER_VIEW_ONLY;
  return _EMPTY_SET;
}
/** catKey için: role göre feature'ları filtrele + sadece-görüntüle olanlarda YÖNET'i kapat. */
function featuresForCategory(
  catKey: string,
  allowed: Set<string> | null,
  viewOnly: Set<string>,
): typeof FEATURES {
  return FEATURES
    .filter(f => f.category === catKey && (!allowed || allowed.has(f.key)))
    .map(f => (viewOnly.has(f.key) ? { ...f, hasManage: false } : f));
}

// ═════════════════════════════════════════════════════════════
// ── Kritik yetki rozeti ──────────────────────────────────────────────────
// Yanlış verildiğinde parasal/hukuki sonucu olan yetkiler (para görünürlüğü,
// özlük verisi, yetki/ayar değiştirme) katalogda `critical` ile işaretli.
/** Yükleme hatası kartı — boş liste yerine gösterilir, Kaydet kilitli kalır. */
function LoadErrorCard({ title, onRetry }: { title: string; onRetry: () => void }) {
  const U = useInkUI();
  return (
    <View style={[U.cardSolid, { alignItems: 'center', gap: 10, paddingVertical: 32 }]}>
      <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipTones.danger.bg }}>
        <AlertTriangle size={20} color={U.chipTones.danger.fg} strokeWidth={1.8} />
      </View>
      <Text style={{ fontSize: 14, fontWeight: '700', color: U.ink[900], textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontSize: 12, color: U.ink[500], textAlign: 'center', maxWidth: 360, lineHeight: 17 }}>
        Mevcut yetkiler okunamadığı için kaydetme kapatıldı. Boş liste kaydedilirse tüm yetkiler silinirdi.
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9999, borderWidth: 1, backgroundColor: U.plainBtn.bg, borderColor: U.plainBtn.border }}
      >
        <RotateCcw size={13} color={U.plainBtn.fg} strokeWidth={1.8} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>Tekrar dene</Text>
      </Pressable>
    </View>
  );
}

function CriticalBadge() {
  const U = useInkUI();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 3,
      paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 999,
      backgroundColor: U.isDark ? 'rgba(232,155,42,0.22)' : 'rgba(232,155,42,0.14)',
    }}>
      <AlertTriangle size={9} color={U.isDark ? '#F0C078' : '#9C5E0E'} strokeWidth={2.4} />
      <Text style={{ fontSize: 9, fontWeight: '800', color: U.isDark ? '#F0C078' : '#9C5E0E', letterSpacing: 0.3 }}>KRİTİK</Text>
    </View>
  );
}

// ── İlerleme çubuğu ──────────────────────────────────────────────────────
function MiniBar({ value, total, color }: { value: number; total: number; color: string }) {
  const U = useInkUI();
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View style={{ width: 64, height: 4, borderRadius: 2, backgroundColor: U.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}

/**
 * Yetki kategorisi — rol bazlı ve kullanıcı bazlı modda AYNI bileşen.
 * (Eskiden iki yerde birebir kopyalanmıştı; biri değişince diğeri kalıyordu.)
 *
 * Katlanabilir: 13 kategori × ~4 satır aynı anda açık olunca ekran okunmuyordu.
 * Kolonlar sabit genişlikte hizalanır (Özellik | Görme | Yönetme).
 */
type AskConfirm = (o: { title: string; message: string; highlight?: string; label: string; variant: 'danger' | 'warning' | 'info' }) => Promise<boolean>;

/** Uygulamanın ortak ConfirmDialog'unu Promise ile kullan (tarayıcı confirm'i yerine). */
function useConfirmDialog(): [React.ReactNode, AskConfirm] {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolver = React.useRef<((ok: boolean) => void) | null>(null);
  const ask: AskConfirm = useCallback((o) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setState({ ...o, onConfirm: () => { resolver.current = null; setState(null); resolve(true); } });
  }), []);
  const close = () => { const r = resolver.current; resolver.current = null; setState(null); r?.(false); };
  return [<ConfirmDialog key="perm-confirm" state={state} onClose={close} />, ask];
}

/** Hafif segment kontrolü (filtre) — gri iz üstünde beyaz seçili yüzey (U.segActive).
 *  Ana gezinme SlideTabBar'da; bu ikincil kontrol onunla yarışmasın diye accent dolgusuz. */
function Segmented<K extends string>({ options, value, onChange }: {
  options: { key: K; label: string; icon?: React.ComponentType<any> }[];
  value: K;
  onChange: (k: K) => void;
}) {
  const U = useInkUI();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 2, padding: 3, borderRadius: 9999, alignSelf: 'flex-start',
        backgroundColor: U.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
        borderWidth: 1, borderColor: U.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
      }}
    >
      {options.map(o => {
        const on = o.key === value;
        const Icon = o.icon;
        return (
          <Pressable
            key={o.key}
            onPress={() => { if (!on) onChange(o.key); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={({ hovered, pressed }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: on ? 18 : 12, paddingVertical: 7, borderRadius: 9999,
              backgroundColor: on ? U.segActive : (hovered ? (U.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)') : 'transparent'),
              opacity: pressed ? 0.75 : 1,
              ...(on && Platform.OS === 'web' ? { boxShadow: U.isDark ? 'none' : '0 1px 4px rgba(15,23,42,0.12)' } as any : {}),
              ...(Platform.OS === 'web' ? { cursor: on ? 'default' : 'pointer', transition: 'background-color 160ms ease-out' } as any : {}),
            })}
          >
            {Icon ? <Icon size={13} color={on ? U.ink[900] : U.ink[500]} strokeWidth={on ? 2 : 1.8} /> : null}
            <Text style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? U.ink[900] : U.ink[500] }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Kaydedilmemiş değişiklik varken altta sabit duran çubuk — sayfa ne kadar kaysa da görünür. */
function SaveDock({ visible, count, saving, onSave, onReset, accentColor, bottom, compact }: {
  visible: boolean; count: number; saving: boolean; onSave: () => void; onReset: () => void; accentColor: string; bottom: number; compact?: boolean;
}) {
  const U = useInkUI();
  const fg = onAccent(accentColor);
  // Alttan girer, aynı yoldan çıkar (yay, sekmesiz). "Hareketi azalt" açıksa yalnız solar.
  const progress = React.useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [reduceMotion, setReduceMotion] = useState(false);
  const lastCount = React.useRef(count);
  if (visible && count > 0) lastCount.current = count;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then(v => { if (alive) setReduceMotion(!!v); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (visible) setMounted(true);
    progress.stopAnimation();
    const anim = reduceMotion
      ? Animated.timing(progress, { toValue: visible ? 1 : 0, duration: 160, useNativeDriver: Platform.OS !== 'web' })
      : Animated.spring(progress, { toValue: visible ? 1 : 0, damping: 26, stiffness: 320, mass: 1, overshootClamping: true, useNativeDriver: Platform.OS !== 'web' });
    anim.start(({ finished }) => { if (finished && !visible) setMounted(false); });
  }, [visible, reduceMotion]);

  if (!mounted) return null;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 24, 0] });
  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={{
        position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
        left: 0, right: 0, bottom, alignItems: 'center', zIndex: 60, paddingHorizontal: PAGE_PADDING,
        opacity: progress, transform: [{ translateY }],
      }}
    >
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingLeft: 16, paddingRight: 6, paddingVertical: 6, borderRadius: 9999,
          backgroundColor: U.isDark ? '#1B1916' : '#FFFFFF',
          borderWidth: 1, borderColor: U.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
          ...(Platform.OS === 'web'
            ? { boxShadow: U.isDark ? '0 10px 30px rgba(0,0,0,0.55)' : '0 10px 30px rgba(15,23,42,0.18)' } as any
            : { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }),
        }}
      >
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: U.chipTones.warning.fg }} />
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: U.ink[900], flexShrink: 1 }}>
          {lastCount.current} {compact ? autoT('değişiklik') : autoT('değişiklik kaydedilmedi')}
        </Text>
        <Pressable
          onPress={onReset}
          disabled={saving}
          accessibilityRole="button"
          style={({ hovered }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999,
            backgroundColor: hovered ? U.plainBtn.hoverBg : U.plainBtn.bg,
            borderWidth: 1, borderColor: U.plainBtn.border,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
        >
          <RotateCcw size={13} color={U.plainBtn.fgMuted} strokeWidth={1.8} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: U.plainBtn.fg }}>Vazgeç</Text>
        </Pressable>
        <Pressable
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          style={({ pressed }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 18, paddingVertical: 8, borderRadius: 9999,
            backgroundColor: accentColor, opacity: saving ? 0.6 : (pressed ? 0.85 : 1),
            ...(Platform.OS === 'web' ? { cursor: saving ? 'wait' : 'pointer' } as any : {}),
          })}
        >
          <Save size={13} color={fg} strokeWidth={2} />
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: fg }}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function PermissionCategory({
  catLabel, features, isOn, onToggle, onToggleAll, confirm,
  accentColor, isDesktop, expanded, onToggleExpanded, query, filter,
}: {
  catLabel: string;
  features: typeof FEATURES;
  isOn: (k: string) => boolean;
  onToggle: (k: string) => void;
  onToggleAll: (keys: string[], on: boolean) => void;
  confirm: AskConfirm;
  accentColor: string;
  isDesktop: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  query: string;
  filter: 'all' | 'on' | 'off' | 'critical';
}) {
  const U = useInkUI();
  const q = query.trim().toLocaleLowerCase('tr-TR');

  const keysOf = (f: typeof FEATURES[number]) => {
    const out: string[] = [];
    if (f.hasView)   out.push(`view_${f.key}`);
    if (f.hasManage) out.push(`manage_${f.key}`);
    return out;
  };

  // Arama + filtre yalnız GÖRÜNÜMÜ daraltır; sayaç ve toplu işlem kategorinin
  // tamamı üzerinden çalışır (kullanıcı yanlışlıkla yarısını açmasın).
  const visible = features.filter(f => {
    if (q && !(`${f.label} ${f.desc ?? ''}`.toLocaleLowerCase('tr-TR').includes(q))) return false;
    if (filter === 'critical') return !!f.critical;
    if (filter === 'on')  return keysOf(f).some(k => isOn(k));
    if (filter === 'off') return keysOf(f).some(k => !isOn(k));
    return true;
  });
  if (visible.length === 0) return null;

  const allKeys = features.flatMap(keysOf);
  const activeCount = allKeys.filter(isOn).length;
  const allOn = activeCount === allKeys.length;
  const COL = isDesktop ? 84 : 60;
  // Arama/filtre varken eşleşen satırlar kapalı kategoride saklı kalmasın.
  const open = expanded || !!q || filter !== 'all';

  return (
    <View style={U.cardSolid}>
      {/* Başlık: ad · oran · çubuk · toplu işlem */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          onPress={onToggleExpanded}
          // object style ZORUNLU — fonksiyon-stili native'de flexDirection:'row'yu
          // düşürüp ikonu etiketin üstüne alıyordu (bkz. [[feedback_native_pressable_row_collapse]]).
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
          }}
        >
          <View style={{ transform: [{ rotate: open ? (isRTL() ? '-90deg' : '90deg') : '0deg' }] }}>
            {isRTL()
              ? <ChevronLeft size={15} color={U.ink[400]} strokeWidth={2.2} />
              : <ChevronRight size={15} color={U.ink[400]} strokeWidth={2.2} />}
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: U.ink[900], letterSpacing: -0.2 }}>{catLabel}</Text>
          <Text style={{ fontSize: 12, color: U.ink[400] }}>{activeCount}/{allKeys.length}</Text>
          <MiniBar value={activeCount} total={allKeys.length} color={accentColor} />
        </Pressable>

        <Pressable
          onPress={async () => {
            // Toplu AÇMA kritik yetki (fiyat, maaş, kasa…) içeriyorsa onay iste
            if (!allOn) {
              const crit = features.filter(f => f.critical && keysOf(f).some(k => !isOn(k)));
              if (crit.length > 0) {
                const ok = await confirm({
                  title: autoT('Kritik yetkiler açılacak'),
                  highlight: crit.map(f => autoT(f.label)).join(', '),
                  message: autoT('de açılacak. Bu yetkiler fiyat, maaş, kasa veya sistem ayarları gibi hassas alanlara erişim verir.'),
                  label: autoT('Tümüne izin ver'),
                  variant: 'warning',
                });
                if (!ok) return;
              }
            }
            onToggleAll(allKeys, !allOn);
          }}
          accessibilityRole="button"
          style={({ pressed, hovered }: any) => ({
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
            backgroundColor: hovered ? (U.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)') : 'transparent',
            opacity: pressed ? 0.6 : 1,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
          })}
        >
          <Text style={{ fontSize: 11.5, fontWeight: '600', color: U.ink[700] }}>
            {allOn ? 'Tümünü kaldır' : 'Tümüne izin ver'}
          </Text>
        </Pressable>
      </View>

      {open && (
        <>
          {/* Kolon başlıkları — satırlarla aynı sabit genişlik */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            paddingBottom: 8, marginTop: 14, marginBottom: 2,
            borderBottomWidth: 1, borderBottomColor: U.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
          }}>
            <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: U.ink[400], letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Yetki
            </Text>
            <Text numberOfLines={1} style={{ width: COL, textAlign: 'center', fontSize: 10, fontWeight: '700', color: U.ink[400], letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {isDesktop ? 'Görüntüle' : 'Gör'}
            </Text>
            <Text numberOfLines={1} style={{ width: COL, textAlign: 'center', fontSize: 10, fontWeight: '700', color: U.ink[400], letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Yönet
            </Text>
          </View>

          {visible.map((f, idx) => (
            <View
              key={f.key}
              style={{
                flexDirection: 'row', alignItems: 'center',
                paddingVertical: 12,
                borderTopWidth: idx > 0 ? 1 : 0,
                borderTopColor: U.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              }}
            >
              <View style={{ flex: 1, paddingEnd: 12, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: U.ink[900] }}>{f.label}</Text>
                  {f.critical && <CriticalBadge />}
                </View>
                {!!f.desc && (
                  <Text style={{ fontSize: 11.5, color: U.ink[400], lineHeight: 16 }}>{f.desc}</Text>
                )}
              </View>
              <View style={{ width: COL, alignItems: 'center' }}>
                {f.hasView
                  ? <Toggle on={isOn(`view_${f.key}`)} onPress={() => onToggle(`view_${f.key}`)} accentColor={accentColor} label={`${autoT(f.label)} · ${autoT('Görüntüle')}`} />
                  : <Text style={{ fontSize: 11, color: U.ink[300] }}>—</Text>}
              </View>
              <View style={{ width: COL, alignItems: 'center' }}>
                {f.hasManage
                  ? <Toggle on={isOn(`manage_${f.key}`)} onPress={() => onToggle(`manage_${f.key}`)} accentColor={accentColor} label={`${autoT(f.label)} · ${autoT('Yönet')}`} />
                  : <Text style={{ fontSize: 11, color: U.ink[300] }}>—</Text>}
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

interface PermissionsScreenProps {
  /** When true, skip own sidebar/title — parent (SettingsHub) provides those */
  embedded?: boolean;
  accentColor?: string;
}

export function PermissionsScreen({ embedded = false, accentColor = '#004B87' }: PermissionsScreenProps = {}) {
  const { setTitle, clear } = usePageTitleStore();
  const { profile } = useAuthStore();
  const U = useInkUI();

  // ── Admin-only gate — sadece admin user_type yetki yönetebilir ──
  // Lab manager, klinik admin, doctor vs. bu sayfayı açamasın bile.
  // RPC seviyesinde de korumalı (set_role_permissions admin check yapar) ama
  // UI'da da net feedback ver.
  const isAdmin = profile?.user_type === 'admin';

  useEffect(() => {
    if (!embedded) {
      setTitle('Yetkiler', '');
      return clear;
    }
  }, [embedded]);

  // Admin değilse — kilitli kart göster
  if (profile && !isAdmin) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <View style={{
          width: '100%', maxWidth: 460,
          backgroundColor: U.isDark ? U.surface : '#FFFFFF', borderRadius: 24, padding: 32,
          borderWidth: 1, borderColor: U.isDark ? U.hairline : 'rgba(0,0,0,0.05)',
          alignItems: 'center', gap: 16,
          ...(Platform.OS === 'web' ? { boxShadow: U.isDark ? '0 8px 24px rgba(0,0,0,0.4)' : '0 8px 24px rgba(0,0,0,0.06)' } : {}),
        } as any}>
          <View style={{
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: 'rgba(220,38,38,0.10)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={26} color="#DC2626" strokeWidth={1.8} />
          </View>
          <Text style={{ ...DISPLAY, fontSize: 22, lineHeight: 26, letterSpacing: -0.4, color: U.ink[900], textAlign: 'center' }}>
            Yetki yönetimi
          </Text>
          <Text style={{ fontSize: 14, color: U.ink[500], textAlign: 'center', lineHeight: 20 }}>
            Rol bazlı izin atama yalnızca <Text style={{ fontWeight: '700', color: U.ink[900] }}>admin</Text> kullanıcıları tarafından yapılabilir.
            Bir kişinin rolünü değiştirmek için <Text style={{ fontWeight: '600', color: U.ink[800] }}>Ayarlar → Kullanıcılar</Text> sayfasını kullanın.
          </Text>
        </View>
      </View>
    );
  }

  return <PermissionsEditor embedded={embedded} accentColor={accentColor} />;
}

/**
 * Asıl editör. Ayrı bileşen: yukarıdaki admin kapısı erken return yaptığı için
 * tüm hook'lar burada, koşulsuz çalışır (profil sonradan yüklenince hook sırası
 * değişip React çökmesin).
 */
function PermissionsEditor({ embedded, accentColor }: { embedded: boolean; accentColor: string }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const { fetchPermissions: refreshMyPerms } = usePermissionStore();
  const myLabId = useAuthStore(s => (s.profile as any)?.lab_id as string | null | undefined);
  const U = useInkUI();
  const [confirmNode, askConfirm] = useConfirmDialog();

  // ── Mode: 'role' (rol bazlı) | 'user' (kullanıcı bazlı override) ──
  const [mode, setMode] = useState<'role' | 'user'>('role');

  const [activeRole, setActiveRole] = useState<RoleKey>('lab_manager');
  const [rolePerms, setRolePerms] = useState<Set<string>>(new Set());
  const [originalPerms, setOriginalPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Arama + filtre + katlanmış kategoriler. Varsayılan: HEPSİ AÇIK değil —
  // 13 kategori × ~4 satır aynı anda ekranda okunmuyordu. İlk kategori açık.
  const [permQuery, setPermQuery] = useState('');
  const [permFilter, setPermFilter] = useState<'all' | 'on' | 'off' | 'critical'>('all');
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['orders']));
  const [saved, setSaved] = useState(false);
  const [roleLoadError, setRoleLoadError] = useState(false);

  // ── User mode state ──
  const [userList, setUserList] = useState<Array<{ id: string; full_name: string; email: string | null; user_type: string; role: string | null }>>([]);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [userPermsLoading, setUserPermsLoading] = useState(false);
  // Yeni: pending değişiklikler (Kaydet butonuna basana kadar DB'ye gitmez)
  const [pendingUserPerms, setPendingUserPerms] = useState<Set<string>>(new Set());
  const [originalUserPerms, setOriginalUserPerms] = useState<Set<string>>(new Set());
  const [userRoleDefaults, setUserRoleDefaults] = useState<Set<string>>(new Set());
  const [userSaving, setUserSaving] = useState(false);
  const [userSaved, setUserSaved] = useState(false);
  const [userLoadError, setUserLoadError] = useState(false);
  const [userListError, setUserListError] = useState(false);
  const [userListReload, setUserListReload] = useState(0);
  // 2-dropdown picker: önce role filtresi, sonra kullanıcı
  const [userRoleFilter, setUserRoleFilter] = useState<RoleKey | null>(null);
  const [roleDropOpen, setRoleDropOpen] = useState(false);
  const [userDropOpen, setUserDropOpen] = useState(false);

  // Profile.role + user_type → RoleKey eşlemesi
  const profileToRoleKey = (p: { user_type: string; role: string | null }): RoleKey | null => {
    if (p.user_type === 'doctor')       return 'doctor';
    if (p.user_type === 'clinic_admin') return 'clinic_admin';
    if (p.user_type === 'lab' && p.role === 'technician') return 'technician';
    if (p.user_type === 'lab' && p.role === 'courier')    return 'courier';
    if (p.user_type === 'lab')          return 'lab_manager';
    return null;
  };

  // User listesi yükle
  useEffect(() => {
    if (mode !== 'user') return;
    (async () => {
      // Sunucuyla BİREBİR aynı kapsam (_perm_target_allowed): bu lab'ın personeli +
      // bu lab'a bağlı klinik/hekim hesapları (klinik, aktif üyelik veya hekim kaydı).
      // Başka lab'ların personeli/müşterileri listelenmez — onlara istisna yazılamaz.
      const { data, error } = await supabase.rpc('list_permission_targets');
      setUserListError(!!error);
      if (!error && Array.isArray(data)) setUserList(data as any);
    })();
  }, [mode, userListReload, myLabId]);

  // Kullanıcı seçilince state'i yükle
  const loadUserPerms = useCallback(async (userId: string) => {
    setUserPermsLoading(true);
    setUserSaved(false);
    try {
      const user = userList.find(u => u.id === userId);
      const roleKey = user ? profileToRoleKey(user) : null;
      const [effRes, roleRes] = await Promise.all([
        supabase.rpc('get_user_effective_permissions', { p_user_id: userId }),
        roleKey ? supabase.rpc('get_role_permissions', { p_role: roleKey }) : Promise.resolve({ data: [], error: null }),
      ]);
      const loadErr = effRes.error || (roleRes as any).error;
      if (loadErr) throw loadErr;
      const eff = effRes.data, roleDef = roleRes.data;
      const effective = new Set<string>((eff ?? []).map((r: any) => r.permission_key));
      setPendingUserPerms(new Set(effective));
      setOriginalUserPerms(new Set(effective));
      setUserRoleDefaults(new Set<string>(Array.isArray(roleDef) ? (roleDef as string[]) : []));
      setUserLoadError(false);
    } catch {
      setUserLoadError(true);
      setPendingUserPerms(new Set());
      setOriginalUserPerms(new Set());
      setUserRoleDefaults(new Set());
    }
    setUserPermsLoading(false);
  }, [userList]);

  useEffect(() => {
    if (mode === 'user' && activeUserId) loadUserPerms(activeUserId);
  }, [mode, activeUserId, loadUserPerms]);

  // Pending toggle — sadece local state'i değiştirir, kaydetmez
  // Manage açılırsa View otomatik açılır; View kapanırsa Manage de kapanır
  const toggleUserPerm = (key: PermissionKey) => {
    setUserSaved(false);
    setPendingUserPerms(prev => {
      const next = new Set(prev);
      const k = key as string;
      const isOn = next.has(k);
      if (isOn) {
        next.delete(k);
        if (k.startsWith('view_')) {
          const manageKey = 'manage_' + k.slice('view_'.length);
          next.delete(manageKey);
        }
      } else {
        next.add(k);
        if (k.startsWith('manage_')) {
          const viewKey = 'view_' + k.slice('manage_'.length);
          next.add(viewKey);
        }
      }
      return next;
    });
  };

  // Kullanıcı yetkilerini Kaydet — pending vs role defaults farkına göre override yaz
  const handleUserSave = async () => {
    if (!activeUserId || userLoadError || userPermsLoading) return;
    setUserSaving(true);
    // Değişiklikler SIRAYLA yazılır; biri hata verirse kalanlar denenmez ve
    // ekran sunucudaki gerçek duruma yeniden yüklenir (yarım kayıt gizli kalmaz).
    const allKeys = new Set<string>([...pendingUserPerms, ...originalUserPerms]);
    const changed = [...allKeys].filter(k => pendingUserPerms.has(k) !== originalUserPerms.has(k));
    let done = 0;
    let failMsg: string | null = null;
    try {
      for (const key of changed) {
        const desired = pendingUserPerms.has(key);
        const { error } = desired === userRoleDefaults.has(key)
          // Rol varsayılanıyla aynı → istisnaya gerek yok, varsa temizle
          ? await supabase.rpc('clear_user_permission', { p_user_id: activeUserId, p_permission_key: key })
          // Rolden farklı → açık istisna yaz
          : await supabase.rpc('set_user_permission', {
              p_user_id: activeUserId, p_permission_key: key, p_granted: desired, p_note: null,
            });
        if (error) { failMsg = error.message; break; }
        done++;
      }
    } catch (e: any) {
      failMsg = e?.message ?? autoT('bilinmeyen hata');
    }
    if (failMsg) {
      toast.error(done > 0
        ? `${autoT('Yetkilerin bir kısmı kaydedildi')} (${done}/${changed.length}). ${autoT('Hata')}: ${failMsg}`
        : `${autoT('Yetkiler kaydedilemedi')}: ${failMsg}`);
      await loadUserPerms(activeUserId);
    } else {
      setOriginalUserPerms(new Set(pendingUserPerms));
      setUserSaved(true);
      setTimeout(() => setUserSaved(false), 3000);
      toast.success(autoT('Yetkiler kaydedildi'));
      refreshMyPerms();
    }
    setUserSaving(false);
  };

  const handleUserReset = () => {
    setPendingUserPerms(new Set(originalUserPerms));
    setUserSaved(false);
  };

  const userHasChanges = (() => {
    if (pendingUserPerms.size !== originalUserPerms.size) return true;
    for (const k of pendingUserPerms) if (!originalUserPerms.has(k)) return true;
    return false;
  })();

  /** Toplu aç/kapat (kullanıcı bazlı) — yön çağırandan gelir. */
  const setAllUserPerms = (keys: PermissionKey[], on: boolean) => {
    setUserSaved(false);
    setPendingUserPerms(prev => {
      const next = new Set(prev);
      for (const k of keys) { if (on) next.add(k); else next.delete(k); }
      return next;
    });
  };

  const activeUser = userList.find(u => u.id === activeUserId);

  const activeConfig = ROLE_CONFIG.find(r => r.key === activeRole)!;

  // Load permissions for selected role
  const loadRolePerms = useCallback(async (role: RoleKey) => {
    setLoading(true);
    setSaved(false);
    try {
      const { data, error } = await supabase.rpc('get_role_permissions', { p_role: role });
      if (error || !Array.isArray(data)) throw error ?? new Error('invalid');
      const set = new Set(data as string[]);
      setRolePerms(set);
      setOriginalPerms(new Set(set));
      setRoleLoadError(false);
    } catch {
      // Yüklenemeyen rolü BOŞ gösterme: o hâlde Kaydet rolün tüm yetkilerini
      // silerdi. Hata durumunu göster, kaydetmeyi kilitle.
      setRolePerms(new Set());
      setOriginalPerms(new Set());
      setRoleLoadError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRolePerms(activeRole);
  }, [activeRole, loadRolePerms]);

  const togglePerm = (key: PermissionKey) => {
    setSaved(false);
    setRolePerms(prev => {
      const next = new Set(prev);
      const k = key as string;
      const isOn = next.has(k);
      if (isOn) {
        next.delete(k);
        // Görme kapatılırsa Yönetme de kapanır (manage implies view)
        if (k.startsWith('view_')) {
          const manageKey = 'manage_' + k.slice('view_'.length);
          next.delete(manageKey);
        }
      } else {
        next.add(k);
        // Yönetme açılırsa Görme de otomatik açılır
        if (k.startsWith('manage_')) {
          const viewKey = 'view_' + k.slice('manage_'.length);
          next.add(viewKey);
        }
      }
      return next;
    });
  };

  const hasChanges = (() => {
    if (rolePerms.size !== originalPerms.size) return true;
    for (const k of rolePerms) if (!originalPerms.has(k)) return true;
    return false;
  })();

  /** Kaydedilmemiş değişiklik varsa geçişten önce onay iste. */
  const guardDiscard = async (dirty: boolean, action: () => void) => {
    if (dirty) {
      const ok = await askConfirm({
        title: autoT('Kaydedilmemiş değişiklikler'),
        message: autoT('Yaptığınız değişiklikler kaydedilmedi. Devam ederseniz kaybolacak.'),
        label: autoT('Değişiklikleri at'),
        variant: 'danger',
      });
      if (!ok) return;
    }
    action();
  };

  const handleSave = async () => {
    if (roleLoadError || loading) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_role_permissions', {
        p_role: activeRole,
        p_permissions: Array.from(rolePerms),
      });
      if (error) {
        toast.error(`${autoT('Yetkiler kaydedilemedi')}: ${error.message}`);
      } else {
        setOriginalPerms(new Set(rolePerms));
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        toast.success(autoT('Yetkiler kaydedildi'));
        refreshMyPerms();
      }
    } catch (e: any) {
      toast.error(`${autoT('Yetkiler kaydedilemedi')}: ${e?.message ?? autoT('bilinmeyen hata')}`);
    }
    setSaving(false);
  };

  const handleReset = () => {
    setRolePerms(new Set(originalPerms));
    setSaved(false);
  };

  /** Toplu aç/kapat — yön çağırandan gelir (eskiden kendi hesaplıyordu). */
  const setAllPerms = (keys: PermissionKey[], on: boolean) => {
    setSaved(false);
    setRolePerms(prev => {
      const next = new Set(prev);
      for (const k of keys) { if (on) next.add(k); else next.delete(k); }
      return next;
    });
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || !(roleDropOpen || userDropOpen)) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setRoleDropOpen(false); setUserDropOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [roleDropOpen, userDropOpen]);

  const roleVisibleKeys = React.useMemo(() => visibleKeysForRole(activeRole), [activeRole]);
  const roleVisibleOn = roleVisibleKeys.filter(k => rolePerms.has(k)).length;
  const accentFg = onAccent(accentColor);

  // ── Role selector (shared between mobile/desktop) ──
  const renderRoleItem = (r: typeof ROLE_CONFIG[0]) => {
    const isActive = r.key === activeRole;
    const RIcon = r.icon;
    return (
      <Pressable
        key={r.key}
        onPress={() => { if (r.key !== activeRole) guardDiscard(hasChanges, () => setActiveRole(r.key)); }}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
          backgroundColor: isActive ? U.surface : 'transparent',
          // @ts-ignore web
          cursor: 'pointer',
        }}
      >
        <View style={{
          width: 28, height: 28, borderRadius: 8,
          backgroundColor: isActive ? accentColor + '14' : 'transparent',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <RIcon size={15} strokeWidth={isActive ? 2 : 1.6} color={isActive ? accentColor : U.ink[400]} />
        </View>
        <Text style={{ fontSize: 13, fontWeight: isActive ? '600' : '400', color: isActive ? U.ink[900] : U.ink[500], flex: 1 }}>
          {ROLE_LABELS[r.key]}
        </Text>
        {/* Nokta yalnız "kaydedilmemiş değişiklik" demek — seçili olmayı zemin + ikon zaten gösteriyor */}
        {isActive && hasChanges && (
          <View accessibilityLabel={autoT('Kaydedilmedi')} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: U.chipTones.warning.fg }} />
        )}
      </Pressable>
    );
  };

  // ── Rol hapları (gömülü + dar ekran) — taşınca alt satıra kayar, hiçbiri gizlenmez.
  const renderRolePills = () => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }} accessibilityRole="tablist">
      {ROLE_CONFIG.map(r => {
        const isActive = r.key === activeRole;
        const RIcon = r.icon;
        return (
          <Pressable
            key={r.key}
            onPress={() => { if (r.key !== activeRole) guardDiscard(hasChanges, () => setActiveRole(r.key)); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: isActive ? 18 : 12, paddingVertical: 8, borderRadius: 9999,
              // İkincil seçici: yumuşak accent zemin + accent kenar (ana sekme çubuğuyla yarışmaz)
              backgroundColor: isActive ? `${accentColor}1F` : U.plainBtn.bg,
              borderWidth: 1, borderColor: isActive ? `${accentColor}66` : U.plainBtn.border,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            <RIcon size={13} strokeWidth={isActive ? 2.2 : 1.8} color={isActive ? (U.isDark ? U.ink[900] : accentColor) : U.ink[500]} />
            <Text style={{ fontSize: 12, fontWeight: isActive ? '700' : '600', color: isActive ? U.ink[900] : U.ink[700] }}>
              {ROLE_LABELS[r.key]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  // ── Permission groups content ──
  const renderPermissions = () => {
    if (loading) {
      return <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />;
    }
    if (roleLoadError) {
      return <LoadErrorCard title="Rol yetkileri yüklenemedi" onRetry={() => loadRolePerms(activeRole)} />;
    }

    return (
      <View style={{ gap: 16 }}>
        {/* Rol özeti — tek satır: açık/toplam + oran + durum. Kaydet/Vazgeç alttaki sabit çubukta. */}
        {(() => {
          // Payda: bu rolde GÖSTERİLEN anahtarlar (gizli lab-özel alanlar sayılmaz).
          const total = roleVisibleKeys.length;
          const pct = total > 0 ? Math.round((roleVisibleOn / total) * 100) : 0;
          return (
            <View style={[U.cardSolid, { gap: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.6, color: U.ink[900] }}>{roleVisibleOn}</Text>
                <Text style={{ fontSize: 13, color: U.ink[400], marginBottom: 2 }}>/ {total} {autoT('yetki açık')}</Text>
                <Text style={{ fontSize: 12, color: U.ink[400], marginBottom: 2 }}>· %{pct}</Text>
                <View style={{ flex: 1 }} />
                {hasChanges && (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: U.chipTones.warning.bg, marginBottom: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: U.chipTones.warning.fg }}>Kaydedilmedi</Text>
                  </View>
                )}
                {saved && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: U.chipTones.success.bg, marginBottom: 2 }}>
                    <Check size={10} color={U.chipTones.success.fg} strokeWidth={2} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: U.chipTones.success.fg }}>Kaydedildi</Text>
                  </View>
                )}
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: U.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: accentColor }} />
              </View>
            </View>
          );
        })()}

        {/* Arama + filtre — 73 yetkide gerekli */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            height: 36, paddingHorizontal: 12, borderRadius: 9999, flex: 1, minWidth: 200,
            backgroundColor: U.isDark ? U.surfaceSoft : '#FFFFFF', borderWidth: 1, borderColor: U.isDark ? U.hairline : 'rgba(0,0,0,0.08)',
          }}>
            <Search size={14} color={U.ink[400]} strokeWidth={1.8} />
            <TextInput
              value={permQuery}
              onChangeText={setPermQuery}
              placeholder="Yetki ara…"
              placeholderTextColor={U.ink[400]}
              style={{ flex: 1, fontSize: 13, color: U.ink[900], ...(Platform.OS === 'web' ? { outline: 'none' } as any : {}) }}
            />
            {permQuery.length > 0 && (
              <GlassTooltip title={autoT('Aramayı temizle')} text={autoT('Tüm yetkiler yeniden listelenir')}>
                <Pressable onPress={() => setPermQuery('')} accessibilityRole="button" accessibilityLabel={autoT('Aramayı temizle')}>
                  <X size={13} color={U.ink[400]} strokeWidth={2} />
                </Pressable>
              </GlassTooltip>
            )}
          </View>
          <Segmented
            value={permFilter}
            onChange={setPermFilter}
            options={[
              { key: 'all', label: 'Tümü' },
              { key: 'on', label: 'Açık' },
              { key: 'off', label: 'Kapalı' },
              { key: 'critical', label: 'Kritik' },
            ]}
          />
        </View>

        {(Object.keys(PERMISSION_CATEGORIES) as Array<keyof typeof PERMISSION_CATEGORIES>).map(catKey => {
          // Hekim/klinik rolünde lab-özel feature'lar hiç gösterilmez (whitelist)
          // + bazı feature'larda YÖNET gizlenir (sadece-görüntüle).
          const catFeatures = featuresForCategory(catKey, allowedFeatureSetForRole(activeRole), viewOnlyFeaturesForRole(activeRole));
          if (catFeatures.length === 0) return null;
          return (
            <PermissionCategory
              key={catKey}
              catLabel={PERMISSION_CATEGORIES[catKey]}
              features={catFeatures}
              isOn={(k) => rolePerms.has(k)}
              onToggle={(k) => togglePerm(k as PermissionKey)}
              onToggleAll={(keys, on) => setAllPerms(keys as PermissionKey[], on)}
              confirm={askConfirm}
              accentColor={accentColor}
              isDesktop={isDesktop}
              expanded={expandedCats.has(catKey)}
              onToggleExpanded={() => setExpandedCats(prev => {
                const n = new Set(prev);
                if (n.has(catKey)) n.delete(catKey); else n.add(catKey);
                return n;
              })}
              query={permQuery}
              filter={permFilter}
            />
          );
        })}
      </View>
    );
  };

  // ── Mode tabs (Rol bazlı | Kullanıcı bazlı) ──
  // Ana gezinme: uygulamanın standart sekme çubuğu (kayan seçili imleç)
  const renderModeTabs = () => (
    <View style={{ marginBottom: 16 }}>
      <SlideTabBar<'role' | 'user'>
        items={[
          { key: 'role', label: autoT('Rol Bazlı') },
          { key: 'user', label: autoT('Kullanıcı Bazlı') },
        ]}
        activeKey={mode}
        accentColor={accentColor}
        size="sm"
        onChange={(m) => {
          if (m === mode) return;
          if (m === 'role') guardDiscard(userHasChanges, () => setMode('role'));
          else guardDiscard(hasChanges, () => { handleReset(); setMode('user'); });
        }}
      />
    </View>
  );

  // ── 2-Dropdown User picker (Role → User) ──
  const usersInRole = userList.filter(u => userRoleFilter ? profileToRoleKey(u) === userRoleFilter : false);
  const renderUserPicker = () => (
    <View style={{ marginBottom: 16, gap: 10, zIndex: 50 }}>
      {/* Açık menünün dışına tıklayınca kapanır */}
      {(roleDropOpen || userDropOpen) && (
        <Pressable
          onPress={() => { setRoleDropOpen(false); setUserDropOpen(false); }}
          accessibilityLabel={autoT('Menüyü kapat')}
          style={{
            position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
            top: Platform.OS === 'web' ? 0 : -2000, left: Platform.OS === 'web' ? 0 : -2000,
            right: Platform.OS === 'web' ? 0 : -2000, bottom: Platform.OS === 'web' ? 0 : -2000,
            zIndex: 40, ...(Platform.OS === 'web' ? { cursor: 'default' } as any : {}),
          }}
        />
      )}
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 10, zIndex: 50 }}>
        {/* Dropdown 1 — Role */}
        <View style={{ flex: 1, zIndex: 51 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: U.ink[500], letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>1. Rol Seç</Text>
          <Pressable
            onPress={() => { setRoleDropOpen(o => !o); setUserDropOpen(false); }}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 14, height: 44, borderRadius: 14,
              backgroundColor: U.isDark ? U.surface : '#FFFFFF', borderWidth: 1,
              borderColor: roleDropOpen ? accentColor : (U.isDark ? U.hairline : 'rgba(0,0,0,0.08)'),
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
            } as any}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {userRoleFilter ? (() => {
                const cfg = ROLE_CONFIG.find(r => r.key === userRoleFilter);
                const RIcon = cfg?.icon ?? Shield;
                return (
                  <>
                    <RIcon size={14} color={accentColor} strokeWidth={1.8} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{ROLE_LABELS[userRoleFilter]}</Text>
                  </>
                );
              })() : (
                <Text style={{ fontSize: 13, color: U.ink[400] }}>Rol seçin...</Text>
              )}
            </View>
            <ChevronDown size={14} color={U.ink[400]} strokeWidth={1.8} style={{ transform: [{ rotate: roleDropOpen ? '180deg' : '0deg' }] }} />
          </Pressable>
          {roleDropOpen && (
            <View style={{
              position: 'absolute', top: 70, left: 0, right: 0,
              backgroundColor: U.isDark ? U.surface : '#FFFFFF', borderRadius: 12, padding: 4,
              borderWidth: 1, borderColor: U.isDark ? U.hairline : 'rgba(0,0,0,0.08)',
              zIndex: 100,
              ...(Platform.OS === 'web' ? { boxShadow: U.isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.08)' } : {}),
            } as any}>
              {ROLE_CONFIG.map(r => {
                const RIcon = r.icon;
                const isSel = r.key === userRoleFilter;
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => { setRoleDropOpen(false); guardDiscard(userHasChanges, () => { setUserRoleFilter(r.key); setActiveUserId(null); }); }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8,
                      backgroundColor: isSel ? `${accentColor}14` : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                    } as any}
                  >
                    <RIcon size={13} color={isSel ? accentColor : U.ink[500]} strokeWidth={1.8} />
                    <Text style={{ fontSize: 13, fontWeight: isSel ? '700' : '500', color: U.ink[isSel ? 900 : 800] }}>
                      {ROLE_LABELS[r.key]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Dropdown 2 — User (filtered by role) */}
        <View style={{ flex: 1, zIndex: 50 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: U.ink[500], letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6 }}>2. Kullanıcı Seç</Text>
          <Pressable
            onPress={() => userRoleFilter && (setUserDropOpen(o => !o), setRoleDropOpen(false))}
            disabled={!userRoleFilter}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 14, height: 44, borderRadius: 14,
              backgroundColor: userRoleFilter ? (U.isDark ? U.surface : '#FFFFFF') : U.ink[50],
              borderWidth: 1,
              borderColor: userDropOpen ? accentColor : (U.isDark ? U.hairline : 'rgba(0,0,0,0.08)'),
              opacity: userRoleFilter ? 1 : 0.6,
              ...(Platform.OS === 'web' ? { cursor: userRoleFilter ? 'pointer' : 'not-allowed' } : {}),
            } as any}
          >
            {activeUserId ? (() => {
              const u = userList.find(x => x.id === activeUserId);
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: accentColor, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: accentFg }}>{(u?.full_name ?? '?').charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{u?.full_name ?? '—'}</Text>
                </View>
              );
            })() : (
              <Text style={{ fontSize: 13, color: U.ink[400] }}>
                {userRoleFilter ? `${usersInRole.length} ${autoT('kullanıcı')}` : 'Önce rol seçin'}
              </Text>
            )}
            <ChevronDown size={14} color={U.ink[400]} strokeWidth={1.8} style={{ transform: [{ rotate: userDropOpen ? '180deg' : '0deg' }] }} />
          </Pressable>
          {userDropOpen && (
            <View style={{
              position: 'absolute', top: 70, left: 0, right: 0,
              backgroundColor: U.isDark ? U.surface : '#FFFFFF', borderRadius: 12, padding: 4,
              borderWidth: 1, borderColor: U.isDark ? U.hairline : 'rgba(0,0,0,0.08)',
              zIndex: 100, maxHeight: 320,
              ...(Platform.OS === 'web' ? { boxShadow: U.isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.08)' } : {}),
            } as any}>
              <ScrollView style={{ maxHeight: 312 }}>
                {usersInRole.length === 0 ? (
                  <Text style={{ fontSize: 12, color: U.ink[400], textAlign: 'center', paddingVertical: 16 }}>
                    Bu rolde kullanıcı yok
                  </Text>
                ) : usersInRole.map(u => {
                  const isSel = u.id === activeUserId;
                  const initials = (u.full_name ?? '?').charAt(0).toUpperCase();
                  return (
                    <Pressable
                      key={u.id}
                      onPress={() => { setUserDropOpen(false); if (u.id !== activeUserId) guardDiscard(userHasChanges, () => setActiveUserId(u.id)); }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 8,
                        paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
                        backgroundColor: isSel ? `${accentColor}14` : 'transparent',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                      } as any}
                    >
                      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: isSel ? accentColor : U.ink[100], alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: isSel ? accentFg : U.ink[700] }}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 13, fontWeight: isSel ? '700' : '500', color: U.ink[900] }} numberOfLines={1}>
                          {u.full_name ?? '(isimsiz)'}
                        </Text>
                        <Text style={{ fontSize: 10, color: U.ink[400] }} numberOfLines={1}>{u.email ?? '—'}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  // ── User permissions render — rol bazlı ile aynı görünüm + Kaydet butonu ──
  const renderUserPermissions = () => {
    if (!activeUserId && userListError) {
      return <LoadErrorCard title="Kullanıcı listesi yüklenemedi" onRetry={() => setUserListReload(n => n + 1)} />;
    }
    if (!activeUserId) {
      return (
        <View style={U.cardSolid}>
          <Text style={{ fontSize: 13, color: U.ink[400], textAlign: 'center', paddingVertical: 40 }}>
            Yetkilerini düzenlemek için yukarıdan rol ve kullanıcı seçin.
          </Text>
        </View>
      );
    }
    if (userPermsLoading) {
      return <CenteredLoader color={accentColor} label="Yükleniyor…" />;
    }
    if (userLoadError) {
      return <LoadErrorCard title="Kullanıcının yetkileri yüklenemedi" onRetry={() => activeUserId && loadUserPerms(activeUserId)} />;
    }
    return (
      <View style={{ gap: 16 }}>
        {/* Durum satırı — Kaydet/Vazgeç alttaki sabit çubukta */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 12, color: U.ink[400] }}>
            {pendingUserPerms.size} {autoT('yetki açık')} · {activeUser?.full_name ?? '—'}
          </Text>
          {userHasChanges && (
            <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: U.chipTones.warning.bg }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: U.chipTones.warning.fg }}>Kaydedilmedi</Text>
            </View>
          )}
          {userSaved && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999, backgroundColor: U.chipTones.success.bg }}>
              <Check size={10} color={U.chipTones.success.fg} strokeWidth={2} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: U.chipTones.success.fg }}>Kaydedildi</Text>
            </View>
          )}
        </View>

        {/* Feature-row layout — kullanıcı bazlı */}
        {(() => {
          // Seçili kullanıcının rolü hekim/klinik ise lab-özel feature'lar gizli
          // + sadece-görüntüle olanlarda YÖNET gizli.
          const _u = userList.find(u => u.id === activeUserId) ?? null;
          const _uRole = _u ? profileToRoleKey(_u) : null;
          const _allowedUser = allowedFeatureSetForRole(_uRole);
          const _viewOnlyUser = viewOnlyFeaturesForRole(_uRole);
          return (Object.keys(PERMISSION_CATEGORIES) as Array<keyof typeof PERMISSION_CATEGORIES>).map(catKey => {
          const catFeatures = featuresForCategory(catKey, _allowedUser, _viewOnlyUser);
          if (catFeatures.length === 0) return null;
          return (
            <PermissionCategory
              key={catKey}
              catLabel={PERMISSION_CATEGORIES[catKey]}
              features={catFeatures}
              isOn={(k) => pendingUserPerms.has(k)}
              onToggle={(k) => toggleUserPerm(k as PermissionKey)}
              onToggleAll={(keys, on) => setAllUserPerms(keys as PermissionKey[], on)}
              confirm={askConfirm}
              accentColor={accentColor}
              isDesktop={isDesktop}
              expanded={expandedCats.has(catKey)}
              onToggleExpanded={() => setExpandedCats(prev => {
                const n = new Set(prev);
                if (n.has(catKey)) n.delete(catKey); else n.add(catKey);
                return n;
              })}
              query={permQuery}
              filter={permFilter}
            />
          );
        }); })()}
      </View>
    );
  };

  // ── Embedded mode (inside SettingsHub) — no own sidebar/title ──
  // ── Alttaki sabit kaydet çubuğu — yalnız kaydedilmemiş değişiklik varken ──
  const diffCount = (a: Set<string>, b: Set<string>) => {
    let n = 0;
    for (const k of a) if (!b.has(k)) n++;
    for (const k of b) if (!a.has(k)) n++;
    return n;
  };
  const dockBottom = isDesktop ? 24 : 104; // mobilde alt sekme çubuğunun üstü
  const dockVisible = mode === 'role' ? (hasChanges && !roleLoadError) : userHasChanges;
  const dock = (
    <SaveDock
      visible={dockVisible}
      count={mode === 'role' ? diffCount(rolePerms, originalPerms) : diffCount(pendingUserPerms, originalUserPerms)}
      saving={mode === 'role' ? saving : userSaving}
      onSave={mode === 'role' ? handleSave : handleUserSave}
      onReset={mode === 'role' ? handleReset : handleUserReset}
      accentColor={accentColor}
      bottom={dockBottom}
      compact={!isDesktop}
    />
  );

  if (embedded) {
    return (
      <>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: PAGE_PADDING, paddingBottom: 170 }}
        showsVerticalScrollIndicator={false}
      >
        {renderModeTabs()}

        {mode === 'role' ? (
          <>
            {/* Role selector — horizontal pills */}
            {renderRolePills()}
            {renderPermissions()}
          </>
        ) : (
          <>
            {renderUserPicker()}
            {renderUserPermissions()}
          </>
        )}
      </ScrollView>
      {dock}
      {confirmNode}
      </>
    );
  }

  // ── Standalone mode — own sidebar + title ──
  return (
    <View style={{ flex: 1 }}>
      {isDesktop ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {/* Sidebar */}
          {/* Sidebar sayfa ile birlikte kaymaz — ana kenar çubuğu gibi yerinde durur. */}
          <View
            style={{
              width: 220, paddingTop: 24, paddingBottom: 16,
              // maxHeight yalnız rol modunda: orada liste kendi içinde kayar.
              // Kullanıcı modunda açılır menüler var, yükseklik sınırlamıyoruz.
              ...(Platform.OS === 'web'
                ? {
                    position: 'sticky', top: 0, alignSelf: 'flex-start',
                    ...(mode === 'role' ? { maxHeight: '100vh' } : null),
                  } as any
                : null),
            }}
          >
            {mode === 'role' ? (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1, minHeight: 0 }} contentContainerStyle={{ gap: 2, paddingHorizontal: 10 }}>
                {ROLE_CONFIG.map(renderRoleItem)}
              </ScrollView>
            ) : (
              <View style={{ paddingHorizontal: 10 }}>
                {renderUserPicker()}
              </View>
            )}
          </View>

          {/* Content */}
          <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 16, paddingBottom: 8 }}>
              <Text style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.5, color: U.ink[900], marginBottom: 4 }}>
                {mode === 'role' ? ROLE_LABELS[activeRole] : (activeUser?.full_name ?? 'Kullanıcı Bazlı Yetki')}
              </Text>
              <Text style={{ fontSize: 13, color: U.ink[400], lineHeight: 19 }}>
                {mode === 'role'
                  ? 'Bu rol için izin verilen yetkileri yönetin'
                  : 'Kullanıcıya özel ek izinleri ve yasakları yönetin'}
              </Text>
            </View>
            <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 8 }}>
              {renderModeTabs()}
            </View>
            <ScrollView contentContainerStyle={{ padding: PAGE_PADDING, paddingTop: 0, paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
              {mode === 'role' ? renderPermissions() : renderUserPermissions()}
            </ScrollView>
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: PAGE_PADDING, paddingBottom: 170 }} showsVerticalScrollIndicator={false}>
          {renderModeTabs()}
          {mode === 'role' ? (
            <>
              {renderRolePills()}
              {renderPermissions()}
            </>
          ) : (
            <>
              {renderUserPicker()}
              {renderUserPermissions()}
            </>
          )}
        </ScrollView>
      )}
      {dock}
      {confirmNode}
    </View>
  );
}
