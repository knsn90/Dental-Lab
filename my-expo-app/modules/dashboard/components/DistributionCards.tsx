// Özet panolarının paylaşılan dağılım kartları — Statü dağılımı ve İş tipi dağılımı
// ("spine" kartları). Admin Özet ve lab yöneticisi panosu aynı kodu kullanır.
// app/(admin)/index.tsx'ten birebir taşındı (2026-11-12); davranış değişmedi.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { DS } from '../../../core/theme/dsTokens';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { prefersReducedMotion } from '../../../core/ui/HeroGlow';
import { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { ArrowUpRight, ArrowUpLeft } from '../../../core/ui/icons';
import { serviceUnitLabel, unitShares } from '../../../core/util/serviceUnits';

const SERIF = { fontFamily: DS.font.display as string, fontWeight: '300' as const };
const INK = DS.ink[900];

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const T = useMobileTokens();
  return (
    <View
      className="overflow-hidden"
      style={[{ backgroundColor: T.card, borderRadius: DS.radius.xl, borderWidth: 1, borderColor: T.hairline }, style]}
    >
      {children}
    </View>
  );
}

function useCountUp(target: number, duration = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (duration === 0) { setV(target); return; }
    const start = Date.now();
    let raf: any;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setV(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

// İş tipi renkleri ANLAMSIZ — statü renkleri gibi bir şey ifade etmezler; tek işleri
// satırı spine segmentine bağlamak. Kurallar:
//   1. Hepsi DS token'ı — hardcode hue yok (eski '#7C3AED' / '#0D9488' elendi).
//   2. Hepsi beyaz VE spine track (ink[100]) üstünde ≥3:1 — WCAG 1.4.11 non-text.
//      7px nokta ve 8px şerit satırın tek görsel kimliği, soluk ton = görünmez satır.
//   3. Statünün semantik hue'larından uzak (turuncu=üretim, yeşil=teslim, kırmızı=
//      gecikme) — iki kart yan yana dururken anlam çakışmasın.
// Tek-hue rampa denendi ve ELENDİ: 5 adımın 3'ü 3:1'in altına düşüyor (2.82 / 2.02 /
// 1.58) ve son adımlar birbirinden ayırt edilemiyor. Tek hue 5 erişilebilir adım
// taşıyamıyor; kontrollü kategorik palet tek çözüm.
export const WORKTYPE_RAMP = [
  DS.exec.primaryDeep,   // #001F3F lacivert · 8.23:1
  DS.teal.primaryDeep,   // #197872 koyu teal · 5.29:1
  DS.plum.primary,       // #8B5CB8 erik moru · 4.86:1
  DS.exec.info,          // #4A8FC9 açık mavi · 3.46:1
  DS.plum.primaryDeep,   // #6B3F94 koyu erik · 7.60:1
];
/** Koyu tema karşılıkları — lacivert/koyu erik koyu kart zemininde (#1B1916) kayboluyordu. */
export const WORKTYPE_RAMP_DARK = ['#7FA8D9', '#5FC4BB', '#B58FD8', '#8EC0EA', '#A07DC8'];

/** İş Tipi Dağılımı halkaları — iç içe, en büyük pay en dışta. Yay = işin
 *  KENDİ birimi içindeki payı (üye üyeye, çene çeneye); 12'den başlar, saat yönünde. */
export function WorkTypeRings({ items, size = 128 }: { items: { color: string; pct: number }[]; size?: number }) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const p = useCountUp(1, prefersReducedMotion() ? 0 : 1100);
  const stroke = 8;
  const gap = 4;
  const outer = (size - stroke) / 2;
  const track = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)';
  const cx = size / 2;
  return (
    <View style={{ alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        {items.map((it, i) => {
          const r = outer - i * (stroke + gap);
          if (r <= stroke) return null;
          const c = 2 * Math.PI * r;
          const pct = Math.max(0.012, Math.min(1, it.pct)) * p;
          return (
            <React.Fragment key={i}>
              <Circle cx={cx} cy={cx} r={r} stroke={track} strokeWidth={stroke} fill="none" />
              {pct > 0.001 ? (
                <Circle
                  cx={cx} cy={cx} r={r} stroke={it.color} strokeWidth={stroke} fill="none"
                  strokeDasharray={`${pct * c} ${c}`} strokeLinecap="round"
                  transform={`rotate(-90 ${cx} ${cx})`}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

export const STATUS_CFG: Record<string, { labelKey: string; color: string; bg: string }> = {
  alindi:          { labelKey: 'admin.status.received',          color: DS.ink[500],  bg: 'rgba(0,0,0,0.05)' },
  asamada:         { labelKey: 'admin.status.production',        color: '#9C5E0E',   bg: 'rgba(232,155,42,0.15)' },
  uretimde:        { labelKey: 'admin.status.production',        color: '#9C5E0E',   bg: 'rgba(232,155,42,0.15)' },
  kalite_kontrol:  { labelKey: 'admin.status.qualityControl',  color: '#1F5689',   bg: 'rgba(74,143,201,0.12)' },
  teslimata_hazir: { labelKey: 'admin.status.readyForDelivery', color: '#1F6B47',   bg: 'rgba(45,154,107,0.12)' },
  // Kurye işi teslim aldı ve yolda — 'teslimata_hazir' ile KARIŞTIRMA
  // (2026-09-24: hazır işler "Kuryeye Teslim Edildi" görünüyordu).
  kurye_bekleniyor:{ labelKey: 'admin.status.waitingCourier', color: '#9C5E0E',   bg: 'rgba(232,155,42,0.15)' },
  kuryede:         { labelKey: 'admin.status.withCourier',    color: '#1F5689',   bg: 'rgba(74,143,201,0.12)' },
  teslim_edildi:   { labelKey: 'admin.status.delivered',   color: DS.ink[400],  bg: 'rgba(0,0,0,0.04)' },
};
export const STATUS_KEYS = ['alindi', 'uretimde', 'kalite_kontrol', 'teslimata_hazir', 'teslim_edildi'];
/** order_metrics().by_status → dağılım kovaları. Eskiden yalnız 5 statü sayılıyordu;
 *  kutu/atama/tasarım onayı/kurye durumları dağılımdan düşüyordu (denetim Y2). İptal yok. */
export const STATUS_BUCKET: Record<string, string> = {
  alindi: 'alindi', kutu_atandi: 'alindi', atama_bekleniyor: 'alindi', tasarim_onayi_bekleniyor: 'alindi',
  uretimde: 'uretimde', asamada: 'uretimde', kalite_kontrol: 'kalite_kontrol',
  teslimata_hazir: 'teslimata_hazir', kurye_bekleniyor: 'teslimata_hazir', kuryede: 'teslimata_hazir',
  teslim_edildi: 'teslim_edildi',
};

// ══════════════════════════════════════════════════════════════════
// Hallmark · component: dashboard-cards · genre: modern-minimal
// theme: design-system (CLAUDE.md · DS.exec kobalt) — katalog teması YOK,
// kilitli sistem kazanır. Diversification askıda (system-managed project).
//
// "Spine" — üç kart TEK cihaz paylaşır: tepede bir yığılmış şerit, altında
// bar'sız satırlar. Bir bütünün parçaları için N ayrı bar çizmek "toplamı
// %100 eder" ilişkisini yok ediyordu; tek spine onu geri getiriyor.
// Sıfır satırları tek soluk satıra toplanır (statü kartının %60'ı ölü
// şeritti). Sayı sütunları tabular-nums ile dikeyde hizalanır.
// ══════════════════════════════════════════════════════════════════

/** Sayı sütunları dikeyde hizalansın — orantılı rakamlar sütunu kaydırıyor. */
const NUM = { fontVariant: ['tabular-nums'] as any };

/** Yığılmış şerit — segmentler pay oranında yer kaplar (flex = pay).
 *  flexBasis 0 + flexGrow=pay ⇒ segment genişliği doğrudan payın kendisi. */
function Spine({ segments }: { segments: { color: string; pct: number }[] }) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const live = segments.filter(s => s.pct > 0.0001);
  return (
    <View style={{ flexDirection: 'row', height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : DS.ink[100], gap: 2, marginTop: 16 }}>
      {live.map((s, i) => <View key={i} style={{ flex: s.pct, backgroundColor: s.color }} />)}
    </View>
  );
}

export function SpineCard({ title, value, unit, segments, zeros, children, onPress, visual }: {
  title:     string;
  /** Verilirse tepedeki şerit (Spine) yerine bu çizilir. */
  visual?:   React.ReactNode;
  /** Verilirse kart tıklanabilir olur (başlığın yanında ↗). */
  onPress?:  () => void;
  /** string/number ise display tipografisiyle sarılır; ReactNode olduğu gibi basılır. */
  value:     string | number | React.ReactNode;
  unit?:     string;
  segments:  { color: string; pct: number }[];
  /** Sıfır olan kalemler — tek soluk satırda toplanır. */
  zeros?:    string[];
  children:  React.ReactNode;
}) {
  const plain = typeof value === 'string' || typeof value === 'number';
  const T = useMobileTokens();
  const card = (
    // flex:1 → ızgara hücresini doldurur; yan yana kartlar eş boy kalır
    <Card style={{ padding: 20, flex: 1 }}>
      {/* Başlık solda · toplam sağda — koyu bant yok, kart bağırmıyor */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ flexShrink: 1, fontSize: 14, fontWeight: '600', color: T.ink }} numberOfLines={1}>
            {title}
          </Text>
          {onPress ? (isRTL() ? <ArrowUpLeft size={14} color={T.ink3} strokeWidth={1.8} /> : <ArrowUpRight size={14} color={T.ink3} strokeWidth={1.8} />) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          {plain
            ? <Text style={{ ...SERIF, fontSize: 22, letterSpacing: -0.5, color: T.ink, ...NUM }}>{value}</Text>
            : value}
          {unit ? <Text style={{ fontSize: 12, fontWeight: '500', color: T.ink3 }}>{unit}</Text> : null}
        </View>
      </View>

      {visual ? (
        // Kompakt: grafik solda, liste sağda (kart dikeyde büyümesin)
        // Dar kartta (< ~350px) liste halkaların altına iner; adlar kesilmez.
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 16, rowGap: 8, marginTop: 12 }}>
          {visual}
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 200, minWidth: 0 }}>{children}</View>
        </View>
      ) : (
        <>
          <Spine segments={segments} />
          <View style={{ marginTop: 8 }}>{children}</View>
        </>
      )}

      {zeros && zeros.length > 0 ? (
        <Text style={{ fontSize: 11, color: T.ink3, marginTop: 4 }}>
          {zeros.join(' · ')} — 0
        </Text>
      ) : null}
    </Card>
  );
  if (!onPress) return card;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }: any) => ({ flex: 1, opacity: pressed ? 0.85 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) })}
    >
      {card}
    </Pressable>
  );
}

