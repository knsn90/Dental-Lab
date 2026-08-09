// modules/orders/components/ActiveJobHero.tsx
// İşlerim sayfası için sade seçili-iş hero kartı (animasyonsuz).
// Üstte denim gradient + istasyon adı; altta beyaz section + hasta/sipariş + workflow timeline.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Platform, useWindowDimensions } from 'react-native';
import { AlertTriangle, Calendar, Clock, Inbox, Pause, Play, Zap } from 'lucide-react-native';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';
import { getStationDescriptor } from '../stations/registry';
import { WorkflowTimeline, type TimelineStage } from './WorkflowTimeline';
import { StageStateBadge } from './StageStateBadge';
import { MasterWorkflowTimeline, type MasterStep } from './MasterWorkflowTimeline';
import type { StageStatus } from '../stations/stageStates';

const SERIF = {
  fontFamily: Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light',
  fontWeight: '300' as const,
};

// "ÇALIŞIYOR" yeşil dot pulse keyframe — bir kez inject
let _heroDotPulseInjected = false;
function HeroDotPulseKeyframes() {
  if (typeof document === 'undefined') return null;
  if (!_heroDotPulseInjected) {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes heroDotPulse {
        0%   { box-shadow: 0 0 0 0   rgba(134,239,172,0.6); }
        100% { box-shadow: 0 0 0 8px rgba(134,239,172,0); }
      }
    `;
    document.head.appendChild(style);
    _heroDotPulseInjected = true;
  }
  return null;
}

export interface ActiveJobHeroData {
  stage_id:        string;
  sequence_order:  number;
  station_name:    string | null;
  patient_name:    string | null;
  order_number:    string;
  work_type_label: string | null;
  is_critical:     boolean;
  is_urgent:       boolean;
  status:          StageStatus;
  assigned_at:     string | null;
  started_at:      string | null;
  delivery_date:   string | null;
  // Pause-aware timer fields (opsiyonel — backward compat)
  active_work_seconds?:    number;
  paused_seconds_total?:   number;
  last_active_started_at?: string | null;
  paused_at?:              string | null;
  // Bağlam — full işin "kimi/neyi/ne kadar" özeti
  doctor_name:     string | null;
  clinic_name:     string | null;
  tooth_count:     number;
  shade:           string | null;
}

export function ActiveJobHero({
  job, timeline, totalActive, idleLabel, dueLabel, masterStep, actionSlot,
}: {
  job:         ActiveJobHeroData | null;
  timeline:    TimelineStage[];
  totalActive: number;
  idleLabel:   string | null;
  dueLabel:    { text: string; tone: 'neutral' | 'warning' | 'danger' } | null;
  masterStep?: MasterStep;
  /** Birincil CTA bloğu — "İşe Başla" / "Tamamla" aksiyon barı */
  actionSlot?: React.ReactNode;
}) {
  const P = useStationTheme();
  const desc = useMemo(() => getStationDescriptor(job?.station_name ?? null), [job?.station_name]);
  const Icon = desc.icon;
  const isWaiting = job?.status === 'bekliyor';
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Canlı saniye tick — Hero içindeki "BU AŞAMA" canlı sayacı için
  const [, setTimeTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTimeTick(x => x + 1), 1_000);
    return () => clearInterval(t);
  }, []);

  // Pause-aware elapsed: durdurulduğunda timer artmaz.
  //   elapsed = active_work_seconds + (status='aktif' ve last_active_started_at varsa → now - last_active_started_at)
  // Fallback: timing kolonları yoksa eski davranış (now - started_at).
  const liveStageElapsedSec = (() => {
    if (!job?.started_at) return 0;
    const baseSec = job.active_work_seconds ?? 0;
    const lastActive = job.last_active_started_at;
    if (job.status === 'aktif' && lastActive) {
      const liveDelta = Math.max(0, Math.floor((Date.now() - new Date(lastActive).getTime()) / 1000));
      return baseSec + liveDelta;
    }
    // Status aktif değil (durakladi, vb.) → sadece birikmiş active_work_seconds göster
    if (job.active_work_seconds != null) {
      return baseSec;
    }
    // Backward compat: timing kolonları yoksa wall-clock
    return Math.max(0, Math.floor((Date.now() - new Date(job.started_at).getTime()) / 1000));
  })();
  const liveQueueWaitSec = (job?.assigned_at && !job?.started_at)
    ? Math.max(0, Math.floor((Date.now() - new Date(job.assigned_at).getTime()) / 1000))
    : 0;
  const fmtLive = (sec: number): string => {
    if (sec < 0) sec = 0;
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (d > 0) return `${d}g ${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  };

  // Tone bazlı bottom-row chip rengi
  const dueChipColor = dueLabel?.tone === 'danger'
    ? '#FCA5A5'
    : dueLabel?.tone === 'warning' ? '#FBBF24'
    : 'rgba(255,255,255,0.7)';

  // Canlı timer bloğu — masaüstünde başlığın sağında, mobilde başlığın altında (tam okunur)
  const timerBlock = (job && job.status !== 'bekliyor') ? (
    <View style={{
      alignItems: isMobile ? 'flex-start' : 'flex-end',
      minWidth: isMobile ? undefined : 110,
      marginTop: isMobile ? 12 : 0,
    }}>
      {job.started_at ? (
        <>
          <Text style={{
            fontSize: 9.5, fontWeight: '700',
            color: 'rgba(255,255,255,0.65)',
            letterSpacing: 1.0, textTransform: 'uppercase',
          }}>
            Bu Aşama
          </Text>
          <Text style={{
            ...SERIF, fontSize: isMobile ? 30 : 32, color: '#FFFFFF',
            letterSpacing: -0.5, lineHeight: isMobile ? 34 : 36,
            marginTop: 2,
            fontVariant: ['tabular-nums'] as any,
          }}>
            {fmtLive(liveStageElapsedSec)}
          </Text>
          {(() => {
            const isPaused = job.status === 'durakladi';
            const isBlocked = ['bloklu','makine_bekliyor','onay_bekliyor','yeniden'].includes(job.status as string);
            const dotColor = isPaused ? '#FBBF24' : isBlocked ? '#FCA5A5' : '#86EFAC';
            const dotShadow = isPaused ? 'rgba(251,191,36,0.6)' : isBlocked ? 'rgba(252,165,165,0.6)' : 'rgba(134,239,172,0.6)';
            const label = isPaused ? 'DURAKLATILDI' : isBlocked ? 'BLOKLU' : 'ÇALIŞIYOR';
            const animate = !isPaused && !isBlocked;
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <View style={{
                  width: 6, height: 6, borderRadius: 3,
                  backgroundColor: dotColor,
                  ...(Platform.OS === 'web' && animate
                    ? { boxShadow: `0 0 0 0 ${dotShadow}`, animation: 'heroDotPulse 1.6s ease-out infinite' } as any
                    : {}),
                }} />
                <Text style={{ fontSize: 10, fontWeight: '600', color: dotColor, letterSpacing: 0.5 }}>
                  {label}
                </Text>
              </View>
            );
          })()}
        </>
      ) : (
        <>
          <Text style={{
            fontSize: 9.5, fontWeight: '700',
            color: 'rgba(252,211,77,0.85)',
            letterSpacing: 1.0, textTransform: 'uppercase',
          }}>
            Kuyrukta
          </Text>
          <Text style={{
            ...SERIF, fontSize: isMobile ? 30 : 32, color: '#FFFFFF',
            letterSpacing: -0.5, lineHeight: isMobile ? 34 : 36,
            marginTop: 2,
            fontVariant: ['tabular-nums'] as any,
          }}>
            {fmtLive(liveQueueWaitSec)}
          </Text>
          <Text style={{
            fontSize: 9.5, fontWeight: '500',
            color: 'rgba(255,255,255,0.55)', marginTop: 2,
          }}>
            süre işlemiyor
          </Text>
        </>
      )}
      {Platform.OS === 'web' && job.started_at && <HeroDotPulseKeyframes />}
    </View>
  ) : null;

  // İlk yapı — üst yarı koyu denim gradient, alt yarı beyaz
  return (
    <View
      style={{
        backgroundColor: P.surface,
        borderRadius: 24,
        overflow: 'hidden',
        ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } as any : {}),
      }}
    >
      {/* ═══ ÜST — Denim gradient hero ═══ */}
      <View style={{
        // @ts-ignore web gradient
        backgroundImage: `linear-gradient(135deg, ${P.accentDeep} 0%, ${P.ctaBg} 100%)`,
        backgroundColor: P.ctaBg,
        minHeight: 180,
        position: 'relative',
        overflow: 'hidden',
        paddingHorizontal: isMobile ? 16 : 24, paddingTop: isMobile ? 18 : 22, paddingBottom: 18,
      }}>
        {/* Top row — state badge + critical/urgent */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, zIndex: 1 }}>
          {job ? (
            <StageStateBadge status={job.status} size="md" filled />
          ) : (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.15)',
            }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.8 }}>
                BEKLEMEDE
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {job?.is_urgent && (
              <View style={{
                paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                backgroundColor: 'rgba(220,38,38,0.95)',
                flexDirection: 'row', alignItems: 'center', gap: 4,
              }}>
                <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4 }}>
                  ACİL
                </Text>
              </View>
            )}
            {job?.is_critical && (
              <View style={{
                paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                backgroundColor: 'rgba(217,119,6,0.95)',
                flexDirection: 'row', alignItems: 'center', gap: 4,
              }}>
                <AlertTriangle size={9} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4 }}>
                  KRİTİK
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Center — Icon + Title */}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-start', marginTop: 14, gap: 8, zIndex: 1 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 14,
            alignSelf: 'stretch',  // tüm satır genişliği — timer en sağa yapışsın
          }}>
            <View style={{
              width: 56, height: 56, borderRadius: 16,
              backgroundColor: hexA(P.accent, 0.20),
              borderWidth: 1.5, borderColor: hexA(P.accent, 0.45),
              alignItems: 'center', justifyContent: 'center',
            }}>
              {job ? <Icon size={26} color="#FFFFFF" strokeWidth={1.7} /> : <Inbox size={26} color="rgba(255,255,255,0.7)" strokeWidth={1.6} />}
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              {job ? (
                <>
                  {/* Eskiden başlık İSTASYON ADIYDI ve aynı kelime ekranda üç kez
                      geçiyordu: kuyruk kartı → hero eyebrow → hero başlığı. Üstelik
                      teknisyen hangi istasyonda çalıştığını zaten biliyor; bilmediği
                      HANGİ HASTA. Kimlik başlığa, istasyon etikete alındı. */}
                  <Text style={{
                    fontSize: 10.5, fontWeight: '700',
                    color: 'rgba(255,255,255,0.65)',
                    letterSpacing: 1.4, textTransform: 'uppercase',
                  }}>
                    {job.station_name ?? desc.eyebrow} · Aşama #{job.sequence_order}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={{
                      ...SERIF, fontSize: isMobile ? 26 : 32,
                      color: '#FFFFFF',
                      letterSpacing: isMobile ? -0.6 : -0.8, lineHeight: isMobile ? 30 : 36,
                      marginTop: 2,
                    }}
                  >
                    {job.patient_name ?? 'Hasta belirtilmemiş'}
                  </Text>
                  <Text numberOfLines={1} style={{
                    fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 3,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}>
                    #{job.order_number}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{
                    fontSize: 10.5, fontWeight: '700',
                    color: 'rgba(255,255,255,0.55)',
                    letterSpacing: 1.4, textTransform: 'uppercase',
                  }}>
                    Workstation
                  </Text>
                  <Text style={{
                    ...SERIF, fontSize: 28,
                    color: 'rgba(255,255,255,0.95)',
                    letterSpacing: -0.7, lineHeight: 32, marginTop: 2,
                  }}>
                    Bir iş seç
                  </Text>
                </>
              )}
            </View>

            {/* Masaüstü — timer başlığın sağında */}
            {!isMobile && timerBlock}
          </View>

          {/* Mobil — timer başlığın altında, tam okunur */}
          {isMobile && timerBlock}
        </View>

        {/* Bottom row — quick chips */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
          gap: 12, marginTop: 14, zIndex: 1,
        }}>
          {job && idleLabel && !isWaiting && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Clock size={11} color="rgba(255,255,255,0.7)" strokeWidth={1.8} />
              <Text style={{ fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.85)' }}>
                {idleLabel}
              </Text>
            </View>
          )}
          {job && dueLabel && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Calendar size={11} color={dueChipColor} strokeWidth={1.8} />
              <Text style={{
                fontSize: 11, fontWeight: '600',
                color: dueLabel.tone !== 'neutral' ? dueChipColor : 'rgba(255,255,255,0.85)',
              }}>
                {dueLabel.text}
              </Text>
            </View>
          )}
        </View>

        {/* ★ Action slot — timer'ın altında, mavi alanda.
            ÖNCEDEN `status !== 'bekliyor'` koşulu vardı: sırası gelmemiş işte
            hiçbir şey render edilmiyordu. Oysa WorkstationActionBar o durum için
            zaten açıklama döndürüyor — kod yazılmış ama hiç gösterilmiyordu.
            Sonuç: teknisyen işe bakıyor, buton yok, sebep yok, boşluk var.
            Kural (§9 empty-nav-state): kullanılamayan bir hedefi sessizce gizleme,
            NEDENİNİ söyle. */}
        {job && actionSlot && (
          <View style={{ marginTop: 16, zIndex: 1 }}>
            {actionSlot}
          </View>
        )}
      </View>

      {/* ═══ ALT — White section: bağlam (action slot mavi alana taşındı) ═══ */}
      {job ? (
        <View style={{ paddingHorizontal: isMobile ? 16 : 24, paddingTop: 16, paddingBottom: 18, gap: 12 }}>
          {/* Hasta adı + sipariş no artık HERO'da — burada tekrar edilmez.
              Kalan: kimin gönderdiği (hekim/klinik) ve işin özellikleri. */}
          <View style={{ gap: 8 }}>
            {(job.doctor_name || job.clinic_name) && (
              <Text style={{ fontSize: 12, color: P.ink500 }} numberOfLines={1}>
                {job.doctor_name && <Text style={{ color: P.ink700, fontWeight: '600' }}>{job.doctor_name}</Text>}
                {job.doctor_name && job.clinic_name && ' · '}
                {job.clinic_name}
              </Text>
            )}

            {/* İş türü — tam genişlik, çok satır okunur */}
            {job.work_type_label && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 2 }}>
                <Text style={{ fontSize: 9.5, fontWeight: '700', color: P.ink400, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 3 }}>
                  İş
                </Text>
                <Text style={{ flex: 1, fontSize: 13, color: P.ink700, lineHeight: 18 }} numberOfLines={3}>
                  {job.work_type_label}
                </Text>
              </View>
            )}
          </View>

          {/* Hızlı bağlam chips: diş sayısı + renk + work type */}
          {(job.tooth_count > 0 || job.shade) && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {job.tooth_count > 0 && (
                <HeroChip label={`${job.tooth_count} diş`} />
              )}
              {job.shade && (
                <HeroChip label={`Renk ${job.shade}`} />
              )}
            </View>
          )}

          {/* Süre dağılımı bandı — aktif çalışma / mola / sırada / makine */}
          {job.started_at && (job.active_work_seconds != null || (job.paused_seconds_total ?? 0) > 0) && (
            <View style={{
              flexDirection: 'row', flexWrap: 'wrap', gap: 14,
              paddingTop: 10,
              borderTopWidth: 1, borderTopColor: P.ink100,
            }}>
              <TimingChip
                icon="play"
                label="Aktif"
                value={fmtCompact(liveStageElapsedSec)}
                color="#059669"
              />
              {(job.paused_seconds_total ?? 0) > 0 && (
                <TimingChip
                  icon="pause"
                  label="Mola"
                  value={fmtCompact(job.paused_seconds_total ?? 0)}
                  color="#D97706"
                />
              )}
              {job.assigned_at && (
                <TimingChip
                  icon="clock"
                  label="Sırada"
                  value={fmtCompact(Math.floor(((job.started_at ? new Date(job.started_at).getTime() : Date.now()) - new Date(job.assigned_at).getTime()) / 1000))}
                  color="#6B7280"
                />
              )}
            </View>
          )}

          {/* Üst-seviye iş yaşam döngüsü.
              MOBİLDE tek satıra indirildi: 6 adımlık şerit ~60px kaplıyor ve
              HEKİM NOTUNU ekranın altına itiyordu. Teknisyen zaten üretimde
              olduğunu biliyor; ihtiyacı olan "siparişin neresindeyim" bilgisi
              tek satırda korunur. Masaüstünde tam şerit kalır (yer var). */}
          {masterStep && (
            isMobile ? (
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingTop: 10, borderTopWidth: 1, borderTopColor: P.ink100,
              }}>
                <Text style={{ fontSize: 9.5, fontWeight: '700', color: P.ink400, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Sipariş Akışı
                </Text>
                <View style={{ flex: 1 }} />
                <MasterStepInline currentStep={masterStep} />
              </View>
            ) : (
              <View style={{ paddingTop: 12 }}>
                <Text style={{ fontSize: 9.5, fontWeight: '700', color: P.ink400, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                  Sipariş Akışı
                </Text>
                <MasterWorkflowTimeline currentStep={masterStep} />
              </View>
            )
          )}

          {/* "Üretim Adımları" sub-timeline kaldırıldı — Sipariş Akışı yeterli odak. */}
        </View>
      ) : (
        <View style={{ paddingHorizontal: 24, paddingVertical: 18, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: P.ink500, textAlign: 'center' }}>
            {isMobile
              ? 'Yukarıdaki listeden bir iş seç — araçlar burada açılır.'
              : 'Soldan aktif işlerinden birini seç — workstation araçları burada açılır.'}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Sipariş akışının tek satırlık hâli: "Üretim · 3/6" + minik ilerleme noktaları.
 * Adım adları ve sıra korunur; yalnız dikey yer harcanmaz.
 */
function MasterStepInline({ currentStep }: { currentStep: MasterStep }) {
  const P = useStationTheme();
  const LABELS: Record<string, string> = {
    alindi: 'Alındı', planlama: 'Planlama', uretim: 'Üretim',
    qc: 'QC', hazir: 'Hazır', teslim: 'Teslim',
  };
  const ORDER = ['alindi', 'planlama', 'uretim', 'qc', 'hazir', 'teslim'];
  const idx = Math.max(0, ORDER.indexOf(currentStep));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {ORDER.map((k, i) => (
          <View
            key={k}
            style={{
              width: i === idx ? 14 : 5, height: 5, borderRadius: 3,
              backgroundColor: i < idx ? hexA(P.accent, 0.35)
                             : i === idx ? P.accent
                             : P.ink300,
            }}
          />
        ))}
      </View>
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: P.ink700 }}>
        {LABELS[currentStep] ?? currentStep}
      </Text>
      <Text style={{ fontSize: 10.5, color: P.ink400 }}>{idx + 1}/{ORDER.length}</Text>
    </View>
  );
}

