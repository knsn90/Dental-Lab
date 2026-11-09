/**
 * EFaturaPanel — fatura detayındaki "e-Fatura" bölümünün VERİ + AKSİYON katmanı.
 * Görünüm: EFaturaSection (durum durum /dev'de çizilebilir).
 *
 * İki adımlı akış (kullanıcı kuralı 2026-10-21 — gerçek fatura asla doğrudan kesilmez):
 *   1. Taslak oluştur → previewInvoice: sunucu faturayı gönderilecek haliyle kurar,
 *      imzalı jeton + son kullanma döner (30 dk). Hiçbir şey göndermez/yazmaz.
 *      Taslak bu bileşende tutulur; tam görünüm EFaturaPreviewModal.
 *   2. Asıl faturayı oluştur → sendInvoice(id, { previewToken }). Sunucu taslakla
 *      birebir aynı içeriği doğrulamadan Luca'ya göndermez (efatura-luca v4).
 *      needsPreview (süre doldu / fatura değişti) → taslak otomatik yenilenir.
 * Önizleme sunmayan sağlayıcı (demo) tek adımda onayla gönderir.
 *
 * KART DEĞİL BÖLÜMDÜR: InvoiceActionsCard içindeki tek kartın üçüncü bölümü.
 */
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useLabBillingStatus } from '../../settings/labBillingApi';
import { autoT } from '../../../core/i18n/autoTranslate';
import { toast } from '../../../core/ui/Toast';
import { confirmAsync } from '../../../core/util/confirm';
import {
  sendInvoice, previewInvoice, queryEFaturaStatus, cancelEFatura, fetchEFaturaLogs, STATUS_LABELS,
} from '../api';
import { getActiveProvider } from '../providers';
import type { EFaturaStatus, EFaturaPreview } from '../types';
import { efaturaStage, draftMinutesLeft, efaturaBlocker } from '../lib/efaturaFlow';
import { countSharedEFatura } from '../bulkApi';
import { openEFaturaPdf } from '../pdf';
import { EFaturaSection, type EFaturaEnv } from './EFaturaSection';
import { EFaturaPreviewModal } from './EFaturaPreviewModal';

interface Props {
  invoiceId:   string;
  status:      EFaturaStatus | null | undefined;
  uuid?:       string | null;
  type?:       'e_fatura' | 'e_arsiv' | null;
  provider?:   string | null;
  error?:      string | null;
  /** Entegratörün resmi fatura numarası (Luca) */
  number?:     string | null;
  /** Kart içindeki sıra numarası (akış: 1 not → 2 ödeme → 3 e-fatura). */
  step?:       number;
  onChanged?:  () => void;
  /** Siman fatura durumu: 'taslak' → önce "Faturayı kes", 'iptal' → kilitli */
  invoiceStatus?: string | null;
  /** "Faturayı kes" — taslak Siman faturasını kesildi'ye alır (fatura ekranı sağlar) */
  onIssueInvoice?: () => Promise<void> | void;
  /** "Faturayı kes" hatası (ebeveynden) — butonun altında */
  issueInvoiceError?: string | null;
  /** Klinik e-faturaya hazır değil → eksikler (autoT'lenmiş) */
  clinicGaps?: string[];
  onEditClinic?: () => void;
}

interface Draft { preview: EFaturaPreview; token?: string; expiresAt?: string }

