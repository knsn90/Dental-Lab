/**
 * ExpenseDetailScreen — Gider Detayı.
 *
 * Gider listesindeki satır tek satırlık bir açıklamadır
 * ("Kurye · Teslimat · Lab → Klinik · #LAB-2026-17 · BanaBiKurye") ve bu satır
 * asıl bilgiyi saklar: hangi teslimat, hangi kurye, hangi rota, hangi saatte,
 * ücreti nereden geldi. Bu ekran o kaydı açar.
 *
 * KAYNAK KAYIT: kurye giderleri `expenses.delivery_id` ile teslimat kaydına
 * bağlıdır — açıklamadaki sipariş numarasını ayrıştırmaya gerek yok. Satın alma
 * faturasından doğan giderlerde ilgili fatura sayfasına köprü verilir.
 *
 * TASARIM — DESIGN_LANGUAGE.md: DS token + inline style, kart radius 18,
 * display başlık Inter Tight 300, panel accent'i usePanelTheme'den.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, Platform, Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams, useSegments } from 'expo-router';
import {
  ArrowLeft, ArrowRight, ArrowLeftRight, Truck, Calendar, CreditCard,
  FileText, Receipt, User, Phone, MapPin, Hash, Package, Building2,
  CircleCheck, CircleDot, Clock, TriangleAlert, ExternalLink,
  Building, Users, Wrench, MoreHorizontal,
} from '../../../core/ui/icons';
import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { formatAddress } from '../../../core/util/formatAddress';
import { safeBack } from '../../../core/util/safeBack';
import { localeTag, isRTL } from '../../../core/i18n';
import { DELIVERY_PURPOSE_LABELS, type DeliveryPurpose } from '../../orders/api';
import { DELIVERY_STATUS_CFG } from '../../orders/components/OrderLogisticsCard';
import {
  fetchExpenseDetail, EXPENSE_CATEGORY_LABELS, EXPENSE_CATEGORY_COLORS,
  type Expense, type ExpenseDelivery, type ExpenseCategory,
} from '../api';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};
const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

/** Kategori ikonu — gider listesiyle aynı dil (Lucide, flat line). */
const CAT_ICON: Record<string, any> = {
  malzeme: Package, kira: Building, personel: Users, ekipman: Wrench,
  vergi: Receipt, kurye: Truck, diger: MoreHorizontal,
};

const PAY_LABEL: Record<string, string> = {
  nakit: 'Nakit', kart: 'Kart', havale: 'Havale/EFT', cek: 'Çek', diger: 'Diğer',
};

/** Ücretin nereden geldiği — elle mi girildi, entegrasyondan mı. */
const FEE_SOURCE_LABEL: Record<string, string> = {
  banabikurye: 'BanaBiKurye entegrasyonu',
  manual:      'Elle girildi',
  tariff:      'Tarifeden',
};

function fmtDay(d?: string | null): string {
  if (!d) return '—';
  const iso = d.length === 10 ? d + 'T00:00:00' : d;
  return new Date(iso).toLocaleDateString(localeTag(), {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}
function fmtStamp(d?: string | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleString(localeTag(), {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={[{
      backgroundColor: isDark ? T.card : DS.lab.surface, borderRadius: 18,
      borderWidth: 1, borderColor: isDark ? T.hairline : DS.ink[200], padding: 20,
    }, style]}>
      {children}
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <Text style={{
      fontSize: 10, fontWeight: '600', letterSpacing: 1.1,
      textTransform: 'uppercase', color: isDark ? T.ink3 : DS.ink[400], marginBottom: 10,
    }}>
      {children}
    </Text>
  );
}

function InfoRow({ icon: Icon, label, value, onPress }: {
  icon: any; label: string; value: string; onPress?: () => void;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 5 }}>
      <Icon size={14} color={isDark ? T.ink3 : DS.ink[400]} strokeWidth={1.7} style={{ marginTop: 2 }} />
      <Text style={{ fontSize: 12, color: isDark ? T.ink3 : DS.ink[500], width: 110 }}>{label}</Text>
      <Text style={{
        flex: 1, fontSize: 13,
        color: onPress ? DS.lab.primaryDeep : (isDark ? T.ink : DS.ink[900]),
        ...(onPress ? { fontWeight: '600' as const } : {}),
      }}>
        {value}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, ...webCursor })}>
      {body}
    </Pressable>
  );
}

