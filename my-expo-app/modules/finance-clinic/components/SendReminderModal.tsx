/**
 * Mali İşlemler — Ödeme Hatırlatması Modal (Admin → Klinik).
 *
 * Admin (lab) → seçili kliniğe öncelik seviyesi + özel mesaj ile hatırlatma
 * gönderir. RPC: `send_payment_reminder` → notifications tablosuna düşer,
 * payment_reminders'a audit kaydı atılır.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, Modal, Pressable, TextInput, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { X, Bell, AlertTriangle, CheckCircle2, Info, AlertCircle, Send } from 'lucide-react-native';

import { DS } from '../../../core/theme/dsTokens';
import { sendPaymentReminder, fetchLastReminder, type ReminderSeverity, type LastReminderRow } from '../api';
import { DISPLAY, TRY, fmtDate, PillButton } from './atoms';

type Props = {
  visible: boolean;
  clinicId: string;
  clinicName: string;
  /** Snapshot — sadece görsel; gerçek değerler RPC'de hesaplanır */
  totalDue?: number;
  overdueCount?: number;
  invoiceId?: string | null;
  invoiceNo?: string | null;
  onClose: () => void;
  onSent?: () => void;
};

const SEVERITY_OPTS: { key: ReminderSeverity; label: string; desc: string; icon: any; fg: string; bg: string; border: string }[] = [
  { key: 'info',    label: 'Bilgi',   desc: 'Nazik hatırlatma',           icon: Info,         fg: DS.ink[700], bg: DS.ink[100],          border: DS.ink[200] },
  { key: 'warning', label: 'Uyarı',   desc: 'Vade hatırlatması',          icon: AlertCircle,  fg: '#9C5E0E',   bg: 'rgba(232,155,42,0.15)', border: 'rgba(232,155,42,0.35)' },
  { key: 'urgent',  label: 'Acil',    desc: 'Vadesi geçen ödeme',         icon: AlertTriangle,fg: '#9C2E2E',   bg: 'rgba(217,75,75,0.10)',  border: 'rgba(217,75,75,0.40)' },
];

