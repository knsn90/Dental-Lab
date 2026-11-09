/**
 * EFaturaSection — fatura detayındaki e-Fatura bölümünün GÖRÜNÜMÜ (veri/aksiyon yok).
 *
 * Akış (kullanıcı kuralı 2026-10-21 — gerçek fatura asla doğrudan kesilmez):
 *   1. "Taslak oluştur"  → sunucu faturayı gönderilecek haliyle hazırlar (alıcı GİB'de
 *                           sorgulanır), hiçbir şey göndermez; kartta özet + tam görünüm.
 *   2. "Asıl faturayı oluştur" → yalnız taslak hazır ve geçerliyken; taslakla birebir aynı
 *                           içerik gönderilir (sunucu imzalı jetonla doğrular).
 *   3. Kesildi / Onaylandı → numara + ETTN, durum sorgusu.
 *
 * Tasarım: üstte ortam etiketi (Canlı GİB / Test / Demo) — gerçek mi deneme mi her an
 * görünür; 3 adımlı ilerleme çubuğu (Taslak · Kesildi · Onaylandı); tek birincil eylem;
 * hata ve uyarılar eylemin hemen üstünde. Kart değil bölümdür (InvoiceActionsCard içinde).
 * Veri ve aksiyonlar EFaturaPanel'de; bu bileşen /dev'de durum durum çizilebilir.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { formatMoney } from '../../../core/money/currency';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import {
  AlertCircle, Check, CheckCircle2, ChevronDown, ChevronRight, Copy, FileSearch,
  RefreshCw, ShieldCheck, Timer, Ban,
} from '../../../core/ui/icons';
import { ActionSectionHead, NavyButton, SECTION_PAD, navyTones } from '../../invoices/components/InvoiceActionsCard';
import { stageStep, logActionLabel, type EFaturaStage } from '../lib/efaturaFlow';
import type { EFaturaPreview } from '../types';

export type EFaturaEnv = 'live' | 'test' | 'demo';

export interface EFaturaDraftView {
  preview: EFaturaPreview;
  /** Kalan geçerlilik (dk). 0 → süresi doldu. null → bilinmiyor. */
  minutesLeft: number | null;
}

export interface EFaturaSectionProps {
  step?: number;
  title: string;
  providerName: string;
  env: EFaturaEnv;
  stage: EFaturaStage;
  draft: EFaturaDraftView | null;
  draftLoading: boolean;
  draftError: string | null;
  issuing: boolean;
  issueError: string | null;
  number?: string | null;
  uuid?: string | null;
  uuidLabel: string;
  sendError?: string | null;
  billingBlocked: boolean;
  /** Önizleme sunmayan sağlayıcı (demo): iki adım yerine tek onaylı gönderim. */
  previewless: boolean;
  canCancel: boolean;
  cancelNote?: string | null;
  busy: boolean;
  logs: Array<{ id: string; action: string; error_message?: string | null; created_at: string; request_body?: { op?: string } | null }>;
  /** Siman faturası henüz kesilmedi / iptal → e-fatura akışı kilitli (efaturaBlocker). */
  blocker?: 'unissued' | 'cancelled' | null;
  /** "Faturayı kes" (Siman faturasını taslaktan kesildi'ye al) */
  onIssueInvoice?: () => void;
  issuingInvoice?: boolean;
  /** "Faturayı kes" hatası — butonun hemen altında */
  issueInvoiceError?: string | null;
  /** Toplu e-fatura: aynı ETTN'yi paylaşan Siman faturası sayısı (>1 ise gösterilir) */
  groupCount?: number;
  /** Klinik e-faturaya hazır değil → eksikler (autoT'lenmiş etiketler); taslak oluşturma kapalı */
  clinicGaps?: string[];
  onEditClinic?: () => void;
  /** Resmi e-fatura PDF'i (Luca) */
  onOpenPdf?: () => void;
  pdfBusy?: boolean;
  onCreateDraft: () => void;
  onOpenDraft: () => void;
  onIssue: () => void;
  onQuery: () => void;
  onCancel: () => void;
  onCopyUuid: () => void;
  onOpenBilling: () => void;
}

const money = (n: number, cur: string) => formatMoney(Number(n) || 0, (cur || 'TRY') as any);
const web = (on = true) => (Platform.OS === 'web' && on ? ({ cursor: 'pointer' } as any) : {});

