/**
 * Ön ekstre — girişsiz onay sayfası (/s/<jeton>).
 *
 * Lab'ın "Onay bağlantısı oluştur"la ürettiği bağlantı ya da PDF'teki karekod buraya açılır.
 * Oturum yoktur; tüm çağrılar jetonlu SECURITY DEFINER RPC'lerdir (POST — jeton sorgu dizesine
 * düşmez). Gezinme çubuğu yoktur.
 *
 *  - Üstte lab adı, klinik adı, son geçerlilik tarihi; klinik ekranındaki üç rakam.
 *  - Kalem görünümü ve not penceresi klinik ekranıyla (PreStatementScreen) aynı bileşenler.
 *  - "İtirazsız kalemleri onayla" / "Tümünü onayla" — bağlantı bir kez onaylar.
 *  - Onaydan sonra "N fatura kesinleşti" ve sayfa salt okunur.
 *  - Lab bağlantıdan sonra bir taslağı değiştirdiyse uyarı: yeni bağlantı istenir.
 *  - Geçersiz / süresi geçmiş / iptal edilmiş jeton → tek sade ekran (hangisi olduğu söylenmez).
 *  - Alıcı artık kliniğin onaylayıcısı değilse (sunucu can_approve=false) sayfa okunur; onay düğmeleri yerine
 *    sakin bir not çıkar ve not penceresi salt okunurdur.
 *  - PDF karekodsuz (R5); antet bağlantı yanıtındaki lab adından (oturum yok).
 *
 * KVKK: hasta yalnız baş harf (sunucu), telefon/e-posta yok.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Clock, Building2, Info } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { formatMoney, type Currency } from '../../../core/money/currency';
import {
  fetchPreStatementByLink, approvePreStatementByLink, addStatementNoteByLink,
} from '../../invoices/preStatementApi';
import { undisputedCount, preStatementErrorText, summarizeApproval, linkApproveState } from '../../invoices/lib/preStatement';
import type { ApprovalMode, LinkPreStatement, PreStatement } from '../../invoices/types';
import type { LabLetterhead } from '../../receipt/buildReceiptHtml';
import { DISPLAY, PAGE_PADDING, fmtDate, PillButton } from '../components/atoms';
import { StatementNoteSheet } from '../components/StatementNoteSheet';
import { useStatementView, StatementFilterBar, NoMatchLine } from '../components/StatementFilter';
import { InvoiceBlock, InfoLine, ActionPill, ConfirmDialog, ResultBanner } from './PreStatementScreen';
import { KPICardX } from '../../../core/ui/KPICardX';
import { PreStatementPdfButton } from '../../invoices/components/PreStatementPdfButton';

const money = (n: unknown, cur: string | null | undefined) =>
  formatMoney(Number(n) || 0, (cur || 'TRY') as Currency);

const rawMsg = (e: unknown) => String((e as any)?.message ?? e);
const errText = (e: unknown): string => {
  const msg = rawMsg(e);
  const known = preStatementErrorText(msg);
  return known ? autoT(known) : msg;
};
const isInvalid = (e: unknown) => /PS_LINK_INVALID/.test(rawMsg(e));

type ResultMsg = { issued: number; changed: number; disputed: number };

export function LinkPreStatementScreen() {
  const { token: rawToken } = useLocalSearchParams<{ token: string }>();
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const U = useInkUI();
  const insets = useSafeAreaInsets();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const pageBg = isDark ? '#0E0E0E' : '#F1F5F9';
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const [data, setData] = useState<LinkPreStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [noteItemId, setNoteItemId] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<ApprovalMode | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [result, setResult] = useState<ResultMsg | null>(null);
  const approveInFlight = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!token) { setInvalid(true); setLoading(false); return; }
    if (!silent) { setLoading(true); setLoadError(null); }
    try {
      setData(await fetchPreStatementByLink(token));
      setInvalid(false); setLoadError(null);
    } catch (e) {
      if (isInvalid(e)) setInvalid(true);
      else if (!silent) setLoadError(errText(e));
    } finally { if (!silent) setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const invoices = useMemo(() => (data?.enabled ? data.invoices ?? [] : []), [data]);
  const undisputed = undisputedCount(invoices);
  // Süzme yalnız görünüm; onay ve PDF tam `invoices` ile çalışır.
  const view = useStatementView(invoices);
  const itemTotal = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of invoices) m[i.id] = (i.items ?? []).length;
    return m;
  }, [invoices]);
  const changed = (data?.changed_invoice_ids ?? []).length;

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

  const sendNote = useCallback(
    (itemId: string, body: string) => addStatementNoteByLink(token as string, itemId, body),
    [token],
  );

  // PDF: antet bağlantı yanıtındaki lab adından; karekod yok (R5).
  const letter: LabLetterhead = useMemo(() => ({ name: data?.lab_name || autoT('Lab') }), [data?.lab_name]);
  const pdfData: PreStatement | null = useMemo(
    () => (data ? { ...data, actor: 'viewer', invoices } : null),
    [data, invoices],
  );

  const runApprove = async () => {
    if (!confirmMode || !token || approveInFlight.current) return;
    approveInFlight.current = true;
    setApproving(true); setApproveError(null);
    try {
      const r = await approvePreStatementByLink(token, confirmMode);
      setResult(summarizeApproval(r));
      setConfirmMode(null);
      await load(true);
    } catch (e) {
      setApproveError(errText(e));
      // Bağlantı bu arada kullanılmış/iptal edilmiş olabilir → diyalog kapanır, durum tazelensin.
      if (isInvalid(e)) { setConfirmMode(null); void load(true); }
    } finally {
      approveInFlight.current = false;
      setApproving(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <View style={{ flex: 1, backgroundColor: pageBg }}>{children}</View>
  );

  if (loading) {
    return shell(
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={U.ink[500]} />
      </View>,
    );
  }

  if (invalid) {
    return shell(
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: PAGE_PADDING }}>
        <View style={{ ...U.cardSolid, width: '100%', maxWidth: 440, alignItems: 'center', gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipTones.danger.bg }}>
            <XCircle size={24} color={U.chipTones.danger.fg} strokeWidth={1.8} />
          </View>
          <Text style={{ fontSize: 16, fontWeight: '700', color: U.ink[900], textAlign: 'center' }}>
            {autoT('Bağlantı geçersiz')}
          </Text>
          <Text style={{ fontSize: 13, color: U.ink[500], textAlign: 'center', lineHeight: 19 }}>
            {autoT('Bu bağlantı artık geçerli değil. Lab\'dan yeni bağlantı isteyin.')}
          </Text>
        </View>
      </View>,
    );
  }

  if (loadError || !data) {
    return shell(
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: PAGE_PADDING }}>
        <View style={{ ...U.cardSolid, width: '100%', maxWidth: 440, alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 13, color: U.chipTones.danger.fg, textAlign: 'center' }}>
            {`${autoT('Ön ekstre yüklenemedi')}: ${loadError ?? ''}`}
          </Text>
          <PillButton variant="light" size="sm" onPress={() => { void load(); }}
            leftIcon={<RefreshCw size={12} color={U.ink[900]} strokeWidth={2} />}>
            {autoT('Yeniden dene')}
          </PillButton>
        </View>
      </View>,
    );
  }

  const approvedView = data.approved;
  // Alıcı artık onaylayıcı değil: bağlantı okunur ama onay/not yazılamaz (yazma RPC'si PS_LINK_INVALID verir)
  const blocked = linkApproveState(data) === 'blocked';
  const kpiStyle = isDesktop ? undefined : { minWidth: 150, padding: 14 };
  // Dar ekranda uzun başlık ikona yapışmasın (klinik ekranıyla aynı)
  const kpiIcon = (name: string) => (isDesktop ? name : undefined);
  const issuedCount = result?.issued ?? data.approval?.issued_count ?? 0;
  const leftCount = result ? result.changed + result.disputed : data.approval?.skipped_count ?? 0;

  return shell(
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: PAGE_PADDING, paddingTop: PAGE_PADDING + 8 + insets.top, paddingBottom: 48, alignItems: 'center' }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ width: '100%', maxWidth: 1040, gap: 16 }}>
        {/* Başlık: lab · klinik · son geçerlilik */}
        <View style={{ ...U.cardSolid, gap: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: U.ink[400] }}>
            {autoT('Ön ekstre onayı')}
          </Text>
          <Text style={{ ...DISPLAY, fontSize: 26, letterSpacing: -0.5, color: U.ink[900] }} numberOfLines={2}>
            {data.lab_name || autoT('Lab')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <MetaChip icon={<Building2 size={13} color={U.ink[500]} strokeWidth={1.8} />}
              text={`${autoT('Klinik')}: ${data.clinic_name || '—'}`} />
            {!approvedView ? (
              <MetaChip icon={<Clock size={13} color={U.ink[500]} strokeWidth={1.8} />}
                text={`${autoT('Son geçerlilik')}: ${fmtDate(data.expires_at)}`} />
            ) : null}
          </View>
          <Text style={{ fontSize: 13, color: U.ink[500], lineHeight: 18 }}>
            {autoT('Lab\'ın kesmeden önce onayınıza sunduğu taslak faturalar')}
          </Text>
        </View>

        {/* Onay sonrası: salt okunur */}
        {approvedView ? (
          <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: U.chipTones.success.bg, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={15} color={U.chipTones.success.fg} strokeWidth={1.8} />
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: U.chipTones.success.fg }}>
                {`${issuedCount} ${autoT('fatura kesinleşti')}`}
              </Text>
            </View>
            {data.approved_at ? (
              <Text style={{ fontSize: 12, color: U.chipTones.success.fg }}>
                {`${autoT('Onay tarihi')}: ${fmtDate(data.approved_at)}`}
              </Text>
            ) : null}
            {leftCount > 0 ? (
              <Text style={{ fontSize: 12, color: U.chipTones.success.fg }}>
                {`${leftCount} ${autoT('fatura taslakta kaldı')}`}
              </Text>
            ) : null}
            <Text style={{ fontSize: 12, color: U.chipTones.success.fg, opacity: 0.85 }}>
              {autoT('Bu bağlantıyla onay verildi; sayfa artık yalnız okunur')}
            </Text>
          </View>
        ) : null}

        {changed > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: U.chipTones.warning.bg }}>
            <AlertTriangle size={14} color={U.chipTones.warning.fg} strokeWidth={1.8} />
            <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: U.chipTones.warning.fg }}>
              {autoT('Bazı faturalar değişti; lab\'dan yeni bağlantı isteyin')}
            </Text>
          </View>
        ) : null}

        {!data.enabled ? (
          <InfoLine text={autoT('Lab bu ayarı kapattı')} />
        ) : (
          <>
            {/* Para birimi başına üç rakam — klinik ekranıyla aynı (null = 'own' kapsam → gizli) */}
            {(data.summary ?? []).map(sm => (
              <View key={sm.currency} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {sm.finalized_balance != null ? (
                  <KPICardX title={autoT('Kesinleşmiş bakiye')} value={money(sm.finalized_balance, sm.currency)} icon={kpiIcon('file-text')} style={kpiStyle} />
                ) : null}
                {sm.overdue != null ? (
                  <KPICardX title={autoT('Vadesi geçen')} value={money(sm.overdue, sm.currency)} icon={kpiIcon('alert-triangle')} style={kpiStyle}
                    accent={(Number(sm.overdue) || 0) > 0 ? U.chipTones.danger.fg : undefined} />
                ) : null}
                <KPICardX title={autoT('Onay bekleyen')} value={money(sm.pending, sm.currency)} icon={kpiIcon('clock')} style={kpiStyle} />
              </View>
            ))}

            {/* Onay hiçbir faturayı kesinleştirmediyse (hepsi atlandı) sonuç burada görünür */}
            {result && !approvedView ? <ResultBanner r={result} /> : null}

            {/* Onay satırı */}
            {blocked && invoices.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 220,
                  paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: U.chipNeutral }}>
                  <Info size={14} color={U.ink[500]} strokeWidth={1.8} />
                  <Text style={{ flex: 1, fontSize: 12.5, color: U.ink[700], lineHeight: 18 }}>
                    {autoT('Bu bağlantıyla onay verilemiyor; lab\'dan yeni bağlantı isteyin.')}
                  </Text>
                </View>
                {pdfData ? (
                  <PreStatementPdfButton
                    clinicName={data.clinic_name || autoT('Klinik')}
                    data={pdfData}
                    lab={letter}
                    defaultFormat="ozet"
                  />
                ) : null}
              </View>
            ) : data.can_approve && invoices.length > 0 ? (
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
                {pdfData ? (
                  <PreStatementPdfButton
                    clinicName={data.clinic_name || autoT('Klinik')}
                    data={pdfData}
                    lab={letter}
                    defaultFormat="ozet"
                  />
                ) : null}
                {approveError && !confirmMode ? (
                  <Text style={{ flex: 1, minWidth: 180, fontSize: 12, color: U.chipTones.danger.fg }}>{approveError}</Text>
                ) : null}
              </View>
            ) : pdfData && invoices.length > 0 ? (
              <PreStatementPdfButton
                clinicName={data.clinic_name || autoT('Klinik')}
                data={pdfData}
                lab={letter}
                defaultFormat="ozet"
              />
            ) : null}

            {!approvedView && !blocked && invoices.length > 0 ? (
              <Text style={{ fontSize: 12, color: U.ink[500] }}>
                {autoT('Kaleme dokunarak not yazabilirsiniz; not o kalem için itiraz açar')}
              </Text>
            ) : null}

            {invoices.length === 0 ? (
              approvedView ? null : (
                <View style={{ ...U.cardSolid, alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={22} color={U.ink[400]} strokeWidth={1.6} />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[700] }}>{autoT('Onay bekleyen fatura yok')}</Text>
                </View>
              )
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

        <Text style={{ fontSize: 11, color: U.ink[400], textAlign: 'center', marginTop: 8 }}>
          {autoT('Bu sayfa yalnız bu kliniğin ön ekstresini gösterir · Siman')}
        </Text>
      </View>

      <StatementNoteSheet
        open={!!noteItemId}
        item={noteTarget?.item ?? null}
        currency={noteTarget?.currency ?? noteCurrency.current}
        sendNote={sendNote}
        readOnly={approvedView || blocked}
        readOnlyText={blocked
          ? autoT('Bu bağlantıyla not yazılamaz; lab\'dan yeni bağlantı isteyin.')
          : autoT('Onay verildiği için bu bağlantıdan not yazılamaz')}
        onClose={() => setNoteItemId(null)}
        onSent={() => load(true)}
      />

      <ConfirmDialog
        mode={confirmMode}
        total={invoices.length}
        undisputed={undisputed}
        busy={approving}
        error={approveError}
        onCancel={() => { if (!approving) setConfirmMode(null); }}
        onConfirm={runApprove}
      />
    </ScrollView>,
  );
}

function MetaChip({ icon, text }: { icon: React.ReactNode; text: string }) {
  const U = useInkUI();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: U.chipNeutral }}>
      {icon}
      <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }} numberOfLines={1}>{text}</Text>
    </View>
  );
}

export default LinkPreStatementScreen;
