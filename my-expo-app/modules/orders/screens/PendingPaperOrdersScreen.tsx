/**
 * PendingPaperOrdersScreen — Klinikten WhatsApp/webhook ile gelmiş kağıt iş emrilerinin inbox'u.
 * Lab kullanıcısı görür, OCR sonuçlarını kontrol eder, "Onayla" ile NewOrder'a geçer,
 * "Reddet" ile arşivler.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, Platform, RefreshControl, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Inbox, MessageCircle, Phone, Camera, Check, X, AlertCircle,
  ChevronRight, Sparkles, Calendar, Building2,
} from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { DS } from '../../../core/theme/dsTokens';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { toast } from '../../../core/ui/Toast';

interface PendingRow {
  id: string;
  lab_id: string;
  source: string;
  sender_phone: string | null;
  sender_name: string | null;
  photo_url: string | null;
  ocr_data: any;
  clinic_id: string | null;
  patient_name: string | null;
  confidence_avg: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'duplicate';
  created_at: string;
}

const SOURCE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: '#25D366' },
  telegram: { label: 'Telegram', icon: MessageCircle, color: '#0088CC' },
  email:    { label: 'E-posta',  icon: MessageCircle, color: '#0F172A' },
  webhook:  { label: 'Webhook',  icon: Sparkles,      color: '#2563EB' },
  manual:   { label: 'Manuel',   icon: Camera,        color: '#7C3AED' },
  courier:  { label: 'Kurye',    icon: Camera,        color: '#0EA5E9' },
};

export function PendingPaperOrdersScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const labId = (profile as any)?.lab_id ?? profile?.id ?? null;

  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clinicMap, setClinicMap] = useState<Record<string, string>>({});

  const load = useCallback(async (silent = false) => {
    if (!labId) return;
    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from('pending_paper_orders')
      .select('*')
      .eq('lab_id', labId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error && data) setRows(data as PendingRow[]);

    // Klinik adlarını çek
    const clinicIds = Array.from(new Set((data ?? []).map((r: any) => r.clinic_id).filter(Boolean)));
    if (clinicIds.length > 0) {
      const { data: clinics } = await supabase
        .from('clinics')
        .select('id, name')
        .in('id', clinicIds);
      const m: Record<string, string> = {};
      (clinics ?? []).forEach((c: any) => { m[c.id] = c.name; });
      setClinicMap(m);
    }
    if (!silent) setLoading(false);
  }, [labId]);

  useEffect(() => { load(); }, [load]);

  // Realtime — yeni gelenler anlık görünsün
  useEffect(() => {
    if (!labId) return;
    const ch = supabase
      .channel(`pending-paper-${labId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'pending_paper_orders',
        filter: `lab_id=eq.${labId}`,
      }, () => load(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [labId, load]);

  const handleApprove = (row: PendingRow) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem('ocr_work_order', JSON.stringify(row.ocr_data));
    } catch { /* ignore */ }
    // Tabloyu approved olarak işaretle (gerçek work_order_id sonra eklenecek — Faz 5)
    supabase
      .from('pending_paper_orders')
      .update({
        status: 'approved',
        reviewed_by: profile?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .then(() => router.push('/(lab)/new-order' as any));
  };

  const handleReject = async (row: PendingRow) => {
    const ok = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.confirm(`Bu kağıt sipariş kaydı reddedilsin mi? "${row.patient_name ?? row.sender_phone ?? 'Bilinmeyen'}"`)
      : true;
    if (!ok) return;
    const { error } = await supabase
      .from('pending_paper_orders')
      .update({
        status: 'rejected',
        reviewed_by: profile?.id ?? null,
        reviewed_at: new Date().toISOString(),
        reject_reason: 'manuel',
      })
      .eq('id', row.id);
    if (error) toast.error('Reddedilemedi: ' + error.message);
    else { toast.success('Reddedildi'); load(); }
  };

  const fmtRelative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return 'az önce';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} dk önce`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} sa önce`;
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
        <ActivityIndicator color={DS.ink[400]} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 14 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }}
        />
      }
    >
      <View>
        <Text style={{ fontFamily: Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui' : 'InterTight_300Light', fontWeight: '300', fontSize: 26, letterSpacing: -0.6, color: DS.ink[900] }}>
          Bekleyen Kağıt Siparişler
        </Text>
        <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 4 }}>
          Kliniklerden WhatsApp / mesajla gelen iş emri taramaları — onaylayıp dijital sisteme aktar.
        </Text>
      </View>

      {rows.length === 0 ? (
        <View style={{
          padding: 40, borderRadius: 16, backgroundColor: '#FFFFFF',
          alignItems: 'center', gap: 10, marginTop: 20,
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
        }}>
          <Inbox size={32} color="#CBD5E1" strokeWidth={1.4} />
          <Text style={{ fontSize: 14, color: DS.ink[500], fontWeight: '600' }}>Bekleyen kağıt sipariş yok</Text>
          <Text style={{ fontSize: 11, color: DS.ink[400], textAlign: 'center', maxWidth: 320, lineHeight: 16 }}>
            Klinikler WhatsApp/webhook ile fotoğraf gönderdiğinde otomatik burada görünür.{'\n'}
            Kanal kurulumu: Ayarlar → Entegrasyonlar.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {rows.map(row => {
            const sourceCfg = SOURCE_LABELS[row.source] ?? SOURCE_LABELS.webhook;
            const SourceIcon = sourceCfg.icon;
            const conf = row.confidence_avg ?? 0;
            const confTone = conf >= 75 ? 'ok' : conf >= 40 ? 'mid' : 'low';
            const confColor = confTone === 'ok' ? '#0F766E' : confTone === 'mid' ? '#92400E' : '#9C2E2E';
            const confBg    = confTone === 'ok' ? 'rgba(15,118,110,0.10)' : confTone === 'mid' ? '#FFFBEB' : 'rgba(156,46,46,0.06)';
            const clinicName = row.clinic_id ? clinicMap[row.clinic_id] : null;
            const ocr = row.ocr_data ?? {};
            const teeth: number[] = Array.isArray(ocr.tooth_numbers) ? ocr.tooth_numbers : [];

            return (
              <View
                key={row.id}
                style={{
                  backgroundColor: '#FFFFFF', borderRadius: 16,
                  padding: 16, gap: 12,
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
                  ...(Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } as any : {}),
                }}
              >
                {/* Üst satır: source + tarih + confidence */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                    backgroundColor: sourceCfg.color + '14',
                  }}>
                    <SourceIcon size={12} color={sourceCfg.color} strokeWidth={2} />
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: sourceCfg.color }}>
                      {sourceCfg.label}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: DS.ink[400] }}>· {fmtRelative(row.created_at)}</Text>
                  <View style={{ flex: 1 }} />
                  <View style={{
                    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                    backgroundColor: confBg,
                  }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: confColor }}>
                      %{conf} kesinlik
                    </Text>
                  </View>
                </View>

                {/* Foto + ana bilgi */}
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  {row.photo_url ? (
                    <Pressable
                      onPress={() => { if (typeof window !== 'undefined') window.open(row.photo_url!, '_blank'); }}
                      style={{ width: 80, height: 100, borderRadius: 8, overflow: 'hidden', backgroundColor: DS.ink[100], ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                    >
                      <Image source={{ uri: row.photo_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    </Pressable>
                  ) : (
                    <View style={{ width: 80, height: 100, borderRadius: 8, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center' }}>
                      <Camera size={20} color={DS.ink[400]} strokeWidth={1.4} />
                    </View>
                  )}

                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: DS.ink[900] }} numberOfLines={1}>
                      {row.patient_name ?? '— Hasta adı okunamadı —'}
                    </Text>

                    {clinicName ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Building2 size={12} color={DS.ink[400]} strokeWidth={1.8} />
                        <Text style={{ fontSize: 12, color: DS.ink[700], fontWeight: '500' }}>{clinicName}</Text>
                      </View>
                    ) : ocr.clinic_id ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <AlertCircle size={12} color="#9C5E0E" strokeWidth={1.8} />
                        <Text style={{ fontSize: 11, color: '#9C5E0E', fontWeight: '500' }}>Klinik tanınmadı (QR ID geçersiz)</Text>
                      </View>
                    ) : null}

                    {row.sender_phone && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Phone size={11} color={DS.ink[400]} strokeWidth={1.8} />
                        <Text style={{ fontSize: 11, color: DS.ink[500] }}>{row.sender_phone}</Text>
                      </View>
                    )}

                    {teeth.length > 0 && (
                      <Text style={{ fontSize: 11.5, color: DS.ink[700], fontVariant: ['tabular-nums'] }}>
                        Diş: <Text style={{ fontWeight: '600' }}>{teeth.join(', ')}</Text>
                        {ocr.work_type ? ` · ${ocr.work_type}` : ''}
                        {ocr.shade ? ` · ${ocr.shade}` : ''}
                      </Text>
                    )}

                    {ocr.urgency === 'acil' || ocr.urgency === 'cok_acil' ? (
                      <View style={{
                        alignSelf: 'flex-start',
                        flexDirection: 'row', alignItems: 'center', gap: 4,
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                        backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: 'rgba(156,46,46,0.25)',
                      }}>
                        <AlertCircle size={10} color="#9C2E2E" strokeWidth={2} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#9C2E2E' }}>
                          {ocr.urgency === 'cok_acil' ? 'ÇOK ACİL' : 'ACİL'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Aksiyonlar */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Pressable
                    onPress={() => handleReject(row)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 14, paddingVertical: 9,
                      borderRadius: 9999,
                      backgroundColor: '#FFFFFF',
                      borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <X size={13} color="#9C2E2E" strokeWidth={2} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#9C2E2E' }}>Reddet</Text>
                  </Pressable>
                  <View style={{ flex: 1 }} />
                  <Pressable
                    onPress={() => handleApprove(row)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 7,
                      paddingHorizontal: 16, paddingVertical: 9,
                      borderRadius: 9999,
                      backgroundColor: '#0F766E',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer', boxShadow: '0 4px 16px rgba(15,118,110,0.30)' } as any : {}),
                    }}
                  >
                    <Check size={13} color="#FFF" strokeWidth={2.2} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>Onayla → İş Emri Aç</Text>
                    <ChevronRight size={12} color="#FFF" strokeWidth={2.2} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

export default PendingPaperOrdersScreen;
