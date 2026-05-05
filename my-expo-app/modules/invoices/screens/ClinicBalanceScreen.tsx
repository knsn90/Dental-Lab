/**
 * ClinicBalanceScreen — Cari Hesap (Patterns Design Language)
 *
 * §10 Hero (glassmorphism), §09 tableCard, §05 cardSolid,
 * §04 CHIP_TONES, §05.5 search input, Lucide icons.
 *
 * Klinik satırına tıklayınca /statement/[clinicId] sayfasına yönlendirir.
 */
import React, { useContext, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, RefreshControl,
  TextInput, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Search, X, Building2, AlertTriangle,
  Clock, Inbox, ChevronRight, FileText,
} from 'lucide-react-native';

import { useClinicBalances } from '../hooks/useInvoices';
import { DS } from '../../../core/theme/dsTokens';
import { HubContext } from '../../../core/ui/HubContext';

// ── Patterns tokens ─────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const cardSolid = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  padding: 22,
  // @ts-ignore web
  boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)',
};

const tableCard = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
  overflow: 'hidden' as const,
};

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
};

// ── Helpers ──────────────────────────────────────────────────────────
function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDateShort(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function ClinicBalanceScreen() {
  const router = useRouter();
  const isEmbedded = useContext(HubContext);
  const { balances, loading, refetch } = useClinicBalances();
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const filtered = useMemo(() => {
    return balances.filter(b => {
      if (overdueOnly && Number(b.overdue_amount) <= 0) return false;
      if (search) {
        return b.clinic_name.toLowerCase().includes(search.toLowerCase());
      }
      return true;
    });
  }, [balances, search, overdueOnly]);

  const totals = useMemo(() => {
    return balances.reduce((acc, b) => ({
      billed:  acc.billed  + Number(b.total_billed),
      paid:    acc.paid    + Number(b.total_paid),
      balance: acc.balance + Number(b.balance),
      overdue: acc.overdue + Number(b.overdue_amount),
      current: acc.current + Number(b.aging_current ?? 0),
      d30:     acc.d30     + Number(b.aging_30 ?? 0),
      d60:     acc.d60     + Number(b.aging_60 ?? 0),
      d90:     acc.d90     + Number(b.aging_90 ?? 0),
    }), { billed: 0, paid: 0, balance: 0, overdue: 0, current: 0, d30: 0, d60: 0, d90: 0 });
  }, [balances]);

  const hasAging = totals.current + totals.d30 + totals.d60 + totals.d90 > 0;

  const openStatement = (clinicId: string) => {
    router.push(`/statement/${clinicId}` as any);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* ── Standalone header ─────────────────────────────────── */}
      {!isEmbedded && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
            <ArrowLeft size={18} color={DS.ink[900]} strokeWidth={1.8} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Cari Hesap</Text>
            <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2 }}>Klinik bazlı bakiye özeti</Text>
          </View>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: isDesktop ? 0 : 16, paddingBottom: 48, gap: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={DS.ink[300]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero — §10 glassmorphism (cream) ──────────────────── */}
        <View style={{
          borderRadius: 28, overflow: 'hidden',
          backgroundColor: DS.lab.bg,
          padding: isDesktop ? 36 : 24,
          position: 'relative',
        }}>
          <View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: DS.lab.bgDeep, opacity: 0.6 }} />
          <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: DS.lab.bgDeep, opacity: 0.4 }} />

          <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 12 }}>
            Toplam Alacak
          </Text>
          <Text style={{ ...DISPLAY, fontSize: isDesktop ? 48 : 36, letterSpacing: -1.4, color: DS.ink[900] }}>
            {fmtMoney(totals.balance)}
          </Text>

          <View style={{ flexDirection: 'row', gap: isDesktop ? 40 : 24, marginTop: 20, flexWrap: 'wrap' }}>
            <HeroStat label="Kesilen" value={fmtMoney(totals.billed)} color={DS.ink[700]} />
            <HeroStat label="Tahsil Edilen" value={fmtMoney(totals.paid)} color={CHIP_TONES.success.fg} />
            <HeroStat label="Vadesi Geçen" value={fmtMoney(totals.overdue)} color={CHIP_TONES.danger.fg} />
          </View>

          {hasAging && (
            <View style={{ marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', gap: 8 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400] }}>Yaşlandırma</Text>
              <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.06)' }}>
                {[
                  { v: totals.current, color: '#2D9A6B' },
                  { v: totals.d30,     color: '#E89B2A' },
                  { v: totals.d60,     color: '#F97316' },
                  { v: totals.d90,     color: '#D94B4B' },
                ].map((seg, i) => {
                  const total = totals.current + totals.d30 + totals.d60 + totals.d90;
                  const w = total > 0 ? (seg.v / total) * 100 : 0;
                  if (w === 0) return null;
                  return <View key={i} style={{ width: `${w}%` as any, height: 6, backgroundColor: seg.color }} />;
                })}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 2 }}>
                {totals.current > 0 && <AgingLegend label="Vadesi var" value={totals.current} color="#2D9A6B" />}
                {totals.d30 > 0 && <AgingLegend label="1–30 gün" value={totals.d30} color="#E89B2A" />}
                {totals.d60 > 0 && <AgingLegend label="31–60 gün" value={totals.d60} color="#F97316" />}
                {totals.d90 > 0 && <AgingLegend label="61+ gün" value={totals.d90} color="#D94B4B" />}
              </View>
            </View>
          )}
        </View>

        {/* ── Search + Filter — §05.5 ─────────────────────────── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{
            flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
            height: 44, paddingHorizontal: 14, borderRadius: 14,
            borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF',
          }}>
            <Search size={15} color={DS.ink[400]} strokeWidth={1.8} />
            <TextInput
              style={{ flex: 1, fontSize: 14, color: DS.ink[900], outline: 'none' as any }}
              placeholder="Klinik ara..."
              placeholderTextColor={DS.ink[400]}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} style={{ cursor: 'pointer' as any }}>
                <X size={14} color={DS.ink[400]} strokeWidth={2} />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={() => setOverdueOnly(v => !v)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              height: 44, paddingHorizontal: 14, borderRadius: 14,
              borderWidth: 1,
              borderColor: overdueOnly ? 'rgba(217,75,75,0.3)' : 'rgba(0,0,0,0.08)',
              backgroundColor: overdueOnly ? CHIP_TONES.danger.bg : '#FFF',
              cursor: 'pointer' as any,
            }}
          >
            <Clock size={13} color={overdueOnly ? CHIP_TONES.danger.fg : DS.ink[400]} strokeWidth={1.8} />
            <Text style={{ fontSize: 13, fontWeight: overdueOnly ? '600' : '500', color: overdueOnly ? CHIP_TONES.danger.fg : DS.ink[500] }}>
              Gecikenler
            </Text>
          </Pressable>
        </View>

        {/* ── Clinic list ─────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 48, gap: 10 }}>
            <Inbox size={32} color={DS.ink[300]} strokeWidth={1.4} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[400] }}>
              {search || overdueOnly ? 'Sonuç bulunamadı' : 'Henüz klinik yok'}
            </Text>
          </View>
        ) : isDesktop ? (
          /* ── Desktop: tableCard §09 ──────────────────────────── */
          <View style={tableCard}>
            {/* Toolbar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>
                Klinik Bakiyeleri
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, color: DS.ink[400] }}>
                {filtered.length} klinik
              </Text>
            </View>

            {/* Header */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              {[
                { label: 'KLİNİK',    flex: 2.5 },
                { label: 'FATURA',     flex: 0.8 },
                { label: 'KESİLEN',    flex: 1.3 },
                { label: 'TAHSİL',     flex: 1.3 },
                { label: 'BAKİYE',     flex: 1.3, align: 'right' as const },
                { label: 'GECİKMİŞ',   flex: 1.3, align: 'right' as const },
                { label: 'TAHSİLAT',   flex: 0.8, align: 'right' as const },
                { label: '',           flex: 0.4 },
              ].map((h, i) => (
                <Text key={i} style={{ flex: h.flex, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textAlign: h.align }}>
                  {h.label}
                </Text>
              ))}
            </View>

            {/* Rows */}
            {filtered.map((b, i) => {
              const balance = Number(b.balance);
              const overdue = Number(b.overdue_amount);
              const hasOverdue = overdue > 0;
              const billed = Number(b.total_billed);
              const paid = Number(b.total_paid);
              const pct = billed > 0 ? Math.min(100, (paid / billed) * 100) : 0;

              return (
                <Pressable
                  key={b.clinic_id}
                  onPress={() => openStatement(b.clinic_id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 20, paddingVertical: 14,
                    borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                    borderBottomColor: 'rgba(0,0,0,0.04)',
                    cursor: 'pointer' as any,
                  }}
                >
                  {/* Clinic name + avatar */}
                  <View style={{ flex: 2.5, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{
                      width: 32, height: 32, borderRadius: 10,
                      backgroundColor: hasOverdue ? CHIP_TONES.danger.bg : CHIP_TONES.info.bg,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Building2 size={14} color={hasOverdue ? CHIP_TONES.danger.fg : CHIP_TONES.info.fg} strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }} numberOfLines={1}>
                        {b.clinic_name}
                      </Text>
                      {b.oldest_overdue_date && hasOverdue && (
                        <Text style={{ fontSize: 10, color: CHIP_TONES.danger.fg, marginTop: 1 }}>
                          vade: {fmtDateShort(b.oldest_overdue_date)}
                        </Text>
                      )}
                    </View>
                  </View>

                  <Text style={{ flex: 0.8, fontSize: 13, color: DS.ink[500] }}>
                    {Number(b.invoice_count)}
                  </Text>

                  <Text style={{ flex: 1.3, fontSize: 13, color: DS.ink[800] }}>
                    {fmtMoney(billed)}
                  </Text>

                  <Text style={{ flex: 1.3, fontSize: 13, fontWeight: '500', color: CHIP_TONES.success.fg }}>
                    {fmtMoney(paid)}
                  </Text>

                  <Text style={{ flex: 1.3, fontSize: 13, fontWeight: '600', color: hasOverdue ? CHIP_TONES.danger.fg : DS.ink[900], textAlign: 'right' }}>
                    {fmtMoney(balance)}
                  </Text>

                  <View style={{ flex: 1.3, alignItems: 'flex-end' }}>
                    {hasOverdue ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: CHIP_TONES.danger.bg }}>
                        <AlertTriangle size={10} color={CHIP_TONES.danger.fg} strokeWidth={2} />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: CHIP_TONES.danger.fg }}>
                          {fmtMoney(overdue)}
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 11, color: DS.ink[300] }}>—</Text>
                    )}
                  </View>

                  {/* Progress % */}
                  <Text style={{ flex: 0.8, fontSize: 11, fontWeight: '600', color: DS.ink[500], textAlign: 'right' }}>
                    %{pct.toFixed(0)}
                  </Text>

                  {/* Arrow */}
                  <View style={{ flex: 0.4, alignItems: 'flex-end' }}>
                    <ChevronRight size={14} color={DS.ink[300]} strokeWidth={1.8} />
                  </View>
                </Pressable>
              );
            })}

            {/* Footer */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', backgroundColor: '#FAFAFA' }}>
              <Text style={{ fontSize: 11, color: DS.ink[500] }}>
                {filtered.length} klinik
              </Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }}>
                Toplam: {fmtMoney(totals.balance)}
              </Text>
            </View>
          </View>
        ) : (
          /* ── Mobile: cardSolid §05 ───────────────────────────── */
          <View style={{ gap: 10 }}>
            {filtered.map(b => {
              const balance = Number(b.balance);
              const overdue = Number(b.overdue_amount);
              const hasOverdue = overdue > 0;
              const billed = Number(b.total_billed);
              const paid = Number(b.total_paid);
              const pct = billed > 0 ? Math.min(100, (paid / billed) * 100) : 0;

              return (
                <Pressable
                  key={b.clinic_id}
                  onPress={() => openStatement(b.clinic_id)}
                  style={{ ...cardSolid, gap: 14, cursor: 'pointer' as any }}
                >
                  {/* Top row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{
                      width: 40, height: 40, borderRadius: 12,
                      backgroundColor: hasOverdue ? CHIP_TONES.danger.bg : CHIP_TONES.info.bg,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Building2 size={18} color={hasOverdue ? CHIP_TONES.danger.fg : CHIP_TONES.info.fg} strokeWidth={1.6} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                        {b.clinic_name}
                      </Text>
                      <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 2 }}>
                        {Number(b.invoice_count)} fatura
                        {b.oldest_overdue_date && hasOverdue
                          ? ` · vade: ${fmtDateShort(b.oldest_overdue_date)}`
                          : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 6 }}>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color: hasOverdue ? CHIP_TONES.danger.fg : DS.ink[900] }}>
                          {fmtMoney(balance)}
                        </Text>
                        <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>
                          Bakiye
                        </Text>
                      </View>
                      <ChevronRight size={16} color={DS.ink[300]} strokeWidth={1.8} />
                    </View>
                  </View>

                  {/* Progress */}
                  <View style={{ height: 4, borderRadius: 999, backgroundColor: DS.ink[100], overflow: 'hidden' }}>
                    <View style={{ width: `${pct}%` as any, height: '100%', borderRadius: 999, backgroundColor: '#2D9A6B' }} />
                  </View>

                  {/* Stats */}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>Kesilen</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800], marginTop: 2 }}>{fmtMoney(billed)}</Text>
                    </View>
                    <View style={{ width: 1, height: 24, backgroundColor: DS.ink[100], marginHorizontal: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>Tahsil</Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: CHIP_TONES.success.fg, marginTop: 2 }}>{fmtMoney(paid)}</Text>
                    </View>
                    {hasOverdue && (
                      <>
                        <View style={{ width: 1, height: 24, backgroundColor: DS.ink[100], marginHorizontal: 12 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>Gecikmiş</Text>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: CHIP_TONES.danger.fg, marginTop: 2 }}>{fmtMoney(overdue)}</Text>
                        </View>
                      </>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Hero Stat ───────────────────────────────────────────────────────
function HeroStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View>
      <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400] }}>
        {label}
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color, marginTop: 4 }}>
        {value}
      </Text>
    </View>
  );
}

// ─── Aging Legend (hero bar) ─────────────────────────────────────────
function AgingLegend({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '500' }}>{label}</Text>
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{fmtMoney(value)}</Text>
    </View>
  );
}

export default ClinicBalanceScreen;