/** Spine satırı — nokta (spine segmentine bağlar) + etiket + değer + oran.
 *  Kendi barı YOK; oranı tepedeki spine taşıyor. */
export function SpineRow({ color, label, value, meta }: {
  /** Yoksa satır spine'da temsil edilmiyor demektir (ör. salt sayaç). */
  color?: string;
  label:  string;
  value:  string | number | React.ReactNode;
  meta?:  string;
}) {
  const plain = typeof value === 'string' || typeof value === 'number';
  const T = useMobileTokens();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color ?? 'transparent' }} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: T.ink2 }} numberOfLines={1}>{label}</Text>
      {plain
        ? <Text style={{ fontSize: 13, fontWeight: '700', color: T.ink, ...NUM }}>{value}</Text>
        : value}
      {meta ? (
        <Text style={{ fontSize: 12, fontWeight: '500', color: T.ink3, minWidth: 36, textAlign: 'end' as any, ...NUM }}>{meta}</Text>
      ) : null}
    </View>
  );
}

// ── Status Distribution Card ──
export function StatusDistCard({ byStatus }: { byStatus: { label: string; count: number; key: string }[] }) {
  const { t } = useTranslation();
  const total = byStatus.reduce((s, x) => s + x.count, 0) || 1;
  const labelOf = (x: { label: string; key: string }) => {
    const k = STATUS_CFG[x.key]?.labelKey;
    return k ? t(k) : x.label;
  };
  const colorOf = (x: { key: string }) => STATUS_CFG[x.key]?.color ?? INK;
  // Sıfır statüler tam satır + boş bar yerine tek soluk satıra iner.
  const live  = byStatus.filter(x => x.count > 0);
  const zeros = byStatus.filter(x => x.count === 0).map(labelOf);
  return (
    <SpineCard
      title={t('admin.dashboard.statusDistribution')}
      value={total}
      unit={t('admin.dashboard.totalOrders')}
      segments={live.map(x => ({ color: colorOf(x), pct: x.count / total }))}
      zeros={zeros}
    >
      {live.map(x => (
        <SpineRow
          key={x.key}
          color={colorOf(x)}
          label={labelOf(x)}
          value={x.count}
          meta={`${Math.round((x.count / total) * 100)}%`}
        />
      ))}
    </SpineCard>
  );
}

