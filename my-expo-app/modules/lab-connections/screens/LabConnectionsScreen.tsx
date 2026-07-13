/**
 * LabConnectionsScreen — Lab paneli: kliniklerle bağlantı yönetimi.
 * • Davet kodu üret (tek kullanımlık) + kalıcı public katılım kodu + auto-approve
 * • Bekleyen bağlanma isteklerini onayla / reddet
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Link2, Copy, Check, X, Clock, ToggleLeft, ToggleRight, Ticket, Building2 } from 'lucide-react-native';
import { ResponsiveCanvas } from '../../../core/layout/ResponsiveCanvas';
import {
  labCreateInvite, labPublicCode, labSetAutoApprove, labApproveClinic, labRejectClinic,
  labPendingRequests, type PendingRequest,
} from '../api';
import { supabase } from '../../../core/api/supabase';

const INK = '#0F172A', INK2 = '#475569', INK3 = '#94A3B8', LINE = '#E5E7EB';
const GREEN = '#059669', RED = '#DC2626', AMBER = '#D97706', ACCENT = '#2563EB';

function copy(text: string) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).clipboard) {
    (navigator as any).clipboard.writeText(text).catch(() => {});
  }
}

export function LabConnectionsScreen() {
  const [invite, setInvite] = useState<string | null>(null);
  const [publicCode, setPublicCode] = useState<string | null>(null);
  const [autoApprove, setAutoApprove] = useState<boolean>(false);
  const [pending, setPending] = useState<PendingRequest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    try { setPending(await labPendingRequests()); } catch { setPending([]); }
  }, []);

  useEffect(() => {
    loadPending();
    // mevcut public kod + auto-approve durumu
    (async () => {
      try { setPublicCode(await labPublicCode()); } catch {}
      try {
        const { data } = await supabase.from('labs').select('clinic_auto_approve').limit(1).maybeSingle();
        setAutoApprove(!!(data as any)?.clinic_auto_approve);
      } catch {}
    })();
  }, [loadPending]);

  const genInvite = async () => { setBusy('invite'); try { setInvite(await labCreateInvite()); } catch {} finally { setBusy(null); } };
  const toggleAuto = async () => {
    const next = !autoApprove; setAutoApprove(next); setBusy('auto');
    try { await labSetAutoApprove(next); } catch { setAutoApprove(!next); } finally { setBusy(null); }
  };
  const act = async (id: string, fn: () => Promise<void>) => {
    setBusy(id); try { await fn(); await loadPending(); } finally { setBusy(null); }
  };

  return (
    <ResponsiveCanvas size="md">
      <ScrollView contentContainerStyle={{ paddingBottom: 64 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Link2 size={22} color={INK} strokeWidth={1.8} />
          <Text style={{ fontSize: 22, fontWeight: '700', color: INK, letterSpacing: -0.4 }}>Klinik Bağlantıları</Text>
        </View>
        <Text style={{ color: INK2, fontSize: 13.5, marginBottom: 20, lineHeight: 19 }}>
          Kliniklerle bağlan: davet kodu paylaş ya da public katılım kodunu kullan. Klinik tek hesapla birden çok lab'la çalışabilir.
        </Text>

        {/* Davet et */}
        <Card>
          <SectionTitle icon={Ticket}>Klinik davet et</SectionTitle>
          <Text style={{ color: INK2, fontSize: 13, marginBottom: 14 }}>Tek kullanımlık kod üret ve kliniğe ilet. Klinik kodu girince anında bağlanır (onay gerekmez).</Text>
          {invite ? (
            <CodeBox code={invite} onCopy={() => copy(invite)} tone={ACCENT} caption="7 gün geçerli · tek kullanımlık" />
          ) : null}
          <Pressable onPress={genInvite} disabled={busy === 'invite'}
            style={{ alignSelf: 'flex-start', marginTop: invite ? 12 : 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, backgroundColor: INK, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
            {busy === 'invite' ? <ActivityIndicator size="small" color="#fff" /> : <Ticket size={16} color="#fff" strokeWidth={2} />}
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{invite ? 'Yeni davet kodu' : 'Davet kodu oluştur'}</Text>
          </Pressable>
        </Card>

        {/* Public kod + auto-approve */}
        <Card>
          <SectionTitle icon={Building2}>Public katılım kodu</SectionTitle>
          <Text style={{ color: INK2, fontSize: 13, marginBottom: 14 }}>Sabit kod; birden çok klinik kullanabilir. Otomatik onay kapalıysa istekler aşağıda onayına düşer.</Text>
          {publicCode ? <CodeBox code={publicCode} onCopy={() => copy(publicCode)} tone={INK} caption="Kalıcı · çok kullanımlık" /> : <ActivityIndicator size="small" color={INK3} />}
          <Pressable onPress={toggleAuto} disabled={busy === 'auto'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
            {autoApprove ? <ToggleRight size={30} color={GREEN} strokeWidth={1.8} /> : <ToggleLeft size={30} color={INK3} strokeWidth={1.8} />}
            <View style={{ flex: 1 }}>
              <Text style={{ color: INK, fontSize: 14, fontWeight: '600' }}>Otomatik onay</Text>
              <Text style={{ color: INK3, fontSize: 12 }}>Açıkken public kodla gelen klinikler anında bağlanır.</Text>
            </View>
          </Pressable>
        </Card>

        {/* Bekleyen istekler */}
        <Card>
          <SectionTitle icon={Clock}>Bekleyen istekler{pending && pending.length > 0 ? ` (${pending.length})` : ''}</SectionTitle>
          {pending === null ? (
            <ActivityIndicator size="small" color={INK3} />
          ) : pending.length === 0 ? (
            <Text style={{ color: INK3, fontSize: 13 }}>Bekleyen bağlanma isteği yok.</Text>
          ) : (
            <View style={{ gap: 2 }}>
              {pending.map((r, i) => (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: LINE }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: AMBER }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: INK, fontSize: 14, fontWeight: '600' }}>{r.clinic_name || 'Klinik'}</Text>
                    <Text style={{ color: INK3, fontSize: 12 }}>{new Date(r.requested_at).toLocaleDateString()} · kod ile istek</Text>
                  </View>
                  <Pressable disabled={!!busy} onPress={() => act(r.id, () => labApproveClinic(r.id))}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: GREEN, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                    <Check size={14} color="#fff" strokeWidth={2.2} /><Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>Onayla</Text>
                  </Pressable>
                  <Pressable disabled={!!busy} onPress={() => act(r.id, () => labRejectClinic(r.id))}
                    style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(220,38,38,0.10)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                    <X size={16} color={RED} strokeWidth={2.2} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </ResponsiveCanvas>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: LINE, padding: 18, marginBottom: 16, ...(Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(15,23,42,0.05), 0 8px 24px rgba(15,23,42,0.05)' } as any : {}) }}>
      {children}
    </View>
  );
}
function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <Icon size={16} color={INK2} strokeWidth={1.9} />
      <Text style={{ color: INK, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 }}>{children}</Text>
    </View>
  );
}
function CodeBox({ code, onCopy, tone, caption }: { code: string; onCopy: () => void; tone: string; caption?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: LINE, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 } as any}>
        <Text style={{ flex: 1, fontSize: 26, fontWeight: '800', letterSpacing: 6, color: tone, fontFamily: Platform.OS === 'web' ? ('JetBrains Mono, monospace' as any) : undefined }}>{code}</Text>
        <Pressable onPress={() => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: LINE, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
          {copied ? <Check size={14} color={GREEN} strokeWidth={2.2} /> : <Copy size={14} color={INK2} strokeWidth={1.9} />}
          <Text style={{ color: copied ? GREEN : INK2, fontSize: 12.5, fontWeight: '600' }}>{copied ? 'Kopyalandı' : 'Kopyala'}</Text>
        </Pressable>
      </View>
      {caption ? <Text style={{ color: INK3, fontSize: 11.5, marginTop: 6 }}>{caption}</Text> : null}
    </View>
  );
}

export default LabConnectionsScreen;
