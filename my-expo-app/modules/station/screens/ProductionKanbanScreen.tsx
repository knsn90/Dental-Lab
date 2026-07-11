// modules/station/screens/ProductionKanbanScreen.tsx
// Üretim Panosu — Apple Reminders tarzı liste/sütun.
//
// Stil dili:
//   • Page bg: iOS systemGroupedBackground (#F2F2F7)
//   • Column = rounded white container (radius 18), kart yığını yok
//   • Item = inline row, hairline ayraçlarla bölünür
//   • Pastel filled circle = stage indicator (left)
//   • Late = soft red dot + subtle red title
//   • iOS-style filled pill button (Continue)

import React, { useEffect, useMemo, useState, useContext } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, useWindowDimensions, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useAuthStore } from '../../../core/store/authStore';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
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

// ─── iOS palette ─────────────────────────────────────────────────────────────
const iOS = {
  bg:       '#F2F2F7',         // systemGroupedBackground
  card:     '#FFFFFF',         // secondarySystemGroupedBackground
  hairline: '#E5E5EA',         // separator
  text:     '#1C1C1E',         // label
  text2:    '#3C3C43',         // secondaryLabel
  text3:    '#8E8E93',         // tertiaryLabel
  text4:    '#C7C7CC',         // quaternaryLabel
  blue:     '#007AFF',
  red:      '#FF3B30',
  orange:   '#FF9500',
  green:    '#34C759',
  purple:   '#AF52DE',
};

const COL_WIDTH = 300;
const COL_GAP   = 16;
const PAD       = 16;

