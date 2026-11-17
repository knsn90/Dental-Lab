/**
 * Lab ekstresi — Ön ekstre (ayar "Hekim/klinik onayıyla kesinleştir" AÇIKKEN).
 *
 * ClinicStatementScreen'e yalnız EKLENİR; ayar kapalıyken (enabled=false) hiçbir şey çizmez,
 * ekran bugünküyle birebir aynı kalır.
 *
 *  - useLabPreStatement: get_pre_statement (actor='lab') + son 5 onay kaydı.
 *  - LabPreStatementTop: ekstrenin ÜSTÜNDE açık itiraz uyarı şeridi (§2.3) + seçili dövizde
 *    üç rakam (kesinleşmiş bakiye · vadesi geçen · onay bekleyen).
 *  - LabPreStatementSection: en altta çerçeveli "Ön ekstre — onay bekliyor" bölümü: taslak
 *    kalemleri, itiraz rozetleri, not dizisi (lab yanıtı + Çözüldü), onay geçmişi ve
 *    "Klinik adına onay kaydet". Yazma yalnız canLabWrite(actor, can_manage).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, useWindowDimensions, Modal, Dimensions } from 'react-native';
import { AlertTriangle, FileCheck, RefreshCw, Info, Send, ChevronDown, Link2, X } from '../../../core/ui/icons';
import { InvoiceDetailScreen } from '../screens/InvoiceDetailScreen';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { useInvoiceApprovalEnabled } from '../../../core/store/labSettingsStore';
import { fetchPreStatement, fetchStatementApprovals, fetchStatementLinkStatus } from '../preStatementApi';
import { canLabWrite, preStatementErrorText, statementLinkStatusLine } from '../lib/preStatement';
import type { PreStatement, PreStatementInvoice, StatementApprovalRow, StatementLinkStatus } from '../types';
import { fmtDate } from '../../finance-clinic/components/atoms';
import { StatementNoteSheet } from '../../finance-clinic/components/StatementNoteSheet';
import { InvoiceBlock } from '../../finance-clinic/screens/PreStatementScreen';
import { useStatementView, StatementFilterBar, NoMatchLine } from '../../finance-clinic/components/StatementFilter';
import { StatementApprovalBadge } from './StatementApprovalBadge';
import { LabApprovalModal } from './LabApprovalModal';
import { fetchLabLetterhead } from '../labLetterheadApi';
import { StatementLinkPanel } from './StatementLinkPanel';
import { StatementRequestModal } from './StatementRequestModal';

const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300' as const };

/** Defansif para: her tutar kendi para biriminde. */
const money = (n: unknown, cur: string | null | undefined) =>
  formatMoney(Number(n) || 0, (cur || 'TRY') as Currency, { fractionDigits: 2 });

const errText = (e: unknown): string => {
  const msg = String((e as any)?.message ?? e);
  const known = preStatementErrorText(msg);
  return known ? autoT(known) : msg;
};

export type LabPreStatementState = {
  data: PreStatement | null;
  approvals: StatementApprovalRow[];
  error: string | null;
  reload: () => Promise<void>;
};

/** Yalnız lab tarafında çağrılır (selfView=false). `tick` ekstrenin yeniden yükleme sayacı. */
export function useLabPreStatement(clinicId: string | undefined, tick: number, active: boolean): LabPreStatementState {
  const [data, setData] = useState<PreStatement | null>(null);
  const [approvals, setApprovals] = useState<StatementApprovalRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  const reload = useCallback(async () => {
    if (!clinicId || !active) return;
    const my = ++reqRef.current;
    try {
      const ps = await fetchPreStatement(clinicId);
      // Onay geçmişi yalnız bölüm görünürken gerekir; okunamazsa bölüm yine çizilir.
      const ap = ps.enabled ? await fetchStatementApprovals(clinicId, 5).catch(() => [] as StatementApprovalRow[]) : [];
      if (my !== reqRef.current) return;
      setData(ps); setApprovals(ap); setError(null);
    } catch (e) {
      if (my !== reqRef.current) return;
      setError(errText(e));
    }
  }, [clinicId, active]);

  // Başka kliniğe geçince eski kliniğin verisi bir an bile görünmesin.
  useEffect(() => { setData(null); setApprovals([]); setError(null); }, [clinicId]);
  useEffect(() => { void reload(); }, [reload, tick]);

  return { data, approvals, error, reload };
}

