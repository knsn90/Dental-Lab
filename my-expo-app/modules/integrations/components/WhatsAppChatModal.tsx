/**
 * WhatsAppChatModal — bir müşteriyle WhatsApp yazışması.
 *
 * NEDEN VAR: iş numarası saf Cloud API hattı (`platform_type = CLOUD_API`).
 * Cloud API'nin gelen kutusu yoktur ve numara WhatsApp Business uygulamasına
 * bağlı değildir — yani lab, müşterinin ne yazdığını okuyabileceği HİÇBİR
 * arayüze sahip değildi. Burası o arayüz.
 *
 * İkinci ve asıl işlevi: buradan yazılan mesaj `whatsapp-send` üzerinden gider
 * ve oturumu 'human' yapar. Böylece "insan yazdı" bilgisi TAHMİN edilmez —
 * tanım gereği kesindir. (Coexistence echo'suna güvenen yol bu hatta hiç
 * çalışmıyordu.)
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Modal, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { X, Send, Bot, User } from 'lucide-react-native';

import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';

export interface ChatPeer {
  phone: string;
  /** Oturum 'human' modda mı — başlıktaki rozet için. */
  isHuman: boolean;
}

interface WaMessage {
  id: string;
  direction: 'in' | 'out';
  body: string | null;
  source: 'customer' | 'bot' | 'human' | 'echo';
  created_at: string;
}

const SOURCE_LABEL: Record<WaMessage['source'], string> = {
  customer: '',
  bot: 'Simanty',
  human: 'Siz',
  echo: 'Telefondan',
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function fmtPhone(p: string): string {
  const d = String(p).replace(/[^\d]/g, '');
  return d ? `+${d}` : p;
}

export function WhatsAppChatModal({
  peer, labId, accentColor = '#F5C24B', onClose, onSent,
}: {
  peer: ChatPeer | null;
  labId: string | null;
  accentColor?: string;
  onClose: () => void;
  /** Mesaj gidince liste tazelensin (oturum 'human' oldu). */
  onSent?: () => void;
}) {
  const [items, setItems] = useState<WaMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const phone = peer?.phone ?? null;

  const load = useCallback(async () => {
    if (!labId || !phone) return;
    setLoading(true);
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('id,direction,body,source,created_at')
      .eq('lab_id', labId)
      .eq('peer_phone', phone)
      .order('created_at', { ascending: false })
      .limit(100);
    // Sorgu son 100'ü almak için DESC; ekranda eskiden yeniye gösterilir.
    setItems(((data ?? []) as WaMessage[]).slice().reverse());
    setLoading(false);
  }, [labId, phone]);

  useEffect(() => { if (phone) load(); }, [phone, load]);

  // Canlı akış — müşteri yazdığında ya da bot cevapladığında anında düşsün.
  useEffect(() => {
    if (!labId || !phone) return;
    const ch = supabase
      .channel(`wa-chat-${labId}-${phone}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `peer_phone=eq.${phone}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [labId, phone, load]);

  useEffect(() => {
    if (items.length) requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, [items.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !phone || sending) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke('whatsapp-send', {
      body: { phone, text },
    });
    setSending(false);

    if (error || !(data as any)?.ok) {
      // 24 saat penceresi WhatsApp'ın kuralı — kullanıcıya sebebini söyle,
      // yoksa "gönderdim ama gitmedi" diye tekrar tekrar dener.
      const code = (data as any)?.error;
      toast.error(
        code === 'window_closed'
          ? 'Müşteri 24 saattir yazmadı — WhatsApp serbest mesaja izin vermiyor.'
          : code === 'not_configured'
            ? 'WhatsApp entegrasyonu tanımlı değil.'
            : 'Mesaj gönderilemedi.',
      );
      return;
    }
    setDraft('');
    load();
    onSent?.();
  };

  if (!peer) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ width: 560, maxWidth: '100%', height: '86%', maxHeight: 720 }}
        >
          <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 18, overflow: 'hidden' }}>

            {/* Başlık */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#0A0A0A' }}>{fmtPhone(peer.phone)}</Text>
                <Text style={{ fontSize: 11.5, color: peer.isHuman ? '#B45309' : '#059669', marginTop: 2 }}>
                  {peer.isHuman ? 'Bot susuyor — sohbeti siz yürütüyorsunuz' : 'Bot aktif — yazarsanız susar'}
                </Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6, borderRadius: 8, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                <X size={18} color="#6B6B6B" />
              </Pressable>
            </View>

            {/* Mesajlar */}
            <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 14, gap: 8 }}>
              {loading && items.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={accentColor} /></View>
              ) : items.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#9A9A9A', fontSize: 12.5, paddingVertical: 40 }}>
                  Bu numarayla henüz kayıtlı yazışma yok.{'\n'}
                  Sohbet geçmişi bu özellik açıldıktan sonraki mesajlardan itibaren tutuluyor.
                </Text>
              ) : items.map((m) => {
                const mine = m.direction === 'out';
                const label = SOURCE_LABEL[m.source];
                return (
                  <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '84%' }}>
                    <View style={{
                      backgroundColor: mine ? (m.source === 'bot' ? '#EEF2FF' : '#DCFCE7') : '#FFFFFF',
                      borderRadius: 14,
                      borderTopRightRadius: mine ? 4 : 14,
                      borderTopLeftRadius: mine ? 14 : 4,
                      paddingHorizontal: 12, paddingVertical: 9,
                      borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
                    }}>
                      {!!label && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                          {m.source === 'bot'
                            ? <Bot size={11} color="#4338CA" strokeWidth={2} />
                            : <User size={11} color="#166534" strokeWidth={2} />}
                          <Text style={{ fontSize: 10, fontWeight: '700', color: m.source === 'bot' ? '#4338CA' : '#166534' }}>{label}</Text>
                        </View>
                      )}
                      <Text style={{ fontSize: 13.5, color: '#111827', lineHeight: 19 }}>{m.body ?? '—'}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2, textAlign: mine ? 'right' : 'left' }}>
                      {fmtTime(m.created_at)}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>

            {/* Yazma alanı */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Mesaj yazın…"
                placeholderTextColor="#9CA3AF"
                multiline
                style={{
                  flex: 1, minHeight: 40, maxHeight: 120,
                  paddingHorizontal: 12, paddingVertical: 10,
                  borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
                  fontSize: 13.5, color: '#111827',
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                }}
              />
              <Pressable
                onPress={send}
                disabled={sending || !draft.trim()}
                style={{
                  width: 42, height: 42, borderRadius: 12,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: draft.trim() ? '#16A34A' : '#E5E7EB',
                  opacity: sending ? 0.6 : 1,
                  ...(Platform.OS === 'web' ? { cursor: draft.trim() ? 'pointer' : 'default' } as any : {}),
                }}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Send size={17} color={draft.trim() ? '#FFFFFF' : '#9CA3AF'} strokeWidth={2} />}
              </Pressable>
            </View>

            <Text style={{ fontSize: 10.5, color: '#9CA3AF', textAlign: 'center', paddingBottom: 10, paddingHorizontal: 16 }}>
              Buradan yazdığınızda bot bu sohbette susar. Bitince listeden "Sohbeti bitir" deyin.
            </Text>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
