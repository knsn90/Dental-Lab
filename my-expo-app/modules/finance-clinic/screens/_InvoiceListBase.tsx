/**
 * Mali İşlemler — Fatura Liste (paylaşılan base).
 * "open" filtresi = tüm açık faturalar; "overdue" = sadece vadesi geçenler.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { FileText, AlertCircle, CreditCard, ChevronLeft, ChevronRight, CheckCircle2, Clock } from '../../../core/ui/icons';
import { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';

import { DS } from '../../../core/theme/dsTokens';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { fetchOpenInvoices, type ClinicInvoiceRow } from '../api';
import {
  DISPLAY, TRY, M, Mnat, fmtDate, PAGE_PADDING,
  ErrorBar, Loader, Card, EmptyCard, StatusChip, PillButton,
} from '../components/atoms';
import { WhiteHero } from '../../../core/ui/WhiteHero';
import { startMyInvoicePayment } from '../../payments/api';
import { BulkPayModal } from '../components/BulkPayModal';
import { PaymentSheetModal } from '../../payments/components/PaymentSheetModal';
import { toast } from '../../../core/ui/Toast';
import { useRates, rateToBase } from '../../../core/money/rateCache';
import { getBaseCurrency } from '../../../core/money/baseCurrency';
import { groupByCurrency } from '../../../core/money/aggregations';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import { MobileTableX, MobileTableRowX, MobileTableIconX, useMobileTableText } from '../../../core/ui/MobileTableX';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { useInkUI } from '../../../core/theme/inkScale';

type Props = {
  clinicId: string;
  /** Açılıştaki filtre; kullanıcı hero'daki iki kapsülle değiştirebilir. */
  initialFilter?: 'open' | 'overdue';
};

/**
 * Metinler filtreye göre BURADA çözülür. Eskiden "Bekleyen" ve "Vadesi Geçen"
 * iki ayrı sekmeydi ve aynı listeyi iki kez gösteriyordu (vadesi geçenler
 * zaten bekleyenlerin alt kümesi); tek ekranda kapsül filtresine indirildi.
 */
const VIEW_TEXTS = {
  open: {
    eyebrow: 'Açık Faturalar',
    title: 'Bekleyen Ödemeler',
    emptyTitle: 'Bekleyen ödeme yok',
    emptyDescription: 'Tüm açık faturalar tahsil edilmiş.',
  },
  overdue: {
    eyebrow: 'Acil Tahsilat',
    title: 'Vadesi Geçen',
    emptyTitle: 'Vadesi geçen fatura yok',
    emptyDescription: 'Tüm faturalarınız zamanında ödeniyor.',
  },
} as const;

