// Özet sayfası widget'ı: en çok iş gönderen ilk 5 klinik.
// Dönem: Bu ay / Tümü · Sıralama: Üye / Puan (0.5 üye + 0.5 ciro, 0–100).
// Ödeme durumu sıralamayı ETKİLEMEZ; vadesi geçen borçta yalnız uyarı işareti.
// Düzen: lider klinik öne çıkan satırda (monogram + pay yüzdesi + büyük değer),
// 2–5 sıkı satırlar; çubuklar dönem/sıralama değişince yumuşakça dolar (hareket
// azaltma açıksa anında). Dar bir üçte-bir sütuna sığar.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, Animated, Easing, Image } from 'react-native';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePermissionStore } from '../../../core/store/permissionStore';
import { DS } from '../../../core/theme/dsTokens';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { AlertTriangle, RoyalCrown } from '../../../core/ui/icons';
import { HERO_NAVY } from '../../../core/ui/HeroGlow';
import { usePanelTheme, onAccentInk } from '../../../core/theme/usePanelTheme';
import { autoT } from '../../../core/i18n/autoTranslate';
import { titleCaseTR } from '../../../core/utils/textCase';
import { useReducedMotion } from '../../reviews/components/dashboard/dashboardUi';
import { rankTop, type RankMode, type ClinicSummary } from '../summary';
import { useClinicSummaries } from '../useClinicSummaries';
import { useClinicSummaryModal } from './ClinicSummaryModal';

type Period = 'month' | 'all';
const web = Platform.OS === 'web';

