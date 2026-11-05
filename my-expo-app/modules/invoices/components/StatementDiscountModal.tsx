// StatementDiscountModal — kliniğin ekstresine dönem indirimi ("Ekstre indirimi").
//
// Faturalar aynı kalır; indirim borçtan düşen ayrı bir kayıttır (spec §5). Hesap ve
// dağıtım sunucudadır: önizleme preview_statement_discount'tan gelir, istemcide
// ikinci bir hesap YAZILMAZ (ClinicReceiptModal ile aynı ilke).
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, Pressable, TextInput, Platform, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { toast } from '../../../core/ui/Toast';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { previewStatementDiscount, recordStatementDiscount } from '../api';
import { sdErrorText, discountPeriodLabel } from '../lib/statementDiscount';
import type { StatementDiscountQuote } from '../types';

type Kind = 'percent' | 'fixed';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toNum = (v: string) => Number(String(v ?? '').replace(',', '.'));

/** Ay adı geçerli dilde — dönem miladi ay olduğu için Şemsi takvime çevrilmez. */
function monthName(i: number): string {
  const tag = localeTag().replace('-u-ca-persian', '-u-ca-gregory');
  try {
    return new Intl.DateTimeFormat(tag, { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, i, 15)));
  } catch {
    return String(i + 1);
  }
}

function defaultDescription(from: string, to: string): string {
  if (!ISO.test(from) || !ISO.test(to)) return autoT('Dönem indirimi');
  return autoT('Dönem indirimi') + ' · ' + discountPeriodLabel(from, to, monthName);
}

