/**
 * PaymentReminderModal — Vade geçen fatura için hatırlatma gönderme modalı
 *
 *  • Ton seçimi (Nazik / Standart / Sert)
 *  • Kanal seçimi (in-app / e-posta / sms / whatsapp — sonradan e-posta/sms backend'e bağlanacak)
 *  • Mesajı önizler (server-side RPC kanonik render eder; UI sadece preview için)
 *  • Geçmiş hatırlatma sayısını gösterir
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator,
} from 'react-native';
import { AppIcon } from '../../../core/ui/AppIcon';
import { Shadows, CardSpec } from '../../../core/theme/shadows';
import { toast } from '../../../core/ui/Toast';
import {
  sendPaymentReminder, fetchTemplates, fetchReminders, renderTemplate,
  TONE_LABELS, CHANNEL_LABELS,
  type ReminderTone, type ReminderChannel, type ReminderTemplate, type PaymentReminder,
} from '../reminders';
import type { Invoice } from '../types';

interface Props {
  visible: boolean;
  invoice: Invoice | null;
  clinicName?: string;
  onClose: () => void;
  onSent?: () => void;
}

function fmtMoney(n: number): string {
  return '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PaymentReminderModal({ visible, invoice, clinicName, onClose, onSent }: Props) {
  const [tone, setTone]         = useState<ReminderTone>('standard');
  const [channel, setChannel]   = useState<ReminderChannel>('in_app');
  const [templates, setTemplates] = useState<ReminderTemplate[]>([]);
  const [history, setHistory]   = useState<PaymentReminder[]>([]);
  const [recipient, setRecipient] = useState('');
  const [sending, setSending]   = useState(false);

  useEffect(() => {
    if (!visible || !invoice) return;
    Promise.all([fetchTemplates(), fetchReminders(invoice.id)]).then(([t, h]) => {
      setTemplates((t.data ?? []) as ReminderTemplate[]);
      setHistory((h.data ?? []) as PaymentReminder[]);
    });
  }, [visible, invoice]);

  const selectedTemplate = useMemo(
    () => templates.find(t => t.tone === tone && t.is_default) ?? templates.find(t => t.tone === tone),
    [templates, tone],
  );

  const balance = invoice ? Number(invoice.total) - Number(invoice.paid_amount) : 0;
  const daysOverdue = useMemo(() => {
    if (!invoice?.due_date) return 0;
    const due = new Date(invoice.due_date + 'T00:00:00');
    const today = new Date();
    return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
  }, [invoice]);

  const preview = useMemo(() => {
    if (!selectedTemplate || !invoice) return '';
    return renderTemplate(selectedTemplate.body, {
      clinic_name:    clinicName ?? 'Müşterimiz',
      invoice_number: invoice.invoice_number,
      amount:         fmtMoney(balance),
      days_overdue:   daysOverdue,
      due_date:       invoice.due_date
        ? new Date(invoice.due_date + 'T00:00:00').toLocaleDateString('tr-TR')
        : '—',
    });
  }, [selectedTemplate, invoice, clinicName, balance, daysOverdue]);

  if (!invoice) return null;

  const handleSend = async () => {
    setSending(true);
    const { error } = await sendPaymentReminder({
      invoice_id: invoice.id,
      tone,
      channel,
      template_id: selectedTemplate?.id,
      recipient: recipient.trim() || undefined,
    });
    setSending(false);
    if (error) {
      toast.error((error as any).message ?? 'Hatırlatma gönderilemedi');
      return;
    }
    toast.success(channel === 'in_app' ? 'Hatırlatma gönderildi' : 'Hatırlatma sıraya alındı');
    onSent?.();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Tahsilat Hatırlatması</Text>
              <Text style={s.subtitle}>
                {invoice.invoice_number} · {fmtMoney(balance)}
                {daysOverdue > 0 ? ` · ${daysOverdue} gün gecikmiş` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <AppIcon name="close" size={18} color="#475569" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            {/* Ton seçimi */}
            <View>
              <Text style={s.label}>Ton</Text>
              <View style={s.row}>
                {(['gentle','standard','firm'] as ReminderTone[]).map(t => {
                  const cfg = TONE_LABELS[t];
                  const active = tone === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[s.toneChip, active && { borderColor: cfg.color, backgroundColor: cfg.color + '15' }]}
                      onPress={() => setTone(t)}
                    >
                      <AppIcon name={cfg.icon as any} size={14} color={active ? cfg.color : '#64748B'} />
                      <Text style={[s.toneText, active && { color: cfg.color, fontWeight: '700' }]}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Kanal seçimi */}
            <View>
              <Text style={s.label}>Kanal</Text>
              <View style={s.row}>
                {(['in_app','email','sms','whatsapp'] as ReminderChannel[]).map(c => {
                  const cfg = CHANNEL_LABELS[c];
                  const active = channel === c;
                  const disabled = c !== 'in_app'; // Gelecek aşama
                  return (
                    <TouchableOpacity
                      key={c}
                      disabled={disabled}
                      style={[s.chanChip, active && s.chanChipActive, disabled && { opacity: 0.4 }]}
                      onPress={() => setChannel(c)}
                    >
                      <AppIcon name={cfg.icon as any} size={13} color={active ? '#2563EB' : '#64748B'} />
                      <Text style={[s.chanText, active && { color: '#2563EB', fontWeight: '700' }]}>{cfg.label}</Text>
                      {disabled && <Text style={s.soonBadge}>yakında</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Recipient (e-posta/sms) */}
            {channel !== 'in_app' && (
              <View>
                <Text style={s.label}>Alıcı</Text>
                <TextInput
                  value={recipient}
                  onChangeText={setRecipient}
                  placeholder={channel === 'email' ? 'ornek@klinik.com' : '+90...'}
                  placeholderTextColor="#94A3B8"
                  style={s.input}
                  keyboardType={channel === 'email' ? 'email-address' : 'phone-pad'}
                  autoCapitalize="none"
                />
              </View>
            )}

            {/* Önizleme */}
            <View>
              <Text style={s.label}>Önizleme</Text>
              <View style={s.preview}>
                {selectedTemplate?.subject && (
                  <Text style={s.previewSubject}>
                    {renderTemplate(selectedTemplate.subject, {
                      clinic_name: clinicName ?? 'Müşterimiz',
                      invoice_number: invoice.invoice_number,
                      amount: fmtMoney(balance),
                      days_overdue: daysOverdue,
                      due_date: invoice.due_date ? new Date(invoice.due_date + 'T00:00:00').toLocaleDateString('tr-TR') : '—',
                    })}
                  </Text>
                )}
                <Text style={s.previewBody}>{preview || 'Şablon yükleniyor...'}</Text>
              </View>
            </View>

            {/* Geçmiş */}
            {history.length > 0 && (
              <View>
                <Text style={s.label}>
                  Bu fatura için {history.length} hatırlatma gönderildi
                </Text>
                <View style={s.historyList}>
                  {history.slice(0, 3).map(h => (
                    <View key={h.id} style={s.historyRow}>
                      <View style={[s.historyDot, { backgroundColor: TONE_LABELS[h.tone].color }]} />
                      <Text style={s.historyText}>
                        {TONE_LABELS[h.tone].label} · {CHANNEL_LABELS[h.channel].label}
                      </Text>
                      <Text style={s.historyDate}>
                        {new Date(h.sent_at).toLocaleDateString('tr-TR')}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={s.footer}>
            <TouchableOpacity onPress={onClose} style={s.cancelBtn}>
              <Text style={s.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={sending}
              onPress={handleSend}
              style={[s.sendBtn, sending && { opacity: 0.6 }]}
            >
              {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <AppIcon name="send" size={14} color="#FFFFFF" />}
              <Text style={s.sendText}>{sending ? 'Gönderiliyor...' : 'Hatırlatma Gönder'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet: {
    width: '100%', maxWidth: 540, maxHeight: '92%',
    backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius,
    borderWidth: 1, borderColor: CardSpec.border, overflow: 'hidden',
    ...Shadows.card,
  } as any,
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 10 },
  title: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.2 },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },

  label: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  row:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  toneChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  toneText: { fontSize: 13, color: '#64748B', fontWeight: '600' },

  chanChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  chanChipActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  chanText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  soonBadge: { fontSize: 9, color: '#94A3B8', backgroundColor: '#F1F5F9', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, fontWeight: '700' },

  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF' },

  preview: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  previewSubject: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  previewBody:    { fontSize: 13, color: '#334155', lineHeight: 20 },

  historyList: { gap: 6 },
  historyRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  historyDot:  { width: 8, height: 8, borderRadius: 4 },
  historyText: { flex: 1, fontSize: 12, color: '#475569', fontWeight: '500' },
  historyDate: { fontSize: 11, color: '#94A3B8' },

  footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cancelBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  sendBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 10, backgroundColor: '#2563EB' },
  sendText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
