/**
 * RemakeQualityCard — Yeniden-yapım (remake) kalite kartı (sade kart; hero DEĞİL).
 *
 * Oran = dönemde LAB kaynaklı revizyon / dönemde teslim edilen sipariş.
 * Hekim kaynaklı revizyonlar ayrı gösterilir — onlar hata değil, ücretli yeni iştir.
 * İstasyon kırılımı revizyon açılırken işaretlenen "hatalı istasyon"dan gelir;
 * işaretlenmemişler "Belirtilmemiş" grubunda toplanır.
 *
 * Dönem sayfanın tek dönem seçicisinden gelir (PerformanceScreen veriyi çeker, burası yalnız çizer).
 * Geniş ekranda iki sütun: solda oran + hata istasyonları, sağda son revizyonlar.
 */

import React from 'react';
import { View, Text, Pressable, Platform, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { TrendingDown, AlertTriangle, ChevronRight } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import type { RemakeStats } from '../../orders/api';

const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const, fontWeight: '300' as const };
const UNSPECIFIED = 'Belirtilmemiş';

/** Sektör pratiği: %2 altı iyi, %5 üstü müdahale gerektirir. */
export function remakeTone(rate: number): 'success' | 'warning' | 'danger' {
  return rate >= 5 ? 'danger' : rate >= 2 ? 'warning' : 'success';
}

interface Props {
  stats: RemakeStats | null;
  loading: boolean;
  /** Revizyon siparişine git */
  onOpenOrder?: (id: string) => void;
}