export function EFaturaSection(p: EFaturaSectionProps) {
  const U = useInkUI();
  const navy = navyTones(U.isDark);
  const [logsOpen, setLogsOpen] = useState(false);

  // ── Ortam etiketi ──────────────────────────────────────────────────────
  const envTone = p.env === 'live' ? U.chipTones.success : p.env === 'test' ? U.chipTones.warning : U.chipTones.neutral;
  const envText = p.env === 'live' ? autoT('Canlı · GİB') : p.env === 'test' ? autoT('Test ortamı') : autoT('Demo');
  const envPill = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: envTone.bg }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: envTone.fg }} />
      <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 0.2, color: envTone.fg }}>{envText}</Text>
    </View>
  );

  // ── Adım çubuğu ────────────────────────────────────────────────────────
  const cur = stageStep(p.stage);
  const isErr = p.stage === 'error';
  const steps = [autoT('Taslak'), autoT('Kesildi'), autoT('Onaylandı')];
  const stepper = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {steps.map((label, i) => {
        const done = i < cur || (i === cur && (p.stage === 'done' || p.stage === 'cancelled'));
        const active = i === cur && !done;
        const ring = isErr && active ? U.chipTones.danger.fg : done || active ? navy.ink : U.hairline;
        return (
          <React.Fragment key={label}>
            <View style={{ alignItems: 'center', gap: 6, width: 64 }}>
              <View style={{
                width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                borderWidth: 1.5, borderColor: ring,
                backgroundColor: done ? navy.ink : 'transparent',
              }}>
                {done
                  ? <Check size={11} strokeWidth={3} color={U.isDark ? '#0E0E0E' : '#FFFFFF'} />
                  : active ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ring }} /> : null}
              </View>
              <Text numberOfLines={1} style={{
                fontSize: 10.5, letterSpacing: 0.2,
                fontWeight: active || done ? '700' : '500',
                color: isErr && active ? U.chipTones.danger.fg : active || done ? U.ink[900] : U.ink[400],
              }}>{label}</Text>
            </View>
            {i < steps.length - 1 ? (
              <View style={{ flex: 1, height: 1.5, marginTop: 9.5, backgroundColor: i < cur ? navy.ink : U.hairline, borderRadius: 1 }} />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );

  // ── Ortak parçalar ─────────────────────────────────────────────────────
  const banner = (tone: 'danger' | 'warning', text: string, action?: React.ReactNode) => (
    <View accessibilityRole="alert" style={{ gap: 8, padding: 12, borderRadius: 14, backgroundColor: U.chipTones[tone].bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <AlertCircle size={14} strokeWidth={1.9} color={U.chipTones[tone].fg} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600', color: U.chipTones[tone].fg }}>{text}</Text>
      </View>
      {action}
    </View>
  );
  const ghostBtn = (label: string, onPress: () => void, icon?: React.ReactNode, disabled = false) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start',
        // 1px kenarlık + 9 dolgu = lacivert butonla (10 dolgu) aynı yükseklik
        paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999,
        backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1, ...web(!disabled),
      })}
    >
      {icon}
      <Text style={{ fontSize: 13, fontWeight: '700', color: U.plainBtn.fg }}>{label}</Text>
    </Pressable>
  );
  const kv = (k: string, v: string, mono = false, onPress?: () => void) => (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, ...web(!!onPress) }}>
      <Text style={{ width: 64, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, color: U.ink[400] }}>{k}</Text>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: U.ink[900], ...(mono ? { fontFamily: 'monospace' as any } : {}) }}>{v}</Text>
      {onPress ? <Copy size={12} strokeWidth={1.8} color={U.ink[400]} /> : null}
    </Pressable>
  );

  // ── Aşama gövdeleri ────────────────────────────────────────────────────
  const d = p.draft?.preview ?? null;
  const expired = p.draft?.minutesLeft === 0;
  const kindText = !d ? ''
    : d.kind === 'e_fatura'
      ? `e-Fatura · ${autoT(d.scenario === 'TICARIFATURA' ? 'Ticari' : 'Temel')}`
      : `e-Arşiv · ${autoT(d.sendingType === 'ELEKTRONIK' ? 'Elektronik' : 'Kağıt')}`;
  const vatRates = d ? Array.from(new Set(d.lines.map((l) => l.vatRate))) : [];

  let body: React.ReactNode = null;
  const gapsBlocked = (p.clinicGaps?.length ?? 0) > 0;
  // Toplu e-faturanın parçası: tek başına yeniden kesilemez (sunucu da reddeder) → yalnız durum sorgusu.
  const inGroup = (p.groupCount ?? 0) > 1;

  if (p.blocker === 'unissued') {
    body = (
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: navy.soft }}>
          <AlertCircle size={16} strokeWidth={1.8} color={navy.ink} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: U.ink[700] }}>
            {autoT('Fatura henüz kesilmedi. e-Fatura taslağı için önce faturayı kesin.')}
          </Text>
        </View>
        {p.onIssueInvoice ? (
          <NavyButton
            block
            label={p.issuingInvoice ? autoT('Kesiliyor…') : autoT('Faturayı kes')}
            icon={p.issuingInvoice
              ? <ActivityIndicator size={16} color="#FFFFFF" />
              : <CheckCircle2 size={14} strokeWidth={1.9} color="#FFFFFF" />}
            onPress={p.onIssueInvoice}
            disabled={p.issuingInvoice}
          />
        ) : null}
        {p.onIssueInvoice && p.issueInvoiceError ? (
          <Text style={{ fontSize: 12, lineHeight: 16, color: U.chipTones.danger.fg }}>{p.issueInvoiceError}</Text>
        ) : null}
      </View>
    );
  } else if (p.blocker === 'cancelled') {
    body = (
      <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: U.chipTones.neutral.bg }}>
        <Ban size={15} strokeWidth={1.8} color={U.chipTones.neutral.fg} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: U.chipTones.neutral.fg }}>
          {autoT('İptal edilmiş faturaya e-fatura kesilmez.')}
        </Text>
      </View>
    );
  } else if (p.stage === 'draft' || (p.stage === 'error' && !p.draft && !inGroup)) {
    body = (
      <View style={{ gap: 12 }}>
        {p.stage === 'error' && p.sendError ? banner('danger', p.sendError) : null}
        {p.draftError ? banner('danger', p.draftError) : null}
        {!p.previewless && p.stage === 'draft' && !p.draftError && !p.billingBlocked && !gapsBlocked ? (
          <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, backgroundColor: navy.soft }}>
            <ShieldCheck size={16} strokeWidth={1.8} color={navy.ink} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: U.ink[700] }}>
              {autoT('Önce taslak oluşturun: alıcı GİB\'de sorgulanır, fatura hazırlanır, hiçbir şey gönderilmez. Asıl fatura yalnız sizin onayınızla kesilir.')}
            </Text>
          </View>
        ) : null}
        <NavyButton
          block
          label={p.draftLoading
            ? autoT('Taslak hazırlanıyor…')
            : p.previewless ? autoT('Gönder') : p.stage === 'error' ? autoT('Taslağı yeniden oluştur') : autoT('Taslak oluştur')}
          icon={p.draftLoading
            ? <ActivityIndicator size={16} color="#FFFFFF" />
            : <FileSearch size={14} strokeWidth={1.9} color="#FFFFFF" />}
          onPress={p.onCreateDraft}
          disabled={p.draftLoading || p.billingBlocked || p.busy || gapsBlocked}
        />
      </View>
    );
  } else if (p.stage === 'ready' && d) {
    body = (
      <View style={{ gap: 12 }}>
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: U.hairline, backgroundColor: U.surfaceSoft, overflow: 'hidden' }}>
          <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', color: navy.ink }}>{autoT('Taslak')}</Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: U.ink[500] }}>{kindText}</Text>
            </View>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: U.ink[900], marginTop: 2 }}>{d.receiver.name || '—'}</Text>
            <Text numberOfLines={1} style={{ fontSize: 11.5, color: U.ink[500] }}>
              {`${d.receiver.taxCode.length === 11 ? 'TCKN' : 'VKN'} ${d.receiver.taxCode}`}
              {` · ${d.lines.length} ${autoT('kalem')}`}
              {vatRates.length ? ` · ${autoT('KDV')} ${vatRates.map((r) => `%${r}`).join(', ')}` : ''}
            </Text>
          </View>
          <View style={{ height: 1, backgroundColor: U.hairlineSoft }} />
          <View style={{ paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: U.ink[500] }}>{autoT('Ödenecek tutar')}</Text>
              {d.totals.payableTry != null ? (
                <Text style={{ fontSize: 11, color: U.ink[400] }}>
                  {`≈ ${money(d.totals.payableTry, 'TRY')}${d.crossRate ? ` · ${autoT('kur')} ${d.crossRate}` : ''}`}
                </Text>
              ) : null}
            </View>
            <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.5, color: U.ink[900] }}>{money(d.totals.payable, d.currency)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: expired ? U.chipTones.warning.bg : navy.soft }}>
            <Timer size={12} strokeWidth={1.9} color={expired ? U.chipTones.warning.fg : navy.ink} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: expired ? U.chipTones.warning.fg : navy.ink }}>
              {expired
                ? autoT('Taslağın süresi doldu — yenileyin')
                : p.draft?.minutesLeft != null
                  ? `${autoT('Taslak geçerli')} · ${p.draft.minutesLeft} ${autoT('dk')}`
                  : autoT('Taslak hazır')}
            </Text>
          </View>
        </View>

        {p.issueError ? banner('danger', p.issueError) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ghostBtn(expired ? autoT('Taslağı yenile') : autoT('Taslağı aç'), expired ? p.onCreateDraft : p.onOpenDraft,
            expired ? <RefreshCw size={13} strokeWidth={1.9} color={U.plainBtn.fg} /> : <FileSearch size={13} strokeWidth={1.9} color={U.plainBtn.fg} />,
            p.issuing || p.draftLoading)}
          <View style={{ flex: 1, minWidth: 190 }}>
            <NavyButton
              block
              label={p.issuing ? autoT('Fatura kesiliyor…') : autoT('Asıl faturayı oluştur')}
              icon={p.issuing
                ? <ActivityIndicator size={16} color="#FFFFFF" />
                : <CheckCircle2 size={14} strokeWidth={1.9} color="#FFFFFF" />}
              onPress={p.onIssue}
              disabled={expired || p.issuing || p.draftLoading || p.billingBlocked}
            />
          </View>
        </View>
        <Text style={{ fontSize: 11, lineHeight: 15, color: U.ink[400] }}>
          {p.env === 'live'
            ? autoT('Asıl fatura GİB\'e iletilir ve geri alınamaz. Taslaktaki bilgilerle birebir kesilir.')
            : autoT('Test ortamı: fatura gerçek GİB\'e gitmez.')}
        </Text>
      </View>
    );
  } else if (p.stage === 'sent' || p.stage === 'done' || p.stage === 'cancelled' || p.stage === 'error') {
    const tone = p.stage === 'done' ? U.chipTones.success : p.stage === 'sent' ? U.chipTones.info : p.stage === 'error' ? U.chipTones.danger : U.chipTones.neutral;
    const head = p.stage === 'done' ? autoT('e-Fatura kesildi')
      : p.stage === 'sent' ? autoT('GİB\'e iletildi — yanıt bekleniyor')
      : p.stage === 'error' ? autoT('GİB faturayı kabul etmedi')
      : autoT('e-Fatura iptal edildi');
    body = (
      <View style={{ gap: 12 }}>
        <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: U.hairline }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: tone.bg }}>
            {p.stage === 'error'
              ? <AlertCircle size={15} strokeWidth={1.9} color={tone.fg} />
              : <CheckCircle2 size={15} strokeWidth={1.9} color={tone.fg} />}
            <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: tone.fg }}>{head}</Text>
          </View>
          {(p.number || p.uuid || (p.groupCount ?? 0) > 1 || (p.stage === 'error' && p.sendError)) ? (
            <View style={{ paddingHorizontal: 14, paddingVertical: 12, gap: 9, backgroundColor: U.surfaceSoft }}>
              {p.number ? kv(autoT('Fatura No'), p.number, true) : null}
              {p.groupCount && p.groupCount > 1 ? kv(autoT('Kapsam'), `${autoT('Toplu e-Fatura')} · ${p.groupCount} ${autoT('fatura')}`) : null}
              {p.uuid ? kv(p.uuidLabel, p.uuid, true, p.onCopyUuid) : null}
              {p.stage === 'error' && p.sendError ? (
                <Text style={{ fontSize: 12, lineHeight: 17, color: U.chipTones.danger.fg }}>{p.sendError}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {p.onOpenPdf && p.uuid && p.stage !== 'cancelled'
            ? ghostBtn(p.pdfBusy ? autoT('PDF alınıyor…') : autoT('e-Fatura PDF'), p.onOpenPdf,
                p.pdfBusy ? <ActivityIndicator size={13} color={U.plainBtn.fg} /> : <FileSearch size={13} strokeWidth={1.9} color={U.plainBtn.fg} />, !!p.pdfBusy)
            : null}
          {p.stage === 'sent' || (p.stage === 'error' && inGroup) ? ghostBtn(autoT('Durum sorgula'), p.onQuery, <RefreshCw size={13} strokeWidth={1.9} color={U.plainBtn.fg} />, p.busy) : null}
          {p.stage === 'error' && !inGroup ? (
            <NavyButton
              label={autoT('Taslağı yeniden oluştur')}
              icon={<FileSearch size={14} strokeWidth={1.9} color="#FFFFFF" />}
              onPress={p.onCreateDraft}
              disabled={p.draftLoading || p.billingBlocked}
            />
          ) : null}
          {p.canCancel && (p.stage === 'sent' || p.stage === 'done') ? (
            <Pressable onPress={p.onCancel} disabled={p.busy} style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
              backgroundColor: U.chipTones.danger.bg, opacity: p.busy ? 0.5 : pressed ? 0.85 : 1, ...web(!p.busy),
            })}>
              <Ban size={13} strokeWidth={1.9} color={U.chipTones.danger.fg} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: U.chipTones.danger.fg }}>{autoT('İptal Et')}</Text>
            </Pressable>
          ) : null}
        </View>
        {p.stage === 'error' && inGroup ? (
          <Text style={{ fontSize: 11, lineHeight: 15, color: U.ink[400] }}>
            {autoT('Toplu e-faturanın parçası — tek başına yeniden kesilemez. Durumu Luca\'dan kontrol edin.')}
          </Text>
        ) : null}
        {p.cancelNote ? <Text style={{ fontSize: 11, color: U.ink[400] }}>{p.cancelNote}</Text> : null}
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: SECTION_PAD, paddingVertical: 16, gap: 14 }}>
      <ActionSectionHead step={p.step} title={p.title} hint={`${autoT('Sağlayıcı')}: ${p.providerName}`} right={envPill} />
      {stepper}
      {p.billingBlocked && !p.blocker && (p.stage === 'draft' || p.stage === 'ready' || p.stage === 'error')
        ? banner('warning', autoT('Lab fatura bilgileri eksik — e-fatura oluşturulamaz.'), ghostBtn(autoT('Fatura Bilgileri\'ni doldur'), p.onOpenBilling))
        : null}
      {gapsBlocked && !p.blocker && (p.stage === 'draft' || p.stage === 'error')
        ? banner('warning', `${autoT('Bu klinik e-faturaya hazır değil. Eksik')}: ${p.clinicGaps!.join(', ')}`,
            p.onEditClinic ? ghostBtn(autoT('Klinik bilgilerini düzenle'), p.onEditClinic) : undefined)
        : null}
      {body}

      {p.logs.length > 0 ? (
        <View style={{ gap: 8, paddingTop: 2 }}>
          <Pressable onPress={() => setLogsOpen((o) => !o)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, ...web() }}>
            {logsOpen
              ? <ChevronDown size={13} strokeWidth={2} color={U.ink[400]} />
              : <ChevronRight size={13} strokeWidth={2} color={U.ink[400]} />}
            <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, color: U.ink[400] }}>
              {`${autoT('Geçmiş')} (${p.logs.length})`}
            </Text>
          </Pressable>
          {logsOpen ? p.logs.map((l) => (
            <View key={l.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 6, backgroundColor: l.error_message ? U.chipTones.danger.fg : U.chipTones.success.fg }} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[700] }}>{autoT(logActionLabel(l.action, l.error_message, l.request_body?.op))}</Text>
                {l.error_message && !l.error_message.startsWith('Önizleme kapısı') ? (
                  <Text numberOfLines={2} style={{ fontSize: 11, color: U.ink[500] }}>{l.error_message}</Text>
                ) : null}
              </View>
              <Text style={{ fontSize: 10.5, color: U.ink[400] }}>{new Date(l.created_at).toLocaleString(localeTag())}</Text>
            </View>
          )) : null}
        </View>
      ) : null}
    </View>
  );
}