export function EFaturaPanel({ invoiceId, status, uuid, type, provider, error, number, step, onChanged, invoiceStatus, onIssueInvoice, issueInvoiceError, clinicGaps, onEditClinic }: Props) {
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [providerName, setProviderName] = useState<string>('Demo (Sandbox)');
  const [providerKey, setProviderKey] = useState<string | null>(null);
  const [env, setEnv] = useState<EFaturaEnv>('demo');
  const [previewless, setPreviewless] = useState(false);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [groupCount, setGroupCount] = useState(0);
  const [issuingInvoice, setIssuingInvoice] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const openPdf = async () => {
    setPdfBusy(true);
    const r = await openEFaturaPdf(invoiceId);
    setPdfBusy(false);
    if (!r.ok) toast.error(autoT(r.error ?? 'PDF açılamadı'));
  };

  // Toplu e-fatura: aynı ETTN'yi paylaşan Siman faturaları
  useEffect(() => {
    if (!uuid) { setGroupCount(0); return; }
    let alive = true;
    countSharedEFatura(uuid).then((n) => { if (alive) setGroupCount(n); });
    return () => { alive = false; };
  }, [uuid]);

  useEffect(() => {
    getActiveProvider().then((p) => {
      setProviderName(p.displayName);
      setProviderKey(p.key);
      setPreviewless(!p.previewById);
      setEnv(p.key === 'demo' ? 'demo' : p.environment === 'production' ? 'live' : 'test');
    });
  }, []);

  // Taslak varken kalan süreyi dakikada bir güncelle.
  useEffect(() => {
    if (!draft?.expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [draft?.expiresAt]);

  const isLuca = (provider ?? providerKey) === 'luca';
  const billing = useLabBillingStatus();
  const router = useRouter();
  const segments = useSegments();
  const activeKey = provider ?? providerKey;
  const billingBlocked = !!activeKey && activeKey !== 'demo' && !billing.loading && !billing.complete;
  const openBillingSettings = () => {
    const group = String(segments[0] ?? '').startsWith('(') ? String(segments[0]) : '(lab)';
    router.push(`/${group}/settings?tab=general` as any);
  };

  const refreshLogs = async () => {
    const { data } = await fetchEFaturaLogs(invoiceId);
    setLogs(((data ?? []) as any[]).slice(0, 5));
  };
  useEffect(() => { refreshLogs(); }, [invoiceId]);

  // Fatura kesildiyse eski taslak anlamını yitirir.
  useEffect(() => {
    if (status === 'sent' || status === 'accepted' || status === 'cancelled') { setDraft(null); setModalOpen(false); }
  }, [status]);

  const minutesLeft = draftMinutesLeft(draft?.expiresAt ?? null, now);
  const stage = efaturaStage(status, !!draft);
  const blocker = efaturaBlocker(invoiceStatus, status);

  const issueInvoice = async () => {
    if (!onIssueInvoice) return;
    setIssuingInvoice(true);
    try { await onIssueInvoice(); } finally { setIssuingInvoice(false); }
  };

  /** 1. adım — taslak oluştur (sunucu hazırlığı, hiçbir şey göndermez). */
  const createDraft = async (opts: { openModal?: boolean; keepIssueError?: boolean } = {}) => {
    const p = await getActiveProvider();
    if (!p.previewById) return sendPreviewless();
    setDraftLoading(true); setDraftError(null);
    if (!opts.keepIssueError) setIssueError(null);
    if (opts.openModal !== false) setModalOpen(true);
    const r = await previewInvoice(invoiceId);
    setDraftLoading(false);
    setNow(Date.now());
    if (!r.ok) { setDraft(null); setDraftError(autoT(r.error)); return; }
    if (!r.preview) { setDraft(null); setDraftError(autoT('Bu sağlayıcı önizleme sunmuyor')); return; }
    setDraft({ preview: r.preview, token: r.previewToken, expiresAt: r.previewExpiresAt });
  };

  /** 2. adım — asıl faturayı taslakla birebir aynı içerikle kes. */
  const issue = async () => {
    if (!draft) return;
    setIssuing(true); setIssueError(null);
    const r = await sendInvoice(invoiceId, { previewToken: draft.token });
    setIssuing(false);
    refreshLogs();
    onChanged?.();
    if (r.ok) {
      setDraft(null); setModalOpen(false);
      toast.success(autoT((r.type ?? type) === 'e_arsiv' ? 'e-Arşiv faturası kesildi' : 'e-Fatura kesildi'));
      return;
    }
    setIssueError(autoT(r.error ?? 'Fatura kesilemedi'));
    // Süre doldu / fatura taslaktan sonra değişti → güncel taslağı hazırla, yeniden onay iste.
    if (r.needsPreview) createDraft({ openModal: modalOpen, keepIssueError: true });
  };

  /** Önizlemesiz sağlayıcı (demo): tek adımda onayla gönder. */
  const sendPreviewless = async () => {
    const ok = await confirmAsync(
      autoT('e-Faturayı gönder'),
      autoT('Fatura GİB\'e iletilecek ve geri çekilemez. Gönderilsin mi?'),
      { confirmText: autoT('Gönder') },
    );
    if (!ok) return;
    setBusy(true);
    const r = await sendInvoice(invoiceId);
    setBusy(false);
    if (r.ok) toast.success(autoT((r.type ?? type) === 'e_arsiv' ? 'e-Arşiv gönderildi' : 'e-Fatura gönderildi'));
    else toast.error(autoT(r.error ?? 'Gönderim başarısız'));
    refreshLogs();
    onChanged?.();
  };

  const handleQuery = async () => {
    setBusy(true);
    const r = await queryEFaturaStatus(invoiceId);
    setBusy(false);
    if (!r.ok) toast.error(autoT(r.error ?? 'Sorgulama başarısız'));
    else toast.info(`${autoT('Durum')}: ${autoT(STATUS_LABELS[r.status as EFaturaStatus]?.label ?? r.status)}`);
    refreshLogs();
    onChanged?.();
  };

  const handleCancel = async () => {
    const ok = await confirmAsync(
      'e-Faturayı İptal Et',
      'Bu fatura GİB üzerinde iptal edilsin mi? Bu işlem geri alınamaz.',
      { confirmText: 'İptal Et', destructive: true },
    );
    if (!ok) return;
    setBusy(true);
    const r = await cancelEFatura(invoiceId, 'Kullanıcı iptali');
    setBusy(false);
    if (!r.ok) toast.error(r.error ?? 'İptal başarısız');
    else toast.success('e-Fatura iptal edildi');
    refreshLogs();
    onChanged?.();
  };

  const handleCopyUuid = () => {
    if (!uuid) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(uuid);
      toast.success(autoT('ETTN panoya kopyalandı'));
    } else {
      toast.info(uuid);
    }
  };

  return (
    <>
      <EFaturaSection
        step={step}
        title={type === 'e_arsiv' ? 'e-Arşiv' : 'e-Fatura'}
        providerName={provider === 'luca' || providerKey === 'luca' ? 'Luca (TÜRMOB)' : providerName}
        env={env}
        stage={stage}
        draft={draft ? { preview: draft.preview, minutesLeft } : null}
        draftLoading={draftLoading}
        draftError={draftError}
        issuing={issuing}
        issueError={issueError}
        number={number}
        uuid={uuid}
        uuidLabel={isLuca ? 'ETTN' : 'UUID'}
        sendError={error}
        billingBlocked={billingBlocked}
        previewless={previewless}
        canCancel={!isLuca}
        cancelNote={isLuca && (stage === 'sent' || stage === 'done') ? autoT('e-Fatura iptali Luca portalından yapılır') : null}
        busy={busy}
        logs={logs}
        blocker={blocker}
        onIssueInvoice={onIssueInvoice ? issueInvoice : undefined}
        issuingInvoice={issuingInvoice}
        issueInvoiceError={issueInvoiceError ?? null}
        groupCount={groupCount}
        clinicGaps={clinicGaps}
        onEditClinic={onEditClinic}
        onOpenPdf={isLuca ? openPdf : undefined}
        pdfBusy={pdfBusy}
        onCreateDraft={() => createDraft()}
        onOpenDraft={() => setModalOpen(true)}
        onIssue={issue}
        onQuery={handleQuery}
        onCancel={handleCancel}
        onCopyUuid={handleCopyUuid}
        onOpenBilling={openBillingSettings}
      />
      <EFaturaPreviewModal
        visible={modalOpen}
        preview={draft?.preview ?? null}
        loading={draftLoading}
        loadErr={draftError}
        issuing={issuing}
        issueErr={issueError}
        expired={minutesLeft === 0}
        onClose={() => setModalOpen(false)}
        onRefresh={() => createDraft({ openModal: true })}
        onIssue={issue}
      />
    </>
  );
}
