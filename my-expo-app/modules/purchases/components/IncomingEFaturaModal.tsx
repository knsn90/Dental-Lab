/**
 * IncomingEFaturaModal — Gelen e-Faturalar (tedarikçilerin Luca üzerinden lab'a kestiği).
 *
 * Liste Luca'dan okunur (salt okunur). Kaydedilmemiş bir faturada "Alış faturası yap":
 * kalemler + PDF alınır, mevcut Alış Faturası formu birebir dolar (onPick). Kaydedilmiş
 * fatura (purchase_invoices.efatura_ettn) "Kaydedildi" görünür, tekrar aktarılamaz.
 * Ticari faturada kabul/red Luca portalındadır (proxy bu işlemi geçirmez).
 */
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { formatMoney } from '../../../core/money/currency';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { AlertCircle, CheckCircle2, Inbox, Receipt, RefreshCw, X as CloseX } from '../../../core/ui/icons';
import { listIncoming, getIncoming, fetchImported, type IncomingSummary } from '../incomingApi';
import { incomingStatus, incomingToPrefill, type PurchasePrefill } from '../lib/incomingPrefill';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Seçilen fatura → Alış Faturası formu ön dolumu */
  onPick: (prefill: PurchasePrefill) => void;
}

const money = (n: number, cur: string) => formatMoney(Number(n) || 0, (cur || 'TRY') as any);
const web = (on = true) => (Platform.OS === 'web' && on ? ({ cursor: 'pointer' } as any) : {});

