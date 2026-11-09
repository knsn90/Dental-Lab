/**
 * Mali İşlemler — Ön ekstre (klinik/hekim).
 *
 * Lab'ın kesmeden önce onaya sunduğu taslak faturalar. Kurallar
 * modules/invoices/lib/preStatement.ts'de (saf, testli); bu ekran yalnız çizer.
 *
 *  - Üstte para birimi başına üç rakam: kesinleşmiş bakiye · vadesi geçen ·
 *    onay bekleyen. 'own' kapsamda (billing_view'siz hekim) ilk ikisi null →
 *    gizlenir, bilgi satırı çıkar.
 *  - Taslak faturalar açılır; kalemde itiraz rozeti + not sayısı. Kaleme
 *    dokununca StatementNoteSheet (ortalanmış popup).
 *  - Onay butonları yalnız canApprove(actor, enabled). Onay öncesi diyalog;
 *    sonuçtan sonra HER ZAMAN yeniden çekilir.
 *  - Lab ayarı kapalıysa (enabled=false) taslaklar gösterilmez — bugünkü akış.
 *
 * Mobilde kart liste, masaüstünde tablo (hub ile aynı 900px eşiği).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import {
  FileCheck, ChevronDown, ChevronRight, User, MessageSquare, Info, CheckCircle2, AlertTriangle, RefreshCw,
} from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { KPICardX } from '../../../core/ui/KPICardX';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { fetchPreStatement, approvePreStatement } from '../../invoices/preStatementApi';
import {
  canApprove, invoiceDisputeStatus, undisputedCount, preStatementErrorText, summarizeApproval,
  groupItemsByDoctorOrder,
} from '../../invoices/lib/preStatement';
import type { ApprovalMode, PreStatement, PreStatementInvoice, PreStatementItem } from '../../invoices/types';
import { DISPLAY, PAGE_PADDING, fmtDate, ErrorBar, Loader, EmptyCard, PillButton } from '../components/atoms';
import { StatementNoteSheet, DisputeChip } from '../components/StatementNoteSheet';
import { useStatementView, StatementFilterBar, NoMatchLine } from '../components/StatementFilter';
import { PreStatementPdfButton } from '../../invoices/components/PreStatementPdfButton';
import { fetchSelfViewLetterhead } from '../../invoices/labLetterheadApi';
import { supabase } from '../../../core/api/supabase';

/** Defansif para: her fatura kendi para biriminde (sabit ₺ yok). */
const money = (n: unknown, cur: string | null | undefined) =>
  formatMoney(Number(n) || 0, (cur || 'TRY') as Currency);

const errText = (e: unknown): string => {
  const msg = String((e as any)?.message ?? e);
  const known = preStatementErrorText(msg);
  return known ? autoT(known) : msg;
};

type ResultMsg = { issued: number; changed: number; disputed: number };

