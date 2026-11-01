/**
 * BulkEFaturaModal — Toplu e-Fatura.
 *
 * Siman her teslim edilen siparişe kendi faturasını açar; resmi e-fatura çoğu
 * zaman dönem sonunda klinik başına tek kesilir. Bu pencere iki işi yapar:
 *
 *   Yeni e-Fatura   klinik → faturaları seç → "Taslak oluştur" (sunucu önizlemesi,
 *                   EFaturaPreviewModal) → "Asıl faturayı oluştur". Tek Luca faturası
 *                   kesilir, seçilen tüm faturalar aynı ETTN/numarayı alır.
 *   Luca'da kesildi Luca'da kesilmiş e-faturalar listelenir (Siman'a bağlı olanlar rozetli).
 *                   "Bağla" → alıcı VKN'si ile klinik, Luca tarihine kadarki faturalar önden
 *                   seçilir, tutarlar karşılaştırılır; sunucu ETTN'yi doğrulayıp bağlar.
 *                   Listede olmayan (ör. e-Arşiv) için ETTN elle girilebilir.
 *
 * İki modda da taslak (kesilmemiş) faturalar başarıda "kesildi" olur. Kurallar
 * sunucuda (efatura-luca merge_* / link_*); burası yalnız seçim ve gösterim.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { formatMoney } from '../../../core/money/currency';
import { toast } from '../../../core/ui/Toast';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import {
  AlertCircle, Building2, Check, CheckCircle2, ChevronLeft, FileText, Link2, Search, X as CloseX,
} from '../../../core/ui/icons';
import { ACTION_NAVY, NavyButton, navyTones } from '../../invoices/components/InvoiceActionsCard';
import {
  fetchBulkCandidates, previewMerge, sendMerge, lookupExternal, linkExternal, listLucaIssued, fetchLinkedCounts,
  type BulkCandidate, type ExternalInvoiceInfo, type LucaIssued,
} from '../bulkApi';
import { matchLucaInvoice, amountsMatch } from '../lib/linkMatch';
import { clinicEFaturaGaps, EFATURA_GAP_LABELS, type EFaturaGap } from '../lib/readiness';
import { useRouter, useSegments } from 'expo-router';
import { STATUS_LABELS } from '../api';
import { draftMinutesLeft } from '../lib/efaturaFlow';
import type { EFaturaPreview } from '../types';
import { EFaturaPreviewModal } from './EFaturaPreviewModal';

type Mode = 'merge' | 'link';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Fatura(lar) e-faturalandı → listeyi tazele */
  onDone?: () => void;
}

interface ClinicGroup { id: string; name: string; logo: string | null; count: number; currencies: string[]; gaps: EFaturaGap[] }

const money = (n: number, cur: string) => formatMoney(Number(n) || 0, (cur || 'TRY') as any);
const web = (cursor = 'pointer') => (Platform.OS === 'web' ? ({ cursor } as any) : {});

