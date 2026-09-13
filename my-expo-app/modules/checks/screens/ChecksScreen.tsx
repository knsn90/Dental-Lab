import { localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
/**
 * ChecksScreen — Çek / Senet (Patterns Design Language)
 *
 * §10 Hero (glassmorphism), §09 tableCard, §05 cardSolid,
 * §04 CHIP_TONES, §05.5 form, §08 dialog, §03 pill buttons,
 * Lucide icons.
 */
import React, { useState, useContext, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HubContext } from '../../../core/ui/HubContext';
import { MobilePageTitle } from '../../../core/ui/mobile/MobilePageTitle';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, Alert, RefreshControl, Platform, useWindowDimensions,
} from 'react-native';

import { useChecks } from '../hooks/useChecks';
import {
  createCheck, updateCheckStatus, deleteCheck,
  CHECK_STATUS_LABELS, CHECK_STATUS_COLORS,
  type Check, type CheckStatus, type CreateCheckParams,
} from '../api';
import { useClinics } from '../../clinics/hooks/useClinics';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useInkUI } from '../../../core/theme/inkScale';
import { HeroGlow, useHeroSurface } from '../../../core/ui/HeroGlow';
import { confirmAsync } from '../../../core/util/confirm';
import { DatePicker } from '../../../core/ui/DatePicker';
import { groupByCurrency, type CurrencyTotal } from '../../../core/money/aggregations';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import { formatMoney, CURRENCY_META, SUPPORTED_CURRENCIES, type Currency } from '../../../core/money/currency';
import {
  Plus, FileText, Building2, Landmark as BankIcon, Hash,
  Calendar, Clock, CircleCheck, Undo2, Trash2,
  X, Inbox, AlertTriangle, ChevronRight, SlidersHorizontal,
} from '../../../core/ui/icons';

// ── Patterns tokens ─────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// Yüzeyler (kart / tablo / chip tonları) tema-farkında `useInkUI()`'den gelir —
// modül seviyesinde beyaz sabit BIRAKILMAZ (koyu temada hook çağıramaz).

/**
 * Durum rozeti tonları — açık temada eski `CHIP_TONES` değerleriyle BİREBİR
 * aynı; koyu temada yarı saydam zemin + açık metin (CLAUDE.md rozet kuralı).
 */
function useStatusChip(): Record<CheckStatus, { bg: string; fg: string }> {
  const U = useInkUI();
  return {
    beklemede:     U.chipTones.warning,
    tahsil_edildi: U.chipTones.success,
    iade:          U.chipTones.danger,
    iptal:         { bg: U.chipNeutral, fg: U.ink[500] },
  };
}

const modalShadow = '0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)';

// ── Helpers ──────────────────────────────────────────────────────────
// Katı per-currency: çek tutarı KENDİ para biriminde.
function fmtMoney(n: number, currency: string = 'TRY'): string {
  return formatMoney(Number(n) || 0, (currency as Currency), { fractionDigits: 2 });
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' });
}

// Hero quick-stat — per-currency, beyaz metin (renkli hero üstünde okunaklı).
function CcyLinesWhite({ slices }: { slices: CurrencyTotal[] }) {
  if (!slices || slices.length === 0) {
    return <Text style={{ ...DISPLAY, fontSize: 15, letterSpacing: -0.3, lineHeight: 19, color: '#FFFFFF', marginTop: 3 }}>—</Text>;
  }
  return (
    <View style={{ marginTop: 3, gap: 1 }}>
      {slices.map(s => (
        <Text key={s.currency} numberOfLines={1} style={{ ...DISPLAY, fontSize: 15, letterSpacing: -0.3, lineHeight: 19, color: '#FFFFFF' }}>
          {formatMoney(s.total, s.currency, { fractionDigits: 0 })}
        </Text>
      ))}
    </View>
  );
}