function openDisputeCount(invoices: PreStatementInvoice[]): number {
  let n = 0;
  for (const inv of invoices) for (const it of inv.items ?? []) if (it.dispute_status === 'acik') n++;
  return n;
}

/** Ayar açık mı? RPC sonucu esas; RPC hiç okunamadıysa lab ayarı (store) ipucu olur. */
function useShown(st: LabPreStatementState): 'on' | 'error' | 'off' {
  const hint = useInvoiceApprovalEnabled();
  if (st.data) return st.data.enabled ? 'on' : 'off';
  if (st.error && hint) return 'error';
  return 'off';
}

// ─── Üst: itiraz şeridi + üç rakam ─────────────────────────────────────
export function LabPreStatementTop({ st, currency }: { st: LabPreStatementState; currency: string }) {
  const U = useInkUI();
  const shown = useShown(st);
  if (shown === 'off') return null;
  if (shown === 'error' || !st.data) {
    return <ReloadLine message={st.error ?? ''} onRetry={st.reload} />;
  }
  const invoices = st.data.invoices ?? [];
  const open = openDisputeCount(invoices);
  if (open === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      {open > 0 ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, backgroundColor: U.chipTones.danger.bg,
        }}>
          <AlertTriangle size={15} color={U.chipTones.danger.fg} strokeWidth={1.9} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: U.chipTones.danger.fg }}>
            {`${open} ${autoT('kalemde açık itiraz var')}`}
          </Text>
          <Text style={{ fontSize: 11.5, color: U.chipTones.danger.fg, opacity: 0.85 }}>
            {autoT('Ön ekstre bölümünde yanıtlayın')}
          </Text>
        </View>
      ) : null}
      {/* Kesinleşmiş/vadesi geçen/onay bekleyen rakamları ekstre hero'sunda (Toplam bakiye dökümü). */}
    </View>
  );
}