export function IncomingEFaturaModal({ visible, onClose, onPick }: Props) {
  const U = useInkUI();
  const [items, setItems] = useState<IncomingSummary[]>([]);
  const [imported, setImported] = useState<Map<string, string>>(new Map());
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<{ ettn: string; msg: string } | null>(null);

  const load = async (p: number) => {
    setLoading(true); setLoadErr(null); setRowErr(null);
    const r = await listIncoming(p);
    setLoading(false);
    if (!r.ok) { setLoadErr(autoT(r.error)); return; }
    const next = p === 1 ? r.items : [...items, ...r.items];
    setItems(next); setPage(r.page); setPages(r.pages); setTotal(r.total);
    setImported(await fetchImported(next.map((i) => i.ettn)));
  };

  useEffect(() => { if (visible) { setItems([]); load(1); } }, [visible]);

  const pick = async (it: IncomingSummary) => {
    setOpening(it.ettn); setRowErr(null);
    const r = await getIncoming(it.ettn);
    setOpening(null);
    if (!r.ok) { setRowErr({ ettn: it.ettn, msg: autoT(r.error) }); return; }
    if (!r.invoice.lines.length) { setRowErr({ ettn: it.ettn, msg: autoT('Faturada kalem bulunamadı') }); return; }
    onPick(incomingToPrefill(r.invoice, r.pdf));
  };

  const anyPending = items.some((i) => i.status === 'Onay_Bekliyor' && !imported.has(i.ettn));
  const chip = (text: string, tone: { bg: string; fg: string }) => (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: tone.bg }}>
      <Text style={{ fontSize: 10.5, fontWeight: '700', color: tone.fg }}>{text}</Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={U.modalOverlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ ...U.modalCard, maxWidth: 640 }}>
          {/* Başlık */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: U.ink[900] }}>Gelen e-Faturalar</Text>
              <Text style={{ fontSize: 12.5, color: U.ink[500], lineHeight: 17 }}>
                Tedarikçilerin size kestiği e-faturalar. Birini seçin, alış faturası formu birebir dolsun.
              </Text>
            </View>
            <Pressable
              onPress={() => load(1)}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={autoT('Yenile')}
              style={{ width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, opacity: loading ? 0.5 : 1, ...web(!loading) }}
            >
              <RefreshCw size={13} color={U.plainBtn.fgMuted} strokeWidth={1.8} />
            </Pressable>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={autoT('Kapat')}
              style={{ width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, ...web() }}
            >
              <CloseX size={14} color={U.plainBtn.fgMuted} strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 22, paddingVertical: 16, gap: 10 }}>
            {loadErr ? (
              <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: U.chipTones.danger.bg }}>
                <AlertCircle size={14} strokeWidth={1.9} color={U.chipTones.danger.fg} />
                <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: U.chipTones.danger.fg }}>{loadErr}</Text>
              </View>
            ) : null}

            {loading && !items.length ? (
              <View style={{ paddingVertical: 36, alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color={U.ink[500]} />
                <Text style={{ fontSize: 12.5, color: U.ink[500] }}>Luca'dan alınıyor…</Text>
              </View>
            ) : !loadErr && !items.length ? (
              <View style={{ paddingVertical: 32, alignItems: 'center', gap: 8 }}>
                <Inbox size={26} strokeWidth={1.5} color={U.ink[300]} />
                <Text style={{ fontSize: 13, color: U.ink[500] }}>Gelen e-fatura yok</Text>
              </View>
            ) : null}

            {items.map((it) => {
              const st = incomingStatus(it.status);
              const done = imported.has(it.ettn);
              const busy = opening === it.ettn;
              return (
                <View key={it.ettn} style={{ gap: 8, padding: 14, borderRadius: 16, backgroundColor: U.surfaceSoft, borderWidth: 1, borderColor: U.hairlineSoft }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                      <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '700', color: U.ink[900] }}>{it.supplierName || '—'}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 11.5, color: U.ink[500] }}>
                        <Text style={{ fontFamily: 'monospace' as any }}>{it.number}</Text>
                        {it.date ? ` · ${new Date(`${it.date}T00:00:00`).toLocaleDateString(localeTag())}` : ''}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: U.ink[900] }}>{money(it.payable, it.currency)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    {chip(autoT(st.label), U.chipTones[st.tone])}
                    {it.scenario === 'TICARIFATURA' ? chip(autoT('Ticari'), U.chipTones.neutral) : null}
                    <View style={{ flex: 1 }} />
                    {done ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={14} strokeWidth={1.9} color={U.chipTones.success.fg} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: U.chipTones.success.fg }}>Alış faturası kaydedildi</Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => pick(it)}
                        disabled={!!opening}
                        style={({ pressed }) => ({
                          flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                          backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
                          opacity: opening && !busy ? 0.5 : pressed ? 0.85 : 1, ...web(!opening),
                        })}
                      >
                        {busy ? <ActivityIndicator size={14} color={U.plainBtn.fg} /> : <Receipt size={13} strokeWidth={1.9} color={U.plainBtn.fg} />}
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.plainBtn.fg }}>
                          {busy ? autoT('Fatura alınıyor…') : autoT('Alış faturası yap')}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  {rowErr?.ettn === it.ettn ? (
                    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: U.chipTones.danger.bg }}>
                      <AlertCircle size={13} strokeWidth={1.9} color={U.chipTones.danger.fg} />
                      <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>{rowErr.msg}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}

            {page < pages ? (
              <Pressable onPress={() => load(page + 1)} disabled={loading} style={{ alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, ...web(!loading) }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.plainBtn.fg }}>{loading ? autoT('Yükleniyor…') : autoT('Daha fazla')}</Text>
              </Pressable>
            ) : null}
          </ScrollView>

          {items.length ? (
            <View style={{ paddingHorizontal: 22, paddingVertical: 12, gap: 4, borderTopWidth: 1, borderTopColor: U.hairline }}>
              <Text style={{ fontSize: 11.5, color: U.ink[500] }}>{`${total} ${autoT('gelen e-fatura')} · ${imported.size} ${autoT('kaydedildi')}`}</Text>
              {anyPending ? (
                <Text style={{ fontSize: 11, lineHeight: 15, color: U.ink[400] }}>
                  Ticari faturalarda kabul / red Luca portalından yapılır; 8 gün içinde yanıt verilmezse otomatik kabul edilir.
                </Text>
              ) : null}
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