export function PreStatementScreen({ clinicId }: { clinicId: string }) {
  const U = useInkUI();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [data, setData] = useState<PreStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noteItemId, setNoteItemId] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<ApprovalMode | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultMsg | null>(null);
  /** Sessiz tazeleme hatası: ekranı silmez, eldeki veri + küçük "yeniden dene" kalır. */
  const [reloadError, setReloadError] = useState<string | null>(null);
  // Çift dokunuşta ikinci onay isteği gitmesin (state bir sonraki çizime kadar eski kalır).
  const approveInFlight = useRef(false);
  const [clinicName, setClinicName] = useState('');
  useEffect(() => {
    let live = true;
    supabase.from('clinics').select('name').eq('id', clinicId).maybeSingle()
      .then(({ data: c }) => { if (live) setClinicName((c as any)?.name ?? ''); });
    return () => { live = false; };
  }, [clinicId]);

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setLoadError(null); }
    try {
      setData(await fetchPreStatement(clinicId));
      setReloadError(null);
      if (!silent) setLoadError(null);
    } catch (e) {
      if (silent) setReloadError(errText(e));
      else setLoadError(errText(e));
    } finally { if (!silent) setLoading(false); }
  }, [clinicId]);
  useEffect(() => { void load(); }, [load]);

  const invoices = useMemo(() => (data?.enabled ? data.invoices ?? [] : []), [data]);
  const approver = !!data && canApprove(data.actor, data.enabled);
  const undisputed = undisputedCount(invoices);
  // Süzme yalnız GÖRÜNÜM; onay (undisputed, runApprove, ConfirmDialog) hep tam `invoices` ile çalışır.
  const view = useStatementView(invoices);
  const itemTotal = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of invoices) m[i.id] = (i.items ?? []).length;
    return m;
  }, [invoices]);

  // Not popup'ı tazelenen veriden beslenir; kalem artık yoksa (fatura kesildi) popup son
  // görülen kalemle açık kalır ki hata metni okunabilsin.
  const noteTarget = useMemo(() => {
    if (!noteItemId) return null;
    for (const inv of invoices) {
      const it = (inv.items ?? []).find(x => x.id === noteItemId);
      if (it) return { item: it, currency: inv.currency };
    }
    return null;
  }, [noteItemId, invoices]);
  const noteCurrency = useRef<string | null>(null);
  if (noteTarget) noteCurrency.current = noteTarget.currency;

  const runApprove = async () => {
    if (!confirmMode || approveInFlight.current) return;
    approveInFlight.current = true;
    setApproving(true); setApproveError(null);
    try {
      const r = await approvePreStatement(clinicId, invoices, confirmMode);
      setResult(summarizeApproval(r));
      setConfirmMode(null);
      await load(true);
    } catch (e) {
      setApproveError(errText(e));
      // Bu arada taslak silinmiş/kesilmiş olabilir → liste tazelensin.
      if (/PS_SCOPE/.test(String((e as any)?.message ?? e))) void load(true);
    } finally {
      approveInFlight.current = false;
      setApproving(false);
    }
  };

  if (loading) return <Loader />;
  if (loadError || !data) {
    return (
      <View style={{ padding: PAGE_PADDING, alignItems: 'flex-start' }}>
        <View style={{ alignSelf: 'stretch' }}><ErrorBar message={loadError ?? autoT('Ön ekstre yüklenemedi')} /></View>
        <PillButton variant="light" size="sm" onPress={() => { void load(); }}
          leftIcon={<RefreshCw size={12} color={U.ink[900]} strokeWidth={2} />}>
          {autoT('Yeniden dene')}
        </PillButton>
      </View>
    );
  }

  const ownScope = data.scope === 'own';
  const kpiStyle = isDesktop ? undefined : { minWidth: 150, padding: 14 };
  // Dar ekranda (iki sütun) uzun başlık ikona yapışıyordu → mobilde ikon gösterilmez.
  const kpiIcon = (name: string) => (isDesktop ? name : undefined);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: PAGE_PADDING, paddingBottom: 48, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Başlık */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: U.ink[400] }}>
          {autoT('Mali İşlemler')}
        </Text>
        <Text style={{ ...DISPLAY, fontSize: 26, letterSpacing: -0.5, color: U.ink[900] }}>{autoT('Ön ekstre')}</Text>
        <Text style={{ fontSize: 13, color: U.ink[500], lineHeight: 18 }}>
          {autoT('Lab\'ın kesmeden önce onayınıza sunduğu taslak faturalar')}
        </Text>
      </View>

      {!data.enabled ? (
        <EmptyCard icon={CheckCircle2} title={autoT('Onay bekleyen fatura yok')} />
      ) : (
        <>
          {ownScope ? (
            <InfoLine text={autoT('Yalnız kendi siparişlerinizin kalemleri gösteriliyor')} />
          ) : null}

          {/* Para birimi başına üç rakam (mobilde iki sütun, sıkı dolgu) */}
          {(data.summary ?? []).map(s => (
            <View key={s.currency} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {!ownScope && s.finalized_balance != null ? (
                <KPICardX title={autoT('Kesinleşmiş bakiye')} value={money(s.finalized_balance, s.currency)} icon={kpiIcon('file-text')} style={kpiStyle} />
              ) : null}
              {!ownScope && s.overdue != null ? (
                <KPICardX title={autoT('Vadesi geçen')} value={money(s.overdue, s.currency)} icon={kpiIcon('alert-triangle')} style={kpiStyle}
                  accent={(Number(s.overdue) || 0) > 0 ? U.chipTones.danger.fg : undefined} />
              ) : null}
              <KPICardX title={autoT('Onay bekleyen')} value={money(s.pending, s.currency)} icon={kpiIcon('clock')} style={kpiStyle} />
            </View>
          ))}

          {/* Onay satırı */}
          {invoices.length > 0 ? (
            approver ? (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                  <ActionPill
                    label={`${autoT('İtirazsız kalemleri onayla')} (${undisputed})`}
                    tip={autoT('İtirazlı kalem içeren faturalar taslakta kalır')}
                    disabled={undisputed === 0 || approving}
                    primary
                    onPress={() => { setApproveError(null); setResult(null); setConfirmMode('undisputed'); }}
                  />
                  <ActionPill
                    label={autoT('Tümünü onayla')}
                    tip={autoT('İtirazlılar dahil tüm taslak faturaları kesinleştirir')}
                    disabled={approving}
                    onPress={() => { setApproveError(null); setResult(null); setConfirmMode('all'); }}
                  />
                  {approveError && !confirmMode ? (
                    <Text style={{ flex: 1, minWidth: 180, fontSize: 12, color: U.chipTones.danger.fg }}>{approveError}</Text>
                  ) : null}
                </View>
              </View>
            ) : data.actor === 'viewer' ? (
              <InfoLine text={autoT('Onayı klinik yöneticisi verir')} />
            ) : null
          ) : null}

          {invoices.length > 0 ? (
            <PreStatementPdfButton
              clinicName={clinicName || autoT('Klinik')}
              data={data}
              lab={fetchSelfViewLetterhead}
              defaultFormat="ozet"
            />
          ) : null}

          {result ? <ResultBanner r={result} /> : null}

          {reloadError ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Text style={{ flex: 1, minWidth: 180, fontSize: 12, color: U.chipTones.danger.fg }}>
                {`${autoT('Liste yenilenemedi')}: ${reloadError}`}
              </Text>
              <PillButton variant="light" size="sm" onPress={() => { void load(true); }}
                leftIcon={<RefreshCw size={12} color={U.ink[900]} strokeWidth={2} />}>
                {autoT('Yeniden dene')}
              </PillButton>
            </View>
          ) : null}

          {/* Taslak listesi */}
          {invoices.length === 0 ? (
            <EmptyCard icon={CheckCircle2} title={autoT('Onay bekleyen fatura yok')} />
          ) : (
            <>
              <StatementFilterBar view={view} />
              {view.shown.length === 0 ? <NoMatchLine view={view} /> : (
                <View style={{ gap: 12 }}>
                  {view.shown.map(inv => (
                    <InvoiceBlock
                      key={inv.id}
                      inv={inv}
                      desktop={isDesktop}
                      expanded={view.isOpen(inv.id)}
                      filtered={view.active}
                      itemTotal={itemTotal[inv.id]}
                      onToggle={() => view.toggle(inv.id)}
                      onItem={it => setNoteItemId(it.id)}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </>
      )}

      <StatementNoteSheet
        open={!!noteItemId}
        item={noteTarget?.item ?? null}
        currency={noteTarget?.currency ?? noteCurrency.current}
        onClose={() => setNoteItemId(null)}
        onSent={() => load(true)}
      />

      <ConfirmDialog
        mode={confirmMode}
        total={invoices.length}
        undisputed={undisputed}
        busy={approving}
        error={approveError}
        // Hata vazgeçince silinmez: diyalog kapanınca onay butonlarının yanında görünür kalır.
        onCancel={() => { if (!approving) setConfirmMode(null); }}
        onConfirm={runApprove}
      />
    </ScrollView>
  );
}

/* ───────────────────────────── parçalar ───────────────────────────── */

export function InfoLine({ text }: { text: string }) {
  const U = useInkUI();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: U.chipTones.info.bg,
    }}>
      <Info size={14} color={U.chipTones.info.fg} strokeWidth={1.8} />
      <Text style={{ flex: 1, fontSize: 12.5, color: U.chipTones.info.fg }}>{text}</Text>
    </View>
  );
}

export function ResultBanner({ r }: { r: ResultMsg }) {
  const U = useInkUI();
  const warn = r.changed > 0 || r.disputed > 0;
  const tone = warn ? U.chipTones.warning : U.chipTones.success;
  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: tone.bg, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {warn
          ? <AlertTriangle size={14} color={tone.fg} strokeWidth={1.8} />
          : <CheckCircle2 size={14} color={tone.fg} strokeWidth={1.8} />}
        <Text style={{ fontSize: 13, fontWeight: '700', color: tone.fg }}>
          {`${r.issued} ${autoT('fatura kesinleşti')}`}
        </Text>
      </View>
      {r.changed > 0 ? (
        <Text style={{ fontSize: 12.5, color: tone.fg }}>
          {autoT('Bazı faturalar siz bakarken değişti; yeniden gözden geçirin')}
        </Text>
      ) : null}
      {r.disputed > 0 ? (
        <Text style={{ fontSize: 12.5, color: tone.fg }}>
          {`${r.disputed} ${autoT('itirazlı fatura onay bekliyor')}`}
        </Text>
      ) : null}
    </View>
  );
}

