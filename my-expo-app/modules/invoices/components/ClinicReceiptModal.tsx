// ClinicReceiptModal — klinikten fatura-bağımsız, çoklu döviz tahsilat.
//
// NEDEN: tahsilat yalnız fatura içinden girilebiliyordu; bir klinikten toplu
// ödeme alındığında (710 EUR borca karşılık 800 USD + 600 TL nakit gibi)
// girilecek yer yoktu. Üstelik ödeme para birimi faturanınkinden farklı
// olamıyordu.
//
// Fiş satırları kasaya giren GERÇEK parayı tutar. Dağıtım önizlemesi
// sunucudaki preview_clinic_receipt'ten gelir — dağıtım mantığının tek kaynağı
// orasıdır, istemcide ikinci bir hesap YAZILMAZ (ikisi zamanla ayrışırdı).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, Pressable, TextInput, Platform, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Plus, Trash2, Printer } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { toast } from '../../../core/ui/Toast';
import { getRate } from '../../../core/money/currency';
import { getBaseCurrency } from '../../../core/money/baseCurrency';
import { labTodayOf } from '../../../core/metrics/orderDefs';
import { cachedLabTz, loadLabTz } from '../../../core/metrics/useLabToday';
import { previewClinicReceipt, recordClinicReceipt, updateClinicReceipt, setClinicReceiptAccount } from '../api';
import { fetchDepositAccounts } from '../../cash/api';
import type { ReceiptLine, ReceiptResult, ClinicReceipt, OpenInvoice } from '../types';
import {
  toggleSelection, pruneSelection, selectableInvoices, receiptErrorText,
} from '../lib/receiptSelection';

const CCY: ReceiptLine['currency'][] = ['TRY', 'EUR', 'USD', 'GBP'];
const METHODS = ['nakit', 'kart', 'havale', 'cek', 'diger'] as const;
const METHOD_LABEL: Record<string, string> = {
  nakit: 'Nakit', kart: 'Kart', havale: 'Havale', cek: 'Çek', diger: 'Diğer',
};

type Row = { currency: ReceiptLine['currency']; amount: string; rate: string };

