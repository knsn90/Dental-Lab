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
import { RotateCcw, TrendingDown, AlertTriangle } from 'lucide-react-native';
import { fetchRemakeStats, type RemakeStats } from '../../orders/api';

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
    <View style={{
      backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20, gap: 16,
      borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
      ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } as any : {}),
    }}>
      {/* Başlık + dönem */}
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: accentColor + '1A', alignItems: 'center', justifyContent: 'center' }}>
          <RotateCcw size={16} color={accentColor} strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#0A0A0A', letterSpacing: -0.2 }}>Yeniden Yapım</Text>
          <Text style={{ fontSize: 11.5, color: '#9A9A9A', marginTop: 1 }}>Lab kaynaklı revizyon / teslim edilen</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {PERIODS.map(p => {
            const active = days === p.key;
            return (
              <Pressable key={p.key} onPress={() => setDays(p.key)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                  backgroundColor: active ? '#0A0A0A' : '#F5F5F5',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}>
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: active ? '#FFFFFF' : '#6B6B6B' }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={accentColor} />
        </View>
      ) : !stats ? (
        <Text style={{ fontSize: 13, color: '#9A9A9A' }}>Veri alınamadı.</Text>
      ) : (
        <>
          {/* Metrikler */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, alignItems: 'flex-end' }}>
            <View>
              <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1, color: '#9A9A9A', textTransform: 'uppercase' }}>Oran</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 3 }}>
                <Text style={{ fontSize: 38, fontWeight: '300', color: tone, letterSpacing: -1.4, lineHeight: 40 }}>
                  {rate.toFixed(1)}
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '500', color: tone }}>%</Text>
              </View>
            </View>
            <View style={{ gap: 3 }}>
              <Text style={{ fontSize: 12, color: '#6B6B6B' }}>
                Teslim edilen <Text style={{ fontWeight: '700', color: '#0A0A0A' }}>{stats.delivered}</Text>
              </Text>
              <Text style={{ fontSize: 12, color: '#6B6B6B' }}>
                Lab kaynaklı <Text style={{ fontWeight: '700', color: tone }}>{stats.revisionsLab}</Text>
              </Text>
              <Text style={{ fontSize: 12, color: '#6B6B6B' }}>
                Hekim kaynaklı <Text style={{ fontWeight: '700', color: '#0A0A0A' }}>{stats.revisionsClient}</Text>
                <Text style={{ color: '#9A9A9A' }}> · orana girmez</Text>
              </Text>
            </View>
          </View>

          {/* İstasyon kırılımı */}
          {stats.byStation.length > 0 && (
            <View style={{ gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' }}>
              <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1, color: '#9A9A9A', textTransform: 'uppercase' }}>
                Nerede hata oluyor
              </Text>
              {stats.byStation.map(s => (
                <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 12.5, color: '#2C2C2C', width: 118 }} numberOfLines={1}>{s.name}</Text>
                  <View style={{ flex: 1, height: 6, borderRadius: 999, backgroundColor: '#F0F0F0', overflow: 'hidden' }}>
                    <View style={{ width: `${(s.count / maxStation) * 100}%`, height: '100%', borderRadius: 999, backgroundColor: s.name === 'Belirtilmemiş' ? '#D4D4D4' : accentColor }} />
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#0A0A0A', width: 22, textAlign: 'right' }}>{s.count}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Son revizyonlar */}
          {stats.rows.length > 0 ? (
            <View style={{ gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' }}>
              <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1, color: '#9A9A9A', textTransform: 'uppercase' }}>
                Revizyonlar ({stats.rows.length})
              </Text>
              {stats.rows.slice(0, 8).map(r => (
                <Pressable key={r.id} onPress={() => onOpenOrder?.(r.id)}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5, ...(Platform.OS === 'web' && onOpenOrder ? { cursor: 'pointer' } as any : {}) }}>
                  <View style={{
                    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 1,
                    backgroundColor: r.revision_responsible === 'lab' ? '#FEE2E2' : '#F0F0F0',
                  }}>
                    <Text style={{ fontSize: 9.5, fontWeight: '700', color: r.revision_responsible === 'lab' ? '#9C2E2E' : '#6B6B6B' }}>
                      {r.revision_responsible === 'lab' ? 'LAB' : 'HEKİM'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#0A0A0A' }}>
                      {r.order_number}
                      {r.parent_order_number ? <Text style={{ color: '#9A9A9A', fontWeight: '400' }}>  ← {r.parent_order_number}</Text> : null}
                      {r.fault_station ? <Text style={{ color: '#9A9A9A', fontWeight: '400' }}>  · {r.fault_station}</Text> : null}
                    </Text>
                    {!!r.revision_reason && (
                      <Text style={{ fontSize: 11.5, color: '#6B6B6B', marginTop: 1 }} numberOfLines={2}>{r.revision_reason}</Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' }}>
              {rate === 0 && stats.delivered > 0
                ? <TrendingDown size={14} color="#059669" strokeWidth={2} />
                : <AlertTriangle size={14} color="#9A9A9A" strokeWidth={2} />}
              <Text style={{ fontSize: 12.5, color: '#6B6B6B' }}>
                {stats.delivered > 0 ? 'Bu dönemde revizyon yok.' : 'Bu dönemde teslim edilen sipariş yok.'}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}