export function ActionPill({ label, tip, onPress, disabled, primary }: {
  label: string; tip: string; onPress: () => void; disabled?: boolean; primary?: boolean;
}) {
  const U = useInkUI();
  const bg = primary ? U.ink[900] : U.plainBtn.bg;
  const fg = primary ? U.onDarkPill : U.plainBtn.fg;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityHint={tip}
      style={({ pressed }) => ({
        paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
        backgroundColor: bg, borderWidth: 1, borderColor: primary ? bg : U.plainBtn.border,
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
        ...(Platform.OS === 'web' ? { cursor: disabled ? 'default' : 'pointer' } as any : {}),
      })}
    >
      <Text style={{ fontSize: 12.5, fontWeight: '700', color: fg }}>{label}</Text>
    </Pressable>
  );
}

/** Bir faturada bu kadar kalemden azsa hekim grupları açık gelir; fazlasında kapalı (300+ kalemde takılmasın). */
const GROUPS_OPEN_BELOW = 100;
/** Bir sipariş grubunda ilk çizilen kalem sayısı; gerisi "Daha fazla göster" ile. */
const PAGE_SIZE = 60;

export function InvoiceBlock({ inv, desktop, expanded, onToggle, onItem, filtered, itemTotal }: {
  inv: PreStatementInvoice; desktop: boolean; expanded: boolean;
  onToggle: () => void; onItem: (it: PreStatementItem) => void;
  /** Süzülmüş görünüm: kalemler süzülü, fatura toplamları tam faturanın */
  filtered?: boolean;
  /** Süzülmeden önceki kalem sayısı */
  itemTotal?: number;
}) {
  const U = useInkUI();
  const items = inv.items ?? [];
  const disputeStatus = invoiceDisputeStatus(inv);
  const date = fmtDate(inv.issue_date ?? inv.created_at);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const countText = filtered && itemTotal != null && itemTotal !== items.length
    ? `${items.length} / ${itemTotal} ${autoT('kalem')}` : `${items.length} ${autoT('kalem')}`;

  return (
    <View style={U.tableCard}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16,
          backgroundColor: pressed ? U.rowHover : 'transparent',
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        })}
      >
        <Chevron size={16} color={U.ink[500]} strokeWidth={1.8} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>
              {inv.invoice_number || autoT('Taslak fatura')}
            </Text>
            {disputeStatus ? <DisputeChip status={disputeStatus} /> : null}
          </View>
          <Text style={{ fontSize: 11.5, color: U.ink[400] }} numberOfLines={1}>
            {`${date} · ${countText}`}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: U.ink[900] }}>{money(inv.total, inv.currency)}</Text>
          {desktop ? (
            <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 1 }}>
              {`${autoT('Ara toplam')} ${money(inv.subtotal, inv.currency)} · ${autoT('KDV')} ${money(inv.tax, inv.currency)}`}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {expanded ? (
        <View style={{ borderTopWidth: 1, borderTopColor: U.hairline }}>
          <GroupedItems inv={inv} date={date} desktop={desktop} onItem={onItem} openByDefault={!!filtered || items.length < GROUPS_OPEN_BELOW} />
          {!desktop ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: U.hairlineSoft }}>
              <Text style={{ fontSize: 11.5, color: U.ink[500] }}>{`${autoT('Ara toplam')} ${money(inv.subtotal, inv.currency)}`}</Text>
              <Text style={{ fontSize: 11.5, color: U.ink[500] }}>{`${autoT('KDV')} ${money(inv.tax, inv.currency)}`}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Hekim → sipariş grupları; katlanabilir, ara toplamlı. Kapalı grubun satırları hiç çizilmez. */
function GroupedItems({ inv, date, desktop, onItem, openByDefault }: {
  inv: PreStatementInvoice; date: string; desktop: boolean; onItem: (it: PreStatementItem) => void; openByDefault: boolean;
}) {
  const U = useInkUI();
  const groups = useMemo(() => groupItemsByDoctorOrder(inv), [inv]);
  // flip[key] = varsayılanı çevrilen grup
  const [flip, setFlip] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState<Record<string, number>>({});
  const isOpen = (key: string, def: boolean) => (flip[key] ? !def : def);
  const toggle = (key: string) => setFlip(f => ({ ...f, [key]: !f[key] }));
  const cur = inv.currency;

  return (
    <View>
      {desktop ? <ItemTableHeader /> : null}
      {groups.map(g => {
        const dk = `d:${g.doctor}`;
        const dOpen = isOpen(dk, openByDefault);
        const DChev = dOpen ? ChevronDown : ChevronRight;
        const itemCount = g.orders.reduce((s, o) => s + o.items.length, 0);
        return (
          <View key={dk}>
            <GroupHeader
              onPress={() => toggle(dk)}
              chevron={<DChev size={14} color={U.ink[500]} strokeWidth={1.8} />}
              icon={<User size={13} color={U.ink[500]} strokeWidth={1.8} />}
              title={g.doctor}
              meta={`${itemCount} ${autoT('kalem')}`}
              amount={money(g.subtotal, cur)}
              level={0}
            />
            {dOpen ? g.orders.map(o => {
              const ok = `o:${g.doctor}:${o.order_no}`;
              const oOpen = isOpen(ok, true);
              const OChev = oOpen ? ChevronDown : ChevronRight;
              const limit = more[ok] ?? PAGE_SIZE;
              const visible = o.items.length > limit ? o.items.slice(0, limit) : o.items;
              return (
                <View key={ok}>
                  <GroupHeader
                    onPress={() => toggle(ok)}
                    chevron={<OChev size={13} color={U.ink[400]} strokeWidth={1.8} />}
                    title={`${autoT('Sipariş no')} ${o.order_no}`}
                    meta={`${o.items.length} ${autoT('kalem')}`}
                    amount={money(o.subtotal, cur)}
                    level={1}
                    mono
                  />
                  {oOpen ? (
                    <>
                      {desktop
                        ? <ItemRows items={visible} cur={cur} date={date} onItem={onItem} />
                        : <ItemCardRows items={visible} cur={cur} date={date} onItem={onItem} />}
                      {o.items.length > visible.length ? (
                        <Pressable
                          onPress={() => setMore(m => ({ ...m, [ok]: limit + PAGE_SIZE }))}
                          style={{ paddingVertical: 10, alignItems: 'center', borderTopWidth: 1, borderTopColor: U.hairlineSoft,
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                        >
                          <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.ink[700] }}>
                            {`${autoT('Daha fazla göster')} (${o.items.length - visible.length})`}
                          </Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : null}
                </View>
              );
            }) : null}
          </View>
        );
      })}
    </View>
  );
}

function GroupHeader({ onPress, chevron, icon, title, meta, amount, level, mono }: {
  onPress: () => void; chevron: React.ReactNode; icon?: React.ReactNode; title: string; meta: string;
  amount: string; level: 0 | 1; mono?: boolean;
}) {
  const U = useInkUI();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingVertical: level === 0 ? 10 : 8, paddingLeft: 16 + level * 16, paddingRight: 16,
        backgroundColor: pressed ? U.rowHover : level === 0 ? U.surfaceSoft : 'transparent',
        borderTopWidth: 1, borderTopColor: U.hairlineSoft,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}
    >
      {chevron}
      {icon}
      <Text
        style={{
          flexShrink: 1, fontSize: level === 0 ? 13 : 12, fontWeight: level === 0 ? '700' : '600', color: U.ink[900],
          ...(mono && Platform.OS === 'web' ? { fontFamily: 'JetBrains Mono, monospace' } as any : {}),
        }}
        numberOfLines={1}
      >{title}</Text>
      <Text style={{ flex: 1, fontSize: 11, color: U.ink[400] }} numberOfLines={1}>{meta}</Text>
      <Text style={{ fontSize: level === 0 ? 13 : 12, fontWeight: '700', color: U.ink[900] }}>{amount}</Text>
    </Pressable>
  );
}

function NoteCount({ n }: { n: number }) {
  const U = useInkUI();
  if (n <= 0) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <MessageSquare size={12} color={U.ink[500]} strokeWidth={1.8} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: U.ink[500] }}>{n}</Text>
    </View>
  );
}

