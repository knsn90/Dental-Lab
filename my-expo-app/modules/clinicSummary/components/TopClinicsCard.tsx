// Özet sayfası widget'ı: en çok iş gönderen ilk 5 klinik.
// Dönem: Bu ay / Tümü · Sıralama: Üye / Puan (0.5 üye + 0.5 ciro, 0–100).
// Ödeme durumu sıralamayı ETKİLEMEZ; vadesi geçen borçta yalnız uyarı işareti.
// Düzen: lider klinik öne çıkan satırda (monogram + pay yüzdesi + büyük değer),
// 2–5 sıkı satırlar; çubuklar dönem/sıralama değişince yumuşakça dolar (hareket
// azaltma açıksa anında). Dar bir üçte-bir sütuna sığar.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, Animated, Easing } from 'react-native';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePermissionStore } from '../../../core/store/permissionStore';
import { DS } from '../../../core/theme/dsTokens';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { AlertTriangle } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
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

function usePalette() {
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  return {
    isDark,
    fillFrom: isDark ? '#4F7DB8' : DS.exec.primary,
    fillTo: isDark ? '#9EC0E8' : DS.exec.primaryDeep,
    track: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(23,34,53,0.06)',
    tint: isDark ? 'rgba(127,168,217,0.12)' : 'rgba(71,113,171,0.07)',
    tintBorder: isDark ? 'rgba(127,168,217,0.22)' : 'rgba(71,113,171,0.14)',
    avatarBg: isDark ? 'rgba(127,168,217,0.18)' : 'rgba(49,79,126,0.10)',
    avatarFg: isDark ? '#BFD3EC' : DS.exec.primaryDeep,
    leadAvatarBg: isDark ? '#004B87' : DS.exec.primaryDeep,
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
function Bar({ ratio, height, dim }: { ratio: number; height: number; dim?: boolean }) {
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
    <View style={{ height, borderRadius: 999, backgroundColor: P.track, overflow: 'hidden' }}>
      <Animated.View style={{
        height, borderRadius: 999, width, opacity: dim ? 0.6 : 1,
        backgroundColor: P.fillTo,
        ...(web ? { backgroundImage: `linear-gradient(90deg, ${P.fillFrom} 0%, ${P.fillTo} 100%)` } : {}),
      } as any} />
    </View>
  );
}

function OverdueMark() {
  const U = useInkUI();
  return (
    <GlassTooltip title={autoT('Vadesi geçmiş borç')} text={autoT('Ödeme durumu sıralamayı etkilemez')}>
      <View accessibilityLabel={autoT('Vadesi geçmiş borç')}>
        <AlertTriangle size={12} color={U.chipTones.warning.fg} strokeWidth={1.8} />
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
          {/* Lider — renkli zemin değil, hafif ton + ince kenar; değer öne çıkar */}
          <Pressable
            onPress={() => open(lead.clinicId)}
            accessibilityRole="button"
            accessibilityLabel={`1. ${lead.name}`}
            style={pressStyle({
              borderRadius: 14, padding: 10, marginBottom: 4,
              backgroundColor: P.tint, borderWidth: 1, borderColor: P.tintBorder,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: P.leadAvatarBg }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 }}>{monogram(lead.name)}</Text>
                <View style={{
                  position: 'absolute', right: -5, top: -5, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3,
                  alignItems: 'center', justifyContent: 'center', backgroundColor: T.card, borderWidth: 1, borderColor: P.tintBorder,
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: P.avatarFg }}>1</Text>
                </View>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={{ flexShrink: 1, fontSize: 13.5, fontWeight: '700', color: T.ink }} numberOfLines={1}>{lead.name}</Text>
                  {lead.overdue ? <OverdueMark /> : null}
                </View>
                <Text style={{ fontSize: 11, color: T.ink3, marginTop: 1 }} numberOfLines={1}>
                  {`${autoT('Pay')} %${share(lead.uye)}`}{mode === 'score' ? ` · ${lead.uye} ${autoT('üye')}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 22, fontWeight: '300', letterSpacing: -0.6, color: T.ink, fontVariant: ['tabular-nums'] }}>{String(val(lead))}</Text>
                <Text style={{ fontSize: 10, color: T.ink3, marginTop: -2 }}>{mode === 'uye' ? autoT('üye') : autoT('Puan')}</Text>
              </View>
            </View>
            <View style={{ marginTop: 9 }}><Bar ratio={1} height={5} /></View>
          </Pressable>

          {rest.map((r, i) => (
            <Pressable
              key={r.clinicId}
              onPress={() => open(r.clinicId)}
              accessibilityRole="button"
              accessibilityLabel={`${i + 2}. ${r.name}`}
              style={pressStyle({ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, paddingVertical: 5, paddingHorizontal: 6, marginHorizontal: -6 })}
            >
              <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: P.avatarBg }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: P.avatarFg }}>{monogram(r.name)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3, fontVariant: ['tabular-nums'] }}>{i + 2}</Text>
                  <Text style={{ flexShrink: 1, fontSize: 12.5, fontWeight: '600', color: T.ink }} numberOfLines={1}>{r.name}</Text>
                  {r.overdue ? <OverdueMark /> : null}
                </View>
                <Bar ratio={val(r) / max} height={3} dim />
              </View>
              <View style={{ alignItems: 'flex-end', minWidth: 38 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: T.ink, fontVariant: ['tabular-nums'] }}>{String(val(r))}</Text>
                <Text style={{ fontSize: 10, color: T.ink3 }} numberOfLines={1}>{`%${share(r.uye)}`}</Text>
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
