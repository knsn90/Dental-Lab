/**
 * Lab ekstresi → Ön ekstre bölümü: "Onay bağlantısı oluştur".
 *
 * create_statement_link kliniğin onaylayıcısına (R3) 45 günlük, tek onaylık bağlantı üretir
 * ve kliniğin önceki bağlantısını iptal eder (R2). Jeton yalnız bu yanıtta gelir; sunucuda
 * karması saklanır → burada yalnız bellekte tutulur (kalıcı değil, log'a yazılmaz).
 *
 * Sonuç: bağlantıyı kopyala · karekodlu PDF (localQrSvg → approve.qrSvg; R5 yalnız bu PDF)
 * · son geçerlilik tarihi.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, Share } from 'react-native';
import { Link2, Copy, Check, Info, Clock } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { createStatementLink } from '../preStatementApi';
import { buildStatementLinkUrl, linkOrigin, preStatementErrorText } from '../lib/preStatement';
import { localQrSvg } from '../../orders/lib/qrSvg';
import type { PreStatement, StatementLink } from '../types';
import type { LabLetterhead } from '../../receipt/buildReceiptHtml';
import { PreStatementPdfButton } from './PreStatementPdfButton';
import { fmtDate } from '../../finance-clinic/components/atoms';

/** Web'de bulunduğu adres (yerel/önizlemede canlı alan adı); native'de canlı alan adı. */
export function statementLinkOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return linkOrigin(window.location.hostname, window.location.origin);
  }
  return 'https://siman.app';
}

export function StatementLinkPanel({ clinicId, clinicName, data, lab, currency, onCreated }: {
  clinicId: string;
  clinicName: string;
  data: PreStatement;
  lab: LabLetterhead | (() => Promise<LabLetterhead>);
  currency?: string;
  /** Yeni bağlantı oluştu → durum satırı tazelensin. */
  onCreated?: () => void;
}) {
  const U = useInkUI();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<(StatementLink & { url: string }) | null>(null);
  const [qrSvg, setQrSvg] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);

  // Başka kliniğe geçince önceki kliniğin bağlantısı görünmesin.
  useEffect(() => { setLink(null); setQrSvg(undefined); setError(null); setCopied(false); }, [clinicId]);

  const create = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null); setCopied(false);
    try {
      const r = await createStatementLink(clinicId);
      const url = buildStatementLinkUrl(r.token, statementLinkOrigin());
      setLink({ ...r, url });
      onCreated?.();
      setQrSvg(await localQrSvg(url));
    } catch (e) {
      const msg = String((e as any)?.message ?? e);
      const known = preStatementErrorText(msg);
      setError(known ? autoT(known) : msg);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(link.url);
        setCopied(true);
      } else {
        await Share.share({ message: link.url });
      }
    } catch (e) {
      setError(`${autoT('Kopyalanamadı')}: ${String((e as any)?.message ?? e)}`);
    }
  };

  const webCursor = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

  return (
    <View style={{ gap: 10, padding: 14, borderRadius: 16, backgroundColor: U.surfaceSoft, borderWidth: 1, borderColor: U.hairline }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <GlassTooltip title={autoT('Onay bağlantısı oluştur')} text={autoT('Kliniğin yöneticisine girişsiz onay bağlantısı ve karekodlu PDF hazırlar')}>
          <Pressable
            onPress={create}
            disabled={busy}
            accessibilityLabel={autoT('Onay bağlantısı oluştur')}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 9,
              borderRadius: 999, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
              opacity: busy ? 0.6 : pressed ? 0.85 : 1, ...webCursor,
            })}
          >
            {busy ? <ActivityIndicator size="small" color={U.plainBtn.fg} /> : <Link2 size={13} color={U.plainBtn.fg} strokeWidth={2} />}
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.plainBtn.fg }}>
              {link ? autoT('Yeni bağlantı oluştur') : autoT('Onay bağlantısı oluştur')}
            </Text>
          </Pressable>
        </GlassTooltip>
        {error ? <Text style={{ flex: 1, minWidth: 180, fontSize: 12, color: U.chipTones.danger.fg }}>{error}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Info size={12} color={U.ink[400]} strokeWidth={1.8} />
        <Text style={{ flex: 1, fontSize: 11.5, color: U.ink[500] }}>{autoT('Yeni bağlantı öncekini geçersiz kılar')}</Text>
      </View>

      {link ? (
        <View style={{ gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: U.hairlineSoft }}>
          <Text selectable style={{ fontSize: 12, color: U.ink[700], fontFamily: Platform.OS === 'web' ? 'JetBrains Mono, monospace' : undefined }} numberOfLines={2}>
            {link.url}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <GlassTooltip title={autoT('Bağlantıyı kopyala')} text={autoT('Bağlantıyı panoya kopyalar')}>
              <Pressable
                onPress={copy}
                accessibilityLabel={autoT('Bağlantıyı kopyala')}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9,
                  borderRadius: 999, backgroundColor: U.ink[900], opacity: pressed ? 0.85 : 1, ...webCursor,
                })}
              >
                {copied ? <Check size={13} color={U.onDarkPill} strokeWidth={2} /> : <Copy size={13} color={U.onDarkPill} strokeWidth={2} />}
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.onDarkPill }}>
                  {copied ? autoT('Kopyalandı') : autoT('Bağlantıyı kopyala')}
                </Text>
              </Pressable>
            </GlassTooltip>
            <PreStatementPdfButton
              clinicName={clinicName}
              data={data}
              lab={lab}
              currency={currency}
              approve={{ url: link.url, qrSvg, expiresAt: link.expires_at }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Clock size={12} color={U.ink[500]} strokeWidth={1.8} />
              <Text style={{ fontSize: 12, color: U.ink[500] }}>{`${autoT('Son geçerlilik')}: ${fmtDate(link.expires_at)}`}</Text>
            </View>
          </View>
          {link.recipient_name ? (
            <Text style={{ fontSize: 11.5, color: U.ink[500] }}>{`${autoT('Onaylayacak kişi')}: ${link.recipient_name}`}</Text>
          ) : null}
          <Text style={{ fontSize: 11.5, color: U.ink[400] }}>
            {autoT('Karekodlu PDF yalnız bu bağlantıyla geçerlidir')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
