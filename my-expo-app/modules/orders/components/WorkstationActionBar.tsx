// modules/orders/components/WorkstationActionBar.tsx
// Workstation gövdesinin EN ÜSTÜNDE duran birincil aksiyon barı:
//   • Sol: küçük state aksiyon butonları (Pause / Devam / Bloklu vs.)
//   • Sağ: birincil "Tamamla" CTA — durum ve checklist'e göre gated
//
// Eski tasarımda CTA en altta kalıyordu — bu bar'ı yukarı taşımak
// kullanıcı dostuluğunu artırır.

import React, { useState } from 'react';
import { View, Text, Pressable, Platform, Modal, TextInput } from 'react-native';
import {
  Pause, Play, AlertOctagon, Check, Clock, Cog,
} from '../../../core/ui/icons';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';
import { toast } from '../../../core/ui/Toast';
import { pauseStage, resumeStage, transitionStageState, startStage } from '../api/timing';
import type { StageStatus } from '../stations/stageStates';
import { ActivityIndicator } from '../../../core/ui/teethCompat';

type ActionKey = 'pause' | 'resume' | 'machine' | 'approval' | 'block' | 'rework';

type StateAction = {
  key: ActionKey;
  label: string;
  tooltip: string;
  icon: any;
  color: string;
  bgColor: string;
  visibleIn: StageStatus[];
  invoke: (id: string) => Promise<{ ok: boolean; error?: string }>;
};

// Tek bir state action chip — kendi hover state'ini tutar, hover'da tooltip gösterir
function StateActionChip({
  action: a, isLoading, disabled, onPress,
}: {
  action: StateAction;
  isLoading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = a.icon;
  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        onPress={onPress}
        disabled={disabled || isLoading}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={{
          // Icon-only kompakt yuvarlak buton — sadece "Devam Et" durumunda label görünür
          alignItems: 'center', justifyContent: 'center',
          width: a.key === 'resume' ? undefined : 38,
          height: 38,
          paddingHorizontal: a.key === 'resume' ? 14 : 0,
          flexDirection: 'row', gap: a.key === 'resume' ? 6 : 0,
          borderRadius: 999,
          backgroundColor: hovered ? 'rgba(255,255,255,0.28)' : a.bgColor,
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
          opacity: disabled ? 0.4 : 1,
          ...(Platform.OS === 'web' ? {
            cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s',
          } as any : {}),
        }}
      >
        <Icon size={15} color={a.color} strokeWidth={2} />
        {/* Sadece "Devam Et" için metin görünür — diğerleri icon-only */}
        {a.key === 'resume' && (
          <Text style={{ fontSize: 12, fontWeight: '600', color: a.color, letterSpacing: -0.1 }}>
            {a.label}
          </Text>
        )}
      </Pressable>

      {/* Tooltip — web hover'da yukarı çıkan koyu balon */}
      {Platform.OS === 'web' && hovered && (
        <View
          // @ts-ignore web pointer-events
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            marginBottom: 8,
            paddingHorizontal: 10, paddingVertical: 7,
            borderRadius: 8,
            backgroundColor: 'rgba(15,23,42,0.95)',
            zIndex: 100,
            maxWidth: 260,
            // @ts-ignore web transform
            transform: 'translateX(-50%)',
            // @ts-ignore web style
            whiteSpace: 'normal',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          } as any}
        >
          <Text style={{ fontSize: 11, fontWeight: '500', color: '#FFFFFF', lineHeight: 15 }}>
            {a.tooltip}
          </Text>
          {/* Tooltip altındaki ok */}
          <View
            // @ts-ignore web pointer-events
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              width: 0, height: 0,
              borderStartWidth: 5, borderEndWidth: 5, borderTopWidth: 5,
              borderStartColor: 'transparent',
              borderEndColor: 'transparent',
              borderTopColor: 'rgba(15,23,42,0.95)',
              // @ts-ignore web transform
              transform: 'translateX(-50%)',
            } as any}
          />
        </View>
      )}
    </View>
  );
}

