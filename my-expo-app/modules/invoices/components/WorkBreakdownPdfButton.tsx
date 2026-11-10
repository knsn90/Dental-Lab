/**
 * "İş dökümü PDF" — kesinleşmiş faturanın kalem kalem iş listesi.
 * e-Fatura birleşik satır biçiminde GİB faturası hizmet başına tek satır taşır; ayrıntılı iş listesi
 * fatura numarasıyla bu PDF olarak verilir. Akış: get_invoice_work_breakdown RPC → lib/workBreakdown
 * adaptörü → buildWorkBreakdownHtml (ön ekstre ayrıntılı tasarımı, karekod yok) → exportHtmlPdf.
 * Taslak/iptal faturada çizilmez (sunucu da INV_NOT_FINALIZED ile reddeder). Hata düğmenin yanında.
 */
import React, { useRef, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { FileText } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { exportHtmlPdf } from '../../../core/print/exportHtmlPdf';
import { buildWorkBreakdownHtml } from '../buildPreStatementHtml';
import { fetchInvoiceWorkBreakdown } from '../preStatementApi';
import { fetchLabLetterhead, fetchSelfViewLetterhead } from '../labLetterheadApi';
import {
  workBreakdownToPreStatement, workBreakdownTitle, isWorkBreakdownStatus, workBreakdownFileName, workBreakdownErrorText,
} from '../lib/workBreakdown';

export function WorkBreakdownPdfButton({ invoiceId, invoiceNumber, invoiceStatus, clinicName, selfView }: {
  invoiceId: string;
  invoiceNumber: string;
  /** Siman fatura durumu — yalnız kesinleşmişte (kesildi/kısmi ödendi/ödendi) çizilir */
  invoiceStatus: string | null | undefined;
  /** RPC klinik adı vermezse yedek */
  clinicName?: string | null;
  /** Klinik/hekim paneli: antet lab'ın markasından (get_lab_brand), kendi lab profilinden değil */
  selfView?: boolean;
}) {
  const U = useInkUI();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  if (!isWorkBreakdownStatus(invoiceStatus)) return null;

  const run = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null);
    // await YOK: masaüstünde pencere tıklama jesti içinde açılmalı (exportHtmlPdf bunu ilk iş yapar).
    const html = (async () => {
      const [rpc, lab] = await Promise.all([fetchInvoiceWorkBreakdown(invoiceId), selfView ? fetchSelfViewLetterhead() : fetchLabLetterhead()]);
      const data = workBreakdownToPreStatement(rpc);
      const no = rpc.invoice_number || invoiceNumber;
      return buildWorkBreakdownHtml({
        clinicName: rpc.clinic_name || clinicName || '—',
        lab,
        data,
        currency: data.invoices[0].currency,
        documentTitle: workBreakdownTitle(no, autoT),
      });
    })();
    exportHtmlPdf(html, workBreakdownFileName(invoiceNumber))
      .catch((e: any) => {
        const known = workBreakdownErrorText(e);
        const m = String(e?.message ?? e);
        setError(known
          ? autoT(known)
          : m === 'POPUP_BLOCKED'
            ? autoT('Açılır pencere engellendi — bu siteye izin verip tekrar deneyin.')
            : `${autoT('PDF oluşturulamadı')}: ${m}`);
      })
      .finally(() => { inFlight.current = false; setBusy(false); });
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
      <GlassTooltip title={autoT('İş dökümü PDF')} text={autoT('Faturadaki işleri kalem kalem, fatura numarasıyla PDF olarak indirir')}>
        <Pressable
          disabled={busy}
          onPress={run}
          accessibilityRole="button"
          accessibilityLabel={autoT('İş dökümü PDF')}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
            backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
            opacity: busy ? 0.6 : pressed ? 0.85 : 1,
            ...(Platform.OS === 'web' ? { cursor: busy ? 'default' : 'pointer' } as any : {}),
          })}
        >
          <FileText size={13} color={U.plainBtn.fg} strokeWidth={2} />
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.plainBtn.fg }}>
            {busy ? autoT('Hazırlanıyor…') : autoT('İş dökümü PDF')}
          </Text>
        </Pressable>
      </GlassTooltip>
      {error ? (
        <Text accessibilityRole="alert" style={{ flex: 1, minWidth: 180, fontSize: 12, lineHeight: 16, color: U.chipTones.danger.fg }}>{error}</Text>
      ) : null}
    </View>
  );
}
