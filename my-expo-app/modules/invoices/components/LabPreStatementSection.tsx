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
import { View, Text, Pressable, Platform, useWindowDimensions } from 'react-native';
import { AlertTriangle, FileCheck, RefreshCw, Info } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { useInvoiceApprovalEnabled } from '../../../core/store/labSettingsStore';
import { fetchPreStatement, fetchStatementApprovals } from '../preStatementApi';
import { canLabWrite, preStatementErrorText } from '../lib/preStatement';
import type { PreStatement, PreStatementInvoice, StatementApprovalRow } from '../types';
import { StatementNoteSheet } from '../../finance-clinic/components/StatementNoteSheet';
import { InvoiceBlock } from '../../finance-clinic/screens/PreStatementScreen';
import { StatementApprovalBadge } from './StatementApprovalBadge';
import { LabApprovalModal } from './LabApprovalModal';
import { PreStatementPdfButton, doctorNamesOf } from './PreStatementPdfButton';
import { fetchLabLetterhead } from '../labLetterheadApi';
import { StatementLinkPanel } from './StatementLinkPanel';

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
  const row = (st.data.summary ?? []).find(s => s.currency === currency);

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
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Tile label={autoT('Kesinleşmiş bakiye')} value={money(row?.finalized_balance, currency)} color={U.ink[900]} />
        <Tile
          label={autoT('Vadesi geçen')}
          value={money(row?.overdue, currency)}
          color={(Number(row?.overdue) || 0) > 0 ? U.chipTones.danger.fg : U.ink[900]}
        />
        <Tile label={autoT('Onay bekleyen')} value={money(row?.pending, currency)} color={U.chipTones.warning.fg} />
      </View>
    </View>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
  const U = useInkUI();
  return (
    <View style={{ flex: 1, minWidth: 140, backgroundColor: U.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: U.hairline }}>
      <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: U.ink[400], marginBottom: 4 }}>
        {label}
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color }}>{value}</Text>
    </View>
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

// ─── Alt: çerçeveli bölüm ──────────────────────────────────────────────
export function LabPreStatementSection({ st, clinicId, clinicName, currency, onApproved }: {
  st: LabPreStatementState;
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
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [noteItemId, setNoteItemId] = useState<string | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);

  const all = useMemo(() => st.data?.invoices ?? [], [st.data]);
  // Liste seçili dövizde; onay da yalnız bu dövizin taslaklarını kapsar (ekstre tek dövizde okunur).
  const invoices = useMemo(() => all.filter(i => (i.currency || 'TRY') === currency), [all, currency]);
  const otherCcy = all.length - invoices.length;
  const doctors = useMemo(() => doctorNamesOf(st.data), [st.data]);

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
    <View style={{ ...U.tableCard, borderWidth: 1.5, borderColor: U.chipTones.warning.fg, borderStyle: 'dashed' as any }}>
      {/* Başlık */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: U.hairline,
      }}>
        <FileCheck size={17} color={U.chipTones.warning.fg} strokeWidth={1.8} />
        <View style={{ flex: 1, minWidth: 180 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '700', color: U.ink[900] }}>{autoT('Ön ekstre — onay bekliyor')}</Text>
          <Text style={{ fontSize: 11.5, color: U.ink[500], marginTop: 1 }}>
            {autoT('Taslaklar bakiyeye ve hatırlatmaya girmez; klinik onayıyla kesinleşir')}
          </Text>
        </View>
        {all.length > 0 ? (
          <PreStatementPdfButton
            clinicName={clinicName || autoT('Klinik')}
            data={st.data}
            lab={fetchLabLetterhead}
            doctors={doctors}
            currency={currency}
          />
        ) : null}
        {canWrite && invoices.length > 0 ? (
          <GlassTooltip title={autoT('Klinik adına onay kaydet')} text={autoT('Klinikten aldığınız onayı gerekçesiyle kaydeder; taslaklar kesinleşir')}>
            <Pressable
              onPress={() => setApproveOpen(true)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 9,
                borderRadius: 999, backgroundColor: U.ink[900], opacity: pressed ? 0.85 : 1,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <FileCheck size={13} color={U.onDarkPill} strokeWidth={2} />
              <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.onDarkPill }}>{autoT('Klinik adına onay kaydet')}</Text>
            </Pressable>
          </GlassTooltip>
        ) : null}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
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

        {/* Girişsiz onay bağlantısı + karekodlu PDF (plan 4) — yalnız yazma yetkili lab kullanıcısı */}
        {canWrite && all.length > 0 ? (
          <StatementLinkPanel
            clinicId={clinicId}
            clinicName={clinicName || autoT('Klinik')}
            data={st.data}
            lab={fetchLabLetterhead}
            currency={currency}
          />
        ) : null}

        {invoices.length === 0 ? (
          <Text style={{ fontSize: 12.5, color: U.ink[400] }}>{autoT('Onay bekleyen fatura yok')}</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {invoices.map(inv => (
              <InvoiceBlock
                key={inv.id}
                inv={inv}
                desktop={isDesktop}
                expanded={!!open[inv.id]}
                onToggle={() => setOpen(o => ({ ...o, [inv.id]: !o[inv.id] }))}
                onItem={it => setNoteItemId(it.id)}
              />
            ))}
          </View>
        )}

        {otherCcy > 0 ? (
          <Text style={{ fontSize: 11.5, color: U.ink[400] }}>
            {`${otherCcy} ${autoT('taslak başka para biriminde; üstteki para birimi sekmesinden görün')}`}
          </Text>
        ) : null}
      </View>

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
