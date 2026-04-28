// modules/orders/components/OrderTicketCard.tsx
// Boarding-pass tarzı iş emri kartı — tam iş fişi.
// İyileştirmeler v2: tutarlı padding, kompakt meta, temiz hiyerarşi,
// responsive tooth chart, CSS-dashed ayraç, boş alanlar gizli.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Platform, Image, useWindowDimensions } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ToothNumberPicker } from './ToothNumberPicker';
import { AppIcon } from '../../../core/ui/AppIcon';
import { F } from '../../../core/theme/typography';
import type { WorkOrder } from '../types';

export interface TicketDockItem {
  iconName: string;          // AppIcon ismi (lucide tabanlı)
  label:    string;
  onPress?: () => void;
}

interface Props {
  order:         WorkOrder;
  qrUrl:         string;
  pageBg?:       string;
  accentColor?:  string;
  qrSize?:       number;        // QR kod doğal boyutu (default: 72)
  onPrint?:      () => void;
  dockItems?:    TicketDockItem[];   // Header sağındaki dock menü
  activeTooth?:  number | null;
  onToothPress?: (fdi: number) => void;
}

const TICKET_PAD       = 16;        // tutarlı padding her bölüm için
const NOTCH_SIZE       = 22;
const QR_NATURAL_SIZE  = 96;        // QR'ın doğal render boyutu — sonra scale ile fit edilir

