// modules/occlusion/components/ModePanel.tsx
// Sağdaki bağlamsal kontrol paneli — mode'a göre değişir
// Prototip: app/app.jsx ModePanel

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Platform, TextInput,
} from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { HeatmapLegend } from './HeatmapLegend';
import type {
  Mode, HeatmapConfig, PaletteName, Severity,
  PenetrationPoint, MeasurementLine, MeasurementPoint,
} from '../types/occlusion';

// ─── Web slider helper ───────────────────────────────────────
// React Native'de native slider için @react-native-community/slider kullanılır
// Ancak web'de HTML input[type=range] daha iyi. Platform check ile her ikisi.
interface SliderProps {
  value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}
function Slider({ value, min, max, step, onChange }: SliderProps) {
  if (Platform.OS === 'web') {
    return (
      // @ts-ignore
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e: any) => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%',
          accentColor: '#0F172A',
        } as any}
      />
    );
  }
  // Native fallback — text input
  return (
    <TextInput
      value={String(value)}
      onChangeText={(t) => {
        const n = parseFloat(t);
        if (!isNaN(n) && n >= min && n <= max) onChange(n);
      }}
      keyboardType="numeric"
      style={s.numInput}
    />
  );
}

// ─── Props ────────────────────────────────────────────────────
interface Props {
  mode: Mode;

  // View controls
  upperOpacity:    number;
  setUpperOpacity: (v: number) => void;

  // Heatmap
  heatmapConfig:   HeatmapConfig;
  setPalette:      (p: PaletteName) => void;
  setMaxDistance:  (v: number) => void;

  // Penetration
  penetrationPoints: PenetrationPoint[];
  severityFilter:    Record<Severity, boolean>;
  setSeverityFilter: (f: Record<Severity, boolean>) => void;
  activePen:         PenetrationPoint | null;
  setActivePen:      (p: PenetrationPoint | null) => void;

  // Measurement
  measurements:      MeasurementLine[];
  pendingPoint:      MeasurementPoint | null;
  removeMeasurement: (id: string) => void;
  clearMeasurements: () => void;
  resetPending:      () => void;

  // Mobile
  isMobile?: boolean;
  onClose?:  () => void;
}

export function ModePanel(p: Props) {
  const titles: Record<Mode, { t: string; b: string }> = {
    view:        { t: 'Görünüm Kontrolleri', b: 'VIEW' },
    heatmap:     { t: 'Isı Haritası',        b: 'HEATMAP' },
    penetration: { t: 'Penetrasyon Tespiti', b: 'PEN' },
    measurement: { t: 'Ölçüm Aracı',         b: 'MEAS' },
  };
  const h = titles[p.mode];

  return (
    <View style={[s.panel, p.isMobile && s.panelMobile]}>
      <View style={s.header}>
        <Text style={s.title}>{h.t}</Text>
        <View style={s.badge}><Text style={s.badgeText}>{h.b}</Text></View>
        {p.isMobile && p.onClose && (
          <TouchableOpacity onPress={p.onClose} style={s.closeBtn} hitSlop={8}>
            <Feather name="x" size={16} color="#64748B" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 16 }}>
        {p.mode === 'view'        && <ViewControls {...p} />}
        {p.mode === 'heatmap'     && <HeatmapControls {...p} />}
        {p.mode === 'penetration' && <PenetrationControls {...p} />}
        {p.mode === 'measurement' && <MeasurementControls {...p} />}
      </ScrollView>
    </View>
  );
}

// ─── View mode ─────────────────────────────────────────────
function ViewControls({ upperOpacity, setUpperOpacity }: Props) {
  return (
    <View>
      <View style={s.field}>
        <View style={s.fieldLabel}>
          <Text style={s.fieldName}>Üst Çene Opaklığı</Text>
          <Text style={s.fieldVal}>{Math.round(upperOpacity * 100)}%</Text>
        </View>
        <Slider value={upperOpacity} min={0} max={1} step={0.05} onChange={setUpperOpacity} />
      </View>
      <Text style={s.hint}>
        Üst çeneyi yarı saydam yaparak iç yapıyı ve kontakt bölgelerini inceleyebilirsiniz.
      </Text>
      <View style={s.kbdRow}>
        <Text style={s.kbd}>Sol Tık</Text><Text style={s.kbdLbl}>döndür</Text>
        <Text style={s.kbd}>Sağ Tık</Text><Text style={s.kbdLbl}>kaydır</Text>
        <Text style={s.kbd}>Tekerlek</Text><Text style={s.kbdLbl}>zoom</Text>
      </View>
    </View>
  );
}