const num = (v: string) => Number(String(v ?? '').replace(',', '.'));
const fmt = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ClinicReceiptModal({
  visible, clinicId, clinicName, onClose, onSaved, editing, onPrintVoucher,
}: {
  visible: boolean;
  clinicId: string | null;
  clinicName?: string;
  onClose: () => void;
  onSaved?: (r: ReceiptResult) => void;
  /** Verilirse pencere DÜZENLEME modunda açılır ve bu fişi günceller. */
  editing?: ClinicReceipt | null;
  /** Düzenlenen fişin PDF makbuzunu üretir (yalnız düzenleme modunda görünür). */
  onPrintVoucher?: (r: ClinicReceipt) => void;
}) {
  const U = useInkUI();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const narrow = winW < 560;
  const base = getBaseCurrency();
  const [rows, setRows]       = useState<Row[]>([{ currency: base as any, amount: '', rate: '1' }]);
  // Lab saat dilimindeki gün: toISOString UTC'dir, TR'de 00:00–03:00 arası dünü verirdi.
  const [date, setDate]       = useState(() => labTodayOf(cachedLabTz()));
  // Yeni makbuzda yöntem bilerek boş gelir (nakit kasaya yanlışlıkla havale düşmesin) — madde 8
  const [method, setMethod]   = useState<string | null>(null);
  const [methodErr, setMethodErr] = useState(false);
  // Yatırıldığı hesap (nakitte yok: nakit kasaya kendiliğinden düşer)
  const [accounts, setAccounts] = useState<{ id: string; name: string; account_type: string; currency: string }[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [refNo, setRefNo]     = useState('');
  const [notes, setNotes]     = useState('');
  const [preview, setPreview] = useState<ReceiptResult | null>(null);
  const [busy, setBusy]       = useState(false);
  const [loadingPrev, setLoadingPrev] = useState(false);
  /** Kayıtlı bir fiş SALT-OKUNUR açılır; düzenlemek ayrı bir adımdır.
   *  Yanlışlıkla üzerine yazmak, kayıtlı bir tahsilatta ucuz bir hata olmamalı. */
  const [locked, setLocked] = useState(false);
  // Elle fatura seçimi: seçim sırası = kapanma sırası. Kapalıyken sunucuya hiç
  // fatura listesi gitmez (dağıtım bugünkü FIFO ile birebir aynı kalır).
  const [manual, setManual]     = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [openInvs, setOpenInvs] = useState<OpenInvoice[]>([]);
  const [saveErr, setSaveErr]   = useState<string | null>(null);
  const [prevTick, setPrevTick] = useState(0);
  const idemRef = useRef<string>('');
  const debRef  = useRef<any>(null);
  const prevSeq = useRef(0);   // yalnız en son önizleme yanıtı uygulanır

  useEffect(() => {
    if (!visible) return;
    idemRef.current = `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setPreview(null); setBusy(false); setMethodErr(false);
    setManual(false); setSelected([]); setOpenInvs([]); setSaveErr(null);
    setLocked(!!editing);
    setAccountId(editing?.account_id ?? null);
    fetchDepositAccounts().then(setAccounts).catch(() => setAccounts([]));
    if (editing) {
      // Düzenleme: kayıtlı satırları olduğu gibi göster — kur dahil, çünkü
      // tahsilat o gün o kurdan alındı; bugünün kuruyla ezmek yanlış olur.
      setRows((editing.lines ?? []).map(l => ({
        currency: l.currency as any, amount: String(l.amount), rate: String(l.rate),
      })));
      setDate(editing.receipt_date);
      setMethod(editing.payment_method || 'nakit');
      setRefNo(editing.reference_no ?? '');
      setNotes(editing.notes ?? '');
    } else {
      setRows([{ currency: base as any, amount: '', rate: '1' }]);
      setRefNo(''); setNotes(''); setMethod(null);
      const guess = labTodayOf(cachedLabTz());
      setDate(guess);
      // Saat dilimi henüz okunmadıysa (varsayılan İstanbul) okununca düzelt;
      // kullanıcı bu arada tarihi değiştirdiyse dokunma.
      if (!cachedLabTz()) {
        loadLabTz().then(tz => setDate(d => (d === guess ? labTodayOf(tz) : d))).catch(() => {});
      }
    }
  }, [visible, base, editing]);

  /** Para birimi değişince kuru o günün kuruyla DOLDUR — üzerine yazılabilir. */
  const setRowCurrency = useCallback(async (i: number, c: ReceiptLine['currency']) => {
    setRows(prev => prev.map((r, k) => (k === i ? { ...r, currency: c } : r)));
    try {
      const rate = await getRate(c as any, base as any);
      setRows(prev => prev.map((r, k) => (k === i ? { ...r, rate: String(rate ?? 1) } : r)));
    } catch { /* kur alınamadı → kullanıcı elle girer */ }
  }, [base]);

  const validLines = useCallback((): ReceiptLine[] => rows
    .map(r => ({ currency: r.currency, amount: num(r.amount), rate: num(r.rate) }))
    .filter(l => isFinite(l.amount) && l.amount > 0 && isFinite(l.rate) && l.rate > 0),
  [rows]);

  // Seçilebilir faturalar yalnız fişte tutarı girilmiş para birimlerindekiler
  // (farklı para birimindeki seçili fatura DB'de uygulanmazdı).
  const lineCcyKey = Array.from(new Set(validLines().map(l => l.currency))).sort().join(',');
  const selectable = selectableInvoices(openInvs, lineCcyKey ? lineCcyKey.split(',') : []);
  const selKey = selected.join(',');

  // Liste ya da satır para birimleri değişince artık seçilemeyenleri seçimden at.
  useEffect(() => {
    setSelected(prev => {
      const next = pruneSelection(prev, selectable);
      return next.length === prev.length ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInvs, lineCcyKey]);

  // Satırlar / seçim değiştikçe sunucudan dağıtım önizlemesi.
  useEffect(() => {
    if (!visible || !clinicId) return;
    const lines = validLines();
    if (debRef.current) clearTimeout(debRef.current);
    if (lines.length === 0) { prevSeq.current++; setPreview(null); setLoadingPrev(false); return; }
    const seq = ++prevSeq.current;
    const stale = () => seq !== prevSeq.current;
    debRef.current = setTimeout(async () => {
      setLoadingPrev(true);
      try {
        const r = await previewClinicReceipt(clinicId, lines, manual && !editing ? selected : undefined);
        if (stale()) return;
        setPreview(r);
        if (r.open_invoices) setOpenInvs(r.open_invoices);
      } catch (e: any) {
        if (stale()) return;
        setPreview(null);
        // Seçili fatura artık geçersizse: seçimsiz listeyi çek, seçim kendiliğinden budanır.
        const t = receiptErrorText(e?.message ?? '');
        if (t) {
          setSaveErr(autoT(t));
          try {
            const r = await previewClinicReceipt(clinicId, lines);
            if (stale()) return;
            setPreview(r);
            if (r.open_invoices) setOpenInvs(r.open_invoices);
          } catch { /* liste alınamadı */ }
        }
      }
      finally { if (!stale()) setLoadingPrev(false); }
    }, 400);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, clinicId, validLines, manual, selKey, editing, prevTick]);

  const save = async () => {
    if (!clinicId) return;
    const lines = validLines();
    if (lines.length === 0) { toast.error(autoT('En az bir tahsilat satırı gerekli')); return; }
    if (!method) { setMethodErr(true); return; }
    setBusy(true); setSaveErr(null);
    try {
      const res = editing
        ? await updateClinicReceipt({
            receiptId: editing.id, lines, receiptDate: date, method,
            referenceNo: refNo.trim() || null, notes: notes.trim() || null,
          })
        : await recordClinicReceipt({
            clinicId, lines, receiptDate: date, method,
            referenceNo: refNo.trim() || null, notes: notes.trim() || null,
            idempotencyKey: idemRef.current,
            invoiceIds: manual && selected.length > 0 ? selected : undefined,
          });
      // Yatırıldığı hesap: makbuz kaydından sonra (hata tahsilatı geri almaz, yalnız uyarır)
      const rid = editing?.id ?? (res as any)?.receipt_id;
      if (rid) {
        const acc = method !== 'nakit' ? accounts.find(a => a.id === accountId) ?? null : null;
        try { await setClinicReceiptAccount(rid, acc ? { id: acc.id, name: acc.name } : null); }
        catch { toast.error(autoT('Yatırıldığı hesap kaydedilemedi')); }
      }
      toast.success(autoT(editing ? 'Tahsilat güncellendi' : 'Tahsilat kaydedildi'));
      onSaved?.(res);
      onClose();
    } catch (e: any) {
      // Hata kaydet butonunun yanında okunur kalsın (toast kaybolur).
      const raw = String(e?.message ?? '');
      const friendly = receiptErrorText(raw);
      setSaveErr(friendly ? autoT(friendly) : (raw || autoT('Tahsilat kaydedilemedi')));
      if (friendly) setPrevTick(t => t + 1);   // listeyi yenile, kapanan fatura seçimden düşsün
    } finally { setBusy(false); }
  };

  /** Hesap para hareketi değildir: kayıtlı (salt okunur / dağıtılmış) makbuzda da seçilir ve hemen kaydedilir */
  const pickAccount = async (id: string | null) => {
    setAccountId(id);
    if (!(locked && editing)) return;   // yeni / düzenlenen makbuz: Kaydet'te yazılır
    const acc = id ? accounts.find(a => a.id === id) ?? null : null;
    try {
      await setClinicReceiptAccount(editing.id, acc ? { id: acc.id, name: acc.name } : null);
      toast.success(autoT('Yatırıldığı hesap kaydedildi'));
      onSaved?.({ receipt_id: editing.id } as ReceiptResult);
    } catch {
      toast.error(autoT('Yatırıldığı hesap kaydedilemedi'));
    }
  };

  const totalBase = validLines().reduce((s, l) => s + l.amount * l.rate, 0);

  // Uygulama genelindeki modal standardi: useInkUI'nin hazir yuzeyleri.
  // useMobileTokens panel zeminini kullaniyor, finans panelinde o mavimsi
  // ciktigi icin form "siteye uygun" gorunmuyordu.
  const label: any = { ...U.colHeader, marginBottom: 6 };
  // Kilitliyken alan DUZENLENEBILIR gorunmemeli: ayni beyaz kutu, dokunulunca
  // hicbir sey olmuyor -> kullanici bozuk saniyor.
  const input: any = locked
    ? { ...U.inputStyle, backgroundColor: U.surfaceSoft, color: U.ink[700], borderColor: U.hairline }
    : U.inputStyle;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Uygulama modal standardi: U.modalOverlay / modalCard / modalHeaderRow.
          Arka plan ayrica bulaniklastirilir (site geneli popup kalibi). */}
      {/* iOS'ta klavye alt alanlari (tutar/kur/not) kapatiyordu → kart yukari
          kaysin. Dar ekranda overlay dolgusu 24 -> 12: 24 kart genisligini
          gereksiz kirpiyordu. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
      <View style={{
        ...U.modalOverlay,
        padding: narrow ? 12 : 24,
        ...(Platform.OS === 'web'
          ? { backdropFilter: 'blur(10px) saturate(120%)',
              WebkitBackdropFilter: 'blur(10px) saturate(120%)' } as any
          : null),
      }}>
        <View style={[U.modalCard, narrow ? { maxHeight: '94%' } : null]}>
          {/* Başlık */}
          <View style={U.modalHeaderRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={U.modalTitle} numberOfLines={1}>
                {autoT(editing ? (locked ? 'Tahsilat' : 'Tahsilatı düzenle') : 'Tahsilat ekle')}
              </Text>
              {clinicName ? (
                <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 2 }} numberOfLines={1}>
                  {clinicName}
                </Text>
              ) : null}
            </View>
            <GlassTooltip title={autoT('Kapat')} text={autoT('Pencereyi kaydetmeden kapat')} placement="bottom">
              <Pressable onPress={onClose} hitSlop={8}
                style={{ ...U.modalCloseBtn,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}) }}>
                <X size={15} color={U.ink[500]} strokeWidth={2} />
              </Pressable>
            </GlassTooltip>
          </View>

          <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
            {/* Tarih + yöntem */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={label}>Tarih</Text>
                <TextInput value={date} onChangeText={setDate} style={input} editable={!locked}
                  placeholder="YYYY-AA-GG" placeholderTextColor={U.ink[400]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={label}>Referans</Text>
                <TextInput value={refNo} onChangeText={setRefNo} style={input} editable={!locked}
                  placeholder={autoT('Dekont no')} placeholderTextColor={U.ink[400]} />
              </View>
            </View>

            <View>
              <Text style={label}>Ödeme yöntemi</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {METHODS.map(m => {
                  const on = method === m;
                  return (
                    <Pressable key={m} onPress={() => { setMethod(m); setMethodErr(false); if (m === 'nakit') setAccountId(null); }} disabled={locked}
                      style={{
                        paddingHorizontal: on ? 14 : 11, paddingVertical: 7, borderRadius: 999,
                        backgroundColor: on ? U.ink[900] : U.surfaceSoft,
                        borderWidth: 1, borderColor: on ? U.ink[900] : U.hairline,
                        opacity: locked && !on ? 0.35 : 1,
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      }}>
                      <Text style={{ fontSize: 12.5, fontWeight: on ? '700' : '500',
                                     color: on ? U.surface : U.ink[700] }}>
                        {autoT(METHOD_LABEL[m])}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Yatırıldığı hesap — ekstrede "Havale / EFT · <hesap>" olarak görünür */}
            {method ? (
              <View>
                <Text style={label}>{autoT('Yatırıldığı hesap')}</Text>
                {method === 'nakit' ? (
                  <Text style={{ fontSize: 12.5, color: U.ink[500] }}>{autoT('Nakit kasaya yazılır')}</Text>
                ) : accounts.length === 0 ? (
                  <Text style={{ fontSize: 12.5, color: U.ink[500] }}>{autoT('Tanımlı hesap yok — Kasa / Banka → Diğer hesaplar\'dan banka hesabı ekleyin')}</Text>
                ) : (
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {accounts.map(a => {
                      const on = accountId === a.id;
                      return (
                        <GlassTooltip key={a.id} title={a.name} text={autoT('Tahsilatın yatırıldığı hesap')}>
                          <Pressable onPress={() => pickAccount(on ? null : a.id)}
                            style={{
                              paddingHorizontal: on ? 14 : 11, paddingVertical: 7, borderRadius: 999,
                              backgroundColor: on ? U.ink[900] : U.surfaceSoft,
                              borderWidth: 1, borderColor: on ? U.ink[900] : U.hairline,
                              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                            }}>
                            <Text style={{ fontSize: 12.5, fontWeight: on ? '700' : '500', color: on ? U.surface : U.ink[700] }}>
                              {a.name}
                            </Text>
                          </Pressable>
                        </GlassTooltip>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : null}

            {/* Para birimi satırları */}
            <View>
              <Text style={label}>Alınan para</Text>
              <View style={{ gap: 8 }}>
                {rows.map((r, i) => {
                  const b = num(r.amount) * num(r.rate);
                  return (
                    <View key={i} style={{ gap: 6 }}>
                      {/* Para birimi cipleri AYRI satirda: tek satirda ciplerle
                          birlikte tutar+kur+sil sigmiyor, sil dugmesi karttan
                          disari tasiyordu. */}
                      <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                          {CCY.map(c => {
                            const on = r.currency === c;
                            return (
                              <Pressable key={c} onPress={() => setRowCurrency(i, c)} disabled={locked}
                                style={{
                                  paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9,
                                  backgroundColor: on ? `${U.ink[900]}14` : 'transparent',
                                  borderWidth: 1, borderColor: on ? U.ink[700] : U.hairline,
                                  opacity: locked && !on ? 0.35 : 1,
                                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                                }}>
                                <Text style={{ fontSize: 11.5, fontWeight: on ? '700' : '500',
                                               color: on ? U.ink[900] : U.ink[400] }}>{c}</Text>
                              </Pressable>
                            );
                          })}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <TextInput value={r.amount} keyboardType="decimal-pad"
                          onChangeText={v => setRows(p => p.map((x, k) => k === i ? { ...x, amount: v } : x))}
                          editable={!locked}
                          style={[input, { flex: 1, minWidth: 0 }]} placeholder={autoT('Tutar')}
                          placeholderTextColor={U.ink[400]} />
                        <TextInput value={r.rate} keyboardType="decimal-pad"
                          onChangeText={v => setRows(p => p.map((x, k) => k === i ? { ...x, rate: v } : x))}
                          editable={!locked}
                          style={[input, { width: 104, flexShrink: 0 }]} placeholder={autoT('Kur')}
                          placeholderTextColor={U.ink[400]} />
                        {rows.length > 1 && !locked ? (
                          <GlassTooltip title={autoT('Satırı sil')} text={autoT('Bu para birimi satırını kaldır')}>
                            <Pressable onPress={() => setRows(p => p.filter((_, k) => k !== i))} hitSlop={6}
                              style={{ padding: 6, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                              <Trash2 size={15} color={U.ink[400]} strokeWidth={1.9} />
                            </Pressable>
                          </GlassTooltip>
                        ) : null}
                      </View>
                      {b > 0 ? (
                        <Text style={{ fontSize: 11, color: U.ink[400], marginStart: 4 }}>
                          {autoT('Baz karşılığı')}: {fmt(b)} {base}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
              {!locked && (
              <GlassTooltip title={autoT('Satır ekle')} text={autoT('Farklı para biriminden alınan tutar için satır ekle')}>
                <Pressable
                  onPress={() => setRows(p => [...p, { currency: base as any, amount: '', rate: '1' }])}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8,
                    alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 7,
                    borderRadius: 999, backgroundColor: U.surfaceSoft,
                    borderWidth: 1, borderColor: U.hairline,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}>
                  <Plus size={13} color={U.ink[700]} strokeWidth={2.2} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }}>Satır ekle</Text>
                </Pressable>
              </GlassTooltip>
              )}
            </View>

            {/* Dağıtım önizlemesi — sunucudan */}
            <View style={{
              borderRadius: 14, backgroundColor: U.surfaceSoft,
              borderWidth: 1, borderColor: U.hairline, padding: 14, gap: 8,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', color: U.ink[400],
                               letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 }}>
                  Dağıtım
                </Text>
                {loadingPrev ? <ActivityIndicator size="small" color={U.ink[400]} /> : null}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12.5, color: U.ink[700] }}>Toplam tahsilat</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>
                  {fmt(totalBase)} {base}
                </Text>
              </View>

              {(preview?.allocations ?? []).map(a => (
                <View key={a.invoice_id}
                  style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12.5, color: U.ink[400] }} numberOfLines={1}>
                    {a.invoice_no ?? '—'}
                  </Text>
                  <Text style={{ fontSize: 12.5, color: U.ink[700] }}>
                    {fmt(Number(a.amount) || 0)} {a.currency}
                  </Text>
                </View>
              ))}

              {preview && (preview.allocations ?? []).length === 0 ? (
                <Text style={{ fontSize: 12, color: U.ink[400] }}>
                  Kapatılacak açık fatura yok
                </Text>
              ) : null}

              {preview ? (
                <View style={{
                  flexDirection: 'row', justifyContent: 'space-between',
                  borderTopWidth: 1, borderTopColor: U.hairline, paddingTop: 8,
                }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.ink[700] }}>
                    Kalan alacak
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: U.ink[900] }}>
                    {fmt(Number(preview.credit_base) || 0)} {base}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Elle fatura seçimi — düzenlemede dağıtım yeniden FIFO yapıldığı için gizli */}
            {editing ? (
              <Text style={{ fontSize: 12, color: U.ink[500] }}>
                {autoT('Düzenlemede dağıtım en eski borçtan yeniden yapılır')}
              </Text>
            ) : (
              <View style={{ gap: 8 }}>
                <Pressable
                  onPress={() => { setManual(m => !m); setSaveErr(null); }}
                  accessibilityRole="switch" accessibilityState={{ checked: manual }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}>
                  <View style={{
                    width: 36, height: 20, borderRadius: 10, padding: 2, justifyContent: 'center',
                    backgroundColor: manual ? U.ink[900] : U.surfaceSoft,
                    borderWidth: 1, borderColor: manual ? U.ink[900] : U.hairline,
                  }}>
                    <View style={{
                      width: 14, height: 14, borderRadius: 7,
                      backgroundColor: manual ? U.onDarkPill : U.ink[400],
                      alignSelf: manual ? 'flex-end' : 'flex-start',
                    }} />
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[700], flex: 1 }}>
                    {autoT('Faturaları elle seç')}
                  </Text>
                </Pressable>
                {manual ? (
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 12, color: U.ink[500] }}>
                      {autoT('Seçilen faturalar önce kapanır, kalanı en eskiden başlar')}
                    </Text>
                    {selectable.length === 0 ? (
                      <Text style={{ fontSize: 12, color: U.ink[400] }}>
                        {autoT('Seçilebilir açık fatura yok')}
                      </Text>
                    ) : selectable.map(inv => {
                      const idx = selected.indexOf(inv.invoice_id);
                      const on = idx >= 0;
                      return (
                        <Pressable key={inv.invoice_id}
                          onPress={() => { setSelected(p => toggleSelection(p, inv.invoice_id)); setSaveErr(null); }}
                          style={{
                            flexDirection: 'row', alignItems: 'center', gap: 10,
                            paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12,
                            backgroundColor: on ? `${U.ink[900]}14` : U.surfaceSoft,
                            borderWidth: 1, borderColor: on ? U.ink[700] : U.hairline,
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                          }}>
                          <View style={{
                            width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                            backgroundColor: on ? U.ink[900] : 'transparent',
                            borderWidth: 1, borderColor: on ? U.ink[900] : U.hairline,
                          }}>
                            {on ? <Text style={{ fontSize: 11.5, fontWeight: '700', color: U.onDarkPill }}>{idx + 1}</Text> : null}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>
                              {inv.invoice_no ?? '—'}
                            </Text>
                            {inv.issue_date ? (
                              <Text style={{ fontSize: 11, color: U.ink[400] }} numberOfLines={1}>{inv.issue_date}</Text>
                            ) : null}
                          </View>
                          <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.ink[700] }}>
                            {fmt(Number(inv.open) || 0)} {inv.currency}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            )}

            <View>
              <Text style={label}>Not</Text>
              {/* Cok satirli girdide metin dikeyde ORTALANMAZ; ustten dolgu
                  verilmezse imlec ve yer tutucu kenara yapisiyor. */}
              <TextInput value={notes} onChangeText={setNotes} multiline editable={!locked}
                style={[input, { height: 78, paddingTop: 12, paddingBottom: 12,
                                 textAlignVertical: 'top' as any }]}
                placeholder={autoT('İsteğe bağlı')} placeholderTextColor={U.ink[400]} />
            </View>
          </ScrollView>

          {/* Alt bar */}
          <View style={{
            flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-end',
            paddingHorizontal: 18, paddingTop: 14,
            // Home indicator'un altinda kalmasin.
            paddingBottom: 14 + (Platform.OS === 'web' ? 0 : insets.bottom),
            borderTopWidth: 1, borderTopColor: U.hairline,
          }}>
            {/* Makbuz yalnız KAYITLI fiş için anlamlı — yeni kayıtta henüz
                belgeleneck bir tahsilat yok. */}
            {editing && onPrintVoucher ? (
              <GlassTooltip title={autoT('Makbuz')} text={autoT('Bu tahsilat için PDF makbuz oluştur')}>
                <Pressable onPress={() => onPrintVoucher(editing)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6, marginEnd: 'auto' as any,
                    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
                    borderWidth: 1, borderColor: U.hairline, backgroundColor: U.surfaceSoft,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}>
                  <Printer size={14} color={U.ink[700]} strokeWidth={1.8} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[700] }}>Makbuz</Text>
                </Pressable>
              </GlassTooltip>
            ) : null}
            {saveErr && !locked ? (
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>{saveErr}</Text>
            ) : null}
            {methodErr && !locked ? (
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>{autoT('Ödeme yöntemini seçin')}</Text>
            ) : null}
            <Pressable onPress={onClose}
              style={{
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
                borderWidth: 1, borderColor: U.hairline, backgroundColor: U.surfaceSoft,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[700] }}>
                {autoT(locked ? 'Kapat' : 'Vazgeç')}
              </Text>
            </Pressable>
            {locked ? (
              <GlassTooltip title={autoT('Düzenle')} text={autoT('Bu tahsilatın bilgilerini değiştir')}>
                <Pressable onPress={() => setLocked(false)}
                  style={{
                    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
                    backgroundColor: U.ink[900],
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: U.onDarkPill }}>Düzenle</Text>
                </Pressable>
              </GlassTooltip>
            ) : (
            <GlassTooltip title={autoT('Kaydet')}
              text={autoT('Tahsilatı kaydet ve en eski faturadan başlayarak dağıt')}
              enabled={!busy}>
              <Pressable onPress={save} disabled={busy}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 7,
                  paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
                  backgroundColor: U.ink[900], opacity: busy ? 0.6 : 1,
                  ...(Platform.OS === 'web' ? { cursor: busy ? 'not-allowed' : 'pointer' } as any : {}),
                }}>
                {busy ? <ActivityIndicator size="small" color={U.surface} /> : null}
                <Text style={{ fontSize: 13, fontWeight: '700', color: U.onDarkPill }}>Kaydet</Text>
              </Pressable>
            </GlassTooltip>
            )}
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
