/**
 * EFaturaPanel — InvoiceDetail içine yerleştirilen e-Fatura durum kartı
 *
 *   • Mevcut durum (efatura_status) badge'i
 *   • UUID (varsa) kopyala butonu
 *   • "e-Fatura Gönder" / "Durum Sorgula" / "İptal" aksiyonları
 *   • Gönderim geçmişi (efatura_logs son 5 kayıt)
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { AppIcon } from '../../../core/ui/AppIcon';
import { Shadows, CardSpec } from '../../../core/theme/shadows';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { toast } from '../../../core/ui/Toast';
import {
  sendInvoice, queryEFaturaStatus, cancelEFatura, fetchEFaturaLogs,
  STATUS_LABELS,
} from '../api';
import { getActiveProvider } from '../providers';
import type { EFaturaStatus } from '../types';
import { confirmAsync } from '../../../core/util/confirm';

interface Props {
  invoiceId:   string;
  status:      EFaturaStatus | null | undefined;
  uuid?:       string | null;
  type?:       'e_fatura' | 'e_arsiv' | null;
  provider?:   string | null;
  error?:      string | null;
  onChanged?:  () => void;
}

export function EFaturaPanel({ invoiceId, status, uuid, type, provider, error, onChanged }: Props) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const cfg = STATUS_LABELS[status ?? 'pending'];
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

  return (
    <View style={[s.card, { backgroundColor: T.card, borderColor: T.hairline }]}>
      <View style={s.head}>
        <View style={[s.iconBox, { backgroundColor: cfg.color + '15' }]}>
          <AppIcon name="receipt-text" size={16} color={cfg.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: T.ink }]}>
            {type === 'e_arsiv' ? 'e-Arşiv' : 'e-Fatura'}
          </Text>
          <Text style={[s.providerHint, { color: T.ink3 }]}>
            Sağlayıcı: {provider ?? providerName}
          </Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: cfg.color + '15' }]}>
          <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {uuid ? (
        <View style={[s.uuidRow, { backgroundColor: isDark ? T.cardSoft : '#F8FAFC' }]}>
          <Text style={[s.uuidLabel, { color: isDark ? (T.ink3 as string) : '#94A3B8' }]}>UUID</Text>
          <Text style={[s.uuidValue, { color: isDark ? (T.ink2 as string) : '#475569' }]} numberOfLines={1}>{uuid}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={[s.errorBox, { backgroundColor: isDark ? 'rgba(217,75,75,0.18)' : '#FEF2F2' }]}>
          <AppIcon name="alert-circle" size={14} color={isDark ? '#F3A0A0' : '#DC2626'} />
          <Text style={[s.errorText, { color: isDark ? '#F3A0A0' : '#DC2626' }]}>{error}</Text>
        </View>
      ) : null}

      <View style={s.actions}>
        {!isSent && (
          <TouchableOpacity
            style={[s.btn, s.btnPrimary, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={handleSend}
          >
            {busy
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <AppIcon name="send" size={14} color="#FFFFFF" />}
            <Text style={s.btnPrimaryText}>{busy ? 'Gönderiliyor...' : 'Gönder'}</Text>
          </TouchableOpacity>
        )}
        {isSent && !isFinal && (
          <TouchableOpacity
            style={[s.btn, s.btnOutline, { backgroundColor: isDark ? T.cardSoft : '#FFFFFF', borderColor: isDark ? T.hairline : '#E2E8F0' }]}
            onPress={handleQuery}
            disabled={busy}
          >
            <AppIcon name="refresh" size={14} color={isDark ? (T.ink as string) : '#0F172A'} />
            <Text style={[s.btnOutlineText, { color: isDark ? T.ink : '#0F172A' }]}>Durum Sorgula</Text>
          </TouchableOpacity>
        )}
        {isSent && (
          <TouchableOpacity
            style={[s.btn, s.btnDanger, { backgroundColor: isDark ? 'rgba(217,75,75,0.18)' : '#FEF2F2', borderColor: isDark ? 'rgba(217,75,75,0.35)' : '#FECACA' }]}
            onPress={handleCancel}
            disabled={busy}
          >
            <AppIcon name="cancel" size={14} color={isDark ? '#F3A0A0' : '#DC2626'} />
            <Text style={[s.btnDangerText, { color: isDark ? '#F3A0A0' : '#DC2626' }]}>İptal Et</Text>
          </TouchableOpacity>
        )}
      </View>

      {logs.length > 0 && (
        <View style={[s.logSection, { borderTopColor: isDark ? T.hairline : '#F1F5F9' }]}>
          <Text style={[s.logTitle, { color: isDark ? (T.ink3 as string) : '#94A3B8' }]}>Son işlemler</Text>
          {logs.map(l => (
            <View key={l.id} style={s.logRow}>
              <View style={[s.logDot, { backgroundColor: l.error_message ? '#DC2626' : '#10B981' }]} />
              <Text style={[s.logAction, { color: isDark ? (T.ink2 as string) : '#475569' }]}>{l.action}</Text>
              <Text style={[s.logTime, { color: isDark ? (T.ink3 as string) : '#94A3B8' }]}>{new Date(l.created_at).toLocaleString('tr-TR')}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: CardSpec.bg,
    borderRadius:    CardSpec.radius,
    borderWidth:     1,
    borderColor:     CardSpec.border,
    padding:         13,
    gap:             10,
    ...Shadows.card,
  } as any,
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconBox: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  providerHint: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

  uuidRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#F8FAFC', borderRadius: 10 },
  uuidLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5 },
  uuidValue: { flex: 1, fontSize: 11, color: '#475569', fontFamily: 'monospace' as any },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#FEF2F2', borderRadius: 10 },
  errorText: { flex: 1, fontSize: 12, color: '#DC2626', fontWeight: '600' },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  btnPrimary: { backgroundColor: '#2563EB' },
  btnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  btnOutline: { borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  btnOutlineText: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  btnDanger: { borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  btnDangerText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },

  logSection: { gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  logTitle: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logDot: { width: 6, height: 6, borderRadius: 3 },
  logAction: { flex: 1, fontSize: 12, color: '#475569', fontWeight: '600' },
  logTime: { fontSize: 11, color: '#94A3B8' },
});
