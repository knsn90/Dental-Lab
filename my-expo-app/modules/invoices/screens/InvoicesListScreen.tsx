/**
 * InvoicesListScreen — Fatura Yönetimi (Patterns Design Language)
 *
 * KPI hero kartları, durum filtreleri, arama, fatura listesi,
 * toplu fatura ve toplu tahsilat modalleri.
 * cardSolid, DISPLAY font, DS tokens, CHIP_TONES, Lucide icons.
 */
import React, { useMemo, useState, useContext } from 'react';
import {
  View, Text, ScrollView, Pressable, RefreshControl,
  TextInput, Modal, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import {
  FileText, Search, X, ChevronRight, ChevronDown,
  TrendingUp, Wallet, AlertCircle, Banknote, Building2,
  Calendar, Layers, Receipt, CircleCheck, CircleX, Inbox,
  CreditCard, Landmark, File, Check, Hand,
  DollarSign, Users,
} from 'lucide-react-native';
import { toast } from '../../../core/ui/Toast';
import { useRouter } from 'expo-router';

import { HubContext } from '../../../core/ui/HubContext';
import { DS } from '../../../core/theme/dsTokens';
import { useInvoices, useInvoiceStats, useUnbilledWorkOrders } from '../hooks/useInvoices';
import { createBulkInvoice, bulkRecordPayment } from '../api';
import {
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  type InvoiceStatus, type Invoice, type UnbilledWorkOrder,
} from '../types';
import { useClinics } from '../../clinics/hooks/useClinics';
import { downloadCsv, csvMoney, csvDate } from '../../../core/util/csvExport';

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

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', text: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', text: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  text: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', text: '#1F5689' },
  neutral: { bg: DS.ink[100],             text: DS.ink[500] },
};

const modalShadow = '0 24px 48px -12px rgba(0,0,0,0.18)';

// ── Status → CHIP_TONES mapping ─────────────────────────────────────
const STATUS_CHIP: Record<InvoiceStatus, { bg: string; text: string }> = {
  taslak:       CHIP_TONES.neutral,
  kesildi:      CHIP_TONES.info,
  kismi_odendi: CHIP_TONES.warning,
  odendi:       CHIP_TONES.success,
  iptal:        CHIP_TONES.danger,
};

const STATUS_FILTERS: { value: InvoiceStatus | 'all'; label: string }[] = [
  { value: 'all',          label: 'Tümü' },
  { value: 'taslak',       label: 'Taslak' },
  { value: 'kesildi',      label: 'Kesildi' },
  { value: 'kismi_odendi', label: 'Kısmi' },
  { value: 'odendi',       label: 'Ödendi' },
  { value: 'iptal',        label: 'İptal' },
];