// ─── Aç/kapa tercihi (yalnız tarayıcı kolaylığı) ─────────────────────────
const COLLAPSE_KEY = 'siman.preStatement.collapsed';
function readCollapsed(): boolean {
  try { return typeof window !== 'undefined' && window.localStorage?.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}
function writeCollapsed(v: boolean) {
  try { if (typeof window !== 'undefined') window.localStorage?.setItem(COLLAPSE_KEY, v ? '1' : '0'); } catch { /* yok say */ }
}

// ─── "Onay iste ▾" menüsü — gönder · bağlantı · klinik adına onay tek yerde ──
type ApprovalMenuItem = {
  key: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
};

function ApprovalMenu({ items, warn }: { items: ApprovalMenuItem[]; warn?: boolean }) {
  const U = useInkUI();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const ref = useRef<any>(null);
  const MENU_W = 290;

  const openMenu = () => {
    const node = ref.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x: number, y: number, w: number, h: number) => { setAnchor({ x, y, w, h }); setOpen(true); });
    } else { setAnchor(null); setOpen(true); }
  };
  const win = Dimensions.get('window');
  const estH = items.length * 54 + 12;
  const right = anchor ? Math.max(8, win.width - (anchor.x + anchor.w)) : 12;
  const below = anchor ? anchor.y + anchor.h + 6 : 72;
  const top = anchor && below + estH > win.height - 12 ? Math.max(12, anchor.y - estH - 6) : below;

  return (
    <>
      <Pressable
        ref={ref}
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel={autoT('Onay iste')}
        style={({ pressed }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 9,
          borderRadius: 999, backgroundColor: U.ink[900], opacity: pressed ? 0.85 : 1,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        })}
      >
        <Send size={13} color={U.onDarkPill} strokeWidth={2} />
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.onDarkPill }}>{autoT('Onay iste')}</Text>
        {warn ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#D94B4B' }} /> : null}
        <ChevronDown size={13} color={U.onDarkPill} strokeWidth={2} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1 }}>
          <Pressable
            onPress={(e: any) => e?.stopPropagation?.()}
            style={{
              position: 'absolute', top, right, width: MENU_W, padding: 6, borderRadius: 14,
              backgroundColor: U.surface, borderWidth: 1, borderColor: U.hairline,
              shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 10,
            }}
          >
            {items.map(it => {
              const Icon = it.icon;
              return (
                <Pressable
                  key={it.key}
                  onPress={() => { setOpen(false); it.onPress(); }}
                  style={({ pressed, hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 10,
                    borderRadius: 10, backgroundColor: hovered || pressed ? U.rowHover : 'transparent',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}
                >
                  <Icon size={15} color={U.ink[700]} strokeWidth={1.9} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{it.label}</Text>
                    {it.hint ? <Text style={{ fontSize: 11, color: U.chipTones.danger.fg, marginTop: 1 }}>{it.hint}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ReloadLine({ message, onRetry }: { message: string; onRetry: () => Promise<void> | void }) {
  const U = useInkUI();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <Text style={{ flex: 1, minWidth: 180, fontSize: 12, color: U.chipTones.danger.fg }}>
        {`${autoT('Ön ekstre yüklenemedi')}: ${message}`}
      </Text>
      <Pressable
        onPress={() => { void onRetry(); }}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
          backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        }}
      >
        <RefreshCw size={12} color={U.plainBtn.fg} strokeWidth={2} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Yeniden dene')}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Salt okunur bağlantı/gönderim durumu (get_statement_link_status). Okunamazsa (RPC henüz yok, yetki,
 * ağ) satır hiç çizilmez; bölümün geri kalanı etkilenmez. `epoch` artınca yeniden okunur.
 */
function LinkStatusLine({ clinicId, epoch }: { clinicId: string; epoch: number }) {
  const U = useInkUI();
  const [st, setSt] = useState<StatementLinkStatus | null | undefined>(undefined);
  const reqRef = useRef(0);
  useEffect(() => {
    const my = ++reqRef.current;
    fetchStatementLinkStatus(clinicId)
      .then(r => { if (my === reqRef.current) setSt(r ?? null); })
      .catch(() => { if (my === reqRef.current) setSt(undefined); });
  }, [clinicId, epoch]);
  // Başka kliniğe geçince eski kliniğin durumu görünmesin
  useEffect(() => { setSt(undefined); }, [clinicId]);
  if (st === undefined) return null;
  const line = statementLinkStatusLine(st, fmtDate, autoT);
  // "Gönderim yok" bilgi taşımıyordu; yalnız gerçek bir gönderim/bağlantı varsa göster.
  if (!st?.last_send && !st?.active_link) return null;
  const fg = line.tone === 'neutral' ? U.ink[500] : U.chipTones[line.tone].fg;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Send size={13} color={fg} strokeWidth={1.8} />
      <Text style={{ flex: 1, fontSize: 12, color: fg }}>{line.text}</Text>
    </View>
  );
}

// ─── Alt: çerçeveli bölüm ──────────────────────────────────────────────
export function LabPreStatementSection({ st, clinicId, clinicName, currency, onApproved, embedded }: {
  st: LabPreStatementState;
  /** Üst kartın ("Kesinleşmemiş kalemler") içinde: kendi çerçevesi, ikonu ve başlığı çizilmez. */
  embedded?: boolean;
  clinicId: string;
  /** PDF başlığı ve dosya adı için */
  clinicName?: string;
  /** Seçili ekstre dövizi — liste bu dövizin taslaklarını gösterir. */
  currency: string;
  /** Onay kaydedildi → ekstre (kesinleşen faturalar) yeniden yüklensin. */
  onApproved: () => void;
}) {
  const U = useInkUI();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const shown = useShown(st);
  const [noteItemId, setNoteItemId] = useState<string | null>(null);
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);
  // Düzenleme popup'ı kapanınca ön ekstre taze tutarları göstersin
  const closeEdit = useCallback(() => { setEditInvoiceId(null); void st.reload(); }, [st]);
  const [approveOpen, setApproveOpen] = useState(false);
  // "Onay iste" yeni bağlantı oluşturur (eskisi iptal) → bağlantı paneli yeniden kurulur, eski bağlantı görünmez.
  const [linkEpoch, setLinkEpoch] = useState(0);
  // Panelden elle bağlantı oluşturulunca yalnız durum satırı tazelenir (panel yeniden kurulmaz).
  const [statusEpoch, setStatusEpoch] = useState(0);
  // Bölüm aç/kapa — tercih tarayıcıda hatırlanır (yalnız kolaylık; okunamazsa açık başlar).
  const [collapsed, setCollapsedState] = useState<boolean>(() => readCollapsed());
  const setCollapsed = (v: boolean) => { setCollapsedState(v); writeCollapsed(v); };
  const [requestOpen, setRequestOpen] = useState(false);
  // Bağlantı paneli menüden açılır; kapatılınca DOM'da kalır (oluşturulan bağlantı yalnız bellekte).
  const [linkOpen, setLinkOpen] = useState(false);

  const all = useMemo(() => st.data?.invoices ?? [], [st.data]);
  // Liste seçili dövizde; onay da yalnız bu dövizin taslaklarını kapsar (ekstre tek dövizde okunur).
  const invoices = useMemo(() => all.filter(i => (i.currency || 'TRY') === currency), [all, currency]);
  const otherCcy = all.length - invoices.length;
  // Süzme yalnız görünüm; "Klinik adına onay kaydet" tam `invoices` ile çalışır.
  const view = useStatementView(invoices);
  const itemTotal = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of invoices) m[i.id] = (i.items ?? []).length;
    return m;
  }, [invoices]);
  const pendingSum = useMemo(() => invoices.reduce((s, i) => s + (Number(i.total) || 0), 0), [invoices]);
  // Tutarı ₺0 olan taslak: fiyat girilmeden onaya gidebilir → görünür uyarı.
  const zeroInvoices = useMemo(() => invoices.filter(i => !(Number(i.total) > 0)), [invoices]);

  const noteTarget = useMemo(() => {
    if (!noteItemId) return null;
    for (const inv of all) {
      const it = (inv.items ?? []).find(x => x.id === noteItemId);
      if (it) return { item: it, currency: inv.currency };
    }
    return null;
  }, [noteItemId, all]);
  const noteCurrency = useRef<string | null>(null);
  if (noteTarget) noteCurrency.current = noteTarget.currency;

  if (shown !== 'on' || !st.data) return null;
  const canWrite = canLabWrite(st.data.actor, st.data.can_manage);

  return (
    <View style={embedded ? undefined : { ...U.tableCard, borderWidth: 1.5, borderColor: U.chipTones.warning.fg, borderStyle: 'dashed' as any }}>
      {/* Başlık */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: collapsed ? 0 : 1, borderBottomColor: U.hairline,
      }}>
        {embedded ? null : <FileCheck size={17} color={U.chipTones.warning.fg} strokeWidth={1.8} />}
        <Pressable
          onPress={() => setCollapsed(!collapsed)}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? autoT('Ön ekstreyi aç') : autoT('Ön ekstreyi kapat')}
          style={{ flex: 1, minWidth: 180, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
        >
          {embedded ? null : <Text style={{ fontSize: 14.5, fontWeight: '700', color: U.ink[900] }}>{autoT('Ön ekstre — onay bekliyor')}</Text>}
          <Text style={{ fontSize: 12, color: U.ink[500], marginTop: embedded ? 0 : 2 }}>
            {invoices.length > 0
              ? <>
                  <Text style={{ fontWeight: '700', color: U.chipTones.warning.fg }}>{money(pendingSum, currency)}</Text>
                  {` · ${invoices.length} ${autoT('hizmet bedeli')}`}
                  {zeroInvoices.length > 0 ? <Text style={{ color: U.chipTones.danger.fg, fontWeight: '600' }}>{` · ${zeroInvoices.length} ${autoT('fiyatsız')}`}</Text> : null}
                </>
              : autoT('Onay bekleyen hizmet bedeli yok')}
          </Text>
          <View style={{ marginTop: 4 }}>
            <LinkStatusLine clinicId={clinicId} epoch={linkEpoch + statusEpoch} />
          </View>
        </Pressable>
        {/* PDF: ekstre hero'sundaki "Yazdır / PDF" penceresinde ("Yalnız onay bekleyenler"). */}
        {canWrite && all.length > 0 ? (
          <ApprovalMenu
            warn={zeroInvoices.length > 0}
            items={[
              { key: 'send', icon: Send, label: autoT('Kliniğe gönder (e-posta / WhatsApp)'), onPress: () => setRequestOpen(true) },
              { key: 'link', icon: Link2, label: linkOpen ? autoT('Bağlantı panelini gizle') : autoT('Onay bağlantısı oluştur'), onPress: () => { setLinkOpen(!linkOpen); setCollapsed(false); } },
              ...(invoices.length > 0 ? [{
                key: 'approve', icon: FileCheck,
                label: autoT('Klinik adına onay kaydet'),
                hint: zeroInvoices.length > 0 ? `${zeroInvoices.length} ${autoT('taslağın tutarı sıfır')}` : undefined,
                onPress: () => setApproveOpen(true),
              }] : []),
            ]}
          />
        ) : null}
        <GlassTooltip title={collapsed ? autoT('Aç') : autoT('Kapat')} text={autoT('Ön ekstre ayrıntılarını göster ya da gizle')}>
          <Pressable
            onPress={() => setCollapsed(!collapsed)}
            accessibilityLabel={collapsed ? autoT('Ön ekstreyi aç') : autoT('Ön ekstreyi kapat')}
            style={({ pressed }: any) => ({
              width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
              backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, opacity: pressed ? 0.8 : 1,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <View style={{ transform: [{ rotate: collapsed ? '0deg' : '180deg' }] }}>
              <ChevronDown size={15} color={U.plainBtn.fg} strokeWidth={2} />
            </View>
          </Pressable>
        </GlassTooltip>
      </View>

      <View style={{ padding: 16, gap: 12, ...(collapsed ? { display: 'none' as const } : null) }}>
        {!canWrite ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Info size={13} color={U.ink[400]} strokeWidth={1.8} />
            <Text style={{ flex: 1, fontSize: 12, color: U.ink[500] }}>
              {autoT('Yanıt ve onay için mali işlem yönetme yetkisi gerekir')}
            </Text>
          </View>
        ) : null}

        {st.error ? <ReloadLine message={st.error} onRetry={st.reload} /> : null}

        {/* Onay geçmişi (son 5) — lab kaydı ayrı tonda */}
        {st.approvals.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: U.ink[400] }}>
              {autoT('Onay geçmişi')}
            </Text>
            <View style={{ gap: 6 }}>
              {st.approvals.map(a => <StatementApprovalBadge key={a.id} a={a} />)}
            </View>
          </View>
        ) : null}

        {/* ₺0 taslak — fiyat girilmeden onaya gitmesin */}
        {zeroInvoices.length > 0 ? (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: U.chipTones.danger.bg,
          }}>
            <AlertTriangle size={14} color={U.chipTones.danger.fg} strokeWidth={1.9} />
            <Text style={{ flex: 1, minWidth: 200, fontSize: 12.5, fontWeight: '600', color: U.chipTones.danger.fg }}>
              {`${zeroInvoices.length} ${autoT('taslağın tutarı sıfır — onaya göndermeden önce fiyatı girin')}`}
            </Text>
            <Text style={{ fontSize: 12, color: U.chipTones.danger.fg }}>
              {zeroInvoices.map(i => i.invoice_number || '—').join(', ')}
            </Text>
          </View>
        ) : null}

        {/* Girişsiz onay bağlantısı + karekodlu PDF (plan 4) — menüden açılır; gizliyken de bağlı kalır */}
        {canWrite && all.length > 0 ? (
          <View style={linkOpen ? undefined : { display: 'none' }}>
            <StatementLinkPanel
              key={`link-${linkEpoch}`}
              clinicId={clinicId}
              clinicName={clinicName || autoT('Klinik')}
              data={st.data}
              lab={fetchLabLetterhead}
              currency={currency}
              onCreated={() => setStatusEpoch(n => n + 1)}
            />
          </View>
        ) : null}

        {invoices.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: U.ink[400] }}>{autoT('Onay bekleyen hizmet bedeli yok')}</Text>
        ) : (
          <>
            <StatementFilterBar view={view} />
            {view.shown.length === 0 ? <NoMatchLine view={view} /> : (
              <View style={{ gap: 10 }}>
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
                    onEdit={canWrite ? () => setEditInvoiceId(inv.id) : undefined}
                  />
                ))}
              </View>
            )}
          </>
        )}

        {otherCcy > 0 ? (
          <Text style={{ fontSize: 11.5, color: U.ink[400] }}>
            {`${otherCcy} ${autoT('taslak başka para biriminde; üstteki para birimi sekmesinden görün')}`}
          </Text>
        ) : null}
      </View>

      {/* Faturayı ekstreden ayrılmadan düzenle — kapanınca ön ekstre yenilenir */}
      <Modal visible={!!editInvoiceId} transparent animationType="fade" onRequestClose={closeEdit}>
        <View style={U.modalOverlay}>
          <View style={[U.modalCard, { maxWidth: 1180, height: '92%', maxHeight: '92%', backgroundColor: U.surfaceSoft }]}>
            <View style={[U.modalHeaderRow, { backgroundColor: U.surface }]}>
              <Text style={U.modalTitle}>{autoT('Faturayı düzenle')}</Text>
              <GlassTooltip title={autoT('Kapat')} text={autoT('Ön ekstreye dön')}>
                <Pressable onPress={closeEdit} accessibilityLabel={autoT('Kapat')} style={U.modalCloseBtn}>
                  <X size={15} color={U.ink[700]} strokeWidth={1.9} />
                </Pressable>
              </GlassTooltip>
            </View>
            <View style={{ flex: 1, minHeight: 0 }}>
              {editInvoiceId ? <InvoiceDetailScreen invoiceId={editInvoiceId} onBack={closeEdit} /> : null}
            </View>
          </View>
        </View>
      </Modal>

      <StatementNoteSheet
        open={!!noteItemId}
        item={noteTarget?.item ?? null}
        currency={noteTarget?.currency ?? noteCurrency.current}
        side="lab"
        readOnly={!canWrite}
        onClose={() => setNoteItemId(null)}
        onSent={() => st.reload()}
      />

      {canWrite ? (
        <StatementRequestModal open={requestOpen} clinicId={clinicId} onClose={() => setRequestOpen(false)} onSent={() => setLinkEpoch(n => n + 1)} />
      ) : null}

      {canWrite ? (
        <LabApprovalModal
          open={approveOpen}
          clinicId={clinicId}
          invoices={invoices}
          onClose={() => setApproveOpen(false)}
          onDone={async () => { onApproved(); await st.reload(); }}
        />
      ) : null}
    </View>
  );
}