export function RemakeQualityCard({ stats, loading, onOpenOrder }: Props) {
  const U = useInkUI();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const web = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

  const rate = stats?.rate ?? 0;
  const tone = U.chipTones[remakeTone(rate)];
  const stations = stats?.byStation ?? [];
  const maxStation = stations[0]?.count ?? 1;
  // Yalnız "Belirtilmemiş" varsa çubuk bilgi taşımaz → açıklama göster
  const onlyUnspecified = stations.length > 0 && stations.every(s => s.name === UNSPECIFIED);

  const kicker = { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const, color: U.ink[400] };

  return (
    <View style={{ ...U.cardSolid, padding: 24 }}>
      {loading && !stats ? (
        <View style={{ paddingVertical: 28, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={U.ink[500]} />
        </View>
      ) : !stats ? (
        <Text style={{ fontSize: 13, color: U.ink[400] }}>{autoT('Veri alınamadı.')}</Text>
      ) : (
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 40 : 24, opacity: loading ? 0.6 : 1 }}>
          {/* ── Sol: oran + kırılım ───────────────────────── */}
          <View style={{ flex: 1, gap: 18, minWidth: 0 }}>
            <View style={{ gap: 6 }}>
              <Text style={kicker}>{autoT('Yeniden yapım')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <Text style={{ ...DISPLAY, fontSize: 40, lineHeight: 44, letterSpacing: -1.2, color: tone.fg }}>
                  %{rate.toFixed(1)}
                </Text>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: tone.bg }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: tone.fg }}>
                    {rate >= 5 ? autoT('Müdahale gerekli') : rate >= 2 ? autoT('İzlenmeli') : autoT('İyi')}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 12.5, color: U.ink[500], lineHeight: 18 }}>
                {autoT('Lab kaynaklı revizyon / teslim edilen sipariş. Hekim kaynaklı revizyonlar orana girmez.')}
              </Text>
            </View>

            {/* Üç sayı — eşit kutular */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                { label: autoT('Teslim'), value: stats.delivered, color: U.ink[900] },
                { label: autoT('Lab kaynaklı'), value: stats.revisionsLab, color: stats.revisionsLab > 0 ? U.chipTones.danger.fg : U.ink[900] },
                { label: autoT('Hekim kaynaklı'), value: stats.revisionsClient, color: U.ink[900] },
              ]).map(s => (
                <View key={s.label} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: U.surfaceSoft }}>
                  <Text style={{ fontSize: 11, color: U.ink[500] }} numberOfLines={1}>{s.label}</Text>
                  <Text style={{ ...DISPLAY, fontSize: 22, lineHeight: 26, letterSpacing: -0.5, color: s.color, marginTop: 2 }}>{s.value}</Text>
                </View>
              ))}
            </View>

            {stations.length > 0 ? (
              <View style={{ gap: 10 }}>
                <Text style={kicker}>{autoT('Nerede hata oluyor')}</Text>
                {onlyUnspecified ? (
                  <Text style={{ fontSize: 12.5, color: U.ink[500], lineHeight: 18 }}>
                    {`${stations[0].count} ${autoT('revizyonda hatalı istasyon işaretlenmemiş. Revizyon açarken istasyonu seçerseniz burada kırılım görünür.')}`}
                  </Text>
                ) : stations.map(s => (
                  <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={{ fontSize: 12.5, color: U.ink[700], width: 120 }} numberOfLines={1}>{s.name === UNSPECIFIED ? autoT(UNSPECIFIED) : s.name}</Text>
                    <View style={{ flex: 1, height: 6, borderRadius: 999, backgroundColor: U.chipNeutral, overflow: 'hidden' }}>
                      <View style={{ width: `${(s.count / maxStation) * 100}%`, height: '100%', borderRadius: 999, backgroundColor: s.name === UNSPECIFIED ? U.ink[300] : U.chipTones.danger.fg }} />
                    </View>
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.ink[900], width: 24, textAlign: 'right' }}>{s.count}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {/* ── Sağ: son revizyonlar ──────────────────────── */}
          <View style={{ flex: wide ? 1.15 : undefined, gap: 6, minWidth: 0, ...(wide ? {} : { paddingTop: 20, borderTopWidth: 1, borderTopColor: U.hairlineSoft }) }}>
            <Text style={{ ...kicker, marginBottom: 4 }}>
              {`${autoT('Son revizyonlar')}${stats.rows.length ? ` · ${stats.rows.length}` : ''}`}
            </Text>
            {stats.rows.length > 0 ? stats.rows.slice(0, 8).map(r => {
              const lab = r.revision_responsible === 'lab';
              return (
                <Pressable
                  key={r.id}
                  onPress={() => onOpenOrder?.(r.id)}
                  disabled={!onOpenOrder}
                  style={({ pressed, hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingVertical: 9, paddingHorizontal: 10, marginHorizontal: -10, borderRadius: 10,
                    backgroundColor: hovered || pressed ? U.rowHover : 'transparent',
                    ...(onOpenOrder ? web : {}),
                  })}
                >
                  <View style={{
                    width: 54, alignItems: 'center', paddingVertical: 3, borderRadius: 6,
                    backgroundColor: lab ? U.chipTones.danger.bg : U.chipNeutral,
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.4, color: lab ? U.chipTones.danger.fg : U.ink[500] }}>
                      {lab ? autoT('LAB') : autoT('HEKİM')}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>
                      {r.order_number}
                      {r.parent_order_number ? <Text style={{ color: U.ink[400], fontWeight: '400' }}>{`  ← ${r.parent_order_number}`}</Text> : null}
                    </Text>
                    {(r.revision_reason || r.fault_station) ? (
                      <Text style={{ fontSize: 12, color: U.ink[500], marginTop: 1 }} numberOfLines={1}>
                        {[r.fault_station, r.revision_reason].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  {onOpenOrder ? <ChevronRight size={14} color={U.ink[300]} strokeWidth={2} /> : null}
                </Pressable>
              );
            }) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
                {rate === 0 && stats.delivered > 0
                  ? <TrendingDown size={14} color={U.chipTones.success.fg} strokeWidth={2} />
                  : <AlertTriangle size={14} color={U.ink[400]} strokeWidth={2} />}
                <Text style={{ fontSize: 12.5, color: U.ink[500] }}>
                  {stats.delivered > 0 ? autoT('Bu dönemde revizyon yok.') : autoT('Bu dönemde teslim edilen sipariş yok.')}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