// ── Work Type Card ──
export function WorkTypeCard({ data, onPress }: { data: { label: string; count: number; unit?: string | null }[]; onPress?: () => void }) {
  const { t } = useTranslation();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const ramp = isDark ? WORKTYPE_RAMP_DARK : WORKTYPE_RAMP;
  if (!data.length) return null;

  // Birim başına ayrı seçim: baskın birimden (genelde "üye") ilk 5, diğer
  // birimlerden en iyi 2'şer. Böylece çene/adet bazlı işler — gece plağı,
  // model baskısı — tek bir üyelik işin gölgesinde kaybolmaz.
  const byUnit = new Map<string, typeof data>();
  for (const d of data) {
    const u = serviceUnitLabel(d.unit);
    if (!byUnit.has(u)) byUnit.set(u, []);
    byUnit.get(u)!.push(d);
  }
  const unitsBySize = Array.from(byUnit.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([u]) => u);
  const rows = unitsBySize
    .flatMap((u, i) => (byUnit.get(u) ?? []).slice(0, i === 0 ? 5 : 2))
    .sort((a, b) => b.count - a.count)
    .slice(0, WORKTYPE_RAMP.length);
  // Yüzde her satırın KENDİ birimi içindeki payıdır (üye üyeye, çene çeneye);
  // farklı birimleri tek paydada toplamak anlamsızdı (48 üye / 342 "karışık").
  const shares = unitShares(data);
  const shareOf = (w: (typeof data)[number]) => shares[data.indexOf(w)] ?? 0;
  // Halka sırası: baskın birimin (genelde üye) işleri dışta, paya göre; sonra
  // diğer birimler. Tek başına %100 olan bir çene işi en dışa geçip kartı
  // domine etmesin. Liste de aynı sırayla.
  const mainUnit = unitsBySize[0];
  const live  = rows.filter(w => w.count > 0).sort((a, b) => {
    const am = serviceUnitLabel(a.unit) === mainUnit ? 0 : 1;
    const bm = serviceUnitLabel(b.unit) === mainUnit ? 0 : 1;
    return am - bm || shareOf(b) - shareOf(a);
  });
  // Şerit: her birim eşit pay alır, birimin içinde satırlar kendi payıyla bölünür.
  // Tek birim varken bu doğrudan satırın yüzdesidir.
  const liveUnits = new Set(live.map(w => serviceUnitLabel(w.unit))).size || 1;
  const zeros = rows.filter(w => w.count === 0).map(w => w.label);

  // Birim başına kırılım: "47 üye · 4 çene · 2 adet"
  const perUnit = new Map<string, number>();
  for (const w of data) {
    const u = serviceUnitLabel(w.unit);
    perUnit.set(u, (perUnit.get(u) ?? 0) + w.count);
  }
  const unitBreakdown = Array.from(perUnit.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([u, n]) => `${n} ${autoT(u)}`)   // birim tek başına çevrilmeli — birleşik dize sözlüğe takılmaz
    .join(' · ');
  return (
    <SpineCard
      onPress={onPress}
      title={t('admin.dashboard.workTypeDistribution')}
      // Başlıkta TEK toplam YOK — birimler toplanamaz.
      // Eskiden "87 Üye" yazıyordu ama o 87'nin içinde çene bazlı plaklar ve
      // adet bazlı model/tasarım işleri de diş sayılarak toplanmıştı.
      // Artık her birim kendi kırılımında: "47 üye · 4 çene · 2 adet".
      value={unitBreakdown}
      segments={live.map((w, i) => ({ color: ramp[i], pct: shareOf(w) / liveUnits }))}
      visual={<WorkTypeRings items={live.map((w, i) => ({ color: ramp[i], pct: shareOf(w) }))} />}
      zeros={zeros}
    >
      {live.map((w, i) => (
        <SpineRow
          key={w.label}
          color={ramp[i]}
          label={w.label}
          value={w.count}
          // Satırın kendi birimi — "13 üye", "4 çene", "2 adet".
          meta={`${serviceUnitLabel(w.unit)} · ${Math.round(shareOf(w) * 100)}%`}
        />
      ))}
    </SpineCard>
  );
}
