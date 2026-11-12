/**
 * İş İstatistikleri — Admin Özet "Üye Trendi" kartından açılan sayfa (spec §7).
 * Bu dosya: iskelet, yapışkan araç çubuğu, klinik seçici, ay listesi, sekmeler,
 * yükleniyor/hata/boş durumları ve dışa aktarma bağlantısı. Genel bakış
 * (trend, kutular, listeler) `Overview` ile, ısı haritası `HeatmapTab` ile
 * çizilir; hücreye basınca `CellOrdersModal` o hücrenin siparişlerini listeler.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ResponsiveCanvas } from '../../../core/layout/ResponsiveCanvas';
import { useIsDesktop } from '../../../core/layout/PatternsShell';
import { PAGE_PADDING, CARD_GAP, FAB_CLEARANCE, mobileTopPad } from '../../../core/ui/pageMetrics';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme, onAccentInk } from '../../../core/theme/usePanelTheme';
import { MOBILE_PANEL_THEMES } from '../../../core/theme/mobileDesignTokens';
import { HERO_NAVY } from '../../../core/ui/HeroGlow';
import { EmptyStateX } from '../../../core/ui/EmptyStateX';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { Check, X } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { printLocale } from '../../../core/i18n/printLocale';
import { safeBack } from '../../../core/util/safeBack';
import { router } from 'expo-router';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { fetchLabLetterhead } from '../../invoices/labLetterheadApi';
import {
  monthLabel, shiftMonth, windowMonths, compareMonth, type MonthKey,
} from './months';
import {
  aggregateWorkStats, heatmapRows, ordersInCell, countOrders, UNKNOWN_CLINIC_ID, UNKNOWN_CLINIC_NAME,
  type AggInput, type WorkStats, type HeatRow, type HeatAxis, type CountedOrder,
} from './aggregate';
import { useWorkStatsData } from './useWorkStatsData';
import { useWorkStatsState } from './useWorkStatsState';
import {
  buildWorkStatsPdfHtml, buildWorkStatsXlsHtml, workStatsFileBase, type ExportDocInput,
} from './exportDoc';
import { exportWorkStatsPdf, exportWorkStatsXls } from './exportWorkStats';
import { WorkStatsToolbar } from './components/WorkStatsToolbar';
import { ClinicPicker, type ClinicOption } from './components/ClinicPicker';
import { useStickyToolbar } from './components/useStickyToolbar';
import type { AnchorRect } from './components/AnchoredPopover';
import { TrendChart } from './components/TrendChart';
import { MonthKpis } from './components/MonthKpis';
import { WorkTypeList } from './components/WorkTypeList';
import { ClinicList } from './components/ClinicList';
import { HeatmapTab } from './components/HeatmapTab';
import { CellOrdersModal } from './components/CellOrdersModal';
import { rankWorkTypes } from './overview';
import type { WorkStatsState } from './useWorkStatsState';

const web = Platform.OS === 'web';
const EMPTY_NAMES = new Map<string, string>();

function exportErrorText(e: any): string {
  const m = String(e?.message ?? e ?? '');
  if (m === 'POPUP_BLOCKED') return autoT('Açılır pencere engellendi. Tarayıcı ayarından izin ver.');
  if (m === 'SHARE_UNAVAILABLE') return autoT('Paylaşım bu cihazda kullanılamıyor');
  return autoT('Dışa aktarılamadı');
}

/** prefers-reduced-transparency (web). */
function useReducedTransparency(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    if (!web || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-transparency: reduce)');
    setV(mq.matches);
    const on = (e: any) => setV(!!e.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return v;
}

export function WorkStatsScreen() {
  const U = useInkUI();
  const accent = usePanelTheme().primary;
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  const insets = useSafeAreaInsets();
  const isDesktop = useIsDesktop();
  const { width } = useWindowDimensions();
  const narrow = width < 768;
  const reducedTransparency = useReducedTransparency();
  const locale = printLocale();

  const st = useWorkStatsState();
  const data = useWorkStatsData(st.selected);
  const refs = data.refs;

  useEffect(() => {
    if (data.status === 'ready' && refs) st.setFirstMonth(refs.firstMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.status, refs]);

  // Toplayıcı girdisi yalnız veri bu ayın penceresine aitken (status 'ready') kurulur;
  // ay değişirken eski pencereyle yeni ay hesaplanmaz (eksik aylar 0 görünürdü).
  const input: AggInput | null = useMemo(() => {
    if (data.status !== 'ready' || !refs) return null;
    return {
      orders: data.orders,
      clinicByDoctor: refs.clinicByDoctor,
      clinicName: refs.clinicName,
      unitByServiceName: refs.unitByServiceName,
      firstMonth: refs.firstMonth,
      selected: st.selected,
      compare: st.compare,
      clinicId: st.clinicId,
      chipWorkType: st.chipWorkType,
      focusWorkType: st.focusWorkType,
    };
  }, [data.status, data.orders, refs, st.selected, st.compare, st.clinicId, st.chipWorkType, st.focusWorkType]);

  const stats: WorkStats | null = useMemo(() => (input ? aggregateWorkStats(input) : null), [input]);
  // Ay değişirken son hazır sonuç soluk gösterilir (tam ekran yükleyiciye düşmez).
  const lastStats = useRef<WorkStats | null>(null);
  if (stats) lastStats.current = stats;
  const shownStats = stats ?? lastStats.current;
  const refreshing = !stats && !!lastStats.current && data.status === 'loading';

  // ── Isı haritası: yalnız sekme açıkken hesaplanır; ay değişirken son sonuç soluk kalır ──
  // Eksen sonuçla BİRLİKTE saklanır: yükleme sırasında eksen değişirse eski satırlar
  // yeni eksen etiketiyle çizilmez (soluk eski tablo kendi ekseniyle kalır).
  type HeatView = { rows: HeatRow[]; months: MonthKey[]; axis: HeatAxis };
  const heatNow: HeatView | null = useMemo(() => {
    if (!input || st.tab !== 'heat') return null;
    return { rows: heatmapRows(input, st.heatAxis), months: windowMonths(input.selected, 12), axis: st.heatAxis };
  }, [input, st.tab, st.heatAxis]);
  const lastHeat = useRef<HeatView | null>(null);
  if (heatNow) lastHeat.current = heatNow;
  const heat = heatNow ?? (st.tab === 'heat' ? lastHeat.current : null);

  // Hücre siparişleri penceresi: açıldığı andaki liste sabitlenir.
  const [cell, setCell] = useState<{ title: string; orders: CountedOrder[] } | null>(null);
  const [cellOpen, setCellOpen] = useState(false);
  const onHeatCell = useCallback((month: MonthKey, key: string) => {
    if (!input) return;
    if (!heat) return;
    const row = heat.rows.find((r) => r.key === key);
    const name = row ? autoT(row.label) : key;
    setCell({ title: `${name} · ${monthLabel(month, locale, 'long')}`, orders: ordersInCell(input, month, heat.axis, key)
      .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber, 'tr', { numeric: true })) });
    setCellOpen(true);
  }, [input, heat, locale]);

  // ── Klinik seçici seçenekleri: penceredeki klinikler, çoktan aza ──
  const clinicOptions: ClinicOption[] = useMemo(() => {
    if (data.status !== 'ready' || !refs) return [];
    const inWin = new Set(windowMonths(st.selected, 12));
    const tot = new Map<string, number>();
    for (const c of countOrders({ ...refs, orders: data.orders })) {
      if (!inWin.has(c.month)) continue;
      tot.set(c.clinicId, (tot.get(c.clinicId) ?? 0) + (c.bucket === 'uye' ? c.qty : 0));
    }
    return Array.from(tot, ([id, total]) => ({
      id,
      name: id === UNKNOWN_CLINIC_ID ? autoT(UNKNOWN_CLINIC_NAME) : (refs.clinicName.get(id) || autoT(UNKNOWN_CLINIC_NAME)),
      total,
    })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'tr'));
  }, [data.status, data.orders, refs, st.selected]);

  // ── Trend çipleri: penceredeki iş tipleri (klinik süzgeciyle), çoktan aza ──
  const chipsNow: string[] | null = useMemo(() => {
    if (data.status !== 'ready' || !refs) return null;
    return rankWorkTypes(countOrders({ ...refs, orders: data.orders }), windowMonths(st.selected, 12), st.clinicId);
  }, [data.status, data.orders, refs, st.selected, st.clinicId]);
  const lastChips = useRef<string[]>([]);
  if (chipsNow) lastChips.current = chipsNow;
  const chips = chipsNow ?? lastChips.current;

  const clinicLabel = st.clinicId === null
    ? autoT('Tüm klinikler')
    : st.clinicId === UNKNOWN_CLINIC_ID
      ? autoT(UNKNOWN_CLINIC_NAME)
      : (refs?.clinicName.get(st.clinicId) || autoT(UNKNOWN_CLINIC_NAME));

  // ── Ay sınırları ──
  const lower: MonthKey = st.firstMonth ?? st.today;
  const canPrev = st.firstMonth === undefined ? true : st.selected > lower;
  const canNext = st.selected < st.today;
  const [monthListOpen, setMonthListOpen] = useState(false);
  const recordMonths: MonthKey[] = useMemo(() => {
    if (!st.firstMonth) return [st.today];
    const out: MonthKey[] = [];
    for (let k = st.today; k >= st.firstMonth && out.length < 240; k = shiftMonth(k, -1)) out.push(k);
    return out;
  }, [st.firstMonth, st.today]);

  const [pickerAnchor, setPickerAnchor] = useState<AnchorRect | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // ── Dışa aktarma ──
  const [busy, setBusy] = useState<'xls' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const inFlight = useRef(false);

  /** Dışa aktarma girdisi: ekrandaki klinik + ay + kıyas (çip/odak süzgeçleri yok). */
  const exportParts = useCallback(() => {
    if (!input) return null;
    const ein: AggInput = { ...input, chipWorkType: null, focusWorkType: null };
    const cmpMode = st.compare === 'prev' ? autoT('Önceki ay') : autoT('Geçen yıl');
    return {
      base: {
        stats: aggregateWorkStats(ein),
        heat: heatmapRows(ein, 'workType'),
        clinicLabel,
        monthLabel: monthLabel(st.selected, locale, 'long'),
        compareLabel: `${cmpMode} · ${monthLabel(compareMonth(st.selected, st.compare), locale, 'long')}`,
        generatedAt: new Date(),
        t: autoT,
        locale,
        monthLabels: windowMonths(st.selected, 12).map((m) => monthLabel(m, locale, 'short')),
      } as Omit<ExportDocInput, 'lab'>,
      fileBase: workStatsFileBase(st.selected, st.clinicId ? clinicLabel : null),
    };
  }, [input, st.compare, st.selected, st.clinicId, clinicLabel, locale]);

  const onExportPdf = () => {
    const parts = exportParts();
    if (!parts || inFlight.current) return;
    inFlight.current = true;
    setBusy('pdf'); setExportError(null);
    // await YOK: web'de yazdırma penceresi tıklama jesti içinde açılmalı.
    const html = fetchLabLetterhead().then((lab) => buildWorkStatsPdfHtml({ ...parts.base, lab }));
    exportWorkStatsPdf(html, parts.fileBase)
      .catch((e) => setExportError(exportErrorText(e)))
      .finally(() => { inFlight.current = false; setBusy(null); });
  };

  const onExportXls = () => {
    const parts = exportParts();
    if (!parts || inFlight.current) return;
    inFlight.current = true;
    setBusy('xls'); setExportError(null);
    fetchLabLetterhead()
      .then((lab) => exportWorkStatsXls(buildWorkStatsXlsHtml({ ...parts.base, lab }), parts.fileBase))
      .catch((e) => setExportError(exportErrorText(e)))
      .finally(() => { inFlight.current = false; setBusy(null); });
  };

  // ── Yapışkan araç çubuğu ──
  const stickyTop = isDesktop ? 0 : mobileTopPad(insets.top) - 8;
  const { rowRef, barRef, stuck } = useStickyToolbar(web, stickyTop);
  const pageBg = isDark ? '#0E0E0E' : MOBILE_PANEL_THEMES.exec.bgPage;
  const solidBar = isDark ? HERO_NAVY.from : MOBILE_PANEL_THEMES.exec.bgPage;
  // Mobilde yüzen menünün arkası da bu katmanla örtülür → daha opak ki içerik okunmasın.
  const glassBar = isDesktop
    ? (isDark ? 'rgba(0,31,63,0.72)' : 'rgba(247,249,252,0.78)')
    : (isDark ? 'rgba(0,31,63,0.9)' : 'rgba(247,249,252,0.92)');
  const barBg = reducedTransparency ? solidBar : glassBar;
  const fadeTo = isDark ? 'rgba(0,31,63,0)' : 'rgba(247,249,252,0)';

  const tabPill = (key: 'overview' | 'heat', label: string) => {
    const on = st.tab === key;
    return (
      <Pressable
        key={key}
        onPress={() => st.setTab(key)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        style={({ pressed, hovered }: any) => ({
          // §1c kaydırmalı şerit: pasif 12 / aktif 18, dikey 8
          paddingHorizontal: on ? 18 : 12, paddingVertical: 8, borderRadius: 999,
          backgroundColor: on ? (isDark ? HERO_NAVY.light : accent) : hovered ? U.rowHover : 'transparent',
          transform: [{ scale: pressed ? 0.97 : 1 }],
          ...(web ? { cursor: 'pointer' } as any : {}),
        })}
      >
        <Text style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? (isDark ? '#FFFFFF' : onAccentInk(accent)) : U.ink[500] }}>{label}</Text>
      </Pressable>
    );
  };

  // ── Gövde ──
  let body: React.ReactNode;
  // Hata: önceki ayın sonucu yeni ay etiketinin altında GÖSTERİLMEZ (yanlış okunurdu);
  // yalnız hata metni + yanında "Yeniden dene".
  if (data.status === 'error') {
    body = (
      <View style={{ ...U.cardSolid, alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <Text accessibilityRole="alert" style={{ fontSize: 13.5, color: U.chipTones.danger.fg, fontWeight: '600' }}>
            {autoT(data.error ?? 'İstatistik yüklenemedi')}
          </Text>
          <RetryBtn onPress={data.reload} />
        </View>
      </View>
    );
  } else if (!shownStats) {
    body = (
      <View style={{ paddingVertical: 64, alignItems: 'center', gap: 12 }}>
        <ActivityIndicator color={isDark ? '#93C5FD' : accent} />
        <Text style={{ fontSize: 12.5, color: U.ink[500] }}>Yükleniyor…</Text>
      </View>
    );
  } else {
    body = (
      <View style={{ gap: CARD_GAP, opacity: refreshing ? 0.55 : 1 }}>
        {st.tab === 'overview'
          ? <Overview stats={shownStats} st={st} chips={chips} locale={locale} />
          : heat ? (
            <HeatmapTab
              rows={heat.rows}
              months={heat.months}
              monthLabels={heat.months.map((m) => monthLabel(m, locale, 'short'))}
              monthLongLabels={heat.months.map((m) => monthLabel(m, locale, 'long'))}
              axis={heat.axis}
              onAxis={st.setHeatAxis}
              onCell={onHeatCell}
            />
          ) : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <ResponsiveCanvas
        size="xl"
        bgClassName="bg-[#F7F9FC] dark:bg-[#0E0E0E]"
        padClassName=""
        style={{
          paddingHorizontal: PAGE_PADDING,
          paddingTop: isDesktop ? 8 : mobileTopPad(insets.top),
          paddingBottom: FAB_CLEARANCE,
        }}
      >
        <View ref={rowRef} style={{ gap: CARD_GAP }}>
          {/* Yapışkan araç çubuğu — gerçek kaydırma kaplarını dinleyip translateY ile izler */}
          <View ref={barRef} style={{ zIndex: 20, position: 'relative' }}>
            {/* Malzeme katmanı: yalnız yapışınca görünür; sayfa kenarına taşar */}
            <View
              pointerEvents="none"
              style={{
                // Mobilde ekranın en üstüne kadar uzar: yüzen menü ile çubuk arasında
                // içeriğin göründüğü boşluk kalmaz.
                position: 'absolute', top: isDesktop ? 0 : -stickyTop, bottom: 0, left: -PAGE_PADDING, right: -PAGE_PADDING,
                backgroundColor: barBg,
                opacity: stuck ? 1 : 0,
                ...(web ? {
                  transition: 'opacity 180ms ease-out',
                  ...(reducedTransparency ? {} : {
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  }),
                } as any : {}),
              }}
            >
              {/* Sert alt çizgi yerine yumuşak solma */}
              <View
                style={{
                  position: 'absolute', left: 0, right: 0, top: '100%', height: 18,
                  ...(web ? { backgroundImage: `linear-gradient(to bottom, ${reducedTransparency ? solidBar : glassBar}, ${fadeTo})` } as any : {}),
                }}
              />
            </View>
            <WorkStatsToolbar
              monthText={monthLabel(st.selected, locale, 'long')}
              canPrev={canPrev}
              canNext={canNext}
              onPrev={() => st.setSelected(shiftMonth(st.selected, -1))}
              onNext={() => st.setSelected(shiftMonth(st.selected, 1))}
              onOpenMonthList={() => setMonthListOpen(true)}
              clinicLabel={clinicLabel}
              onOpenClinicPicker={(a) => { setPickerAnchor(a); setPickerOpen(true); }}
              compare={st.compare}
              onCompare={st.setCompare}
              onExportXls={onExportXls}
              onExportPdf={onExportPdf}
              exportError={exportError}
              busy={busy}
              narrow={narrow}
              exportDisabled={!input}
              onBack={() => safeBack('/(admin)')}
            />
          </View>

          {/* Sekmeler */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              accessibilityRole="tablist"
              style={{ flexDirection: 'row', alignItems: 'center', padding: 3, borderRadius: 999, backgroundColor: U.chipNeutral }}
            >
              {tabPill('overview', autoT('Genel bakış'))}
              {tabPill('heat', autoT('Isı haritası'))}
            </View>
            {refreshing ? <ActivityIndicator size="small" color={isDark ? '#93C5FD' : accent} /> : null}
          </View>

          {body}
        </View>
      </ResponsiveCanvas>

      <ClinicPicker
        visible={pickerOpen}
        anchor={pickerAnchor}
        options={clinicOptions}
        value={st.clinicId}
        onPick={st.setClinicId}
        onClose={() => setPickerOpen(false)}
      />

      <CellOrdersModal
        visible={cellOpen}
        title={cell?.title ?? ''}
        orders={cell?.orders ?? []}
        clinicName={refs?.clinicName ?? EMPTY_NAMES}
        onClose={() => setCellOpen(false)}
        onOpenOrder={(id) => { setCellOpen(false); router.push(`/(admin)/order/${id}` as any); }}
      />

      <MonthListModal
        visible={monthListOpen}
        months={recordMonths}
        selected={st.selected}
        locale={locale}
        onPick={(m) => { st.setSelected(m); setMonthListOpen(false); }}
        onClose={() => setMonthListOpen(false)}
      />
    </View>
  );
}

function RetryBtn({ onPress }: { onPress(): void }) {
  const U = useInkUI();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed, hovered }: any) => ({
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
        backgroundColor: hovered ? U.plainBtn.hoverBg : U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
        transform: [{ scale: pressed ? 0.97 : 1 }],
        ...(web ? { cursor: 'pointer' } as any : {}),
      })}
    >
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.plainBtn.fg }}>Yeniden dene</Text>
    </Pressable>
  );
}

