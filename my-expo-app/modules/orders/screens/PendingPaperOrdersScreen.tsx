import { localeTag, isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { openFileUrl } from '../../../core/util/openFile';
import { confirmAsync } from '../../../core/util/confirm';
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
  ChevronRight, ChevronLeft, Sparkles, Calendar, Building2, MessageSquare, ScanLine,
} from '../../../core/ui/icons';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { useInkUI } from '../../../core/theme/inkScale';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { toast } from '../../../core/ui/Toast';

interface PendingRow {
  id: string;
  lab_id: string;
  source: string;
  sender_phone: string | null;
  sender_name: string | null;
  photo_url: string | null;
  photo_storage_path: string | null;
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

/** Marka rengini beyazla karıştırır — hue korunur, koyu zeminde okunur olur. */
function lightenRGB(hex: string, amount: number) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)] as const;
}

/**
 * Kaynak/marka rozeti tonu. Açık tema BİREBİR eski değer (`renk + '14'` zemin,
 * markanın kendi rengi metin). Koyu temada marka rengi korunur ama zemin
 * yarı saydam + metin açık tona taşınır (pastel-on-dark leke olmasın).
 */
function brandTone(hex: string, isDark: boolean) {
  if (!isDark) return { bg: hex + '14', fg: hex };
  const [r, g, b] = lightenRGB(hex, 0.45);
  return { bg: `rgba(${r},${g},${b},0.24)`, fg: `rgb(${r},${g},${b})` };
}