// ─── Heatmap mode ──────────────────────────────────────────
function HeatmapControls({ heatmapConfig, setMaxDistance, setPalette }: Props) {
  return (
    <View>
      <View style={s.field}>
        <View style={s.fieldLabel}>
          <Text style={s.fieldName}>Maksimum Mesafe</Text>
          <Text style={s.fieldVal}>{heatmapConfig.maxDistance.toFixed(1)} mm</Text>
        </View>
        <Slider value={heatmapConfig.maxDistance} min={0.5} max={5} step={0.1} onChange={setMaxDistance} />
      </View>

      <Text style={[s.fieldName, { marginTop: 16, marginBottom: 8 }]}>Palette</Text>
      <View style={s.segments}>
        {(['medical', 'thermal', 'colorblind'] as const).map((pal) => {
          const active = heatmapConfig.palette === pal;
          return (
            <TouchableOpacity
              key={pal}
              style={[s.segment, active && s.segmentActive]}
              onPress={() => setPalette(pal)}
            >
              <Text style={[s.segmentText, active && s.segmentTextActive]}>
                {pal === 'medical' ? 'Medikal' : pal === 'thermal' ? 'Termal' : 'Viridis'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[s.fieldName, { marginTop: 16, marginBottom: 8 }]}>Renk Skalası</Text>
      <HeatmapLegend config={heatmapConfig} />

      <Text style={[s.hint, { marginTop: 14 }]}>
        Alt çene yüzeyindeki renkler üst çeneye olan dikey mesafeyi gösterir. Kırmızı bölgeler erken kontakt (penetrasyon), yeşil ideal oklüzyon, mavi boşluktur.
      </Text>
    </View>
  );
}

// ─── Penetration mode ──────────────────────────────────────
function PenetrationControls({
  penetrationPoints, severityFilter, setSeverityFilter,
  activePen, setActivePen,
}: Props) {
  const sevCounts: Record<Severity, number> = { low: 0, medium: 0, high: 0 };
  for (const pt of penetrationPoints) sevCounts[pt.severity]++;

  const filtered = penetrationPoints.filter((pt) => severityFilter[pt.severity]);
  const sevLabels: Record<Severity, string> = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };
  const sevColors: Record<Severity, string> = { low: '#059669', medium: '#D97706', high: '#DC2626' };

  return (
    <View>
      <Text style={s.fieldName}>Şiddet Filtresi</Text>
      {(['high', 'medium', 'low'] as Severity[]).map((sev) => (
        <TouchableOpacity
          key={sev}
          style={s.checkRow}
          onPress={() => setSeverityFilter({ ...severityFilter, [sev]: !severityFilter[sev] })}
        >
          <View style={[
            s.checkbox,
            severityFilter[sev] && { backgroundColor: '#0F172A', borderColor: '#0F172A' },
          ]}>
            {severityFilter[sev] && (
              <Feather name="check" size={12} color="#FFFFFF" />
            )}
          </View>
          <View style={[s.sevDot, { backgroundColor: sevColors[sev] }]} />
          <Text style={s.sevLabel}>{sevLabels[sev]}</Text>
          <Text style={s.sevCount}>{sevCounts[sev]}</Text>
        </TouchableOpacity>
      ))}

      <View style={[s.fieldLabel, { marginTop: 16, marginBottom: 8 }]}>
        <Text style={s.fieldName}>Tespit Edilen Noktalar</Text>
        <Text style={s.fieldVal}>{filtered.length}</Text>
      </View>

      {filtered.length === 0 ? (
        <Text style={s.hint}>Seçilen şiddet düzeyinde nokta bulunamadı.</Text>
      ) : (
        filtered.map((pt, i) => (
          <TouchableOpacity
            key={pt.id}
            style={[s.penItem, activePen?.id === pt.id && s.penItemActive]}
            onPress={() => setActivePen(pt)}
          >
            <View style={[s.penPin, { backgroundColor: sevColors[pt.severity] }]}>
              <Text style={s.penPinText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.penTitle}>Nokta {pt.id}</Text>
              <Text style={s.penMeta}>↓ {pt.depth.toFixed(2)} mm · {pt.area.toFixed(1)} mm²</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

// ─── Measurement mode ──────────────────────────────────────
function MeasurementControls({
  measurements, pendingPoint, removeMeasurement, clearMeasurements, resetPending,
}: Props) {
  return (
    <View>
      <Text style={s.hint}>
        {pendingPoint
          ? 'İkinci noktayı seçin. İki nokta arası mesafe otomatik hesaplanır.'
          : 'Mesafe ölçmek için 3D model üzerinde iki noktaya sırayla tıklayın.'}
      </Text>

      {pendingPoint && (
        <TouchableOpacity style={s.btn} onPress={resetPending}>
          <Feather name="x" size={14} color="#0F172A" />
          <Text style={s.btnText}>Seçimi İptal Et</Text>
        </TouchableOpacity>
      )}

      <View style={[s.fieldLabel, { marginTop: 16, marginBottom: 8 }]}>
        <Text style={s.fieldName}>Ölçümler</Text>
        <Text style={s.fieldVal}>{measurements.length}</Text>
      </View>

      {measurements.length === 0 ? (
        <Text style={s.hint}>Henüz ölçüm yapılmadı.</Text>
      ) : (
        measurements.map((m, i) => (
          <View key={m.id} style={s.measureItem}>
            <View style={s.measureIdx}><Text style={s.measureIdxText}>{i + 1}</Text></View>
            <Text style={s.measureDist}>{m.distance.toFixed(2)} mm</Text>
            <TouchableOpacity onPress={() => removeMeasurement(m.id)} style={s.measureDel}>
              <Feather name="trash-2" size={14} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        ))
      )}

      {measurements.length > 0 && (
        <TouchableOpacity style={[s.btn, { marginTop: 10 }]} onPress={clearMeasurements}>
          <Text style={s.btnText}>Tümünü Sil</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────
const s = StyleSheet.create({
  panel: {
    position:        'absolute',
    top:             16,
    right:           16,
    width:           280,
    maxHeight:       '80%',
    backgroundColor: '#FFFFFF',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#F1F5F9',
    shadowColor:     '#000',
    shadowOpacity:   0.06,
    shadowRadius:    12,
    shadowOffset:    { width: 0, height: 4 },
    elevation:       3,
    overflow:        'hidden',
  },
  panelMobile: {
    top:             undefined,
    right:           12,
    left:            12,
    bottom:          108,
    width:           undefined,
    maxHeight:       '55%',
    zIndex:          20,
  },
  closeBtn: {
    marginLeft:      8,
    width:           24, height: 24, borderRadius: 12,
    alignItems:      'center', justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 14,
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title:    { fontSize: 13, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },
  badge:    {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, backgroundColor: '#F1F5F9',
  },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#64748B', letterSpacing: 0.5 },
  body:     { paddingHorizontal: 14, paddingVertical: 12 },

  field:      { marginBottom: 12 },
  fieldLabel: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  fieldName:  { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 0.4 },
  fieldVal:   { fontSize: 11, fontWeight: '700', color: '#0F172A', fontVariant: ['tabular-nums'] },

  numInput:   {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 12, color: '#0F172A',
  },

  hint: {
    fontSize: 11, color: '#64748B', lineHeight: 16,
  },

  kbdRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 4,
    alignItems: 'center', marginTop: 10,
  },
  kbd: {
    fontSize: 9, fontWeight: '700', color: '#0F172A',
    backgroundColor: '#F1F5F9', paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 3, letterSpacing: 0.3,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  kbdLbl: { fontSize: 10, color: '#94A3B8', marginRight: 6 },

  segments: { flexDirection: 'row', gap: 4, backgroundColor: '#F1F5F9', borderRadius: 8, padding: 2 },
  segment: { flex: 1, paddingVertical: 6, borderRadius: 6, alignItems: 'center' },
  segmentActive: { backgroundColor: '#FFFFFF' },
  segmentText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  segmentTextActive: { color: '#0F172A' },

  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6,
  },
  checkbox: {
    width: 16, height: 16, borderRadius: 4,
    borderWidth: 1.5, borderColor: '#CBD5E1',
    alignItems: 'center', justifyContent: 'center',
  },
  sevDot:   { width: 8, height: 8, borderRadius: 4 },
  sevLabel: { flex: 1, fontSize: 12, color: '#0F172A', fontWeight: '500' },
  sevCount: {
    fontSize: 10, fontWeight: '700', color: '#64748B',
    backgroundColor: '#F8FAFC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10,
  },

  penItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 8,
    borderRadius: 8, marginBottom: 4,
  },
  penItemActive: { backgroundColor: '#EEF2FF' },
  penPin: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  penPinText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  penTitle:   { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  penMeta:    { fontSize: 10, color: '#64748B', fontVariant: ['tabular-nums'], marginTop: 2 },

  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8,
    marginTop: 8,
  },
  btnText: { fontSize: 12, fontWeight: '600', color: '#0F172A' },

  measureItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingHorizontal: 8,
    borderRadius: 6,
  },
  measureIdx: {
    width: 20, height: 20, borderRadius: 4,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  measureIdxText: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  measureDist: {
    flex: 1, fontSize: 12, fontWeight: '700', color: '#0F172A',
    fontVariant: ['tabular-nums'],
  },
  measureDel: { padding: 4 },
});