function HeroChip({ label }: { label: string }) {
  const P = useStationTheme();
  return (
    <View style={{
      paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6,
      backgroundColor: hexA(P.accent, 0.10),
      borderWidth: 1, borderColor: hexA(P.accent, 0.22),
    }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: P.accentDeep }}>
        {label}
      </Text>
    </View>
  );
}

// Süre dağılımı band'ı için kompakt chip (ikon + label + değer)
function TimingChip({ icon, label, value, color }: {
  icon: 'play' | 'pause' | 'clock';
  label: string;
  value: string;
  color: string;
}) {
  const P = useStationTheme();
  const IconCmp = icon === 'play' ? Play : icon === 'pause' ? Pause : Clock;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{
        width: 20, height: 20, borderRadius: 5,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: hexA(color, 0.12),
      }}>
        <IconCmp size={11} color={color} strokeWidth={2.2} />
      </View>
      <View>
        <Text style={{ fontSize: 9.5, fontWeight: '700', color: P.ink400, letterSpacing: 0.6, textTransform: 'uppercase' }}>
          {label}
        </Text>
        <Text style={{
          fontSize: 12, fontWeight: '700', color,
          fontVariant: ['tabular-nums'] as any,
          marginTop: 0,
        }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

// Compact human-readable süre formatı: 12dk · 1s 24dk · 3g 5s
function fmtCompact(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return '0dk';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return h > 0 ? `${d}g ${h}s` : `${d}g`;
  if (h > 0) return m > 0 ? `${h}s ${m}dk` : `${h}s`;
  return `${m}dk`;
}