function monogram(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toLocaleUpperCase('tr') || '·';
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

/** Çubuk + avatar tonları aktif panelden: admin kobalt, lab safran (paneller kendi rengini taşır). */
function usePalette() {
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  const panel = usePanelTheme();
  if (panel.key === 'exec') {
    return {
      isDark,
      fillFrom: isDark ? '#4F7DB8' : DS.exec.primary,
      fillTo: isDark ? '#9EC0E8' : DS.exec.primaryDeep,
      track: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(23,34,53,0.06)',
      avatarBg: isDark ? 'rgba(127,168,217,0.18)' : 'rgba(49,79,126,0.10)',
      avatarFg: isDark ? '#BFD3EC' : DS.exec.primaryDeep,
    };
  }
  return {
    isDark,
    fillFrom: panel.primary,
    fillTo: panel.primaryDeep,
    track: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(10,10,10,0.06)',
    avatarBg: hexA(panel.primary, isDark ? 0.2 : 0.22),
    avatarFg: isDark ? panel.primary : panel.accent,
  };
}

/** Lider kutusu yüzeyi: admin'de HERO_NAVY, diğer panellerde panel accent'i.
 *  Metin/ikon tonu zeminin parlaklığına göre (safran üstünde koyu ink). */
type LeadSkin = {
  bg: string; bgImage: string; ink: string; ink2: string; ink3: string;
  monoBg: string; track: string; fill: string; fillImage: string; warn: string;
};
function useLeadSkin(): LeadSkin {
  const panel = usePanelTheme();
  if (panel.key === 'exec') {
    return {
      bg: HERO_NAVY.to,
      bgImage: `linear-gradient(135deg, ${HERO_NAVY.from} 0%, ${HERO_NAVY.to} 55%, ${HERO_NAVY.light} 100%)`,
      ink: '#FFFFFF', ink2: 'rgba(255,255,255,0.82)', ink3: 'rgba(255,255,255,0.78)',
      monoBg: 'rgba(255,255,255,0.14)', track: 'rgba(255,255,255,0.14)',
      fill: '#9EC0E8', fillImage: 'linear-gradient(90deg, #6E9BD0 0%, #FFFFFF 100%)', warn: '#F5C24B',
    };
  }
  const light = onAccentInk(panel.primary) !== '#FFFFFF';
  return {
    bg: panel.primary,
    bgImage: `linear-gradient(135deg, ${panel.primary} 0%, ${panel.primaryDeep} 100%)`,
    ink: light ? '#0A0A0A' : '#FFFFFF',
    ink2: light ? 'rgba(10,10,10,0.74)' : 'rgba(255,255,255,0.82)',
    ink3: light ? 'rgba(10,10,10,0.68)' : 'rgba(255,255,255,0.78)',
    monoBg: light ? 'rgba(10,10,10,0.08)' : 'rgba(255,255,255,0.14)',
    track: light ? 'rgba(10,10,10,0.12)' : 'rgba(255,255,255,0.14)',
    fill: light ? '#0A0A0A' : '#FFFFFF',
    fillImage: light ? 'linear-gradient(90deg, rgba(10,10,10,0.55) 0%, #0A0A0A 100%)' : 'linear-gradient(90deg, rgba(255,255,255,0.6) 0%, #FFFFFF 100%)',
    warn: light ? '#9C2E2E' : '#F5C24B',
  };
}

function Seg<K extends string>({ value, options, onChange }: { value: K; options: [K, string][]; onChange: (k: K) => void }) {
  const U = useInkUI();
  return (
    <View style={{ flexDirection: 'row', gap: 2, padding: 2, borderRadius: 999, backgroundColor: U.chipNeutral }}>
      {options.map(([k, label]) => {
        const active = k === value;
        return (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }: any) => ({
              paddingVertical: 4, paddingHorizontal: active ? 11 : 8, borderRadius: 999,
              backgroundColor: active ? U.segActive : 'transparent',
              transform: [{ scale: pressed ? 0.96 : 1 }],
              ...(active && web ? { boxShadow: '0 1px 2px rgba(0,0,0,0.08)' } : {}),
              ...(web ? { cursor: 'pointer', transitionProperty: 'background-color, padding', transitionDuration: '160ms' } : {}),
            } as any)}
          >
            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? U.ink[900] : U.ink[500] }}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Kapsül çubuk — oran değişince 0→hedef değil, BULUNDUĞU değerden hedefe akar. */
function Bar({ ratio, height, dim, skin }: { ratio: number; height: number; dim?: boolean; skin?: LeadSkin }) {
  const P = usePalette();
  const reduced = useReducedMotion();
  const target = Math.max(0.04, Math.min(1, ratio));
  const v = useRef(new Animated.Value(reduced ? target : 0)).current;
  useEffect(() => {
    if (reduced) { v.setValue(target); return; }
    const a = Animated.timing(v, { toValue: target, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [target, reduced, v]);
  const width = v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={{ height, borderRadius: 999, backgroundColor: skin ? skin.track : P.track, overflow: 'hidden' }}>
      <Animated.View style={{
        height, borderRadius: 999, width, opacity: dim ? 0.6 : 1,
        backgroundColor: skin ? skin.fill : P.fillTo,
        ...(web ? { backgroundImage: skin
          ? skin.fillImage
          : `linear-gradient(90deg, ${P.fillFrom} 0%, ${P.fillTo} 100%)` } : {}),
      } as any} />
    </View>
  );
}

/** Klinik avatarı: logo varsa logo (beyaz zeminde, sığdırılmış), yoksa / yüklenemezse monogram. */
function ClinicAvatar({ name, logoUrl, size, lead }: { name: string; logoUrl?: string | null; size: number; lead?: LeadSkin }) {
  const P = usePalette();
  const T = useMobileTokens();
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [logoUrl]);
  const radius = size / 2;
  if (logoUrl && !broken) {
    return (
      <View style={{
        width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: '#FFFFFF',
        borderWidth: lead ? 0 : 1, borderColor: T.hairline, alignItems: 'center', justifyContent: 'center',
      }}>
        <Image
          source={{ uri: logoUrl }}
          onError={() => setBroken(true)}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ width: '100%', height: '100%' }}
        />
      </View>
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center',
      backgroundColor: lead ? lead.monoBg : P.avatarBg,
    }}>
      <Text style={{ fontSize: Math.round(size * 0.36), fontWeight: '700', letterSpacing: 0.3, color: lead ? lead.ink : P.avatarFg }}>{monogram(name)}</Text>
    </View>
  );
}

/** Sıra rozeti — avatarın sağ üst köşesinde taç: 1 altın · 2 gümüş · 3 bronz.
 *  Metal tonları her iki temada aynı (ödül rengi, çevrilmez); taç beyaz. */
const MEDALS = {
  1: { base: '#E8A923', grad: 'linear-gradient(145deg, #FFD15C 0%, #E8A923 50%, #B97A0C 100%)', glow: 'rgba(217,154,30,0.45)', ink: '#FFFFFF' },
  2: { base: '#9DA9B5', grad: 'linear-gradient(145deg, #CDD5DD 0%, #9DA9B5 50%, #707D8A 100%)', glow: 'rgba(120,135,150,0.40)', ink: '#FFFFFF' },
  3: { base: '#C27F4A', grad: 'linear-gradient(145deg, #E5AE7F 0%, #C27F4A 50%, #8E5328 100%)', glow: 'rgba(165,103,58,0.40)', ink: '#FFFFFF' },
} as const;

