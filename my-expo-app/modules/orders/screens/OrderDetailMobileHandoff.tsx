// modules/orders/screens/OrderDetailMobileHandoff.tsx
// Aydın Lab Mobile handoff — "Hasan Basri" sipariş detay tasarımı
// (design_handoff_aydin_lab_mobile/screens/order-detail.jsx birebir adapte)
//
// Sections:
//   1. Top bar (back + SİPARİŞ no + print/more)
//   2. HERO patient + countdown (peach gradient + Acil pill + Timeline)
//   3. Production control panel (dark) — Ring + station + remaining time + actions
//   4. Meta strip (Diş şeması + Materyal + Renk)
//   5. Attachments thumb grid + voice
//   6. Progress slider
//   7. Activity log (Tüm/Aktivite/Mesaj tabs)
//   8. QC quick tags

import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { StepsTimelineX } from '../../../core/ui/ProgressX';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft, Printer, MoreHorizontal, Play, Pause, AlertCircle,
  Paperclip, Plus, MessageCircle, Mic, Truck, Check, ChevronDown, RotateCcw, Star,
} from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import { MOBILE_PANEL_THEMES, useMobileTokens, type MobilePanel } from '../../../core/theme/mobileDesignTokens';

const STAGES = [
  { key: 'in',    label: 'Alındı' },
  { key: 'des',   label: 'Tasarım' },
  { key: 'cam',   label: 'CAM' },
  { key: 'mill',  label: 'Frezeleme' },
  { key: 'sin',   label: 'Sinter' },
];

export interface OrderDetailMobileHandoffProps {
  panel?: MobilePanel;
  /** Tooth chart node — varsa render edilir (LivingToothChart) */
  toothChart?: React.ReactNode;
  orderNumber: string;          // "LAB-2026-0053"
  patient: string;              // "Hasan Basri"
  toothCount: number;           // 3
  isUrgent: boolean;
  doctorName: string;
  clinicName: string;
  remainingDays: number;        // 1
  deliveryDate: string;         // "12.05.2026"
  // Production
  currentStageIdx: number;      // 2 (mill)
  totalStages: number;          // 11
  stageName: string;            // "Frezeleme istasyonu"
  // Desktop ile aynı macro milestone timeline (Alındı · Üretim · Final QC · Kurye · Teslim)
  timelineSteps?: string[];     // STATUS_LABELS veya elden için STATUS_LABELS_ELDEN
  timelineCurrent?: number;     // statusIdx (macro 0-4)
  timelineTheme?: 'lab' | 'clinic' | 'exec' | 'tech';
  // Desktop kartı bilgileri: zamanlama + aşama detayları
  operatorMins?: number;        // toplam operatör (aktif iş) dakikası
  queueMins?: number;           // toplam kuyruk (bekleme) dakikası
  stageDetails?: { name: string; status: string }[]; // sırayla üretim aşamaları + durum
  // Paralel şerit (desktop ile aynı mantık). Verilirse (çok-şerit) hero + aşama
  // detayları şerit-başına ayrılır; verilmezse (tek-şerit) mevcut görünüm korunur.
  laneSummary?: { lane: number; teeth: string; station: string | null; pct: number; done: number; total: number }[];
  laneStageGroups?: { lane: number; teeth: string; stages: { name: string; status: string }[] }[];
  technicianName?: string;
  technicianInitials?: string;
  /** Desktop ile ortak AŞAMA DETAYLARI timeline (varsa basit listenin yerine render edilir) */
  stageTimelineNode?: React.ReactNode;
  /** Gecikme — üretim panelinde "X gün gecikti" uyarısı (masaüstü paritesi) */
  overdue?: boolean;
  /** Teslim sonrası değerlendirme — sorumlu yerine ⭐ ortalama + adet */
  rating?: { avg: number; count: number } | null;
  /** Atanmamış aktif aşamaya yönetici dokunuşuyla atama aç (masaüstü paritesi) */
  onAssignTech?: () => void;
  ringPercent: number;          // 40
  remainingTime: string;        // "1g 23:43:32"
  // Meta
  teeth: number[];              // [24, 25, 26]
  material: string;             // "Zirkonyum"
  materialSub?: string;         // "Köprü · 3 üye"
  colorShade: string;           // "A2 — Vita"
  // Attachments
  attachmentCount: number;
  attachments: { label: string; sub: string }[];
  /** Gerçek dosya listesi (önizleme + 3D viewer + indirme) — verilirse statik grid yerine bu render edilir. */
  attachmentsNode?: React.ReactNode;
  /** İptal talebi aksiyonu (klinik/hekim) — içerik altında gösterilir. */
  cancelNode?: React.ReactNode;
  /** Lojistik (kurye hareketleri) kartı — Ekler'in hemen altında gösterilir. */
  logisticsNode?: React.ReactNode;
  // Progress
  operatorProgress: number;     // 40
  // Activity
  activities: { title: string; user: string; time: string; kind: 'prod' | 'done' | 'wait' }[];
  /** Hekim notu — varsa "Hekim Notu" tab/section'da gösterilir, yoksa boş mesaj */
  doctorNote?: string | null;
  // Actions
  onBack: () => void;
  onPrint?: () => void;
  onMore?: () => void;
  onPause?: () => void;
  onStageDone?: () => void;
  onAddAttachment?: () => void;
  /** Revizyon oluştur — teslim edilmiş siparişte (lab yöneticisi). Verilmezse buton çıkmaz. */
  onCreateRevision?: () => void;
  /** Revizyon bağlantı rozetleri (karşılıklı) — tıklanınca onOpenRelated çağrılır. */
  revisionLinks?: { id: string; label: string; kind: 'parent' | 'child' }[];
  onOpenRelated?: (id: string) => void;
  /** Teslimat aksiyonu — "Kuryeye Gönder" / "Elden Teslim Edildi" / "Teslim Edildi" (desktop ile aynı mantık) */
  deliveryButton?: { label: string; icon?: 'truck' | 'check'; onPress: () => void } | null;
  /** Aktif teslimat durumu etiketi — ör. "Bizim kurye" / "MNG Kargo · 123" */
  deliveryStatusLabel?: string | null;
  /** Mesaj kutusunu aç — order-spesifik chat */
  onChat?: () => void;
  /** Okunmamış mesaj sayısı (badge) */
  chatUnreadCount?: number;
  /** Aktif diş — toothChart'tan tıklandığında parent state'i set eder */
  activeTooth?: number | null;
  /** Aktif dişin iş detayı (work type, shade, item adı) — parent tarafından sağlanır */
  activeToothDetail?: {
    workType?: string;
    shade?: string;
    itemName?: string;
    price?: number;
  } | null;
}