/** Kayıt dönemindeki aylar (yeniden eskiye) — ortada, bulanık arka planlı pencere. */
function MonthListModal({ visible, months, selected, locale, onPick, onClose }: {
  visible: boolean; months: MonthKey[]; selected: MonthKey; locale: string;
  onPick(m: MonthKey): void; onClose(): void;
}) {
  const U = useInkUI();
  const accent = usePanelTheme().primary;
  const tint = U.isDark ? '#93C5FD' : accent;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        {/* Dışarı basınca kapanır — kartın KARDEŞİ (iç içe <button> olmasın) */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={autoT('Kapat')} />
        <View style={[U.modalCard, { maxWidth: 360 }]}>
          <View style={U.modalHeaderRow}>
            <Text style={U.modalTitle}>Ay seç</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={autoT('Kapat')} style={U.modalCloseBtn}>
              <X size={14} color={U.ink[700]} strokeWidth={2.2} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ padding: 8 }}>
            {months.map((m) => {
              const on = m === selected;
              return (
                <Pressable
                  key={m}
                  onPress={() => onPick(m)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={({ pressed, hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12,
                    backgroundColor: on ? (U.isDark ? 'rgba(147,197,253,0.14)' : accent + '1A') : hovered || pressed ? U.rowHover : 'transparent',
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                    ...(web ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: on ? '700' : '500', color: on ? tint : U.ink[800] }}>
                    {monthLabel(m, locale, 'long')}
                  </Text>
                  {on ? <Check size={15} color={tint} strokeWidth={2.4} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Genel bakış (spec §7.3–7.4): üstte 12 aylık trend, altında seçili ayın dört
 * kutusu ve iş tipi / klinik listeleri (≥1024 px yan yana, altında alt alta).
 */
function Overview({ stats, st, chips, locale }: {
  stats: WorkStats; st: WorkStatsState; chips: string[]; locale: string;
}) {
  const U = useInkUI();
  const { width } = useWindowDimensions();
  const wide = width >= 1024;
  const [expanded, setExpanded] = useState<string | null>(null);
  const q = stats.selectedQty;
  const bucket = stats.trend[0]?.bucket ?? 'uye';
  const unitLabel = autoT(bucket === 'cene' ? 'çene' : bucket === 'adet' ? 'adet' : 'üye');
  const empty = !!q && q.uye === 0 && q.cene === 0 && q.adet === 0;

  return (
    <View style={{ gap: CARD_GAP }}>
      <TrendChart
        points={stats.trend}
        selected={st.selected}
        onSelect={st.setSelected}
        showLastYear={st.compare === 'lastYear'}
        chips={chips}
        chip={st.chipWorkType}
        onChip={st.setChipWorkType}
        unitLabel={unitLabel}
      />
      {!q ? (
        <View style={U.cardSolid}><EmptyStateX icon="calendar" title="Bu aya ait kayıt yok" compact /></View>
      ) : (
        <>
          <MonthKpis
            qty={q}
            compare={stats.compareQty}
            compareMode={st.compare}
            // Geçen yıl kıyasında yıl da yazılır: "Kas 2025" (yalnız "Kas" seçili ay sanılıyordu)
            compareMonthText={monthLabel(compareMonth(st.selected, st.compare), locale, st.compare === 'lastYear' ? 'shortYear' : 'short')}
            avg6={stats.avg6Uye}
          />
          {empty && !st.focusWorkType ? (
            <View style={U.cardSolid}><EmptyStateX icon="inbox" title="Bu ay sipariş gelmedi" compact /></View>
          ) : (
            <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'flex-start' : 'stretch', gap: CARD_GAP }}>
              <View style={wide ? { flex: 1, minWidth: 0 } : undefined}>
                <WorkTypeList
                  rows={stats.workTypes}
                  focus={st.focusWorkType}
                  onFocus={st.setFocusWorkType}
                  expanded={expanded}
                  onExpand={setExpanded}
                  months={stats.months}
                  selected={st.selected}
                />
              </View>
              <View style={wide ? { flex: 1, minWidth: 0 } : undefined}>
                <ClinicList
                  rows={stats.clinics}
                  onPick={st.setClinicId}
                  focusLabel={st.focusWorkType}
                  onClearFocus={() => { st.setFocusWorkType(null); setExpanded(null); }}
                />
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

export default WorkStatsScreen;