function RankBadge({ rank, size }: { rank: 1 | 2 | 3; size: number }) {
  const T = useMobileTokens();
  const m = MEDALS[rank];
  const title = `${rank}. ${autoT('sıra')}`;
  const text = rank === 1 ? autoT('Seçili dönemde en çok iş gönderen')
    : rank === 2 ? autoT('Seçili dönemde ikinci sırada') : autoT('Seçili dönemde üçüncü sırada');
  const off = -Math.round(size * 0.38);
  return (
    <View style={{ position: 'absolute', right: off, top: off }}>
      <GlassTooltip title={title} text={text}>
        <View
          accessibilityLabel={`${title} · ${text}`}
          style={{
            width: size, height: size, borderRadius: size / 2,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: m.base, borderWidth: 2, borderColor: T.card,
            ...(web ? { backgroundImage: m.grad, boxShadow: `0 2px 6px ${m.glow}` } : {}),
          } as any}
        >
          <RoyalCrown size={Math.round(size * 0.52)} color={m.ink} strokeWidth={2} />
        </View>
      </GlassTooltip>
    </View>
  );
}

/** 4. ve sonrası: madalyasız, nötr sayı rozeti — aynı köşe, aynı ölçü. */
function PlainRankBadge({ rank, size }: { rank: number; size: number }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  const off = -Math.round(size * 0.38);
  return (
    <View
      accessibilityLabel={`${rank}. ${autoT('sıra')}`}
      style={{
        position: 'absolute', right: off, top: off,
        width: size, height: size, borderRadius: size / 2,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: isDark ? '#3A3833' : '#E4E6EA', borderWidth: 2, borderColor: T.card,
      }}
    >
      <Text style={{ fontSize: Math.round(size * 0.5), fontWeight: '700', color: isDark ? '#F7F2E9' : '#4A4F57', fontVariant: ['tabular-nums'] }}>{rank}</Text>
    </View>
  );
}

function OverdueMark({ color }: { color?: string } = {}) {
  const U = useInkUI();
  return (
    <GlassTooltip title={autoT('Vadesi geçmiş borç')} text={autoT('Ödeme durumu sıralamayı etkilemez')}>
      <View accessibilityLabel={autoT('Vadesi geçmiş borç')}>
        <AlertTriangle size={12} color={color ?? U.chipTones.warning.fg} strokeWidth={1.8} />
      </View>
    </GlassTooltip>
  );
}