// Mavi hero zemini üstünde okunaklı — beyaz frosted bg + parlak icon rengi
const STATE_ACTIONS: Array<{
  key: ActionKey;
  label: string;
  tooltip: string;
  icon: any;
  color: string;
  bgColor: string;
  visibleIn: StageStatus[];
  invoke: (id: string) => Promise<{ ok: boolean; error?: string }>;
}> = [
  { key: 'pause',    label: 'Durdur',   tooltip: 'Mola — süre durur, "Devam Et" basana kadar beklemede kalır',
    icon: Pause,        color: '#FBBF24', bgColor: 'rgba(255,255,255,0.14)',
    visibleIn: ['aktif'],
    invoke: id => pauseStage(id) },
  { key: 'machine',  label: 'Makineye Ver', tooltip: 'Fırın / kürleme gibi bir cihaza verildi — süre "makine zamanı" sayılır ve elini serbest bırakır. Bu iş beklerken başka işe geçebilirsin; "Devam Et" ile geri dönersin.',
    icon: Cog,          color: '#67E8F9', bgColor: 'rgba(255,255,255,0.14)',
    visibleIn: ['aktif'],
    invoke: id => transitionStageState(id, 'makine_bekliyor') },
  { key: 'resume',   label: 'Devam Et', tooltip: 'İşe geri dön — süre tekrar saymaya başlar',
    icon: Play,         color: '#86EFAC', bgColor: 'rgba(255,255,255,0.14)',
    visibleIn: ['durakladi','makine_bekliyor','onay_bekliyor','bloklu','yeniden'],
    invoke: id => resumeStage(id) },
  { key: 'block',    label: 'Blokla',   tooltip: 'Engel var (malzeme yok, bilgi bekleniyor) — manager dashboard\'da uyarı görünür',
    icon: AlertOctagon, color: '#FCA5A5', bgColor: 'rgba(255,255,255,0.14)',
    visibleIn: ['aktif','durakladi'],
    invoke: id => transitionStageState(id, 'bloklu') },
];