export function PendingPaperOrdersScreen() {
  const router = useRouter();
  const { profile } = useAuthStore();
  const labId = (profile as any)?.lab_id ?? profile?.id ?? null;
  const U = useInkUI();
  // Teal (0F766E) status tonu — koyu zeminde açılır, açık temada aynen kalır.
  const tealFg = U.isDark ? '#5EC9BA' : '#0F766E';
  const tealBg = U.isDark ? 'rgba(15,118,110,0.30)' : 'rgba(15,118,110,0.10)';
  const amberFg = U.isDark ? '#F0C078' : '#9C5E0E';
  const dangerFg = U.isDark ? '#F3A0A0' : '#9C2E2E';

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
    if (!error && data) {
      // photo_url `authenticated/…` yolu bearer ister — düz <Image> yükleyemez.
      // photo_storage_path'ten kısa ömürlü imzalı URL üret (önizleme + tam boy).
      const withUrls = await Promise.all((data as PendingRow[]).map(async (r) => {
        if (!r.photo_storage_path) return r;
        const { data: signed } = await supabase
          .storage.from('paper-orders')
          .createSignedUrl(r.photo_storage_path, 3600);
        return signed?.signedUrl ? { ...r, photo_url: signed.signedUrl } : r;
      }));
      setRows(withUrls);
    }

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
    // Manuel sipariş, work_order BAŞARIYLA oluşana kadar kutuda kalsın — status'ü ŞİMDİ
    // değiştirme. pending_id'yi taşı; NewOrderScreen sipariş oluşunca 'approved' +
    // work_order_id yazacak (yarıda bırakılırsa kayıt kaybolmaz).
    try {
      window.sessionStorage.setItem('ocr_work_order', JSON.stringify({ ...(row.ocr_data ?? {}), __pending_id: row.id }));
    } catch { /* ignore */ }
    router.push('/(lab)/new-order' as any);
  };

  const handleReject = async (row: PendingRow) => {
    const ok = await confirmAsync('Manuel Siparişi Reddet', `Bu manuel sipariş kaydı reddedilsin mi? "${row.patient_name ?? row.sender_phone ?? 'Bilinmeyen'}"`, { confirmText: 'Reddet', destructive: true });
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
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} ${autoT('dk önce')}`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ${autoT('sa önce')}`;
    return new Date(iso).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
        <ActivityIndicator color={U.ink[400]} />
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
        <Text style={{ fontFamily: Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui' : 'InterTight_300Light', fontWeight: '300', fontSize: 26, letterSpacing: -0.6, color: U.ink[900] }}>
          Bekleyen Manuel Siparişler
        </Text>
        <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 4 }}>
          Kliniklerden WhatsApp / mesajla gelen iş emirleri (fotoğraf veya yazılı) — onaylayıp dijital sisteme aktar.
        </Text>
      </View>

      {rows.length === 0 ? (
        <View style={{
          padding: 40, borderRadius: 16, backgroundColor: U.surface,
          alignItems: 'center', gap: 10, marginTop: 20,
          borderWidth: 1, borderColor: U.hairline,
        }}>
          <Inbox size={32} color={U.isDark ? 'rgba(255,255,255,0.24)' : '#CBD5E1'} strokeWidth={1.4} />
          <Text style={{ fontSize: 14, color: U.ink[500], fontWeight: '600' }}>Bekleyen manuel sipariş yok</Text>
          <Text style={{ fontSize: 11, color: U.ink[400], textAlign: 'center', maxWidth: 320, lineHeight: 16 }}>
            Klinikler WhatsApp/webhook ile fotoğraf ya da yazılı iş emri gönderdiğinde otomatik burada görünür.{'\n'}
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
            const srcTone = brandTone(sourceCfg.color, U.isDark);
            const confColor = U.isDark
              ? (confTone === 'ok' ? tealFg : confTone === 'mid' ? U.chipTones.warning.fg : U.chipTones.danger.fg)
              : (confTone === 'ok' ? '#0F766E' : confTone === 'mid' ? '#92400E' : '#9C2E2E');
            const confBg    = U.isDark
              ? (confTone === 'ok' ? tealBg : confTone === 'mid' ? U.chipTones.warning.bg : U.chipTones.danger.bg)
              : (confTone === 'ok' ? 'rgba(15,118,110,0.10)' : confTone === 'mid' ? '#FFFBEB' : 'rgba(156,46,46,0.06)');
            const clinicName = row.clinic_id ? clinicMap[row.clinic_id] : null;
            const ocr = row.ocr_data ?? {};
            const teeth: number[] = Array.isArray(ocr.tooth_numbers) ? ocr.tooth_numbers : [];

            return (
              <View
                key={row.id}
                style={{
                  backgroundColor: U.surface, borderRadius: 16,
                  padding: 16, gap: 12,
                  borderWidth: 1, borderColor: U.hairline,
                  ...(Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } as any : {}),
                }}
              >
                {/* Üst satır: source + tarih + confidence */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                    backgroundColor: srcTone.bg,
                  }}>
                    <SourceIcon size={12} color={srcTone.fg} strokeWidth={2} />
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: srcTone.fg }}>
                      {sourceCfg.label}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: U.ink[400] }}>· {fmtRelative(row.created_at)}</Text>
                  <View style={{ flex: 1 }} />
                  {ocr._text_only ? (
                    // Yazıyla gelen sipariş → OCR "kesinlik"i anlamsız; net etiket göster.
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                      backgroundColor: tealBg,
                    }}>
                      <MessageSquare size={11} color={tealFg} strokeWidth={2} />
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: tealFg }}>Yazılı sipariş</Text>
                    </View>
                  ) : (
                    <View style={{
                      paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                      backgroundColor: confBg,
                    }}>
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: confColor }}>
                        %{conf} kesinlik
                      </Text>
                    </View>
                  )}
                </View>

                {/* Foto + ana bilgi (yazılı siparişte foto kutusu yok → bilgi tam genişlik) */}
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  {row.photo_url ? (
                    <Pressable
                      onPress={() => { openFileUrl(row.photo_url); }}
                      style={{ width: 80, height: 100, borderRadius: 8, overflow: 'hidden', backgroundColor: U.ink[100], ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                    >
                      <Image source={{ uri: row.photo_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    </Pressable>
                  ) : ocr._text_only ? null : (
                    <View style={{ width: 80, height: 100, borderRadius: 8, backgroundColor: U.ink[100], alignItems: 'center', justifyContent: 'center' }}>
                      <Camera size={20} color={U.ink[400]} strokeWidth={1.4} />
                    </View>
                  )}

                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: U.ink[900] }} numberOfLines={1}>
                      {row.patient_name ?? (ocr._text_only ? '— Hasta adı belirtilmemiş —' : '— Hasta adı okunamadı —')}
                    </Text>

                    {clinicName ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Building2 size={12} color={U.ink[400]} strokeWidth={1.8} />
                        <Text style={{ fontSize: 12, color: U.ink[700], fontWeight: '500' }}>{clinicName}</Text>
                      </View>
                    ) : ocr.clinic_id ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <AlertCircle size={12} color={amberFg} strokeWidth={1.8} />
                        <Text style={{ fontSize: 11, color: amberFg, fontWeight: '500' }}>Klinik tanınmadı (QR ID geçersiz)</Text>
                      </View>
                    ) : null}

                    {row.sender_phone && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Phone size={11} color={U.ink[400]} strokeWidth={1.8} />
                        <Text style={{ fontSize: 11, color: U.ink[500] }}>{row.sender_phone}</Text>
                      </View>
                    )}

                    {teeth.length > 0 && (
                      <Text style={{ fontSize: 11.5, color: U.ink[700], fontVariant: ['tabular-nums'] }}>
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
                        backgroundColor: U.isDark ? U.chipTones.danger.bg : '#FEF2F2',
                        borderWidth: 1,
                        borderColor: U.isDark ? 'rgba(243,160,160,0.35)' : 'rgba(156,46,46,0.25)',
                      }}>
                        <AlertCircle size={10} color={dangerFg} strokeWidth={2} />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: dangerFg }}>
                          {ocr.urgency === 'cok_acil' ? 'ÇOK ACİL' : 'ACİL'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Gelen mesaj (yazılı sipariş: metnin kendisi) / gönderen notu (foto: ek mesaj) */}
                {ocr.sender_note ? (
                  <View style={{
                    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
                    backgroundColor: U.isDark ? 'rgba(74,143,201,0.18)' : 'rgba(37,99,235,0.05)',
                    borderRadius: 10,
                    padding: 10, borderWidth: 1,
                    borderColor: U.isDark ? 'rgba(155,198,236,0.25)' : 'rgba(37,99,235,0.12)',
                  }}>
                    <MessageSquare size={13} color={U.isDark ? '#9BC6EC' : '#2563EB'} strokeWidth={1.9} style={{ marginTop: 1 }} />
                    <Text style={{ flex: 1, fontSize: 12, color: U.ink[700], lineHeight: 17 }}>
                      <Text style={{ fontWeight: '700', color: U.isDark ? '#9BC6EC' : '#2563EB' }}>{ocr._text_only ? 'Gelen mesaj: ' : 'Gönderen notu: '}</Text>
                      {String(ocr.sender_note)}
                    </Text>
                  </View>
                ) : null}

                {/* Otomatik okuma başarısız → manuel giriş uyarısı */}
                {ocr._ocr_failed ? (
                  <View style={{
                    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
                    backgroundColor: U.isDark ? U.chipTones.warning.bg : '#FFFBEB',
                    borderRadius: 10,
                    padding: 10, borderWidth: 1,
                    borderColor: U.isDark ? 'rgba(240,192,120,0.28)' : 'rgba(146,64,14,0.18)',
                  }}>
                    <ScanLine size={13} color={U.isDark ? U.chipTones.warning.fg : '#92400E'} strokeWidth={1.9} style={{ marginTop: 1 }} />
                    <Text style={{ flex: 1, fontSize: 11.5, color: U.isDark ? U.chipTones.warning.fg : '#92400E', lineHeight: 16 }}>
                      Otomatik okuma yapılamadı — fotoğrafı açıp bilgileri elle girin.
                    </Text>
                  </View>
                ) : null}

                {/* Aksiyonlar */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Pressable
                    onPress={() => handleReject(row)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      paddingHorizontal: 14, paddingVertical: 9,
                      borderRadius: 9999,
                      backgroundColor: U.plainBtn.bg,
                      borderWidth: 1, borderColor: U.isDark ? U.plainBtn.border : 'rgba(0,0,0,0.08)',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <X size={13} color={dangerFg} strokeWidth={2} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: dangerFg }}>Reddet</Text>
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
                    {isRTL() ? <ChevronLeft size={12} color="#FFF" strokeWidth={2.2} /> : <ChevronRight size={12} color="#FFF" strokeWidth={2.2} />}
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