/** Brüt > net ise (indirim) brüt üstü çizili gösterilir. */
function Amount({ it, cur }: { it: PreStatementItem; cur: string }) {
  const U = useInkUI();
  const discounted = (Number(it.gross_total) || 0) > (Number(it.total) || 0);
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{money(it.total, cur)}</Text>
      {discounted ? (
        <Text style={{ fontSize: 10.5, color: U.ink[400], textDecorationLine: 'line-through' }}>{money(it.gross_total, cur)}</Text>
      ) : null}
    </View>
  );
}

const COLS = { date: 1.1, patient: 0.9, job: 2.6, qty: 0.6, unit: 1.2, amount: 1.3, flags: 1.3 };

function ItemTableHeader() {
  const U = useInkUI();
  const H = (label: string, flex: number, end?: boolean) => (
    <Text style={[U.colHeader, { flex, textAlign: end ? 'right' : 'left' }]} numberOfLines={1}>{label}</Text>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: U.surfaceSoft }}>
      {H(autoT('Tarih'), COLS.date)}
      {H(autoT('Hasta'), COLS.patient)}
      {H(autoT('İş'), COLS.job)}
      {H(autoT('Adet'), COLS.qty, true)}
      {H(autoT('Birim fiyat'), COLS.unit, true)}
      {H(autoT('Tutar'), COLS.amount, true)}
      {H(autoT('Not'), COLS.flags, true)}
    </View>
  );
}

