// modules/occlusion/components/OcclusionReport.tsx
// Alt expandable rapor paneli — summary chips + detay
// Prototip: app/app.jsx ReportPanel + DistanceHistogram

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { OcclusionStatistics, PenetrationPoint, Severity } from '../types/occlusion';
import { clinicalSummary } from '../utils/penetrationDetector';

interface Props {
  stats:          OcclusionStatistics | null;
  penPoints:      PenetrationPoint[];
  expanded:       boolean;
  onToggle:       () => void;
  onExportPDF?:   () => void;
  onSaveToOrder?: () => void;
  isMobile?:      boolean;
}

export function OcclusionReport({
  stats, penPoints, expanded, onToggle, onExportPDF, onSaveToOrder, isMobile,
}: Props) {
  const sevCounts = useMemo(() => {
    const c: Record<Severity, number> = { low: 0, medium: 0, high: 0 };
    for (const p of penPoints) c[p.severity]++;
    return c;
  }, [penPoints]);

  if (!stats) return null;

  const totalPen = sevCounts.high + sevCounts.medium + sevCounts.low;
  const summaryText = clinicalSummary(stats, sevCounts);

  return (
    <View style={[s.container, expanded && s.containerExpanded, isMobile && s.containerMobile, isMobile && expanded && s.containerMobileExpanded]}>
      {/* Summary strip (always visible) */}
      {isMobile ? (
        <TouchableOpacity activeOpacity={0.95} onPress={onToggle} style={s.summaryMobileWrap}>
          <View style={s.summaryMobileHeader}>
            <Text style={s.summaryMobileTitle}>Özet</Text>
            <View style={s.toggle}>
              <Text style={s.toggleText}>{expanded ? 'Gizle' : 'Detay'}</Text>
              <MaterialCommunityIcons
                name={expanded ? 'chevron-down' : 'chevron-up'}
                size={14} color="#64748B"
              />
            </View>
          </View>
          <View style={s.summaryMobileGrid}>
            <View style={s.gridCell}>
              <StatCompact label="Temas Alanı" value={`${stats.contactPercentage}`} unit="%"
                tone={stats.contactPercentage > 30 ? 'ok' : 'warn'} />
            </View>
            <View style={s.gridCell}>
              <StatCompact label="Penetrasyon" value={`${totalPen}`}
                tone={sevCounts.high > 0 ? 'danger' : sevCounts.medium > 0 ? 'warn' : 'ok'} />
            </View>
            <View style={s.gridCell}>
              <StatCompact label="Min Mesafe" value={stats.minDistance.toFixed(2)} unit="mm" />
            </View>
            <View style={s.gridCell}>
              <StatCompact label="Ort. Mesafe" value={stats.avgDistance.toFixed(2)} unit="mm" />
            </View>
            <View style={[s.gridCell, s.gridCellFull]}>
              <StatCompact label="Toplam Pen. Alanı" value={stats.totalPenetrationArea.toFixed(1)} unit="mm²" />
            </View>
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={s.summary} onPress={onToggle} activeOpacity={0.95}>
          <Stat label="Temas Alanı"      value={`${stats.contactPercentage}`} unit="%"  tone={stats.contactPercentage > 30 ? 'ok' : 'warn'} />
          <Divider />
          <Stat label="Penetrasyon"       value={`${totalPen}`}                tone={sevCounts.high > 0 ? 'danger' : sevCounts.medium > 0 ? 'warn' : 'ok'} />
          <Divider />
          <Stat label="Min Mesafe"        value={stats.minDistance.toFixed(2)}  unit="mm" />
          <Divider />
          <Stat label="Ort. Mesafe"       value={stats.avgDistance.toFixed(2)}  unit="mm" />
          <Divider />
          <Stat label="Toplam Pen. Alanı" value={stats.totalPenetrationArea.toFixed(1)} unit="mm²" />
          <View style={s.toggle}>
            <Text style={s.toggleText}>{expanded ? 'Gizle' : 'Detay'}</Text>
            <MaterialCommunityIcons
              name={expanded ? 'chevron-down' : 'chevron-up'}
              size={14} color="#64748B"
            />
          </View>
        </TouchableOpacity>
      )}

      {/* Expanded detail */}
      {expanded && (
        <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 16 }}>
          <View style={s.section}>
            <Text style={s.sectionTitle}>Şiddet Dağılımı</Text>
            {([
              { key: 'high' as Severity,   label: 'Yüksek', desc: '> 0.3 mm',   color: '#DC2626' },
              { key: 'medium' as Severity, label: 'Orta',   desc: '0.1 – 0.3 mm', color: '#D97706' },
              { key: 'low' as Severity,    label: 'Düşük',  desc: '< 0.1 mm',   color: '#059669' },
            ]).map((row) => {
              const count = sevCounts[row.key];
              const pct = totalPen > 0 ? (count / totalPen) * 100 : 0;
              return (
                <View key={row.key} style={s.distRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: 80 }}>
                    <View style={[s.sevDot, { backgroundColor: row.color }]} />
                    <Text style={s.distLabel}>{row.label}</Text>
                  </View>
                  <View style={s.distBar}>
                    <View style={[s.distBarFill, { width: `${pct}%`, backgroundColor: row.color }]} />
                  </View>
                  <Text style={s.distCount}>{count}</Text>
                </View>
              );
            })}
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Mesafe Aralığı</Text>
            <DistanceHistogram stats={stats} />
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Klinik Değerlendirme</Text>
            <Text style={s.clinicalText}>{summaryText}</Text>
            <View style={s.actionRow}>
              {onExportPDF && (
                <TouchableOpacity style={s.btnGhost} onPress={onExportPDF} activeOpacity={0.85}>
                  <MaterialCommunityIcons name="download" size={14} color="#0F172A" />
                  <Text style={s.btnGhostText}>PDF</Text>
                </TouchableOpacity>
              )}
              {onSaveToOrder && (
                <TouchableOpacity style={s.btnPrimary} onPress={onSaveToOrder} activeOpacity={0.85}>
                  <MaterialCommunityIcons name="link-variant" size={14} color="#FFFFFF" />
                  <Text style={s.btnPrimaryText}>İş Emrine Ekle</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Sub ─────────────────────────────────────────────────
function Stat({
  label, value, unit, tone = 'default',
}: { label: string; value: string; unit?: string; tone?: 'default' | 'ok' | 'warn' | 'danger' }) {
  const toneColor = tone === 'ok' ? '#059669' : tone === 'warn' ? '#D97706' : tone === 'danger' ? '#DC2626' : '#0F172A';
  return (
    <View style={stS.stat}>
      <Text style={stS.label}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={[stS.value, { color: toneColor }]}>{value}</Text>
        {unit && <Text style={stS.unit}>{unit}</Text>}
      </View>
    </View>
  );
}

// Compact stat for mobile grid — tighter type sizes, labels on top
function StatCompact({
  label, value, unit, tone = 'default',
}: { label: string; value: string; unit?: string; tone?: 'default' | 'ok' | 'warn' | 'danger' }) {
  const toneColor = tone === 'ok' ? '#059669' : tone === 'warn' ? '#D97706' : tone === 'danger' ? '#DC2626' : '#0F172A';
  return (
    <View style={stS.statCompact}>
      <Text style={stS.labelCompact} numberOfLines={1}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={[stS.valueCompact, { color: toneColor }]} numberOfLines={1}>{value}</Text>
        {unit && <Text style={stS.unitCompact}>{unit}</Text>}
      </View>
    </View>
  );
}

function Divider() {
  return <View style={stS.divider} />;
}

function DistanceHistogram({ stats }: { stats: OcclusionStatistics }) {
  // Fake gaussian histogram around avgDistance
  const buckets = 18;
  const bars = useMemo(() => {
    const out: { d: number; h: number; neg: boolean }[] = [];
    const sigma = Math.max(0.01, (stats.maxDistance - stats.minDistance) / 6);
    for (let i = 0; i < buckets; i++) {
      const t = i / (buckets - 1);
      const d = stats.minDistance + (stats.maxDistance - stats.minDistance) * t;
      const h = Math.exp(-Math.pow(d - stats.avgDistance, 2) / (2 * sigma * sigma));
      out.push({ d, h, neg: d < 0 });
    }
    return out;
  }, [stats]);

  const maxH = Math.max(...bars.map((b) => b.h), 0.0001);

  return (
    <View>
      <View style={stS.histo}>
        {bars.map((b, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: `${Math.max(6, (b.h / maxH) * 100)}%`,
              backgroundColor: b.neg ? '#DC2626' : '#94A3B8',
              opacity: b.neg ? 0.85 : 0.5,
              borderTopLeftRadius: 2, borderTopRightRadius: 2,
              marginHorizontal: 1,
            }}
          />
        ))}
      </View>
      <View style={stS.histoTicks}>
        <Text style={stS.histoTick}>{stats.minDistance.toFixed(1)} mm</Text>
        <Text style={stS.histoTick}>{stats.avgDistance.toFixed(2)} mm ort.</Text>
        <Text style={stS.histoTick}>{stats.maxDistance.toFixed(1)} mm</Text>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16, right: 16, bottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#000', shadowOpacity: 0.06,
    shadowRadius: 12, shadowOffset: { width: 0, height: -2 },
  },
  containerExpanded: {
    maxHeight: 420,
  },
  containerMobile: {
    left: 12, right: 12, bottom: 12,
    borderRadius: 14,
  },
  containerMobileExpanded: {
    maxHeight: 340,
  },
  summary: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  summaryMobileWrap: {
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10,
  },
  summaryMobileHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryMobileTitle: {
    fontSize: 11, fontWeight: '800', color: '#94A3B8',
    letterSpacing: 0.6, textTransform: 'uppercase',
  },
  summaryMobileGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    rowGap: 10, columnGap: 10,
  },
  gridCell: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  gridCellFull: {
    width: '100%',
  },
  toggle: {
    marginLeft: 'auto',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 6,
  },
  toggleText: { fontSize: 11, fontWeight: '600', color: '#64748B' },

  body: { paddingHorizontal: 16, paddingTop: 8 },

  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: '#64748B',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10,
  },

  distRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, paddingVertical: 4,
  },
  distLabel: { fontSize: 12, color: '#0F172A', fontWeight: '500' },
  sevDot: { width: 8, height: 8, borderRadius: 4 },
  distBar: {
    flex: 1, height: 6, backgroundColor: '#F1F5F9',
    borderRadius: 3, overflow: 'hidden',
  },
  distBarFill: { height: '100%', borderRadius: 3 },
  distCount: {
    minWidth: 20, textAlign: 'right',
    fontSize: 11, fontWeight: '700', color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },

  clinicalText: {
    fontSize: 12, color: '#64748B', lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row', gap: 8, marginTop: 12,
  },
  btnGhost: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8,
  },
  btnGhostText: { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  btnPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 8, backgroundColor: '#0F172A',
  },
  btnPrimaryText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
});

