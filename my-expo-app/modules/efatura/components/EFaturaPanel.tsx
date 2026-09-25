/**
 * EFaturaPanel — fatura detayındaki "e-Fatura" bölümü.
 *
 *   • Mevcut durum (efatura_status) rozeti
 *   • UUID (varsa) tek satırda, kopyalanabilir
 *   • Gönder / Durum Sorgula / İptal aksiyonları
 *   • Gönderim geçmişi (efatura_logs son 5 kayıt) katlanır listede
 *
 * KART DEĞİL BÖLÜMDÜR: InvoiceActionsCard içindeki tek kartın üçüncü
 * bölümü olarak çizilir — kendi gölgesi/kenarlığı yoktur, yatay dolgusu
 * kartla ortaktır (SECTION_PAD). Tek kullanıcısı o karttır.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import {
  Send, RefreshCw, Ban, AlertCircle, Copy, ChevronDown, ChevronRight,
} from '../../../core/ui/icons';
import { useInkUI } from '../../../core/theme/inkScale';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { toast } from '../../../core/ui/Toast';
import {
  sendInvoice, queryEFaturaStatus, cancelEFatura, fetchEFaturaLogs,
  STATUS_LABELS,
} from '../api';
import { getActiveProvider } from '../providers';
import type { EFaturaStatus } from '../types';
import { confirmAsync } from '../../../core/util/confirm';
import {
  ActionSectionHead, NavyButton, SECTION_PAD,
} from '../../invoices/components/InvoiceActionsCard';

interface Props {
  invoiceId:   string;
  status:      EFaturaStatus | null | undefined;
  uuid?:       string | null;
  type?:       'e_fatura' | 'e_arsiv' | null;
  provider?:   string | null;
  error?:      string | null;
  /** Kart içindeki sıra numarası (akış: 1 not → 2 ödeme → 3 e-fatura). */
  step?:       number;
  onChanged?:  () => void;
}

/** Durum → kart tonu. Ham `cfg.color` koyu temada sönük kalıyordu. */
const TONE_OF: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  accepted: 'success', sent: 'info', rejected: 'danger',
  cancelled: 'neutral', pending: 'neutral', error: 'danger',
};

export function EFaturaPanel({ invoiceId, status, uuid, type, provider, error, step, onChanged }: Props) {
  const U = useInkUI();
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsOpen, setLogsOpen] = useState(false);
  const cfg = STATUS_LABELS[status ?? 'pending'];
  const tone = U.chipTones[TONE_OF[status ?? 'pending'] ?? 'neutral'];
  const [providerName, setProviderName] = useState<string>('Demo (Sandbox)');
  useEffect(() => {
    getActiveProvider().then(p => setProviderName(p.displayName));
  }, []);

  const refreshLogs = async () => {
    const { data } = await fetchEFaturaLogs(invoiceId);
    setLogs(((data ?? []) as any[]).slice(0, 5));
  };

  useEffect(() => { refreshLogs(); }, [invoiceId]);

  const isFinal = status === 'accepted' || status === 'cancelled';
  const isSent  = status === 'sent' || status === 'accepted' || status === 'rejected';

  const handleSend = async () => {
    setBusy(true);
    const r = await sendInvoice(invoiceId);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error ?? 'Gönderim başarısız');
    } else {
      toast.success(`e-${type === 'e_arsiv' ? 'Arşiv' : 'Fatura'} gönderildi`);
    }
    refreshLogs();
    onChanged?.();
  };

  const handleQuery = async () => {
    setBusy(true);
    const r = await queryEFaturaStatus(invoiceId);
    setBusy(false);
    if (!r.ok) toast.error(r.error ?? 'Sorgulama başarısız');
    else        toast.info(`Durum: ${STATUS_LABELS[r.status as EFaturaStatus]?.label ?? r.status}`);
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
    else       toast.success('e-Fatura iptal edildi');
    refreshLogs();
    onChanged?.();
  };

  const handleCopyUuid = () => {
    if (!uuid) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(uuid);
      toast.success('UUID panoya kopyalandı');
    } else {
      toast.info(uuid);
    }
  };

  return (
    <View style={{ paddingHorizontal: SECTION_PAD, paddingVertical: 14, gap: 12 }}>
      <ActionSectionHead
        step={step}
        title={type === 'e_arsiv' ? 'e-Arşiv' : 'e-Fatura'}
        hint={`${autoT('Sağlayıcı')}: ${provider ?? providerName}`}
        right={
          <View style={{ paddingHorizontal: 9, paddingVertical: 3.5, borderRadius: 999, backgroundColor: tone.bg }}>
            <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: tone.fg }}>
              {cfg.label}
            </Text>
          </View>
        }
      />

      {uuid ? (
        <Pressable
          onPress={handleCopyUuid}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12,
            backgroundColor: U.surfaceSoft, borderWidth: 1, borderColor: U.hairlineSoft,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          }}>
          <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6, color: U.ink[400] }}>UUID</Text>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, fontFamily: 'monospace' as any, color: U.ink[700] }}>
            {uuid}
          </Text>
          <Copy size={12} strokeWidth={1.8} color={U.ink[400]} />
        </Pressable>
      ) : null}

      {error ? (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          padding: 10, borderRadius: 12, backgroundColor: U.chipTones.danger.bg,
        }}>
          <AlertCircle size={14} strokeWidth={1.9} color={U.chipTones.danger.fg} />
          <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>{error}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {!isSent && (
          <NavyButton
            label={busy ? autoT('Gönderiliyor...') : autoT('Gönder')}
            icon={busy
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Send size={13} strokeWidth={1.9} color="#FFFFFF" />}
            onPress={handleSend}
            disabled={busy}
          />
        )}
        {isSent && !isFinal && (
          <Pressable
            onPress={handleQuery}
            disabled={busy}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999,
              backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
              opacity: busy ? 0.5 : pressed ? 0.85 : 1,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}>
            <RefreshCw size={13} strokeWidth={1.9} color={U.plainBtn.fg} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: U.plainBtn.fg }}>{autoT('Durum Sorgula')}</Text>
          </Pressable>
        )}
        {isSent && (
          <Pressable
            onPress={handleCancel}
            disabled={busy}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999,
              backgroundColor: U.chipTones.danger.bg,
              opacity: busy ? 0.5 : pressed ? 0.85 : 1,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}>
            <Ban size={13} strokeWidth={1.9} color={U.chipTones.danger.fg} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: U.chipTones.danger.fg }}>{autoT('İptal Et')}</Text>
          </Pressable>
        )}
      </View>

      {logs.length > 0 && (
        <View style={{ gap: 7 }}>
          <Pressable
            onPress={() => setLogsOpen(o => !o)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}>
            {logsOpen
              ? <ChevronDown size={13} strokeWidth={2} color={U.ink[400]} />
              : <ChevronRight size={13} strokeWidth={2} color={U.ink[400]} />}
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: U.ink[400] }}>
              {autoT('Son işlemler')} ({logs.length})
            </Text>
          </Pressable>

          {logsOpen && logs.map(l => (
            <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{
                width: 6, height: 6, borderRadius: 3,
                backgroundColor: l.error_message ? U.chipTones.danger.fg : U.chipTones.success.fg,
              }} />
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: U.ink[700] }}>{l.action}</Text>
              <Text style={{ fontSize: 10.5, color: U.ink[400] }}>
                {new Date(l.created_at).toLocaleString(localeTag())}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