// ── Helpers ─────────────────────────────────────────────────────────
function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '₺' + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000)     return '₺' + (n / 1_000).toFixed(1) + 'K';
  return fmtMoney(n);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function InvoicesListScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const isEmbedded = useContext(HubContext);

  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPayOpen, setBulkPayOpen] = useState(false);

  const { invoices, loading, refetch } = useInvoices();
  const { stats, refetch: refetchStats } = useInvoiceStats();

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (overdueOnly) {
        const isOverdue = inv.due_date && inv.due_date < today
          && inv.status !== 'odendi' && inv.status !== 'iptal';
        if (!isOverdue) return false;
      }
      if (search) {
        const sl = search.toLowerCase();
        const match =
          inv.invoice_number.toLowerCase().includes(sl) ||
          (inv.clinic?.name ?? '').toLowerCase().includes(sl) ||
          (inv.doctor?.full_name ?? '').toLowerCase().includes(sl) ||
          (inv.work_order?.patient_name ?? '').toLowerCase().includes(sl);
        if (!match) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, search, overdueOnly, today]);

  const onRefresh = () => { refetch(); refetchStats(); };

  return (
    <View style={{ flex: 1 }}>
      {/* ── Header — standalone only ── */}
      {!isEmbedded && (
        <View style={{ paddingHorizontal: 22, paddingTop: 18, paddingBottom: 6 }}>
          <Text style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.5, color: DS.ink[900] }}>
            Faturalar
          </Text>
          <Text style={{ fontSize: 13, color: DS.ink[400], marginTop: 2 }}>
            {stats ? `${stats.invoiceCount} fatura` : '...'}
          </Text>
        </View>
      )}

      {/* ── Toolbar: Actions row ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
        gap: 8, paddingHorizontal: 22, paddingTop: 10, paddingBottom: 8,
      }}>
        {/* Status filter pills */}
        <View style={{
          flexDirection: 'row', gap: 2, padding: 3,
          borderRadius: 9999, backgroundColor: DS.ink[100],
        }}>
          {STATUS_FILTERS.map(f => {
            const active = statusFilter === f.value;
            return (
              <Pressable
                key={f.value}
                onPress={() => setStatusFilter(f.value)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6,
                  borderRadius: 9999,
                  backgroundColor: active ? '#FFF' : 'transparent',
                  // @ts-ignore web
                  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : undefined,
                  cursor: 'pointer',
                }}
              >
                <Text style={{
                  fontSize: 12, fontWeight: active ? '600' : '500',
                  color: active ? DS.ink[900] : DS.ink[500],
                }}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Overdue toggle */}
        <Pressable
          onPress={() => setOverdueOnly(v => !v)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 12, paddingVertical: 6,
            borderRadius: 9999,
            backgroundColor: overdueOnly ? CHIP_TONES.danger.bg : 'transparent',
            // @ts-ignore web
            cursor: 'pointer',
          }}
        >
          <AlertCircle size={12} strokeWidth={1.8} color={overdueOnly ? CHIP_TONES.danger.text : DS.ink[400]} />
          <Text style={{
            fontSize: 12, fontWeight: overdueOnly ? '600' : '500',
            color: overdueOnly ? CHIP_TONES.danger.text : DS.ink[500],
          }}>
            Vadesi Gecen
          </Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        {/* Action buttons */}
        {isDesktop && (
          <>
            <ActionBtn icon={Banknote} label="Toplu Tahsilat" color="#059669" onPress={() => setBulkPayOpen(true)} />
            <ActionBtn
              icon={FileText}
              label="Excel'e Aktar"
              onPress={async () => {
                const res = await downloadCsv(
                  `Faturalar-${new Date().toISOString().slice(0,10)}`,
                  filtered,
                  [
                    { header: 'Fatura No',     value: r => r.invoice_number },
                    { header: 'Tarih',         value: r => csvDate(r.issue_date) },
                    { header: 'Vade',          value: r => csvDate(r.due_date) },
                    { header: 'Klinik',        value: r => r.clinic?.name ?? '' },
                    { header: 'Hekim',         value: r => r.doctor?.full_name ?? '' },
                    { header: 'Tutar',         value: r => csvMoney(r.total) },
                    { header: 'Tahsil Edilen', value: r => csvMoney(r.paid_amount) },
                    { header: 'Bakiye',        value: r => csvMoney(Number(r.total) - Number(r.paid_amount)) },
                    { header: 'Durum',         value: r => INVOICE_STATUS_LABELS[r.status] ?? r.status },
                  ],
                );
                if (!res.ok && res.error) toast.error(res.error);
                else toast.success('CSV indirildi');
              }}
            />
          </>
        )}
        <Pressable
          onPress={() => setBulkOpen(true)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 14, paddingVertical: 8,
            borderRadius: 9999, backgroundColor: DS.ink[900],
            // @ts-ignore web
            cursor: 'pointer',
          }}
        >
          <Layers size={13} strokeWidth={2} color="#FFF" />
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFF' }}>Toplu Fatura</Text>
        </Pressable>
      </View>

      {/* ── KPI Row ── */}
      {stats && (
        <ScrollView
          horizontal={!isDesktop}
          showsHorizontalScrollIndicator={false}
          scrollEnabled={!isDesktop}
          contentContainerStyle={{
            flexDirection: 'row', gap: 12,
            paddingHorizontal: 22, paddingVertical: 8,
            ...(isDesktop ? { width: '100%' } : {}),
          }}
        >
          <KpiMini label="Bu Ay Kesilen" value={fmtShort(stats.thisMonthBilled)} icon={TrendingUp} color="#2563EB" flex={isDesktop} />
          <KpiMini label="Toplam Bakiye" value={fmtShort(stats.outstandingBalance)} icon={Wallet} color={DS.ink[900]} flex={isDesktop} />
          <KpiMini label="Vadesi Gecen" value={fmtShort(stats.overdueAmount)} icon={AlertCircle} color={CHIP_TONES.danger.text} flex={isDesktop} />
          <KpiMini label="Tahsilat (30g)" value={fmtShort(stats.totalPaid)} icon={Banknote} color="#059669" flex={isDesktop} />
        </ScrollView>
      )}

      {/* ── Search bar ── */}
      <View style={{ paddingHorizontal: 22, paddingTop: 4, paddingBottom: 8 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          height: 44, paddingHorizontal: 16,
          backgroundColor: DS.ink[50], borderRadius: 14,
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
        }}>
          <Search size={15} strokeWidth={1.6} color={DS.ink[400]} />
          <TextInput
            style={{
              flex: 1, fontSize: 14, color: DS.ink[900],
              // @ts-ignore web
              outline: 'none',
            }}
            placeholder="Fatura no, klinik, hekim, hasta..."
            placeholderTextColor={DS.ink[400]}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} style={{ cursor: 'pointer' as any }}>
              <X size={15} strokeWidth={1.8} color={DS.ink[400]} />
            </Pressable>
          )}
          {isDesktop && (
            <Text style={{ fontSize: 12, color: DS.ink[400], marginLeft: 8 }}>
              <Text style={{ fontWeight: '600', color: DS.ink[900] }}>{filtered.length}</Text> fatura
            </Text>
          )}
        </View>
      </View>

      {/* ── Invoice List ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 22, paddingTop: 4, paddingBottom: 48, gap: 10 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={DS.ink[300]} />}
        showsVerticalScrollIndicator={false}
      >
        {loading && filtered.length === 0 ? (
          <View style={{ paddingVertical: 64, alignItems: 'center' }}>
            <ActivityIndicator color={DS.ink[400]} />
          </View>
        ) : filtered.length === 0 ? (
          <EmptyState hasFilter={!!search || overdueOnly || statusFilter !== 'all'} />
        ) : isDesktop ? (
          /* Desktop: table card */
          <View style={{ ...cardSolid, padding: 0, overflow: 'hidden' }}>
            {/* Table header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 22, paddingVertical: 12,
              backgroundColor: DS.ink[50],
              borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
            }}>
              <Text style={{ ...colHeader, width: 120 }}>Fatura No</Text>
              <Text style={{ ...colHeader, flex: 1 }}>Klinik / Hekim</Text>
              <Text style={{ ...colHeader, width: 100 }}>Tarih</Text>
              <Text style={{ ...colHeader, width: 100 }}>Vade</Text>
              <Text style={{ ...colHeader, width: 110, textAlign: 'right' }}>Tutar</Text>
              <Text style={{ ...colHeader, width: 90, textAlign: 'center' }}>Durum</Text>
              <View style={{ width: 36 }} />
            </View>
            {filtered.map((inv, i) => (
              <InvoiceRow key={inv.id} invoice={inv} isLast={i === filtered.length - 1}
                onPress={() => router.push(`/(lab)/invoice/${inv.id}` as any)} />
            ))}
          </View>
        ) : (
          /* Mobile: card list */
          filtered.map(inv => (
            <InvoiceCard key={inv.id} invoice={inv}
              onPress={() => router.push(`/(lab)/invoice/${inv.id}` as any)} />
          ))
        )}
      </ScrollView>

      {/* Modals */}
      <BulkInvoiceModal
        visible={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onCreated={(id) => { setBulkOpen(false); router.push(`/(lab)/invoice/${id}` as any); }}
      />
      <BulkPaymentModal
        visible={bulkPayOpen}
        invoices={invoices.filter(inv =>
          inv.status !== 'odendi' && inv.status !== 'iptal' && inv.status !== 'taslak'
        )}
        onClose={() => setBulkPayOpen(false)}
        onDone={() => { setBulkPayOpen(false); onRefresh(); }}
      />
    </View>
  );
}