export function StatementDiscountModal({
  visible, clinicId, currency, defaultFrom, defaultTo, onClose, onSaved,
}: {
  visible: boolean;
  clinicId: string;
  currency: string;
  defaultFrom: string;
  defaultTo: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const U = useInkUI();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const narrow = winW < 560;

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [kind, setKind] = useState<Kind>('percent');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(defaultTo);
  const [dateTouched, setDateTouched] = useState(false);
  const [desc, setDesc] = useState(() => defaultDescription(defaultFrom, defaultTo));
  const [descTouched, setDescTouched] = useState(false);
  const [quote, setQuote] = useState<StatementDiscountQuote | null>(null);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const idemRef = useRef<string>('');
  const debRef = useRef<any>(null);
  const reqRef = useRef(0);

  // Açılışta sıfırla; idempotency anahtarı pencere başına bir kez (çift tıklama tek kayıt).
  useEffect(() => {
    if (!visible) return;
    idemRef.current = `sd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setFrom(defaultFrom); setTo(defaultTo);
    setKind('percent'); setValue('');
    setDate(defaultTo); setDateTouched(false);
    setDesc(defaultDescription(defaultFrom, defaultTo)); setDescTouched(false);
    setQuote(null); setErr(null); setBusy(false);
  }, [visible, defaultFrom, defaultTo]);

  // Dönem değişince önerilen tarih (dönemin son günü) ve açıklama izler — elle değiştirilmediyse.
  useEffect(() => {
    if (!visible) return;
    if (!dateTouched) setDate(to);
    if (!descTouched) setDesc(defaultDescription(from, to));
  }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = toNum(value);
  const inputsOk = ISO.test(from) && ISO.test(to) && from <= to && Number.isFinite(v) && v > 0;

  // Değer / dönem değişince 300 ms sonra sunucu önizlemesi.
  useEffect(() => {
    if (!visible || !clinicId) return;
    if (debRef.current) clearTimeout(debRef.current);
    if (!inputsOk) { setQuote(null); setLoadingPrev(false); return; }
    const my = ++reqRef.current;
    debRef.current = setTimeout(async () => {
      setLoadingPrev(true);
      const res = await previewStatementDiscount({ clinicId, currency, from, to, kind, value: v });
      if (my !== reqRef.current) return;
      setQuote(res.data);
      setLoadingPrev(false);
    }, 300);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [visible, clinicId, currency, from, to, kind, v, inputsOk]);

  const fmt = (n: number) => formatMoney(Number(n) || 0, currency as Currency, { fractionDigits: 2 });

  const save = async () => {
    if (busy) return;
    setErr(null);
    if (!Number.isFinite(v) || v <= 0) { setErr('SD_VALUE'); return; }
    if (!ISO.test(from) || !ISO.test(to) || from > to || !ISO.test(date)) { setErr('error'); return; }
    if (quote && !quote.ok) { setErr(quote.error ?? 'error'); return; }
    setBusy(true);
    const res = await recordStatementDiscount({
      clinicId, currency, from, to, kind, value: v,
      date, description: desc.trim() || defaultDescription(from, to),
      idempotencyKey: idemRef.current,
    });
    setBusy(false);
    if (res.error || !res.data) { setErr(res.error ?? 'error'); return; }
    toast.success(autoT('İndirim kaydedildi'));
    onSaved();
  };

  const label: any = { ...U.colHeader, marginBottom: 6 };
  const input: any = U.inputStyle;
  const web = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};
  const previewErr = quote && !quote.ok ? autoT(sdErrorText(quote.error)) : null;

  const Row = ({ k, val, strong }: { k: string; val: string; strong?: boolean }) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ flex: 1, fontSize: 12.5, color: strong ? U.ink[900] : U.ink[700], fontWeight: strong ? '600' : '400' }}>{k}</Text>
      <Text style={{ fontSize: 13, fontWeight: strong ? '700' : '600', color: U.ink[900] }}>{val}</Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ ...U.modalOverlay, padding: narrow ? 12 : 24 }}>
          <View style={[U.modalCard, { maxWidth: 480 }, narrow ? { maxHeight: '94%' } : null]}>
            {/* Başlık */}
            <View style={U.modalHeaderRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={U.modalTitle} numberOfLines={1}>{autoT('Ekstre indirimi')}</Text>
                <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 2 }} numberOfLines={1}>{currency}</Text>
              </View>
              <GlassTooltip title={autoT('Kapat')} text={autoT('Pencereyi kaydetmeden kapat')} placement="bottom">
                <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={autoT('Kapat')}
                  style={{ ...U.modalCloseBtn, ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}) }}>
                  <X size={15} color={U.ink[500]} strokeWidth={2} />
                </Pressable>
              </GlassTooltip>
            </View>

            <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
              {/* Dönem */}
              <View>
                <Text style={label}>{autoT('Dönem')}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TextInput value={from} onChangeText={setFrom} style={[input, { flex: 1, minWidth: 0 }]}
                    placeholder="YYYY-AA-GG" placeholderTextColor={U.ink[400]} accessibilityLabel={autoT('Başlangıç')} />
                  <TextInput value={to} onChangeText={setTo} style={[input, { flex: 1, minWidth: 0 }]}
                    placeholder="YYYY-AA-GG" placeholderTextColor={U.ink[400]} accessibilityLabel={autoT('Bitiş')} />
                </View>
              </View>

              {/* İndirim türü + değer */}
              <View style={{ flexDirection: narrow ? 'column' : 'row', gap: 10 }}>
                <View>
                  <Text style={label}>{autoT('İndirim türü')}</Text>
                  <View style={{ flexDirection: 'row', gap: 4, padding: 3, backgroundColor: U.ink[100], borderRadius: 14, alignSelf: 'flex-start' }}>
                    {([
                      { key: 'percent', label: 'Yüzde' },
                      { key: 'fixed', label: 'Tutar' },
                    ] as const).map(opt => {
                      const active = kind === opt.key;
                      return (
                        <Pressable key={opt.key} onPress={() => { setKind(opt.key); setErr(null); }}
                          accessibilityRole="button" accessibilityState={{ selected: active }}
                          style={[{
                            paddingHorizontal: active ? 18 : 12, paddingVertical: 10, borderRadius: 11,
                            backgroundColor: active ? U.segActive : 'transparent',
                          }, web]}>
                          <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? U.ink[900] : U.ink[500] }}>
                            {autoT(opt.label)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={label}>{autoT(kind === 'percent' ? 'Yüzde' : 'Tutar')}</Text>
                  <TextInput value={value} onChangeText={t => { setValue(t); setErr(null); }} keyboardType="decimal-pad"
                    style={input} placeholder={kind === 'percent' ? '%' : currency} placeholderTextColor={U.ink[400]} />
                </View>
              </View>

              {/* Hesaplanan indirim — sunucu önizlemesi */}
              <View style={{ borderRadius: 14, backgroundColor: U.surfaceSoft, borderWidth: 1, borderColor: U.hairline, padding: 14, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: U.ink[400], letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 }}>
                    {autoT('Hesaplanan indirim')}
                  </Text>
                  {loadingPrev ? <ActivityIndicator size="small" color={U.ink[400]} /> : null}
                  {quote && quote.ok ? (
                    <Text style={{ fontSize: 15, fontWeight: '700', color: U.ink[900] }}>{`−${fmt(quote.amount)}`}</Text>
                  ) : null}
                </View>
                {quote ? (
                  <>
                    <Row k={autoT('Dönemin fatura toplamı')} val={fmt(quote.period_total)} />
                    {quote.prior_discounts > 0 ? (
                      <Row k={autoT('Bu döneme önceki indirimler')} val={`−${fmt(quote.prior_discounts)}`} />
                    ) : null}
                    {quote.ok ? (
                      <>
                        <Row k={autoT('Faturalara dağıtılacak')} val={fmt(quote.to_invoices)} />
                        <Row k={autoT('Alacağa kalacak')} val={fmt(quote.to_credit)} />
                        <View style={{ borderTopWidth: 1, borderTopColor: U.hairline, paddingTop: 8 }}>
                          <Row k={autoT('Yeni bakiye')} val={fmt(quote.balance_after)} strong />
                        </View>
                      </>
                    ) : null}
                    {previewErr ? (
                      <Text style={{ fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>{previewErr}</Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={{ fontSize: 12, color: U.ink[400] }}>—</Text>
                )}
              </View>

              {/* Tarih + açıklama */}
              <View>
                <Text style={label}>{autoT('Tarih')}</Text>
                <TextInput value={date} onChangeText={t => { setDate(t); setDateTouched(true); }} style={input}
                  placeholder="YYYY-AA-GG" placeholderTextColor={U.ink[400]} />
              </View>
              <View>
                <Text style={label}>{autoT('Açıklama')}</Text>
                <TextInput value={desc} onChangeText={t => { setDesc(t); setDescTouched(true); }} style={input}
                  placeholderTextColor={U.ink[400]} />
              </View>
            </ScrollView>

            {/* Alt bar — hata düğmenin yanında */}
            <View style={{
              flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'flex-end',
              paddingHorizontal: 18, paddingTop: 14,
              paddingBottom: 14 + (Platform.OS === 'web' ? 0 : insets.bottom),
              borderTopWidth: 1, borderTopColor: U.hairline,
            }}>
              {err ? (
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>
                  {autoT(sdErrorText(err))}
                </Text>
              ) : null}
              <Pressable onPress={onClose}
                style={[{
                  paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
                  borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
                }, web]}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Vazgeç')}</Text>
              </Pressable>
              <GlassTooltip title={autoT('İndirimi kaydet')}
                text={autoT('İndirimi kaydet; dönemin faturalarına dağıtılır, kalan kısım alacağa geçer')}
                enabled={!busy}>
                <Pressable onPress={save} disabled={busy}
                  style={[{
                    flexDirection: 'row', alignItems: 'center', gap: 7,
                    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999,
                    backgroundColor: U.ink[900], opacity: busy ? 0.6 : 1,
                  }, Platform.OS === 'web' ? ({ cursor: busy ? 'not-allowed' : 'pointer' } as any) : null]}>
                  {busy ? <ActivityIndicator size="small" color={U.onDarkPill} /> : null}
                  <Text style={{ fontSize: 13, fontWeight: '700', color: U.onDarkPill }}>{autoT('İndirimi kaydet')}</Text>
                </Pressable>
              </GlassTooltip>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
