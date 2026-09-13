import { localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
// modules/station/screens/ProductionKanbanScreen.tsx
// Üretim Panosu — iş odaklı liste/sütun panosu.
//
// Hallmark · redesign · genre: modern-minimal · theme: design-system (CLAUDE.md)
// Katalog teması / macrostructure YOK — sistem-yönetimli proje, kilitli sistem kazanır.
//
// Stil dili:
//   • Renklerin TAMAMI panelden çözülür — usePanelTheme() (accent) + useMobileTokens()
//     (zemin/ink/hairline, dark-mode farkında). Hardcode renk YOK (CLAUDE.md §7).
//     Eskiden burada 44 adet hardcode Apple sistem rengi vardı; dark mode'u kırıyor
//     ve sayfayı uygulamanın geri kalanından koparıyordu.
//   • Kolon = yuvarlak yüzey konteyner, kart yığını yok
//   • Item = inline satır, hairline ayraçlarla bölünür
//   • Dolu daire = aşama göstergesi (sol)
//   • Tek kontrol çubuğu: rakamlar solda · arama + yenile sağda.
//     Rakamlar aynı zamanda filtre: "Geciken 2"ye dokununca liste süzülür.
//     Ayrı filtre çipleri kaldırıldı — aynı sayıyı ikinci kez gösteriyorlardı.

import React, { useEffect, useMemo, useState, useContext, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, useWindowDimensions, Platform, Modal, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';

import { useAuthStore } from '../../../core/store/authStore';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { DS } from '../../../core/theme/dsTokens';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { AppIcon } from '../../../core/ui/AppIcon';
import { HubContext } from '../../../core/ui/HubContext';

import { useKanbanData, type KanbanCard, type KanbanColumn } from '../hooks/useKanbanData';
import { autoAssignUser } from '../../orders/autoAssign';
import { STAGE_CHECKLIST, STAGE_LABEL, STAGE_COLOR, type Stage } from '../../orders/stages';
import { slaStatus, humanIdle } from '../../orders/slaConfig';
import { StageChecklistModal } from '../../orders/components/StageChecklistModal';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

// ─── Sabitler ────────────────────────────────────────────────────────────────
const COL_WIDTH = 300;   // dar ekranda kolon genişliği
// Geniş ekranda TAVAN — kolonlar boşluğa yayılmasın (aksi halde aksiyon pili
// ait olduğu metinden ~350px uzakta yüzüyor). 380 fazla sıkıydı: iş tipi
// başlıkları kırpılıyordu. 440 + 2 satırlık başlık = içerik kromun önünde.
const COL_MAX   = 440;
const COL_GAP   = 16;
const PAD       = 16;

// Status renkleri tüm panellerde ortak (CLAUDE.md §1) — DS'ten gelir, hardcode değil.
const DANGER = DS.lab.danger;    // #D94B4B
const WARN   = DS.lab.warning;   // #E89B2A

/** Sayı sütunları dikeyde hizalansın. */
const NUM = { fontVariant: ['tabular-nums'] as any };
/** DESIGN_LANGUAGE §2 — display başlık/rakam ailesi (daima light 300) */
const DISPLAY_FONT = Platform.select({
  web: 'Inter Tight, Inter, system-ui, sans-serif',
  default: 'InterTight_300Light',
}) as string;

/** Canlı veri göstergesi — 2.4sn'lik yumuşak nabız (DESIGN_LANGUAGE §9). */
function LiveDot({ color }: { color: string }) {
  const v = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1,    duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(v, { toValue: 0.35, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View style={{
      width: 6, height: 6, borderRadius: 999, backgroundColor: color, opacity: v,
    }} />
  );
}

function hexA(hex: string, a: number) {
  try { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})`; } catch { return hex; }
}

// ─── Palet — panelden çözülür, dark-mode farkında ────────────────────────────

interface Palette {
  bg: string; card: string; cardSoft: string; hairline: string;
  ink: string; ink2: string; ink3: string;
  accent: string; accentDeep: string;
}

function usePalette(): Palette {
  const T = useMobileTokens();
  const theme = usePanelTheme();
  return useMemo(() => ({
    bg: T.bg, card: T.card, cardSoft: T.cardSoft, hairline: T.hairline,
    ink: T.ink, ink2: T.ink2, ink3: T.ink3,
    accent: theme.primary, accentDeep: theme.primaryDeep,
  }), [T.bg, T.card, T.cardSoft, T.hairline, T.ink, T.ink2, T.ink3, theme.primary, theme.primaryDeep]);
}

/** Stiller paletten türetilir — StyleSheet.create statik olduğu için factory + memo. */
function makeStyles(C: Palette) {
  return {
    s: StyleSheet.create({
      container: { flex: 1, backgroundColor: C.bg },

      // Tek kontrol çubuğu — durum solda, araçlar sağda
      bar: {
        flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
        gap: 8, paddingHorizontal: PAD, paddingTop: 8, paddingBottom: 12,
      },
      status:     { flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0, fontSize: 14, fontWeight: '600', color: C.ink2, ...NUM },
      statusMuted:{ color: C.ink3, fontWeight: '500' },

      // Durum şeridi — DESIGN_LANGUAGE §2: DISPLAY (Inter Tight 300) rakam +
      // 10px uppercase meta etiket. Düz "4 iş · 2 aktif" cümlesinin yerini alır;
      // rakamlar tek bakışta okunur, etiketler geri planda kalır.
      statWrap:   { flexDirection: 'row', alignItems: 'center', gap: 14, flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0, flexWrap: 'wrap' },
      statBlock:  { gap: 2, paddingVertical: 2 },
      // Dokunulabilir rakamlar filtreyi açar; dolgu + yarıçap onları ölü metinden
      // ayırır (dokunulabilir olan dokunulabilir görünmeli).
      statBlockTap: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginHorizontal: -2 },
      statValue:  {
        fontFamily: DISPLAY_FONT, fontWeight: '300', fontSize: 20,
        letterSpacing: -0.6, lineHeight: 24, color: C.ink, ...NUM,
      },
      statLabel:  {
        fontSize: 10, fontWeight: '500', letterSpacing: 0.8,
        textTransform: 'uppercase', color: C.ink3,
      },
      // flexBasis şart: temeli olmayan wrap-item kendi satırına düştüğünde
      // içeriğine göre boyutlanıp taşar, içindeki çipler sarmalanmaz.
      barTools:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', flexGrow: 1, flexShrink: 1, flexBasis: 300, minWidth: 0 },

      searchBox:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, flexGrow: 1, flexBasis: 200, minWidth: 150, borderWidth: 1, borderColor: C.hairline },
      searchInput:{ flex: 1, fontSize: 13, color: C.ink, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) },
      clearBtn:   { paddingHorizontal: 10, paddingVertical: 7 },
      clearTxt:   { fontSize: 12.5, fontWeight: '600' },
      refreshBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

      center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
      errorText: { fontSize: 14, color: C.ink3 },
      retryBtn:  { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
      retryText: { color: '#FFFFFF', fontWeight: '700' },
    }),

    col: StyleSheet.create({
      wrap:        { gap: 8 },
      headerOuter: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 4, gap: 2 },
      headerRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
      dot:         { width: 10, height: 10, borderRadius: 5 },
      title:       { flex: 1, fontSize: 14, fontWeight: '600', color: C.ink, letterSpacing: -0.2 },
      count:       { fontSize: 13, fontWeight: '600', color: C.ink3, ...NUM },
      subtitle:    { fontSize: 12, color: C.ink3, fontWeight: '500' },
      list:        { backgroundColor: C.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.hairline },
      empty:       { fontSize: 13, color: C.ink3, textAlign: 'center', paddingVertical: 18, fontWeight: '500' },
    }),

    r: StyleSheet.create({
      rowOuter:   { paddingHorizontal: 14, paddingVertical: 9, gap: 6 },
      row:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
      // Atanmamış satırda iki pil (Otomatik+Manuel) genişliğin yarısını yiyor →
      // kendi satırlarına in, başlık tam genişliği alsın.
      actionRow:  { flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginStart: 24 },
      rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hairline },

      indicatorWrap: { paddingVertical: 4 },
      indicator:     { width: 12, height: 12, borderRadius: 6 },

      body:     { flex: 1, gap: 2, minWidth: 0 },
      titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
      title:    { flex: 1, fontSize: 15, fontWeight: '600', color: C.ink, letterSpacing: -0.2 },
      lateText: { fontSize: 12, fontWeight: '700', color: DANGER, letterSpacing: 0.2 },

      parallelBadge:     { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: hexA(C.accent, 0.12) },
      parallelBadgeText: { fontSize: 8.5, fontWeight: '800', color: C.accentDeep, letterSpacing: 0.4 },

      meta:       { fontSize: 11.5, color: C.ink3, fontWeight: '500' },
      metaStrong: { color: C.ink2, fontWeight: '600' },

      actionWrap: { flexShrink: 0 },
      pill:           { paddingHorizontal: 14, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
      pillFilledText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.1 },
      pillTintedText: { fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },
      // "Devam" birincil aksiyon DEĞİL — sayfada 20 kez tekrar ediyor ve dolgulu
      // pill olarak asıl bilgiden (iş tipi, gecikme) dikkat çalıyordu. Sade metin.
      pillGhost:     { paddingHorizontal: 8, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
      pillGhostText: { fontSize: 12.5, fontWeight: '600', letterSpacing: -0.1 },
    }),

    mp: StyleSheet.create({
      backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.40)', justifyContent: 'flex-end', alignItems: 'center' },
      sheet: {
        width: '100%', maxWidth: 420, backgroundColor: C.card,
        borderTopStartRadius: 20, borderTopEndRadius: 20,
        paddingTop: 8, paddingBottom: 24, paddingHorizontal: 16, gap: 8,
      },
      handle:   { width: 36, height: 5, borderRadius: 2.5, backgroundColor: C.ink3, alignSelf: 'center', marginBottom: 8, opacity: 0.4 },
      title:    { fontSize: 17, fontWeight: '700', color: C.ink, paddingHorizontal: 4 },
      subtitle: { fontSize: 13, color: C.ink3, paddingHorizontal: 4, marginBottom: 6 },
      empty:    { fontSize: 14, color: C.ink3, textAlign: 'center', paddingVertical: 24 },

      row:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: C.card },
      rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hairline },
      name:       { fontSize: 15, fontWeight: '600', color: C.ink },
      count:      { fontSize: 13, color: C.ink3, fontWeight: '600', ...NUM },

      close:     { alignItems: 'center', justifyContent: 'center', paddingVertical: 14, marginTop: 8, backgroundColor: C.bg, borderRadius: 14 },
      closeText: { fontSize: 15, fontWeight: '700' },
    }),
  };
}

type Sx = ReturnType<typeof makeStyles>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deliveryText(d: string): string {
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(d + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0)  return autoT('{n}g geçti').replace('{n}', String(Math.abs(diff)));
  if (diff === 0) return autoT('Bugün');
  if (diff === 1) return autoT('Yarın');
  if (diff <= 6)  return `${diff} ${autoT('gün')}`;
  return due.toLocaleDateString(localeTag(), { day: 'numeric', month: 'short' });
}

// ─── Item Row ────────────────────────────────────────────────────────────────

interface ItemProps {
  card:        KanbanCard;
  isLast:      boolean;
  isUnassigned?: boolean;
  busy?:       boolean;
  C:           Palette;
  sx:          Sx;
  onOpen:      () => void;
  onContinue:  () => void;
  onAutoAssign?: () => void;
  onAssign?:   () => void;
}

function ItemRow({
  card, isLast, isUnassigned, busy, C, sx,
  onOpen, onContinue, onAutoAssign, onAssign,
}: ItemProps) {
  const r = sx.r;
  const idleMs = card.stage_started_at ? Date.now() - new Date(card.stage_started_at).getTime() : 0;
  const sla    = slaStatus(card.current_stage, idleMs);
  const isLate = sla === 'red';
  const stageColor = STAGE_COLOR[card.current_stage];
  // #3: iş tipi metni aşırı uzun/tekrarlı olabilir → benzersizleştir + özetle
  const workTypeLabel = (() => {
    const parts = (card.work_type || '').split(',').map(p => p.trim()).filter(Boolean);
    const uniq: string[] = [];
    const seen = new Set<string>();
    for (const p of parts) { const k = p.toLocaleLowerCase('tr-TR'); if (!seen.has(k)) { seen.add(k); uniq.push(p); } }
    if (uniq.length === 0) return card.work_type || '—';
    return uniq.length > 2 ? `${uniq.slice(0, 2).join(', ')} +${uniq.length - 2}` : uniq.join(', ');
  })();

  // Tek bakışta vaka kimliği: HASTA başlıkta; iş tipi + diş no + renk alt satırda;
  // hekim + klinik + teknisyen meta satırında. Hasta yoksa iş tipi başlığa düşer.
  const hasPatient = !!(card.patient_name && card.patient_name.trim());
  const titleText  = hasPatient ? card.patient_name!.trim() : workTypeLabel;
  const toothStr   = Array.isArray(card.tooth_numbers) && card.tooth_numbers.length
    ? card.tooth_numbers.join(', ') : '';
  const detailLine = [
    hasPatient ? workTypeLabel : '',
    toothStr ? `${autoT('Diş')} ${toothStr}` : '',
    card.shade ? `${autoT('Renk')} ${card.shade}` : '',
  ].filter(Boolean).join('  ·  ');

  return (
    <View style={[r.rowOuter, !isLast && r.rowDivider]}>
      <View style={r.row}>
        {/* Sol: dolu daire (aşama göstergesi) */}
        <TouchableOpacity onPress={onOpen} activeOpacity={0.7} style={r.indicatorWrap}>
          <View style={[r.indicator, { backgroundColor: stageColor }]} />
        </TouchableOpacity>

        {/* Gövde */}
        <TouchableOpacity onPress={onOpen} activeOpacity={0.7} style={r.body}>
          <View style={r.titleRow}>
            {/* Başlık = HASTA (yoksa iş tipi) — vakayı tanımlayan birincil bilgi */}
            <Text style={[r.title, isLate && { color: DANGER }]} numberOfLines={1}>
              {titleText}
            </Text>
            {isLate && (
              <Text style={r.lateText}>+{humanIdle(idleMs)}</Text>
            )}
            {card.parallel_group != null && (
              <View style={r.parallelBadge}>
                <Text style={r.parallelBadgeText}>‖ PARALEL</Text>
              </View>
            )}
          </View>
          {detailLine ? (
            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '500', color: C.ink2, marginTop: 1 }}>
              {detailLine}
            </Text>
          ) : null}
          <Text style={r.meta} numberOfLines={1}>
            <Text style={r.metaStrong}>#{card.order_number}</Text>
            {card.doctor_name ? `  ·  ${card.doctor_name}` : ''}
            {card.clinic_name ? `  ·  ${card.clinic_name}` : ''}
            {card.technician_name ? `  ·  ${card.technician_name}` : `  ·  ${autoT('Atanmadı')}`}
            {`  ·  ${deliveryText(card.delivery_date)}`}
          </Text>
        </TouchableOpacity>

        {/* Tek aksiyon satır içinde kalır */}
        {!isUnassigned && (
          <View style={r.actionWrap}>
            <TouchableOpacity
              onPress={onContinue}
              disabled={busy}
              activeOpacity={0.75}
              style={[r.pillGhost, busy && { opacity: 0.5 }]}
            >
              <Text style={[r.pillGhostText, { color: C.ink3 }]}>Devam ›</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* İki aksiyon kendi satırında — başlığı ezmesin */}
      {isUnassigned && (
        <View style={r.actionRow}>
          {/* Ortak yol önce, ikincisi bir ton geride: her satırda iki DOLU pil
              yan yana durunca liste bir buton duvarına dönüşüyordu ve hangisinin
              varsayılan olduğu okunmuyordu. */}
          <TouchableOpacity
            onPress={onAssign}
            activeOpacity={0.6}
            style={r.pillGhost}
          >
            <Text style={[r.pillGhostText, { color: C.ink3 }]}>Manuel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onAutoAssign}
            disabled={busy}
            activeOpacity={0.75}
            style={[r.pill, { backgroundColor: C.accent }, busy && { opacity: 0.5 }]}
          >
            <Text style={r.pillFilledText}>Otomatik ata</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Column ──────────────────────────────────────────────────────────────────

interface ColumnProps {
  column:    KanbanColumn;
  colWidth:  number;
  C:         Palette;
  sx:        Sx;
  onCard:    (c: KanbanCard) => void;
  onContinue:(c: KanbanCard) => void;
  onAutoAssign:(c: KanbanCard) => void;
  onAssign:  (c: KanbanCard) => void;
  busyId:    string | null;
}

function ColumnView({
  column, colWidth, C, sx,
  onCard, onContinue, onAutoAssign, onAssign, busyId,
}: ColumnProps) {
  const col = sx.col;
  const isUnassigned = column.isUnassigned;
  const headerColor  = column.color;
  const workloadLine = column.workload.slice(0, 2).map(w => `${w.name} ${w.count}`).join(' · ');
  // Operasyonel zeka (#2): WIP/darboğaz eşiği + geciken
  const WIP = 6;
  const bottleneck = !isUnassigned && column.cards.length >= WIP;

  return (
    <View style={[col.wrap, { width: colWidth }]}>
      {/* Kolon başlığı — konteynerin dışında */}
      <View style={col.headerOuter}>
        <View style={col.headerRow}>
          <View style={[col.dot, { backgroundColor: headerColor }]} />
          <Text style={col.title} numberOfLines={1}>{column.label}</Text>
          {/* Atanmamış = bekleyen iş; operasyonel olarak en kritik kuyruk */}
          {isUnassigned && column.cards.length > 0 ? (
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: hexA(WARN, 0.16) }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: WARN, letterSpacing: 0.3 }}>ATAMA BEKLİYOR</Text>
            </View>
          ) : null}
          {/* İstasyon boşsa atıl kapasite — sessizce belirt */}
          {!isUnassigned && column.cards.length === 0 ? (
            <Text style={{ fontSize: 10, fontWeight: '500', color: C.ink3, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              Boşta
            </Text>
          ) : null}
          <Text style={col.count}>{column.cards.length}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginStart: 18, marginTop: 2, flexWrap: 'wrap' }}>
          {workloadLine && !isUnassigned ? <Text style={col.subtitle}>{workloadLine}</Text> : null}
          {column.overdue > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: hexA(DANGER, 0.12) }}>
              <AppIcon name="alert-triangle" size={9} color={DANGER} />
              <Text style={{ fontSize: 9.5, fontWeight: '700', color: DANGER, ...NUM }}>{column.overdue} geciken</Text>
            </View>
          ) : null}
          {bottleneck ? (
            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: hexA(WARN, 0.16) }}>
              <Text style={{ fontSize: 9.5, fontWeight: '800', color: WARN, letterSpacing: 0.3 }}>DARBOĞAZ</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Liste konteyneri — darboğazda kenarlık kırmızıya döner (kart-içinde-kart değil) */}
      {/* Renkli çerçeve KALDIRILDI. Durumu zaten başlıktaki "ATAMA BEKLİYOR" /
          "DARBOĞAZ" rozeti söylüyor; bir de tüm listeyi turuncuya çerçevelemek
          aynı bilgiyi ikinci kez, daha gürültülü biçimde tekrar ediyordu. */}
      <View style={col.list}>
        {column.cards.length === 0 ? (
          <Text style={col.empty}>Boş</Text>
        ) : (
          column.cards.map((card, i) => (
            <ItemRow
              key={card.id}
              card={card}
              isLast={i === column.cards.length - 1}
              isUnassigned={isUnassigned}
              busy={busyId === card.id}
              C={C}
              sx={sx}
              onOpen={() => onCard(card)}
              onContinue={() => onContinue(card)}
              onAutoAssign={() => onAutoAssign(card)}
              onAssign={() => onAssign(card)}
            />
          ))
        )}
      </View>
    </View>
  );
}


// ─── Sağ operasyon şeridi ────────────────────────────────────────────────────
// Geniş ekranda kolonların sağında kalan boşluğu kullanır. Kendi verisi yok —
// hepsi `columns`'tan türetilir, ek sorgu açmaz. İleride canlı istasyon
// izleme / iş yükü dengeleme widget'ları bu şeride eklenebilir.
function OpsRail({ columns, allColumns, C, width }: {
  columns: KanbanColumn[];
  /** Filtrelenmemiş kolonlar — kapasite panelin filtresine göre değişmez. */
  allColumns: KanbanColumn[];
  C: Palette; width: number;
}) {
  const stalledCards = columns
    .flatMap(c => c.cards.map(card => ({ card, col: c })))
    .filter(({ card }) => {
      const idle = card.stage_started_at ? Date.now() - new Date(card.stage_started_at).getTime() : 0;
      return slaStatus(card.current_stage, idle) === 'red';
    })
    .slice(0, 6);
  // Atıl kapasite `allColumns`'tan gelir. Eskiden filtrelenmiş listeden
  // hesaplanıyordu; o liste boş istasyonları zaten ELEDİĞİ için bölüm her zaman
  // "Tüm istasyonlar dolu" diyordu — üst şerit aynı anda "16 boş istasyon"
  // gösterirken. Pano kendi kendisiyle çelişiyordu.
  const idle = allColumns.filter(c => !c.isUnassigned && c.cards.length === 0);
  const busy = [...columns].filter(c => !c.isUnassigned && c.cards.length > 0)
    .sort((a, b) => b.cards.length - a.cards.length).slice(0, 5);

  /** Boş bölüm kutu ÇİZMEZ — sıfır bilgi için çerçeve çizmek panoyu şişiriyordu. */
  const Section = ({ title, count, empty, children }: {
    title: string; count: number; empty?: string; children?: React.ReactNode;
  }) => (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 10, fontWeight: '500', letterSpacing: 1.2, textTransform: 'uppercase', color: C.ink3, flex: 1 }}>
          {title}
        </Text>
        <Text style={{ fontSize: 11, fontWeight: '600', color: C.ink3, ...NUM }}>{count}</Text>
      </View>
      {count === 0 ? (
        <Text style={{ fontSize: 12, color: C.ink3, opacity: 0.75, paddingBottom: 2 }}>{empty}</Text>
      ) : (
        <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.hairline, overflow: 'hidden' }}>
          {children}
        </View>
      )}
    </View>
  );

  return (
    <View style={{ width, gap: 18 }}>
      {/* "Gecikenler" DEĞİL: üst şeritteki "Geciken" teslim tarihine bakar, bu
          liste aşamada bekleme süresine (SLA) bakar. Aynı adı taşıdıkları için
          pano iki farklı sayı gösterip çelişiyor gibi görünüyordu. */}
      <Section title="Aşamada bekleyen" count={stalledCards.length} empty="Bekleyen iş yok">
        {stalledCards.map(({ card, col }, i) => (
          <View key={card.id} style={{
            paddingHorizontal: 12, paddingVertical: 9,
            borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: C.hairline,
          }}>
            <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '600', color: C.ink }}>
              #{card.order_number}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 11, color: C.ink3, marginTop: 1 }}>
              {col.label}{card.technician_name ? ` · ${card.technician_name}` : ' · atanmadı'}
            </Text>
          </View>
        ))}
      </Section>

      <Section title="Yoğun istasyonlar" count={busy.length} empty="Aktif istasyon yok">
        {busy.map((c, i) => (
          <View key={c.key} style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 12, paddingVertical: 9,
            borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: C.hairline,
          }}>
            <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: c.color }} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, fontWeight: '500', color: C.ink }}>{c.label}</Text>
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.ink2, ...NUM }}>{c.cards.length}</Text>
          </View>
        ))}
      </Section>

      <Section title="Atıl kapasite" count={idle.length} empty="Tüm istasyonlar dolu">
        {(
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12 }}>
            {idle.map(c => (
              <View key={c.key} style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999,
                backgroundColor: hexA(C.ink3, 0.08),
              }}>
                <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: c.color }} />
                <Text style={{ fontSize: 11, fontWeight: '500', color: C.ink2 }}>{c.label}</Text>
              </View>
            ))}
          </View>
        )}
      </Section>
    </View>
  );
}

// ─── Manuel atama seçici ─────────────────────────────────────────────────────

interface AssignPickerProps {
  visible:    boolean;
  card:       KanbanCard | null;
  labId:      string;
  C:          Palette;
  sx:         Sx;
  onClose:    () => void;
  onAssigned: () => void;
}

function AssignPickerModal({ visible, card, labId, C, sx, onClose, onAssigned }: AssignPickerProps) {
  const mp = sx.mp;
  const [users, setUsers] = useState<{ id: string; full_name: string; workload: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const stage = card?.current_stage ?? 'TRIAGE';

  useEffect(() => {
    if (!visible || !card) return;
    setLoading(true);
    (async () => {
      const { data: skills } = await supabase
        .from('user_stage_skills')
        .select('user_id, profiles!inner(id, full_name, lab_id, is_active)')
        .eq('stage', stage)
        .eq('profiles.lab_id', labId)
        .eq('profiles.is_active', true);
      const ids = ((skills ?? []) as any[]).map(s => s.user_id);
      // İş yükü = teknisyenin üzerindeki aktif aşamalar (order_stages).
      // stage_log ölü (satırlar hiç kapanmıyor) — sayım oradan yapılmaz.
      const { data: workload } = ids.length
        ? await supabase.from('order_stages').select('technician_id').eq('status', 'aktif').in('technician_id', ids)
        : { data: [] };
      const counts = new Map<string, number>();
      for (const r of (workload ?? []) as any[]) counts.set(r.technician_id, (counts.get(r.technician_id) ?? 0) + 1);
      setUsers(((skills ?? []) as any[]).map(s => ({
        id: s.user_id,
        full_name: s.profiles.full_name as string,
        workload: counts.get(s.user_id) ?? 0,
      })).sort((a, b) => a.workload - b.workload));
      setLoading(false);
    })();
  }, [visible, card, stage, labId]);

  async function pick(userId: string) {
    if (!card) return;
    // Faz 5b: yalnız bu kartın temsil ettiği aktif aşamayı ata (paralelde diğer aktif aşamalar etkilenmesin)
    const q = supabase
      .from('order_stages')
      .update({ technician_id: userId, assigned_at: new Date().toISOString() });
    const { error } = card.current_stage_id
      ? await q.eq('id', card.current_stage_id)
      : await q.eq('work_order_id', card.id).eq('status', 'aktif');
    if (error) { toast.error(error.message); return; }
    toast.success('Atandı');
    onAssigned();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={mp.backdrop}>
        <View style={mp.sheet}>
          <View style={mp.handle} />
          <Text style={mp.title}>{STAGE_LABEL[stage]}</Text>
          <Text style={mp.subtitle}>İş yüküne göre sıralı</Text>
          {loading ? (
            <ActivityIndicator color={C.accent} style={{ marginVertical: 30 }} />
          ) : users.length === 0 ? (
            <Text style={mp.empty}>Bu aşama için yetkili kullanıcı yok</Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }}>
              {users.map((u, i) => (
                <TouchableOpacity
                  key={u.id}
                  style={[mp.row, i < users.length - 1 && mp.rowDivider]}
                  onPress={() => pick(u.id)}
                  activeOpacity={0.6}
                >
                  <Text style={mp.name}>{u.full_name}</Text>
                  <Text style={mp.count}>{u.workload} iş</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <TouchableOpacity onPress={onClose} style={mp.close}>
            <Text style={[mp.closeText, { color: C.accent }]}>Kapat</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Ana ekran ───────────────────────────────────────────────────────────────

export function ProductionKanbanScreen() {
  const router      = useRouter();
  // Rota/sipariş linki AKTİF panelde açılmalı — sabit '/(lab)/...' admin veya
  // istasyon panelinden tıklayınca kullanıcıyı lab paneline atıyordu.
  const panelBase = String((useSegments() as string[])?.[0] ?? '(lab)');
  const { profile } = useAuthStore();
  const { width: winWidth } = useWindowDimensions();
  // Ekran shell içinde (sol menü ~280px). Pencere değil GERÇEK konteyner
  // genişliği kullanılmazsa rail+kolon hesabı şişer ve kolonlar rail kenarında
  // kırpılır. onLayout ile ölçülen genişliği kullan (ölçülene dek pencereye düş).
  const [measuredW, setMeasuredW] = useState(0);
  const width = measuredW > 0 ? measuredW : winWidth;
  const isDesktop   = width >= 900;
  const isEmbedded  = useContext(HubContext);

  const C  = usePalette();
  const sx = useMemo(() => makeStyles(C), [C]);
  const s  = sx.s;
  const A  = C.accent;

  const labId = profile?.lab_id ?? profile?.id ?? null;
  const { columns, loading, error, lastSync, refresh } = useKanbanData(labId);
  const [refreshing, setRefreshing] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);  // işlem olmayan istasyonları göster/gizle
  const [busyId, setBusyId]         = useState<string | null>(null);
  const [checklistFor, setChecklistFor] = useState<{ card: KanbanCard; stage: Stage } | null>(null);
  const [assignFor, setAssignFor]   = useState<KanbanCard | null>(null);
  // Filtreler (#1)
  const [search, setSearch]   = useState('');
  const [fAcil, setFAcil]     = useState(false);
  const [fGeciken, setFGeciken] = useState(false);

  const isOverdue = (d: string | null) => { if (!d) return false; const t = new Date(d).getTime(); return Number.isFinite(t) && t < Date.now(); };

  const totalCards  = useMemo(() => columns.reduce((s, c) => s + c.cards.length, 0), [columns]);
  const activeCount = useMemo(
    () => columns.reduce((s, c) => s + c.cards.filter(x => x.stage_status === 'aktif').length, 0),
    [columns],
  );
  const overdueTotal = useMemo(() => columns.reduce((s, c) => s + c.overdue, 0), [columns]);
  const rushTotal = useMemo(() => {
    const seen = new Set<string>(); let n = 0;
    columns.forEach(c => c.cards.forEach(card => { if (card.is_rush && !seen.has(card.id)) { seen.add(card.id); n++; } }));
    return n;
  }, [columns]);

  // Filtre uygulanmış kolonlar (#1) — kart bazlı süz
  const q = search.trim().toLocaleLowerCase('tr-TR');
  const filteredColumns = useMemo(() => columns
    .map(col => ({
      ...col,
      cards: col.cards.filter(c => {
        if (fAcil && !c.is_rush) return false;
        if (fGeciken && !isOverdue(c.delivery_date)) return false;
        if (q) {
          const hay = `${c.order_number ?? ''} ${c.work_type ?? ''} ${c.doctor_name ?? ''} ${c.clinic_name ?? ''} ${c.technician_name ?? ''}`.toLocaleLowerCase('tr-TR');
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    }))
    // İşlem olmayan istasyonları gizle (showEmpty kapalıyken). Atanmamış yalnız doluysa görünür.
    .filter(col => col.isUnassigned ? col.cards.length > 0 : (showEmpty || col.cards.length > 0)),
  [columns, fAcil, fGeciken, q, showEmpty]);
  const filtersActive = fAcil || fGeciken || !!q;

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function onCard(card: KanbanCard) {
    router.push(`/${panelBase}/order/${card.id}` as any);
  }

  async function onContinue(card: KanbanCard) {
    setBusyId(card.id);
    try {
      const stage = card.current_stage;
      const items = STAGE_CHECKLIST[stage] ?? [];
      const required = items.filter(i => i.required !== false);
      if (required.length === 0) {
        router.push(`/${panelBase}/order/${card.id}` as any);
        return;
      }
      const { data: logs } = await supabase
        .from('checklist_log')
        .select('item_key, checked')
        .eq('work_order_id', card.id)
        .eq('stage', stage);
      const checkedKeys = new Set((logs ?? []).filter((r: any) => r.checked).map((r: any) => r.item_key));
      const allDone = required.every(i => checkedKeys.has(i.key));
      if (allDone) {
        router.push(`/${panelBase}/order/${card.id}` as any);
      } else {
        setChecklistFor({ card, stage });
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'Hata');
    } finally {
      setBusyId(null);
    }
  }

  async function onAutoAssign(card: KanbanCard) {
    if (!labId) return;
    setBusyId(card.id);
    try {
      const stage = card.current_stage ?? 'TRIAGE';
      const userId = await autoAssignUser(
        stage, labId,
        (card as any).complexity ?? 'medium',
        (card as any).case_type ?? null,
      );
      if (!userId) { toast.warning('Uygun teknisyen bulunamadı'); return; }
      // Faz 5b: kart belirli bir aktif aşamayı temsil eder → o aşamayı hedefle (paralelde birden çok aktif olabilir)
      const stageId = card.current_stage_id;
      if (stageId) {
        await supabase.from('order_stages')
          .update({ technician_id: userId, assigned_at: new Date().toISOString() })
          .eq('id', stageId);
      } else {
        toast.warning('Aktif aşama yok, detaydan başlat');
      }
      toast.success('Atandı');
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? 'Hata');
    } finally {
      setBusyId(null);
    }
  }

  // Kolonlar boşluğa yayılmaz — geniş ekranda da tavan var, sola yaslı akar.
  const visibleCount = filteredColumns.length || 1;
  // Sağ operasyon şeridi 1440px üstünde açılır; genişliği kolon hesabından düşülür.
  const RAIL_W    = 280;
  // Rail, gerçek içerik genişliği yeterince genişse açılır ve 2-pane düzeninde
  // sayfanın EN SAĞINA pinlenir; board solda kalan alanı doldurur (gerekirse
  // yatay kaydırır). Eşik gerçek konteyner genişliğine göre (onLayout).
  const railOn    = isDesktop && width >= 1180;
  const available = width - PAD * 2 - COL_GAP * Math.max(visibleCount - 1, 0)
                    - (railOn ? RAIL_W + PAD * 2 : 0);
  const fits      = isDesktop && available / visibleCount >= COL_WIDTH;
  const colWidth  = fits ? Math.min(available / visibleCount, COL_MAX) : COL_WIDTH;
  // Kümenin gerçek genişliği — ortalamak için gerekli. `fits` dalında tüm
  // kolonlar tek satıra sığdığı garanti, dolayısıyla toplam basitçe hesaplanır.
  const boardWidth = visibleCount * colWidth + COL_GAP * Math.max(visibleCount - 1, 0)
                     + (railOn ? RAIL_W + COL_GAP : 0);

  const renderColumns = () => filteredColumns.map(c => (
    <ColumnView
      key={c.key}
      column={c}
      colWidth={colWidth}
      C={C}
      sx={sx}
      onCard={onCard}
      onContinue={onContinue}
      onAutoAssign={onAutoAssign}
      onAssign={(card) => setAssignFor(card)}
      busyId={busyId}
    />
  ));

  // Durum şeridi — rakam üstte (DISPLAY), etiket altta (uppercase meta).
  // Sıfır olan sorun sayıları render EDİLMEZ; pano sakin kalır.
  // Atanmamış = operasyonel olarak en kritik kuyruk; boş istasyon = atıl kapasite.
  const unassignedTotal = columns.filter(c => c.isUnassigned).reduce((n, c) => n + c.cards.length, 0);
  const emptyStations   = columns.filter(c => !c.isUnassigned && c.cards.length === 0).length;

  // Sorun sayıları aynı zamanda KONTROL: rakama dokununca ilgili filtre açılır.
  // Eskiden sayıyı görüp aynı bilgiyi taşıyan çipi ayrıca aramak gerekiyordu —
  // kontrol, etkilediği şeyin yanında durmalı.
  type Stat = { key: string; value: number; label: string; color?: string; onPress?: () => void; active?: boolean };
  const stats: Stat[] = [
    { key: 't', value: totalCards,  label: 'İş' },
    { key: 'a', value: activeCount, label: 'Aktif' },
  ];
  if (unassignedTotal > 0) stats.push({ key: 'u', value: unassignedTotal, label: 'Atanmamış', color: WARN });
  if (overdueTotal > 0)    stats.push({ key: 'o', value: overdueTotal,    label: 'Geciken',   color: DANGER,
                                        onPress: () => setFGeciken(v => !v), active: fGeciken });
  if (rushTotal > 0)       stats.push({ key: 'r', value: rushTotal,       label: 'Acil',      color: WARN,
                                        onPress: () => setFAcil(v => !v),   active: fAcil });
  if (emptyStations > 0)   stats.push({ key: 'e', value: emptyStations,   label: 'Boş istasyon',
                                        onPress: () => setShowEmpty(v => !v), active: showEmpty });

  return (
    <SafeAreaView
      style={[s.container]}
      edges={isEmbedded ? ([] as any) : ['top']}
      onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w > 0 && Math.abs(w - measuredW) > 1) setMeasuredW(w); }}
    >
      {/* ── Tek kontrol çubuğu: durum + arama + filtre + yenile ── */}
      {!loading && !error && (
        <View style={s.bar}>
          <View style={s.statWrap}>
            {stats.map(st => {
              const body = (
                <>
                  <Text style={[s.statValue, st.color ? { color: st.color } : null]}>{st.value}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[s.statLabel, st.active ? { color: st.color ?? A } : null]}>{st.label}</Text>
                    {st.active ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: st.color ?? A }} /> : null}
                  </View>
                </>
              );
              return st.onPress ? (
                <TouchableOpacity key={st.key} onPress={st.onPress} activeOpacity={0.6}
                  style={[s.statBlock, s.statBlockTap, st.active && { backgroundColor: hexA(st.color ?? A, 0.10) }]}>
                  {body}
                </TouchableOpacity>
              ) : (
                <View key={st.key} style={s.statBlock}>{body}</View>
              );
            })}
          </View>

          <View style={s.barTools}>
            {/* Son eşitleme METRİK değil DURUM — iş sayılarıyla aynı ağırlıkta
                display rakamı olarak durunca "6. bir KPI" gibi okunuyordu.
                Yenile düğmesinin yanı doğru yeri: neyi tazelediğini söylüyor. */}
            {lastSync && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingEnd: 2 }}>
                <LiveDot color={DS.lab.success} />
                <Text style={{ fontSize: 11.5, fontWeight: '500', color: C.ink3, ...NUM }}>
                  {lastSync.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            )}
            <View style={s.searchBox}>
              <AppIcon name="search" size={14} color={C.ink3} />
              <TextInput
                value={search} onChangeText={setSearch}
                placeholder="Vaka, hasta veya teknisyen ara" placeholderTextColor={C.ink3}
                style={s.searchInput as any}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}><AppIcon name="x" size={14} color={C.ink3} /></TouchableOpacity>
              )}
            </View>
            {/* Acil / Geciken / Boş istasyon çipleri KALDIRILDI — üstteki
                rakamlar zaten aynı sayıyı gösteriyordu ve artık dokunulabilir.
                İki ayrı kontrol yüzeyi aynı şeyi anlatınca pano kalabalık
                görünüyordu; yetenek aynen duruyor, yeri tek. */}
            {filtersActive && (
              <TouchableOpacity onPress={() => { setSearch(''); setFAcil(false); setFGeciken(false); }} style={s.clearBtn} activeOpacity={0.7}>
                <Text style={[s.clearTxt, { color: A }]}>Temizle</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.refreshBtn, { backgroundColor: hexA(A, 0.12) }]} onPress={refresh} activeOpacity={0.7}>
              <AppIcon name="refresh-cw" size={16} color={A} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={s.center}><ActivityIndicator size="large" color={A} /></View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={[s.retryBtn, { backgroundColor: A }]} onPress={refresh}>
            <Text style={s.retryText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : railOn ? (
        // Geniş içerik (≥1180): kolonlar YATAY kaydırılır, sağ operasyon rail'i
        // sabit genişlikte EN SAĞA pinlenir → kolonlar rail'le çakışmaz/kırpılmaz.
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'stretch' }}>
          {/* minWidth:0 KRİTİK — web'de flex çocuğu, taşan yatay-scroll içeriği
              yüzünden min-content'e kadar küçülmüyordu; board sabit kalıp kolonlar
              rail'in arkasına taşıyordu. minWidth:0 → board kalan alanı alır,
              içerik kendi içinde kaydırılır; rail en sağda sabit kalır. */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={Platform.OS === 'web'}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: PAD, gap: COL_GAP, flexDirection: 'row', alignItems: 'flex-start' }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={A} />}
            >
              {renderColumns()}
            </ScrollView>
          </View>
          <ScrollView
            // Genişlik = rail (280) + iki yanda 16px → OpsRail padding'i taşmadan
            // oturur ve SAĞDA 16px sayfa boşluğu (PAGE_PADDING) korunur.
            style={{ width: RAIL_W + PAD * 2, flexGrow: 0, flexShrink: 0, borderStartWidth: 1, borderStartColor: C.hairline }}
            contentContainerStyle={{ paddingHorizontal: PAD, paddingVertical: PAD }}
          >
            <OpsRail columns={filteredColumns} allColumns={columns} C={C} width={RAIL_W} />
          </ScrollView>
        </View>
      ) : fits ? (
        // Rail yok, tüm kolonlar sığıyor → tek satır, ortalanmış (wrap yok).
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: PAD }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={A} />}
        >
          <View style={{
            flexDirection: 'row', gap: COL_GAP, alignItems: 'flex-start',
            alignSelf: 'center', maxWidth: boardWidth, width: '100%',
          }}>
            {renderColumns()}
          </View>
        </ScrollView>
      ) : (
        // Rail yok, sığmıyor → yatay kaydır.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={Platform.OS === 'web'}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: PAD, gap: COL_GAP, flexDirection: 'row', alignItems: 'flex-start' }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={A} />}
        >
          {renderColumns()}
        </ScrollView>
      )}

      {checklistFor && profile && (
        <StageChecklistModal
          visible
          workOrderId={checklistFor.card.id}
          stageId={checklistFor.card.current_stage_id ?? null}
          stage={checklistFor.stage}
          managerId={profile.id}
          onClose={() => setChecklistFor(null)}
          onApproved={() => { setChecklistFor(null); refresh(); }}
        />
      )}

      <AssignPickerModal
        visible={!!assignFor}
        card={assignFor}
        labId={labId ?? ''}
        C={C}
        sx={sx}
        onClose={() => setAssignFor(null)}
        onAssigned={refresh}
      />
    </SafeAreaView>
  );
}