// Column header style
const colHeader = {
  fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.8,
  textTransform: 'uppercase' as const, color: DS.ink[500],
};

// ─── Action Button ──────────────────────────────────────────────────
function ActionBtn({ icon: Icon, label, color, onPress }: {
  icon: React.ComponentType<any>; label: string; color?: string; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 9999,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
        backgroundColor: '#FFF',
        // @ts-ignore web
        cursor: 'pointer',
      }}
    >
      <Icon size={13} strokeWidth={1.8} color={color ?? DS.ink[900]} />
      <Text style={{ fontSize: 12, fontWeight: '500', color: color ?? DS.ink[900] }}>{label}</Text>
    </Pressable>
  );
}

// ─── KPI Mini Card ──────────────────────────────────────────────────
function KpiMini({ label, value, icon: Icon, color, flex }: {
  label: string; value: string; icon: React.ComponentType<any>; color: string; flex?: boolean;
}) {
  return (
    <View style={{
      ...cardSolid, padding: 16, gap: 10,
      minWidth: flex ? undefined : 160,
      ...(flex ? { flex: 1 } : {}),
    }}>
      <View style={{
        width: 28, height: 28, borderRadius: 8,
        backgroundColor: color + '15',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={14} strokeWidth={1.8} color={color} />
      </View>
      <Text style={{
        fontSize: 10, fontWeight: '600', letterSpacing: 0.8,
        textTransform: 'uppercase', color: DS.ink[500],
      }}>
        {label}
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, color: DS.ink[900] }}>
        {value}
      </Text>
    </View>
  );
}

// ─── Desktop Invoice Row ────────────────────────────────────────────
function InvoiceRow({ invoice, isLast, onPress }: {
  invoice: Invoice; isLast: boolean; onPress: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = invoice.due_date && invoice.due_date < today
    && invoice.status !== 'odendi' && invoice.status !== 'iptal';
  const chip = isOverdue
    ? CHIP_TONES.danger
    : STATUS_CHIP[invoice.status];

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 22, paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: 'rgba(0,0,0,0.06)',
        backgroundColor: isOverdue ? 'rgba(217,75,75,0.03)' : 'transparent',
        // @ts-ignore web
        cursor: 'pointer',
      }}
    >
      <View style={{ width: 120 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{invoice.invoice_number}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: DS.ink[900] }} numberOfLines={1}>
          {invoice.clinic?.name ?? '—'}
        </Text>
        {invoice.doctor?.full_name && (
          <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }} numberOfLines={1}>
            Dr. {invoice.doctor.full_name}
          </Text>
        )}
      </View>
      <Text style={{ width: 100, fontSize: 12, color: DS.ink[500] }}>{fmtDate(invoice.issue_date)}</Text>
      <Text style={{
        width: 100, fontSize: 12,
        color: isOverdue ? CHIP_TONES.danger.text : DS.ink[500],
        fontWeight: isOverdue ? '600' : '400',
      }}>
        {fmtDate(invoice.due_date)}
      </Text>
      <Text style={{
        width: 110, textAlign: 'right',
        ...DISPLAY, fontSize: 15, letterSpacing: -0.3, color: DS.ink[900],
      }}>
        {fmtMoney(invoice.total)}
      </Text>
      <View style={{ width: 90, alignItems: 'center' }}>
        <View style={{
          paddingHorizontal: 8, paddingVertical: 3,
          borderRadius: 9999, backgroundColor: chip.bg,
        }}>
          <Text style={{ fontSize: 10, fontWeight: '600', color: chip.text }}>
            {isOverdue ? 'GECİKMİŞ' : INVOICE_STATUS_LABELS[invoice.status].toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={{ width: 36, alignItems: 'center' }}>
        <ChevronRight size={14} strokeWidth={1.6} color={DS.ink[300]} />
      </View>
    </Pressable>
  );
}

