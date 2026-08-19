/**
 * ScanWorkOrderModal — klinikten gelen kağıt iş emrini OCR ile parse eder.
 * Doktorların hâlâ kağıda yazmayı tercih ettiği klinikler için entegrasyon.
 *
 * Akış:
 *   1. Kullanıcı PDF/JPG/PNG dosyası seçer
 *   2. parse-work-order Edge Function'a yüklenir
 *   3. Parsed JSON ekrana yapılandırılmış şekilde gösterilir
 *   4. "Yeni iş emrine geç" → /new-order?ocr=<encoded> navigasyon (manuel form doldur)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, Platform, Modal, ScrollView, Animated, Easing,
} from 'react-native';
import { TeethLoader } from '../../../core/ui/TeethLoader';
import { X, FileUp, Sparkles, Check, AlertCircle, Camera, ArrowRight, ArrowLeft } from 'lucide-react-native';
import { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { supabase } from '../../../core/api/supabase';
import { DS } from '../../../core/theme/dsTokens';

type Confidence = 'high' | 'medium' | 'low' | 'missing';

interface ParsedWorkOrder {
  clinic_id: string | null;
  doctor_name: string | null;
  patient_name: string | null;
  order_date: string | null;
  delivery_date: string | null;
  urgency: 'normal' | 'acil' | 'cok_acil' | null;
  tooth_numbers: number[];
  work_type: string | null;
  shade: string | null;
  impression_type: string | null;
  notes: string | null;
  // Yeni form alanları (eski formlarda gelmez)
  patient_gender?: 'kadın' | 'erkek' | null;
  patient_dob?: string | null;
  delivery_method?: 'kurye' | 'elden' | 'kargo' | null;
  scan_bodies_delivered?: boolean | null;
  form_no?: string | null;
  items?: Array<{ work_type: string | null; tooth_numbers: number[]; shade: string | null }>;
  confidence?: Record<string, Confidence>;
  overall_note?: string | null;
  raw_transcription?: string | null;
  alternatives?: Record<string, string[]>;
}

const CONF_TONE: Record<Confidence, { bg: string; border: string; fg: string; label: string }> = {
  high:    { bg: 'rgba(15,118,110,0.06)',  border: 'rgba(15,118,110,0.25)',  fg: '#0F766E', label: 'Net' },
  medium:  { bg: '#FFFBEB',                border: 'rgba(217,119,6,0.30)',   fg: '#92400E', label: 'Tereddüt' },
  low:     { bg: 'rgba(156,46,46,0.05)',   border: 'rgba(156,46,46,0.30)',   fg: '#9C2E2E', label: 'Kontrol et' },
  missing: { bg: 'rgba(0,0,0,0.02)',       border: 'rgba(0,0,0,0.06)',       fg: '#9A9A9A', label: 'Boş' },
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreateOrder?: (parsed: ParsedWorkOrder) => void;
  accentColor?: string;
}

export function ScanWorkOrderModal({ visible, onClose, onCreateOrder, accentColor = '#2563EB' }: Props) {
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedWorkOrder | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [clinicName, setClinicName] = useState<string | null>(null);

  const reset = () => { setParsed(null); setError(null); setClinicName(null); };

  const handlePick = (cameraOnly = false) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = cameraOnly ? 'image/*' : 'application/pdf,image/png,image/jpeg,image/webp';
    // Mobile'da kameraya direkt erişim (arka kamera)
    if (cameraOnly) input.setAttribute('capture', 'environment');
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) handleParse(f);
    };
    input.click();
  };

  const handleParse = async (file: File) => {
    reset(); setParsing(true);
    try {
      // ── Görsel ön-işleme (sadece image, PDF değil) ──
      // Mobil kameralar 4000x3000+ yüksek çözünürlük üretir, lossy JPEG sıkıştırılır.
      // Bunu 2048px max + sharpening ile yeniden encode → OCR doğruluğu artar, payload küçülür.
      let processedBlob: Blob = file;
      let mime_type = file.type || 'application/pdf';

      if (file.type.startsWith('image/') && typeof window !== 'undefined') {
        try {
          processedBlob = await preprocessImage(file);
          mime_type = 'image/jpeg';
        } catch {
          // Ön-işleme başarısız → orijinali kullan
          processedBlob = file;
        }
      }

      const buf = await processedBlob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
      }
      const file_base64 = btoa(binary);

      const { data, error: fnErr } = await supabase.functions.invoke('parse-work-order', {
        body: { file_base64, mime_type },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (!data?.ok) throw new Error(data?.error ?? 'OCR başarısız');

      const d = data.data as ParsedWorkOrder;
      setParsed(d);

      // Klinik adını çek
      if (d.clinic_id) {
        const { data: clinic } = await supabase
          .from('clinics')
          .select('name')
          .eq('id', d.clinic_id)
          .single();
        if (clinic?.name) setClinicName(clinic.name);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Bilinmeyen hata');
    } finally {
      setParsing(false);
    }
  };

  const handleCreate = () => {
    if (parsed && onCreateOrder) onCreateOrder(parsed);
    onClose();
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          backgroundColor: '#FFF', borderRadius: 20, width: 580, maxWidth: '100%', maxHeight: '90%',
          ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.2)' } as any : {}),
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)', gap: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: accentColor + '14', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={18} color={accentColor} strokeWidth={1.6} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#9A9A9A', letterSpacing: 1, textTransform: 'uppercase' }}>OCR · Kağıt Sipariş</Text>
              <Text style={{ fontSize: 17, fontWeight: '700', color: DS.ink[900], letterSpacing: -0.2, marginTop: 2 }}>
                Kağıttan İş Emri Aç
              </Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}>
              <X size={14} color="#6B6B6B" strokeWidth={1.8} />
            </Pressable>
          </View>

          <ScrollView style={{ padding: 20 }} contentContainerStyle={{ gap: 14 }}>
            {!parsed && !parsing && !error && (
              <View style={{ gap: 10 }}>
                {/* AI badge */}
                <AIBadge accentColor={accentColor} />

                {/* Kamera ile çek */}
                <AIActionButton
                  onPress={() => handlePick(true)}
                  accentColor={accentColor}
                  variant="primary"
                  icon={<Camera size={18} color="#FFF" strokeWidth={2} />}
                  title="Kamera ile Çek"
                />

                {/* Dosya seç */}
                <AIActionButton
                  onPress={() => handlePick(false)}
                  accentColor={accentColor}
                  variant="secondary"
                  icon={<FileUp size={18} color={accentColor} strokeWidth={1.8} />}
                  title="Dosyadan Yükle (PDF / Görsel)"
                  subtitle="QR kodlu lab formu en doğru sonucu verir"
                />
              </View>
            )}

            {parsing && <AIThinkingLoader accentColor={accentColor} />}

            {error && (
              <View style={{ flexDirection: 'row', gap: 10, padding: 14, backgroundColor: 'rgba(156,46,46,0.06)', borderRadius: 10, borderStartWidth: 3, borderStartColor: '#9C2E2E' }}>
                <AlertCircle size={16} color="#9C2E2E" strokeWidth={1.8} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#9C2E2E' }}>OCR başarısız</Text>
                  <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>{error}</Text>
                  <Pressable onPress={() => { reset(); handlePick(); }} style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: accentColor }}>Tekrar dene</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {parsed && (() => {
              const conf = parsed.confidence ?? {};
              const totalFields = ['clinic_id','doctor_name','patient_name','order_date','delivery_date','urgency','tooth_numbers','work_type','shade','impression_type','notes','patient_gender','patient_dob','delivery_method','items'];
              const highCount   = totalFields.filter(k => (conf as any)[k] === 'high').length;
              const lowCount    = totalFields.filter(k => (conf as any)[k] === 'low').length;
              const filledCount = totalFields.filter(k => {
                const c = (conf as any)[k];
                return c && c !== 'missing';
              }).length;
              const qualityPct = totalFields.length > 0 ? Math.round(highCount / totalFields.length * 100) : 0;
              const overallTone = lowCount > 0 ? 'warn' : qualityPct >= 70 ? 'ok' : 'mid';
              const overallColor = overallTone === 'ok' ? '#0F766E' : overallTone === 'warn' ? '#9C2E2E' : '#92400E';
              const overallBg    = overallTone === 'ok' ? 'rgba(15,118,110,0.08)' : overallTone === 'warn' ? 'rgba(156,46,46,0.06)' : '#FFFBEB';
              const overallMsg   = lowCount > 0
                ? `${lowCount} ${autoT('alan zor okundu — sarı/kırmızı kutuları kontrol et.')}`
                : qualityPct >= 70
                  ? `${autoT('Form temiz okundu')} (%${qualityPct} ${autoT('kesin')}). ${autoT('Birkaç saniyede iş emrine geçebilirsin.')}`
                  : 'Form kısmen dolduruldu — eksik alanları manuel tamamla.';

              return (
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 10, padding: 12, backgroundColor: overallBg, borderRadius: 10, borderStartWidth: 3, borderStartColor: overallColor }}>
                  <Check size={15} color={overallColor} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, color: overallColor, fontWeight: '700' }}>
                      Okuma kalitesi · {filledCount}/{totalFields.length} dolu · %{qualityPct} kesin
                    </Text>
                    <Text style={{ fontSize: 11, color: DS.ink[700], marginTop: 2 }}>{overallMsg}</Text>
                    {parsed.overall_note && (
                      <Text style={{ fontSize: 10.5, color: DS.ink[500], marginTop: 4, fontStyle: 'italic' }}>
                        "{parsed.overall_note}"
                      </Text>
                    )}
                  </View>
                </View>

                <ParsedField
                  label="Klinik"
                  value={clinicName ?? (parsed.clinic_id ? `Bilinmeyen (${parsed.clinic_id.slice(0, 8)}...)` : null)}
                  confidence={(conf as any).clinic_id}
                />
                <ParsedField
                  label="Hekim Adı"
                  value={parsed.doctor_name}
                  confidence={(conf as any).doctor_name}
                  alternatives={parsed.alternatives?.doctor_name}
                  onSelectAlternative={(alt) => setParsed(p => p ? { ...p, doctor_name: alt } : p)}
                />
                <ParsedField
                  label="Hasta Adı"
                  value={parsed.patient_name}
                  confidence={(conf as any).patient_name}
                  alternatives={parsed.alternatives?.patient_name}
                  onSelectAlternative={(alt) => setParsed(p => p ? { ...p, patient_name: alt } : p)}
                />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <ParsedField
                      label="Sipariş Tarihi"
                      value={parsed.order_date}
                      confidence={(conf as any).order_date}
                      alternatives={parsed.alternatives?.order_date}
                      onSelectAlternative={(alt) => setParsed(p => p ? { ...p, order_date: alt } : p)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ParsedField
                      label="Teslim Tarihi"
                      value={parsed.delivery_date}
                      confidence={(conf as any).delivery_date}
                      alternatives={parsed.alternatives?.delivery_date}
                      onSelectAlternative={(alt) => setParsed(p => p ? { ...p, delivery_date: alt } : p)}
                    />
                  </View>
                </View>
                <ParsedField
                  label="Aciliyet"
                  value={parsed.urgency === 'cok_acil' ? 'Çok Acil' : parsed.urgency === 'acil' ? 'Acil' : parsed.urgency === 'normal' ? 'Normal' : null}
                  highlight={parsed.urgency === 'acil' || parsed.urgency === 'cok_acil'}
                  confidence={(conf as any).urgency}
                />
                <ParsedField
                  label="İşaretli Dişler (FDI)"
                  value={parsed.tooth_numbers?.length ? parsed.tooth_numbers.join(', ') : null}
                  mono
                  confidence={(conf as any).tooth_numbers}
                />
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <ParsedField
                      label="İşlem Tipi"
                      value={parsed.work_type}
                      confidence={(conf as any).work_type}
                      alternatives={parsed.alternatives?.work_type}
                      onSelectAlternative={(alt) => setParsed(p => p ? { ...p, work_type: alt } : p)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ParsedField
                      label="Renk"
                      value={parsed.shade}
                      mono
                      confidence={(conf as any).shade}
                      alternatives={parsed.alternatives?.shade}
                      onSelectAlternative={(alt) => setParsed(p => p ? { ...p, shade: alt } : p)}
                    />
                  </View>
                </View>
                <ParsedField label="Ölçü Yöntemi" value={parsed.impression_type} confidence={(conf as any).impression_type} />
                {/* Yeni form alanları — yalnız okunduysa göster, eski formlarda satır kalabalığı yapmasın */}
                {!!parsed.patient_gender && (
                  <ParsedField label="Cinsiyet" value={parsed.patient_gender} confidence={(conf as any).patient_gender} />
                )}
                {!!parsed.patient_dob && (
                  <ParsedField label="Doğum Tarihi" value={parsed.patient_dob} mono confidence={(conf as any).patient_dob} />
                )}
                {!!parsed.delivery_method && (
                  <ParsedField label="Teslim Yöntemi" value={parsed.delivery_method} confidence={(conf as any).delivery_method} />
                )}
                {(parsed.items?.length ?? 0) > 0 && (
                  <ParsedField
                    label="İşlem Satırları"
                    value={parsed.items!.map(it =>
                      `${it.work_type ?? '—'} · ${it.tooth_numbers.join(', ')}${it.shade ? ' · ' + it.shade : ''}`,
                    ).join('\n')}
                    multiline
                    confidence={(conf as any).items}
                  />
                )}
                <ParsedField
                  label="Notlar"
                  value={parsed.notes}
                  multiline
                  confidence={(conf as any).notes}
                  alternatives={parsed.alternatives?.notes}
                  onSelectAlternative={(alt) => setParsed(p => p ? { ...p, notes: alt } : p)}
                />

                {parsed.raw_transcription && (
                  <RawTranscriptionDrawer text={parsed.raw_transcription} />
                )}
              </View>
              );
            })()}
          </ScrollView>

          {parsed && (
            <View style={{ flexDirection: 'row', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' }}>
              <Pressable
                onPress={() => { reset(); handlePick(); }}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.04)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[700] }}>Yeniden Tara</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={handleCreate}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 7,
                  paddingHorizontal: 20, paddingVertical: 10, borderRadius: 9999,
                  backgroundColor: accentColor,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer', boxShadow: `0 4px 16px ${accentColor}33` } as any : {}),
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>
                  Bu Verilerle İş Emri Aç
                </Text>
                {isRTL() ? <ArrowLeft size={13} color="#FFF" strokeWidth={2.2} /> : <ArrowRight size={13} color="#FFF" strokeWidth={2.2} />}
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function ParsedField({ label, value, mono, multiline, highlight, confidence, alternatives, onSelectAlternative }: {
  label: string; value: string | null | undefined;
  mono?: boolean; multiline?: boolean; highlight?: boolean;
  confidence?: Confidence;
  alternatives?: string[];
  onSelectAlternative?: (alt: string) => void;
}) {
  const isEmpty = !value;
  const effectiveConf: Confidence = confidence ?? (isEmpty ? 'missing' : 'high');
  const tone = CONF_TONE[effectiveConf];
  const bg     = highlight ? 'rgba(217,119,6,0.08)' : tone.bg;
  const border = highlight ? 'rgba(217,119,6,0.30)' : tone.border;
  const txt    = isEmpty ? '#9A9A9A' : (highlight ? '#9C5E0E' : DS.ink[900]);

  // Alternatives'den şu anki value'yu çıkar (zaten gösteriliyor)
  const altList = (alternatives ?? []).filter(a => a && a !== value);

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: '#9A9A9A' }}>{label}</Text>
        {confidence && confidence !== 'missing' && (
          <View style={{
            paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4,
            backgroundColor: tone.bg, borderWidth: 1, borderColor: tone.border,
          }}>
            <Text style={{ fontSize: 8.5, fontWeight: '700', color: tone.fg, letterSpacing: 0.3 }}>
              {tone.label.toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <View style={{
        paddingHorizontal: 12, paddingVertical: multiline ? 10 : 8,
        backgroundColor: bg,
        borderRadius: 8, borderWidth: 1, borderColor: border,
        minHeight: multiline ? 60 : 36, justifyContent: 'center',
      }}>
        <Text style={{
          fontSize: mono ? 13 : 14, color: txt,
          fontWeight: isEmpty ? '400' : (highlight ? '700' : '500'),
          fontStyle: isEmpty ? 'italic' : 'normal',
          fontVariant: mono ? ['tabular-nums'] as any : undefined,
        }}>
          {value || '— Okunamadı —'}
        </Text>
      </View>

      {/* Alternatif okumalar — Claude düşük güvenli alanlar için aday üretir */}
      {altList.length > 0 && onSelectAlternative && (
        <View style={{ marginTop: 6 }}>
          <Text style={{ fontSize: 9.5, color: DS.ink[400], fontWeight: '600', letterSpacing: 0.3, marginBottom: 4 }}>
            Alternatif okumalar:
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {altList.map((alt, i) => (
              <Pressable
                key={`${alt}-${i}`}
                onPress={() => onSelectAlternative(alt)}
                style={({ hovered }: any) => ({
                  paddingHorizontal: 10, paddingVertical: 5,
                  borderRadius: 999, borderWidth: 1,
                  backgroundColor: hovered ? 'rgba(15,118,110,0.10)' : '#FFFFFF',
                  borderColor: hovered ? '#0F766E' : 'rgba(0,0,0,0.10)',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <Text style={{
                  fontSize: 11.5, fontWeight: '600',
                  color: DS.ink[700],
                  fontVariant: mono ? ['tabular-nums'] as any : undefined,
                }}>
                  {alt}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── AI Thinking Loader ──────────────────────────────────────
// Aurora glow + cycling status text + animated dots
// "AI is reading" feel
const AI_STEPS = [
  'Görüntü hazırlanıyor',
  'Metinler okunuyor',
  'Yapısal analiz',
  'Dental terimler eşleştiriliyor',
  'Alanlar doğrulanıyor',
  'Sonuçlar hazırlanıyor',
];

function AIThinkingLoader({ accentColor }: { accentColor: string }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [dotCount, setDotCount] = useState(1);

  // Status text cycling
  useEffect(() => {
    const t = setInterval(() => {
      setStepIdx(i => (i + 1) % AI_STEPS.length);
    }, 1800);
    return () => clearInterval(t);
  }, []);

  // Animated dots (.,..,...)
  useEffect(() => {
    const t = setInterval(() => setDotCount(c => (c % 3) + 1), 400);
    return () => clearInterval(t);
  }, []);

  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, gap: 22 }}>
      {/* TeethLoader — sade, sadece çizilen diş ikonu */}
      <TeethLoader size="md" accentColor={accentColor} />

      {/* AI label + cycling step */}
      <View style={{ alignItems: 'center', gap: 6, minHeight: 48 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: 10, paddingVertical: 4,
          backgroundColor: accentColor + '14',
          borderRadius: 999,
          borderWidth: 1, borderColor: accentColor + '33',
        }}>
          <View style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: accentColor,
          }} />
          <Text style={{
            fontSize: 9.5, fontWeight: '800',
            color: accentColor, letterSpacing: 1.4,
          }}>
            AI · CLAUDE VISION
          </Text>
        </View>
        <Text style={{
          fontSize: 14, color: DS.ink[700], fontWeight: '600',
          letterSpacing: -0.1,
        }}>
          {AI_STEPS[stepIdx]}{'.'.repeat(dotCount)}
        </Text>
        <Text style={{ fontSize: 11, color: DS.ink[400] }}>
          3 aşamalı kontrol · ortalama 10-20 sn
        </Text>
      </View>

      {/* Progress dots — 6 steps */}
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {AI_STEPS.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === stepIdx ? 20 : 6, height: 4, borderRadius: 2,
              backgroundColor: i <= stepIdx ? accentColor : accentColor + '22',
              ...(Platform.OS === 'web' ? {
                transitionProperty: 'width, background-color' as any,
                transitionDuration: '300ms' as any,
              } as any : {}),
            }}
          />
        ))}
      </View>
    </View>
  );
}

// ─── AI Badge — "AI · CLAUDE VISION" mini pill above buttons ──
function AIBadge({ accentColor }: { accentColor: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);
  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const dotScale   = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });

  return (
    <View style={{
      alignSelf: 'flex-start',
      flexDirection: 'row', alignItems: 'center', gap: 7,
      paddingHorizontal: 10, paddingVertical: 5,
      backgroundColor: accentColor + '0F',
      borderRadius: 999,
      borderWidth: 1, borderColor: accentColor + '33',
      marginBottom: 4,
    }}>
      <Animated.View style={{
        width: 7, height: 7, borderRadius: 3.5,
        backgroundColor: accentColor,
        opacity: dotOpacity,
        transform: [{ scale: dotScale }],
      }} />
      <Text style={{
        fontSize: 9.5, fontWeight: '800',
        color: accentColor, letterSpacing: 1.4,
      }}>
        AI · CLAUDE VISION
      </Text>
      <Sparkles size={11} color={accentColor} strokeWidth={2} />
    </View>
  );
}