export function OrderTicketCard({
  order,
  qrUrl,
  pageBg       = '#F9F9FB',
  accentColor  = '#2563EB',
  qrSize       = 72,
  onPrint,
  dockItems,
  activeTooth,
  onToothPress,
}: Props) {
  const { width } = useWindowDimensions();

  // Satırın ölçülen genişliği — chart'ı sınırlamak için (feedback loop önler)
  const [rowW, setRowW] = React.useState<number | null>(null);

  // Chart aspect: SVG viewBox 3720 (W) × 4200 (H) → height/width ≈ 1.129
  // Chart kartı satırın en fazla %42'sini kaplasın; sağ karta yeterli alan kalsın.
  const toothPickerW = useMemo(() => {
    if (!rowW || rowW <= 0) {
      return Math.min(Math.max(Math.round((width - 320) * 0.36), 220), 340);
    }
    return Math.max(200, Math.min(Math.round(rowW * 0.36), 400));
  }, [width, rowW]);

  const sortedTeeth = [...(order.tooth_numbers ?? [])].sort((a, b) => a - b);

  // Sağ panelde gösterilecek "seçili" diş (chart tıklamayla değişir; default=ilk diş)
  const [detailTooth, setDetailTooth] = React.useState<number | null>(null);
  const effectiveDetailTooth = detailTooth ?? sortedTeeth[0] ?? null;
  const handleChartToothPress = (fdi: number) => {
    setDetailTooth(prev => prev === fdi ? null : fdi);
  };

  // İşlem-bazlı renk haritası (NewOrder ile aynı palet) — diş şemasında
  // farklı işlemleri farklı renklerle göstermek için.
  const OP_COLOR_PALETTE = ['#2563EB','#059669','#D97706','#7C3AED','#DC2626','#0891B2','#DB2777','#65A30D'];
  const toothColorMap = useMemo<Record<number, string>>(() => {
    const teethRaw = order.tooth_numbers ?? [];
    const wtParts = (order.work_type ?? '').split(/,\s*/).map(s => s.trim()).filter(Boolean);
    const perTooth = new Map<number, string>();
    if (wtParts.length === teethRaw.length) {
      teethRaw.forEach((t, i) => perTooth.set(t, wtParts[i]));
    } else {
      teethRaw.forEach(t => perTooth.set(t, (order.work_type ?? '').trim() || '__none__'));
    }
    const wtColor: Record<string, string> = {};
    let idx = 0;
    const map: Record<number, string> = {};
    teethRaw.forEach(t => {
      const key = perTooth.get(t) || '__none__';
      if (!wtColor[key]) {
        wtColor[key] = OP_COLOR_PALETTE[idx % OP_COLOR_PALETTE.length];
        idx++;
      }
      map[t] = wtColor[key];
    });
    return map;
  }, [order.tooth_numbers, order.work_type]);

  const createdDate = new Date(order.created_at).toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const deliveryDate = order.delivery_date
    ? new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    : '—';

  const teethStr = sortedTeeth.length > 0
    ? `${sortedTeeth.join(', ')}  ·  ${sortedTeeth.length} diş`
    : '—';

  const machineLabel =
    (order as any).machine_type === 'milling'   ? 'Frezeleme' :
    (order as any).machine_type === '3d_print'  ? '3D Baskı'  :
    null;
  const measurementLabel =
    (order as any).measurement_type === 'digital' ? 'Dijital' :
    (order as any).measurement_type === 'manual'  ? 'Manuel'  :
    null;

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'stretch', gap: 12 }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setRowW(prev => (prev && Math.abs(prev - w) < 1 ? prev : w));
      }}
    >

      {/* ─────────── DİŞ ŞEMASI — kendi kartı (sol) ─────────── */}
      <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }}>
          <ToothNumberPicker
            selected={order.tooth_numbers ?? []}
            onChange={() => {}}
            containerWidth={toothPickerW}
            hideEmptyJaw
            accentColor={accentColor}
            colorMap={toothColorMap}
            activeTooth={effectiveDetailTooth ?? activeTooth}
            onToothPress={handleChartToothPress}
          />
        </View>
      </View>

      {/* ─────────── DETAYLAR KARTI — header + meta + notlar (sağ) ─────────── */}
      <View style={[s.card, { flex: 1, minWidth: 0 }]}>

        {/* ─────────── HEADER STRIP — sadece ACİL rozeti + dock ─────────── */}
        {(order.is_urgent || (dockItems && dockItems.length > 0)) && (
          <View style={s.headerBar}>
            <View style={s.headerRight}>
              {order.is_urgent && (
                <View style={s.urgentBadge}>
                  <Text style={s.urgentText}>⚡ ACİL</Text>
                </View>
              )}
              {dockItems && dockItems.length > 0 && (
                <TicketDock items={dockItems} accentColor={accentColor} />
              )}
            </View>
          </View>
        )}

        {/* ─────────── META: işlem listesi + QR ─────────── */}
        <View style={s.topSection}>
          {width >= 768 ? (
            // Geniş ekran: QR + açıklama SOLDA, operasyon listesi SAĞDA (daha dar)
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16, flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, maxWidth: 260 }}>
                <View style={[s.qrBlock, { width: qrSize, height: qrSize }]}>
                  <QRCode
                    value={qrUrl}
                    size={qrSize}
                    color="#0F172A"
                    backgroundColor="#FFFFFF"
                    ecl="M"
                  />
                </View>
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <Text style={s.metaQrLabel}>QR İLE AÇ</Text>
                  <Text style={s.metaQrHint} numberOfLines={3}>
                    Kameranızla okutarak iş emrini görüntüleyin.
                  </Text>
                </View>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <ToothOperationsList
                  order={order}
                  accentColor={accentColor}
                  colorMap={toothColorMap}
                  machineLabel={machineLabel}
                  measurementLabel={measurementLabel}
                />
              </View>
            </View>
          ) : (
            // Küçük ekran: önceki düzen (operasyon listesi üstte, QR altta)
            <View style={s.metaCol}>
              <ToothOperationsList
                order={order}
                accentColor={accentColor}
                colorMap={toothColorMap}
                machineLabel={machineLabel}
                measurementLabel={measurementLabel}
              />
              <View style={s.metaQrRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.metaQrLabel}>QR İLE AÇ</Text>
                  <Text style={s.metaQrHint} numberOfLines={2}>
                    Kameranızla okutarak iş emrini görüntüleyin.
                  </Text>
                </View>
                <View style={[s.qrBlock, { width: qrSize, height: qrSize }]}>
                  <QRCode
                    value={qrUrl}
                    size={qrSize}
                    color="#0F172A"
                    backgroundColor="#FFFFFF"
                    ecl="M"
                  />
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ─────────── NOTLAR (varsa) ─────────── */}
        {order.notes ? (
          <View style={s.notesSection}>
            <View style={s.notesIconWrap}>
              <AppIcon name={'message-square' as any} size={12} color="#94A3B8" />
            </View>
            <Text style={s.notesText} numberOfLines={3}>{order.notes}</Text>
          </View>
        ) : null}

      </View>
    </View>
  );
}