const stS = StyleSheet.create({
  stat: { alignItems: 'flex-start', gap: 2 },
  label: {
    fontSize: 9, fontWeight: '700', color: '#94A3B8',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  value: {
    fontSize: 20, fontWeight: '800', color: '#0F172A',
    letterSpacing: -0.5, fontVariant: ['tabular-nums'],
  },
  unit: { fontSize: 11, fontWeight: '600', color: '#94A3B8', marginLeft: 2 },
  divider: { width: 1, height: 24, backgroundColor: '#F1F5F9' },

  // Compact variants for mobile grid
  statCompact: { alignItems: 'flex-start', gap: 2 },
  labelCompact: {
    fontSize: 9, fontWeight: '700', color: '#94A3B8',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  valueCompact: {
    fontSize: 16, fontWeight: '800', color: '#0F172A',
    letterSpacing: -0.3, fontVariant: ['tabular-nums'],
  },
  unitCompact: { fontSize: 10, fontWeight: '600', color: '#94A3B8', marginLeft: 2 },

  histo: {
    flexDirection: 'row', alignItems: 'flex-end',
    height: 56, paddingVertical: 4,
  },
  histoTicks: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 4,
  },
  histoTick: {
    fontSize: 9, color: '#94A3B8',
    fontVariant: ['tabular-nums'],
  },
});