// ─── Mobile Invoice Card ────────────────────────────────────────────
function InvoiceCard({ invoice, onPress }: { invoice: Invoice; onPress: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = invoice.due_date && invoice.due_date < today
    && invoice.status !== 'odendi' && invoice.status !== 'iptal';
  const balance = Number(invoice.total) - Number(invoice.paid_amount);
  const chip = isOverdue ? CHIP_TONES.danger : STATUS_CHIP[invoice.status];

  return (
    <Pressable
      onPress={onPress}
      style={{
        ...cardSolid,
        ...(isOverdue ? {
          backgroundColor: 'rgba(217,75,75,0.04)',
          borderWidth: 1, borderColor: 'rgba(217,75,75,0.15)',
        } : {}),
        // @ts-ignore web
        cursor: 'pointer',
      }}
    >
      {/* Top row: number + clinic + amount */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{invoice.invoice_number}</Text>
          <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }} numberOfLines={1}>
            {invoice.clinic?.name ?? '—'}
            {invoice.doctor?.full_name ? ` · Dr. ${invoice.doctor.full_name}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Text style={{ ...DISPLAY, fontSize: 17, letterSpacing: -0.3, color: isOverdue ? CHIP_TONES.danger.text : DS.ink[900] }}>
            {fmtMoney(invoice.total)}
          </Text>
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, backgroundColor: chip.bg }}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: chip.text }}>
              {isOverdue ? 'GECİKMİŞ' : INVOICE_STATUS_LABELS[invoice.status].toUpperCase()}
            </Text>
          </View>
        </View>
      </View>

      {/* Bottom: date + due + balance */}
      {(invoice.due_date || balance > 0) && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          marginTop: 12, paddingTop: 12,
          borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
        }}>
          <Calendar size={11} strokeWidth={1.4} color={DS.ink[400]} />
          <Text style={{ fontSize: 11, color: DS.ink[500] }}>{fmtDate(invoice.issue_date)}</Text>
          {invoice.due_date && (
            <>
              <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: DS.ink[300] }} />
              <Text style={{
                fontSize: 11, color: isOverdue ? CHIP_TONES.danger.text : DS.ink[500],
                fontWeight: isOverdue ? '600' : '400',
              }}>
                Vade: {fmtDate(invoice.due_date)}
              </Text>
            </>
          )}
          {balance > 0 && (
            <>
              <View style={{ flex: 1 }} />
              <Text style={{
                fontSize: 11, fontWeight: '600',
                color: isOverdue ? CHIP_TONES.danger.text : DS.ink[900],
              }}>
                Kalan: {fmtMoney(balance)}
              </Text>
            </>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ─── Empty State ────────────────────────────────────────────────────
function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 56, gap: 12 }}>
      {hasFilter ? (
        <Search size={36} strokeWidth={1.4} color={DS.ink[300]} />
      ) : (
        <Inbox size={36} strokeWidth={1.4} color={DS.ink[300]} />
      )}
      <Text style={{ fontSize: 15, fontWeight: '600', color: DS.ink[900] }}>
        {hasFilter ? 'Sonuc bulunamadi' : 'Henuz fatura yok'}
      </Text>
      <Text style={{ fontSize: 13, color: DS.ink[400], textAlign: 'center', maxWidth: 300 }}>
        {hasFilter
          ? 'Filtre kriterlerini degistirmeyi deneyin.'
          : 'Bir is emrini teslim ettiginde "Fatura Olustur" ile fatura kesebilirsin.'}
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
// BULK INVOICE MODAL
// ═════════════════════════════════════════════════════════════════════
function BulkInvoiceModal({
  visible, onClose, onCreated,
}: {
  visible: boolean; onClose: () => void; onCreated: (invoiceId: string) => void;
}) {
  const { clinics, loading: loadingClinics } = useClinics();
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);
  const [clinicPickerOpen, setClinicPickerOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [orderSearch, setOrderSearch] = useState('');
  const [dueDays, setDueDays] = useState('30');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const { orders, loading: loadingOrders } = useUnbilledWorkOrders(
    selectedClinicId ?? undefined,
  );

  const selectedClinic = useMemo(
    () => clinics.find(c => c.id === selectedClinicId) ?? null,
    [clinics, selectedClinicId],
  );

  const visibleOrders = useMemo(() => {
    if (!orderSearch.trim()) return orders;
    const sl = orderSearch.toLowerCase();
    return orders.filter(o =>
      o.order_number.toLowerCase().includes(sl) ||
      (o.patient_name ?? '').toLowerCase().includes(sl) ||
      (o.work_type ?? '').toLowerCase().includes(sl),
    );
  }, [orders, orderSearch]);

  const selectedTotal = useMemo(() => {
    return orders
      .filter(o => selectedOrders.has(o.work_order_id))
      .reduce((sum, o) => sum + Number(o.estimated_total ?? 0), 0);
  }, [orders, selectedOrders]);

  const toggleOrder = (id: string) => {
    setSelectedOrders(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allSel = visibleOrders.every(o => selectedOrders.has(o.work_order_id));
    setSelectedOrders(prev => {
      const next = new Set(prev);
      visibleOrders.forEach(o => allSel ? next.delete(o.work_order_id) : next.add(o.work_order_id));
      return next;
    });
  };

  const handleClose = () => {
    setSelectedClinicId(null);
    setSelectedOrders(new Set());
    setOrderSearch('');
    setDueDays('30');
    setNotes('');
    onClose();
  };

  const handleCreate = async () => {
    if (!selectedClinicId || selectedOrders.size === 0) return;
    const dueDaysNum = parseInt(dueDays, 10);
    if (Number.isNaN(dueDaysNum) || dueDaysNum < 0 || dueDaysNum > 365) {
      toast.warning('Vade gun sayisi 0-365 arasinda olmali.');
      return;
    }
    setSaving(true);
    const { data, error } = await createBulkInvoice({
      clinic_id: selectedClinicId,
      work_order_ids: Array.from(selectedOrders),
      due_days: dueDaysNum,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error || !data) {
      toast.error((error as any)?.message ?? 'Fatura olusturulamadi.');
      return;
    }
    onCreated(data.id);
  };

  const allSel = visibleOrders.length > 0 &&
    visibleOrders.every(o => selectedOrders.has(o.work_order_id));

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <View style={{
        flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center', alignItems: 'center', padding: 24,
      }}>
        <View style={{
          backgroundColor: '#FFF', borderRadius: 24,
          width: '100%', maxWidth: 620, maxHeight: '90%', overflow: 'hidden',
          // @ts-ignore web
          boxShadow: modalShadow,
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 22, paddingTop: 22, paddingBottom: 14,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <View style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: '#2563EB' + '15',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Layers size={18} strokeWidth={1.8} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: DS.ink[900] }}>Toplu Fatura</Text>
              <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 1 }}>Birden fazla siparisi tek faturada topla</Text>
            </View>
            <Pressable onPress={handleClose} style={{
              width: 32, height: 32, borderRadius: 10,
              backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer' as any,
            }}>
              <X size={16} strokeWidth={1.8} color={DS.ink[500]} />
            </Pressable>
          </View>

          {/* Clinic picker */}
          <View style={{ paddingHorizontal: 22, paddingTop: 16 }}>
            <Text style={{
              fontSize: 10, fontWeight: '600', letterSpacing: 0.8,
              textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6,
            }}>
              Klinik
            </Text>
            <Pressable
              onPress={() => setClinicPickerOpen(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                height: 44, paddingHorizontal: 14,
                borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                backgroundColor: DS.ink[50],
                cursor: 'pointer' as any,
              }}
            >
              <Building2 size={15} strokeWidth={1.6} color={selectedClinic ? '#2563EB' : DS.ink[400]} />
              <Text style={{
                flex: 1, fontSize: 14, fontWeight: selectedClinic ? '600' : '400',
                color: selectedClinic ? DS.ink[900] : DS.ink[400],
              }} numberOfLines={1}>
                {selectedClinic ? selectedClinic.name : 'Klinik secin...'}
              </Text>
              <ChevronDown size={15} strokeWidth={1.6} color={DS.ink[400]} />
            </Pressable>
          </View>

          {/* Order list */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {!selectedClinicId ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
                <Hand size={28} strokeWidth={1.4} color={DS.ink[300]} />
                <Text style={{ fontSize: 13, color: DS.ink[400] }}>Klinik secerek baslayin</Text>
              </View>
            ) : loadingOrders ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <ActivityIndicator color={DS.ink[400]} />
              </View>
            ) : (
              <View style={{ paddingHorizontal: 22 }}>
                {/* Search + select all */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
                  <View style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                    height: 38, paddingHorizontal: 12,
                    borderRadius: 10, backgroundColor: DS.ink[50],
                    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
                  }}>
                    <Search size={13} strokeWidth={1.6} color={DS.ink[400]} />
                    <TextInput
                      style={{ flex: 1, fontSize: 13, color: DS.ink[900], outline: 'none' as any }}
                      placeholder="Is no, hasta..."
                      placeholderTextColor={DS.ink[400]}
                      value={orderSearch}
                      onChangeText={setOrderSearch}
                    />
                    {orderSearch.length > 0 && (
                      <Pressable onPress={() => setOrderSearch('')}>
                        <X size={13} strokeWidth={1.8} color={DS.ink[400]} />
                      </Pressable>
                    )}
                  </View>
                  {visibleOrders.length > 0 && (
                    <Pressable
                      onPress={toggleAll}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
                        backgroundColor: CHIP_TONES.info.bg,
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Check size={13} strokeWidth={2} color={CHIP_TONES.info.text} />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: CHIP_TONES.info.text }}>
                        {allSel ? 'Kaldir' : 'Tumu'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {visibleOrders.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                    <CircleCheck size={28} strokeWidth={1.4} color={CHIP_TONES.success.text} />
                    <Text style={{ fontSize: 13, color: DS.ink[400] }}>
                      {orderSearch ? 'Sonuc yok' : 'Faturalanmamis siparis yok'}
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 6, marginTop: 10 }}>
                    {visibleOrders.map(order => (
                      <BulkOrderRow
                        key={order.work_order_id}
                        order={order}
                        selected={selectedOrders.has(order.work_order_id)}
                        onToggle={() => toggleOrder(order.work_order_id)}
                      />
                    ))}
                  </View>
                )}

                {/* Due days + notes */}
                {selectedOrders.size > 0 && (
                  <View style={{
                    marginTop: 14, padding: 14, borderRadius: 14,
                    backgroundColor: DS.ink[50], borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
                  }}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ width: 100 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6 }}>
                          Vade (gun)
                        </Text>
                        <TextInput
                          style={{
                            height: 44, paddingHorizontal: 12, borderRadius: 14,
                            borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                            backgroundColor: '#FFF', fontSize: 14, color: DS.ink[900],
                          }}
                          value={dueDays}
                          onChangeText={setDueDays}
                          keyboardType="number-pad"
                          placeholder="30"
                          placeholderTextColor={DS.ink[400]}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6 }}>
                          Not (opsiyonel)
                        </Text>
                        <TextInput
                          style={{
                            height: 44, paddingHorizontal: 12, borderRadius: 14,
                            borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                            backgroundColor: '#FFF', fontSize: 14, color: DS.ink[900],
                          }}
                          value={notes}
                          onChangeText={setNotes}
                          placeholder="Or: Mart 2026 toplu"
                          placeholderTextColor={DS.ink[400]}
                        />
                      </View>
                    </View>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 22, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: DS.ink[500] }}>
                {selectedOrders.size > 0 ? `${selectedOrders.size} siparis` : 'Secim yok'}
              </Text>
              <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color: DS.ink[900] }}>
                {selectedTotal > 0 ? fmtMoney(selectedTotal) : '—'}
              </Text>
            </View>
            <Pressable
              onPress={handleCreate}
              disabled={selectedOrders.size === 0 || saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 20, paddingVertical: 12,
                borderRadius: 9999, backgroundColor: DS.ink[900],
                opacity: (selectedOrders.size === 0 || saving) ? 0.4 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Receipt size={14} strokeWidth={1.8} color="#FFF" />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Fatura Olustur</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {/* Clinic picker inner modal */}
      <Modal visible={clinicPickerOpen} animationType="fade" transparent onRequestClose={() => setClinicPickerOpen(false)}>
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'center', alignItems: 'center', padding: 24,
        }}>
          <View style={{
            backgroundColor: '#FFF', borderRadius: 24,
            width: '100%', maxWidth: 420, maxHeight: 420, overflow: 'hidden',
            // @ts-ignore web
            boxShadow: modalShadow,
          }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 22, paddingVertical: 16,
              borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
            }}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: DS.ink[900] }}>Klinik Sec</Text>
              <Pressable onPress={() => setClinicPickerOpen(false)} style={{
                width: 30, height: 30, borderRadius: 8,
                backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer' as any,
              }}>
                <X size={14} strokeWidth={1.8} color={DS.ink[500]} />
              </Pressable>
            </View>
            {loadingClinics ? (
              <ActivityIndicator color={DS.ink[400]} style={{ padding: 24 }} />
            ) : (
              <ScrollView>
                {clinics.map(cl => {
                  const sel = selectedClinicId === cl.id;
                  return (
                    <Pressable
                      key={cl.id}
                      onPress={() => {
                        setSelectedClinicId(cl.id);
                        setSelectedOrders(new Set());
                        setClinicPickerOpen(false);
                      }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingHorizontal: 22, paddingVertical: 14,
                        borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
                        backgroundColor: sel ? CHIP_TONES.info.bg : 'transparent',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Building2 size={15} strokeWidth={1.6} color={sel ? '#2563EB' : DS.ink[400]} />
                      <Text style={{
                        flex: 1, fontSize: 14,
                        fontWeight: sel ? '600' : '400',
                        color: sel ? '#2563EB' : DS.ink[900],
                      }} numberOfLines={1}>
                        {cl.name}
                      </Text>
                      {sel && <Check size={15} strokeWidth={2} color="#2563EB" />}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

// ─── Bulk Order Row ─────────────────────────────────────────────────
function BulkOrderRow({ order, selected, onToggle }: {
  order: UnbilledWorkOrder; selected: boolean; onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 12, borderRadius: 14,
        backgroundColor: selected ? CHIP_TONES.info.bg : DS.ink[50],
        borderWidth: 1.5,
        borderColor: selected ? '#2563EB' : 'transparent',
        cursor: 'pointer' as any,
      }}
    >
      {/* Checkbox */}
      <View style={{
        width: 20, height: 20, borderRadius: 6,
        borderWidth: 1.5, borderColor: selected ? '#2563EB' : DS.ink[300],
        backgroundColor: selected ? '#2563EB' : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && <Check size={12} strokeWidth={2.5} color="#FFF" />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#2563EB' }}>{order.order_number}</Text>
        <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[900], marginTop: 1 }} numberOfLines={1}>
          {order.patient_name ?? '—'}
          {order.work_type ? ` · ${order.work_type}` : ''}
        </Text>
        <Text style={{ fontSize: 10, color: DS.ink[400], marginTop: 2 }}>
          Teslim: {order.delivered_at
            ? new Date(order.delivered_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
            : '—'}
        </Text>
      </View>
      <Text style={{ ...DISPLAY, fontSize: 14, letterSpacing: -0.3, color: DS.ink[900] }}>
        {Number(order.estimated_total) > 0 ? fmtMoney(order.estimated_total) : '—'}
      </Text>
    </Pressable>
  );
}

// ═════════════════════════════════════════════════════════════════════
// BULK PAYMENT MODAL
// ═════════════════════════════════════════════════════════════════════
const PAYMENT_METHODS = [
  { v: 'nakit'  as const, l: 'Nakit',  icon: Banknote },
  { v: 'kart'   as const, l: 'Kart',   icon: CreditCard },
  { v: 'havale' as const, l: 'Havale', icon: Landmark },
  { v: 'cek'    as const, l: 'Cek',    icon: File },
];

function BulkPaymentModal({
  visible, invoices, onClose, onDone,
}: {
  visible: boolean; invoices: Invoice[]; onClose: () => void; onDone: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'nakit' | 'kart' | 'havale' | 'cek'>('nakit');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (visible) {
      setSelected(new Set());
      setAmount('');
      setMethod('nakit');
      setNotes('');
    }
  }, [visible]);

  const sortedInvoices = useMemo(() =>
    [...invoices].sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    }), [invoices]);

  const totalBalance = useMemo(() =>
    sortedInvoices
      .filter(inv => selected.has(inv.id))
      .reduce((s, inv) => s + Number(inv.total) - Number(inv.paid_amount), 0),
    [sortedInvoices, selected]);

  const toggleAll = () => {
    if (selected.size === sortedInvoices.length) setSelected(new Set());
    else setSelected(new Set(sortedInvoices.map(i => i.id)));
  };

  const handlePay = async () => {
    if (selected.size === 0) return;
    const amt = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Gecerli bir tutar girin.');
      return;
    }
    setSaving(true);
    const { error } = await bulkRecordPayment({
      invoice_ids: Array.from(selected),
      total_amount: amt,
      payment_method: method,
      notes: notes.trim() || undefined,
    });
    setSaving(false);
    if (error) {
      toast.error((error as any)?.message ?? 'Islem gerceklestirilemedi.');
      return;
    }
    onDone();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{
        flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center', alignItems: 'center', padding: 24,
      }}>
        <View style={{
          backgroundColor: '#FFF', borderRadius: 24,
          width: '100%', maxWidth: 580, maxHeight: '90%', overflow: 'hidden',
          // @ts-ignore web
          boxShadow: modalShadow,
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 22, paddingTop: 22, paddingBottom: 14,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <View style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: CHIP_TONES.success.bg,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Banknote size={18} strokeWidth={1.8} color={CHIP_TONES.success.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: DS.ink[900] }}>Toplu Tahsilat</Text>
              <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 1 }}>Birden fazla faturayi tek seferde tahsil et</Text>
            </View>
            <Pressable onPress={onClose} style={{
              width: 32, height: 32, borderRadius: 10,
              backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer' as any,
            }}>
              <X size={16} strokeWidth={1.8} color={DS.ink[500]} />
            </Pressable>
          </View>

          {/* Invoice list */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {/* Select all header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 22, paddingVertical: 10,
            }}>
              <Pressable onPress={toggleAll} style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                cursor: 'pointer' as any,
              }}>
                <View style={{
                  width: 18, height: 18, borderRadius: 5,
                  borderWidth: 1.5,
                  borderColor: selected.size === sortedInvoices.length && sortedInvoices.length > 0 ? '#059669' : DS.ink[300],
                  backgroundColor: selected.size === sortedInvoices.length && sortedInvoices.length > 0 ? '#059669' : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected.size === sortedInvoices.length && sortedInvoices.length > 0 && (
                    <Check size={11} strokeWidth={2.5} color="#FFF" />
                  )}
                </View>
                <Text style={{ fontSize: 12, fontWeight: '600', color: CHIP_TONES.info.text }}>
                  {selected.size === sortedInvoices.length && sortedInvoices.length > 0 ? 'Tumunu kaldir' : 'Tumunu sec'}
                </Text>
              </Pressable>
              <Text style={{ fontSize: 11, color: DS.ink[400] }}>{sortedInvoices.length} fatura</Text>
            </View>

            <View style={{ gap: 6, paddingHorizontal: 22, paddingBottom: 8 }}>
              {sortedInvoices.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
                  <CircleCheck size={28} strokeWidth={1.4} color={CHIP_TONES.success.text} />
                  <Text style={{ fontSize: 13, color: DS.ink[400] }}>Bekleyen fatura yok</Text>
                </View>
              ) : sortedInvoices.map(inv => {
                const bal = Number(inv.total) - Number(inv.paid_amount);
                const sel = selected.has(inv.id);
                const overdue = inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10);
                return (
                  <Pressable
                    key={inv.id}
                    onPress={() => setSelected(prev => {
                      const n = new Set(prev);
                      n.has(inv.id) ? n.delete(inv.id) : n.add(inv.id);
                      return n;
                    })}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 10,
                      padding: 12, borderRadius: 14,
                      backgroundColor: sel ? 'rgba(45,154,107,0.06)' : DS.ink[50],
                      borderWidth: 1.5,
                      borderColor: sel ? '#059669' : overdue && !sel ? 'rgba(217,75,75,0.2)' : 'transparent',
                      cursor: 'pointer' as any,
                    }}
                  >
                    <View style={{
                      width: 20, height: 20, borderRadius: 6,
                      borderWidth: 1.5,
                      borderColor: sel ? '#059669' : DS.ink[300],
                      backgroundColor: sel ? '#059669' : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {sel && <Check size={12} strokeWidth={2.5} color="#FFF" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }}>{inv.invoice_number}</Text>
                      <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 2 }} numberOfLines={1}>
                        {inv.clinic?.name ?? '—'}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{
                        ...DISPLAY, fontSize: 14, letterSpacing: -0.3,
                        color: overdue ? CHIP_TONES.danger.text : DS.ink[900],
                      }}>
                        {fmtMoney(bal)}
                      </Text>
                      {inv.due_date && (
                        <Text style={{
                          fontSize: 10, marginTop: 2,
                          color: overdue ? CHIP_TONES.danger.text : DS.ink[400],
                        }}>
                          {overdue ? 'gecti · ' : ''}{fmtDate(inv.due_date)}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Payment form */}
            {selected.size > 0 && (
              <View style={{
                marginHorizontal: 22, marginTop: 8, marginBottom: 8,
                padding: 16, borderRadius: 14,
                backgroundColor: DS.ink[50], borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
                gap: 12,
              }}>
                {/* Amount */}
                <View>
                  <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6 }}>
                    Odeme Tutari (TL)
                  </Text>
                  <TextInput
                    style={{
                      height: 44, paddingHorizontal: 14, borderRadius: 14,
                      borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                      backgroundColor: '#FFF', fontSize: 14, color: DS.ink[900],
                    }}
                    value={amount}
                    onChangeText={setAmount}
                    placeholder={totalBalance.toFixed(2)}
                    placeholderTextColor={DS.ink[400]}
                    keyboardType="decimal-pad"
                  />
                  <Text style={{ fontSize: 10, color: DS.ink[400], marginTop: 4 }}>
                    Secili toplam: {fmtMoney(totalBalance)}
                  </Text>
                </View>

                {/* Method */}
                <View>
                  <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6 }}>
                    Yontem
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {PAYMENT_METHODS.map(m => {
                      const active = method === m.v;
                      const MIcon = m.icon;
                      return (
                        <Pressable
                          key={m.v}
                          onPress={() => setMethod(m.v)}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 5,
                            paddingHorizontal: 12, paddingVertical: 7,
                            borderRadius: 9999,
                            borderWidth: 1.5,
                            borderColor: active ? '#059669' : 'rgba(0,0,0,0.08)',
                            backgroundColor: active ? 'rgba(45,154,107,0.06)' : '#FFF',
                            cursor: 'pointer' as any,
                          }}
                        >
                          <MIcon size={13} strokeWidth={1.6} color={active ? '#059669' : DS.ink[400]} />
                          <Text style={{
                            fontSize: 12, fontWeight: active ? '600' : '500',
                            color: active ? '#059669' : DS.ink[500],
                          }}>
                            {m.l}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Notes */}
                <View>
                  <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6 }}>
                    Not (opsiyonel)
                  </Text>
                  <TextInput
                    style={{
                      height: 44, paddingHorizontal: 14, borderRadius: 14,
                      borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                      backgroundColor: '#FFF', fontSize: 14, color: DS.ink[900],
                    }}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Odeme notu..."
                    placeholderTextColor={DS.ink[400]}
                  />
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 22, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, color: DS.ink[500] }}>{selected.size} fatura secili</Text>
              {totalBalance > 0 && (
                <Text style={{ ...DISPLAY, fontSize: 16, letterSpacing: -0.3, color: DS.ink[900] }}>
                  {fmtMoney(totalBalance)} toplam
                </Text>
              )}
            </View>
            <Pressable
              onPress={handlePay}
              disabled={selected.size === 0 || saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 20, paddingVertical: 12,
                borderRadius: 9999, backgroundColor: '#059669',
                opacity: (selected.size === 0 || saving) ? 0.4 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Banknote size={14} strokeWidth={1.8} color="#FFF" />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Tahsil Et</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default InvoicesListScreen;