/** Atandı → Aldı → Teslim edildi (veya İptal) — dolu olan damgalar sırayla. */
function Timeline({ delivery }: { delivery: ExpenseDelivery }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const steps = [
    { label: 'Atandı',        at: delivery.assigned_at,  icon: CircleDot },
    { label: 'Teslim alındı', at: delivery.picked_up_at, icon: Package },
    { label: 'Teslim edildi', at: delivery.delivered_at, icon: CircleCheck },
  ].filter(s => s.at);

  if (delivery.cancelled_at) {
    steps.push({ label: 'İptal edildi', at: delivery.cancelled_at, icon: TriangleAlert });
  }
  if (steps.length === 0) return null;

  return (
    <View style={{ gap: 0 }}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const cancelled = s.label === 'İptal edildi';
        const tone = cancelled ? DS.lab.danger : (last ? DS.lab.success : (isDark ? T.ink3 : DS.ink[400]));
        return (
          <View key={s.label} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center', width: 20 }}>
              <s.icon size={14} color={tone} strokeWidth={1.9} />
              {!last ? <View style={{ flex: 1, width: 1.5, backgroundColor: isDark ? T.hairline : DS.ink[200], marginVertical: 3 }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: cancelled ? DS.lab.danger : (isDark ? T.ink : DS.ink[900]) }}>
                {s.label}
              </Text>
              <Text style={{ fontSize: 11, color: isDark ? T.ink3 : DS.ink[500], marginTop: 1 }}>{fmtStamp(s.at)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

interface Props {
  /** Hub içinde gömülü açılırken — route param yerine doğrudan id verilir */
  expenseId?: string;
  /** Gömülü kullanımda geri dönüş; verilmezse route geçmişi kullanılır */
  onBack?: () => void;
  /** Satın alma faturasını aynı ekran içinde açmak için (gömülü kullanım) */
  onOpenInvoice?: (invoiceId: string) => void;
}

export function ExpenseDetailScreen({ expenseId, onBack, onOpenInvoice }: Props = {}) {
  const router      = useRouter();
  const segments    = useSegments();
  const panel       = (segments?.[0] as string) ?? '(lab)';
  const theme       = usePanelTheme();
  const routeParams = useLocalSearchParams<{ id: string }>();
  const id = expenseId ?? routeParams.id;

  const [expense, setExpense]   = useState<Expense | null>(null);
  const [delivery, setDelivery] = useState<ExpenseDelivery | null>(null);
  const [creator, setCreator]   = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const r = await fetchExpenseDetail(id);
    setExpense(r.expense);
    setDelivery(r.delivery);
    setCreator(r.createdByName);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const goBack = () => {
    if (onBack) { onBack(); return; }
    safeBack(`/${panel}/expenses`);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', paddingVertical: 96 }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!expense) {
    return (
      <View style={{ flex: 1, alignItems: 'center', paddingVertical: 96, gap: 12 }}>
        <Receipt size={30} color={DS.ink[300]} strokeWidth={1.4} />
        <Text style={{ fontSize: 14, color: DS.ink[500] }}>Gider bulunamadı</Text>
        <Pressable onPress={goBack} style={{ ...webCursor }}>
          <Text style={{ fontSize: 13, color: theme.primary, fontWeight: '600' }}>Geri dön</Text>
        </Pressable>
      </View>
    );
  }

  const currency = (expense.currency ?? 'TRY') as Currency;
  const baseCcy  = expense.base_currency_at_time;
  const rate     = Number(expense.rate_at_time) || 0;
  const isForeign = !!baseCcy && baseCcy !== currency && rate > 0 && rate !== 1;

  const catLabel = EXPENSE_CATEGORY_LABELS[expense.category as ExpenseCategory] ?? expense.category;
  const catColor = EXPENSE_CATEGORY_COLORS[expense.category as ExpenseCategory] ?? theme.primary;
  const HeroIcon = CAT_ICON[expense.category] ?? Receipt;

  const statusCfg = delivery ? (DELIVERY_STATUS_CFG[delivery.status] ?? null) : null;
  const purposeLabel = delivery?.purpose
    ? (DELIVERY_PURPOSE_LABELS[delivery.purpose as DeliveryPurpose] ?? delivery.purpose)
    : null;
  const outbound = delivery?.direction !== 'clinic_to_lab';

  const courierName  = delivery?.ext_courier_name ?? delivery?.courier?.full_name ?? null;
  const courierPhone = delivery?.ext_courier_phone ?? delivery?.courier?.phone ?? null;

  // Gider tutarı teslimat ücretinden ayrışmışsa (elle düzeltilmiş olabilir) söyle.
  const feeAmount = delivery?.fee_amount != null ? Number(delivery.fee_amount) : null;
  const feeDiffers = feeAmount != null && Math.abs(feeAmount - Number(expense.amount)) > 0.01;

  const orderId  = delivery?.work_order?.id ?? delivery?.work_order_id ?? null;
  const orderNo  = delivery?.work_order?.order_number ?? null;

  const openOrder = () => { if (orderId) router.push(`/${panel}/order/${orderId}` as any); };
  const openInvoice = () => {
    const inv = expense.purchase_invoice_id;
    if (!inv) return;
    if (onOpenInvoice) onOpenInvoice(inv);
    else router.push(`/${panel}/purchase-invoice/${inv}` as any);
  };
  const callPhone = (p: string) => { Linking.openURL(`tel:${p.replace(/\s/g, '')}`).catch(() => {}); };

  const originLine = delivery
    ? (formatAddress(delivery.origin_address) || delivery.origin_name || (outbound ? 'Laboratuvar' : 'Klinik'))
    : '';
  const destLine = delivery ? formatAddress(delivery.destination_address) : '';

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: PAGE_PADDING, paddingBottom: 80, gap: 16, maxWidth: 1080, width: '100%', alignSelf: 'center' }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Üst şerit ─────────────────────────────────────────── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => ({
            width: 32, height: 32, borderRadius: 999, alignItems: 'center',
            justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.05)',
            opacity: pressed ? 0.6 : 1, ...webCursor,
          })}
        >
          {isRTL() ? <ArrowRight size={16} color={DS.ink[700]} strokeWidth={1.9} /> : <ArrowLeft size={16} color={DS.ink[700]} strokeWidth={1.9} />}
        </Pressable>
        <Text style={{
          flex: 1, fontSize: 10, fontWeight: '500', letterSpacing: 1.2,
          textTransform: 'uppercase', color: DS.ink[500],
        }}>
          Gider · {catLabel}
        </Text>
        {orderId ? (
          <Pressable
            onPress={openOrder}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
              borderWidth: 1, borderColor: DS.ink[200], backgroundColor: DS.lab.surface,
              opacity: pressed ? 0.7 : 1, ...webCursor,
            })}
          >
            <ExternalLink size={14} color={DS.ink[700]} strokeWidth={1.8} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800] }}>Siparişi aç</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── Hero: açıklama + tutar ────────────────────────────── */}
      <View style={{ borderRadius: 18, padding: 24, gap: 6, backgroundColor: theme.primary }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{
            width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(255,255,255,0.20)',
          }}>
            <HeroIcon size={12} color="#FFFFFF" strokeWidth={1.9} />
          </View>
          <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>
            {catLabel} · {fmtDay(expense.expense_date)}
          </Text>
        </View>
        <Text numberOfLines={3} style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.5, color: '#FFFFFF' }}>
          {expense.description}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          <Text style={{ ...DISPLAY, fontSize: 34, letterSpacing: -1, color: '#FFFFFF' }}>
            {formatMoney(Number(expense.amount) || 0, currency, { fractionDigits: 2 })}
          </Text>
          {isForeign ? (
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', paddingBottom: 6 }}>
              ≈ {formatMoney(Number(expense.amount_base) || 0, baseCcy as Currency, { fractionDigits: 2 })}
              {'  ·  '}1 {currency} = {rate.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} {baseCcy}
            </Text>
          ) : null}
        </View>
      </View>

      {/* ── Tutar / ücret farkı uyarısı ───────────────────────── */}
      {feeDiffers ? (
        <View style={{
          flexDirection: 'row', gap: 10, alignItems: 'flex-start',
          borderRadius: 18, padding: 16,
          backgroundColor: 'rgba(232,155,42,0.10)',
          borderWidth: 1, borderColor: 'rgba(232,155,42,0.32)',
        }}>
          <TriangleAlert size={16} color="#9C5E0E" strokeWidth={1.9} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#9C5E0E' }}>
              Gider tutarı teslimat ücretinden farklı
            </Text>
            <Text style={{ fontSize: 12, color: DS.ink[700], lineHeight: 18 }}>
              Teslimat kaydındaki ücret {formatMoney(feeAmount!, (delivery?.fee_currency ?? currency) as Currency, { fractionDigits: 2 })},
              gider satırı {formatMoney(Number(expense.amount) || 0, currency, { fractionDigits: 2 })} diyor.
              Genelde sebebi gider satırının sonradan elle düzeltilmesidir.
            </Text>
          </View>
        </View>
      ) : null}

      {/* ── Gider bilgileri ───────────────────────────────────── */}
      <Card>
        <Label>Gider Bilgileri</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
          <Receipt size={14} color={DS.ink[400]} strokeWidth={1.7} />
          <Text style={{ fontSize: 12, color: DS.ink[500], width: 110 }}>Kategori</Text>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
            backgroundColor: catColor + '18',
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: catColor }} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[800] }}>{catLabel}</Text>
          </View>
        </View>
        <InfoRow icon={Calendar}   label="Gider tarihi" value={fmtDay(expense.expense_date)} />
        <InfoRow icon={CreditCard} label="Ödeme" value={PAY_LABEL[expense.payment_method] ?? expense.payment_method} />
        {expense.notes ? <InfoRow icon={FileText} label="Not" value={expense.notes} /> : null}
        {creator ? <InfoRow icon={User} label="Kaydeden" value={creator} /> : null}
        <InfoRow icon={Clock} label="Kayıt" value={fmtStamp(expense.created_at) ?? '—'} />
        {expense.purchase_invoice_id ? (
          <InfoRow icon={Building2} label="Satın alma" value="Faturayı aç →" onPress={openInvoice} />
        ) : null}
      </Card>

      {/* ── Kurye hareketi ────────────────────────────────────── */}
      {delivery ? (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <View style={{ flex: 1 }}><Label>Kurye Hareketi</Label></View>
              {statusCfg ? (
                <View style={{
                  paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
                  backgroundColor: statusCfg.bg, marginBottom: 10,
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: statusCfg.fg }}>{statusCfg.label}</Text>
                </View>
              ) : null}
            </View>

            {purposeLabel ? <InfoRow icon={Truck} label="Amaç" value={purposeLabel} /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
              {outbound
                ? (isRTL()
                    ? <ArrowLeft size={14} color={DS.ink[400]} strokeWidth={1.7} />
                    : <ArrowRight size={14} color={DS.ink[400]} strokeWidth={1.7} />)
                : <ArrowLeftRight size={14} color={DS.ink[400]} strokeWidth={1.7} />}
              <Text style={{ fontSize: 12, color: DS.ink[500], width: 110 }}>Yön</Text>
              <Text style={{ flex: 1, fontSize: 13, color: DS.ink[900] }}>
                {outbound ? 'Lab → Klinik' : 'Klinik → Lab'}
              </Text>
            </View>
            <InfoRow
              icon={Truck}
              label="Kurye türü"
              value={delivery.mode === 'external'
                ? `Dış firma${delivery.external_provider ? ` · ${delivery.external_provider}` : ''}`
                : 'Lab kuryesi'}
            />
            {courierName ? <InfoRow icon={User} label="Kurye" value={courierName} /> : null}
            {courierPhone ? (
              <InfoRow icon={Phone} label="Telefon" value={courierPhone} onPress={() => callPhone(courierPhone)} />
            ) : null}
            {(delivery.external_tracking_no ?? delivery.external_tracking_code) ? (
              <InfoRow icon={Hash} label="Takip no" value={(delivery.external_tracking_no ?? delivery.external_tracking_code)!} />
            ) : null}
            {feeAmount != null ? (
              <InfoRow
                icon={CreditCard}
                label="Teslimat ücreti"
                value={`${formatMoney(feeAmount, (delivery.fee_currency ?? currency) as Currency, { fractionDigits: 2 })}${
                  delivery.fee_source ? ` · ${FEE_SOURCE_LABEL[delivery.fee_source] ?? delivery.fee_source}` : ''
                }`}
              />
            ) : null}
            {delivery.stage_snapshot ? (
              <InfoRow icon={Package} label="Aşama" value={delivery.stage_snapshot} />
            ) : null}
            {orderNo ? (
              <InfoRow icon={FileText} label="Sipariş" value={`#${orderNo} →`} onPress={openOrder} />
            ) : null}
            {delivery.notes ? <InfoRow icon={FileText} label="Teslimat notu" value={delivery.notes} /> : null}
            {delivery.cancel_reason ? (
              <InfoRow icon={TriangleAlert} label="İptal sebebi" value={delivery.cancel_reason} />
            ) : null}
          </Card>

          {/* ── Rota ────────────────────────────────────────── */}
          {(originLine || destLine || delivery.destination_name) ? (
            <Card>
              <Label>Rota</Label>
              <View style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ alignItems: 'center', width: 20 }}>
                    <CircleDot size={14} color={DS.ink[400]} strokeWidth={1.9} />
                    <View style={{ flex: 1, width: 1.5, backgroundColor: DS.ink[200], marginVertical: 3 }} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 11, color: DS.ink[500] }}>Çıkış</Text>
                    <Text style={{ fontSize: 13, color: DS.ink[900] }}>
                      {delivery.origin_name ?? (outbound ? 'Laboratuvar' : 'Klinik')}
                    </Text>
                    {originLine && originLine !== delivery.origin_name ? (
                      <Text style={{ fontSize: 12, color: DS.ink[500], lineHeight: 18 }}>{originLine}</Text>
                    ) : null}
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ alignItems: 'center', width: 20 }}>
                    <MapPin size={14} color={DS.lab.success} strokeWidth={1.9} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 11, color: DS.ink[500] }}>Varış</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>
                      {delivery.destination_name ?? (outbound ? 'Klinik' : 'Laboratuvar')}
                    </Text>
                    {destLine ? (
                      <Text style={{ fontSize: 12, color: DS.ink[500], lineHeight: 18 }}>{destLine}</Text>
                    ) : null}
                    {delivery.destination_phone ? (
                      <Pressable
                        onPress={() => callPhone(delivery.destination_phone!)}
                        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, ...webCursor })}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: DS.lab.primaryDeep, marginTop: 2 }}>
                          {delivery.destination_phone}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {delivery.recipient_name || delivery.recipient_note ? (
                  <View style={{ borderTopWidth: 1, borderTopColor: DS.ink[100], paddingTop: 12, gap: 2 }}>
                    <Text style={{ fontSize: 11, color: DS.ink[500] }}>Teslim alan</Text>
                    <Text style={{ fontSize: 13, color: DS.ink[900] }}>{delivery.recipient_name ?? '—'}</Text>
                    {delivery.recipient_note ? (
                      <Text style={{ fontSize: 12, color: DS.ink[500], lineHeight: 18 }}>{delivery.recipient_note}</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </Card>
          ) : null}

          {/* ── Zaman çizelgesi ─────────────────────────────── */}
          <Card>
            <Label>Zaman Çizelgesi</Label>
            <Timeline delivery={delivery} />
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

export default ExpenseDetailScreen;