export function BulkEFaturaModal({ visible, onClose, onDone }: Props) {
  const U = useInkUI();
  const navy = navyTones(U.isDark);
  const router = useRouter();
  const segments = useSegments();
  const gapText = (g: EFaturaGap[]) => g.map((x) => autoT(EFATURA_GAP_LABELS[x])).join(', ');
  /** Eksik bilgi → klinik düzenleme penceresi (panel-agnostik) */
  const editClinic = (id: string) => {
    const group = String(segments[0] ?? '').startsWith('(') ? String(segments[0]) : '(lab)';
    onClose();
    router.push(`/${group}/clinics?editClinic=${id}` as any);
  };
  // Dar ekranda sekme ikonları düşer — etiketler kesilmesin.
  const narrow = useWindowDimensions().width < 480;

  const [mode, setMode] = useState<Mode>('merge');
  const [rows, setRows] = useState<BulkCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [clinicQuery, setClinicQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Yeni e-Fatura: taslak
  const [draft, setDraft] = useState<{ preview: EFaturaPreview; token: string; expiresAt: string; count: number } | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftErr, setDraftErr] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueErr, setIssueErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Luca'da kesildi: ETTN
  const [ettn, setEttn] = useState('');
  const [found, setFound] = useState<ExternalInvoiceInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  // Luca'da kesilenler listesi
  const [issued, setIssued] = useState<LucaIssued[]>([]);
  const [issuedLoading, setIssuedLoading] = useState(false);
  const [issuedErr, setIssuedErr] = useState<string | null>(null);
  const [issuedPage, setIssuedPage] = useState(1);
  const [issuedPages, setIssuedPages] = useState(1);
  const [linkedCounts, setLinkedCounts] = useState<Map<string, number>>(new Map());
  const [picked, setPicked] = useState<LucaIssued | null>(null);
  const [pickErr, setPickErr] = useState<{ ettn: string; msg: string } | null>(null);
  /** Listede olmayan fatura (ör. e-Arşiv) → klinik seç + ETTN elle */
  const [manualEttn, setManualEttn] = useState(false);

  const load = async () => {
    setLoading(true); setLoadErr(null);
    const r = await fetchBulkCandidates();
    setLoading(false);
    if (r.error) { setLoadErr(autoT('Faturalar yüklenemedi')); return; }
    setRows(r.data);
  };

  useEffect(() => {
    if (!visible) return;
    setMode('merge'); setClinicId(null); setCurrency(null); setClinicQuery(''); setSelected(new Set());
    setDraft(null); setDraftErr(null); setIssueErr(null); setPreviewOpen(false);
    setEttn(''); setFound(null); setActionErr(null);
    setIssued([]); setIssuedErr(null); setPicked(null); setPickErr(null); setManualEttn(false);
    load();
  }, [visible]);

  const loadIssued = async (p: number) => {
    setIssuedLoading(true); setIssuedErr(null);
    const r = await listLucaIssued(p);
    setIssuedLoading(false);
    if (!r.ok) { setIssuedErr(autoT(r.error)); return; }
    const next = p === 1 ? r.items : [...issued, ...r.items];
    setIssued(next); setIssuedPage(r.page); setIssuedPages(r.pages);
    setLinkedCounts(await fetchLinkedCounts(next.map((i) => i.ettn)));
  };
  useEffect(() => {
    if (visible && mode === 'link' && !issued.length && !issuedLoading && !issuedErr) loadIssued(1);
  }, [visible, mode]);

  useEffect(() => {
    if (!draft?.expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [draft?.expiresAt]);

  const clinics = useMemo<ClinicGroup[]>(() => {
    const m = new Map<string, ClinicGroup>();
    for (const r of rows) {
      const g = m.get(r.clinic_id) ?? {
        id: r.clinic_id, name: r.clinic_name, logo: r.clinic_logo, count: 0, currencies: [],
        gaps: clinicEFaturaGaps({ vkn: r.clinic_vkn, tax_office: r.clinic_tax_office, address: r.clinic_address }),
      };
      g.count += 1;
      if (!g.currencies.includes(r.currency)) g.currencies.push(r.currency);
      m.set(r.clinic_id, g);
    }
    const q = clinicQuery.trim().toLocaleLowerCase('tr-TR');
    return [...m.values()]
      .filter((g) => !q || g.name.toLocaleLowerCase('tr-TR').includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [rows, clinicQuery]);

  const clinic = clinics.find((c) => c.id === clinicId) ?? null;
  const list = useMemo(
    () => rows.filter((r) => r.clinic_id === clinicId && r.currency === currency),
    [rows, clinicId, currency],
  );
  const chosen = list.filter((r) => selected.has(r.id));
  const chosenIds = chosen.map((r) => r.id);
  const chosenTotal = Math.round(chosen.reduce((a, r) => a + r.total, 0) * 100) / 100;
  const draftCount = chosen.filter((r) => r.status === 'taslak').length;
  const allOn = list.length > 0 && chosen.length === list.length;

  // Seçim değişirse eski taslak / arama sonucu geçersiz.
  const resetResults = () => { setDraft(null); setDraftErr(null); setIssueErr(null); setFound(null); setActionErr(null); };

  const pickClinic = (g: ClinicGroup) => {
    const cur = g.currencies[0];
    setClinicId(g.id);
    setCurrency(cur);
    setSelected(new Set(rows.filter((r) => r.clinic_id === g.id && r.currency === cur).map((r) => r.id)));
    resetResults();
  };
  const pickCurrency = (cur: string) => {
    setCurrency(cur);
    setSelected(new Set(rows.filter((r) => r.clinic_id === clinicId && r.currency === cur).map((r) => r.id)));
    resetResults();
  };
  const toggle = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    resetResults();
  };
  const toggleAll = () => { setSelected(allOn ? new Set() : new Set(list.map((r) => r.id))); resetResults(); };

  // ── Yeni e-Fatura ──
  const createDraft = async (keepIssueErr = false) => {
    if (!chosenIds.length) return;
    setDraftLoading(true); setDraftErr(null);
    if (!keepIssueErr) setIssueErr(null);
    setPreviewOpen(true);
    const r = await previewMerge(chosenIds);
    setDraftLoading(false);
    setNow(Date.now());
    if (!r.ok) { setDraft(null); setDraftErr(autoT(r.error)); return; }
    setDraft({ preview: r.preview, token: r.token, expiresAt: r.expiresAt, count: r.count });
  };

  const issue = async () => {
    if (!draft) return;
    setIssuing(true); setIssueErr(null);
    const r = await sendMerge(chosenIds, draft.token);
    setIssuing(false);
    if (r.ok) {
      toast.success(`${autoT(r.type === 'e_arsiv' ? 'e-Arşiv faturası kesildi' : 'e-Fatura kesildi')} · ${r.count} ${autoT('fatura')}`);
      setPreviewOpen(false);
      onDone?.();
      onClose();
      return;
    }
    setIssueErr(autoT(r.error));
    if (r.needsPreview) createDraft(true);
  };

  // ── Luca'da kesildi ──
  const lookup = async () => {
    setBusy(true); setActionErr(null); setFound(null);
    const r = await lookupExternal(chosenIds, ettn.trim());
    setBusy(false);
    if (!r.ok) { setActionErr(autoT(r.error)); return; }
    setFound(r.info);
  };
  /** Listeden Luca faturası seç → klinik + faturalar önden seçilir, sunucu ETTN'yi doğrular. */
  const pickIssued = async (it: LucaIssued) => {
    setPickErr(null);
    const m = matchLucaInvoice(rows, { buyerVkn: it.buyerVkn, currency: it.currency, date: it.date });
    if (!m.ok) { setPickErr({ ettn: it.ettn, msg: autoT(m.error) }); return; }
    setPicked(it); setClinicId(m.clinicId); setCurrency(m.currency); setSelected(new Set(m.ids));
    setEttn(it.ettn); setFound(null); setActionErr(null); setDraft(null);
    if (!m.ids.length) return;
    setBusy(true);
    const r = await lookupExternal(m.ids, it.ettn);
    setBusy(false);
    if (!r.ok) { setActionErr(autoT(r.error)); return; }
    setFound(r.info);
  };

  const link = async () => {
    if (!found) return;
    setBusy(true); setActionErr(null);
    const r = await linkExternal(chosenIds, found.ettn);
    setBusy(false);
    if (!r.ok) { setActionErr(autoT(r.error)); return; }
    toast.success(`${autoT('Luca faturası bağlandı')} · ${r.info.count} ${autoT('fatura')}`);
    onDone?.();
    onClose();
  };

  const minutesLeft = draftMinutesLeft(draft?.expiresAt ?? null, now);
  const label = (s: string) => (
    <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[400] }}>{s}</Text>
  );
  const chip = (text: string, tone: { bg: string; fg: string }) => (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: tone.bg }}>
      <Text style={{ fontSize: 10.5, fontWeight: '700', color: tone.fg }}>{text}</Text>
    </View>
  );
  const errorBox = (msg: string) => (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: U.chipTones.danger.bg }}>
      <AlertCircle size={14} strokeWidth={1.9} color={U.chipTones.danger.fg} />
      <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>{msg}</Text>
    </View>
  );
  const close = () => { if (!issuing && !busy) onClose(); };

  return (
    <>
      <Modal visible={visible && !previewOpen} transparent animationType="fade" onRequestClose={close}>
        <Pressable style={U.modalOverlay} onPress={close}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ ...U.modalCard, maxWidth: 640 }}>
            {/* Başlık */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: U.ink[900] }}>Toplu e-Fatura</Text>
                <Text style={{ fontSize: 12.5, color: U.ink[500] }}>
                  Bir kliniğin faturalarını tek resmi e-faturada birleştirin.
                </Text>
              </View>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel={autoT('Kapat')}
                style={{ width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, ...web() }}
              >
                <CloseX size={14} color={U.plainBtn.fgMuted} strokeWidth={1.8} />
              </Pressable>
            </View>

            {/* Mod */}
            <View style={{ paddingHorizontal: 22, paddingTop: 14 }}>
              <View style={{ flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: U.surfaceSoft, borderWidth: 1, borderColor: U.hairlineSoft }}>
                {([
                  { k: 'merge' as const, t: autoT('Yeni e-Fatura'), Icon: FileText },
                  { k: 'link' as const, t: autoT('Luca\'da kesildi'), Icon: Link2 },
                ]).map(({ k, t, Icon }) => {
                  const on = mode === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => { setMode(k); resetResults(); if (k === 'merge') { setPicked(null); setEttn(''); } }}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      style={{
                        flex: on ? 1.55 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        paddingHorizontal: on ? 12 : 8, paddingVertical: 8, borderRadius: 999,
                        backgroundColor: on ? U.surface : 'transparent',
                        ...(on && Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.12)' } as any : {}),
                        ...web(),
                      }}
                    >
                      {narrow ? null : <Icon size={13} strokeWidth={1.9} color={on ? navy.ink : U.ink[500]} />}
                      <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: on ? '700' : '500', color: on ? U.ink[900] : U.ink[500] }}>{t}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 22, paddingVertical: 16, gap: 14 }}>
              {loading ? (
                <View style={{ paddingVertical: 36, alignItems: 'center' }}><ActivityIndicator color={U.ink[500]} /></View>
              ) : loadErr ? (
                errorBox(loadErr)
              ) : !clinic && mode === 'link' && !manualEttn ? (
                /* 1 — Luca'da kesilen e-faturalar */
                <View style={{ gap: 8 }}>
                  {label(autoT('Luca\'da kesilen e-faturalar'))}
                  {issuedErr ? errorBox(issuedErr) : null}
                  {issuedLoading && !issued.length ? (
                    <View style={{ paddingVertical: 28, alignItems: 'center', gap: 10 }}>
                      <ActivityIndicator color={U.ink[500]} />
                      <Text style={{ fontSize: 12.5, color: U.ink[500] }}>Luca'dan alınıyor…</Text>
                    </View>
                  ) : !issuedErr && !issued.length ? (
                    <Text style={{ fontSize: 13, color: U.ink[500], paddingVertical: 16, textAlign: 'center' }}>Luca'da kesilmiş e-fatura yok</Text>
                  ) : null}
                  {issued.map((it) => {
                    const n = linkedCounts.get(it.ettn) ?? 0;
                    const tone = it.status === 'accepted' ? U.chipTones.success
                      : it.status === 'sent' ? U.chipTones.info
                      : it.status === 'cancelled' ? U.chipTones.neutral : U.chipTones.danger;
                    return (
                      <View key={it.ettn} style={{ gap: 8, padding: 12, borderRadius: 16, backgroundColor: U.surfaceSoft, borderWidth: 1, borderColor: U.hairlineSoft }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                            <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '700', color: U.ink[900] }}>{it.buyerName || '—'}</Text>
                            <Text numberOfLines={1} style={{ fontSize: 11.5, color: U.ink[500] }}>
                              <Text style={{ fontFamily: 'monospace' as any }}>{it.number}</Text>
                              {it.date ? ` · ${new Date(`${it.date}T00:00:00`).toLocaleDateString(localeTag())}` : ''}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: U.ink[900] }}>{money(it.payable, it.currency)}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          {chip(autoT(STATUS_LABELS[it.status]?.label ?? it.status), tone)}
                          <View style={{ flex: 1 }} />
                          {n > 0 ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <CheckCircle2 size={14} strokeWidth={1.9} color={U.chipTones.success.fg} />
                              <Text style={{ fontSize: 12, fontWeight: '700', color: U.chipTones.success.fg }}>{`${autoT('Siman\'da')} · ${n} ${autoT('fatura')}`}</Text>
                            </View>
                          ) : (
                            <Pressable
                              onPress={() => pickIssued(it)}
                              disabled={busy}
                              style={({ pressed }) => ({
                                flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                                backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
                                opacity: busy ? 0.5 : pressed ? 0.85 : 1, ...web(),
                              })}
                            >
                              <Link2 size={13} strokeWidth={1.9} color={U.plainBtn.fg} />
                              <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.plainBtn.fg }}>Siman faturalarına bağla</Text>
                            </Pressable>
                          )}
                        </View>
                        {pickErr?.ettn === it.ettn ? errorBox(pickErr.msg) : null}
                      </View>
                    );
                  })}
                  {issuedPage < issuedPages ? (
                    <Pressable onPress={() => loadIssued(issuedPage + 1)} disabled={issuedLoading} style={{ alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, ...web() }}>
                      <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.plainBtn.fg }}>{issuedLoading ? autoT('Yükleniyor…') : autoT('Daha fazla')}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => { setManualEttn(true); setPickErr(null); }} style={{ alignSelf: 'center', paddingVertical: 6, ...web() }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: navy.ink }}>Listede yok mu? ETTN ile bağla</Text>
                  </Pressable>
                </View>
              ) : !clinic ? (
                /* 1 — Klinik */
                <View style={{ gap: 8 }}>
                  {mode === 'link' ? (
                    <Pressable onPress={() => setManualEttn(false)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', ...web() }}>
                      <ChevronLeft size={13} strokeWidth={1.9} color={navy.ink} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: navy.ink }}>Luca'da kesilen e-faturalar</Text>
                    </Pressable>
                  ) : null}
                  {label(autoT('Klinik'))}
                  {rows.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
                      <CheckCircle2 size={26} strokeWidth={1.5} color={U.chipTones.success.fg} />
                      <Text style={{ fontSize: 13, color: U.ink[500] }}>e-Fatura bekleyen fatura yok</Text>
                    </View>
                  ) : (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: U.hairline, backgroundColor: U.surface }}>
                        <Search size={13} strokeWidth={1.7} color={U.ink[400]} />
                        <TextInput
                          value={clinicQuery}
                          onChangeText={setClinicQuery}
                          placeholder="Klinik ara"
                          placeholderTextColor={U.ink[400]}
                          style={{ flex: 1, fontSize: 13, color: U.ink[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
                        />
                      </View>
                      {clinics.map((g) => (
                        <Pressable
                          key={g.id}
                          onPress={() => pickClinic(g)}
                          style={({ pressed }) => ({
                            flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16,
                            backgroundColor: pressed ? U.rowHover : U.surfaceSoft, borderWidth: 1, borderColor: U.hairlineSoft, ...web(),
                          })}
                        >
                          <View style={{ width: 34, height: 34, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: g.logo ? '#FFFFFF' : U.chipNeutral }}>
                            {g.logo
                              ? <Image source={{ uri: g.logo }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                              : <Building2 size={16} strokeWidth={1.7} color={U.ink[500]} />}
                          </View>
                          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '600', color: U.ink[900] }}>{g.name}</Text>
                            {mode === 'merge' && g.gaps.length ? (
                              <Text numberOfLines={1} style={{ fontSize: 11.5, fontWeight: '600', color: U.chipTones.warning.fg }}>
                                {`${autoT('e-Fatura için eksik')}: ${gapText(g.gaps)}`}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={{ fontSize: 12, color: U.ink[500] }}>{`${g.count} ${autoT('fatura')}`}</Text>
                        </Pressable>
                      ))}
                    </>
                  )}
                </View>
              ) : (
                <>
                  {/* Seçili klinik */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Pressable
                      onPress={() => { setClinicId(null); setSelected(new Set()); setPicked(null); setEttn(''); resetResults(); }}
                      accessibilityRole="button"
                      accessibilityLabel={autoT('Kliniği değiştir')}
                      style={{ width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, ...web() }}
                    >
                      <ChevronLeft size={14} strokeWidth={1.9} color={U.plainBtn.fg} />
                    </Pressable>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 14.5, fontWeight: '700', color: U.ink[900] }}>{clinic.name}</Text>
                    {clinic.currencies.length > 1 ? (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {clinic.currencies.map((c) => (
                          <Pressable key={c} onPress={() => pickCurrency(c)} style={{
                            paddingHorizontal: currency === c ? 14 : 10, paddingVertical: 6, borderRadius: 999,
                            backgroundColor: currency === c ? U.ink[900] : U.plainBtn.bg, borderWidth: 1, borderColor: currency === c ? 'transparent' : U.plainBtn.border, ...web(),
                          }}>
                            <Text style={{ fontSize: 11.5, fontWeight: '700', color: currency === c ? U.onDarkPill : U.plainBtn.fg }}>{c}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  {mode === 'merge' && clinic.gaps.length ? (
                    <View accessibilityRole="alert" style={{ gap: 10, padding: 14, borderRadius: 16, backgroundColor: U.chipTones.warning.bg }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                        <AlertCircle size={15} strokeWidth={1.9} color={U.chipTones.warning.fg} style={{ marginTop: 1 }} />
                        <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: '600', color: U.chipTones.warning.fg }}>
                          {`${autoT('Bu klinik e-faturaya hazır değil. Eksik')}: ${gapText(clinic.gaps)}`}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => editClinic(clinic.id)}
                        style={({ pressed }) => ({
                          alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                          backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, opacity: pressed ? 0.85 : 1, ...web(),
                        })}
                      >
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.plainBtn.fg }}>Klinik bilgilerini düzenle</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {/* 2 — Faturalar */}
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      {label(autoT('Faturalar'))}
                      <Pressable onPress={toggleAll} style={web()}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: navy.ink }}>{allOn ? autoT('Seçimi kaldır') : autoT('Tümünü seç')}</Text>
                      </Pressable>
                    </View>
                    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: U.hairlineSoft, overflow: 'hidden' }}>
                      {list.map((r, i) => {
                        const on = selected.has(r.id);
                        return (
                          <Pressable
                            key={r.id}
                            onPress={() => toggle(r.id)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                            style={({ pressed }) => ({
                              flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10,
                              backgroundColor: pressed ? U.rowHover : 'transparent',
                              borderTopWidth: i === 0 ? 0 : 1, borderTopColor: U.hairlineSoft, ...web(),
                            })}
                          >
                            <View style={{
                              width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
                              backgroundColor: on ? ACTION_NAVY : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: U.fieldBorder,
                            }}>
                              {on ? <Check size={12} strokeWidth={2.6} color="#FFFFFF" /> : null}
                            </View>
                            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900], fontFamily: 'monospace' as any }}>{r.invoice_number}</Text>
                                {r.status === 'taslak' ? chip(autoT('Taslak · kesilecek'), U.chipTones.warning) : null}
                              </View>
                              <Text numberOfLines={1} style={{ fontSize: 11.5, color: U.ink[500] }}>
                                {new Date(`${r.issue_date}T00:00:00`).toLocaleDateString(localeTag())}
                                {r.order_number ? ` · ${r.order_number}` : ''}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: on ? U.ink[900] : U.ink[400] }}>{money(r.total, r.currency)}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {draftCount > 0 ? (
                      <Text style={{ fontSize: 11.5, color: U.ink[500], lineHeight: 16 }}>
                        Taslak faturalar e-faturayla birlikte kesilmiş sayılır.
                      </Text>
                    ) : null}
                  </View>

                  {/* 3 — Luca'da kesildi: ETTN */}
                  {mode === 'link' && picked ? (
                    <View style={{ gap: 8, padding: 14, borderRadius: 16, backgroundColor: navy.soft, borderWidth: 1, borderColor: navy.line }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Link2 size={14} strokeWidth={1.9} color={navy.ink} />
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: U.ink[900], fontFamily: 'monospace' as any }}>{picked.number}</Text>
                        {busy ? <ActivityIndicator size={14} color={navy.ink} /> : found ? chip(autoT(STATUS_LABELS[found.status]?.label ?? found.status), U.chipTones.info) : null}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
                        <View style={{ gap: 2 }}>
                          {label(autoT('Luca faturası'))}
                          <Text style={{ fontSize: 15, fontWeight: '700', color: U.ink[900] }}>{money(picked.payable, picked.currency)}</Text>
                        </View>
                        <View style={{ gap: 2 }}>
                          {label(autoT('Seçilen faturalar'))}
                          <Text style={{ fontSize: 15, fontWeight: '700', color: U.ink[900] }}>{money(chosenTotal, picked.currency)}</Text>
                        </View>
                      </View>
                      {amountsMatch(picked.payable, chosenTotal, chosen.length) ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <CheckCircle2 size={14} strokeWidth={1.9} color={U.chipTones.success.fg} />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: U.chipTones.success.fg }}>Tutarlar eşleşiyor</Text>
                        </View>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <AlertCircle size={14} strokeWidth={1.9} color={U.chipTones.warning.fg} />
                          <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: U.chipTones.warning.fg }}>Tutarlar farklı — seçimi kontrol edin</Text>
                        </View>
                      )}
                    </View>
                  ) : mode === 'link' ? (
                    <View style={{ gap: 8 }}>
                      {label('ETTN')}
                      <TextInput
                        value={ettn}
                        onChangeText={(t) => { setEttn(t); setFound(null); setActionErr(null); }}
                        placeholder="06904b10-9810-497f-80e9-0df2b68ddb37"
                        placeholderTextColor={U.ink[300]}
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={{
                          ...U.inputStyle, fontFamily: 'monospace' as any, fontSize: 13,
                          ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                        }}
                      />
                      <Text style={{ fontSize: 11.5, color: U.ink[500], lineHeight: 16 }}>
                        Luca'daki fatura PDF'inde ETTN olarak yazan 36 karakterlik kod.
                      </Text>
                      {found ? (
                        <View style={{ gap: 8, padding: 14, borderRadius: 16, backgroundColor: navy.soft, borderWidth: 1, borderColor: navy.line }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <CheckCircle2 size={15} strokeWidth={1.9} color={navy.ink} />
                            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: U.ink[900] }}>Luca'da bulundu</Text>
                            {chip(autoT(STATUS_LABELS[found.status]?.label ?? found.status), U.chipTones.info)}
                          </View>
                          <Text style={{ fontSize: 13, color: U.ink[700] }}>
                            {`${found.kind === 'e_arsiv' ? 'e-Arşiv' : 'e-Fatura'} · ${found.number ?? '—'}`}
                          </Text>
                          <Text style={{ fontSize: 12, color: U.ink[500], lineHeight: 17 }}>
                            {`${autoT('Seçilen faturaların toplamı')}: ${money(found.total, found.currency)}. ${autoT('Luca\'daki faturanın tutarıyla aynı olduğunu kontrol edin.')}`}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </>
              )}
            </ScrollView>

            {/* Alt çubuk — hata BUTONUN YANINDA */}
            {clinic ? (
              <View style={{ paddingHorizontal: 22, paddingVertical: 14, gap: 10, borderTopWidth: 1, borderTopColor: U.hairline }}>
                {actionErr ? errorBox(actionErr) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 160, gap: 1 }}>
                    <Text style={{ fontSize: 11.5, color: U.ink[500] }}>{`${chosen.length} ${autoT('fatura seçildi')}`}</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: U.ink[900] }}>{money(chosenTotal, currency ?? 'TRY')}</Text>
                  </View>
                  {mode === 'merge' ? (
                    <NavyButton
                      label={draft && minutesLeft !== 0 ? autoT('Taslağı aç') : autoT('Taslak oluştur')}
                      icon={<FileText size={13} strokeWidth={1.9} color="#FFFFFF" />}
                      onPress={() => (draft && minutesLeft !== 0 ? setPreviewOpen(true) : createDraft())}
                      disabled={!chosen.length || draftLoading || clinic.gaps.length > 0}
                    />
                  ) : found ? (
                    <NavyButton
                      label={busy ? autoT('Faturalar bağlanıyor…') : `${chosen.length} ${autoT('faturaya bağla')}`}
                      icon={busy ? <ActivityIndicator size={16} color="#FFFFFF" /> : <Link2 size={13} strokeWidth={1.9} color="#FFFFFF" />}
                      onPress={link}
                      disabled={busy || !chosen.length}
                    />
                  ) : (
                    <NavyButton
                      label={busy ? autoT('Luca\'da aranıyor…') : autoT('Luca\'da ara')}
                      icon={busy ? <ActivityIndicator size={16} color="#FFFFFF" /> : <Search size={13} strokeWidth={1.9} color="#FFFFFF" />}
                      onPress={lookup}
                      disabled={busy || !chosen.length || ettn.trim().length < 36}
                    />
                  )}
                </View>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <EFaturaPreviewModal
        visible={visible && previewOpen}
        preview={draft?.preview ?? null}
        loading={draftLoading}
        loadErr={draftErr}
        issuing={issuing}
        issueErr={issueErr}
        expired={minutesLeft === 0}
        mergedCount={draft?.count ?? chosen.length}
        onClose={() => setPreviewOpen(false)}
        onRefresh={() => createDraft()}
        onIssue={issue}
      />
    </>
  );
}
