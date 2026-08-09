/**
 * WhatsAppSupportScreen — kenar çubuğu > WhatsApp Destek
 * ────────────────────────────────────────────────────
 * BOT VARSAYILAN OLARAK KAPALI. Gelen her WhatsApp mesajı buraya düşer ve bir
 * insan yanıtlar; Simanty yalnız müşteri açıkça isterse ("sipariş", "nexadent",
 * "simanty"… — webhook'taki BOT_WAKE_WORDS) ya da lab "Bot'a devret" derse
 * devreye girer. Devredilen sohbet 12 saat sessizlikte tekrar kapanır.
 *
 * İki liste:
 *   • mode='human' → insanın yürüttüğü / bekleyen sohbetler (varsayılan)
 *   • mode='bot'   → Simanty'ye devredilmiş sohbetler
 * `context.human_lab = true` → devri lab başlattı (Siman'dan yazdı).
 *
 * WhatsApp'ta "/bot" yazma kısayolu KODDA VAR ama bu hatta ÇALIŞMAZ ve
 * kullanıcıya vaat EDİLMEZ: numara `platform_type = CLOUD_API`, Coexistence
 * kapalı ve Meta'da açma seçeneği sunulmuyor (WhatsApp Yöneticisi'ndeki dişli
 * yalnız profil ayarlarını açıyor — bakıldı). Echo hiç gelmediği için o mesaj
 * sisteme ulaşmıyor. Kod, Coexistence ileride mümkün olursa diye duruyor.
 *
 * whatsapp_sessions RLS: lab manager/admin SELECT+UPDATE (migration 20260728160000).
 */
import React, { useContext, useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MessageCircle, PhoneCall, CheckCircle2, RefreshCw, Bot } from 'lucide-react-native';

import { WhatsAppChatModal, type ChatPeer } from '../components/WhatsAppChatModal';

import { HubContext } from '../../../core/ui/HubContext';
import { WhatsAppGlyph } from '../../../core/ui/WhatsAppGlyph';
import { toast } from '../../../core/ui/Toast';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { useAuthStore } from '../../../core/store/authStore';
import { supabase } from '../../../core/api/supabase';

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

interface SupportSession {
  id: string;
  sender_phone: string;
  mode: string;
  human_since: string | null;
  last_msg_at: string;
  /** context.human_lab = true → devri lab başlattı (elle yazdı), müşteri değil. */
  context: { human_lab?: boolean } | null;
}

/** Webhook'taki emniyet süresiyle aynı — bu süreyi geçen oturum bitmiş sayılır. */
const HUMAN_IDLE_MS = 12 * 60 * 60 * 1000;

interface Props { accentColor?: string }

function relTime(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return 'az önce';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'az önce';
  if (min < 60) return `${min} dk önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa önce`;
  const d = Math.floor(hr / 24);
  return `${d} gün önce`;
}

function fmtPhone(p: string): string {
  const d = String(p).replace(/[^\d]/g, '');
  return d ? `+${d}` : p;
}

