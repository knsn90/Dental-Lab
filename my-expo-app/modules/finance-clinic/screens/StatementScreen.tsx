/**
 * Mali İşlemler — Cari Ekstre
 * Kronolojik tüm hareketler (fatura + ödeme) — filtreli:
 *   · Tarih aralığı (Bu Ay / Geçen Ay / Son 3 Ay / Bu Yıl / Tümü / Özel)
 *   · Hekim
 *   · Hareket türü (Tümü / Fatura / Tahsilat)
 *   · Arama (fatura no / açıklama)
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { Search, FileText, Banknote, Calendar, User as UserIcon, Filter as FilterIcon, X, FileSpreadsheet, Printer, ChevronRight, ChevronLeft } from 'lucide-react-native';
import { isRTL } from '../../../core/i18n';

import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { DatePicker } from '../../../core/ui/DatePicker';
import {
  fetchStatement, fetchClinicDoctors,
  type StatementLine, type ClinicDoctorOption,
} from '../api';
import {
  DISPLAY, TRY, Mnat, fmtDate, PAGE_PADDING,
  ErrorBar, Loader, Card, SecHeader, EmptyCard, PillButton,
} from '../components/atoms';
import { useRates, rateToBase } from '../../../core/money/rateCache';
import { groupByCurrency, type CurrencyTotal } from '../../../core/money/aggregations';
import { type Currency } from '../../../core/money/currency';
import { exportStatementXls, exportStatementPdf, type ExportContext } from '../export';

type Props = { clinicId: string };
type RangeKey = 'this_month' | 'last_month' | 'last_3m' | 'this_year' | 'all' | 'custom';
type KindKey  = 'all' | 'invoice' | 'payment';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'this_month', label: 'Bu Ay' },
  { key: 'last_month', label: 'Geçen Ay' },
  { key: 'last_3m',    label: 'Son 3 Ay' },
  { key: 'this_year',  label: 'Bu Yıl' },
  { key: 'all',        label: 'Tümü' },
  { key: 'custom',     label: 'Özel' },
];

const KIND_OPTIONS: { key: KindKey; label: string }[] = [
  { key: 'all',     label: 'Tümü' },
  { key: 'invoice', label: 'Fatura' },
  { key: 'payment', label: 'Tahsilat' },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

function rangeToDates(key: RangeKey): { from?: string; to?: string } {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  switch (key) {
    case 'this_month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: iso(from) };
    }
    case 'last_month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to   = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(from), to: iso(to) };
    }
    case 'last_3m': {
      const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { from: iso(from) };
    }
    case 'this_year': {
      const from = new Date(now.getFullYear(), 0, 1);
      return { from: iso(from) };
    }
    case 'all':
    case 'custom':
    default:
      return {};
  }
}

export function StatementScreen({ clinicId }: Props) {
  const TH = usePanelTheme();
  useRates();
  const router = useRouter();
  const segments = useSegments();
  const panelBase = String(segments?.[0] ?? '(clinic)');

  const [lines, setLines]     = useState<StatementLine[]>([]);
  const [opening, setOpening] = useState(0);
  const [openingByCcy, setOpeningByCcy] = useState<CurrencyTotal[]>([]);
  const [closingByCcy, setClosingByCcy] = useState<CurrencyTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [doctors, setDoctors] = useState<ClinicDoctorOption[]>([]);

  // Filtre state
  const [range,    setRange]    = useState<RangeKey>('this_month');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo,   setCustomTo]   = useState<string>('');
  const [doctorId, setDoctorId] = useState<string | 'all'>('all');
  const [kind,     setKind]     = useState<KindKey>('all');
  const [query,    setQuery]    = useState('');
  const [doctorOpen, setDoctorOpen] = useState(false);

  // Aktif tarih aralığı
  const { from, to } = useMemo(() => {
    if (range === 'custom') {
      return { from: customFrom || undefined, to: customTo || undefined };
    }
    return rangeToDates(range);
  }, [range, customFrom, customTo]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [{ lines: l, openingBalance, openingByCcy: obc, closingByCcy: cbc }, docs] = await Promise.all([
        fetchStatement(clinicId, { from, to }),
        doctors.length ? Promise.resolve(doctors) : fetchClinicDoctors(clinicId),
      ]);
      setLines(l); setOpening(openingBalance); setOpeningByCcy(obc); setClosingByCcy(cbc);
      if (!doctors.length) setDoctors(docs);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, from, to]);
  useEffect(() => { load(); }, [load]);

  // Client-side filtre (hekim · kind · arama)
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return lines.filter(l => {
      if (kind !== 'all' && l.kind !== kind) return false;
      if (doctorId !== 'all' && l.doctor_id !== doctorId) return false;
      if (q) {
        const inDesc = l.description.toLocaleLowerCase('tr').includes(q);
        const inNo   = (l.invoice_no ?? '').toLocaleLowerCase('tr').includes(q);
        const inDoc  = (l.doctor_name ?? '').toLocaleLowerCase('tr').includes(q);
        const inPat  = (l.patient_name ?? '').toLocaleLowerCase('tr').includes(q);
        const inOrd  = (l.order_no ?? '').toLocaleLowerCase('tr').includes(q);
        if (!inDesc && !inNo && !inDoc && !inPat && !inOrd) return false;
      }
      return true;
    });
  }, [lines, query, kind, doctorId]);

  // Totals — KATI per-currency (asla toplanmaz)
  const debitByCcy  = groupByCurrency(filtered.filter(l => l.debit > 0),  l => ({ amount: l.debit,  currency: (l.currency || 'TRY') as Currency }));
  const creditByCcy = groupByCurrency(filtered.filter(l => l.credit > 0), l => ({ amount: l.credit, currency: (l.currency || 'TRY') as Currency }));
  const ccyLabel = (arr: CurrencyTotal[]) => arr.length ? arr.map(s => Mnat(s.total, s.currency)).join(' · ') : Mnat(0, 'TRY');
  const netByCcy: CurrencyTotal[] = useMemo(() => {
    const m: Record<string, number> = {};
    debitByCcy.forEach(s => { m[s.currency] = (m[s.currency] ?? 0) + s.total; });
    creditByCcy.forEach(s => { m[s.currency] = (m[s.currency] ?? 0) - s.total; });
    return Object.entries(m).filter(([, v]) => Math.abs(v) > 0.0001)
      .map(([currency, total]) => ({ currency: currency as Currency, total, count: 0 }));
  }, [debitByCcy, creditByCcy]);
  // Dar sütunda para birimi başına alt alta küçük satırlar
  const CcyCol = ({ slices, color, width }: { slices: CurrencyTotal[]; color: string; width: number }) => (
    <View style={{ width, alignItems: 'flex-end' }}>
      {slices.length === 0
        ? <Text style={{ fontSize: 12, fontWeight: '700', color }}>—</Text>
        : slices.map(s => (
            <Text key={s.currency} style={{ fontSize: 12, fontWeight: '700', color }} numberOfLines={1}>{Mnat(s.total, s.currency)}</Text>
          ))}
    </View>
  );

  const activeFilterCount =
    (range !== 'all' ? 1 : 0) + (doctorId !== 'all' ? 1 : 0) + (kind !== 'all' ? 1 : 0) + (query.trim() ? 1 : 0);

  const clearAll = () => {
    setRange('this_month'); setDoctorId('all'); setKind('all'); setQuery('');
    setCustomFrom(''); setCustomTo('');
  };

  const selectedDoctorLabel =
    doctorId === 'all' ? 'Tüm Hekimler' : (doctors.find(d => d.id === doctorId)?.full_name ?? 'Hekim');

  const selectedKindLabel = KIND_OPTIONS.find(k => k.key === kind)?.label ?? 'Tümü';
  const selectedRangeLabel = useMemo(() => {
    const base = RANGE_OPTIONS.find(r => r.key === range)?.label ?? 'Tümü';
    if (range === 'custom') {
      return `Özel (${customFrom || '—'} → ${customTo || '—'})`;
    }
    if (from || to) {
      return `${base} (${from ?? '—'} → ${to ?? 'bugün'})`;
    }
    return base;
  }, [range, from, to, customFrom, customTo]);

  const buildExportCtx = (): ExportContext => ({
    clinicName: null,           // İleride props'tan gelebilir
    labName: null,
    rangeLabel: selectedRangeLabel,
    doctorLabel: selectedDoctorLabel,
    kindLabel: selectedKindLabel,
    generatedAt: new Date(),
  });

  const handleExportExcel = () => {
    exportStatementXls(filtered, opening, buildExportCtx());
  };
  const handleExportPdf = () => {
    exportStatementPdf(filtered, opening, buildExportCtx());
  };

  if (loading) return <Loader />;
  if (error)   return <View style={{ padding: PAGE_PADDING }}><ErrorBar message={error} /></View>;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: PAGE_PADDING, paddingBottom: 48, gap: 14 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 240 }}>
          <SecHeader
            eyebrow="Hesap"
            title="Cari Ekstre"
            desc={`Açılış ${ccyLabel(openingByCcy)} · Güncel ${ccyLabel(closingByCcy)} · ${filtered.length} hareket`}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <PillButton
            variant="light"
            size="sm"
            onPress={handleExportExcel}
            leftIcon={<FileSpreadsheet size={13} color={DS.ink[800]} />}
          >
            Excel
          </PillButton>
          <PillButton
            variant="dark"
            size="sm"
            onPress={handleExportPdf}
            leftIcon={<Printer size={13} color="#FFF" />}
          >
            PDF
          </PillButton>
        </View>
      </View>

      {/* ──────── Filtre paneli ──────── */}
      <Card style={{ padding: 12, gap: 10 }}>
        {/* Üst satır: filtre etiketi + temizle */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <FilterIcon size={13} color={DS.ink[500]} />
            <Text style={{ fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Filtreler
            </Text>
            {activeFilterCount > 0 && (
              <View style={{ backgroundColor: TH.primary, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1, marginStart: 4 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFF' }}>{activeFilterCount}</Text>
              </View>
            )}
          </View>
          {activeFilterCount > 0 && (
            <Pressable onPress={clearAll} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <X size={11} color={DS.ink[500]} />
              <Text style={{ fontSize: 11, color: DS.ink[500], fontWeight: '500' }}>Temizle</Text>
            </Pressable>
          )}
        </View>

        {/* Tarih aralığı pill bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Calendar size={13} color={DS.ink[400]} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 }}>
            {RANGE_OPTIONS.map(opt => {
              const active = range === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setRange(opt.key)}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                    backgroundColor: active ? TH.primary : DS.ink[50],
                    borderWidth: 1,
                    borderColor: active ? TH.primary : DS.ink[200],
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: active ? '#FFF' : DS.ink[700] }}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Özel tarih girişleri */}
        {range === 'custom' && (
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Text style={{ fontSize: 10, color: DS.ink[400], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
                Başlangıç
              </Text>
              <DatePicker
                value={customFrom || null}
                onChange={(iso) => setCustomFrom(iso)}
                placeholder="Tarih seç"
                accent={TH.primary}
                compact
                maxDate={customTo || undefined}
              />
            </View>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Text style={{ fontSize: 10, color: DS.ink[400], fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
                Bitiş
              </Text>
              <DatePicker
                value={customTo || null}
                onChange={(iso) => setCustomTo(iso)}
                placeholder="Tarih seç"
                accent={TH.primary}
                compact
                minDate={customFrom || undefined}
              />
            </View>
          </View>
        )}

        {/* Hekim + Tür satırı */}
        <View style={{
          flexDirection: 'row', gap: 8, flexWrap: 'wrap',
          // Dropdown açıkken sonraki satırların üstünde kalsın
          zIndex: doctorOpen ? 50 : 1,
          ...(Platform.OS === 'web' ? { position: 'relative' as any } : null),
        }}>
          {/* Hekim dropdown */}
          <View style={{
            flexGrow: 1, flexBasis: 200, minWidth: 180,
            position: 'relative',
            zIndex: doctorOpen ? 100 : 1,
          }}>
            <Pressable
              onPress={() => setDoctorOpen(o => !o)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                borderWidth: 1, borderColor: doctorId !== 'all' ? TH.primary : DS.ink[200],
                borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
                backgroundColor: '#FFF',
              }}
            >
              <UserIcon size={13} color={doctorId !== 'all' ? TH.primary : DS.ink[500]} />
              <Text style={{ flex: 1, fontSize: 12, color: DS.ink[900], fontWeight: '500' }} numberOfLines={1}>
                {selectedDoctorLabel}
              </Text>
              <Text style={{ fontSize: 10, color: DS.ink[400] }}>▼</Text>
            </Pressable>
            {doctorOpen && (
              <View style={{
                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
                zIndex: 1000,
                backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200], borderRadius: 10,
                maxHeight: 240, overflow: 'hidden',
                ...(Platform.OS === 'web'
                  ? { boxShadow: '0 12px 32px rgba(0,0,0,0.18)' } as any
                  : { elevation: 12, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }),
              }}>
                <ScrollView style={{ maxHeight: 240 }}>
                  <Pressable
                    onPress={() => { setDoctorId('all'); setDoctorOpen(false); }}
                    style={{ paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: DS.ink[100] }}
                  >
                    <Text style={{ fontSize: 12, color: doctorId === 'all' ? TH.primary : DS.ink[800], fontWeight: doctorId === 'all' ? '600' : '500' }}>
                      Tüm Hekimler
                    </Text>
                  </Pressable>
                  {doctors.length === 0 ? (
                    <View style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
                      <Text style={{ fontSize: 11, color: DS.ink[400] }}>Hekim bulunamadı</Text>
                    </View>
                  ) : doctors.map((d, i) => (
                    <Pressable
                      key={d.id}
                      onPress={() => { setDoctorId(d.id); setDoctorOpen(false); }}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 9,
                        borderBottomWidth: i < doctors.length - 1 ? 1 : 0,
                        borderBottomColor: DS.ink[100],
                      }}
                    >
                      <Text
                        style={{ fontSize: 12, color: doctorId === d.id ? TH.primary : DS.ink[800], fontWeight: doctorId === d.id ? '600' : '500' }}
                        numberOfLines={1}
                      >
                        {d.full_name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Tür segment */}
          <View style={{ flexDirection: 'row', gap: 2, padding: 3, backgroundColor: DS.ink[50], borderRadius: 10, borderWidth: 1, borderColor: DS.ink[200] }}>
            {KIND_OPTIONS.map(opt => {
              const active = kind === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setKind(opt.key)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                    backgroundColor: active ? '#FFF' : 'transparent',
                    ...(active && Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any : null),
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: active ? '700' : '500', color: active ? DS.ink[900] : DS.ink[500] }}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Search */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200], borderRadius: 10,
          paddingHorizontal: 10, paddingVertical: 6,
        }}>
          <Search size={13} color={DS.ink[400]} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Fatura no, açıklama veya hekim ara…"
            placeholderTextColor={DS.ink[400]}
            style={{ flex: 1, fontSize: 12, color: DS.ink[900], paddingVertical: 4, outlineStyle: 'none' as any }}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')}><X size={13} color={DS.ink[400]} /></Pressable>
          )}
        </View>
      </Card>

      {/* ──────── Hareket listesi ──────── */}
      {filtered.length === 0 ? (
        <EmptyCard
          icon={FileText}
          title={lines.length === 0 ? 'Hareket yok' : 'Eşleşen kayıt yok'}
          description={lines.length === 0 ? 'Seçili dönemde fatura veya ödeme kaydı bulunmuyor.' : 'Filtreleri değiştirin veya temizleyin.'}
        />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 16, paddingVertical: 10,
            backgroundColor: DS.ink[50], borderBottomWidth: 1, borderBottomColor: DS.ink[100],
          }}>
            <Text style={{ width: 84, fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Tarih</Text>
            <Text style={{ flex: 1, fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Açıklama</Text>
            <Text style={{ width: 90, textAlign: 'end' as any, fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Borç</Text>
            <Text style={{ width: 90, textAlign: 'end' as any, fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Alacak</Text>
            <Text style={{ width: 100, textAlign: 'end' as any, fontSize: 10, fontWeight: '700', color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.7 }}>Bakiye</Text>
          </View>

          {/* Lines */}
          {filtered.map((l, i) => (
            <Pressable
              key={l.id}
              onPress={l.invoice_id ? () => router.push(`/${panelBase}/invoice/${l.invoice_id}` as any) : undefined}
              disabled={!l.invoice_id}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 16, paddingVertical: 10,
                borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                borderBottomColor: DS.ink[100],
                backgroundColor: pressed && l.invoice_id ? DS.ink[50] : 'transparent',
              })}
            >
              <Text style={{ width: 84, fontSize: 11, color: DS.ink[500] }}>{fmtDate(l.date)}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {l.kind === 'invoice'
                    ? <FileText size={12} color={DS.ink[500]} />
                    : <Banknote size={12} color="#1F6B47" />}
                  <Text style={{ fontSize: 12, color: DS.ink[800], flex: 1 }} numberOfLines={1}>{l.description}</Text>
                </View>
                {/* Hekim + hasta (+ sipariş no) tek alt satırda — hekim ekstrede
                    hangi hastanın işi olduğunu görmek istiyor. */}
                {(l.doctor_name || l.patient_name) && (
                  <Text style={{ fontSize: 10, color: DS.ink[400], marginTop: 2, marginStart: 18 }} numberOfLines={1}>
                    {[l.doctor_name, l.patient_name, l.order_no].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </View>
              <Text style={{ width: 90, textAlign: 'end' as any, fontSize: 12, color: l.debit > 0 ? DS.ink[900] : DS.ink[300] }}>
                {l.debit > 0 ? Mnat(l.debit, l.currency) : '—'}
              </Text>
              <Text style={{ width: 90, textAlign: 'end' as any, fontSize: 12, color: l.credit > 0 ? '#1F6B47' : DS.ink[300], fontWeight: l.credit > 0 ? '600' : '400' }}>
                {l.credit > 0 ? Mnat(l.credit, l.currency) : '—'}
              </Text>
              <Text style={{ width: 100, textAlign: 'end' as any, ...DISPLAY, fontSize: 14, color: l.balance > 0 ? '#9C2E2E' : DS.ink[900], letterSpacing: -0.3 }}>
                {Mnat(l.balance, l.currency)}
              </Text>
              {isRTL()
                ? <ChevronLeft size={14} color={l.invoice_id ? DS.ink[400] : 'transparent'} />
                : <ChevronRight size={14} color={l.invoice_id ? DS.ink[400] : 'transparent'} />}
            </Pressable>
          ))}

          {/* Toplam satırı */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 16, paddingVertical: 12,
            backgroundColor: DS.ink[50], borderTopWidth: 1, borderTopColor: DS.ink[200],
          }}>
            <Text style={{ width: 84, fontSize: 10, fontWeight: '700', color: DS.ink[700], textTransform: 'uppercase', letterSpacing: 0.7 }}>Toplam</Text>
            <Text style={{ flex: 1, fontSize: 11, color: DS.ink[500] }}>{filtered.length} hareket</Text>
            <CcyCol slices={debitByCcy}  color={DS.ink[900]} width={90} />
            <CcyCol slices={creditByCcy} color="#1F6B47"    width={90} />
            <CcyCol slices={netByCcy}    color={DS.ink[900]} width={100} />
          </View>
        </Card>
      )}
    </ScrollView>
  );
}