const STATUS_FILTERS: { v: CheckStatus | 'all'; l: string }[] = [
  { v: 'all',            l: 'Tümü' },
  { v: 'beklemede',      l: 'Beklemede' },
  { v: 'tahsil_edildi',  l: 'Tahsil Edildi' },
  { v: 'iade',           l: 'İade' },
  { v: 'iptal',          l: 'İptal' },
];

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function ChecksScreen() {
  const theme = usePanelTheme();
  // Koyu tema: nötr yüzeyler + hero lacivert gradyanı (açık tema birebir korunur)
  const U = useInkUI();
  const heroBg = useHeroSurface(theme.primary);
  const statusChip = useStatusChip();
  const isEmbedded = useContext(HubContext);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const [statusFilter, setStatusFilter] = useState<CheckStatus | 'all'>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const [addOpen, setAddOpen] = useState(false);
  const { checks, loading, refetch } = useChecks(statusFilter === 'all' ? undefined : statusFilter);

  const today = new Date().toISOString().slice(0, 10);

  const stats = useMemo(() => {
    const ccyOf = (c: any) => ((c.currency ?? 'TRY') as Currency);
    const byCcy = (list: any[]) => groupByCurrency(list, c => ({ amount: Number(c.amount) || 0, currency: ccyOf(c) }));
    const pending = checks.filter(c => c.status === 'beklemede');
    const overdue = pending.filter(c => c.due_date < today);
    const soon = pending.filter(c => {
      const days = Math.round((new Date(c.due_date).getTime() - Date.now()) / 86400000);
      return days >= 0 && days <= 7;
    });
    // Katı per-currency — asla toplanmaz
    return {
      pendingByCcy: byCcy(pending),
      overdueByCcy: byCcy(overdue),
      soonByCcy: byCcy(soon),
      overdueCount: overdue.length, soonCount: soon.length, pendingCount: pending.length,
    };
  }, [checks, today]);

  const handleStatusChange = async (check: Check, newStatus: CheckStatus) => {
    // Alert.alert web'de no-op → cross-platform confirmAsync
    const ok = await confirmAsync('Durum Güncelle', `"${CHECK_STATUS_LABELS[newStatus]}" ${autoT('olarak işaretlensin mi?')}`, { confirmText: 'Evet' });
    if (!ok) return;
    await updateCheckStatus(check.id, newStatus);
    refetch();
  };

  const handleDelete = async (check: Check) => {
    const ok = await confirmAsync('Çek Sil', 'Bu çek kaydını silmek istediğinize emin misiniz?', { confirmText: 'Sil', destructive: true });
    if (!ok) return;
    await deleteCheck(check.id);
    refetch();
  };

  return (
    <View style={{ flex: 1 }}>
      <MobilePageTitle title="Çek & Senet" subtitle="Tahsilat ve ödeme takibi" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 48, gap: 14 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={U.ink[300]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero — paylaşılan kanonik hero (Personel ekranıyla aynı dil) ──
            Koyu temada zemin `useHeroSurface` ile lacivert gradyana iner
            (#001F3F → #002A5C → #004B87); açık temada panel accent'i korunur.
            Dekoratif daireler `HeroGlow` — koyu temada blur ile yayılır. */}
        <View style={{
          borderRadius: 20, overflow: 'hidden',
          ...heroBg,
          paddingHorizontal: isDesktop ? 22 : 18,
          paddingVertical: isDesktop ? 18 : 16,
          position: 'relative',
        }}>
          <HeroGlow size={130} opacity={0.18} delay={0} style={{ top: -46, end: -34 }} />
          <HeroGlow size={110} opacity={0.10} delay={1400} style={{ bottom: -52, start: -26 }} />

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <View style={{ flexShrink: 1, minWidth: 210 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', marginBottom: 12 }}>
                Bekleyen Çek / Senet
              </Text>
              {/* Katı per-currency: her para birimi ayrı kart, asla toplanmaz */}
              <MoneyMultiX slices={stats.pendingByCcy} variant="cards" size="lg" accentColor={theme.primary} emptyText="—" />
              <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.88)', marginTop: 8 }}>
                {stats.pendingCount} adet beklemede
              </Text>
            </View>

            {/* Birincil kapsül — koyu temada kart yüzeyi DEĞİL, bir kademe koyu
                `plainBtn` zemini (BEYAZ BUTON KURALI). */}
            <Pressable
              onPress={() => setAddOpen(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999,
                backgroundColor: U.plainBtn.bg, cursor: 'pointer' as any,
              }}
            >
              <Plus size={13} color={U.ink[900]} strokeWidth={2.4} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: U.ink[900] }}>Çek Ekle</Text>
            </Pressable>
          </View>

          {/* Hızlı istatistikler — kanonik hero stat tile'ları (para birimi başına). */}
          {(stats.overdueByCcy.length > 0 || stats.soonByCcy.length > 0) && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              {stats.overdueByCcy.length > 0 && (
                <View style={{
                  flex: 1, minWidth: 110,
                  paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12,
                  backgroundColor: 'rgba(255,255,255,0.16)',
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }} numberOfLines={1}>
                    Gecikmiş
                  </Text>
                  <CcyLinesWhite slices={stats.overdueByCcy} />
                  <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)' }}>{stats.overdueCount} adet</Text>
                </View>
              )}
              {stats.soonByCcy.length > 0 && (
                <View style={{
                  flex: 1, minWidth: 110,
                  paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12,
                  backgroundColor: 'rgba(255,255,255,0.16)',
                }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }} numberOfLines={1}>
                    7 gün içinde
                  </Text>
                  <CcyLinesWhite slices={stats.soonByCcy} />
                  <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)' }}>{stats.soonCount} adet</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Filtre butonu ───────────────────────────────────── */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          {(() => {
            const hasFilter = statusFilter !== 'all';
            return (
              <Pressable
                onPress={() => setFilterOpen(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14,
                  backgroundColor: hasFilter ? U.ink[900] : U.plainBtn.bg,
                  borderWidth: hasFilter ? 0 : 1, borderColor: U.plainBtn.border,
                  cursor: 'pointer' as any,
                }}
              >
                <SlidersHorizontal size={14} strokeWidth={1.8} color={hasFilter ? U.onDarkPill : U.plainBtn.fg} />
                <Text style={{ fontSize: 12, fontWeight: hasFilter ? '700' : '600', color: hasFilter ? U.onDarkPill : U.plainBtn.fg }}>
                  Filtre{hasFilter ? ` (1)` : ''}
                </Text>
              </Pressable>
            );
          })()}
        </View>

        {/* ── Filtre Sheet ──────────────────────────────────── */}
        <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
          <Pressable onPress={() => setFilterOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'flex-end', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
            <Pressable onPress={(e) => e.stopPropagation()} style={{
              backgroundColor: U.surface,
              borderTopStartRadius: 24, borderTopEndRadius: 24,
              paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 12,
              maxHeight: '85%',
            }}>
              <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: U.ink[200], marginBottom: 14 }} />
              <View style={{ paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '400', color: U.ink[900], flex: 1 }}>Filtrele</Text>
                <Pressable onPress={() => setStatusFilter('all')} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '400', color: U.ink[500] }}>Temizle</Text>
                </Pressable>
                <Pressable onPress={() => setFilterOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: U.chipNeutral, alignItems: 'center', justifyContent: 'center', marginStart: 4 }}>
                  <X size={16} color={U.ink[700]} strokeWidth={2} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 18 }}>
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '400', letterSpacing: 1, textTransform: 'uppercase', color: U.ink[400], paddingHorizontal: 4 }}>Durum</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {STATUS_FILTERS.map(f => {
                      const active = statusFilter === f.v;
                      return (
                        <Pressable key={f.v} onPress={() => setStatusFilter(f.v)} style={{
                          paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                          borderWidth: active ? 0 : 1, borderColor: U.plainBtn.border,
                          backgroundColor: active ? U.ink[900] : U.plainBtn.bg,
                          cursor: 'pointer' as any,
                        }}>
                          <Text style={{ fontSize: 12.5, fontWeight: active ? '700' : '500', color: active ? U.onDarkPill : U.plainBtn.fg }}>{f.l}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>
              <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
                <Pressable onPress={() => setFilterOpen(false)} style={{
                  height: 48, borderRadius: 14, backgroundColor: U.ink[900],
                  alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer' as any,
                }}>
                  <Text style={{ fontSize: 14, fontWeight: '400', color: U.onDarkPill }}>Uygula</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── Check list ──────────────────────────────────────── */}
        {checks.length === 0 ? (
          <View style={{ ...U.cardSolid, alignItems: 'center', paddingVertical: 48, gap: 10 }}>
            <Inbox size={32} color={U.ink[300]} strokeWidth={1.4} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: U.ink[400] }}>
              Çek / senet kaydı yok
            </Text>
          </View>
        ) : isDesktop ? (
          /* ── Desktop: tableCard §09 ──────────────────────── */
          <View style={U.tableCard}>
            {/* Toolbar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
              <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: U.ink[900] }}>
                Çek / Senet Listesi
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, color: U.ink[400] }}>
                {checks.length} kayıt
              </Text>
            </View>

            {/* Header */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: U.surfaceSoft, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
              {[
                { label: 'TUTAR',     flex: 1.3 },
                { label: 'KLİNİK',    flex: 2 },
                { label: 'BANKA / NO', flex: 1.8 },
                { label: 'DÜZENLEME', flex: 1.2 },
                { label: 'VADE',      flex: 1.2 },
                { label: 'KALAN',     flex: 0.8 },
                { label: 'DURUM',     flex: 1 },
                { label: 'İŞLEM',     flex: 1.5 },
              ].map((h, i) => (
                <Text key={i} style={{ flex: h.flex, fontSize: 10, fontWeight: '400', letterSpacing: 0.7, color: U.ink[500] }}>
                  {h.label}
                </Text>
              ))}
            </View>

            {/* Rows */}
            {checks.map((ck, i) => {
              const sc = statusChip[ck.status];
              const isOverdue = ck.due_date < today && ck.status === 'beklemede';
              const daysLeft = Math.round((new Date(ck.due_date).getTime() - Date.now()) / 86400000);
              return (
                <View key={ck.id} style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 20, paddingVertical: 14,
                  borderBottomWidth: i < checks.length - 1 ? 1 : 0,
                  borderBottomColor: U.hairlineSoft,
                  backgroundColor: isOverdue ? (U.isDark ? 'rgba(217,75,75,0.10)' : 'rgba(217,75,75,0.03)') : 'transparent',
                }}>
                  {/* Amount */}
                  <Text style={{ flex: 1.3, fontSize: 14, fontWeight: '400', color: isOverdue ? U.chipTones.danger.fg : U.ink[900] }}>
                    {fmtMoney(Number(ck.amount), (ck as any).currency ?? 'TRY')}
                  </Text>

                  {/* Clinic */}
                  <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {ck.clinic?.name ? (
                      <>
                        <Building2 size={13} color={U.ink[400]} strokeWidth={1.6} />
                        <Text style={{ fontSize: 13, color: U.ink[800] }} numberOfLines={1}>{ck.clinic.name}</Text>
                      </>
                    ) : (
                      <Text style={{ fontSize: 12, color: U.ink[300] }}>—</Text>
                    )}
                  </View>

                  {/* Bank + number */}
                  <View style={{ flex: 1.8 }}>
                    {ck.bank_name ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <BankIcon size={11} color={U.ink[400]} strokeWidth={1.6} />
                        <Text style={{ fontSize: 12, color: U.ink[700] }} numberOfLines={1}>
                          {ck.bank_name}{ck.check_number ? ` · ${ck.check_number}` : ''}
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 12, color: U.ink[300] }}>—</Text>
                    )}
                  </View>

                  {/* Issue date */}
                  <Text style={{ flex: 1.2, fontSize: 12, color: U.ink[500] }}>
                    {fmtDate(ck.issue_date)}
                  </Text>

                  {/* Due date */}
                  <Text style={{ flex: 1.2, fontSize: 12, fontWeight: isOverdue ? '600' : '500', color: isOverdue ? U.chipTones.danger.fg : U.ink[800] }}>
                    {fmtDate(ck.due_date)}
                  </Text>

                  {/* Days left */}
                  <View style={{ flex: 0.8 }}>
                    {ck.status === 'beklemede' && (
                      <Text style={{ fontSize: 11, fontWeight: '400', color: isOverdue ? U.chipTones.danger.fg : daysLeft <= 7 ? U.chipTones.warning.fg : U.ink[500] }}>
                        {isOverdue ? `${Math.abs(daysLeft)}g gecikti` : `${daysLeft}g`}
                      </Text>
                    )}
                  </View>

                  {/* Status */}
                  <View style={{ flex: 1 }}>
                    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: sc.bg }}>
                      <Text style={{ fontSize: 10, fontWeight: '400', color: sc.fg }}>
                        {CHECK_STATUS_LABELS[ck.status]}
                      </Text>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={{ flex: 1.5, flexDirection: 'row', gap: 4 }}>
                    {ck.status === 'beklemede' && (
                      <>
                        <Pressable
                          onPress={() => handleStatusChange(ck, 'tahsil_edildi')}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: U.chipTones.success.bg, cursor: 'pointer' as any }}
                        >
                          <CircleCheck size={11} color={U.chipTones.success.fg} strokeWidth={2} />
                          <Text style={{ fontSize: 10, fontWeight: '400', color: U.chipTones.success.fg }}>Tahsil</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleStatusChange(ck, 'iade')}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: U.chipTones.warning.bg, cursor: 'pointer' as any }}
                        >
                          <Undo2 size={11} color={U.chipTones.warning.fg} strokeWidth={2} />
                          <Text style={{ fontSize: 10, fontWeight: '400', color: U.chipTones.warning.fg }}>İade</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDelete(ck)}
                          style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipTones.danger.bg, cursor: 'pointer' as any }}
                        >
                          <Trash2 size={11} color={U.chipTones.danger.fg} strokeWidth={2} />
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              );
            })}

            {/* Footer */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: U.hairline, backgroundColor: U.surfaceSoft, gap: 10 }}>
              <Text style={{ fontSize: 11, color: U.ink[500] }}>{checks.length} kayıt</Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, fontWeight: '400', color: U.ink[900] }}>Bekleyen:</Text>
              <MoneyMultiX slices={stats.pendingByCcy} variant="inline" />
            </View>
          </View>
        ) : (
          /* ── Mobile: cardSolid §05 ──────────────────────────── */
          <View style={{ gap: 10 }}>
            {checks.map(ck => {
              const sc = statusChip[ck.status];
              const isOverdue = ck.due_date < today && ck.status === 'beklemede';
              const daysLeft = Math.round((new Date(ck.due_date).getTime() - Date.now()) / 86400000);

              return (
                <View key={ck.id} style={{
                  ...U.cardSolid, gap: 12,
                  ...(isOverdue
                    ? { borderWidth: 1, borderColor: 'rgba(217,75,75,0.2)' }
                    : {}),
                }}>
                  {/* Top */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{
                      width: 40, height: 40, borderRadius: 12,
                      backgroundColor: isOverdue ? U.chipTones.danger.bg : U.chipTones.warning.bg,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <FileText size={18} color={isOverdue ? U.chipTones.danger.fg : U.chipTones.warning.fg} strokeWidth={1.6} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color: isOverdue ? U.chipTones.danger.fg : U.ink[900] }}>
                          {fmtMoney(Number(ck.amount), (ck as any).currency ?? 'TRY')}
                        </Text>
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: sc.bg }}>
                          <Text style={{ fontSize: 10, fontWeight: '400', color: sc.fg }}>{CHECK_STATUS_LABELS[ck.status]}</Text>
                        </View>
                      </View>
                      {ck.clinic?.name && (
                        <Text style={{ fontSize: 12, color: U.ink[500], marginTop: 2 }}>{ck.clinic.name}</Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 12, fontWeight: '400', color: isOverdue ? U.chipTones.danger.fg : U.ink[800] }}>
                        {fmtDate(ck.due_date)}
                      </Text>
                      {ck.status === 'beklemede' && (
                        <Text style={{ fontSize: 10, color: isOverdue ? U.chipTones.danger.fg : U.chipTones.warning.fg, marginTop: 1 }}>
                          {isOverdue ? `${Math.abs(daysLeft)}g gecikti` : `${daysLeft}g kaldı`}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Bank info */}
                  {ck.bank_name && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <BankIcon size={12} color={U.ink[400]} strokeWidth={1.6} />
                      <Text style={{ fontSize: 11, color: U.ink[500] }}>
                        {ck.bank_name}{ck.check_number ? ` · No: ${ck.check_number}` : ''}
                      </Text>
                    </View>
                  )}

                  {/* Actions */}
                  {ck.status === 'beklemede' && (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <Pressable
                        onPress={() => handleStatusChange(ck, 'tahsil_edildi')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: U.chipTones.success.bg, cursor: 'pointer' as any }}
                      >
                        <CircleCheck size={13} color={U.chipTones.success.fg} strokeWidth={2} />
                        <Text style={{ fontSize: 11, fontWeight: '400', color: U.chipTones.success.fg }}>Tahsil Edildi</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleStatusChange(ck, 'iade')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: U.chipTones.warning.bg, cursor: 'pointer' as any }}
                      >
                        <Undo2 size={13} color={U.chipTones.warning.fg} strokeWidth={2} />
                        <Text style={{ fontSize: 11, fontWeight: '400', color: U.chipTones.warning.fg }}>İade</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleDelete(ck)}
                        style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipTones.danger.bg, cursor: 'pointer' as any }}
                      >
                        <Trash2 size={13} color={U.chipTones.danger.fg} strokeWidth={2} />
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Add modal — §08 dialog ────────────────────────── */}
      <CheckFormModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => { setAddOpen(false); refetch(); }}
      />
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
// FORM MODAL — §08 dialog + §05.5 form
// ═════════════════════════════════════════════════════════════════════
function CheckFormModal({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const U = useInkUI();
  const { clinics } = useClinics();
  const [clinicId, setClinicId] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (visible) {
      setClinicId(''); setCheckNumber(''); setBankName('');
      setAmount(''); setCurrency('TRY'); setDueDate(''); setNotes(''); setError('');
      setIssueDate(new Date().toISOString().slice(0, 10));
    }
  }, [visible]);

  const handleSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0) { setError('Geçerli tutar girin.'); return; }
    if (!dueDate)         { setError('Vade tarihi zorunludur.'); return; }

    setSaving(true);
    const params: CreateCheckParams = {
      clinic_id: clinicId || null, check_number: checkNumber || undefined,
      bank_name: bankName || undefined, amount: amt, currency,
      issue_date: issueDate, due_date: dueDate, notes: notes || undefined,
    };
    const { error: apiErr } = await createCheck(params);
    setSaving(false);
    if (apiErr) { setError((apiErr as any).message ?? 'Hata oluştu.'); return; }
    onSaved();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'center', alignItems: 'center', padding: 24, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
        <View style={{ backgroundColor: U.surface, borderRadius: 24, width: '100%', maxWidth: 520, maxHeight: '90%', overflow: 'hidden', borderWidth: 1, borderColor: U.hairline, boxShadow: U.isDark ? '0 8px 40px rgba(0,0,0,0.6)' : modalShadow } as any}>

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 16 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: U.ink[900] }}>
              Çek / Senet Ekle
            </Text>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: U.chipNeutral, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} color={U.ink[500]} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 16, paddingHorizontal: 24, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
            {/* Clinic picker */}
            <View style={{ gap: 6 }}>
              <FL>Klinik (opsiyonel)</FL>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pressable
                    onPress={() => setClinicId('')}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                      borderWidth: 1.5,
                      borderColor: !clinicId ? U.ink[900] : U.plainBtn.border,
                      backgroundColor: !clinicId ? U.ink[50] : U.plainBtn.bg,
                      cursor: 'pointer' as any,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: !clinicId ? '600' : '500', color: !clinicId ? U.ink[900] : U.ink[500] }}>Seçilmedi</Text>
                  </Pressable>
                  {clinics.map(cl => (
                    <Pressable
                      key={cl.id}
                      onPress={() => setClinicId(cl.id)}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                        borderWidth: 1.5,
                        borderColor: clinicId === cl.id ? U.ink[900] : U.plainBtn.border,
                        backgroundColor: clinicId === cl.id ? U.ink[50] : U.plainBtn.bg,
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: clinicId === cl.id ? '600' : '500', color: clinicId === cl.id ? U.ink[900] : U.ink[500] }} numberOfLines={1}>{cl.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Para birimi — çek KENDİ para biriminde tutulur (katı per-currency) */}
            <View style={{ gap: 6 }}>
              <FL>Para Birimi</FL>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {SUPPORTED_CURRENCIES.map(cur => {
                  const active = currency === cur;
                  return (
                    <Pressable
                      key={cur}
                      onPress={() => setCurrency(cur)}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5,
                        borderColor: active ? U.ink[900] : U.plainBtn.border,
                        backgroundColor: active ? U.ink[900] : U.plainBtn.bg,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? U.onDarkPill : U.ink[500] }}>{CURRENCY_META[cur].symbol}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: active ? U.onDarkPill : U.plainBtn.fg }}>{cur}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Amount + Due */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <FL>{`Tutar (${CURRENCY_META[currency].symbol})`}</FL>
                <FI value={amount} onChangeText={setAmount} placeholder="0,00"
                  keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'} />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <FL>Vade Tarihi</FL>
                <DatePicker value={dueDate} onChange={setDueDate} placeholder="Tarih seç" />
              </View>
            </View>

            {/* Bank + Number */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <FL>Banka</FL>
                <FI value={bankName} onChangeText={setBankName} placeholder="Banka adı..." />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <FL>Çek No</FL>
                <FI value={checkNumber} onChangeText={setCheckNumber} placeholder="Çek numarası..." />
              </View>
            </View>

            {/* Issue date */}
            <View style={{ gap: 6 }}>
              <FL>Düzenleme Tarihi</FL>
              <DatePicker value={issueDate} onChange={setIssueDate} placeholder="Tarih seç" />
            </View>

            {/* Notes */}
            <View style={{ gap: 6 }}>
              <FL>Not (opsiyonel)</FL>
              <FI value={notes} onChangeText={setNotes} placeholder="..." multiline
                style={{ minHeight: 48, textAlignVertical: 'top' as any }} />
            </View>

            {error ? <Text style={{ fontSize: 12, color: U.chipTones.danger.fg }}>{error}</Text> : null}
          </ScrollView>

          {/* Footer — §08 ghost + dark pill right-aligned */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 20, borderTopWidth: 1, borderTopColor: U.hairline }}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999, cursor: 'pointer' as any }}
            >
              <Text style={{ fontSize: 13, fontWeight: '400', color: U.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{
                paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999,
                backgroundColor: U.ink[900], opacity: saving ? 0.5 : 1,
                cursor: 'pointer' as any,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '400', color: U.onDarkPill }}>
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Form helpers ────────────────────────────────────────────────────
function FL({ children }: { children: string }) {
  const U = useInkUI();
  return (
    <Text style={{ fontSize: 10, fontWeight: '400', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[400] }}>
      {children}
    </Text>
  );
}

function FI(props: any) {
  const U = useInkUI();
  const { style: extra, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={U.ink[300]}
      {...rest}
      style={[{
        height: 44, paddingHorizontal: 14, borderRadius: 14,
        borderWidth: 1, borderColor: U.fieldBorder, backgroundColor: U.isDark ? '#141312' : '#FFF',
        fontSize: 14, color: U.ink[900], outline: 'none' as any,
      }, extra]}
    />
  );
}

export default ChecksScreen;
