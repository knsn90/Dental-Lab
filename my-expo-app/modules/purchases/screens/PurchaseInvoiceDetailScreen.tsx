/**
 * PurchaseInvoiceDetailScreen — Satın Alma Faturası Detayı.
 *
 * Satış tarafındaki fatura detayının karşılığı: fatura artık pop-up olarak
 * değil, uygulama içinde okunaklı bir sayfa olarak açılır. Resmî belge
 * görünümü (ETTN'li, boş satır gridli e-fatura düzeni) yalnız "Yazdır"
 * butonunun arkasında kalır — ekranda okumak ile kâğıda basmak farklı işler.
 *
 * SATIR TOPLAMI KONTROLÜ: kalemler stok giriş hareketlerinden gelir, fatura
 * tutarı ise başlıkta ayrı tutulur. İkisi tutmuyorsa (eksik kalem, yanlış
 * birim fiyat, demirbaş alımı) sayfa bunu gizlemez — üstte açıkça söyler.
 *
 * TASARIM — DESIGN_LANGUAGE.md: DS token + inline style, kart radius 18,
 * display başlık Inter Tight 300, panel accent'i usePanelTheme'den.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useSegments } from 'expo-router';
import { safeBack } from '../../../core/util/safeBack';
import {
  ArrowLeft, ArrowRight, Printer, Building2, Calendar, CreditCard, FileText,
  TriangleAlert, Package, Plus, Trash2, Wrench,
} from '../../../core/ui/icons';
import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { formatMoney } from '../../../core/money/currency';
import { formatQty } from '../../../core/util/formatQty';
import { localeTag, isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { confirmAsync } from '../../../core/util/confirm';
import { toast } from '../../../core/ui/Toast';
import {
  getPurchaseInvoice, getPurchaseInvoiceLines, getPurchaseInvoiceExtras,
  deletePurchaseInvoiceExtra, PURCHASE_EXTRA_LABELS,
  type PurchaseInvoice, type PurchaseInvoiceLine, type PurchaseInvoiceExtra,
} from '../api';
import { PurchaseInvoicePreviewModal } from '../components/PurchaseInvoicePreviewModal';
import { openPurchaseInvoiceFile } from '../api';
import { PurchaseExtraLineModal } from '../components/PurchaseExtraLineModal';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};
const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Nakit', transfer: 'Havale/EFT', check: 'Çek',
  card: 'Kredi kartı', open_account: 'Açık hesap',
};

function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(localeTag(), {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View style={[{
      backgroundColor: DS.lab.surface, borderRadius: 18,
      borderWidth: 1, borderColor: DS.ink[200], padding: 20,
    }, style]}>
      {children}
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{
      fontSize: 10, fontWeight: '600', letterSpacing: 1.1,
      textTransform: 'uppercase', color: DS.ink[400], marginBottom: 10,
    }}>
      {children}
    </Text>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
      <Icon size={14} color={DS.ink[400]} strokeWidth={1.7} />
      <Text style={{ fontSize: 12, color: DS.ink[500], width: 96 }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: DS.ink[900] }}>{value}</Text>
    </View>
  );
}

interface Props {
  /** Hub içinde gömülü açılırken — route param yerine doğrudan id verilir */
  invoiceId?: string;
  /** Gömülü kullanımda geri dönüş; verilmezse route geçmişi kullanılır */
  onBack?: () => void;
}