export function TopClinicsCard(props: {
  compact?: boolean;
  /** Izgara hücresinde komşularıyla eş boy olmak için (flex:1). ScrollView içinde verme. */
  fill?: boolean;
  /** false → ciroya dayalı "Puan" sıralaması hiç sunulmaz (lab panosu: finansal olmayan). */
  scoreMode?: boolean;
  summaries?: Map<string, ClinicSummary>;
  onOpen?: (clinicId: string) => void;
}) {
  const T = useMobileTokens();
  const U = useInkUI();
  const P = usePalette();
  const canProfit = usePermissionStore((s) => s.can('view_profit')) && props.scoreMode !== false;
  const live = useClinicSummaries();
  const modal = useClinicSummaryModal();
  const map = props.summaries ?? live.map;
  const status = props.summaries ? 'ready' : live.status;
  const [period, setPeriod] = useState<Period>('month');
  const [modeRaw, setMode] = useState<RankMode>('uye');
  const mode: RankMode = canProfit ? modeRaw : 'uye';
  const rows = useMemo(() => rankTop(map, period, mode), [map, period, mode]);
  const val = (r: (typeof rows)[number]) => (mode === 'uye' ? r.uye : r.score);
  const max = Math.max(1, ...rows.map(val));
  // Pay: dönemdeki TÜM kliniklerin üyesi içinde (yalnız ilk 5 değil).
  const totalUye = useMemo(() => {
    let t = 0; for (const s of map.values()) t += s[period].qty.uye; return t;
  }, [map, period]);
  const share = (u: number) => (totalUye > 0 ? Math.round((u / totalUye) * 100) : 0);
  const open = (id: string) => (props.onOpen ? props.onOpen(id) : modal.open(id));
  const pad = props.compact ? 14 : 18;

  const emptyText = status === 'loading' ? '…'
    : status === 'error' ? autoT('Özet yüklenemedi')
    : period === 'month' ? autoT('Bu ay henüz iş yok') : autoT('Henüz iş yok');

  const pressStyle = (extra: any) => ({ hovered, pressed }: any) => ({
    ...extra,
    transform: [{ scale: pressed ? 0.985 : 1 }],
    ...(web ? { cursor: 'pointer', transitionProperty: 'transform, background-color', transitionDuration: pressed ? '80ms' : '180ms' } : {}),
    ...(hovered && !extra.backgroundColor ? { backgroundColor: U.rowHover } : {}),
  });

  const [lead, ...rest] = rows;
  const skin = useLeadSkin();

  return (
    <View style={{
      backgroundColor: T.card, borderRadius: DS.radius.xl, borderWidth: 1, borderColor: T.hairline,
      padding: pad, ...(props.fill ? { flex: 1 } : {}),
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Text style={{ flexShrink: 1, fontSize: 14, fontWeight: '600', letterSpacing: -0.1, color: T.ink }} numberOfLines={1}>{autoT('En çok iş gönderenler')}</Text>
        <Seg value={period} onChange={setPeriod} options={[['month', autoT('Bu ay')], ['all', autoT('Tümü')]]} />
      </View>

      {!lead ? (
        <View style={{ flex: props.fill ? 1 : undefined, justifyContent: 'center', paddingVertical: 22 }}>
          <Text style={{ fontSize: 12.5, textAlign: 'center', color: status === 'error' ? U.chipTones.danger.fg : T.ink3 }}>{emptyText}</Text>
        </View>
      ) : (
        <View style={{ flex: props.fill ? 1 : undefined, gap: 4 }}>
          {/* Lider — lacivert kutu (her iki temada), içerik beyaz; değer öne çıkar */}
          <Pressable
            onPress={() => open(lead.clinicId)}
            accessibilityRole="button"
            accessibilityLabel={`1. ${titleCaseTR(lead.name)}`}
            style={pressStyle({
              borderRadius: 14, padding: 10, marginBottom: 4,
              backgroundColor: skin.bg,
              ...(web ? { backgroundImage: skin.bgImage } : {}),
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View>
                <ClinicAvatar name={lead.name} logoUrl={map.get(lead.clinicId)?.logoUrl} size={38} lead={skin} />
                <RankBadge rank={1} size={20} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={{ flexShrink: 1, fontSize: 13.5, fontWeight: '700', color: skin.ink }} numberOfLines={1}>{titleCaseTR(lead.name)}</Text>
                  {lead.overdue ? <OverdueMark color={skin.warn} /> : null}
                </View>
                <Text style={{ fontSize: 11, color: skin.ink2, marginTop: 1 }} numberOfLines={1}>
                  {`${autoT('Pay')} %${share(lead.uye)}`}{mode === 'score' ? ` · ${lead.uye} ${autoT('üye')}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 22, fontWeight: '300', letterSpacing: -0.6, color: skin.ink, fontVariant: ['tabular-nums'] }}>{String(val(lead))}</Text>
                <Text style={{ fontSize: 11, color: skin.ink3, marginTop: -2 }}>{mode === 'uye' ? autoT('üye') : autoT('Puan')}</Text>
              </View>
            </View>
            <View style={{ marginTop: 9 }}><Bar ratio={share(lead.uye) / 100} height={5} skin={skin} /></View>
          </Pressable>

          {rest.map((r, i) => (
            <Pressable
              key={r.clinicId}
              onPress={() => open(r.clinicId)}
              accessibilityRole="button"
              accessibilityLabel={`${i + 2}. ${titleCaseTR(r.name)}`}
              style={pressStyle({ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, paddingVertical: 5, paddingHorizontal: 6, marginHorizontal: -6 })}
            >
              <View>
                <ClinicAvatar name={r.name} logoUrl={map.get(r.clinicId)?.logoUrl} size={28} />
                {i < 2 ? <RankBadge rank={(i + 2) as 2 | 3} size={16} /> : <PlainRankBadge rank={i + 2} size={16} />}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={{ flexShrink: 1, fontSize: 12.5, fontWeight: '600', color: T.ink }} numberOfLines={1}>{titleCaseTR(r.name)}</Text>
                  {r.overdue ? <OverdueMark /> : null}
                </View>
                <Bar ratio={(share(lead.uye) / 100) * (val(r) / max)} height={3} dim />
              </View>
              <View style={{ alignItems: 'flex-end', minWidth: 38 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.ink, fontVariant: ['tabular-nums'] }}>{String(val(r))}</Text>
                <Text style={{ fontSize: 11, color: T.ink2 }} numberOfLines={1}>{`%${share(r.uye)}`}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {canProfit ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: T.hairline }}>
          <Text style={{ fontSize: 11, color: T.ink3 }} numberOfLines={1}>{autoT('Sırala')}</Text>
          <Seg value={mode} onChange={setMode} options={[['uye', autoT('Üye')], ['score', autoT('Puan')]]} />
        </View>
      ) : null}
      {modal.element}
    </View>
  );
}