// ─── AI Action Button — shimmer gradient on hover ────────────
function AIActionButton({
  onPress, accentColor, variant, icon, title, subtitle,
}: {
  onPress: () => void;
  accentColor: string;
  variant: 'primary' | 'secondary';
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  const sparkle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(800),
      ]),
    ).start();
  }, [sparkle]);
  const sparkleOpacity = sparkle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 1, 0.3] });
  const sparkleScale   = sparkle.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.85, 1.2, 0.85] });

  const isPrimary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        paddingVertical: isPrimary ? 18 : 16, paddingHorizontal: 18,
        borderRadius: 14,
        backgroundColor: isPrimary
          ? (hovered ? '#1E40AF' : accentColor)
          : (hovered ? accentColor + '14' : accentColor + '08'),
        borderWidth: isPrimary ? 0 : 1.5, borderStyle: 'dashed',
        borderColor: isPrimary ? 'transparent' : accentColor + '55',
        position: 'relative', overflow: 'hidden',
        ...(Platform.OS === 'web' ? {
          cursor: 'pointer',
          transitionProperty: 'background-color, transform' as any,
          transitionDuration: '180ms' as any,
          boxShadow: isPrimary
            ? `0 6px 20px ${accentColor}55, 0 2px 6px ${accentColor}33`
            : 'none',
        } as any : {}),
      })}
    >
      {/* AI shimmer gradient sweep — only primary */}
      {isPrimary && Platform.OS === 'web' && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            opacity: sparkleOpacity,
            // @ts-ignore - web gradient
            backgroundImage: 'linear-gradient(110deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%)',
          } as any}
          pointerEvents="none"
        />
      )}
      {icon}
      <View style={{ alignItems: isPrimary ? 'center' : 'flex-start' }}>
        <Text style={{
          fontSize: isPrimary ? 14 : 13, fontWeight: '700',
          color: isPrimary ? '#FFF' : accentColor,
        }}>
          {title}
        </Text>
        {subtitle && (
          <Text style={{ fontSize: 10.5, color: DS.ink[400], marginTop: 1 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {/* Pulsing sparkle */}
      <Animated.View style={{
        opacity: sparkleOpacity,
        transform: [{ scale: sparkleScale }],
      }}>
        <Sparkles size={13} color={isPrimary ? '#FFF' : accentColor} strokeWidth={2} />
      </Animated.View>
    </Pressable>
  );
}

// ── Image preprocessing ──────────────────────────────────────
// Mobil kamera fotoğraflarını Claude Vision için optimize eder:
//   • Max 2048px (uzun kenar) — Claude sınırı 8000 ama 2048 yeterli ve hızlı
//   • Auto-orientation (EXIF rotation düzeltme — canvas drawImage doğal işler)
//   • JPEG quality 0.85 (sharp + makul boyut)
//   • Hafif contrast/sharpness artırma (canvas filter)
async function preprocessImage(file: File): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const MAX = 2048;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height);
          width  = Math.round(width  * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        if (!ctx) throw new Error('canvas ctx');

        // Hafif contrast + saturation artırma (OCR'ye yardımcı)
        try { (ctx as any).filter = 'contrast(1.10) saturate(1.05) brightness(1.02)'; } catch {}
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (blob) resolve(blob);
            else reject(new Error('canvas toBlob failed'));
          },
          'image/jpeg',
          0.85,
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
    img.src = url;
  });
}

// ── RawTranscriptionDrawer ───────────────────────────────────
// Pass 1 OCR transkripsiyonu — geliştirici/kullanıcı doğrulama için açılabilir
function RawTranscriptionDrawer({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginTop: 8 }}>
      <Pressable
        onPress={() => setOpen(o => !o)}
        style={({ hovered }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingVertical: 8,
          opacity: hovered ? 0.7 : 1,
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        })}
      >
        <Sparkles size={11} color={DS.ink[400]} strokeWidth={1.8} />
        <Text style={{ fontSize: 10.5, color: DS.ink[500], fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' }}>
          {open ? 'OCR Transkripsiyonunu Gizle' : 'OCR Transkripsiyonunu Göster (Pass 1)'}
        </Text>
      </Pressable>
      {open && (
        <View style={{
          padding: 12, borderRadius: 8,
          backgroundColor: 'rgba(0,0,0,0.03)',
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
        }}>
          <Text style={{
            fontSize: 10.5, color: DS.ink[700], lineHeight: 15,
            fontFamily: Platform.OS === 'web' ? 'ui-monospace, monospace' : 'monospace',
          }}>
            {text}
          </Text>
        </View>
      )}
    </View>
  );
}