// Tasarım dili — display font + ortak status renkleri
const DISPLAY = Platform.select({ web: 'Inter Tight, Inter, sans-serif', default: 'InterTight_300Light' }) as string;
const DANGER = '#D94B4B';
const WARN   = '#E89B2A';
function hexA(hex: string, a: number) {
  try { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})`; } catch { return hex; }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deliveryText(d: string): string {
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(d + 'T00:00:00');
  const diff  = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0)  return `${Math.abs(diff)}g geçti`;
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Yarın';
  if (diff <= 6)  return `${diff} gün`;
  return due.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

// ─── Item Row (Reminders task row) ───────────────────────────────────────────

interface ItemProps {
  card:        KanbanCard;
  isLast:      boolean;
  isUnassigned?: boolean;
  busy?:       boolean;
  accent:      string;
  accentDeep:  string;
  onOpen:      () => void;
  onContinue:  () => void;
  onAutoAssign?: () => void;
  onAssign?:   () => void;
}

function ItemRow({
  card, isLast, isUnassigned, busy, accent, accentDeep,
  onOpen, onContinue, onAutoAssign, onAssign,
}: ItemProps) {
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

  return (
    <View style={[r.row, !isLast && r.rowDivider]}>
      {/* Left: filled circle (stage indicator) */}
      <TouchableOpacity onPress={onOpen} activeOpacity={0.7} style={r.indicatorWrap}>
        <View style={[r.indicator, { backgroundColor: stageColor }]} />
      </TouchableOpacity>

      {/* Body */}
      <TouchableOpacity onPress={onOpen} activeOpacity={0.7} style={r.body}>
        <View style={r.titleRow}>
          <Text style={[r.title, isLate && { color: iOS.red }]} numberOfLines={1}>
            {workTypeLabel}
          </Text>
          {isLate && (
            <Text style={[r.lateText, { color: DANGER }]}>+{humanIdle(idleMs)}</Text>
          )}
          {card.parallel_group != null && (
            <View style={r.parallelBadge}>
              <Text style={r.parallelBadgeText}>‖ PARALEL</Text>
            </View>
          )}
        </View>
        <Text style={r.meta} numberOfLines={1}>
          <Text style={r.metaStrong}>#{card.order_number}</Text>
          {card.doctor_name ? `  ·  ${card.doctor_name}` : ''}
          {card.technician_name ? `  ·  ${card.technician_name}` : '  ·  Atanmadı'}
          {`  ·  ${deliveryText(card.delivery_date)}`}
        </Text>
      </TouchableOpacity>

      {/* Action */}
      <View style={r.actionWrap}>
        {isUnassigned ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              onPress={onAutoAssign}
              disabled={busy}
              activeOpacity={0.75}
              style={[r.pill, { backgroundColor: accent }, busy && { opacity: 0.5 }]}
            >
              <Text style={[r.pillFilledText, { color: '#FFFFFF' }]}>Otomatik</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onAssign}
              activeOpacity={0.75}
              style={[r.pill, { backgroundColor: hexA(accent, 0.12) }]}
            >
              <Text style={[r.pillTintedText, { color: accentDeep }]}>Manuel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={onContinue}
            disabled={busy}
            activeOpacity={0.75}
            style={[r.pill, { backgroundColor: hexA(accent, 0.12) }, busy && { opacity: 0.5 }]}
          >
            <Text style={[r.pillTintedText, { color: accentDeep }]}>Devam ›</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Column (Reminders list container) ───────────────────────────────────────

interface ColumnProps {
  column:    KanbanColumn;
  colWidth:  number;
  isWide:    boolean;
  accent:    string;
  accentDeep: string;
  onCard:    (c: KanbanCard) => void;
  onContinue:(c: KanbanCard) => void;
  onAutoAssign:(c: KanbanCard) => void;
  onAssign:  (c: KanbanCard) => void;
  busyId:    string | null;
}

function ColumnView({
  column, colWidth, isWide, accent, accentDeep,
  onCard, onContinue, onAutoAssign, onAssign, busyId,
}: ColumnProps) {
  const isUnassigned = column.isUnassigned;
  const headerColor  = column.color;
  const workloadLine = column.workload.slice(0, 2).map(w => `${w.name} ${w.count}`).join(' · ');
  // Operasyonel zeka (#2): WIP/darboğaz eşiği + geciken
  const WIP = 6;
  const bottleneck = !isUnassigned && column.cards.length >= WIP;

  return (
    <View style={[col.wrap, isWide ? { flex: 1 } : { width: colWidth }, bottleneck && { borderWidth: 1, borderColor: hexA(DANGER, 0.35), borderRadius: 16 }]}>
      {/* Section header (Reminders style: small caps gray) */}
      <View style={col.headerOuter}>
        <View style={col.headerRow}>
          <View style={[col.dot, { backgroundColor: headerColor }]} />
          <Text style={col.title} numberOfLines={1}>{column.label}</Text>
          <Text style={col.count}>{column.cards.length}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 18, marginTop: 2, flexWrap: 'wrap' }}>
          {workloadLine && !isUnassigned ? <Text style={[col.subtitle, { marginLeft: 0 }]}>{workloadLine}</Text> : null}
          {column.overdue > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: hexA(DANGER, 0.12) }}>
              <AppIcon name="alert-triangle" size={9} color={DANGER} />
              <Text style={{ fontSize: 9.5, fontWeight: '700', color: DANGER }}>{column.overdue} geciken</Text>
            </View>
          ) : null}
          {bottleneck ? (
            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: hexA(WARN, 0.16) }}>
              <Text style={{ fontSize: 9.5, fontWeight: '800', color: WARN, letterSpacing: 0.3 }}>DARBOĞAZ</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Items list (rounded white container) */}
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
              accent={accent}
              accentDeep={accentDeep}
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

// ─── Manual Assign picker (iOS sheet feel) ───────────────────────────────────

interface AssignPickerProps {
  visible:    boolean;
  card:       KanbanCard | null;
  labId:      string;
  accent:     string;
  onClose:    () => void;
  onAssigned: () => void;
}

function AssignPickerModal({ visible, card, labId, accent, onClose, onAssigned }: AssignPickerProps) {
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
            <ActivityIndicator color={accent} style={{ marginVertical: 30 }} />
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
            <Text style={[mp.closeText, { color: accent }]}>Kapat</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.kpi}>
      <Text style={[s.kpiVal, { color }]}>{value}</Text>
      <Text style={s.kpiLbl}>{label}</Text>
    </View>
  );
}
function FilterChip({ label, active, onPress, color }: { label: string; active: boolean; onPress: () => void; color: string }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[s.fchip, active && { backgroundColor: color, borderColor: color }]}>
      <Text style={[s.fchipTxt, active && { color: '#FFFFFF' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ProductionKanbanScreen() {
  const router      = useRouter();
  const { profile } = useAuthStore();
  const { width }   = useWindowDimensions();
  const isDesktop   = width >= 900;
  const isEmbedded  = useContext(HubContext);

  const theme = usePanelTheme();
  const T = useMobileTokens();
  const A = theme.primary, AD = theme.primaryDeep, PAGE = (T as any).bg ?? iOS.bg;

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
  const hiddenEmptyCount = useMemo(() => columns.filter(c => !c.isUnassigned && c.cards.length === 0).length, [columns]);

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function onCard(card: KanbanCard) {
    router.push(`/(lab)/order/${card.id}` as any);
  }

  async function onContinue(card: KanbanCard) {
    setBusyId(card.id);
    try {
      const stage = card.current_stage;
      const items = STAGE_CHECKLIST[stage] ?? [];
      const required = items.filter(i => i.required !== false);
      if (required.length === 0) {
        router.push(`/(lab)/order/${card.id}` as any);
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
        router.push(`/(lab)/order/${card.id}` as any);
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

  const visibleCount = filteredColumns.length || 1;
  const available = width - PAD * 2 - COL_GAP * Math.max(visibleCount - 1, 0);
  const isWide    = isDesktop && visibleCount > 0 && available / visibleCount >= COL_WIDTH;
  const colWidth  = isWide ? available / visibleCount : COL_WIDTH;

  const renderColumns = () => filteredColumns.map(c => (
    <ColumnView
      key={c.key}
      column={c}
      colWidth={colWidth}
      isWide={isWide}
      accent={A}
      accentDeep={AD}
      onCard={onCard}
      onContinue={onContinue}
      onAutoAssign={onAutoAssign}
      onAssign={(card) => setAssignFor(card)}
      busyId={busyId}
    />
  ));

  return (
    <SafeAreaView style={[s.container, { backgroundColor: PAGE }]} edges={isEmbedded ? ([] as any) : ['top']}>
      <View style={s.header}>
        <View>
          {/* Başlık shell üst barında (PatternsShell) gösteriliyor — burada tekrar etme */}
          <Text style={s.subtitle}>
            {totalCards} iş · {activeCount} aktif
            {lastSync && (
              <Text style={s.syncTime}>
                {'  ·  '}{lastSync.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </Text>
        </View>
        <TouchableOpacity style={[s.refreshBtn, { backgroundColor: hexA(A, 0.12) }]} onPress={refresh} activeOpacity={0.7}>
          <AppIcon name="refresh-cw" size={17} color={A} />
        </TouchableOpacity>
      </View>

      {/* ── Araç çubuğu: KPI + filtre + arama (#1) ── */}
      {!loading && !error && (
        <View style={s.toolbar}>
          <View style={s.kpiRow}>
            <Kpi label="Toplam" value={totalCards} color={iOS.text2} />
            <Kpi label="Aktif" value={activeCount} color={A} />
            <Kpi label="Geciken" value={overdueTotal} color={overdueTotal > 0 ? DANGER : iOS.text3} />
            <Kpi label="Acil" value={rushTotal} color={rushTotal > 0 ? WARN : iOS.text3} />
          </View>
          <View style={s.filterRow}>
            <View style={s.searchBox}>
              <AppIcon name="search" size={14} color={iOS.text3} />
              <TextInput
                value={search} onChangeText={setSearch}
                placeholder="Vaka no, hasta, hekim, teknisyen…" placeholderTextColor={iOS.text3}
                style={s.searchInput as any}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}><AppIcon name="x" size={14} color={iOS.text3} /></TouchableOpacity>
              )}
            </View>
            <FilterChip label="Acil" active={fAcil} onPress={() => setFAcil(v => !v)} color={WARN} />
            <FilterChip label="Geciken" active={fGeciken} onPress={() => setFGeciken(v => !v)} color={DANGER} />
            {hiddenEmptyCount > 0 && (
              <FilterChip label={showEmpty ? 'Boşları gizle' : `Boş istasyonlar (${hiddenEmptyCount})`} active={showEmpty} onPress={() => setShowEmpty(v => !v)} color={A} />
            )}
            {filtersActive && (
              <TouchableOpacity onPress={() => { setSearch(''); setFAcil(false); setFGeciken(false); }} style={s.clearBtn} activeOpacity={0.7}>
                <Text style={[s.clearTxt, { color: A }]}>Temizle</Text>
              </TouchableOpacity>
            )}
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
      ) : isWide ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: PAD }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={A} />}
        >
          <View style={{ flexDirection: 'row', gap: COL_GAP, alignItems: 'flex-start' }}>
            {renderColumns()}
          </View>
        </ScrollView>
      ) : (
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
        accent={A}
        onClose={() => setAssignFor(null)}
        onAssigned={refresh}
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: iOS.bg },

  // Araç çubuğu (KPI + filtre + arama)
  toolbar: { paddingHorizontal: PAD, paddingBottom: 10, gap: 10 },
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: iOS.card, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 8, alignItems: 'center' },
  kpiVal: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  kpiLbl: { fontSize: 10.5, color: iOS.text3, fontWeight: '600', marginTop: 1 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: iOS.card, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, flexGrow: 1, flexBasis: 220, minWidth: 150 },
  searchInput: { flex: 1, fontSize: 13, color: iOS.text, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) },
  fchip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', backgroundColor: iOS.card },
  fchipTxt: { fontSize: 12.5, fontWeight: '700', color: iOS.text2 },
  clearBtn: { paddingHorizontal: 10, paddingVertical: 7 },
  clearTxt: { fontSize: 12.5, fontWeight: '600', color: iOS.blue },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: PAD, paddingTop: 68, paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  title:    { fontSize: 32, fontWeight: '800', color: iOS.text, letterSpacing: -0.8 },
  subtitle: { fontSize: 14, color: iOS.text3, marginTop: 4, fontWeight: '500' },
  syncTime: { color: iOS.text4 },

  refreshBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,122,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 14, color: iOS.text3 },
  retryBtn:  { paddingHorizontal: 18, paddingVertical: 10, backgroundColor: iOS.blue, borderRadius: 999 },
  retryText: { color: '#FFFFFF', fontWeight: '700' },
});

const col = StyleSheet.create({
  wrap: { gap: 8 },

  // Section header (outside the white container — Reminders pattern)
  headerOuter: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 4, gap: 2 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot:         { width: 10, height: 10, borderRadius: 5 },
  title:       { flex: 1, fontSize: 15, fontWeight: '700', color: iOS.text, letterSpacing: -0.2 },
  count:       { fontSize: 13, fontWeight: '700', color: iOS.text3 },
  subtitle:    { fontSize: 12, color: iOS.text3, marginLeft: 18, fontWeight: '500' },

  // Rounded white list container
  list: {
    backgroundColor: iOS.card,
    borderRadius: 14,
    overflow: 'hidden',
  },
  empty: {
    fontSize: 14, color: iOS.text4,
    textAlign: 'center', paddingVertical: 26,
    fontWeight: '500',
  },
});

const r = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: iOS.hairline,
  },

  indicatorWrap: { paddingVertical: 4 },
  indicator: {
    width: 12, height: 12, borderRadius: 6,
  },

  body: { flex: 1, gap: 2, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: iOS.text,
    letterSpacing: -0.2,
  },
  lateText: { fontSize: 12, fontWeight: '700', color: iOS.red, letterSpacing: 0.2 },
  parallelBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: 'rgba(59,130,246,0.12)' },
  parallelBadgeText: { fontSize: 8.5, fontWeight: '800', color: '#1E5FBF', letterSpacing: 0.4 },

  meta: { fontSize: 12, color: iOS.text3, fontWeight: '500' },
  metaStrong: { color: iOS.text2, fontWeight: '700' },

  actionWrap: { flexShrink: 0 },

  // iOS pill buttons
  pill: {
    paddingHorizontal: 14, height: 30,
    borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  pillFilled: { backgroundColor: iOS.blue },
  pillFilledText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.1 },

  pillTinted: { backgroundColor: 'rgba(0,122,255,0.12)' },
  pillTintedText: { fontSize: 13, fontWeight: '700', color: iOS.blue, letterSpacing: -0.1 },
});

const mp = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.40)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%', maxWidth: 420,
    backgroundColor: iOS.card,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 8, paddingBottom: 24, paddingHorizontal: 16,
    gap: 8,
  },
  handle: {
    width: 36, height: 5, borderRadius: 2.5,
    backgroundColor: iOS.text4, alignSelf: 'center', marginBottom: 8,
  },
  title:    { fontSize: 17, fontWeight: '700', color: iOS.text, paddingHorizontal: 4 },
  subtitle: { fontSize: 13, color: iOS.text3, paddingHorizontal: 4, marginBottom: 6 },
  empty:    { fontSize: 14, color: iOS.text3, textAlign: 'center', paddingVertical: 24 },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: iOS.card,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: iOS.hairline },
  name:  { fontSize: 15, fontWeight: '600', color: iOS.text },
  count: { fontSize: 13, color: iOS.text3, fontWeight: '600' },

  close: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, marginTop: 8,
    backgroundColor: iOS.bg, borderRadius: 14,
  },
  closeText: { fontSize: 15, fontWeight: '700', color: iOS.blue },
});