function ItemRows({ items, cur, date, onItem }: { items: PreStatementItem[]; cur: string; date: string; onItem: (it: PreStatementItem) => void }) {
  const U = useInkUI();
  const cell = { fontSize: 13, color: U.ink[700] } as const;
  return (
    <View>
      {items.map(it => (
        <Pressable
          key={it.id}
          onPress={() => onItem(it)}
          accessibilityHint={autoT('Kalem notlarını açar')}
          style={({ pressed, hovered }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11,
            borderTopWidth: 1, borderTopColor: U.hairlineSoft,
            backgroundColor: pressed || hovered ? U.rowHover : 'transparent',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
        >
          <Text style={[cell, { flex: COLS.date, color: U.ink[500] }]} numberOfLines={1}>{date}</Text>
          <Text style={[cell, { flex: COLS.patient }]} numberOfLines={1}>{it.patient_initials || '—'}</Text>
          <Text style={[cell, { flex: COLS.job, color: U.ink[900] }]} numberOfLines={2}>{it.description || '—'}</Text>
          <Text style={[cell, { flex: COLS.qty, textAlign: 'right' }]}>{Number(it.quantity) || 0}</Text>
          <Text style={[cell, { flex: COLS.unit, textAlign: 'right' }]} numberOfLines={1}>{money(it.unit_price, cur)}</Text>
          <View style={{ flex: COLS.amount }}><Amount it={it} cur={cur} /></View>
          <View style={{ flex: COLS.flags, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
            {it.dispute_status ? <DisputeChip status={it.dispute_status} /> : null}
            <NoteCount n={(it.notes ?? []).length} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function ItemCardRows({ items, cur, date, onItem }: { items: PreStatementItem[]; cur: string; date: string; onItem: (it: PreStatementItem) => void }) {
  const U = useInkUI();
  return (
    <View>
      {items.map(it => (
        <Pressable
          key={it.id}
          onPress={() => onItem(it)}
          accessibilityHint={autoT('Kalem notlarını açar')}
          style={({ pressed }) => ({
            flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
            borderTopWidth: 1, borderTopColor: U.hairlineSoft,
            backgroundColor: pressed ? U.rowHover : 'transparent',
          })}
        >
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }} numberOfLines={2}>{it.description || '—'}</Text>
            <Text style={{ fontSize: 11.5, color: U.ink[400] }} numberOfLines={1}>
              {[date, it.patient_initials].filter(Boolean).join(' · ')}
            </Text>
            <Text style={{ fontSize: 11.5, color: U.ink[500] }}>
              {`${Number(it.quantity) || 0} × ${money(it.unit_price, cur)}`}
            </Text>
            {it.dispute_status || (it.notes ?? []).length > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                {it.dispute_status ? <DisputeChip status={it.dispute_status} /> : null}
                <NoteCount n={(it.notes ?? []).length} />
              </View>
            ) : null}
          </View>
          <Amount it={it} cur={cur} />
        </Pressable>
      ))}
    </View>
  );
}

export function ConfirmDialog({ mode, total, undisputed, busy, error, onCancel, onConfirm }: {
  mode: ApprovalMode | null; total: number; undisputed: number; busy: boolean; error: string | null;
  onCancel: () => void; onConfirm: () => void;
}) {
  const U = useInkUI();
  const n = mode === 'undisputed' ? undisputed : total;
  return (
    <Modal visible={!!mode} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={U.modalOverlay}>
        <View style={[U.modalCard, { maxWidth: 440 }]}>
          <View style={{ padding: 22, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipTones.success.bg }}>
                <FileCheck size={18} color={U.chipTones.success.fg} strokeWidth={1.8} />
              </View>
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: U.ink[900] }}>{autoT('Faturaları onayla')}</Text>
            </View>
            <Text style={{ fontSize: 13, color: U.ink[700], lineHeight: 19 }}>
              {`${n} ${autoT('taslak fatura kesinleşecek; bu işlem geri alınamaz.')}`}
            </Text>
            <Text style={{ fontSize: 12.5, color: U.ink[500], lineHeight: 18 }}>
              {mode === 'undisputed'
                ? autoT('İtirazlı kalem içeren faturalar taslakta kalır')
                : autoT('İtirazlı kalemler de onaylanır')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 4 }}>
              {error ? <Text style={{ flex: 1, minWidth: 160, fontSize: 12, color: U.chipTones.danger.fg }}>{error}</Text> : null}
              <Pressable
                onPress={onCancel}
                disabled={busy}
                style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, opacity: busy ? 0.5 : 1 }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Vazgeç')}</Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                disabled={busy}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: U.ink[900], opacity: busy ? 0.6 : 1 }}
              >
                {busy ? <ActivityIndicator size="small" color={U.onDarkPill} /> : null}
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.onDarkPill }}>{autoT('Onayla')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