export function InvoiceListBase({ clinicId, initialFilter = 'open' }: Props) {
  const [filter, setFilter] = useState<'open' | 'overdue'>(initialFilter);
  // Sekme dışarıdan değişirse (Özet'teki "Tümü →" bağlantısı) takip et.
  useEffect(() => { setFilter(initialFilter); }, [initialFilter]);
  const texts = VIEW_TEXTS[filter];
  const emptyIcon = filter === 'overdue' ? CheckCircle2 : Clock;
  useRates();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const U = useInkUI();
  const MT = useMobileTableText();
  const router = useRouter();
  const segments = useSegments();
  const panelBase = String(segments?.[0] ?? '(clinic)');
  const [items, setItems] = useState<ClinicInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "Öde" → lab'ın Entegrasyonlar'da tanımladığı AKTİF POS (iyzico vb.) ile
  // ödeme intent'i açar ve kart sayfasına gider. Sağlayıcı yoksa RPC hata
  // döndürür; kullanıcıyı boş bir kart formuna göndermiyoruz.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [payToken, setPayToken] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  // "Öde" satırın İÇİNDE; web'de tıklama satıra da sıçrar (DOM bubbling) ve
  // fatura detayı ile ödeme sayfası yarışırdı. Kısa ömürlü bayrak: düğmeye
  // basılan tıklamayı satır yutar.
  const suppressRowPress = useRef(false);
  const startPay = useCallback(async (invoiceId: string) => {
    suppressRowPress.current = true;
    setTimeout(() => { suppressRowPress.current = false; }, 400);
    if (payingId) return;
    setPayingId(invoiceId);
    const r = await startMyInvoicePayment(invoiceId);
    setPayingId(null);
    if (r.error || !r.token) { toast.error(r.error ?? autoT('Ödeme başlatılamadı')); return; }
    setPayToken(r.token);   // ayrı sayfa değil, modal
  }, [payingId]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await fetchOpenInvoices(clinicId)); }
    catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, [clinicId]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'overdue') return items.filter(i => i.days_overdue > 0);
    return items;
  }, [items, filter]);

  const overdueCount = filtered.filter(i => i.days_overdue > 0).length;

  // Katı per-currency: kalan tutar para birimine göre BAĞIMSIZ (asla toplanmaz)
  const remByCcy = groupByCurrency(filtered, i => ({ amount: Number(i.remaining) || 0, currency: (i.currency || 'TRY') as Currency }));

  if (loading) return <Loader />;
  if (error)   return <View style={{ padding: PAGE_PADDING }}><ErrorBar message={error} /></View>;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: PAGE_PADDING, paddingBottom: 48, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Beyaz hero: sayfa başlığı + kalan tutar aynı yüzeyde. Gecikme
          listesinde accent tehlike rengine döner (fatura detayıyla aynı kural),
          böylece "burası geciken liste" tek bakışta anlaşılır. */}
      <WhiteHero
        compact
        accent={filter === 'overdue' ? '#D94B4B' : undefined}
        kicker={texts.eyebrow}
        title={texts.title}
        description={overdueCount > 0 && filter !== 'overdue'
          ? `${overdueCount} ${autoT('faturanın vadesi geçmiş')}`
          : undefined}
        stats={[
          { value: String(filtered.length), label: autoT('Fatura') },
          /* Para birimleri ASLA toplanmaz: her biri kendi kutucuğunda durur.
             İkiden fazlası hero'yu taşırıyor, kalanı listede zaten görünür. */
          ...remByCcy.slice(0, 2).map(sum => ({
            value: formatMoney(sum.total, sum.currency, { fractionDigits: 0 }),
            label: autoT('Kalan'),
          })),
        ]}
      >
        {/* İki görünüm tek ekranda: tümü ↔ yalnız vadesi geçenler.
            Sağda toplu ödeme: tek karttan tüm bakiye ya da kısmi tutar. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {([
            { key: 'open'    as const, label: autoT('Tümü'),          count: items.length },
            { key: 'overdue' as const, label: autoT('Vadesi geçen'),  count: items.filter(i => i.days_overdue > 0).length },
          ]).map(opt => {
            const active = filter === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setFilter(opt.key)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: active ? 16 : 12, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: active
                    ? (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.85)')
                    : 'transparent',
                  borderWidth: 1,
                  borderColor: active
                    ? 'transparent'
                    : (isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.9)'),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}>
                <Text style={{
                  fontSize: 12.5, fontWeight: active ? '700' : '600',
                  color: isDark ? '#FFFFFF' : DS.ink[900],
                }}>
                  {opt.label}
                </Text>
                <Text style={{ fontSize: 11.5, color: isDark ? 'rgba(255,255,255,0.65)' : DS.ink[500] }}>
                  {opt.count}
                </Text>
              </Pressable>
            );
          })}

          <View style={{ flex: 1 }} />

          {items.length > 0 && (
            <Pressable
              onPress={() => setBulkOpen(true)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
                backgroundColor: isDark ? '#FFFFFF' : DS.ink[900],
                opacity: pressed ? 0.85 : 1,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}>
              <CreditCard size={13} color={isDark ? DS.ink[900] : '#FFFFFF'} strokeWidth={2} />
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: isDark ? DS.ink[900] : '#FFFFFF' }}>
                {autoT('Toplu Ödeme')}
              </Text>
            </Pressable>
          )}
        </View>
      </WhiteHero>

      {filtered.length === 0 ? (
        <EmptyCard icon={emptyIcon} title={texts.emptyTitle} description={texts.emptyDescription} />
      ) : (
        /* Ekstre / giderler mobil tablosuyla aynı kalıp */
        <MobileTableX
          title={texts.title} count={filtered.length} countLabel="fatura"
          accent={filter === 'overdue' ? '#D94B4B' : undefined}
          footer={<>
            <Text style={MT.footNote}>{filtered.length} fatura</Text>
            <View style={{ flex: 1 }} />
            <Text style={MT.footLabel}>Kalan:</Text>
            <MoneyMultiX slices={remByCcy} variant="inline" />
          </>}
        >
          {filtered.map((inv, i) => {
            const isOverdue = inv.days_overdue > 0;
            const overdueInk = isDark ? '#F3A0A0' : '#9C2E2E';
            return (
              <MobileTableRowX
                key={inv.id}
                isLast={i === filtered.length - 1}
                tint={isOverdue ? (isDark ? 'rgba(217,75,75,0.08)' : 'rgba(217,75,75,0.03)') : undefined}
                onPress={() => {
                  if (suppressRowPress.current) return;   // "Öde"ye basıldı
                  router.push(`/${panelBase}/invoice/${inv.invoice_no ?? inv.id}` as any);
                }}
              >
                <MobileTableIconX icon={isOverdue ? AlertCircle : FileText} tone={isOverdue
                  ? { bg: isDark ? 'rgba(217,75,75,0.24)' : 'rgba(217,75,75,0.10)', fg: overdueInk }
                  : undefined} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[MT.title, { flexShrink: 1 }]} numberOfLines={1}>
                      {inv.invoice_no ?? '—'}
                    </Text>
                    <StatusChip status={inv.status} />
                  </View>
                  {/* Hekim isteği: faturanın hangi hastaya ait olduğu her sekmede görünsün. */}
                  {!!inv.patient_name && (
                    <Text style={MT.sub} numberOfLines={1}>
                      {[inv.patient_name, inv.order_no].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  <Text style={[MT.meta, { marginTop: 2 }, isOverdue ? { color: overdueInk, fontWeight: '600' } : null]} numberOfLines={2}>
                    {isOverdue
                      ? `${inv.days_overdue} ${autoT('gün gecikmiş')} · ${autoT('vade')} ${fmtDate(inv.due_date)}`
                      : `${autoT('Vade')} ${fmtDate(inv.due_date)} · ${Math.abs(inv.days_overdue)} ${autoT('gün kaldı')}`}
                    {inv.paid_amount > 0 ? `  ·  ${Mnat(inv.paid_amount, inv.currency)} ${autoT('ödendi')}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[MT.amount, { color: isOverdue ? overdueInk : U.ink[900] }]}>
                      {Mnat(inv.remaining, inv.currency)}
                    </Text>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: U.ink[400], textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 1 }}>
                      Kalan
                    </Text>
                  </View>
                  <GlassTooltip title={autoT('Öde')} text={autoT('Faturayı kartla öder')}>
                    <PillButton
                      variant={isOverdue ? 'danger' : 'dark'}
                      size="sm"
                      leftIcon={<CreditCard size={12} color="#FFF" />}
                      disabled={payingId === inv.id}
                      onPress={() => startPay(inv.id)}
                    >
                      {payingId === inv.id ? autoT('Açılıyor…') : autoT('Öde')}
                    </PillButton>
                  </GlassTooltip>
                </View>
              </MobileTableRowX>
            );
          })}
        </MobileTableX>
      )}

      <BulkPayModal
        visible={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onStarted={tok => { setBulkOpen(false); setPayToken(tok); }}
      />
      <PaymentSheetModal
        token={payToken}
        onClose={() => setPayToken(null)}
        onPaid={() => { setPayToken(null); void load(); }}
      />
    </ScrollView>
  );
}