export function WhatsAppSupportScreen({ accentColor = '#F5C24B' }: Props) {
  const isEmbedded = useContext(HubContext);
  const safeEdges = isEmbedded ? ([] as any) : (['top'] as any);

  const { profile } = useAuthStore();
  const labId = (profile as any)?.lab_id ?? profile?.id ?? null;

  const [items, setItems] = useState<SupportSession[]>([]);
  const [botItems, setBotItems] = useState<SupportSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [chatPeer, setChatPeer] = useState<ChatPeer | null>(null);
  /** peer_phone → son mesaj (metin + yön + zaman). Operatörün ilk baktığı bilgi
   *  telefon numarası değil, "ne yazmış" — o yüzden listede öne çıkar. */
  const [lastMsg, setLastMsg] = useState<Record<string, { body: string; inbound: boolean; at: string }>>({});
  /** Bugünün özet metrikleri — whatsapp_messages üzerinden hesaplanır. */
  const [kpi, setKpi] = useState<{ today: number; avgReplyMin: number | null }>({ today: 0, avgReplyMin: null });
  const [filter, setFilter] = useState<'all' | 'waiting' | 'bot' | 'human'>('all');
  const [query, setQuery] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);

  const load = useCallback(async () => {
    if (!labId) return;
    setLoading(true);
    // 12 saati geçen oturumlar webhook tarafında bir sonraki mesajda bot'a
    // döner; kullanıcıya "aktif" göstermemek için burada da elenir.
    const cutoff = new Date(Date.now() - HUMAN_IDLE_MS).toISOString();
    const [{ data: human }, { data: bots }] = await Promise.all([
      supabase
        .from('whatsapp_sessions')
        .select('id,sender_phone,mode,human_since,last_msg_at,context')
        .eq('lab_id', labId)
        .eq('mode', 'human')
        .gte('last_msg_at', cutoff)
        .order('last_msg_at', { ascending: false }),
      // Bot modundaki son sohbetler — buradan yazıp devralmak için.
      supabase
        .from('whatsapp_sessions')
        .select('id,sender_phone,mode,human_since,last_msg_at,context')
        .eq('lab_id', labId)
        .eq('mode', 'bot')
        .order('last_msg_at', { ascending: false })
        .limit(20),
    ]);
    setItems((human ?? []) as SupportSession[]);
    setBotItems((bots ?? []) as SupportSession[]);

    // ── Son mesajlar + günün metrikleri ──────────────────────────────────
    // Oturum tablosunda mesaj METNİ yok (context yalnız bayrak tutuyor);
    // metin whatsapp_messages'ta. Görünen numaralar için son satırı çekeriz.
    const phones = Array.from(new Set([
      ...((human ?? []) as SupportSession[]).map(r => r.sender_phone),
      ...((bots ?? []) as SupportSession[]).map(r => r.sender_phone),
    ].filter(Boolean)));

    if (phones.length > 0) {
      const { data: msgs } = await supabase
        .from('whatsapp_messages')
        .select('peer_phone, direction, body, created_at')
        .eq('lab_id', labId)
        .in('peer_phone', phones)
        .order('created_at', { ascending: false })
        .limit(400);
      const map: Record<string, { body: string; inbound: boolean; at: string }> = {};
      for (const m of (msgs ?? []) as any[]) {
        if (map[m.peer_phone]) continue;          // sıralı geldiği için ilki en yenisi
        map[m.peer_phone] = {
          body: String(m.body ?? '').trim(),
          inbound: m.direction === 'in' || m.direction === 'inbound',
          at: m.created_at,
        };
      }
      setLastMsg(map);
    } else {
      setLastMsg({});
    }

    // Bugün kaç farklı kişiyle konuşuldu + ortalama yanıt süresi.
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const { data: todayMsgs } = await supabase
      .from('whatsapp_messages')
      .select('peer_phone, direction, created_at')
      .eq('lab_id', labId)
      .gte('created_at', dayStart.toISOString())
      .order('created_at', { ascending: true });
    const rows = (todayMsgs ?? []) as any[];
    const todayCount = new Set(rows.map(r => r.peer_phone)).size;
    // Yanıt süresi: gelen mesajı izleyen ilk giden mesaja kadar geçen süre.
    const waiting: Record<string, number> = {};
    const deltas: number[] = [];
    for (const r of rows) {
      const inbound = r.direction === 'in' || r.direction === 'inbound';
      const t = new Date(r.created_at).getTime();
      if (inbound) { if (waiting[r.peer_phone] == null) waiting[r.peer_phone] = t; }
      else if (waiting[r.peer_phone] != null) { deltas.push(t - waiting[r.peer_phone]); delete waiting[r.peer_phone]; }
    }
    setKpi({
      today: todayCount,
      avgReplyMin: deltas.length > 0
        ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length / 60000)
        : null,
    });
    setLoading(false);
  }, [labId]);

  useEffect(() => { load(); }, [load]);

  // Realtime — yeni destek talebi veya kapanış anında yansısın.
  useEffect(() => {
    if (!labId) return;
    const ch = supabase
      .channel(`wa-support-${labId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_sessions', filter: `lab_id=eq.${labId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [labId, load]);

  const endChat = (row: SupportSession) => {
    setConfirm({
      title: 'Bot\'a devret',
      highlight: fmtPhone(row.sender_phone),
      message: 'için sohbet Simanty\'ye devredilecek. Müşterinin sonraki mesajını bot karşılar; 12 saat sessizlikte tekrar kapanır.',
      label: 'Evet, devret',
      variant: 'info',
      onConfirm: async () => {
        setConfirm(null);
        setBusyId(row.id);
        // context da sıfırlanır: human_lab bayrağı kalırsa sohbet bir sonraki
        // devirde yanlışlıkla "lab başlattı" olarak etiketlenir.
        const { error } = await supabase
          .from('whatsapp_sessions')
          .update({ mode: 'bot', flow: null, step: null, context: {}, human_since: null, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        setBusyId(null);
        if (error) toast.error('Devredilemedi');
        else { toast.success('Sohbet Simanty\'ye devredildi'); load(); }
      },
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={safeEdges}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}>

        {/* Başlık satırı */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '22' }}>
              {/* Marka işareti — hangi kanalın gelen kutusu olduğu başlıktan anlaşılsın */}
              <WhatsAppGlyph size={17} color={accentColor} />
            </View>
            <View>
              <Text style={{ ...DISPLAY, fontSize: 18, color: '#0A0A0A' }}>Destek Sohbetleri</Text>
              <Text style={{ fontSize: 12, color: '#6B6B6B' }}>
                {items.length > 0 ? `${items.length} sohbet sizi bekliyor` : 'WhatsApp gelen kutusu'}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={load}
            style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EAEAEA' }}
            {...(Platform.OS === 'web' ? { className: 'web:cursor-pointer web:hover:bg-slate-50' } as any : {})}
          >
            <RefreshCw size={16} color="#6B6B6B" strokeWidth={1.8} />
          </Pressable>
        </View>

        {/* Bilgi notu */}
        <View style={{ backgroundColor: accentColor + '14', borderRadius: 12, padding: 12 }}>
          <Text style={{ fontSize: 12.5, color: '#2C2C2C', lineHeight: 18 }}>
            Simanty <Text style={{ fontWeight: '700' }}>varsayılan olarak kapalı</Text> — gelen mesajlara
            kendiliğinden cevap vermez, buraya düşer. Sohbete tıklayıp yanıtlayın.
            Müşteri <Text style={{ fontWeight: '700' }}>"sipariş"</Text>, "nexadent" ya da "simanty" yazarsa
            bot devreye girer; siz de <Text style={{ fontWeight: '700' }}>"Bot'a devret"</Text> ile
            elle devredebilirsiniz. Devredilen sohbet 12 saat sessizlikte tekrar kapanır.
          </Text>
        </View>

        {loading && items.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={accentColor} />
          </View>
        ) : items.length === 0 ? (
          <View style={{ paddingVertical: 48, alignItems: 'center', gap: 10 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F5F5' }}>
              <CheckCircle2 size={26} color="#9A9A9A" strokeWidth={1.6} />
            </View>
            <Text style={{ ...DISPLAY, fontSize: 16, color: '#2C2C2C' }}>Bekleyen sohbet yok</Text>
            <Text style={{ fontSize: 12.5, color: '#9A9A9A', textAlign: 'center', maxWidth: 280 }}>
              WhatsApp hattınıza bir mesaj geldiğinde burada görünür.
              Simanty kapalı olduğu için mesajlara siz yanıt verirsiniz.
            </Text>
          </View>
        ) : (
          items.map((row) => (
            <Pressable
              key={row.id}
              onPress={() => setChatPeer({ phone: row.sender_phone, isHuman: true })}
              style={{
                backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14,
                borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
                shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
                flexDirection: 'row', alignItems: 'center', gap: 12,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '1A' }}>
                <PhoneCall size={18} color={accentColor} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#0A0A0A' }}>{fmtPhone(row.sender_phone)}</Text>
                  {/* Devri kim başlattı — lab elle yazdıysa "destek talebi" demek yanlış olur */}
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9999, backgroundColor: row.context?.human_lab ? '#EEF2FF' : '#FEF3C7' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: row.context?.human_lab ? '#4338CA' : '#92400E' }}>
                      {row.context?.human_lab ? 'SİZ YAZDINIZ' : 'DESTEK İSTEDİ'}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: '#6B6B6B', marginTop: 3 }}>
                  Başladı: {relTime(row.human_since)} · Son mesaj: {relTime(row.last_msg_at)}
                </Text>
              </View>
              <Pressable
                onPress={() => endChat(row)}
                disabled={busyId === row.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                  backgroundColor: '#2D9A6B', opacity: busyId === row.id ? 0.6 : 1,
                }}
                {...(Platform.OS === 'web' ? { className: 'web:cursor-pointer' } as any : {})}
              >
                {busyId === row.id
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <CheckCircle2 size={15} color="#fff" strokeWidth={2} />}
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Bot'a devret</Text>
              </Pressable>
            </Pressable>
          ))
        )}

        {/* ── Botun yürüttüğü sohbetler ────────────────────────────────────
            Buraya tıklayıp yazınca oturum insana geçer ve bot susar. Bu liste
            olmadan "önce biz yazalım" senaryosu mümkün değildi: yazma ekranına
            ancak müşteri destek isteyince ulaşılabiliyordu. */}
        {botItems.length > 0 && (
          <>
            <Text style={{ ...DISPLAY, fontSize: 14, color: '#6B6B6B', marginTop: 18, marginBottom: 2 }}>
              Botun yürüttüğü sohbetler
            </Text>
            {botItems.map((row) => (
              <Pressable
                key={row.id}
                onPress={() => setChatPeer({ phone: row.sender_phone, isHuman: false })}
                style={{
                  backgroundColor: '#FFFFFF', borderRadius: 14, padding: 13,
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' }}>
                  <Bot size={16} color="#4338CA" strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#0A0A0A' }}>{fmtPhone(row.sender_phone)}</Text>
                  <Text style={{ fontSize: 11.5, color: '#9A9A9A', marginTop: 2 }}>
                    Son mesaj: {relTime(row.last_msg_at)} · Simanty yanıtlıyor
                  </Text>
                </View>
                <MessageCircle size={16} color="#9A9A9A" strokeWidth={1.8} />
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      <WhatsAppChatModal
        peer={chatPeer}
        labId={labId}
        accentColor={accentColor}
        onClose={() => setChatPeer(null)}
        onSent={load}
      />

      {confirm && <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />}
    </SafeAreaView>
  );
}