// ── Tooth Operations List — aynı işleme sahip dişleri tek satırda gruplar ──
interface ToothOperationsListProps {
  order:            WorkOrder;
  accentColor:      string;
  colorMap?:        Record<number, string>;
  machineLabel:     string | null;
  measurementLabel: string | null;
}
function ToothOperationsList({ order, accentColor, colorMap, machineLabel, measurementLabel }: ToothOperationsListProps) {
  const { width: screenW } = useWindowDimensions();
  const allowWrap = screenW < 768;
  // tooth_numbers DB'de form sırasıyla saklanmış (NewOrder handleSubmit: ops.map → tooth)
  // work_type ise virgülle birleştirilmiş — i-th tooth ↔ i-th work_type
  const teethRaw = order.tooth_numbers ?? [];
  const ops = (order as any).tooth_ops as Array<{
    tooth: number; work_type?: string; shade?: string; notes?: string;
  }> | undefined;

  const groups = useMemo(() => {
    // Diş başına work_type haritası oluştur
    const perTooth = new Map<number, string>();

    // Önce in-memory tooth_ops varsa onları kullan
    if (ops && ops.length > 0) {
      ops.forEach(o => {
        if (o.tooth != null && o.work_type) perTooth.set(o.tooth, o.work_type.trim());
      });
    }

    // Eksik kalanları order.work_type'tan parse et (virgül-eşleştirme)
    const wtParts = (order.work_type ?? '').split(/,\s*/).map(s => s.trim()).filter(Boolean);
    if (wtParts.length === teethRaw.length) {
      teethRaw.forEach((t, i) => {
        if (!perTooth.has(t)) perTooth.set(t, wtParts[i]);
      });
    } else {
      // Length uyumsuz: tek bir genel work_type kullan
      teethRaw.forEach(t => {
        if (!perTooth.has(t)) perTooth.set(t, (order.work_type ?? '—').trim());
      });
    }

    // Diş başına shade — şu an order'da tek shade var, hepsine ata
    const shade = (order.shade ?? '').trim() || null;

    // Grupla: work_type + shade
    const map = new Map<string, { workType: string; shade: string | null; teeth: number[] }>();
    teethRaw
      .slice()
      .sort((a, b) => a - b)
      .forEach(t => {
        const wt  = perTooth.get(t) || '—';
        const key = `${wt}::${shade ?? ''}`;
        const existing = map.get(key);
        if (existing) existing.teeth.push(t);
        else map.set(key, { workType: wt, shade, teeth: [t] });
      });

    return Array.from(map.values());
  }, [teethRaw, ops, order.work_type, order.shade]);

  const teeth = teethRaw;

  if (teeth.length === 0) {
    return (
      <View style={td.placeholder}>
        <View style={[td.phIcon, { backgroundColor: accentColor + '14' }]}>
          <AppIcon name={'__tooth__' as any} size={26} color={accentColor} />
        </View>
        <Text style={td.phTitle}>Diş seçilmemiş</Text>
      </View>
    );
  }

  return (
    <View style={ol.list}>
      <View style={ol.groupsCard}>
        {groups.map((g, i) => {
          const groupColor = (colorMap && g.teeth[0] != null && colorMap[g.teeth[0]]) || accentColor;
          return (
            <View
              key={i}
              style={[
                ol.groupRow,
                i < groups.length - 1 && ol.groupRowDivider,
              ]}
            >
              {/* Sol: renk şeridi */}
              <View style={[ol.colorBar, { backgroundColor: groupColor }]} />

              {/* Orta: diş chip'leri + iş tipi (tek satır; küçük ekranda wrap) */}
              <View style={[ol.groupBody, { flexWrap: allowWrap ? 'wrap' : 'nowrap' }]}>
                <View style={ol.toothPillRow}>
                  {g.teeth.map(t => (
                    <View
                      key={t}
                      style={[
                        ol.toothPill,
                        { backgroundColor: groupColor + '14', borderColor: groupColor + '40' },
                      ]}
                    >
                      <Text style={[ol.toothPillText, { color: groupColor }]}>{t}</Text>
                    </View>
                  ))}
                </View>
                <Text style={ol.workType} numberOfLines={2}>{g.workType}</Text>
                <Text style={[ol.countText, { color: groupColor }]}>
                  {g.teeth.length}
                  <Text style={ol.countSuffix}> diş</Text>
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Ortak (order-level) chip'ler — bir kez gösterilir */}
      {(groups.some(g => g.shade) || machineLabel || measurementLabel) && (
        <View style={ol.sharedChipRow}>
          {groups[0]?.shade && (
            <View style={[ol.chip, { backgroundColor: accentColor + '12', borderColor: accentColor + '40' }]}>
              <View style={[ol.chipDot, { backgroundColor: accentColor }]} />
              <Text style={[ol.chipText, { color: accentColor }]}>{groups[0].shade}</Text>
            </View>
          )}
          {machineLabel && (
            <View style={ol.chip}>
              <AppIcon name={'settings' as any} size={11} color="#475569" />
              <Text style={ol.chipText}>{machineLabel}</Text>
            </View>
          )}
          {measurementLabel && (
            <View style={ol.chip}>
              <AppIcon name={'ruler' as any} size={11} color="#475569" />
              <Text style={ol.chipText}>{measurementLabel}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const ol = StyleSheet.create({
  list: { width: '100%', gap: 10 },

  // Tek bir kart — gruplar içinde divider ile ayrılır
  groupsCard: {
    width:           '100%',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#E5E9F0',
    backgroundColor: '#FFFFFF',
    overflow:        'hidden',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems:    'stretch',
  },
  groupRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  colorBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  groupBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical:   10,
    flexDirection:     'row',
    alignItems:        'center',
    flexWrap:          'wrap',
    gap:               10,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems:    'baseline',
    justifyContent:'space-between',
    gap:           10,
  },
  workType: {
    flexShrink:    1,
    fontSize:      13.5,
    fontWeight:    '800',
    fontFamily:    F.bold,
    color:         '#0F172A',
    letterSpacing: -0.2,
    lineHeight:    17,
  },
  countText: {
    fontSize:      13,
    fontWeight:    '800',
    fontFamily:    F.bold,
    letterSpacing: -0.2,
    marginLeft:    'auto',
  },
  countSuffix: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  // Diş chip'leri — gruba özel renkli, küçük rounded
  toothPillRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           4,
  },
  toothPill: {
    minWidth:        28,
    paddingHorizontal: 7,
    paddingVertical:   2,
    borderRadius:    6,
    borderWidth:     1,
    alignItems:      'center',
    justifyContent:  'center',
  },
  toothPillText: {
    fontSize:      11,
    fontWeight:    '800',
    fontFamily:    F.bold,
    letterSpacing: -0.1,
  },

  // Order-level ortak chip'ler (shade/makine/ölçüm) — kartın altında
  sharedChipRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           6,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8,
    paddingVertical:   4,
    borderRadius:      7,
    backgroundColor:   '#F1F5F9',
    borderWidth:       1,
    borderColor:       '#E5E9F0',
  },
  chipDot:  { width: 7, height: 7, borderRadius: 3.5 },
  chipText: { fontSize: 11, fontWeight: '700', fontFamily: F.bold, color: '#475569', letterSpacing: -0.1 },
});

// ── Tooth Detail Panel — şemada tıklanan dişin büyük detay kartı ────────────
interface ToothDetailPanelProps {
  order:            WorkOrder;
  accentColor:      string;
  toothNo:          number | null;
  machineLabel:     string | null;
  measurementLabel: string | null;
}
function ToothDetailPanel({ order, accentColor, toothNo, machineLabel, measurementLabel }: ToothDetailPanelProps) {
  if (!toothNo) {
    return (
      <View style={td.placeholder}>
        <View style={[td.phIcon, { backgroundColor: accentColor + '14' }]}>
          <AppIcon name={'__tooth__' as any} size={26} color={accentColor} />
        </View>
        <Text style={td.phTitle}>Bir diş seçin</Text>
        <Text style={td.phSub}>Şemadan bir dişe tıklayarak detayını görüntüleyin.</Text>
      </View>
    );
  }

  const ops      = (order as any).tooth_ops as Array<{ tooth: number; work_type?: string; shade?: string; notes?: string }> | undefined;
  const op       = ops?.find(o => o.tooth === toothNo);
  const workType = op?.work_type || order.work_type || '—';
  const shade    = op?.shade || order.shade || null;
  const note     = op?.notes || null;
  const photo    = (order.photos ?? []).find(p => p.tooth_number === toothNo && !!p.signed_url);

  return (
    <View
      // @ts-ignore — soft fade-in on key change (web)
      style={[td.card, { borderColor: accentColor + '33' }, Platform.OS === 'web' ? ({ animationName: 'tooth-detail-fade-in', animationDuration: '180ms', animationTimingFunction: 'ease-out' } as any) : null]}
    >
      {/* SOL: flat accent stripe + diş numarası */}
      <View style={[td.numCol, { backgroundColor: accentColor }]}>
        <Text style={td.numText}>{toothNo}</Text>
      </View>

      {/* SAĞ: tipografik içerik */}
      <View style={td.body}>
        <View style={td.bodyTopRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={td.label}>İŞ TİPİ</Text>
            <Text style={td.workType} numberOfLines={2}>{workType}</Text>
          </View>
          <Text style={[td.fdiTag, { color: accentColor }]}>FDI #{toothNo}</Text>
        </View>

        <View style={td.chipRow}>
          {shade && (
            <View style={[td.chip, { backgroundColor: accentColor + '12', borderColor: accentColor + '40' }]}>
              <View style={[td.chipDot, { backgroundColor: accentColor }]} />
              <Text style={[td.chipText, { color: accentColor }]}>{shade}</Text>
            </View>
          )}
          {machineLabel && (
            <View style={td.chip}>
              <AppIcon name={'settings' as any} size={11} color="#475569" />
              <Text style={td.chipText}>{machineLabel}</Text>
            </View>
          )}
          {measurementLabel && (
            <View style={td.chip}>
              <AppIcon name={'ruler' as any} size={11} color="#475569" />
              <Text style={td.chipText}>{measurementLabel}</Text>
            </View>
          )}
        </View>

        {note ? (
          <Text style={td.note} numberOfLines={3}>“{note}”</Text>
        ) : null}
      </View>
    </View>
  );
}

const td = StyleSheet.create({
  card: {
    width:           '100%',
    borderRadius:    10,
    backgroundColor: '#FFFFFF',
    borderWidth:     1,
    overflow:        'hidden',
    flexDirection:   'row',
    alignItems:      'stretch',
    // flat 2D — gölge yok
  },
  numCol: {
    width:           72,
    alignItems:      'center',
    justifyContent:  'center',
    paddingVertical: 18,
  },
  numText: {
    fontSize:      28,
    fontWeight:    '900',
    fontFamily:    F.bold,
    color:         '#FFFFFF',
    letterSpacing: -0.8,
  },
  bodyTopRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           10,
  },
  fdiTag: {
    fontSize:      10,
    fontWeight:    '800',
    fontFamily:    F.bold,
    letterSpacing: 0.8,
    marginTop:     2,
  },
  placeholder: {
    width:            '100%',
    minHeight:        180,
    borderRadius:     14,
    borderWidth:      1.5,
    borderStyle:      'dashed',
    borderColor:      '#E2E8F0',
    backgroundColor:  '#F8FAFC',
    alignItems:       'center',
    justifyContent:   'center',
    paddingHorizontal: 18,
    paddingVertical:   24,
    gap:               6,
  },
  phIcon: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  phTitle: {
    fontSize: 13, fontWeight: '800', fontFamily: F.bold,
    color: '#0F172A', letterSpacing: -0.2,
  },
  phSub: {
    fontSize: 11, fontWeight: '500', color: '#94A3B8',
    textAlign: 'center', lineHeight: 15,
  },
  body: { flex: 1, padding: 14, gap: 10, justifyContent: 'center' },
  label: {
    fontSize:      9,
    fontWeight:    '800',
    fontFamily:    F.bold,
    color:         '#94A3B8',
    letterSpacing: 1.2,
    marginBottom:  3,
  },
  workType: {
    fontSize:      14,
    fontWeight:    '800',
    fontFamily:    F.bold,
    color:         '#0F172A',
    letterSpacing: -0.2,
    lineHeight:    18,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8,
    paddingVertical:   3.5,
    borderRadius:      7,
    backgroundColor:   '#F1F5F9',
    borderWidth:       1,
    borderColor:       '#E5E9F0',
  },
  chipDot:  { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 11, fontWeight: '700', fontFamily: F.bold, color: '#475569', letterSpacing: -0.1 },
  note:     { fontSize: 11.5, fontStyle: 'italic', color: '#64748B', lineHeight: 16 },
});

// Soft fade-in keyframes (web only)
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const id = 'tooth-detail-fade-in-keyframes';
  if (!document.getElementById(id)) {
    const styleEl = document.createElement('style');
    styleEl.id = id;
    styleEl.textContent = `
      @keyframes tooth-detail-fade-in {
        from { opacity: 0; transform: translateY(4px) scale(0.985); }
        to   { opacity: 1; transform: translateY(0)   scale(1);     }
      }
    `;
    document.head.appendChild(styleEl);
  }
}

// ── Tooth Mini Grid — her diş için kompakt kart, hover'da büyür ─────────────
interface ToothMiniGridProps {
  order: WorkOrder;
  accentColor: string;
}

function ToothMiniGrid({ order, accentColor }: ToothMiniGridProps) {
  const teeth = useMemo(
    () => [...(order.tooth_numbers ?? [])].sort((a, b) => a - b),
    [order.tooth_numbers],
  );
  const ops = (order as any).tooth_ops as Array<{
    tooth: number; work_type?: string; shade?: string; notes?: string;
  }> | undefined;
  const photos = order.photos ?? [];

  if (teeth.length === 0) {
    return (
      <View style={tg.empty}>
        <AppIcon name={'alert-circle' as any} size={18} color="#94A3B8" />
        <Text style={tg.emptyText}>Diş seçilmemiş</Text>
      </View>
    );
  }

  return (
    <View style={tg.grid}>
      {teeth.map((toothNo) => {
        const op       = ops?.find(o => o.tooth === toothNo);
        const workType = op?.work_type || order.work_type || '—';
        const shade    = op?.shade || order.shade || null;
        const photo    = photos.find(p => p.tooth_number === toothNo && !!p.signed_url);
        return (
          <ToothMiniCard
            key={toothNo}
            toothNo={toothNo}
            workType={workType}
            shade={shade}
            photoUrl={photo?.signed_url ?? null}
            accentColor={accentColor}
          />
        );
      })}
    </View>
  );
}

function ToothMiniCard({
  toothNo, workType, shade, photoUrl, accentColor,
}: {
  toothNo: number;
  workType: string;
  shade: string | null;
  photoUrl: string | null;
  accentColor: string;
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[tg.card, hovered && tg.cardHover, { borderColor: accentColor + '22' }]}
      accessibilityLabel={`Diş ${toothNo}`}
    >
      {/* Top: photo or accent fill */}
      <View style={[tg.thumbWrap, { backgroundColor: accentColor + '0E' }]}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={tg.thumb} resizeMode="cover" />
        ) : (
          <AppIcon name={'__tooth__' as any} size={28} color={accentColor + 'AA'} />
        )}
        {/* Tooth number badge */}
        <View style={[tg.badge, { backgroundColor: accentColor }]}>
          <Text style={tg.badgeText}>{toothNo}</Text>
        </View>
      </View>

      {/* Bottom: work type + shade strip */}
      <View style={tg.body}>
        <Text style={tg.workType} numberOfLines={2}>{workType}</Text>
        {shade && (
          <View style={tg.shadeRow}>
            <View style={[tg.shadeDot, { backgroundColor: accentColor }]} />
            <Text style={tg.shadeText}>{shade}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const tg = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
    alignContent:  'flex-start',
  },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16 },
  emptyText: { fontSize: 13, color: '#94A3B8', fontWeight: '600', fontFamily: F.regular },
  card: {
    width:           104,
    borderRadius:    12,
    backgroundColor: '#FFFFFF',
    borderWidth:     1,
    overflow:        'hidden',
    ...Platform.select({
      web: {
        // @ts-ignore
        boxShadow: '0 2px 6px rgba(15,23,42,0.05)',
        // @ts-ignore — yumuşak hover
        transition: 'transform 200ms cubic-bezier(0.16,1,0.3,1), box-shadow 200ms ease',
        // @ts-ignore
        cursor: 'pointer',
      },
      default: {
        shadowColor:   '#0F172A',
        shadowOpacity: 0.05,
        shadowRadius:  4,
        shadowOffset:  { width: 0, height: 1 },
        elevation:     1,
      },
    }),
  },
  cardHover: {
    ...Platform.select({
      web: {
        // @ts-ignore
        transform: 'translateY(-3px) scale(1.04)',
        // @ts-ignore
        boxShadow: '0 10px 24px rgba(15,23,42,0.14)',
      },
      default: {},
    }),
  },
  thumbWrap: {
    width:           '100%',
    height:          64,
    position:        'relative',
    alignItems:      'center',
    justifyContent:  'center',
  },
  thumb: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top:      6,
    left:     6,
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius: 6,
    ...Platform.select({
      web: {
        // @ts-ignore
        boxShadow: '0 2px 6px rgba(15,23,42,0.20)',
      },
      default: {},
    }),
  },
  badgeText: {
    fontSize:      10.5,
    fontWeight:    '800',
    fontFamily:    F.bold,
    color:         '#FFFFFF',
    letterSpacing: 0.4,
  },
  body: {
    paddingHorizontal: 8,
    paddingVertical:   6,
    gap:               3,
  },
  workType: {
    fontSize:      11,
    fontWeight:    '700',
    fontFamily:    F.bold,
    color:         '#0F172A',
    letterSpacing: -0.1,
    lineHeight:    14,
  },
  shadeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  shadeDot: { width: 8, height: 8, borderRadius: 4 },
  shadeText: {
    fontSize:   10,
    fontWeight: '700',
    fontFamily: F.bold,
    color:      '#475569',
  },
});


// ── Dock menü (header sağı) ─────────────────────────────────────────────────
const DOCK_ICON_DEFAULT = '#475569';
const DOCK_ICON_HOVER   = '#0F172A';

function TicketDock({ items }: { items: TicketDockItem[]; accentColor: string }) {
  return (
    <View style={s.dock}>
      {items.map((it, i) => (
        <DockButton key={`${it.label}-${i}`} item={it} />
      ))}
    </View>
  );
}

function DockButton({ item }: { item: TicketDockItem }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <View style={s.dockBtnWrap}>
      <Pressable
        onPress={item.onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={[s.dockBtn, hovered && s.dockBtnHover]}
        accessibilityLabel={item.label}
      >
        <AppIcon
          name={item.iconName as any}
          size={18}
          color={hovered ? DOCK_ICON_HOVER : DOCK_ICON_DEFAULT}
        />
      </Pressable>
      {hovered && (
        <View style={s.tooltip} pointerEvents="none">
          <Text style={s.tooltipText}>{item.label}</Text>
          <View style={s.tooltipArrow} />
        </View>
      )}
    </View>
  );
}

// ── Atomic meta field ────────────────────────────────────────────────────────
function MetaField({
  label, value, primary, multiline, valueStyle,
}: {
  label:      string;
  value:      string;
  primary?:   boolean;
  multiline?: boolean;
  valueStyle?: any;
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.metaSmall}>{label}</Text>
      <Text
        style={[
          primary ? s.metaPatient : s.metaValue,
          valueStyle,
        ]}
        numberOfLines={multiline ? 2 : 1}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Bottom detail field ──────────────────────────────────────────────────────
function DetailField({
  label, value, flex = 1, accent,
}: { label: string; value: string; flex?: number; accent?: string }) {
  return (
    <View style={{ flex, minWidth: 70 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text
        style={[s.fieldValue, accent && { color: accent }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius:    18,
    overflow:        'visible',
    borderWidth:     1,
    borderColor:     '#E5E9F0',
    // Gölgesiz — temiz minimalist görünüm
  },

  // ── HEADER STRIP ──
  headerBar: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'flex-end',
    // @ts-ignore — tooltip'in alt kart içeriği üstünde kalması için stacking context
    zIndex:           100,
    position:         'relative',
    paddingHorizontal: TICKET_PAD,
    paddingVertical:   8,
    gap:               12,
  },
  headerLeft:  { flex: 1, minWidth: 0 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerLabel: {
    fontSize:      9,
    fontWeight:    '800',
    fontFamily:    F.bold,
    letterSpacing: 1.5,
    marginBottom:  2,
  },
  headerOrderNo: {
    fontSize:      18,
    fontWeight:    '800',
    fontFamily:    F.bold,
    color:         '#0F172A',
    letterSpacing: -0.3,
  },
  headerDateBlock: { alignItems: 'flex-end' },
  headerSmall: {
    fontSize:      9,
    fontWeight:    '800',
    fontFamily:    F.bold,
    color:         '#94A3B8',
    letterSpacing: 1.2,
  },
  headerDate: {
    fontSize:      13,
    fontWeight:    '700',
    fontFamily:    F.bold,
    color:         '#0F172A',
    letterSpacing: -0.1,
    marginTop:     2,
  },
  headerSubLine: {
    marginTop: 4,
  },
  headerSubLabel: {
    fontSize:      9,
    fontWeight:    '800',
    fontFamily:    F.bold,
    color:         '#94A3B8',
    letterSpacing: 1.1,
  },
  headerSubDate: {
    fontSize:      11,
    fontWeight:    '700',
    fontFamily:    F.bold,
    color:         '#475569',
    letterSpacing: -0.1,
  },
  urgentBadge: {
    backgroundColor: '#FEF2F2',
    borderColor:     '#FCA5A5',
    borderWidth:     1,
    borderRadius:    6,
    paddingHorizontal: 8,
    paddingVertical:  3,
  },
  urgentText: {
    fontSize:      10,
    fontWeight:    '800',
    fontFamily:    F.bold,
    color:         '#DC2626',
    letterSpacing: 0.4,
  },
  // ── DOCK ──
  dock: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  dockBtn: {
    width:           34,
    height:          34,
    borderRadius:    10,
    alignItems:      'center',
    justifyContent:  'center',
    ...Platform.select({
      web: {
        // @ts-ignore — yumuşak hover geçişi
        transitionProperty: 'background-color, transform',
        // @ts-ignore
        transitionDuration: '160ms',
        // @ts-ignore
        cursor: 'pointer',
      },
      default: {},
    }),
  },
  dockBtnHover: {
    backgroundColor: '#F1F5F9',
    ...Platform.select({
      web: {
        // @ts-ignore
        transform: 'translateY(-1px)',
      },
      default: {},
    }),
  },
  dockBtnWrap: {
    position: 'relative',
    ...Platform.select({
      web: {
        // @ts-ignore — tooltip'in üst karta sokulmamasını sağlar
        zIndex: 50,
      },
      default: {},
    }),
  },
  // ── Tooltip — iOS frosted glass (light) ──
  tooltip: {
    position:        'absolute',
    top:             '100%',
    left:            '50%',
    marginTop:       10,
    // @ts-ignore — kart içeriğinin (diş chip'leri vs.) üstünde kalmalı
    zIndex:          200,
    paddingHorizontal: 12,
    paddingVertical:   7,
    borderRadius:    11,
    borderWidth:     0.5,
    borderColor:     'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems:      'center',
    ...Platform.select({
      web: {
        // @ts-ignore — opak cam: yoğun beyaz + güçlü blur
        backdropFilter: 'blur(28px) saturate(200%)',
        // @ts-ignore
        WebkitBackdropFilter: 'blur(28px) saturate(200%)',
        // @ts-ignore — yumuşak gölge + iç vurgu
        boxShadow: '0 8px 24px rgba(15,23,42,0.12), 0 1px 2px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.7)',
        // @ts-ignore
        transform: 'translateX(-50%)',
        // @ts-ignore
        whiteSpace: 'nowrap',
        // @ts-ignore
        pointerEvents: 'none',
      },
      default: {
        shadowColor:   '#0F172A',
        shadowOpacity: 0.15,
        shadowRadius:  14,
        shadowOffset:  { width: 0, height: 8 },
        elevation:     6,
      },
    }),
  },
  tooltipText: {
    fontSize:      12,
    fontWeight:    '600',
    fontFamily:    F.bold,
    color:         '#0F172A',
    letterSpacing: -0.1,
  },
  tooltipArrow: {
    position:        'absolute',
    top:             -3,
    left:            '50%',
    width:           8,
    height:          8,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth:  0.5,
    borderLeftWidth: 0.5,
    borderColor:     'rgba(255,255,255,0.85)',
    ...Platform.select({
      web: {
        // @ts-ignore
        backdropFilter: 'blur(22px) saturate(180%)',
        // @ts-ignore
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
        // @ts-ignore
        transform: 'translateX(-50%) rotate(45deg)',
      },
      default: {
        transform: [{ translateX: -4 }, { rotate: '45deg' }],
      },
    }),
  },

  // ── ÜST BÖLÜM ──
  topSection: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: 16,
    paddingVertical:   16,
    gap:               12,
  },
  toothCol: {
    alignItems:     'flex-end',
    justifyContent: 'center',
    minWidth:       0,
    // Üst/alt simetrik bleed: kartın boş title alanına taşar, dikey merkez korunur
    marginTop:      -40,
    marginBottom:   -40,
    marginLeft:     -16,
    marginRight:    -8,
    padding:        0,
  },
  metaCol: {
    alignItems: 'stretch',
    flex:       1,
    minWidth:   220,
  },
  metaRow: {
    flexDirection: 'row',
    gap:           14,
  },
  metaSmall: {
    fontSize:      9,
    fontWeight:    '800',
    fontFamily:    F.bold,
    color:         '#94A3B8',
    letterSpacing: 1.2,
    marginBottom:  3,
  },
  metaPatient: {
    fontSize:      17,
    fontWeight:    '800',
    fontFamily:    F.bold,
    color:         '#0F172A',
    letterSpacing: -0.3,
    lineHeight:    20,
  },
  metaValue: {
    fontSize:    12.5,
    fontWeight:  '700',
    fontFamily:  F.bold,
    color:       '#0F172A',
    letterSpacing: -0.1,
  },
  metaWorkType: {
    fontSize:    14,
    fontWeight:  '700',
    fontFamily:  F.bold,
    color:       '#334155',
    lineHeight:  18,
  },

  // ── NOTLAR ──
  notesSection: {
    flexDirection:    'row',
    alignItems:       'flex-start',
    gap:              8,
    paddingHorizontal: TICKET_PAD,
    paddingTop:       0,
    paddingBottom:    14,
  },
  notesIconWrap: {
    width:           20,
    height:          20,
    borderRadius:    4,
    backgroundColor: '#F1F5F9',
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       1,
  },
  notesText: {
    flex:        1,
    fontSize:    12,
    fontWeight:  '500',
    fontFamily:  F.regular,
    color:       '#475569',
    lineHeight:  17,
  },

  // ── KESİK ÇİZGİ AYIRICI + YARIM DAİRE NOTCH'LAR ──
  dividerWrap: {
    height:        24,
    flexDirection: 'row',
    alignItems:    'center',
    position:      'relative',
  },
  // Notch — yarım daire, kart kenarına oturur. box-shadow ile geniş bir
  // pageBg halka oluşturup card shadow'unun sızmasını engelliyor.
  // backgroundColor + (web only) boxShadow inline'da pageBg ile set edilir
  notch: {
    position:     'absolute',
    top:          0,
    width:        24,
    height:       24,
    borderRadius: 12,
  },
  notchLeft:  { left:  -12 },     // yarısı dışa, yarısı kart üstünde
  notchRight: { right: -12 },
  dashedLine: {
    flex:             1,
    height:           0,
    borderTopWidth:   1.5,
    borderStyle:      'dashed',
    borderColor:      '#CBD5E1',
    marginHorizontal: 16,         // notch'ları geçecek kadar boşluk
  },

  // ── ALT BÖLÜM ──
  bottomSection: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: TICKET_PAD,
    paddingVertical:   14,
    gap:               16,
  },
  metaQrRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    marginTop:     10,
    paddingTop:    10,
    borderTopWidth:1,
    borderTopColor:'#F1F5F9',
  },
  metaQrLabel: {
    fontSize:      9,
    fontWeight:    '800',
    fontFamily:    F.bold,
    color:         '#94A3B8',
    letterSpacing: 1.2,
    marginBottom:  3,
  },
  metaQrHint: {
    fontSize:    11.5,
    fontWeight:  '500',
    fontFamily:  F.regular,
    color:       '#64748B',
    lineHeight:  15,
  },
  qrBlock: {
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'visible',
    borderRadius:   3,
  },
  detailGroup: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    gap:            16,
  },
  fieldLabel: {
    fontSize:      9,
    fontWeight:    '800',
    fontFamily:    F.bold,
    color:         '#94A3B8',
    letterSpacing: 1.2,
    marginBottom:  3,
  },
  fieldValue: {
    fontSize:      13,
    fontWeight:    '700',
    fontFamily:    F.bold,
    color:         '#0F172A',
    letterSpacing: -0.1,
  },

  // Yazdır butonu — premium gloss
  printBtn: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              7,
    paddingHorizontal: 16,
    paddingVertical:  10,
    borderRadius:     10,
    ...Platform.select({
      web: {
        // @ts-ignore — hafif gloss
        boxShadow: '0 4px 12px rgba(37,99,235,0.30), inset 0 1px 0 rgba(255,255,255,0.25)',
      },
      default: {
        shadowColor:   '#1E40AF',
        shadowOpacity: 0.30,
        shadowRadius:  8,
        shadowOffset:  { width: 0, height: 4 },
        elevation:     4,
      },
    }),
  },
  printBtnText: {
    fontSize:      12,
    fontWeight:    '800',
    fontFamily:    F.bold,
    color:         '#FFFFFF',
    letterSpacing: 0.3,
  },
});

export default OrderTicketCard;