export function PurchaseInvoiceDetailScreen({ invoiceId, onBack }: Props = {}) {
  const router   = useRouter();
  const segments = useSegments();
  const panel    = (segments?.[0] as string) ?? '(lab)';
  const theme    = usePanelTheme();
  const routeParams = useLocalSearchParams<{ id: string }>();
  const id = invoiceId ?? routeParams.id;

  const [inv, setInv]         = useState<PurchaseInvoice | null>(null);
  const [lines, setLines]     = useState<PurchaseInvoiceLine[]>([]);
  const [extras, setExtras]   = useState<PurchaseInvoiceExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  // Dosya açma hatası kullanıcıya görünmeli; sessiz başarısızlık en kötüsü.
  const [fileError, setFileError] = useState<string | null>(null);
  const [addOpen, setAddOpen]   = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [h, l, e] = await Promise.all([
      getPurchaseInvoice(id), getPurchaseInvoiceLines(id), getPurchaseInvoiceExtras(id),
    ]);
    setInv(h.data);
    setLines(l.data ?? []);
    setExtras(e.data ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const currency = (inv?.currency ?? 'TRY') as any;

  /**
   * Satır toplamı — stok kalemleri + stok dışı kalemler birlikte.
   * Fatura içeriği iki kaynağa dağıldığı için karşılaştırma da ikisini toplar.
   */
  const stockSum = useMemo(
    () => lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unit_cost_at_time) || 0), 0),
    [lines],
  );
  const extraSum = useMemo(
    () => extras.reduce((a, e) => a + (Number(e.quantity) || 0) * (Number(e.unit_price) || 0), 0),
    [extras],
  );
  const lineSum = stockSum + extraSum;
  const totalLineCount = lines.length + extras.length;

  const removeExtra = useCallback(async (x: PurchaseInvoiceExtra) => {
    const ok = await confirmAsync(
      autoT('Kalemi sil'),
      `"${x.description}" ${autoT('fatura içeriğinden çıkarılacak.')}`,
      { confirmText: autoT('Sil'), destructive: true },
    );
    if (!ok) return;
    const res = await deletePurchaseInvoiceExtra(x.id);
    if (!res.ok) { toast.error(res.error ?? 'Silinemedi'); return; }
    load();
  }, [load]);
  const mismatch = !loading && !!inv && Math.abs(lineSum - Number(inv.subtotal || 0)) > 0.02;

  const isForeign = !!inv && inv.currency !== inv.base_currency_at_time
    && Number(inv.rate_at_time) > 0 && Number(inv.rate_at_time) !== 1;

  // Gömülü açıldıysa onu açan ekran geri alır (state korunur); değilse
  // geçmişe düşülür — geçmiş de yoksa tedarikçiler sekmesine.
  const goBack = () => {
    if (onBack) { onBack(); return; }
    safeBack(`/${panel}/finance?tab=suppliers`);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', paddingVertical: 96 }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!inv) {
    return (
      <View style={{ flex: 1, alignItems: 'center', paddingVertical: 96, gap: 12 }}>
        <FileText size={30} color={DS.ink[300]} strokeWidth={1.4} />
        <Text style={{ fontSize: 14, color: DS.ink[500] }}>Fatura bulunamadı</Text>
        <Pressable onPress={goBack} style={{ ...webCursor }}>
          <Text style={{ fontSize: 13, color: theme.primary, fontWeight: '600' }}>Geri dön</Text>
        </Pressable>
      </View>
    );
  }

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
          {isRTL()
            ? <ArrowRight size={16} color={DS.ink[700]} strokeWidth={1.9} />
            : <ArrowLeft size={16} color={DS.ink[700]} strokeWidth={1.9} />}
        </Pressable>
        <Text style={{
          flex: 1, fontSize: 10, fontWeight: '500', letterSpacing: 1.2,
          textTransform: 'uppercase', color: DS.ink[500],
        }}>
          Satın Alma · Fatura
        </Text>
        {/* Orijinal: tedarikçinin gönderdiği PDF/görsel. Yalnız arşivlenmişse
            görünür — buton varken dosya olmaması ölü tıklama olurdu.
            "Yazdır" bizim ürettiğimiz dökümü basar; ikisi farklı belgedir. */}
        {inv.invoice_file_url ? (
          <Pressable
            onPress={async () => {
              const err = await openPurchaseInvoiceFile(inv.invoice_file_url);
              if (err) setFileError(err);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
              borderWidth: 1, borderColor: DS.ink[200],
              backgroundColor: DS.lab.surface,
              opacity: pressed ? 0.7 : 1, ...webCursor,
            })}
          >
            <FileText size={14} color={DS.ink[700]} strokeWidth={1.8} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800] }}>Orijinal</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setPrinting(true)}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
            borderWidth: 1, borderColor: DS.ink[200],
            backgroundColor: DS.lab.surface,
            opacity: pressed ? 0.7 : 1, ...webCursor,
          })}
        >
          <Printer size={14} color={DS.ink[700]} strokeWidth={1.8} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800] }}>Yazdır</Text>
        </Pressable>
      </View>

      {fileError ? (
        <Pressable onPress={() => setFileError(null)} style={{ ...webCursor }}>
          <Text style={{ fontSize: 12, color: '#B91C1C', fontWeight: '600' }}>{fileError}</Text>
        </Pressable>
      ) : null}

      {/* ── Hero: tedarikçi + tutar ───────────────────────────── */}
      <View style={{
        borderRadius: 18, padding: 24, gap: 6,
        backgroundColor: theme.primary,
      }}>
        <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)' }}>
          {inv.invoice_number ?? 'Fatura no yok'}
        </Text>
        <Text numberOfLines={2} style={{ ...DISPLAY, fontSize: 26, letterSpacing: -0.6, color: '#FFFFFF' }}>
          {inv.supplier_name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          <Text style={{ ...DISPLAY, fontSize: 34, letterSpacing: -1, color: '#FFFFFF' }}>
            {formatMoney(inv.total, currency, { fractionDigits: 2 })}
          </Text>
          {isForeign ? (
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', paddingBottom: 6 }}>
              ≈ {formatMoney(inv.total_base, inv.base_currency_at_time as any, { fractionDigits: 2 })}
              {'  ·  '}1 {inv.currency} = {Number(inv.rate_at_time).toLocaleString('tr-TR', { maximumFractionDigits: 4 })} {inv.base_currency_at_time}
            </Text>
          ) : null}
        </View>
      </View>

      {/* ── Tutarsızlık uyarısı ───────────────────────────────── */}
      {mismatch ? (
        <View style={{
          flexDirection: 'row', gap: 10, alignItems: 'flex-start',
          borderRadius: 18, padding: 16,
          backgroundColor: 'rgba(217,75,75,0.08)',
          borderWidth: 1, borderColor: 'rgba(217,75,75,0.30)',
        }}>
          <TriangleAlert size={16} color={DS.lab.danger} strokeWidth={1.9} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: DS.lab.danger }}>
              Satır toplamı fatura tutarını tutmuyor
            </Text>
            <Text style={{ fontSize: 12, color: DS.ink[700], lineHeight: 18 }}>
              Kalemler {formatMoney(lineSum, currency, { fractionDigits: 2 })} ediyor,
              fatura {formatMoney(inv.subtotal, currency, { fractionDigits: 2 })} diyor.
              Genelde sebebi şudur: cihaz/demirbaş alımı stok kalemi olmadığı için
              satır olarak eklenemiyor, ya da birim fiyat eksik girilmiş.
            </Text>
          </View>
        </View>
      ) : null}

      {/* ── Fatura bilgileri ──────────────────────────────────── */}
      <Card>
        <Label>Fatura Bilgileri</Label>
        <InfoRow icon={Building2} label="Tedarikçi" value={inv.supplier_name} />
        <InfoRow icon={Calendar}  label="Fatura tarihi" value={fmtDate(inv.invoice_date)} />
        <InfoRow icon={Calendar}  label="Vade" value={fmtDate(inv.due_date)} />
        <InfoRow icon={CreditCard} label="Ödeme" value={inv.payment_method ? (PAYMENT_LABEL[inv.payment_method] ?? inv.payment_method) : '—'} />
        {inv.notes ? <InfoRow icon={FileText} label="Not" value={inv.notes} /> : null}
      </Card>

      {/* ── Kalemler: stok + stok dışı tek listede ──────────── */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
        }}>
          <View style={{ flex: 1 }}>
            <Label>Kalemler ({totalLineCount})</Label>
          </View>
          <Pressable
            onPress={() => setAddOpen(true)}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
              backgroundColor: 'rgba(0,0,0,0.05)',
              opacity: pressed ? 0.7 : 1, ...webCursor,
            })}
          >
            <Plus size={13} color={DS.ink[700]} strokeWidth={2} />
            <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[800] }}>
              Stok dışı kalem
            </Text>
          </Pressable>
        </View>

        {totalLineCount === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 36, gap: 10 }}>
            <Package size={26} color={DS.ink[300]} strokeWidth={1.5} />
            <Text style={{ fontSize: 13, color: DS.ink[500] }}>Bu faturada henüz kalem yok</Text>
            <Text style={{ fontSize: 12, color: DS.ink[400], maxWidth: 460, textAlign: 'center', lineHeight: 17 }}>
              Alınan şey cihaz, demirbaş veya hizmet ise stok kalemi olarak
              kaydedilmez — "Stok dışı kalem" ile faturaya ekleyin.
            </Text>
          </View>
        ) : (
          <>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 20, paddingVertical: 10,
              backgroundColor: DS.ink[50],
              borderTopWidth: 1, borderTopColor: DS.ink[100],
            }}>
              <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400] }}>Ürün / Hizmet</Text>
              <Text style={{ width: 110, textAlign: 'end' as any, fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400] }}>Miktar</Text>
              <Text style={{ width: 110, textAlign: 'end' as any, fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400] }}>Birim fiyat</Text>
              <Text style={{ width: 120, textAlign: 'end' as any, fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[400] }}>Tutar</Text>
              <View style={{ width: 30 }} />
            </View>

            {/* Stok kalemleri — stok hareketi üretmiş satırlar */}
            {lines.map((l, i) => {
              const amount = (Number(l.quantity) || 0) * (Number(l.unit_cost_at_time) || 0);
              return (
                <View
                  key={l.id}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 20, paddingVertical: 12,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: DS.ink[100],
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>
                      {l.item_name}
                    </Text>
                    {l.note ? (
                      <Text numberOfLines={1} style={{ fontSize: 11, color: DS.ink[400] }}>{l.note}</Text>
                    ) : null}
                  </View>
                  <Text style={{ width: 110, textAlign: 'end' as any, fontSize: 13, color: DS.ink[700] }}>
                    {formatQty(l.quantity)} {l.unit ?? ''}
                  </Text>
                  <Text style={{ width: 110, textAlign: 'end' as any, fontSize: 13, color: DS.ink[700] }}>
                    {formatMoney(l.unit_cost_at_time ?? 0, currency, { fractionDigits: 2 })}
                  </Text>
                  <Text style={{ width: 120, textAlign: 'end' as any, fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>
                    {formatMoney(amount, currency, { fractionDigits: 2 })}
                  </Text>
                  <View style={{ width: 30 }} />
                </View>
              );
            })}

            {/* Stok dışı kalemler — cihaz/hizmet/kargo */}
            {extras.map(x => {
              const amount = (Number(x.quantity) || 0) * (Number(x.unit_price) || 0);
              return (
                <View
                  key={x.id}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 20, paddingVertical: 12,
                    borderTopWidth: 1, borderTopColor: DS.ink[100],
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>
                        {x.description}
                      </Text>
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999,
                        backgroundColor: 'rgba(124,58,237,0.12)',
                      }}>
                        <Wrench size={9} color="#6D28D9" strokeWidth={2} />
                        <Text style={{ fontSize: 9, fontWeight: '600', color: '#6D28D9' }}>
                          {PURCHASE_EXTRA_LABELS[x.kind]}
                        </Text>
                      </View>
                    </View>
                    {x.note ? (
                      <Text numberOfLines={1} style={{ fontSize: 11, color: DS.ink[400] }}>{x.note}</Text>
                    ) : null}
                  </View>
                  <Text style={{ width: 110, textAlign: 'end' as any, fontSize: 13, color: DS.ink[700] }}>
                    {formatQty(x.quantity)} {x.unit ?? ''}
                  </Text>
                  <Text style={{ width: 110, textAlign: 'end' as any, fontSize: 13, color: DS.ink[700] }}>
                    {formatMoney(x.unit_price, currency, { fractionDigits: 2 })}
                  </Text>
                  <Text style={{ width: 120, textAlign: 'end' as any, fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>
                    {formatMoney(amount, currency, { fractionDigits: 2 })}
                  </Text>
                  <Pressable
                    onPress={() => removeExtra(x)}
                    style={({ pressed }) => ({
                      width: 30, alignItems: 'flex-end',
                      opacity: pressed ? 0.5 : 1, ...webCursor,
                    })}
                  >
                    <Trash2 size={13} color={DS.ink[400]} strokeWidth={1.8} />
                  </Pressable>
                </View>
              );
            })}
          </>
        )}
      </Card>

      {/* ── Toplamlar ─────────────────────────────────────────── */}
      <Card>
        <Label>Toplamlar</Label>
        {([
          { label: 'Ara toplam', value: inv.subtotal },
          { label: `KDV (%${Number(inv.vat_rate ?? 0)})`, value: inv.vat_amount },
        ] as const).map(r => (
          <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
            <Text style={{ flex: 1, fontSize: 13, color: DS.ink[500] }}>{r.label}</Text>
            <Text style={{ fontSize: 13, color: DS.ink[900] }}>
              {formatMoney(r.value ?? 0, currency, { fractionDigits: 2 })}
            </Text>
          </View>
        ))}
        <View style={{
          flexDirection: 'row', alignItems: 'center', paddingTop: 12, marginTop: 6,
          borderTopWidth: 1, borderTopColor: DS.ink[100],
        }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>Genel toplam</Text>
          <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, color: DS.ink[900] }}>
            {formatMoney(inv.total, currency, { fractionDigits: 2 })}
          </Text>
        </View>
        {isForeign ? (
          <Text style={{ fontSize: 11, color: DS.ink[400], textAlign: 'end' as any, marginTop: 4 }}>
            {formatMoney(inv.total_base, inv.base_currency_at_time as any, { fractionDigits: 2 })} karşılığı
          </Text>
        ) : null}
      </Card>

      <PurchaseExtraLineModal
        visible={addOpen}
        purchaseInvoiceId={inv.id}
        accentColor={theme.primary}
        currencyLabel={String(inv.currency)}
        onClose={() => setAddOpen(false)}
        onSaved={() => { setAddOpen(false); load(); }}
      />

      {/* Resmî belge görünümü — yalnız yazdırırken */}
      <PurchaseInvoicePreviewModal
        visible={printing}
        onClose={() => setPrinting(false)}
        purchaseInvoiceId={inv.id}
      />
    </ScrollView>
  );
}

export default PurchaseInvoiceDetailScreen;