export function SendReminderModal({
  visible, clinicId, clinicName, totalDue, overdueCount, invoiceId, invoiceNo, onClose, onSent,
}: Props) {
  const [severity, setSeverity] = useState<ReminderSeverity>('warning');
  const [message,  setMessage]  = useState('');
  const [sending,  setSending]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState<{ recipients?: number } | null>(null);
  const [last,     setLast]     = useState<LastReminderRow | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSeverity(overdueCount && overdueCount > 0 ? 'urgent' : 'warning');
    setMessage(''); setError(null); setSuccess(null);
    fetchLastReminder(clinicId).then(setLast).catch(() => {});
  }, [visible, clinicId, overdueCount]);

  const handleSend = async () => {
    setSending(true); setError(null);
    try {
      await sendPaymentReminder({
        clinicId,
        invoiceId: invoiceId ?? null,
        message: message.trim() || null,
        severity,
      });
      setSuccess({});
      setTimeout(() => { onSent?.(); onClose(); }, 1300);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally { setSending(false); }
  };

  const cur = SEVERITY_OPTS.find(s => s.key === severity)!;
  const recentReminder = last && (() => {
    const d = new Date(last.sent_at);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return days < 7 ? days : null;
  })();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', alignItems: 'center', justifyContent: 'center', padding: 16, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 520, maxHeight: '92%',
            backgroundColor: '#FFF', borderRadius: 22, overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 24px 60px rgba(0,0,0,0.30)' } as any : { elevation: 24 }),
          }}
        >
          {/* Header */}
          <View style={{
            paddingHorizontal: 22, paddingTop: 20, paddingBottom: 16,
            borderBottomWidth: 1, borderBottomColor: DS.ink[100],
            flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
          }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Bell size={11} color={DS.ink[500]} />
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500] }}>
                  Ödeme Hatırlatması
                </Text>
              </View>
              <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5, marginTop: 4 }} numberOfLines={1}>
                {clinicName}
              </Text>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>
                {invoiceNo
                  ? `Fatura ${invoiceNo} için bildirim`
                  : 'Tüm açık fatura ve bakiyeler için bildirim'}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <X size={20} color={DS.ink[500]} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 22, paddingVertical: 18, gap: 14 }}
            showsVerticalScrollIndicator={false}
          >
            {success ? (
              <View style={{
                padding: 24, alignItems: 'center', gap: 8,
                backgroundColor: 'rgba(45,154,107,0.08)', borderRadius: 16,
                borderWidth: 1, borderColor: 'rgba(45,154,107,0.25)',
              }}>
                <CheckCircle2 size={36} color="#1F6B47" />
                <Text style={{ ...DISPLAY, fontSize: 20, color: DS.ink[900], letterSpacing: -0.3 }}>
                  Hatırlatma gönderildi
                </Text>
                <Text style={{ fontSize: 12, color: DS.ink[500], textAlign: 'center', maxWidth: 320 }}>
                  Klinik kullanıcıları bildirim aldı.
                </Text>
              </View>
            ) : (
              <>
                {/* Snapshot bar */}
                {(totalDue !== undefined || overdueCount !== undefined) && (
                  <View style={{
                    padding: 14, borderRadius: 14,
                    backgroundColor: cur.bg, borderWidth: 1, borderColor: cur.border,
                    flexDirection: 'row', alignItems: 'center', gap: 14,
                  }}>
                    <cur.icon size={22} color={cur.fg} strokeWidth={2} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: cur.fg }}>
                        Açık Borç
                      </Text>
                      <Text style={{ ...DISPLAY, fontSize: 22, color: cur.fg, letterSpacing: -0.5 }}>
                        {TRY(totalDue ?? 0)}
                      </Text>
                    </View>
                    {(overdueCount ?? 0) > 0 && (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ ...DISPLAY, fontSize: 18, color: cur.fg, letterSpacing: -0.3 }}>
                          {overdueCount}
                        </Text>
                        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: cur.fg, marginTop: 2 }}>
                          Vadesi Geçen
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Son hatırlatma uyarısı (7 gün içindeki) */}
                {recentReminder !== null && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    padding: 10, borderRadius: 10,
                    backgroundColor: 'rgba(232,155,42,0.10)', borderWidth: 1, borderColor: 'rgba(232,155,42,0.30)',
                  }}>
                    <AlertCircle size={14} color="#9C5E0E" />
                    <Text style={{ flex: 1, fontSize: 11, color: '#9C5E0E' }}>
                      Bu kliniğe son hatırlatma {recentReminder === 0 ? 'bugün' : `${recentReminder} gün önce`} gönderilmiş.
                    </Text>
                  </View>
                )}

                {/* Öncelik seçimi */}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>
                    Öncelik
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {SEVERITY_OPTS.map(opt => {
                      const Icon = opt.icon;
                      const active = severity === opt.key;
                      return (
                        <Pressable
                          key={opt.key}
                          onPress={() => setSeverity(opt.key)}
                          style={{
                            flexGrow: 1, flexBasis: 130, minWidth: 120,
                            padding: 12, borderRadius: 12,
                            borderWidth: active ? 2 : 1,
                            borderColor: active ? opt.fg : DS.ink[200],
                            backgroundColor: active ? opt.bg : '#FFF',
                            gap: 4,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Icon size={14} color={active ? opt.fg : DS.ink[500]} strokeWidth={2} />
                            <Text style={{ fontSize: 12, fontWeight: '700', color: active ? opt.fg : DS.ink[700] }}>
                              {opt.label}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 10, color: active ? opt.fg : DS.ink[500] }}>
                            {opt.desc}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* Mesaj */}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500] }}>
                    Özel Mesaj (opsiyonel)
                  </Text>
                  <TextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Ör: Bu hafta içinde ödemenizi rica ederiz."
                    placeholderTextColor={DS.ink[300]}
                    multiline
                    maxLength={300}
                    style={{
                      borderWidth: 1, borderColor: DS.ink[200], borderRadius: 10,
                      paddingHorizontal: 12, paddingVertical: 10,
                      fontSize: 13, color: DS.ink[900], minHeight: 80,
                      textAlignVertical: 'top',
                      backgroundColor: '#FFF',
                      outlineStyle: 'none' as any,
                    }}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 10, color: DS.ink[400] }}>
                      Klinik kullanıcılarına bildirim olarak iletilir
                    </Text>
                    <Text style={{ fontSize: 10, color: DS.ink[400] }}>
                      {message.length}/300
                    </Text>
                  </View>
                </View>

                {/* Error */}
                {error && (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    padding: 10, borderRadius: 10,
                    backgroundColor: 'rgba(217,75,75,0.08)', borderWidth: 1, borderColor: 'rgba(217,75,75,0.25)',
                  }}>
                    <AlertCircle size={14} color="#9C2E2E" />
                    <Text style={{ flex: 1, fontSize: 12, color: '#9C2E2E' }}>{error}</Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {!success && (
            <View style={{
              paddingHorizontal: 22, paddingVertical: 14,
              borderTopWidth: 1, borderTopColor: DS.ink[100],
              flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
            }}>
              <PillButton variant="ghost" onPress={onClose}>Vazgeç</PillButton>
              <PillButton
                variant="dark"
                disabled={sending}
                onPress={handleSend}
                leftIcon={
                  sending
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Send size={13} color="#FFF" />
                }
              >
                {sending ? 'Gönderiliyor…' : 'Hatırlatma Gönder'}
              </PillButton>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