export function OrderDetailMobileHandoff(props: OrderDetailMobileHandoffProps) {
  const T = useMobileTokens();
  const insets = useSafeAreaInsets();
  const theme = MOBILE_PANEL_THEMES[props.panel ?? 'lab'];
  const accent = theme.primary;
  const accentDeep = darken(accent, 0.18);
  const accentSoft = `${accent}26`;
  // Paralel şerit: laneSummary >1 ise hero + aşama detayları şerit-başına ayrılır.
  const isMultiLane = (props.laneSummary?.length ?? 0) > 1;

  const [tab, setTab] = useState<'all' | 'doctor_note' | 'msg'>('doctor_note');
  const [stagesOpen, setStagesOpen] = useState(false);

  // Hekim/klinik panelinde lab-spesifik aksiyonlar (Duraklat, Aşama tamam) ve internal etiketler gizlenir
  // Üretim hero kartı görünür kalır — hekim hangi aşamada olduğunu görmeli (read-only)
  const isDoctorView = props.panel === 'doctor' || props.panel === 'klinik';
  const showProductionPanel = true;       // herkes görür (durum bilgisi)
  const showProductionActions = !isDoctorView; // Duraklat / Aşama tamam yalnız lab/admin/teknisyen
  const showOperatorProgress = !isDoctorView;
  const showQcTags = !isDoctorView;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
      >
        {/* ═══ 1. Top bar ═══ */}
        <View style={{
          paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 8,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Pressable
            onPress={props.onBack}
            style={{
              width: 38, height: 38, borderRadius: 12,
              backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronLeft size={18} color={T.ink} strokeWidth={2} />
          </Pressable>
          <View style={{ alignItems: 'center', gap: 1 }}>
            <Text style={{ fontFamily: T.mono, fontSize: 10, color: T.ink3, letterSpacing: 0.6 }}>
              SİPARİŞ
            </Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }}>
              {props.orderNumber}
            </Text>
          </View>
          {/* Mesaj butonu — order-spesifik chat. Okunmamış varsa accent'li etiketli pill (belirgin ama sade) */}
          {props.onChat ? (() => {
            const hasUnread = !!props.chatUnreadCount && props.chatUnreadCount > 0;
            return (
              <Pressable
                onPress={props.onChat}
                accessibilityLabel="Mesajlar"
                style={{
                  height: 38, borderRadius: 12,
                  width: hasUnread ? undefined : 38,
                  paddingHorizontal: hasUnread ? 11 : 0,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                  backgroundColor: hasUnread ? accentSoft : T.card,
                  borderWidth: 1, borderColor: hasUnread ? accent : T.hairline,
                }}
              >
                <MessageCircle size={18} color={T.ink} strokeWidth={2} />
                {hasUnread && (
                  <>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: T.ink }}>Mesaj</Text>
                    <View style={{
                      minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9,
                      backgroundColor: T.ruby, alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>
                        {props.chatUnreadCount}
                      </Text>
                    </View>
                  </>
                )}
              </Pressable>
            );
          })() : (
            <View style={{ width: 38 }} />
          )}
        </View>

        {/* ═══ 2. HERO — patient + countdown + timeline (panel-themed gradient) ═══ */}
        <View style={{
          marginHorizontal: 14, marginTop: 6, marginBottom: 12,
          padding: 20, paddingBottom: 18, borderRadius: 26,
          overflow: 'hidden',
          // Diğer detay kartlarıyla (tooth chart / materyal / ekler) BİREBİR aynı
          // düz beyaz + ince kenarlık. T.card açık modda #FFFFFF, koyu modda uyumlu.
          backgroundColor: T.card,
          borderWidth: 1, borderColor: T.hairline,
        }}>
          {/* radial glow */}
          {Platform.OS === 'web' && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: 110,
                // @ts-ignore
                backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.5), transparent 60%)`,
              } as any}
            />
          )}

          {/* kicker row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{
              fontSize: 10.5, fontWeight: '600', color: accentDeep,
              letterSpacing: 1.4, textTransform: 'uppercase',
            }}>
              Hasta · {props.toothCount} diş çalışması
            </Text>
            {props.isUrgent && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.6)',
              }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: T.ruby }} />
                <Text style={{ fontSize: 10.5, color: T.ruby, fontWeight: '600' }}>Acil</Text>
              </View>
            )}
          </View>

          {/* name + countdown */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{
                fontSize: 30, fontWeight: '300', color: T.ink, letterSpacing: -0.6, lineHeight: 32,
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }} numberOfLines={1}>
                {props.patient}
              </Text>
              <Text style={{ fontSize: 12.5, color: T.ink2, marginTop: 6, lineHeight: 18 }}>
                {props.doctorName}
                {'\n'}
                <Text style={{ color: T.ink3 }}>{props.clinicName}</Text>
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{
                fontSize: 9, color: T.ink3, letterSpacing: 1, textTransform: 'uppercase',
              }}>
                Kalan
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={{
                  fontSize: 38, fontWeight: '300', color: T.ink, letterSpacing: -1, lineHeight: 38,
                  ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                }}>
                  {props.remainingDays}
                </Text>
                <Text style={{ fontSize: 14, fontWeight: '500', color: T.ink, marginLeft: 4 }}>g</Text>
              </View>
              <Text style={{ fontSize: 10, color: T.ink3, marginTop: 2 }}>
                Teslim {props.deliveryDate}
              </Text>
            </View>
          </View>

          {/* Revizyon bağlantıları — desktop ile aynı bilgi, karşılıklı ve tıklanabilir */}
          {(props.revisionLinks?.length ?? 0) > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {props.revisionLinks!.map(l => (
                <Pressable
                  key={l.id}
                  onPress={() => props.onOpenRelated?.(l.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                    backgroundColor: 'rgba(0,0,0,0.05)',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <RotateCcw size={10} color={T.ink3} strokeWidth={2} />
                  <Text style={{ fontSize: 11, fontWeight: '500', color: T.ink }}>{l.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Timeline */}
          <View style={{ marginTop: 16 }}>
            <StepsTimelineX
              steps={props.timelineSteps ?? ['Alındı', 'Üretim', 'Final QC', 'Kurye', 'Teslim']}
              current={props.timelineCurrent ?? props.currentStageIdx}
              theme={props.timelineTheme ?? 'lab'}
              variant="light"
            />
          </View>
        </View>

        {/* ═══ 3. Production control panel — dark (lab/admin/teknisyen) ═══ */}
        {showProductionPanel && (
        <View style={{
          marginHorizontal: 14, marginBottom: 12,
          padding: 18, paddingHorizontal: 20, borderRadius: 26,
          backgroundColor: theme.bgHero, overflow: 'hidden',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Ring value={props.ringPercent} size={68} stroke={5} color={accent}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 1 }}>
                <Text style={{
                  fontSize: 18, fontWeight: '400', color: T.onDark,
                  ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                }}>{props.ringPercent}</Text>
                <Text style={{ fontSize: 9, color: T.onDark2 }}>%</Text>
              </View>
            </Ring>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{
                fontSize: 9.5, color: T.onDark3, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: '600',
              }}>
                {isMultiLane ? 'Şu an' : `Şu an · aşama ${props.currentStageIdx + 1} / ${props.totalStages}`}
              </Text>
              {isMultiLane ? (
                /* Çok-şerit: şerit-başına (dişler · aktif istasyon · %) — desktop ile aynı */
                <View style={{ marginTop: 4 }}>
                  <Text style={{
                    fontSize: 15, fontWeight: '500', color: T.onDark,
                    ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                  }} numberOfLines={1}>
                    {props.laneSummary!.length} iş şeridi · paralel
                  </Text>
                  <View style={{ marginTop: 8, gap: 7 }}>
                    {props.laneSummary!.map((l) => (
                      <View key={l.lane} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: accentSoft }}>
                          <Text style={{ fontSize: 10.5, fontWeight: '800', color: accent, fontFamily: T.mono }}>{l.teeth}</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 12, color: T.onDark2, fontWeight: '500' }} numberOfLines={1}>
                          {l.station ?? 'Bekliyor'}
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: T.onDark }}>{l.pct}%</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
              <Text style={{
                fontSize: 17, fontWeight: '500', color: T.onDark, marginTop: 2,
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }} numberOfLines={1}>
                {props.stageName}
              </Text>
              )}
              {/* Sorumlu / teslim sonrası değerlendirme / atanmamış — masaüstü paritesi */}
              {!isMultiLane && props.rating ? (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6,
                  paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
                  alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.06)',
                }}>
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star key={n} size={13} strokeWidth={1.6} color="#FFD86B"
                        fill={props.rating!.count > 0 && Math.round(props.rating!.avg) >= n ? '#FFD86B' : 'transparent'} />
                    ))}
                  </View>
                  <Text style={{ fontSize: 11, color: T.onDark2 }} numberOfLines={1}>
                    {props.rating!.count > 0 ? `${props.rating!.avg.toFixed(1)} · ${props.rating!.count} değerlendirme` : 'Değerlendirilmedi'}
                  </Text>
                </View>
              ) : !isMultiLane && props.technicianName ? (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
                  paddingHorizontal: 5, paddingRight: 8, paddingVertical: 3,
                  borderRadius: 999, alignSelf: 'flex-start',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                }}>
                  <View style={{
                    width: 18, height: 18, borderRadius: 9,
                    backgroundColor: accent,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: '#FFFFFF' }}>
                      {props.technicianInitials ?? props.technicianName[0]}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: T.onDark2 }} numberOfLines={1}>
                    {props.technicianName}
                  </Text>
                </View>
              ) : !isMultiLane && props.onAssignTech ? (
                <Pressable
                  onPress={props.onAssignTech}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
                    paddingHorizontal: 5, paddingRight: 10, paddingVertical: 3,
                    borderRadius: 999, alignSelf: 'flex-start',
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
                    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                  }}
                >
                  <View style={{
                    width: 18, height: 18, borderRadius: 9,
                    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)', borderStyle: 'dashed',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)' }}>?</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: T.onDark2 }} numberOfLines={1}>Atanmamış · tıkla, ata</Text>
                </Pressable>
              ) : null}

              {/* Gecikme göstergesi — masaüstü paritesi */}
              {props.overdue && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFD86B' }} />
                  <Text style={{ fontSize: 11.5, fontWeight: '500', color: '#FFD86B' }}>
                    {Math.abs(props.remainingDays)} gün gecikti
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Bottom row — remaining time + actions */}
          <View style={{
            marginTop: 14, paddingTop: 12,
            borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)',
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
              <View>
                <Text style={{
                  fontSize: 9.5, color: T.onDark3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '600',
                }}>
                  Kalan süre
                </Text>
                <Text style={{
                  fontFamily: T.mono, fontSize: 22, color: T.onDark, marginTop: 3, letterSpacing: -1,
                }}>
                  {props.remainingTime}
                </Text>
              </View>
              {showProductionActions && (
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable
                      onPress={props.onPause}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                      }}
                    >
                      <Pause size={11} color={T.onDark} strokeWidth={2} />
                      <Text style={{ fontSize: 11, color: T.onDark, fontWeight: '500' }}>Duraklat</Text>
                    </Pressable>
                    <Pressable
                      onPress={props.onStageDone}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                        backgroundColor: accent,
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                      }}
                    >
                      <Text style={{ fontSize: 11, color: '#FFFFFF', fontWeight: '600' }}>Aşama tamam</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* ZAMANLAMA — operatör / kuyruk (desktop kartı bilgisi; hekim/klinik gizli) */}
          {!isDoctorView && (props.operatorMins != null || props.queueMins != null) && (
            <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' }}>
              <Text style={{ fontSize: 9.5, color: T.onDark3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '600', marginBottom: 8 }}>
                Zamanlama
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
                  <Text style={{ fontSize: 11, color: T.onDark2 }}>Operatör <Text style={{ color: T.onDark, fontWeight: '700' }}>{props.operatorMins ?? 0} dk</Text></Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' }} />
                  <Text style={{ fontSize: 11, color: T.onDark2 }}>Kuyruk <Text style={{ color: T.onDark, fontWeight: '700' }}>{props.queueMins ?? 0} dk</Text></Text>
                </View>
              </View>
            </View>
          )}

          {/* AŞAMA DETAYLARI — desktop ile TEK bileşen (StageWorkflowTimeline); node yoksa basit listeye düşer */}
          {props.stageTimelineNode ? (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' }}>
              {props.stageTimelineNode}
            </View>
          ) : (props.stageDetails && props.stageDetails.length > 0) ? (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' }}>
              <Pressable onPress={() => setStagesOpen(o => !o)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 9.5, color: T.onDark3, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '600' }}>
                  Aşama detayları
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 11, color: T.onDark2, fontWeight: '700' }}>
                    {props.stageDetails.filter(s => s.status === 'tamamlandi' || s.status === 'onaylandi').length}/{props.stageDetails.length}
                  </Text>
                  <ChevronDown size={14} color={T.onDark3} strokeWidth={2} style={{ transform: [{ rotate: stagesOpen ? '180deg' : '0deg' }] }} />
                </View>
              </Pressable>
              {stagesOpen && (
                isMultiLane && props.laneStageGroups ? (
                  /* Çok-şerit: her şeridin aşamaları AYRI grup (diş başlığı + o şeridin aşamaları) */
                  <View style={{ marginTop: 10, gap: 14 }}>
                    {props.laneStageGroups.map((g) => {
                      const gDone = g.stages.filter(s => s.status === 'tamamlandi' || s.status === 'onaylandi').length;
                      return (
                        <View key={g.lane} style={{ gap: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: accentSoft }}>
                              <Text style={{ fontSize: 10.5, fontWeight: '800', color: accent, fontFamily: T.mono }}>{g.teeth}</Text>
                            </View>
                            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            <Text style={{ fontSize: 10.5, color: T.onDark3, fontWeight: '700' }}>{gDone}/{g.stages.length}</Text>
                          </View>
                          {g.stages.map((s, i) => {
                            const done = s.status === 'tamamlandi' || s.status === 'onaylandi';
                            const active = s.status === 'aktif';
                            const dot = done || active ? accent : 'rgba(255,255,255,0.25)';
                            return (
                              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
                                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
                                <Text style={{ fontSize: 12, color: active ? T.onDark : T.onDark2, fontWeight: active ? '700' : '400', flex: 1 }} numberOfLines={1}>{s.name}</Text>
                                {done && <Text style={{ fontSize: 9, color: accent, fontWeight: '700' }}>✓</Text>}
                                {active && <Text style={{ fontSize: 9, color: accent, fontWeight: '700' }}>şu an</Text>}
                              </View>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {props.stageDetails.map((s, i) => {
                    const done = s.status === 'tamamlandi' || s.status === 'onaylandi';
                    const active = s.status === 'aktif';
                    const dot = done || active ? accent : 'rgba(255,255,255,0.25)';
                    return (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
                        <Text style={{ fontSize: 12, color: active ? T.onDark : T.onDark2, fontWeight: active ? '700' : '400', flex: 1 }} numberOfLines={1}>{s.name}</Text>
                        {done && <Text style={{ fontSize: 9, color: accent, fontWeight: '700' }}>✓</Text>}
                        {active && <Text style={{ fontSize: 9, color: accent, fontWeight: '700' }}>şu an</Text>}
                      </View>
                    );
                  })}
                </View>
                )
              )}
            </View>
          ) : null}

          {/* Revizyon oluştur — teslim edilmiş siparişte (desktop ile aynı akış) */}
          {props.onCreateRevision && (
            <View style={{ marginTop: 12 }}>
              <Pressable
                onPress={props.onCreateRevision}
                style={{
                  alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.10)',
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <RotateCcw size={13} color={T.onDark} strokeWidth={2} />
                <Text style={{ fontSize: 12, color: T.onDark, fontWeight: '700' }}>Revizyon Oluştur</Text>
              </Pressable>
            </View>
          )}

          {/* Teslimat aksiyonu — Kuryeye Gönder / Elden Teslim / Teslim Edildi (desktop ile aynı) */}
          {(props.deliveryButton || props.deliveryStatusLabel) && (
            <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              {props.deliveryStatusLabel && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)' }}>
                  <Truck size={12} color={T.onDark} strokeWidth={2} />
                  <Text style={{ fontSize: 11, color: T.onDark, fontWeight: '600' }}>{props.deliveryStatusLabel}</Text>
                </View>
              )}
              {props.deliveryButton && (
                <Pressable
                  onPress={props.deliveryButton.onPress}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: accent }}
                >
                  {props.deliveryButton.icon === 'check'
                    ? <Check size={13} color="#FFFFFF" strokeWidth={2.4} />
                    : <Truck size={13} color="#FFFFFF" strokeWidth={2} />}
                  <Text style={{ fontSize: 12, color: '#FFFFFF', fontWeight: '700' }}>{props.deliveryButton.label}</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
        )}

        {/* ═══ 4. Diş şeması — full chart kartı ═══ */}
        {props.toothChart && (
          <View style={{ paddingHorizontal: 14, marginBottom: 12 }}>
            <View style={{ padding: 14, borderRadius: 20, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontSize: 9.5, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Diş şeması
                </Text>
                <View style={{
                  paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
                  backgroundColor: accentSoft,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: accentDeep, fontFamily: T.mono }}>
                    {props.teeth.length} diş
                  </Text>
                </View>
              </View>
              {/* Tooth chart node — parent'ten gelir (LivingToothChart) */}
              <View style={{ marginHorizontal: -4 }}>
                {props.toothChart}
              </View>
              {/* Seçili dişlerin chip listesi — aktif olan vurgulu */}
              {props.teeth.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 12 }}>
                  {props.teeth.map(t => {
                    const isActive = props.activeTooth === t;
                    return (
                      <View key={t} style={{
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                        backgroundColor: isActive ? accent : accentSoft,
                      }}>
                        <Text style={{ fontSize: 10.5, fontWeight: '600', color: isActive ? '#FFFFFF' : accentDeep, fontFamily: T.mono }}>{t}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Aktif diş için iş detayı — tıklanan dişin altında açılır */}
              {props.activeTooth != null && (
                <View style={{
                  marginTop: 14, paddingTop: 14,
                  borderTopWidth: 1, borderTopColor: T.hairline,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <View style={{
                      width: 38, height: 38, borderRadius: 10,
                      backgroundColor: accent,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF', fontFamily: T.mono }}>
                        {props.activeTooth}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
                        Diş · FDI {props.activeTooth}
                      </Text>
                      <Text style={{
                        fontSize: 15, fontWeight: '500', color: T.ink, marginTop: 2,
                        ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                      }} numberOfLines={1}>
                        {props.activeToothDetail?.itemName ?? props.activeToothDetail?.workType ?? 'İş detayı'}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {/* workType pill — sadece itemName ile farklıysa göster (tekrar yok) */}
                    {props.activeToothDetail?.workType &&
                      props.activeToothDetail.workType !== props.activeToothDetail.itemName && (
                      <View style={{
                        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                        backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline,
                      }}>
                        <Text style={{ fontSize: 11, color: T.ink2, fontWeight: '500' }}>
                          {props.activeToothDetail.workType}
                        </Text>
                      </View>
                    )}
                    {props.activeToothDetail?.shade && (
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                        backgroundColor: accentSoft,
                      }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5C895', borderWidth: 1, borderColor: T.hairline }} />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: accentDeep, fontFamily: T.mono }}>
                          {props.activeToothDetail.shade}
                        </Text>
                      </View>
                    )}
                    {props.activeToothDetail?.price != null && (
                      <View style={{
                        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                        backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline,
                      }}>
                        <Text style={{ fontSize: 11, color: T.ink2, fontWeight: '500' }}>
                          ₺{(Number(props.activeToothDetail.price) || 0).toLocaleString('tr-TR')}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ═══ 5. Materyal + Renk ═══ */}
        <View style={{ paddingHorizontal: 14, marginBottom: 12, flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1.4, padding: 12, paddingHorizontal: 14, borderRadius: 20, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline }}>
            <Text style={{ fontSize: 9.5, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
              Materyal
            </Text>
            <Text style={{
              fontSize: 15, fontWeight: '500', color: T.ink, marginTop: 4,
              ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
            }} numberOfLines={2}>
              {props.material}
            </Text>
            {props.materialSub && (
              <Text style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>{props.materialSub}</Text>
            )}
          </View>
          <View style={{
            flex: 1, padding: 12, paddingHorizontal: 14, borderRadius: 20,
            backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 9.5, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
                Renk
              </Text>
              <Text style={{
                fontSize: 15, fontWeight: '500', color: T.ink, marginTop: 4,
                ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
              }} numberOfLines={1}>
                {props.colorShade}
              </Text>
            </View>
            <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#E5C895', borderWidth: 1, borderColor: T.hairline }} />
          </View>
        </View>

        {/* ═══ 5. Attachments thumb grid + voice ═══ */}
        <View style={{ paddingHorizontal: 14, marginBottom: 12 }}>
          <View style={{ padding: 14, borderRadius: 20, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={{ fontSize: 9.5, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
                Ekler · {props.attachmentCount} dosya
              </Text>
              {!props.attachmentsNode && (
                <Pressable onPress={props.onAddAttachment}>
                  <Text style={{ fontSize: 11, color: accentDeep, fontWeight: '500' }}>Ekle +</Text>
                </Pressable>
              )}
            </View>
            {props.attachmentsNode ? (
              // Gerçek dosya listesi: önizleme (göz), 3D viewer, indirme, yükleme — hepsi içinde
              props.attachmentsNode
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {props.attachments.slice(0, 4).map((f, i) => (
                  <View key={i} style={{
                    flex: 1, aspectRatio: 1, borderRadius: 14,
                    backgroundColor: i === 0 ? accentSoft : T.cardSoft,
                    borderWidth: 1, borderColor: T.hairline,
                    padding: 8, justifyContent: 'space-between',
                  }}>
                    <Text style={{ fontFamily: T.mono, fontSize: 10, fontWeight: '600', color: i === 0 ? accentDeep : T.ink2, letterSpacing: 0.4 }}>
                      {f.label}
                    </Text>
                    <Text style={{ fontSize: 10.5, fontWeight: '500', color: T.ink2 }} numberOfLines={1}>
                      {f.sub}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Lojistik — kurye hareketleri + "Kurye çağır" (desktop ile aynı bileşen) */}
        {props.logisticsNode ? (
          <View style={{ paddingHorizontal: 14, marginBottom: 12 }}>
            <View style={{ padding: 14, borderRadius: 20, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline }}>
              {props.logisticsNode}
            </View>
          </View>
        ) : null}

        {/* İptal talebi (klinik/hekim) */}
        {props.cancelNode ? (
          <View style={{ paddingHorizontal: 14, marginBottom: 12 }}>{props.cancelNode}</View>
        ) : null}

        {/* ═══ 6. Progress slider (operatör — lab/admin/teknisyen) ═══ */}
        {showOperatorProgress && (
        <View style={{ paddingHorizontal: 14, marginBottom: 12 }}>
          <View style={{ padding: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View>
                <Text style={{ fontSize: 9.5, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
                  İlerleme · operatör
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2, marginTop: 2 }}>
                  <Text style={{
                    fontSize: 22, fontWeight: '400', color: T.ink, letterSpacing: -0.4,
                    ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
                  }}>{props.operatorProgress}</Text>
                  <Text style={{ fontSize: 12, color: T.ink3 }}>%</Text>
                </View>
              </View>
            </View>
            <Bar value={props.operatorProgress} color={accent} accent={accent} hairline={T.hairline} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              {['0', '25', '50', '75', '100'].map(n => (
                <Text key={n} style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3 }}>{n}</Text>
              ))}
            </View>
          </View>
        </View>
        )}

        {/* ═══ 7. Activity log ═══ */}
        <View style={{ paddingHorizontal: 14, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingBottom: 8 }}>
            <Text style={{
              fontSize: 16, fontWeight: '500', color: T.ink, letterSpacing: -0.2,
              ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
            }}>
              Hekim Notu
            </Text>
            <View style={{
              flexDirection: 'row', gap: 4, padding: 3, borderRadius: 10,
              backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
            }}>
              {[
                { k: 'all' as const,         l: 'Tüm' },
                { k: 'doctor_note' as const, l: 'Hekim Notu' },
                { k: 'msg' as const,         l: 'Mesaj' },
              ].map(t => {
                const active = tab === t.k;
                return (
                  <Pressable
                    key={t.k}
                    onPress={() => {
                      // Mesaj tab'ına tıklarsa onChat callback'i tetikle — order-spesifik chat aç
                      if (t.k === 'msg' && props.onChat) {
                        props.onChat();
                        return;
                      }
                      setTab(t.k);
                    }}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7,
                      backgroundColor: active ? T.bgDeep : 'transparent',
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: active ? '600' : '500', color: T.ink2 }}>{t.l}</Text>
                    {/* Mesaj sekmesi okunmamış sayısı — accent yerine ruby (her panelde okunur) */}
                    {t.k === 'msg' && !!props.chatUnreadCount && props.chatUnreadCount > 0 && (
                      <View style={{ minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: T.ruby, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF' }}>{props.chatUnreadCount}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ padding: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline }}>
            {props.doctorNote && props.doctorNote.trim().length > 0 ? (
              <Text style={{ fontSize: 13, color: T.ink, lineHeight: 19 }}>
                {props.doctorNote}
              </Text>
            ) : (
              <Text style={{ fontSize: 12, color: T.ink3, fontStyle: 'italic' }}>
                Hekim henüz not eklemedi.
              </Text>
            )}
          </View>
        </View>

        {/* ═══ 8. QC quick tags (lab/admin/teknisyen — lab internal) ═══ */}
        {showQcTags && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          <Text style={{
            fontSize: 9.5, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase',
            paddingHorizontal: 6, paddingBottom: 8,
          }}>
            Hızlı işlem · etiket
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {['Doktor bekliyor', 'Yoğunluk', 'Teknisyen sorunu', 'QC Red'].map(t => {
              const isQc = t === 'QC Red';
              return (
                <Pressable key={t} style={{
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                  backgroundColor: isQc ? T.rubySoft : T.card,
                  borderWidth: 1, borderColor: isQc ? T.rubySoft : T.hairline,
                }}>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: isQc ? T.ruby : T.ink2 }}>{t}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Atoms ──────────────────────────────────────────────────────────────

function Timeline({ stages, current, accent, ink, ink3, hl }: {
  stages: { key: string; label: string }[];
  current: number;
  accent: string;
  ink: string;
  ink3: string;
  hl: string;
}) {
  // 6+ aşamada satır taşar → yatay scroll (bağlayıcılar sabit genişlik).
  // ≤5 aşamada eski görünüm: bağlayıcılar flex ile satırı doldurur.
  const many = stages.length > 6;
  const row = (
    <View style={{ flexDirection: 'row', alignItems: 'center', ...(many ? { paddingHorizontal: 2 } : {}) }}>
      {stages.map((s, i) => {
        const past = i < current;
        const active = i === current;
        return (
          <React.Fragment key={s.key}>
            <View style={{ alignItems: 'center', minWidth: many ? 52 : 44 }}>
              <View style={{
                width: 18, height: 18, borderRadius: 9,
                backgroundColor: past || active ? accent : 'transparent',
                borderWidth: active ? 0 : past ? 0 : 1.5,
                borderColor: hl,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {past && <Text style={{ fontSize: 9, color: '#FFFFFF', fontWeight: '700' }}>✓</Text>}
              </View>
              <Text style={{ fontSize: 9, color: active ? ink : ink3, marginTop: 4, textAlign: 'center' }} numberOfLines={1}>
                {s.label}
              </Text>
            </View>
            {i < stages.length - 1 && (
              <View style={{ ...(many ? { width: 20 } : { flex: 1 }), height: 1.5, backgroundColor: past ? accent : hl, marginTop: -14 }} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
  return many
    ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>{row}</ScrollView>
    : row;
}

function Ring({ value, size, stroke, color, children }: {
  value: number; size: number; stroke: number; color: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * (value / 100);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${dash} ${c}`}
          strokeLinecap="round"
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  );
}

function Bar({ value, color, accent, hairline }: { value: number; color: string; accent: string; hairline: string }) {
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: hairline, position: 'relative' }}>
      <View style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${Math.min(100, Math.max(0, value))}%`,
        backgroundColor: color, borderRadius: 4,
      }} />
      <View style={{
        position: 'absolute',
        left: `${Math.min(100, Math.max(0, value))}%`,
        top: '50%',
        width: 16, height: 16, borderRadius: 8,
        backgroundColor: accent,
        marginLeft: -8, marginTop: -8,
      }} />
    </View>
  );
}

// Quick utility — darken a hex by ratio
function darken(hex: string, ratio: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const f = 1 - ratio;
  return '#' + [r * f, g * f, b * f].map(n => Math.round(n).toString(16).padStart(2, '0')).join('');
}