export function WorkstationActionBar({
  stageId, status, startedAt, ctaLabel, canComplete, validationReady, submitting,
  onComplete, onStateChanged, onStarted, waitingHint, disabledLabel, blockedBy,
}: {
  stageId:           string;
  status:            StageStatus;
  startedAt:         string | null;
  ctaLabel:          string;
  canComplete:       boolean;
  validationReady:   boolean;
  submitting:        boolean;
  onComplete:        () => void;
  onStateChanged?:   () => void;
  onStarted?:        () => void;
  waitingHint?:      string;
  /** Bu aşamayı bekleten, henüz bitmemiş önceki aşamanın adı. */
  blockedBy?:        string | null;
  /** validationReady=false iken görünecek özel metin (varsayılan: "Önce Kontrol Listesi") */
  disabledLabel?:    string;
}) {
  const P = useStationTheme();
  const [busy, setBusy] = useState<ActionKey | null>(null);
  const [starting, setStarting] = useState(false);
  const [estimateModalOpen, setEstimateModalOpen] = useState(false);
  const [estimateInput, setEstimateInput] = useState('');

  // İş atandı ama henüz başlamadı → süre işlemiyor, sadece kuyruk bekleme süresi birikiyor
  const notStartedYet = status === 'aktif' && !startedAt;

  const visibleActions = STATE_ACTIONS.filter(a => a.visibleIn.includes(status));

  function openStartFlow() {
    setEstimateInput('');
    setEstimateModalOpen(true);
  }

  async function confirmStart() {
    if (starting) return;
    const parsed = parseInt(estimateInput.trim(), 10);
    const estimate = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    setStarting(true);
    try {
      const res = await startStage(stageId, estimate);
      if (!res.ok) {
        toast.error(`Başlatılamadı: ${res.error ?? ''}`);
        return;
      }
      toast.success('İşe başlandı ✓');
      setEstimateModalOpen(false);
      onStarted?.();
    } finally {
      setStarting(false);
    }
  }

  // Bekliyor: CTA yerine NEDEN + hangi aşamanın beklendiği.
  // "Sıra sana gelmedi" tek başına yetmiyordu — teknisyen kimi beklediğini
  // bilmeden ne yapacağını da bilemiyor (§8 error-clarity: sebep + çıkış yolu).
  if (status === 'bekliyor') {
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'flex-start', gap: 11,
        padding: 14, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
      }}>
        <View style={{
          width: 30, height: 30, borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.18)',
          alignItems: 'center', justifyContent: 'center', marginTop: 1,
        }}>
          <Clock size={15} color="#FFFFFF" strokeWidth={2} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
            {blockedBy ? `Önce "${blockedBy}" bitmeli` : 'Sıra henüz sana gelmedi'}
          </Text>
          <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.78)', lineHeight: 16 }}>
            {waitingHint ?? 'O aşama tamamlandığında bu iş otomatik olarak sana açılır — bir şey yapmana gerek yok.'}
          </Text>
        </View>
      </View>
    );
  }

  async function runAction(action: typeof STATE_ACTIONS[number]) {
    if (busy) return;
    setBusy(action.key);
    try {
      const res = await action.invoke(stageId);
      if (!res.ok) {
        toast.error(`${action.label} başarısız: ${res.error ?? ''}`);
        return;
      }
      toast.success(`${action.label} ✓`);
      onStateChanged?.();
    } finally {
      setBusy(null);
    }
  }

  // ── Henüz başlamamış aktif iş → "İŞE BAŞLA" CTA (TAMAMLA gizli) ──
  if (notStartedYet) {
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 14, borderRadius: 14,
        backgroundColor: P.surface,
        borderWidth: 1, borderColor: hexA(P.accent, 0.28),
        ...(Platform.OS === 'web' ? {
          boxShadow: '0 4px 14px rgba(15,23,42,0.10)',
        } as any : {}),
      }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: P.accentDeep, letterSpacing: 0.6, textTransform: 'uppercase' }}>
            Sıra Sende
          </Text>
          <Text style={{ fontSize: 12, color: P.ink700, fontWeight: '500' }}>
            Süre, "İşe Başla" butonuna basana kadar işlemez. Şu an kuyrukta bekliyor.
          </Text>
        </View>
        <Pressable
          onPress={openStartFlow}
          disabled={starting}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12,
            backgroundColor: P.accent,
            opacity: starting ? 0.6 : 1,
            ...(Platform.OS === 'web' ? {
              cursor: starting ? 'wait' : 'pointer',
              boxShadow: `0 6px 18px ${hexA(P.accent, 0.32)}`,
            } as any : {}),
          }}
        >
          <Play size={14} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.4, textTransform: 'uppercase' }}>
            İşe Başla
          </Text>
        </Pressable>

        <EstimateModal
          visible={estimateModalOpen}
          value={estimateInput}
          onChange={setEstimateInput}
          onCancel={() => setEstimateModalOpen(false)}
          onConfirm={confirmStart}
          submitting={starting}
        />
      </View>
    );
  }

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 8,
      justifyContent: 'flex-end',
      flexWrap: 'wrap', rowGap: 8,
    }}>
      {/* Sol — icon-only state butonları (Durdur, Blokla) */}
      {visibleActions.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {visibleActions.map(a => (
            <StateActionChip
              key={a.key}
              action={a}
              isLoading={busy === a.key}
              disabled={!!busy && busy !== a.key}
              onPress={() => runAction(a)}
            />
          ))}
        </View>
      )}

      {/* Sağ — birincil CTA (sadece aktif stage'de) */}
      {status === 'aktif' && (
        <View style={{ position: 'relative', borderRadius: 999, overflow: 'hidden' }}>
          <Pressable
            onPress={canComplete ? onComplete : undefined}
            disabled={!canComplete}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
              height: 38, paddingHorizontal: 14, borderRadius: 999,
              // Mavi hero üstünde okunaklı: beyaz pill + accent text
              backgroundColor: validationReady ? '#FFFFFF' : 'rgba(255,255,255,0.30)',
              opacity: submitting ? 0.5 : 1,
              ...(Platform.OS === 'web' ? {
                cursor: !canComplete ? 'not-allowed' : 'pointer',
                boxShadow: !canComplete ? 'none' : '0 4px 12px rgba(255,255,255,0.22)',
              } as any : {}),
            }}
          >
            <Check size={13} color={validationReady ? P.accentDeep : 'rgba(255,255,255,0.6)'} strokeWidth={2.5} />
            {validationReady && !submitting ? (
              <Text style={{
                fontSize: 11.5, fontWeight: '700',
                color: P.accentDeep,
                letterSpacing: 0.3, textTransform: 'uppercase',
              }} numberOfLines={1}>
                {ctaLabel}
              </Text>
            ) : submitting ? (
              <Text style={{
                fontSize: 12.5, fontWeight: '700', color: P.accentDeep,
                letterSpacing: 0.3, textTransform: 'uppercase',
              }}>Kontrol…</Text>
            ) : (
              <Text style={{
                fontSize: 11.5, fontWeight: '700',
                color: 'rgba(255,255,255,0.85)',
                letterSpacing: 0.3, textTransform: 'uppercase',
              }} numberOfLines={1}>
                {disabledLabel ?? 'Önce Kontrol Listesi'}
              </Text>
            )}
          </Pressable>
          {/* BorderBeam animasyonu kaldırıldı — sade buton tercih */}
        </View>
      )}

      {/* Diğer durumlar (paused/blocked vs) — devam et için yardımcı mesaj.
         Dar ekranda chips ile aynı satıra sığmazsa flexWrap ile alt satıra iner. */}
      {status !== 'aktif' && (
        <View style={{
          paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12,
          backgroundColor: P.surface, borderWidth: 1, borderColor: P.ink100,
          flexDirection: 'row', alignItems: 'center', gap: 8,
          flexShrink: 1, minWidth: 0,
        }}>
          <Text style={{ fontSize: 12, color: P.ink700, fontWeight: '500', flexShrink: 1 }}>
            Tamamlamak için önce <Text style={{ fontWeight: '700' }}>Devam Et</Text>'e bas
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Estimate Modal — teknisyenden takribi süre alır ──
function EstimateModal({
  visible, value, onChange, onCancel, onConfirm, submitting,
}: {
  visible:    boolean;
  value:      string;
  onChange:   (v: string) => void;
  onCancel:   () => void;
  onConfirm:  () => void;
  submitting: boolean;
}) {
  const P = useStationTheme();
  const presets = [15, 30, 60, 120];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1, backgroundColor: 'rgba(15,23,42,0.45)',
          alignItems: 'center', justifyContent: 'center', padding: 24,
        }}
      >
        <Pressable
          onPress={() => { /* swallow */ }}
          style={{
            width: '100%', maxWidth: 380,
            backgroundColor: P.surface, borderRadius: 18, padding: 22, gap: 14,
            ...(Platform.OS === 'web' ? {
              boxShadow: '0 24px 60px rgba(15,23,42,0.20)',
            } as any : {}),
          }}
        >
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: P.accentDeep, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              Takribi süre
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: P.ink900 }}>
              Bu işi yaklaşık kaç dakikada bitirirsin?
            </Text>
            <Text style={{ fontSize: 12, color: P.ink500 }}>
              Tahmin, ilerleme yüzdesi için kullanılır. Boş bırakırsan yalnızca süre takibi yapılır.
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {presets.map(m => (
              <Pressable
                key={m}
                onPress={() => onChange(String(m))}
                style={{
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                  backgroundColor: value === String(m) ? P.accent : hexA(P.accent, 0.08),
                  borderWidth: 1, borderColor: hexA(P.accent, value === String(m) ? 0.4 : 0.2),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <Text style={{
                  fontSize: 12, fontWeight: '700',
                  color: value === String(m) ? '#FFFFFF' : P.accentDeep,
                }}>
                  {m < 60 ? `${m} dk` : `${m / 60} sa`}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder="örn. 45"
            keyboardType="numeric"
            inputMode="numeric"
            style={{
              borderWidth: 1, borderColor: P.ink100, borderRadius: 12,
              paddingHorizontal: 14, paddingVertical: 12,
              fontSize: 16, color: P.ink900,
              backgroundColor: P.surfaceAlt,
              // @ts-ignore web
              outlineWidth: 0,
            }}
          />

          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Pressable
              onPress={onCancel}
              disabled={submitting}
              style={{
                paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
                backgroundColor: P.surfaceAlt,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: P.ink700 }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={submitting}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10,
                backgroundColor: P.accent,
                opacity: submitting ? 0.6 : 1,
                ...(Platform.OS === 'web' ? {
                  cursor: submitting ? 'wait' : 'pointer',
                  boxShadow: `0 6px 18px ${hexA(P.accent, 0.32)}`,
                } as any : {}),
              }}
            >
              <Play size={13} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 }}>
                İşe Başla
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
