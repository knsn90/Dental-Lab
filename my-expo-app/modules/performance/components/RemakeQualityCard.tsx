/**
 * RemakeQualityCard — Yeniden-yapım (remake) kalite panosu.
 *
 * Oran = dönemde LAB kaynaklı revizyon / dönemde teslim edilen sipariş.
 * Hekim kaynaklı revizyonlar ayrı gösterilir — onlar hata değil, ücretli yeni iştir.
 * İstasyon kırılımı revizyon açılırken işaretlenen "hatalı istasyon"dan gelir;
 * işaretlenmemişler "Belirtilmemiş" grubunda toplanır.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Platform, ActivityIndicator } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { TrendingDown, AlertTriangle } from '../../../core/ui/icons';
import { fetchRemakeStats, type RemakeStats } from '../../orders/api';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { onAccentInk } from '../../../core/theme/usePanelTheme';

const PERIODS = [
  { key: '30',  label: '30 gün' },
  { key: '90',  label: '90 gün' },
  { key: '365', label: '1 yıl'  },
] as const;

interface Props {
  accentColor?: string;
  /** Revizyon siparişine git */
  onOpenOrder?: (id: string) => void;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function RemakeQualityCard({ accentColor = '#7C3AED', onOpenOrder }: Props) {
  const U = useInkUI();
  const heroInk = useWhiteHeroInk(accentColor);
  const [days, setDays] = useState<string>('90');
  const [stats, setStats] = useState<RemakeStats | null>(null);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - Number(days));
    return { from: iso(from), to: iso(to) };
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRemakeStats(range.from, range.to)
      .then(s => { if (!cancelled) { setStats(s); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to]);

  const rate = stats?.rate ?? 0;
  // Sektör pratiği: %2 altı iyi, %5 üstü müdahale gerektirir
  const tone = rate >= 5 ? '#DC2626' : rate >= 2 ? '#D97706' : '#059669';
  const maxStation = stats?.byStation[0]?.count ?? 1;

  return (
    /* ── Hero — "BEYAZ HERO" (core/ui/WhiteHero) ─────────────────
       Oran 38px'lik bir metrik olarak gövdenin içinde duruyordu; asıl cevap
       o. Prim Motoru hiyerarşisine alındı: kicker → 44px oran → bağlam →
       sağda 40px stat'lar → sağ üstte dönem seçici. Oranın yeşil/turuncu/
       kırmızı tonu KORUNUR (eşik sinyali). */
    <WhiteHero
      kicker="Yeniden Yapım"
      accent={accentColor}
      title={<><Text style={{ color: tone }}>%{rate.toFixed(1)}</Text> yeniden yapım</>}
      description={
        'Lab kaynaklı revizyon / teslim edilen' +
        (stats ? ` · ${stats.delivered} teslim · ${stats.revisionsLab} lab kaynaklı` : '')
      }
      stats={stats ? [
        { value: String(stats.delivered),        label: 'Teslim' },
        { value: String(stats.revisionsLab),     label: 'Lab' },
        { value: String(stats.revisionsClient),  label: 'Hekim' },
      ] : undefined}
      cta={
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {PERIODS.map(p => {
            const active = days === p.key;
            return (
              <Pressable key={p.key} onPress={() => setDays(p.key)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                  backgroundColor: active ? accentColor : heroInk.tileBg,
                  borderWidth: 1, borderColor: active ? accentColor : heroInk.tileBorder,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}>
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: active ? onAccentInk(accentColor) : heroInk.inkSoft }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
      }
    >

      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      ) : !stats ? (
        <Text style={{ fontSize: 13, color: U.ink[400] }}>Veri alınamadı.</Text>
      ) : (
        <>
          {/* Hekim kaynaklı revizyon ORANA GİRMEZ — stat'ta sayı var ama bu
              kural yalnız burada yazılı; kaldırılırsa rakam yanlış okunur. */}
          <Text style={{ fontSize: 11.5, color: heroInk.inkFaint, marginTop: 12 }}>
            Hekim kaynaklı revizyonlar orana girmez.
          </Text>

          {/* İstasyon kırılımı */}
          {stats.byStation.length > 0 && (
            <View style={{ gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: heroInk.tileBorder }}>
              <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1, color: heroInk.inkSoft, textTransform: 'uppercase' }}>
                Nerede hata oluyor
              </Text>
              {stats.byStation.map(s => (
                <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 12.5, color: U.ink[700], width: 118 }} numberOfLines={1}>{s.name}</Text>
                  <View style={{ flex: 1, height: 6, borderRadius: 999, backgroundColor: U.chipNeutral, overflow: 'hidden' }}>
                    <View style={{ width: `${(s.count / maxStation) * 100}%`, height: '100%', borderRadius: 999, backgroundColor: s.name === 'Belirtilmemiş' ? U.ink[300] : accentColor }} />
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: U.ink[900], width: 22, textAlign: 'end' as any }}>{s.count}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Son revizyonlar */}
          {stats.rows.length > 0 ? (
            <View style={{ gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: heroInk.tileBorder }}>
              <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1, color: heroInk.inkSoft, textTransform: 'uppercase' }}>
                Revizyonlar ({stats.rows.length})
              </Text>
              {stats.rows.slice(0, 8).map(r => (
                <Pressable key={r.id} onPress={() => onOpenOrder?.(r.id)}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5, ...(Platform.OS === 'web' && onOpenOrder ? { cursor: 'pointer' } as any : {}) }}>
                  <View style={{
                    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 1,
                    backgroundColor: r.revision_responsible === 'lab' ? U.chipTones.danger.bg : U.chipNeutral,
                  }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: r.revision_responsible === 'lab' ? U.chipTones.danger.fg : U.ink[500] }}>
                      {r.revision_responsible === 'lab' ? 'LAB' : 'HEKİM'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.ink[900] }}>
                      {r.order_number}
                      {r.parent_order_number ? <Text style={{ color: U.ink[400], fontWeight: '400' }}>  ← {r.parent_order_number}</Text> : null}
                      {r.fault_station ? <Text style={{ color: U.ink[400], fontWeight: '400' }}>  · {r.fault_station}</Text> : null}
                    </Text>
                    {!!r.revision_reason && (
                      <Text style={{ fontSize: 11.5, color: U.ink[500], marginTop: 1 }} numberOfLines={2}>{r.revision_reason}</Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: heroInk.tileBorder }}>
              {rate === 0 && stats.delivered > 0
                ? <TrendingDown size={14} color="#059669" strokeWidth={2} />
                : <AlertTriangle size={14} color="#9A9A9A" strokeWidth={2} />}
              <Text style={{ fontSize: 12.5, color: U.ink[500] }}>
                {stats.delivered > 0 ? 'Bu dönemde revizyon yok.' : 'Bu dönemde teslim edilen sipariş yok.'}
              </Text>
            </View>
          )}
        </>
      )}
    </WhiteHero>
  );
}
