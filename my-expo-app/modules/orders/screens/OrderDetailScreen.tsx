import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  Alert,
  Platform,
  useWindowDimensions,
  Animated,
  Easing,
} from 'react-native';
import { toast } from '../../../core/ui/Toast';
import { BrandedQR } from '../../../core/ui/BrandedQR';
import { useLocalSearchParams, useRouter, useNavigation, useSegments } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useOrderDetail } from '../hooks/useOrderDetail';
import { useAuthStore } from '../../../core/store/authStore';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { advanceOrderStatus } from '../api';
import { deleteOrder as deleteOrderApi } from '../../admin/orders/service';
import { uploadPhoto, pickPhoto, takePhoto } from '../../../lib/photos';
import { StatusTimeline } from '../components/StatusTimeline';
import { StatusUpdateModal } from '../components/StatusUpdateModal';
import { ProvaSection } from '../components/ProvaSection';
import { OrderItemsSection } from '../components/OrderItemsSection';
import { ToothNumberPicker } from '../components/ToothNumberPicker';
import { STATUS_CONFIG, STATUS_ORDER, isOrderOverdue, formatDeliveryDate, getNextStatus } from '../constants';
import { WorkOrder, WorkOrderStatus } from '../types';
import { fetchPatientOrders } from '../../provas/api';
import { C } from '../../../core/theme/colors';
import { useChatMessages } from '../hooks/useChatMessages';
import { uploadChatAttachment } from '../chatApi';
import { ToothIcon } from '../../../components/icons/ToothIcon';
import { StepTimeline } from '../../production/components/StepTimeline';
import { useCaseSteps } from '../../production/hooks/useCaseSteps';
import { useOrderStages } from '../hooks/useOrderStages';
import { printDeliveryReceipt } from '../../receipt/printReceipt';
import { createInvoiceFromOrder } from '../../invoices/api';
import { StageActionPanel } from '../components/StageActionPanel';
import { LivingToothChart } from '../components/LivingToothChart';
import { OrderTicketCard } from '../components/OrderTicketCard';
import { UsedMaterialsSection } from '../components/UsedMaterialsSection';
import { MaterialForecastSection } from '../components/MaterialForecastSection';
import { OrderCostSection } from '../components/OrderCostSection';
import { ChatDetail } from '../components/MessagesPopup';
import { FilesUploadModal, UploadAttachment } from '../components/FilesUploadModal';
import { StageChecklistModal } from '../components/StageChecklistModal';
import { QCRejectModal } from '../components/QCRejectModal';
import { ManagerPanel } from '../components/ManagerPanel';
import { HeroManagerSection } from '../components/hero-manager';
import { legacyStatusToStage, STAGE_ORDER, type Stage } from '../stages';
import { supabase } from '../../../lib/supabase';

import { AppIcon } from '../../../core/ui/AppIcon';
import { SpotlightBackground } from '../../../core/ui/SpotlightBackground';
import Svg, { Circle as SvgCircle } from 'react-native-svg';

type Section = 'details' | 'steps' | 'prova' | 'vaka' | 'billing' | 'doctor' | 'files' | 'chat';

const SECTIONS: { key: Section; icon: string; label: string }[] = [];

// ── Panel temasına göre hero card ─────────────────────────────────────────────
// backgroundImage overlay pattern (HeatmapLegend.tsx'te çalışan yöntem)

interface HeroTheme {
  baseBg:           string;                       // solid backgroundColor — tüm platformlar
  gradientCss:      string;                       // CSS backgroundImage — web overlay View'e uygulanır
  shadowColor:      string;
  glowColor:        string;                       // native glow View rengi
  discBg:           string;
  accent:           string;
  spotlightColors:  [string, string, string];    // SpotlightBackground için 3 farklı ton
}

function getHeroPanelTheme(
  userType?: string | null,
  _role?: string | null,
): HeroTheme {
  switch (userType) {

    case 'admin':
      return {
        baseBg:      '#0A0A0A',
        gradientCss: 'radial-gradient(ellipse 100% 260px at 50% 100%, rgba(82,82,91,0.55), transparent)',
        shadowColor: '#000',
        glowColor:   'rgba(113,113,122,0.28)',
        discBg:      '#141416',
        accent:      '#D4D4D8',
        // Siyah + gri tonları — admin paneli minimalist, monokrom
        spotlightColors: [
          'rgba(212,212,216,0.55)',  // zinc-300 — açık gri vurgu
          'rgba(82,82,91,0.65)',     // zinc-600 — orta gri
          'rgba(39,39,42,0.85)',     // zinc-800 — derin koyu
        ],
      };

    case 'doctor':
      return {
        baseBg:      '#020F0A',
        gradientCss: 'radial-gradient(ellipse 100% 260px at 50% 100%, rgba(16,185,129,0.52), transparent)',
        shadowColor: '#064E3B',
        glowColor:   'rgba(16,185,129,0.26)',
        discBg:      '#041F14',
        accent:      '#34D399',
        // Emerald + teal — sağlık/şifa hissi, canlı yeşil tonları
        spotlightColors: [
          'rgba(52,211,153,0.85)',   // emerald-400 — canlı yeşil
          'rgba(20,184,166,0.70)',   // teal-500 — turkuaza yakın
          'rgba(34,197,94,0.75)',    // green-500 — saf yeşil
        ],
      };

    case 'clinic_admin':
      return {
        baseBg:      '#08020F',
        gradientCss: 'radial-gradient(ellipse 100% 260px at 50% 100%, rgba(139,92,246,0.55), transparent)',
        shadowColor: '#4C1D95',
        glowColor:   'rgba(139,92,246,0.28)',
        discBg:      '#130828',
        accent:      '#C4B5FD',
        // Lavanta + pembe — klinik paneli, sıcak ve davetkar tonlar
        spotlightColors: [
          'rgba(196,181,253,0.85)',  // violet-300 — açık lavanta
          'rgba(244,114,182,0.75)',  // pink-400 — canlı pembe
          'rgba(139,92,246,0.75)',   // violet-500 — orta mor
        ],
      };

    case 'lab':
    default:
      return {
        baseBg:      '#050C1A',
        gradientCss: 'radial-gradient(ellipse 100% 260px at 50% 100%, rgba(37,99,235,0.58), transparent)',
        shadowColor: '#1E40AF',
        glowColor:   'rgba(37,99,235,0.30)',
        discBg:      '#081428',
        accent:      '#60A5FA',
        // Saf mavi paleti — cyan/yeşil ton yok
        spotlightColors: [
          'rgba(96,165,250,0.85)',   // blue-400 — açık mavi (sol)
          'rgba(59,130,246,0.80)',   // blue-500 — orta mavi
          'rgba(37,99,235,0.75)',    // blue-600 — derin mavi (sağ)
        ],
      };
  }
}

// ── Step short labels (for hero card stepper) ────────────────────────────────
const STEP_SHORT: Record<string, string> = {
  alindi:          'Alındı',
  uretimde:        'Üretim',
  kalite_kontrol:  'Final QC',
  teslimata_hazir: 'Hazır',
  teslim_edildi:   'Teslim',
};

// ── Aksiyon butonu ve adım göstergeleri için sabit mavi renk ─────────────────
// Kullanıcı tipinden bağımsız: hangi panel olursa olsun bu öğeler hep mavi
const ACTION_BLUE       = '#3B82F6';   // Buton arka planı (deeper blue)
const ACTION_BLUE_LIGHT = '#60A5FA';   // Step nokta / pulse / aktif label

// ── Hero progress disc ────────────────────────────────────────────────────────
// Animated: yüzde değeri değiştikçe yumuşak bir geçişle yeni değere doğru
// "akar". Hem web (rAF) hem native (rAF) tarafında çalışır.
// Halka animasyonları:
//   1) Dönen kuyruklu yıldız (comet): dış halkada devamlı 360° döner
//   2) Nefes alan dış glow ring: opacity 0.3 ↔ 0.85, 1.1s döngü
function HeroDisc({
  percent,
  accent = '#60A5FA',
  discBg = '#081428',
  size = 96,
  duration = 900,
}: {
  percent: number;
  accent?: string;
  discBg?: string;
  size?: number;
  duration?: number;
}) {
  const SIZE      = size;
  const CX        = SIZE / 2;
  const OUTER_R   = SIZE / 2 - 3;
  const TRACK_R   = SIZE / 2 - Math.max(8, Math.round(SIZE * 0.115));
  const STROKE    = Math.max(6, Math.round(SIZE * 0.105));
  const INNER_R   = TRACK_R - STROKE / 2 - 2;
  const FONT_NUM  = Math.max(13, Math.round(SIZE * 0.22));
  const FONT_PCT  = Math.max(7,  Math.round(SIZE * 0.105));
  const THUMB_R   = Math.max(4,  Math.round(SIZE * 0.075));

  const target = Math.max(0, Math.min(100, percent));

  // ── Sayım animasyonu (mevcut) ─────────────────────────────────────────────
  const [animPct, setAnimPct] = useState(0);
  const animRef  = useRef(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (frameRef.current != null) {
      const cancel = (typeof cancelAnimationFrame !== 'undefined')
        ? cancelAnimationFrame
        : (id: number) => clearTimeout(id);
      cancel(frameRef.current);
      frameRef.current = null;
    }

    const from = animRef.current;
    const to   = target;
    const t0   = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();

    const raf = (typeof requestAnimationFrame !== 'undefined')
      ? requestAnimationFrame
      : ((cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16) as unknown as number);

    const tick = (now: number) => {
      const t = Math.min(Math.max((now - t0) / duration, 0), 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * eased;
      animRef.current = v;
      setAnimPct(v);
      if (t < 1) {
        frameRef.current = raf(tick) as number;
      } else {
        frameRef.current = null;
      }
    };
    frameRef.current = raf(tick) as number;

    return () => {
      if (frameRef.current != null) {
        const cancel = (typeof cancelAnimationFrame !== 'undefined')
          ? cancelAnimationFrame
          : (id: number) => clearTimeout(id);
        cancel(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [target, duration]);

  // ── Buton ikon halo: CSS keyframes (web) — JS overhead yok
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const id = 'hero-btn-icon-halo-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes hero-btn-icon-halo {
        0%   { transform: scale(0.7); opacity: 0.70; }
        100% { transform: scale(1.7); opacity: 0;    }
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Native için: Animated.Value + loop (useNativeDriver:true → GPU thread)
  const haloScale   = useRef(new Animated.Value(0.7)).current;
  const haloOpacity = useRef(new Animated.Value(0.70)).current;
  useEffect(() => {
    if (Platform.OS === 'web') return;     // web'de CSS keyframes kullanıyoruz
    const HALO_DURATION = 2200;
    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(haloScale,   { toValue: 1.7, duration: HALO_DURATION, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(haloOpacity, { toValue: 0,   duration: HALO_DURATION, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const reset = () => {
      haloScale.setValue(0.7);
      haloOpacity.setValue(0.70);
    };
    const startLoop = () => {
      reset();
      loop.start(() => startLoop());
    };
    startLoop();
    return () => loop.stop();
  }, [haloScale, haloOpacity]);

  // ── Display değerleri animasyon değerinden türetilir ──────────────────────
  const pct         = animPct;
  const displayInt  = Math.round(pct);
  const circ        = 2 * Math.PI * TRACK_R;
  const filled      = (pct / 100) * circ;
  const outerCirc   = 2 * Math.PI * OUTER_R;
  const outerFilled = (pct / 100) * outerCirc;

  const θ      = ((pct / 100) * 360 - 90) * (Math.PI / 180);
  const thumbX = CX + TRACK_R * Math.cos(θ);
  const thumbY = CX + TRACK_R * Math.sin(θ);

  const accentGlow = accent + '55';

  return (
    <View style={{ width: SIZE, height: SIZE }}>

      {/* Ana SVG: track + ilerleme yayı + iç dolgu (statik, animasyon yok) */}
      <Svg width={SIZE} height={SIZE}>
        {/* Outer dim ring */}
        <SvgCircle cx={CX} cy={CX} r={OUTER_R}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={2} />

        {/* Outer glow arc (ilerlemeye bağlı) */}
        <SvgCircle cx={CX} cy={CX} r={OUTER_R}
          fill="none" stroke={accentGlow} strokeWidth={2.5}
          strokeDasharray={`${outerFilled} ${outerCirc}`}
          strokeLinecap="round"
          transform={`rotate(-90, ${CX}, ${CX})`}
        />

        {/* Track */}
        <SvgCircle cx={CX} cy={CX} r={TRACK_R}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={STROKE} />

        {/* Progress arc */}
        <SvgCircle cx={CX} cy={CX} r={TRACK_R}
          fill="none" stroke={accent} strokeWidth={STROKE}
          strokeDasharray={`${filled} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90, ${CX}, ${CX})`}
        />

        {/* Inner disc fill — transparan: arka plan spotlight'ı görünür */}
        {/* <SvgCircle cx={CX} cy={CX} r={INNER_R} fill={discBg} /> */}

        {/* Thumb — solid beyaz nokta (statik) */}
        {pct > 2 && (
          <SvgCircle cx={thumbX} cy={thumbY} r={THUMB_R} fill="#FFFFFF" />
        )}
      </Svg>

      {/* Disc thumb halo kaldırıldı — animasyon Başlat butonu ikonuna taşındı */}

      {/* Percentage text — sayım animasyonu */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'row',
      }}>
        <Text style={{
          fontSize: FONT_NUM, fontWeight: '800', color: '#FFFFFF',
          letterSpacing: -0.5, lineHeight: FONT_NUM + 2,
          fontVariant: ['tabular-nums'],
        }}>
          {displayInt}
        </Text>
        <Text style={{
          fontSize: FONT_PCT, fontWeight: '600',
          color: 'rgba(255,255,255,0.55)', letterSpacing: 0.5,
          marginLeft: 1, marginTop: Math.round(FONT_NUM * 0.18),
        }}>
          %
        </Text>
      </View>
    </View>
  );
}

// ── Step pulse: aktif adım için iki katmanlı dalga animasyonu ────────────────
// İç dot da hafifçe nefes alır (scale 1 ↔ 1.18) gibi pulsasyon yapar.
function StepPulse({ color, size = 20 }: { color: string; size?: number }) {
  // Faz 0: 0–1500ms büyür ve solar
  // Faz 1: 750ms gecikmeli ikinci dalga (radar etkisi)
  const ring1Scale   = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0.55)).current;
  const ring2Scale   = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0.55)).current;
  const innerScale   = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const makeRing = (sv: Animated.Value, ov: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(sv, {
              toValue:         3.0,                      // 2.0 → 3.0 (daha geniş radar dalgası)
              duration:        1700,
              easing:          Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(ov, {
              toValue:         0,
              duration:        1700,
              easing:          Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ]),
      );

    const inner = Animated.loop(
      Animated.sequence([
        Animated.timing(innerScale, {
          toValue: 1.18,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(innerScale, {
          toValue: 1.0,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const r1 = makeRing(ring1Scale, ring1Opacity, 0);
    const r2 = makeRing(ring2Scale, ring2Opacity, 850);     // 750 → 850 (yeni süreyle uyumlu)

    r1.start();
    r2.start();
    inner.start();

    return () => {
      r1.stop();
      r2.stop();
      inner.stop();
    };
  }, [ring1Scale, ring1Opacity, ring2Scale, ring2Opacity, innerScale]);

  const ringStyle = (sv: Animated.Value, ov: Animated.Value) => ({
    position: 'absolute' as const,
    width:        size,
    height:       size,
    borderRadius: size / 2,
    borderWidth:  2,
    borderColor:  color,
    opacity:      ov,
    transform:    [{ scale: sv }],
  });

  return (
    <>
      <Animated.View pointerEvents="none" style={ringStyle(ring1Scale, ring1Opacity)} />
      <Animated.View pointerEvents="none" style={ringStyle(ring2Scale, ring2Opacity)} />
      <Animated.View
        pointerEvents="none"
        style={{
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: '#FFFFFF',          // aktif step iç noktası: beyaz
          transform: [{ scale: innerScale }],
        }}
      />
    </>
  );
}

// ── Hafif "davet" pulse'u — Başlat butonunu sarmalayan animasyonlu container ──
// Native driver ile transform: scale loop. Re-render yok, GPU'da çalışır.
function HeroBtnPulse({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue:         1.04,
          duration:        1100,
          easing:          Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue:         1.0,
          duration:        1100,
          easing:          Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ── Print helper ──────────────────────────────────────────────────────────────
function buildPrintHtml(order: WorkOrder, qrUrl: string): string {

  const cfg = STATUS_CONFIG[order.status] ?? {
    label: order.status as string, color: '#0F172A', bgColor: '#F1F5F9',
    next: null, icon: '', ionIcon: 'help-circle-outline',
  };
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrUrl)}&margin=6&bgcolor=ffffff&color=0f172a`;

  const toothCells = (order.tooth_numbers ?? [])
    .slice().sort((a, b) => a - b)
    .map(n => `<span class="tooth">${n}</span>`).join('');

  const opsRows = ((order as any).tooth_ops ?? [])
    .slice().sort((a: any, b: any) => a.tooth - b.tooth)
    .map((op: any) =>
      `<tr>
        <td>${op.tooth}</td>
        <td>${op.work_type ?? '—'}</td>
        <td>${op.shade ?? '—'}</td>
        <td>${op.notes ?? ''}</td>
      </tr>`
    ).join('');

  const historyRows = (order.status_history ?? [])
    .map((h: any) => {
      const d = new Date(h.changed_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `<tr><td>${d}</td><td>${STATUS_CONFIG[h.status as WorkOrderStatus]?.label ?? h.status}</td><td>${h.note ?? ''}</td></tr>`;
    }).join('');

  const deliveryDate = new Date(order.delivery_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
  const createdDate  = new Date(order.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>İş Emri – ${order.order_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; color: #0f172a; background: #fff; padding: 32px; }
    h1  { font-size: 22px; font-weight: 800; color: #0f172a; }
    h2  { font-size: 14px; font-weight: 700; color: #475569; margin-top: 24px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 24px; }
    .header-left h1 { margin-bottom: 6px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin-top: 8px; }
    .meta-row { display: flex; gap: 6px; align-items: baseline; }
    .meta-label { font-size: 11px; font-weight: 600; color: #94a3b8; text-transform: uppercase; min-width: 80px; }
    .meta-val   { font-size: 13px; font-weight: 500; color: #0f172a; }
    .status-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; background: ${cfg.bgColor}; color: ${cfg.color}; margin-bottom: 8px; }
    .qr-wrap { border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px; background: #fff; }
    .qr-wrap img { display: block; width: 140px; height: 140px; }
    .qr-label { font-size: 9px; color: #94a3b8; text-align: center; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th, td { text-align: left; padding: 7px 10px; font-size: 12px; border-bottom: 1px solid #f1f5f9; }
    th { background: #f8fafc; font-weight: 700; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: .3px; }
    tr:last-child td { border-bottom: none; }
    .teeth-wrap { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .tooth { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 5px; border: 1.5px solid #2563eb; background: #eff6ff; font-size: 10px; font-weight: 700; color: #2563eb; }
    .notes-box { background: #f8fafc; border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #334155; line-height: 1.5; margin-top: 4px; border: 1px solid #e2e8f0; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>

  <div class="header">
    <div class="header-left">
      <div class="status-pill">${cfg.icon} ${cfg.label}</div>
      <h1>${order.order_number}</h1>
      <div class="meta-grid">
        <div class="meta-row"><span class="meta-label">Hasta</span><span class="meta-val">${order.patient_name ?? '—'}</span></div>
        <div class="meta-row"><span class="meta-label">Hekim</span><span class="meta-val">${order.doctor?.full_name ?? '—'}</span></div>
        <div class="meta-row"><span class="meta-label">Klinik</span><span class="meta-val">${(order.doctor as any)?.clinic?.name ?? '—'}</span></div>
        <div class="meta-row"><span class="meta-label">Oluşturulma</span><span class="meta-val">${createdDate}</span></div>
        <div class="meta-row"><span class="meta-label">Teslim</span><span class="meta-val">${deliveryDate}</span></div>
        <div class="meta-row"><span class="meta-label">İş Türü</span><span class="meta-val">${order.work_type ?? '—'}</span></div>
        <div class="meta-row"><span class="meta-label">Renk</span><span class="meta-val">${order.shade ?? '—'}</span></div>
        <div class="meta-row"><span class="meta-label">Makine</span><span class="meta-val">${order.machine_type === 'milling' ? 'Frezeleme' : '3D Baskı'}</span></div>
      </div>
    </div>
    <div class="qr-wrap">
      <img src="${qrImgUrl}" alt="QR Kod" />
      <div class="qr-label">Panelde görüntüle</div>
    </div>
  </div>

  ${order.notes ? `<h2>Notlar</h2><div class="notes-box">${order.notes}</div>` : ''}

  ${(order.tooth_numbers ?? []).length > 0 ? `
  <h2>Seçili Dişler</h2>
  <div class="teeth-wrap">${toothCells}</div>` : ''}

  ${((order as any).tooth_ops ?? []).length > 0 ? `
  <h2>Operasyonlar</h2>
  <table>
    <thead><tr><th>Diş</th><th>İşlem Türü</th><th>Renk</th><th>Not</th></tr></thead>
    <tbody>${opsRows}</tbody>
  </table>` : ''}

  ${historyRows ? `
  <h2>Durum Geçmişi</h2>
  <table>
    <thead><tr><th>Tarih</th><th>Durum</th><th>Not</th></tr></thead>
    <tbody>${historyRows}</tbody>
  </table>` : ''}

  <div class="footer">
    <span>dental-lab-steel.vercel.app</span>
    <span>${order.order_number} · Yazdırma tarihi: ${new Date().toLocaleDateString('tr-TR')}</span>
  </div>


</body>
</html>`;

  return html;
}

function handlePrint(order: WorkOrder, qrUrl: string) {
  if (typeof window === 'undefined') return;
  const w = window.open('', '_blank');
  if (w) {
    w.document.write(buildPrintHtml(order, qrUrl) + '<script>window.onload = () => setTimeout(() => window.print(), 400);</script>');
    w.document.close();
  }
}


export function OrderDetailScreen() {
  const { id }    = useLocalSearchParams<{ id: string }>();
  const router    = useRouter();
  const { profile } = useAuthStore();
  const { order, signedUrls, loading, error, refetch } = useOrderDetail(id);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 769;

  // Route group'dan panel tipini tespit et (early return'den ÖNCE)
  // Hook'lar her render'da aynı sırada çağrılmalı.
  const segments   = useSegments() as string[];
  const panelGroup = segments?.[0] ?? '';
  const panelType  =
    panelGroup === '(lab)'    ? 'lab' :
    panelGroup === '(doctor)' ? 'doctor' :
    panelGroup === '(admin)'  ? 'admin' :
    panelGroup === '(clinic)' ? 'clinic_admin' :
    profile?.user_type;

  // Üretim aşamasındaki üretim istasyonları (case_steps tablosu) — hero altında ek satır
  const { steps: productionSteps } = useCaseSteps(id ?? '');
  // Yeni workflow stage'leri (order_stages tablosundan, hero alt satırı için)
  const { stages: orderStages, activeStage } = useOrderStages(id ?? undefined);

  // Sayfa başlığı:
  //   Title    → "LAB-2026-0031"             (üst, büyük)
  //   Subtitle → "Dr. Kaan Esen · Klinik X"  (altta, küçük gri)
  // - DesktopShell üst başlığı (pageTitleStore: title + subtitle)
  // - Browser tab (tek string olarak birleştirilir)
  // - Native header (navigation.setOptions)
  const navigation       = useNavigation();
  const setPageTitle     = usePageTitleStore(s => s.setTitle);
  const setPageActions   = usePageTitleStore(s => s.setActions);
  const clearPageTitle   = usePageTitleStore(s => s.clear);
  useEffect(() => {
    if (!order?.order_number) return;
    const doctorName    = order.doctor?.full_name?.trim();
    const clinicName    = (order.doctor?.clinic_name ?? order.doctor?.clinic?.name)?.trim();
    const title         = order.order_number;
    const subtitle      = [doctorName, clinicName].filter(Boolean).join(' · ');
    const combinedTitle = subtitle ? `${title} · ${subtitle}` : title;

    navigation.setOptions({ title: combinedTitle });
    setPageTitle(title, subtitle || null);
    if (typeof document !== 'undefined') {
      document.title = combinedTitle;
    }
  }, [
    navigation,
    setPageTitle,
    order?.order_number,
    order?.doctor?.full_name,
    order?.doctor?.clinic_name,
    order?.doctor?.clinic?.name,
  ]);

  // Unmount: shell başlığı tekrar default'a dönsün
  useEffect(() => {
    return () => clearPageTitle();
  }, [clearPageTitle]);

  const [activeSection, setActiveSection] = useState<Section>('details');
  const [modalVisible, setModalVisible] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [stageQCOpen, setStageQCOpen]   = useState<Stage | null>(null);
  const [qcRejectOpen, setQCRejectOpen] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showMoreActions, setShowMoreActions] = useState(false);
  const [toothPopup, setToothPopup] = useState<number | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [provaOpen, setProvaOpen] = useState(false);
  const [vakaOpen, setVakaOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const printIframeRef = React.useRef<any>(null);
  const [btnHovered, setBtnHovered]         = useState(false);   // hero Başlat butonu hover

  // ── Sil handler — TÜM erken-return'lerden ÖNCE tanımlanmalı (hook ordering)
  const handleDeleteOrder = React.useCallback(() => {
    if (!order) return;
    const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(`#${order.order_number} silinsin mi? Bu işlem geri alınamaz.`)
      : true;
    if (!ok) return;
    deleteOrderApi(order.id)
      .then(() => {
        toast.success('Sipariş silindi');
        if (typeof window !== 'undefined') window.history.back();
      })
      .catch((e: any) => toast.error('Silme hatası: ' + (e?.message ?? 'bilinmeyen')));
  }, [order]);

  // ── Header'a edit/delete butonlarını yerleştir (early-return'lerden önce)
  // Lab + manager VEYA admin görür
  const _canEditDelete = (profile?.user_type === 'lab' && profile?.role === 'manager')
    || profile?.user_type === 'admin';
  useEffect(() => {
    if (!order || !_canEditDelete) {
      setPageActions(null);
      return;
    }
    setPageActions(
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <TouchableOpacity
          onPress={() => { toast.success('Düzenleme yakında'); }}
          style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' }}
          accessibilityLabel="Düzenle"
        >
          <AppIcon name="pencil" size={15} color="#64748B" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDeleteOrder}
          style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2' }}
          accessibilityLabel="Sil"
        >
          <AppIcon name="trash-2" size={15} color="#EF4444" />
        </TouchableOpacity>
      </View>
    );
    return () => setPageActions(null);
  }, [order?.id, _canEditDelete, handleDeleteOrder, setPageActions]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.textSecondary }}>Yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
          <Text style={{ fontSize: 32 }}>⚠️</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.textPrimary, textAlign: 'center' }}>
            Sipariş yüklenemedi
          </Text>
          <Text style={{ fontSize: 13, color: C.textSecondary, textAlign: 'center', maxWidth: 360 }}>
            {error ?? 'Sipariş bulunamadı veya erişim yetkiniz yok.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
              activeOpacity={0.8}
            >
              <Text style={{ color: C.textPrimary, fontWeight: '700' }}>← Geri</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={refetch}
              style={{ backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 }}
              activeOpacity={0.8}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const overdue    = isOrderOverdue(order.delivery_date, order.status);
  const nextStatus = getNextStatus(order.status);
  const cfg        = STATUS_CONFIG[order.status] ?? {
    label: order.status as string, color: '#0F172A', bgColor: '#F1F5F9',
    next: null, icon: '', ionIcon: 'help-circle-outline',
  };
  const isManager  = profile?.role === 'manager' || profile?.user_type === 'admin';

  // ── Panel temasına göre hero card gradient ──────────────────────────────
  // panelType en üstte, useSegments ile hesaplandı (hook ordering için).
  const heroTheme = getHeroPanelTheme(panelType, profile?.role);

  // Panel temalı accent — admin gri, diğer paneller kendi rengi
  const accentColor =
    panelType === 'admin'        ? '#475569' :   // zinc-600 / slate-600 — gri
    panelType === 'doctor'       ? '#10B981' :   // emerald-500
    panelType === 'clinic_admin' ? '#8B5CF6' :   // violet-500
                                   '#2563EB';    // lab default — blue-600

  // Steps + yüzde dairesi accent (panel temalı). Admin'de gri, diğerlerinde mavi.
  const progressAccent =
    panelType === 'admin'        ? '#A1A1AA' :   // zinc-400 — açık gri (koyu hero üstünde okunaklı)
    panelType === 'doctor'       ? '#34D399' :   // emerald-400
    panelType === 'clinic_admin' ? '#C4B5FD' :   // violet-300
                                   ACTION_BLUE_LIGHT;  // lab default — blue-400

  const qrUrl = Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}/order/${order.id}`
    : `https://dental-lab-steel.vercel.app/order/${order.id}`;

  const daysLeft = Math.ceil(
    (new Date(order.delivery_date + 'T00:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  // ── Auto-start: ilk istasyona (sequence_hint en düşük) iş emrini at, teknisyen otomatik
  const handleAutoStart = async () => {
    if (!profile) return;
    const labId = (profile as any).lab_id ?? profile.id;

    // 1. İlk istasyon (CHECK) — sequence_hint'e göre
    const { data: station, error: stErr } = await supabase
      .from('lab_stations')
      .select('id, name, is_critical')
      .eq('lab_profile_id', labId)
      .eq('is_active', true)
      .order('sequence_hint', { ascending: true })
      .limit(1)
      .single();
    if (stErr || !station) { toast.error('İstasyon bulunamadı'); return; }

    // 2. AUTO_ASSIGN(TRIAGE) — skill + trust + workload
    const { autoAssignUser } = await import('../autoAssign');
    const techId = await autoAssignUser(
      'TRIAGE',
      labId,
      (order as any).complexity ?? 'medium',
      (order as any).case_type ?? null,
    );
    const tech = techId ? { id: techId } : null;

    // 3. Mevcut bekleyen stage'leri temizle (tekrar başlat senaryosu)
    await supabase.from('order_stages').delete()
      .eq('work_order_id', order.id).eq('status', 'bekliyor');

    // 4. Yeni stage insert
    const { data: stageData, error: stageErr } = await supabase
      .from('order_stages')
      .insert({
        work_order_id:  order.id,
        station_id:     station.id,
        technician_id:  tech?.id ?? null,
        sequence_order: 1,
        is_critical:    station.is_critical,
        status:         'aktif',
        assigned_at:    new Date().toISOString(),
      })
      .select('id').single();
    if (stageErr) { toast.error('Stage oluşturulamadı: ' + stageErr.message); return; }

    // 5. work_orders → asamada
    const { error: orderErr } = await supabase
      .from('work_orders')
      .update({ status: 'asamada', current_stage_id: stageData.id })
      .eq('id', order.id);
    if (orderErr) { toast.error('Durum güncellenemedi: ' + orderErr.message); return; }

    // 6. Log — order_events + stage_log
    await supabase.from('order_events').insert({
      work_order_id: order.id,
      stage_id:      stageData.id,
      event_type:    'teknisyen_atandi',
      actor_id:      profile.id,
      metadata: { auto: true, station: station.name, technician_id: tech?.id ?? null,
        note: 'Case started automatically' },
    });

    // stage_log — audit (TRIAGE başladı)
    await supabase.from('stage_log').insert({
      work_order_id: order.id,
      stage:         'TRIAGE',
      owner_id:      tech?.id ?? null,
      start_time:    new Date().toISOString(),
      notes:         'Auto-started',
    });

    toast.success(`İş başlatıldı → ${station.name}`);
    refetch();
  };

  const handleStatusUpdate = async (newStatus: WorkOrderStatus, note: string) => {
    if (!profile) return;
    const { error } = await advanceOrderStatus(order.id, newStatus, profile.id, note || undefined);
    if (error) toast.error('Durum güncellenemedi: ' + (error as any).message);
    else refetch();
  };

  const handlePrintReceipt = async () => {
    const res = await printDeliveryReceipt(order, profile?.lab_id);
    if (!res.ok && res.error) toast.error(res.error);
  };

  const handleCreateInvoice = async () => {
    const { data, error } = await createInvoiceFromOrder(order.id);
    if (error || !data) {
      toast.error((error as any)?.message ?? 'Fatura oluşturulamadı');
      return;
    }
    router.push(`/(lab)/invoice/${data.id}` as any);
  };

  const handleAddPhoto = async (toothNumber?: number | null, caption?: string | null) => {
    if (!profile) return;
    if (typeof window !== 'undefined') {
      const uri = await pickPhoto();
      if (!uri) return;
      setUploadingPhoto(true);
      const { error } = await uploadPhoto(uri, order.id, profile.id, toothNumber, caption);
      setUploadingPhoto(false);
      if (error) toast.error(error);
      else refetch();
      return;
    }
    Alert.alert('Fotoğraf Ekle', 'Kaynak seçin', [
      {
        text: 'Galeri',
        onPress: async () => {
          const uri = await pickPhoto();
          if (!uri) return;
          setUploadingPhoto(true);
          const { error } = await uploadPhoto(uri, order.id, profile.id, toothNumber);
          setUploadingPhoto(false);
          if (error) toast.error(error);
          else refetch();
        },
      },
      {
        text: 'Kamera',
        onPress: async () => {
          const uri = await takePhoto();
          if (!uri) return;
          setUploadingPhoto(true);
          const { error } = await uploadPhoto(uri, order.id, profile.id, toothNumber);
          setUploadingPhoto(false);
          if (error) toast.error(error);
          else refetch();
        },
      },
      { text: 'İptal', style: 'cancel' },
    ]);
  };

  // Web-uyumlu kategorili upload — native <input type="file"> + doğrudan blob upload.
  // FilesUploadModal pick callback'leri buradan çağrılır; caption=label.
  const handleUploadWithCaption = async (label: string, accept: string) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !profile) {
      console.warn('[upload] aborted — platform/profile guard', { platform: Platform.OS, hasProfile: !!profile });
      return;
    }
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);

    input.onchange = async (e: any) => {
      const file: File | undefined = e.target.files?.[0];
      console.log('[upload] file picked', { label, name: file?.name, type: file?.type, size: file?.size });
      try { document.body.removeChild(input); } catch {}
      if (!file) return;
      setUploadingPhoto(true);
      try {
        // RLS auth.uid() ile uploaded_by'ı eşleştirir — supabase auth user'ını al
        const { data: authData } = await supabase.auth.getUser();
        const authUid = authData?.user?.id ?? profile.id;
        console.log('[upload] auth user id', authUid, 'profile.id', profile.id);

        const ext         = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
        const fileName    = `${Date.now()}.${ext}`;
        const storagePath = `orders/${order.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('work-order-photos')
          .upload(storagePath, file, { contentType: file.type || `application/${ext}`, upsert: false });

        if (uploadError) {
          console.error('[upload] storage error', uploadError);
          toast.error(`Upload: ${uploadError.message}`);
          return;
        }

        const { error: dbError } = await supabase.from('work_order_photos').insert({
          work_order_id: order.id,
          storage_path:  storagePath,
          uploaded_by:   authUid,
          caption:       label,
        });
        if (dbError) {
          console.error('[upload] db error', dbError);
          toast.error(`DB: ${dbError.message}`);
        } else {
          toast.success(`${label} yüklendi`);
          refetch();
        }
      } catch (err: any) {
        console.error('[upload] exception', err);
        toast.error(err?.message ?? 'Bilinmeyen hata');
      } finally {
        setUploadingPhoto(false);
      }
    };

    // Fallback: bazı tarayıcılarda input DOM'da olmadan click() çalışmaz
    setTimeout(() => input.click(), 0);
    // Kullanıcı iptal ederse temizle
    setTimeout(() => { try { document.body.removeChild(input); } catch {} }, 60_000);
  };

  const createdDate = new Date(order.created_at).toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  // Workflow progress percentage (10%→100%)
  // 'asamada' STATUS_ORDER'da yok — UI için 'uretimde' gibi davransın (üretim step'i yansın)
  const _normalizedStatus = (order.status as string) === 'asamada' ? 'uretimde' : order.status;
  const statusIndex = STATUS_ORDER.indexOf(_normalizedStatus as any);
  const progressPercent = statusIndex >= 0
    ? Math.round(((statusIndex + 1) / STATUS_ORDER.length) * 100)
    : 10;

  // Up to 2 photo thumbnails for hero card
  const heroPhotos = (order.photos ?? []).slice(0, 2);

  // Tooth card dimensions — responsive, capped
  const TOOTH_CARD_W   = Math.min(Math.max(Math.round((width - 40) * 0.33), 130), 200);
  const TOOTH_PICKER_W = TOOTH_CARD_W - 16;

  // Hero başlat butonu — responsive KARE: width = height
  const ACTION_BTN_W = Math.min(Math.max(Math.round((width - 40) * 0.16), 124), 152);
  // Hero disc boyutu — kart içine sığsın (pulse ring + 12px boşluk dahil)
  const DISC_SIZE    = Math.min(Math.max(Math.round((width - 40) * 0.10), 88), 112);
  const hasTeeth       = (order.tooth_numbers ?? []).length > 0;

  // Tooth sub-row: şema büyük kalır, kart picker etrafında eşit boşluk (16px) bırakır
  const TOOTH_SUB_PAD = 16;                                                // tüm kenarlardaki eşit boşluk
  const TOOTH_SUB_PW  = Math.min(Math.round((width - 48) * 0.40), 440);   // picker width (orijinal)
  const TOOTH_SUB_CW  = TOOTH_SUB_PW + TOOTH_SUB_PAD * 2;                  // card width = picker + 16+16

  return (
    <SafeAreaView style={styles.safe}>

      {/* OUTER SCROLL — tüm sayfa içeriği tek scroll yüzeyi olur */}
      <ScrollView
        style={{ flex: 1, backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingBottom: 12 }}
        showsVerticalScrollIndicator={true}
      >

      <View style={styles.pageGrid}>

      {/* ══════════════════════════════════════════
           Header row: Hero Card + Tooth Chart Card
           (same height via alignItems: stretch)
           ══════════════════════════════════════════ */}
      <View style={styles.headerRow}>

        {/* ── Hero Card ── */}
        <View style={[
          styles.heroCard,
          {
            flex: 1,
            shadowColor:     heroTheme.shadowColor,
            backgroundColor: heroTheme.baseBg,    // solid base — spotlight üstüne eklenir
          },
        ]}>

          {/* Hareketli spotlight blob'ları — panel rengine göre 3 farklı ton */}
          <SpotlightBackground colors={heroTheme.spotlightColors} />

          {/* ── Top row: yalnızca acil rozeti (varsa) ── */}
          {order.is_urgent && (
            <View style={styles.heroTopRow}>
              <View style={styles.heroUrgentTag}>
                <Text style={styles.heroUrgentText}>⚡ ACİL</Text>
              </View>
            </View>
          )}

          {/* ── Ana içerik: 2 sütun ── SOL: [info + disc içeride] | SAĞ: başlat ── */}
          <View style={styles.heroMainRow}>

            {/* SOL kolon: heroProdBlock kendi içinde flex-row → info (flex:1) + disc */}
            <View
              style={[
                styles.heroProdBlock,
                {
                  flex:           1,
                  minWidth:       0,
                  flexDirection:  'row',
                  alignItems:     'center',
                  gap:            12,
                },
              ]}
            >
              {/* SUB-LEFT: hasta info (shrinkable) */}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroProdTypeLabel}>HASTA</Text>
                <Text style={styles.heroProdType} numberOfLines={2}>
                  {order.patient_name ?? '—'}
                </Text>
                {order.work_type ? (
                  <Text style={styles.heroProdSubType} numberOfLines={1}>
                    {order.work_type}
                  </Text>
                ) : null}

                <View style={styles.heroProdMetaRow}>
                  {order.shade ? (
                    <View style={[styles.heroProdChip, { backgroundColor: 'rgba(96,165,250,0.18)' }]}>
                      <Text style={styles.heroProdChipLabel}>Renk</Text>
                      <Text style={[styles.heroProdChipValue, { color: '#60A5FA' }]}>
                        {order.shade}
                      </Text>
                    </View>
                  ) : null}

                  {(order.tooth_numbers ?? []).length > 0
                    ? [...(order.tooth_numbers ?? [])].sort((a, b) => a - b).map(tooth => (
                      <TouchableOpacity
                        key={tooth}
                        onPress={() => setToothPopup(tooth)}
                        activeOpacity={0.7}
                        style={styles.heroProdChip}
                      >
                        <Text style={styles.heroProdChipLabel}>Diş</Text>
                        <Text style={styles.heroProdChipValue}>{tooth}</Text>
                      </TouchableOpacity>
                    ))
                    : null}

                  {overdue && (
                    <View style={[styles.heroProdChip, { backgroundColor: 'rgba(239,68,68,0.18)' }]}>
                      <Text style={styles.heroProdChipLabel}>Gecikme</Text>
                      <Text style={[styles.heroProdChipValue, { color: '#FCA5A5' }]}>
                        {Math.abs(daysLeft)} gün
                      </Text>
                    </View>
                  )}
                </View>

                {/* Tarih satırı */}
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                  <View>
                    <Text style={styles.heroTimelineLabel}>Başlangıç</Text>
                    <Text style={styles.heroTimelineValue}>{createdDate}</Text>
                  </View>
                  <View>
                    <Text style={styles.heroTimelineLabel}>Teslim</Text>
                    <Text style={[styles.heroTimelineValue, overdue && { color: '#FCA5A5' }]}>
                      {order.delivery_date ? formatDeliveryDate(order.delivery_date) : '—'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* SUB-RIGHT: yüzde dairesi (QR Detaylar sekmesinde, hero'da kaldırıldı) */}
              <View style={{ flexShrink: 0 }}>
                <HeroDisc
                  percent={progressPercent}
                  accent={progressAccent}
                  discBg={heroTheme.discBg}
                  size={DISC_SIZE}
                />
              </View>
            </View>

            {/* SAĞ: BÜYÜK responsive aksiyon butonu — hekimde tamamen gizlenir */}
            {/* Hekim hiç görmez. Üretim/asama aşamalarında manager butonu görmez (akış istasyonlardan ilerler). */}
            {(panelType === 'doctor' || profile?.user_type === 'doctor') ? null
              : ((order.status as string) === 'uretimde' || (order.status as string) === 'asamada') ? null
              : nextStatus ? (
              <TouchableOpacity
                onPress={() => {
                  const rawStatus = order.status as string;
                  const isStartAction = rawStatus === 'alindi' || rawStatus === 'atama_bekleniyor';
                  if (isStartAction && isManager) {
                    handleAutoStart();   // Modal yerine tek tıkla otomatik başlat
                  } else {
                    setModalVisible(true);
                  }
                }}
                activeOpacity={0.85}
                // @ts-ignore — RN-Web mouse event'leri
                onMouseEnter={() => setBtnHovered(true)}
                // @ts-ignore
                onMouseLeave={() => setBtnHovered(false)}
                style={[
                  styles.heroBigActionBtn,
                  {
                    width:      ACTION_BTN_W,
                    flexShrink: 0,                  // küçülmesin
                    alignSelf:  'stretch',          // info kartının yüksekliğini al
                    // @ts-ignore — hızlı hover geçişi (web only, native'de yoksayılır)
                    transition: 'background-image 80ms ease-out, box-shadow 120ms ease-out',
                  },
                  // ── Admin paneli + Başlat → gri gradient (mavi yerine) ──
                  panelType === 'admin' && ((order.status as string) === 'alindi' || (order.status as string) === 'atama_bekleniyor') && {
                    backgroundColor: '#475569',
                    // @ts-ignore
                    backgroundImage:
                      'linear-gradient(135deg,' +
                      ' #94A3B8 0%,' +    // slate-400 — açık üst sol
                      ' #64748B 45%,' +   // slate-500 — orta
                      ' #334155 100%)',   // slate-700 — koyu sağ alt
                    shadowColor:   '#1E293B',
                    // @ts-ignore
                    boxShadow:
                      '0 6px 16px rgba(30,41,59,0.35),' +
                      ' inset 0 1px 0 rgba(255,255,255,0.30)',
                  },
                  // ── Tamamla → transparan + hafif beyaz parıltı (yumuşak) ──
                  ((order.status as string) !== 'alindi' && (order.status as string) !== 'atama_bekleniyor') && {
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    // @ts-ignore
                    backgroundImage:
                      'linear-gradient(135deg,' +
                      ' rgba(255,255,255,0.08) 0%,' +
                      ' rgba(255,255,255,0.02) 50%,' +
                      ' rgba(255,255,255,0.08) 100%)',
                    borderColor: 'rgba(255,255,255,0.40)',
                    // @ts-ignore — yumuşak parıltı (eski neon yarı yarıya)
                    boxShadow:
                      '0 0 12px rgba(255,255,255,0.18),' +
                      ' 0 0 24px rgba(255,255,255,0.08),' +
                      ' inset 0 0 8px rgba(255,255,255,0.08),' +
                      ' inset 0 1px 0 rgba(255,255,255,0.45)',
                  },
                  btnHovered && (((order.status as string) === 'alindi' || (order.status as string) === 'atama_bekleniyor')
                    ? (panelType === 'admin'
                        ? {
                            // Admin Başlat hover — daha açık gri
                            // @ts-ignore
                            backgroundImage:
                              'linear-gradient(135deg,' +
                              ' #CBD5E1 0%,' +    // slate-300
                              ' #94A3B8 45%,' +   // slate-400
                              ' #64748B 100%)',   // slate-500
                          }
                        : {
                            // Başlat hover — daha açık mavi
                            // @ts-ignore
                            backgroundImage:
                              'linear-gradient(135deg,' +
                              ' #93C5FD 0%,' +
                              ' #60A5FA 45%,' +
                              ' #3B82F6 100%)',
                          })
                    : {
                        // Tamamla hover — parıltı hafif yoğunlaşır
                        // @ts-ignore
                        boxShadow:
                          '0 0 18px rgba(255,255,255,0.30),' +
                          ' 0 0 36px rgba(255,255,255,0.14),' +
                          ' inset 0 0 12px rgba(255,255,255,0.14),' +
                          ' inset 0 1px 0 rgba(255,255,255,0.65)',
                      }),
                ]}
              >
                <View style={styles.heroBigActionIconCircle}>
                  {/* İkon halo — disc'ten taşınan animasyon, GPU-accelerated */}
                  {Platform.OS === 'web' ? (
                    <View
                      pointerEvents="none"
                      // @ts-ignore — CSS keyframes
                      style={{
                        position:     'absolute',
                        top:          -8,
                        left:         -8,
                        right:        -8,
                        bottom:       -8,
                        borderRadius: 36,                // (56+16)/2
                        borderWidth:  1.5,
                        borderColor:  '#FFFFFF',
                        animationName:           'hero-btn-icon-halo',
                        animationDuration:       '2.2s',
                        animationTimingFunction: 'ease-out',
                        animationIterationCount: 'infinite',
                      }}
                    />
                  ) : (
                    <View
                      pointerEvents="none"
                      style={{
                        position:     'absolute',
                        top:          -8,
                        left:         -8,
                        right:        -8,
                        bottom:       -8,
                        borderRadius: 36,
                        borderWidth:  1.5,
                        borderColor:  '#FFFFFF',
                        opacity:      0.6,
                      }}
                    />
                  )}
                  {(() => {
                    const st = order.status as string;
                    if (st === 'alindi' || st === 'atama_bekleniyor') return <AppIcon name="zap" size={30} color="#FFFFFF" />;
                    if (st === 'kalite_kontrol')                       return <AppIcon name="shield-check-outline" size={30} color="#FFFFFF" />;
                    if (st === 'teslimata_hazir')                      return <AppIcon name="truck-fast-outline" size={30} color="#FFFFFF" />;
                    return <AppIcon name="check-circle" size={30} color="#FFFFFF" />;
                  })()}
                </View>
                <Text style={styles.heroBigActionText}>
                  {(() => {
                    const st = order.status as string;
                    if (st === 'alindi' || st === 'atama_bekleniyor') return 'İşi Başlat';
                    if (st === 'kalite_kontrol')                       return 'KK Onayla';
                    if (st === 'teslimata_hazir')                      return 'Teslim Et';
                    return 'Tamamla';
                  })()}
                </Text>
                <Text style={styles.heroBigActionSub}>
                  {nextStatus ? (STATUS_CONFIG[nextStatus]?.label ?? nextStatus) : ''}
                </Text>
              </TouchableOpacity>
            ) : (
              <View
                style={[
                  styles.heroBigActionBtn,
                  {
                    width:           ACTION_BTN_W,
                    flexShrink:      0,              // küçülmesin
                    alignSelf:       'stretch',      // info kartı yüksekliği
                    backgroundColor: 'rgba(16,185,129,0.18)',
                    shadowOpacity:   0,
                  },
                ]}
              >
                <View style={[styles.heroBigActionIconCircle, { backgroundColor: 'rgba(16,185,129,0.25)' }]}>
                  <Text style={{ fontSize: 24, color: '#10B981', fontWeight: '800' }}>✓</Text>
                </View>
                <Text style={[styles.heroBigActionText, { color: '#34D399' }]}>Teslim</Text>
                <Text style={styles.heroBigActionSub}>Tamamlandı</Text>
              </View>
            )}

          </View>

          {/* ── Steps row ── */}
          <View style={styles.heroStepsRow}>
            {STATUS_ORDER.map((status, i) => {
              const isDone    = statusIndex > i;
              const isCurrent = statusIndex === i;
              return (
                <React.Fragment key={status}>
                  {i > 0 && (
                    <View style={[
                      styles.heroStepConnector,
                      isDone && { backgroundColor: progressAccent, opacity: 0.7 },
                    ]} />
                  )}
                  <View style={styles.heroStepItem}>
                    <View style={[
                      styles.heroStepDot,
                      isDone    && { backgroundColor: progressAccent, borderColor: progressAccent },
                      isCurrent && { borderColor: progressAccent, backgroundColor: 'transparent' },
                    ]}>
                      {isDone    && <Text style={{ fontSize: 9, color: '#FFFFFF', fontWeight: '700' }}>✓</Text>}
                      {isCurrent && <StepPulse color={progressAccent} size={20} />}
                    </View>
                    <Text style={[
                      styles.heroStepLabel,
                      isDone    && styles.heroStepLabelDone,
                      isCurrent && { color: progressAccent, fontWeight: '700' },
                    ]} numberOfLines={1}>
                      {STEP_SHORT[status]}
                    </Text>
                  </View>
                </React.Fragment>
              );
            })}
          </View>

          {/* ── Üretim İstasyonları — order_stages bazlı (her zaman görünür) ── */}
          {orderStages.length > 0 && (
            <View style={styles.heroProdStationsWrap}>
              <Text style={styles.heroProdStationsTitle}>ÜRETİM İSTASYONLARI</Text>
              <View style={styles.heroProdStationsRow}>
                {orderStages
                  .slice()
                  .sort((a, b) => a.sequence_order - b.sequence_order)
                  .map((stage, i) => {
                    const isDone    = stage.status === 'onaylandi' || stage.status === 'tamamlandi';
                    const isCurrent = stage.status === 'aktif';
                    const isBlocked = stage.status === 'reddedildi';
                    const stationName = stage.station?.name ?? '—';
                    return (
                      <React.Fragment key={stage.id}>
                        {i > 0 && (
                          <View style={[
                            styles.heroProdStationConnector,
                            isDone && { backgroundColor: progressAccent, opacity: 0.7 },
                          ]} />
                        )}
                        <View style={styles.heroProdStationItem}>
                          <View style={[
                            styles.heroProdStationDot,
                            isDone    && { backgroundColor: progressAccent, borderColor: progressAccent },
                            isCurrent && { borderColor: progressAccent, backgroundColor: 'transparent' },
                            isBlocked && { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.18)' },
                          ]}>
                            {isDone    && <Text style={{ fontSize: 8, color: '#FFFFFF', fontWeight: '700' }}>✓</Text>}
                            {isCurrent && <StepPulse color={progressAccent} size={16} />}
                            {isBlocked && <Text style={{ fontSize: 8, color: '#EF4444', fontWeight: '800' }}>!</Text>}
                          </View>
                          <Text
                            style={[
                              styles.heroProdStationLabel,
                              isDone    && styles.heroProdStationLabelDone,
                              isCurrent && { color: progressAccent, fontWeight: '700' },
                              isBlocked && { color: '#FCA5A5', fontWeight: '700' },
                            ]}
                            numberOfLines={1}
                          >
                            {stationName}
                          </Text>
                        </View>
                      </React.Fragment>
                    );
                  })}
              </View>
            </View>
          )}

          {/* ── Aktif Aşama Strip — Şu An / Sorumlu / Aksiyon ──────────────── */}
          {activeStage && (
            <View style={styles.heroActiveStripWrap}>
              <View style={styles.heroActiveStripCol}>
                <Text style={styles.heroActiveStripLabel}>
                  ŞU AN
                  {activeStage.status === 'tamamlandi' && '  •  QC1 OPERASYON ONAYI'}
                </Text>
                <Text style={styles.heroActiveStripValue} numberOfLines={1}>
                  {activeStage.station?.name?.toUpperCase() ?? '—'}
                </Text>
              </View>
              <View style={styles.heroActiveStripDivider} />
              <View style={styles.heroActiveStripCol}>
                <Text style={styles.heroActiveStripLabel}>SORUMLU</Text>
                <Text style={styles.heroActiveStripValue} numberOfLines={1}>
                  {activeStage.technician?.full_name ?? 'Atanmadı'}
                </Text>
              </View>
              {/* Aksiyon: teknisyen kendi aşamasını tamamlayabilir — DESIGN ise önce dosya yüklemiş olmalı */}
              {profile?.id === activeStage.technician?.id && activeStage.status === 'aktif' && (
                <TouchableOpacity
                  style={styles.heroActiveStripBtn}
                  onPress={async () => {
                    // DESIGN aşamasında: önce dosya yüklemesi zorunlu
                    const stationName = (activeStage.station?.name ?? '').toLowerCase();
                    const isDesign = stationName.includes('design') || stationName.includes('tasarım');
                    if (isDesign) {
                      const filesForOrder = (order.photos ?? []).length;
                      if (filesForOrder === 0) {
                        toast.error('Önce tasarım dosyasını yüklemen gerekiyor');
                        setFilesOpen(true);
                        return;
                      }
                    }
                    const { completeStage } = await import('../../station/api');
                    const { error } = await completeStage(activeStage.id);
                    if (error) toast.error('Tamamlanamadı: ' + error.message);
                    else { toast.success('Aşama tamamlandı, QC bekleniyor'); refetch(); }
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.heroActiveStripBtnText}>
                    {(activeStage.station?.name ?? 'AŞAMA').toUpperCase()} TAMAMLANDI
                  </Text>
                </TouchableOpacity>
              )}
              {/* Manager onay/red butonları */}
              {isManager && activeStage.status === 'tamamlandi' && (
                <>
                  <TouchableOpacity
                    style={[styles.heroActiveStripBtn, { backgroundColor: 'rgba(220,38,38,0.18)', borderColor: 'rgba(220,38,38,0.50)' }]}
                    onPress={() => setQCRejectOpen(true)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.heroActiveStripBtnText, { color: '#FCA5A5' }]}>REDDET</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.heroActiveStripBtn, { backgroundColor: '#7C3AED' }]}
                    onPress={() => {
                      if (!profile) return;
                      const raw = (activeStage.station?.name ?? '').toUpperCase();
                      const map: Stage[] = ['TRIAGE', 'MANAGER_REVIEW', 'DESIGN', 'CAM', 'MILLING', 'SINTER', 'FINISH', 'QC'];
                      const stage = map.find(s => raw.includes(s)) ?? legacyStatusToStage(order.status);
                      setStageQCOpen(stage);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.heroActiveStripBtnText}>ONAYLA</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* heroBottom kaldırıldı — heroStepsRow zaten aynı bilgiyi gösteriyor */}

          {/* ── Hero Manager Section — INLINE inside heroCard (manager only) ── */}
          {isManager && profile && (() => {
            const stRaw = (activeStage?.station?.name ?? '').toUpperCase();
            const stMap: Stage[] = ['TRIAGE', 'MANAGER_REVIEW', 'DESIGN', 'CAM', 'MILLING', 'SINTER', 'FINISH', 'QC'];
            const currentStage = stMap.find(s => stRaw.includes(s)) ?? legacyStatusToStage(order.status);
            const labId = (profile as any)?.lab_id ?? profile?.id ?? '';
            return (
              <HeroManagerSection
                workOrderId={order.id}
                managerId={profile.id}
                labId={labId}
                currentStage={currentStage}
                ownerName={activeStage?.technician?.full_name ?? null}
                ownerId={activeStage?.technician?.id ?? null}
                activeStageId={activeStage?.id ?? null}
                startedAt={activeStage?.started_at ?? activeStage?.assigned_at ?? null}
                reworkCount={(order as any).rework_count ?? 0}
                priority={(order as any).priority ?? 'normal'}
                delayReason={(order as any).delay_reason ?? null}
                doctorApprovalRequired={(order as any).doctor_approval_required ?? false}
                managerReviewRequired={(order as any).manager_review_required ?? false}
                onChanged={refetch}
              />
            );
          })()}

        </View>{/* /heroCard */}

      </View>{/* /headerRow */}

      {/* ── Row 2: Boarding-pass tarzı iş emri kartı (full width) ── */}
      <OrderTicketCard
        order={order}
        qrUrl={qrUrl}
        pageBg="#F9F9FB"          // body backgroundColor — notch ile birebir uyum
        accentColor={accentColor}
        qrSize={96}                // QR daha büyük
        activeTooth={toothPopup}
        onToothPress={(fdi) => setToothPopup(prev => prev === fdi ? null : fdi)}
        onPrint={Platform.OS === 'web' ? () => handlePrint(order, qrUrl) : undefined}
        dockItems={[
          ...(Platform.OS === 'web'
            ? [{ iconName: 'print', label: 'Yazdır', onPress: () => setPrintOpen(true) }]
            : []),
          { iconName: 'message-circle', label: 'Sohbet',        onPress: () => setChatOpen(true) },
          { iconName: 'paperclip',      label: 'Dosyalar',      onPress: () => setFilesOpen(true) },
          { iconName: 'receipt',        label: 'Ücret Bilgisi', onPress: () => setBillingOpen(true) },
          { iconName: 'check-circle',   label: 'Prova',         onPress: () => setProvaOpen(true) },
          { iconName: 'folder-account-outline', label: 'Vaka',  onPress: () => setVakaOpen(true) },
        ]}
      />

      {/* ── Tahmini Materyal Tüketimi (forecast) ──────────────────────────── */}
      <View style={{ marginTop: 14 }}>
        <MaterialForecastSection workOrderId={order.id} />
      </View>

      {/* ── Kullanılan Materyaller — confirmed consumption kayıtları ─────── */}
      <View style={{ marginTop: 14 }}>
        <UsedMaterialsSection workOrderId={order.id} />
      </View>

      {/* ── Mali Bilgi — sale price + cost + profit + margin ────────────── */}
      <View style={{ marginTop: 14 }}>
        <OrderCostSection
          workOrderId={order.id}
          isManager={isManager}
          cachedTotal={(order as any).material_cost ?? null}
        />
      </View>

      {/* Body / contentArea kaldırıldı — sidebar olmadığı için zaten erişilemiyordu */}

      </View>{/* /pageGrid */}

      </ScrollView>{/* /OUTER SCROLL */}

      <StatusUpdateModal
        visible={modalVisible}
        currentStatus={order.status}
        onConfirm={handleStatusUpdate}
        onClose={() => setModalVisible(false)}
      />

      {/* ── Sohbet Popup (sadece bu işe özel) — main chat box ile aynı görünüm ── */}
      <Modal
        visible={chatOpen}
        transparent
        animationType="none"
        onRequestClose={() => setChatOpen(false)}
      >
        <Pressable style={filesPopup.overlay} onPress={() => setChatOpen(false)}>
          <Pressable style={[filesPopup.card, { width: '100%', maxWidth: 560, height: 560, maxHeight: '85%' as any, padding: 0 }]} onPress={(e) => e.stopPropagation?.()}>
            <ChatDetail
              selectedOrder={{
                work_order_id:    order.id,
                order_number:     order.order_number,
                patient_name:     order.patient_name,
                doctor_name:      order.doctor?.full_name ?? null,
                clinic_name:      order.doctor?.clinic_name ?? order.doctor?.clinic?.name ?? null,
                work_type:        order.work_type,
                status:           order.status,
                tooth_numbers:    order.tooth_numbers,
                shade:            order.shade,
                machine_type:     (order as any).machine_type,
                delivery_date:    order.delivery_date,
                notes:            order.notes,
                is_urgent:        order.is_urgent,
              }}
              accentColor={accentColor}
              currentUserId={profile?.id ?? null}
              viewerType={profile?.user_type ?? null}
            />
            <TouchableOpacity
              onPress={() => setChatOpen(false)}
              style={chatCloseBtn}
              accessibilityLabel="Sohbeti kapat"
              activeOpacity={0.8}
            >
              <AppIcon name={'close' as any} size={18} color="#64748B" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── QC Reject Modal — sebep + return stage seç ── */}
      {qcRejectOpen && profile && (
        <QCRejectModal
          visible
          workOrderId={order.id}
          rejectedBy={profile.id}
          availableStages={STAGE_ORDER.filter(st =>
            st !== 'QC' && st !== 'SHIPPED' && st !== 'DOCTOR_APPROVAL'
          ) as Stage[]}
          onClose={() => setQCRejectOpen(false)}
          onDone={() => refetch()}
        />
      )}

      {/* ── Generic Stage Checklist Modal — her stage için aynı mantık ── */}
      {stageQCOpen && profile && (
        <StageChecklistModal
          visible
          stage={stageQCOpen}
          workOrderId={order.id}
          managerId={profile.id}
          doctorId={order.doctor_id ?? null}
          requiresDoctorApproval={(order as any).doctor_approval_required ?? false}
          onClose={() => setStageQCOpen(null)}
          onApproved={async () => {
            setStageQCOpen(null);
            const { error } = await supabase.rpc('advance_to_next_stage', {
              p_work_order_id: order.id,
              p_approver_id:   profile.id,
            });
            if (error) toast.error('Stage geçişi: ' + error.message);
            else { toast.success('Sonraki aşama başlatıldı'); refetch(); }
          }}
        />
      )}

      {/* ── Dosyalar Popup — NewOrder ile aynı kategorili upload modal ── */}
      <FilesUploadModal
        visible={filesOpen}
        onClose={() => setFilesOpen(false)}
        accentColor={accentColor}
        attachments={(order.photos ?? [])
          .filter(p => !!p.caption && !!p.signed_url)
          .map<UploadAttachment>(p => ({
            id:   p.id,
            name: p.caption ?? '',
            uri:  p.signed_url!,
            kind: 'image',
          }))}
        onPickPhoto={(label) => handleUploadWithCaption(label, 'image/*')}
        onPickVideo={(label) => handleUploadWithCaption(label, 'video/*')}
        onPickScan={(label)  => handleUploadWithCaption(label, '.stl,.ply,.obj,model/stl,model/obj')}
        onPickPdf={(label)   => handleUploadWithCaption(label, '.pdf,application/pdf')}
        onPreview={(att) => {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.open(att.uri, '_blank');
          }
        }}
        onRemove={async (id) => {
          const photo = (order.photos ?? []).find(p => p.id === id);
          if (!photo) return;
          await supabase.storage.from('work-order-photos').remove([photo.storage_path]).catch(() => {});
          await supabase.from('work_order_photos').delete().eq('id', id);
          refetch();
        }}
      />

      {/* ── Prova Popup ── */}
      <Modal visible={provaOpen} transparent animationType="none" onRequestClose={() => setProvaOpen(false)}>
        <Pressable style={filesPopup.overlay} onPress={() => setProvaOpen(false)}>
          <Pressable style={filesPopup.card} onPress={(e) => e.stopPropagation?.()}>
            <View style={filesPopup.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[filesPopup.headerIcon, { backgroundColor: accentColor + '18' }]}>
                  <AppIcon name={'check-circle' as any} size={18} color={accentColor} />
                </View>
                <Text style={filesPopup.title}>Prova</Text>
              </View>
              <TouchableOpacity onPress={() => setProvaOpen(false)} style={filesPopup.closeBtn}>
                <AppIcon name={'close' as any} size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <ProvaSection workOrderId={order.id} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Vaka Popup ── */}
      <Modal visible={vakaOpen} transparent animationType="none" onRequestClose={() => setVakaOpen(false)}>
        <Pressable style={filesPopup.overlay} onPress={() => setVakaOpen(false)}>
          <Pressable style={filesPopup.card} onPress={(e) => e.stopPropagation?.()}>
            <View style={filesPopup.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[filesPopup.headerIcon, { backgroundColor: accentColor + '18' }]}>
                  <AppIcon name={'folder-account-outline' as any} size={18} color={accentColor} />
                </View>
                <Text style={filesPopup.title}>Vaka</Text>
              </View>
              <TouchableOpacity onPress={() => setVakaOpen(false)} style={filesPopup.closeBtn}>
                <AppIcon name={'close' as any} size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <VakaSection patientId={order.patient_id} patientName={order.patient_name} orderId={order.id} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Ücret Bilgisi Popup ── */}
      <Modal
        visible={billingOpen}
        transparent
        animationType="none"
        onRequestClose={() => setBillingOpen(false)}
      >
        <Pressable style={filesPopup.overlay} onPress={() => setBillingOpen(false)}>
          <Pressable style={filesPopup.card} onPress={(e) => e.stopPropagation?.()}>
            <View style={filesPopup.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[filesPopup.headerIcon, { backgroundColor: accentColor + '18' }]}>
                  <AppIcon name={'receipt' as any} size={18} color={accentColor} />
                </View>
                <Text style={filesPopup.title}>Ücret Bilgisi</Text>
              </View>
              <TouchableOpacity onPress={() => setBillingOpen(false)} style={filesPopup.closeBtn}>
                <AppIcon name={'close' as any} size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20 }}
              showsVerticalScrollIndicator={false}
            >
              <OrderItemsSection workOrderId={order.id} />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Yazdır Popup ── */}
      {Platform.OS === 'web' && (
        <Modal
          visible={printOpen}
          transparent
          animationType="none"
          onRequestClose={() => setPrintOpen(false)}
        >
          <Pressable style={filesPopup.overlay} onPress={() => setPrintOpen(false)}>
            <Pressable style={filesPopup.card} onPress={(e) => e.stopPropagation?.()}>
              <View style={filesPopup.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[filesPopup.headerIcon, { backgroundColor: accentColor + '18' }]}>
                    <AppIcon name={'print' as any} size={18} color={accentColor} />
                  </View>
                  <Text style={filesPopup.title}>Yazdır — Önizleme</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => {
                      try { printIframeRef.current?.contentWindow?.focus(); printIframeRef.current?.contentWindow?.print(); } catch {}
                    }}
                    style={[filesPopup.closeBtn, { backgroundColor: accentColor, paddingHorizontal: 14, width: 'auto' as any, flexDirection: 'row', gap: 6 }]}
                  >
                    <AppIcon name={'print' as any} size={16} color="#FFFFFF" />
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>Yazdır</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setPrintOpen(false)} style={filesPopup.closeBtn}>
                    <AppIcon name={'close' as any} size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ height: 720, maxHeight: '80vh' as any, backgroundColor: '#F8FAFC' }}>
                {React.createElement('iframe', {
                  ref: printIframeRef,
                  srcDoc: buildPrintHtml(order, qrUrl),
                  title: 'Yazdırma Önizleme',
                  style: { width: '100%', height: '100%', border: 0, backgroundColor: '#FFFFFF' },
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ── Tooth Popup ── */}
      {toothPopup !== null && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setToothPopup(null)}>
          <Pressable style={toothMs.backdrop} onPress={() => setToothPopup(null)}>
            <Pressable style={toothMs.sheet} onPress={() => {}}>
              {/* Handle */}
              <View style={toothMs.handle} />

              {/* Header: hasta adı (title) + diş numarası + kapat */}
              <View style={toothMs.header}>
                <View style={toothMs.toothBadge}>
                  <ToothIcon size={17} color="#6366F1" />
                  <Text style={toothMs.toothNum}>{toothPopup}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  {/* Hasta adı = başlık */}
                  <Text style={toothMs.patientTitle} numberOfLines={1}>
                    {order.patient_name ?? '—'}
                  </Text>
                  <Text style={toothMs.toothSubLabel}>Diş {toothPopup} — İşlem Detayı</Text>
                </View>
                <TouchableOpacity onPress={() => setToothPopup(null)} style={toothMs.closeBtn} activeOpacity={0.7}>
                  <AppIcon name="close" size={17} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Diş-özel tooth_op varsa göster, yoksa genel bilgi */}
              {(() => {
                const op = ((order as any).tooth_ops ?? []).find((o: any) => o.tooth === toothPopup);
                return (
                  <View style={toothMs.metaRow}>
                    <View style={toothMs.metaChip}>
                      <Text style={toothMs.metaLabel}>İş Tipi</Text>
                      <Text style={toothMs.metaValue} numberOfLines={2}>
                        {op?.work_type ?? order.work_type ?? '—'}
                      </Text>
                    </View>
                    <View style={toothMs.metaChip}>
                      <Text style={toothMs.metaLabel}>Renk / Shade</Text>
                      <Text style={toothMs.metaValue}>{op?.shade ?? order.shade ?? '—'}</Text>
                    </View>
                    <View style={toothMs.metaChip}>
                      <Text style={toothMs.metaLabel}>Üretim</Text>
                      <Text style={toothMs.metaValue}>
                        {order.machine_type === 'milling' ? 'Frezeleme' : '3D Baskı'}
                      </Text>
                    </View>
                    <View style={[toothMs.metaChip, { backgroundColor: `${cfg.color}15` }]}>
                      <Text style={toothMs.metaLabel}>Durum</Text>
                      <Text style={[toothMs.metaValue, { color: cfg.color }]}>
                        {cfg.label}
                      </Text>
                    </View>
                    {op?.notes ? (
                      <View style={[toothMs.metaChip, { flexBasis: '100%' }]}>
                        <Text style={toothMs.metaLabel}>Not</Text>
                        <Text style={toothMs.metaValue}>{op.notes}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })()}

              {/* Teslim tarihi */}
              <View style={toothMs.deliveryRow}>
                <AppIcon name={'calendar-outline' as any} size={14} color={overdue ? '#EF4444' : '#94A3B8'} />
                <Text style={[toothMs.deliveryText, overdue && { color: '#EF4444' }]}>
                  Teslim: {formatDeliveryDate(order.delivery_date)}
                  {overdue ? `  ·  ${Math.abs(daysLeft)} gün gecikti` : daysLeft <= 3 ? `  ·  ${daysLeft} gün kaldı` : ''}
                </Text>
              </View>

              {/* Notes */}
              {(order.notes || (order.lab_notes_visible && order.lab_notes)) ? (
                <View style={toothMs.notesBox}>
                  <Text style={toothMs.notesLabel}>📋 Not</Text>
                  {order.notes ? (
                    <Text style={toothMs.notesText}>{order.notes}</Text>
                  ) : null}
                  {order.lab_notes_visible && order.lab_notes ? (
                    <Text style={[toothMs.notesText, { color: '#6366F1', marginTop: 4 }]}>
                      Lab: {order.lab_notes}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Actions */}
              <View style={toothMs.actions}>
                <TouchableOpacity
                  style={toothMs.primaryBtn}
                  onPress={() => { const t = toothPopup; setToothPopup(null); handleAddPhoto(t); }}
                  activeOpacity={0.8}
                >
                  <AppIcon name={'paperclip' as any} size={15} color="#FFFFFF" />
                  <Text style={toothMs.primaryBtnText}>
                    {(order.photos ?? []).filter(p => p.tooth_number === toothPopup).length > 0
                      ? `${(order.photos ?? []).filter(p => p.tooth_number === toothPopup).length} Dosya Var · Ekle`
                      : 'Dosya Ekle'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setToothPopup(null)} style={toothMs.dismissBtn} activeOpacity={0.7}>
                  <Text style={toothMs.dismissText}>Kapat</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* ── QR Modal ── */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <Pressable style={qrs.backdrop} onPress={() => setShowQR(false)}>
          <Pressable style={qrs.card} onPress={() => {}}>
            <Text style={qrs.title}>İş Emri QR Kodu</Text>
            <Text style={qrs.subtitle}>{order.order_number}</Text>

            <View style={qrs.qrWrap}>
              <BrandedQR
                value={qrUrl}
                size={200}
                color="#0F172A"
                backgroundColor="#FFFFFF"
              />
            </View>

            <Text style={qrs.hint}>
              Tarayarak kendi panelinde açılır
            </Text>
            <Text style={qrs.roleHint}>
              🧑‍⚕️ Hekim · 🔬 Teknisyen · 🛡️ Admin · 👔 Müdür
            </Text>

            <Text style={qrs.url} numberOfLines={2}>{qrUrl}</Text>

            <TouchableOpacity style={qrs.closeBtn} onPress={() => setShowQR(false)}>
              <Text style={qrs.closeBtnText}>Kapat</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const qrs = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28,
    alignItems: 'center', width: 300,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 12,
  },
  title:    { fontSize: 16, fontWeight: '600', color: '#0F172A', marginBottom: 2 },
  subtitle: { fontSize: 12, color: '#64748B', marginBottom: 20 },
  qrWrap:   { padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9' },
  hint:     { fontSize: 12, color: '#475569', marginTop: 16, textAlign: 'center' },
  roleHint: { fontSize: 11, color: '#94A3B8', marginTop: 4, textAlign: 'center' },
  url:      { fontSize: 9, color: '#CBD5E1', marginTop: 10, textAlign: 'center' },
  closeBtn: { marginTop: 20, paddingHorizontal: 32, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F1F5F9' },
  closeBtnText: { fontSize: 13, color: '#0F172A', fontWeight: '600' },
});

// ── Tooth popup sheet styles ───────────────────────────────────────────────────
const toothMs = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(15,23,42,0.5)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    gap: 14,
    width: '100%',
    maxWidth: 480,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 20,
  },
  handle: {
    display: 'none',
    width: 0, height: 0,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  toothBadge: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5, borderColor: '#C7D2FE',
    alignItems: 'center', justifyContent: 'center',
    gap: 2,
  },
  toothNum: {
    fontSize: 14, fontWeight: '800', color: '#4338CA', lineHeight: 15,
  },
  // Hasta adı — popup başlığı
  patientTitle: {
    fontSize: 17, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3, lineHeight: 21,
  },
  toothSubLabel: {
    fontSize: 11, color: '#94A3B8', fontWeight: '500',
  },
  toothWorkType: {
    fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3, lineHeight: 21,
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  metaRow: {
    flexDirection: 'row', gap: 8, flexWrap: 'wrap',
  },
  metaChip: {
    flex: 1, minWidth: 80,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
    gap: 4,
  },
  metaLabel: {
    fontSize: 10, color: '#94A3B8', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 14, fontWeight: '700', color: '#0F172A',
  },
  deliveryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: '#F8FAFC',
    borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  deliveryText: {
    fontSize: 12, fontWeight: '600', color: '#64748B', flex: 1,
  },
  notesBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1, borderColor: '#F1F5F9',
    borderLeftWidth: 3, borderLeftColor: '#6366F1',
    gap: 5,
  },
  notesLabel: {
    fontSize: 11, color: '#6366F1', fontWeight: '700',
  },
  notesText: {
    fontSize: 13, color: '#334155', lineHeight: 20,
  },
  actions: {
    flexDirection: 'row', gap: 10,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: {
    fontSize: 14, fontWeight: '700', color: '#FFFFFF',
  },
  dismissBtn: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  dismissText: {
    fontSize: 14, fontWeight: '600', color: '#64748B',
  },
});

// ── Section components ──

// ── Tooth job card ────────────────────────────────────────────────────────────
function ToothJobCard({ tooth, order, isActive, onPress, onAddFile }: {
  tooth: number;
  order: WorkOrder;
  isActive?: boolean;
  onPress?: () => void;
  onAddFile?: () => void;
}) {
  const chips        = (order.work_type ?? '').trim().split(/\s+/).filter(Boolean);
  const machine      = order.machine_type === 'milling' ? 'Frezeleme' : '3D Baskı';
  // Count only files that belong to THIS tooth
  const photosCount  = (order.photos ?? []).filter(p => p.tooth_number === tooth).length;
  const hasNotes     = Boolean(order.notes);
  const hasLabNotes  = order.lab_notes_visible && Boolean(order.lab_notes);
  const notesCount   = (hasNotes ? 1 : 0) + (hasLabNotes ? 1 : 0);

  return (
    <TouchableOpacity
      style={[tcStyles.card, isActive && tcStyles.cardActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Header — tooth icon + number */}
      <View style={tcStyles.header}>
        <ToothIcon size={15} color={isActive ? '#0F172A' : '#0F172A'} />
        <Text style={[tcStyles.toothNum, isActive && tcStyles.toothNumActive]}>{tooth}</Text>
        {isActive && (
          <View style={tcStyles.activePill}>
            <Text style={tcStyles.activePillText}>Aktif</Text>
          </View>
        )}
      </View>

      {/* Work-type chips */}
      <View style={tcStyles.chips}>
        {chips.map((chip, i) => (
          <View key={i} style={tcStyles.chip}>
            <Text style={tcStyles.chipText}>{chip}</Text>
          </View>
        ))}
      </View>

      {/* Meta: shade + machine */}
      <View style={tcStyles.metaRow}>
        {order.shade ? (
          <View style={tcStyles.metaItem}>
            <Text style={tcStyles.metaLabel}>Shade</Text>
            <Text style={tcStyles.metaValue}>{order.shade}</Text>
          </View>
        ) : null}
        <View style={tcStyles.metaItem}>
          <Text style={tcStyles.metaLabel}>Makine</Text>
          <Text style={tcStyles.metaValue}>{machine}</Text>
        </View>
      </View>

      {/* Footer badges + add-file button */}
      <View style={tcStyles.footer}>
        {/* Files badge */}
        <TouchableOpacity
          style={[tcStyles.badge, tcStyles.badgeFile, photosCount > 0 && tcStyles.badgeFileActive]}
          onPress={onAddFile}
          activeOpacity={0.7}
        >
          <AppIcon name={'paperclip' as any} size={11} color={photosCount > 0 ? '#0F172A' : '#94A3B8'} />
          <Text style={[tcStyles.badgeText, photosCount > 0 && tcStyles.badgeTextActive]}>
            {photosCount > 0 ? `${photosCount} dosya` : 'Dosya ekle'}
          </Text>
        </TouchableOpacity>

        {/* Notes badge */}
        {notesCount > 0 && (
          <View style={tcStyles.badge}>
            <AppIcon name={'message-text-outline' as any} size={11} color="#64748B" />
            <Text style={tcStyles.badgeText}>Notlar ({notesCount})</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const tcStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 12,
    gap: 8,
    marginBottom: 8,
  },
  cardActive: {
    backgroundColor: '#F1F5F9',
    borderColor: '#0F172A',
    borderWidth: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toothNum: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  toothNumActive: { color: '#0F172A' },
  activePill: {
    marginLeft: 'auto' as any,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  activePillText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  chip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  chipText: { fontSize: 11, fontWeight: '600', color: '#0F172A' },
  metaRow:  { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  metaValue: { fontSize: 12, fontWeight: '600', color: '#1E293B' },
  footer: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 7,
    flexWrap: 'wrap',
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeFile: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  badgeFileActive: {
    borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9',
  },
  badgeText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  badgeTextActive: { color: '#0F172A', fontWeight: '600' },
});

// ─────────────────────────────────────────────────────────────────────────────

function DetailsSection({ order, qrUrl, onAddFile }: {
  order: WorkOrder;
  qrUrl: string;
  onAddFile?: (tooth: number) => void;
}) {
  const sorted = React.useMemo(
    () => [...(order.tooth_numbers ?? [])].sort((a, b) => a - b),
    [order.tooth_numbers],
  );

  return (
    <View style={{ gap: 10 }}>
      {/* Tooth job cards — full width (chart is in hero row) */}
      {sorted.length > 0 ? (
        sorted.map(tooth => (
          <ToothJobCard
            key={tooth}
            tooth={tooth}
            order={order}
            onAddFile={onAddFile ? () => onAddFile(tooth) : undefined}
          />
        ))
      ) : (
        <View style={tcStyles.card}>
          <Text style={{ fontSize: 13, color: '#94A3B8' }}>Diş seçilmemiş</Text>
        </View>
      )}
    </View>
  );
}

function StepsSection({ workOrderId, history }: { workOrderId: string; history: any[] }) {
  const { steps, loading, refetch } = useCaseSteps(workOrderId);

  return (
    <View style={{ gap: 20 }}>
      {/* MES Production Steps */}
      <View>
        <Text style={sectionStyles.heading}>Üretim Adımları</Text>
        {steps.length === 0 && !loading ? (
          <View style={prodEmptyWrap}>
            <Text style={prodEmptyText}>
              Bu iş emri için üretim adımı bulunamadı.{'\n'}
              İş emri oluşturulurken ölçüm tipi seçilmemişse adımlar oluşturulmamış olabilir.
            </Text>
          </View>
        ) : (
          <StepTimeline steps={steps} loading={loading} onRefresh={refetch} />
        )}
      </View>

      {/* Status History */}
      {history.length > 0 && (
        <View>
          <Text style={sectionStyles.heading}>Durum Geçmişi</Text>
          <StatusTimeline history={history} />
        </View>
      )}
    </View>
  );
}

const prodEmptyWrap: import('react-native').ViewStyle = {
  backgroundColor: '#F8FAFC',
  borderRadius: 12,
  padding: 16,
  borderWidth: 1,
  borderColor: '#F1F5F9',
};
const prodEmptyText: import('react-native').TextStyle = {
  fontSize: 13,
  color: '#94A3B8',
  textAlign: 'center',
  lineHeight: 20,
};

function DoctorSection({ order }: { order: WorkOrder }) {
  const doc = order.doctor;
  if (!doc) return <Text style={{ color: C.textMuted }}>Hekim bilgisi yok</Text>;
  return (
    <View>
      <Text style={sectionStyles.heading}>Hekim Bilgisi</Text>
      <View style={sectionStyles.table}>
        <TableRow label="Ad Soyad" value={doc.full_name} bold />
        {doc.clinic?.name && <TableRow label="Klinik" value={doc.clinic.name} />}
        {(doc as any).phone && <TableRow label="Telefon" value={(doc as any).phone} />}
      </View>
    </View>
  );
}

function FilesSection({
  order,
  signedUrls,
  uploading,
  onAdd,
}: {
  order: WorkOrder;
  signedUrls: Record<string, string>;
  uploading: boolean;
  onAdd: (tooth?: number | null) => void;
}) {
  const photos = order.photos ?? [];

  // Group by tooth_number; null → general
  const grouped = React.useMemo(() => {
    const map: Record<string, typeof photos> = {};
    photos.forEach(p => {
      const key = p.tooth_number != null ? String(p.tooth_number) : '__general__';
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    // Sort keys: teeth numerically first, then general
    const keys = Object.keys(map).sort((a, b) => {
      if (a === '__general__') return 1;
      if (b === '__general__') return -1;
      return parseInt(a) - parseInt(b);
    });
    return keys.map(k => ({ key: k, photos: map[k] }));
  }, [photos]);

  const sortedTeeth = (order.tooth_numbers ?? []).slice().sort((a, b) => a - b);

  return (
    <View>
      {/* Header */}
      <View style={sectionStyles.filesHeader}>
        <Text style={sectionStyles.heading}>Dosyalar ({photos.length})</Text>
        <TouchableOpacity onPress={() => onAdd(null)} style={sectionStyles.addBtn} disabled={uploading}>
          <Text style={sectionStyles.addBtnText}>{uploading ? 'Yükleniyor...' : '+ Genel'}</Text>
        </TouchableOpacity>
      </View>

      {/* Per-tooth quick upload row */}
      {sortedTeeth.length > 0 && (
        <View style={fStyles.toothUploadRow}>
          <Text style={fStyles.toothUploadLabel}>Diş bazlı ekle:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {sortedTeeth.map(t => (
              <TouchableOpacity
                key={t}
                style={fStyles.toothUploadBtn}
                onPress={() => onAdd(t)}
                disabled={uploading}
                activeOpacity={0.75}
              >
                <ToothIcon size={12} color="#0F172A" />
                <Text style={fStyles.toothUploadNum}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Empty state */}
      {photos.length === 0 ? (
        <View style={sectionStyles.noFiles}>
          <Text style={sectionStyles.noFilesText}>📁 Henüz dosya yok</Text>
          <Text style={sectionStyles.noFilesSubText}>Dosya eklemek için + Genel veya diş numarasına basın</Text>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          {grouped.map(group => (
            <View key={group.key}>
              {/* Group header */}
              <View style={fStyles.groupHeader}>
                {group.key === '__general__' ? (
                  <Text style={fStyles.groupTitle}>📁 Genel Dosyalar</Text>
                ) : (
                  <View style={fStyles.groupTitleRow}>
                    <ToothIcon size={14} color="#0F172A" />
                    <Text style={fStyles.groupTitle}>Diş {group.key}</Text>
                  </View>
                )}
                <Text style={fStyles.groupCount}>{group.photos.length} dosya</Text>
              </View>

              {/* Thumbnails */}
              <View style={sectionStyles.photoGrid}>
                {group.photos.map((photo) => {
                  const url = signedUrls[photo.storage_path];
                  return url ? (
                    <TouchableOpacity
                      key={photo.id}
                      onPress={() => { if (typeof window !== 'undefined') window.open(url, '_blank'); }}
                      activeOpacity={0.8}
                    >
                      <Image source={{ uri: url }} style={sectionStyles.photo} />
                    </TouchableOpacity>
                  ) : null;
                })}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// FilesSection internal styles
const fStyles = StyleSheet.create({
  toothUploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  toothUploadLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  toothUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9',
  },
  toothUploadNum: { fontSize: 12, fontWeight: '700', color: '#0F172A' },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  groupTitle: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  groupCount: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
});

function VakaSection({
  patientId,
  patientName,
  orderId,
}: {
  patientId: string | null;
  patientName: string | null;
  orderId: string;
}) {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPatientOrders(patientId, patientName, orderId).then(({ data }) => {
      setOrders(data ?? []);
      setLoading(false);
    });
  }, [patientId, patientName, orderId]);

  if (!patientId && !patientName) {
    return (
      <View>
        <Text style={sectionStyles.heading}>Vaka Geçmişi</Text>
        <View style={sectionStyles.noFiles}>
          <Text style={sectionStyles.noFilesText}>👤 Hasta bilgisi girilmemiş</Text>
          <Text style={sectionStyles.noFilesSubText}>
            İş emrinde hasta adı veya TC eklenirse vaka geçmişi burada görünür
          </Text>
        </View>
      </View>
    );
  }

  const STATUS_EMOJI: Record<string, string> = {
    alindi: '📥',
    uretimde: '⚙️',
    kalite_kontrol: '🔍',
    teslimata_hazir: '📦',
    teslim_edildi: '✅',
  };

  return (
    <View>
      <Text style={sectionStyles.heading}>
        Vaka Geçmişi — {patientName ?? patientId}
      </Text>
      {loading ? (
        <Text style={{ color: C.textMuted, padding: 12 }}>Yükleniyor...</Text>
      ) : orders.length === 0 ? (
        <View style={sectionStyles.noFiles}>
          <Text style={sectionStyles.noFilesText}>📂 Başka iş emri bulunamadı</Text>
          <Text style={sectionStyles.noFilesSubText}>
            Bu hastaya ait tek iş emri bu
          </Text>
        </View>
      ) : (
        <View style={sectionStyles.table}>
          {orders.map((o) => (
            <TouchableOpacity
              key={o.id}
              style={sectionStyles.tableRow}
              onPress={() => router.push(`/(lab)/order/${o.id}`)}
            >
              <Text style={sectionStyles.tableLabel}>{o.order_number}</Text>
              <Text style={{ flex: 1, fontSize: 13, color: C.textPrimary }}>{o.work_type}</Text>
              <Text style={{ fontSize: 13, color: C.textSecondary }}>
                {STATUS_EMOJI[o.status] ?? ''} {STATUS_CONFIG[o.status as WorkOrderStatus]?.label ?? o.status}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function TableRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={sectionStyles.tableRow}>
      <Text style={sectionStyles.tableLabel}>{label}</Text>
      <Text style={[sectionStyles.tableValue, bold && { fontWeight: '700', color: C.textPrimary }]}>
        {value}
      </Text>
    </View>
  );
}

// ── Audio Player ─────────────────────────────────────────────────────────────
function AudioPlayer({ url, isMe }: { url: string; isMe: boolean }) {
  const [playing, setPlaying]       = React.useState(false);
  const [duration, setDuration]     = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const audioRef = React.useRef<any>(null);

  // Pseudo-random waveform heights seeded from url so they're stable
  const bars = React.useMemo(() => {
    let h = 0;
    for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) & 0xffff;
    return Array.from({ length: 30 }, () => {
      h = (h * 1664525 + 1013904223) & 0xffff;
      return 4 + (h % 20); // 4–23 px
    });
  }, [url]);

  const progress = duration > 0 ? currentTime / duration : 0;

  function fmtT(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else         { audioRef.current.play();  setPlaying(true);  }
  };

  const playBg   = isMe ? 'rgba(255,255,255,0.2)' : '#0F172A';
  const barDone  = isMe ? '#FFFFFF'               : '#0F172A';
  const barRest  = isMe ? 'rgba(255,255,255,0.35)' : '#CBD5E1';
  const timeCol  = isMe ? 'rgba(255,255,255,0.75)' : '#64748B';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center',
                   gap: 9, paddingTop: 2, paddingBottom: 2 }}>
      {/* @ts-ignore */}
      <audio ref={audioRef} src={url}
        onLoadedMetadata={(e: any) => setDuration(e.target.duration)}
        onTimeUpdate={(e: any) => setCurrentTime(e.target.currentTime)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); audioRef.current && (audioRef.current.currentTime = 0); }}
        style={{ display: 'none' }}
      />

      {/* Play / Pause */}
      <TouchableOpacity onPress={toggle}
        style={{ width: 34, height: 34, borderRadius: 17,
                 backgroundColor: playBg,
                 alignItems: 'center', justifyContent: 'center' }}>
        <AppIcon
          name={(playing ? 'pause' : 'play') as any}
          size={18}
          color="#FFFFFF"
        />
      </TouchableOpacity>

      {/* Waveform bars */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 }}>
        {bars.map((h, i) => (
          <View key={i} style={{
            width: 3, height: h, borderRadius: 2,
            backgroundColor: (i / bars.length) < progress ? barDone : barRest,
          }} />
        ))}
      </View>

      {/* Time */}
      <Text style={{ fontSize: 11, fontWeight: '600', color: timeCol, minWidth: 34, textAlign: 'right' }}>
        {duration > 0 ? fmtT(playing ? currentTime : duration) : '--:--'}
      </Text>
    </View>
  );
}

// ── Chat Section ─────────────────────────────────────────────────────────────

function ChatSection({
  workOrderId,
  embedded,
  orderNotes,
}: {
  workOrderId: string;
  embedded?: boolean;
  orderNotes?: string | null;
}) {
  const { profile } = useAuthStore();
  const { messages, loading, sending, send, sendWithAttachment } = useChatMessages(workOrderId);
  const [text, setText]               = useState('');
  const [uploading, setUploading]     = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds]   = useState(0);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [pendingFile, setPendingFile]       = useState<File | null>(null);
  const [pendingCaption, setPendingCaption] = useState('');
  const scrollRef     = React.useRef<ScrollView>(null);
  const imageInputRef = React.useRef<any>(null);
  const scanInputRef  = React.useRef<any>(null);
  const docInputRef   = React.useRef<any>(null);
  const recorderRef   = React.useRef<any>(null);
  const chunksRef     = React.useRef<Blob[]>([]);
  const recTimerRef   = React.useRef<any>(null);

  const scrollToEnd = () =>
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);

  const handleSend = async () => {
    if (!profile || !text.trim()) return;
    const content = text.trim();
    setText('');
    const err = await send(profile.id, content);
    if (err) {
      setText(content); // restore text on failure
      toast.error(
        err.includes('does not exist')
          ? 'Mesaj tablosu henüz oluşturulmamış. Lütfen Supabase SQL Editor\'da 011_order_messages.sql ve 011b_order_messages_attachments.sql migration\'larını çalıştırın.'
          : err
      );
    } else {
      scrollToEnd();
    }
  };

  /* ── File picker ─────────────────────────────────────────────────────── */
  const handleFileChange = (e: any) => {
    const file: File = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so same file can be picked again
    setAttachMenuOpen(false);
    setPendingFile(file);
    setPendingCaption('');
  };

  const handleSendPending = async () => {
    if (!pendingFile || !profile) return;
    let type: 'image' | 'audio' | 'file' = 'file';
    if (pendingFile.type.startsWith('image/')) type = 'image';
    else if (pendingFile.type.startsWith('audio/')) type = 'audio';

    setUploading(true);
    const { url, error } = await uploadChatAttachment(pendingFile, workOrderId, pendingFile.name);
    setUploading(false);

    if (error || !url) { toast.error(error ?? 'Yükleme başarısız'); return; }
    const err = await sendWithAttachment(profile.id, pendingCaption.trim(), { url, type, name: pendingFile.name, size: pendingFile.size });
    if (err) { toast.error(err); return; }
    setPendingFile(null);
    setPendingCaption('');
    scrollToEnd();
  };

  /* ── Voice recorder ──────────────────────────────────────────────────── */
  const startRecording = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (!profile) return;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext  = mimeType.includes('webm') ? 'webm' : 'ogg';
        setUploading(true);
        const { url, error } = await uploadChatAttachment(blob, workOrderId, `voice_${Date.now()}.${ext}`);
        setUploading(false);
        if (error || !url) { toast.error(error ?? 'Ses yüklenemedi'); return; }
        const err = await sendWithAttachment(profile.id, '', { url, type: 'audio', name: 'Sesli Mesaj', size: blob.size });
        if (err) { toast.error(err); return; }
        scrollToEnd();
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      toast.error('Mikrofon erişimi reddedildi');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    clearInterval(recTimerRef.current);
    setIsRecording(false);
    setRecSeconds(0);
  };

  const cancelRecording = () => {
    if (recorderRef.current) {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    clearInterval(recTimerRef.current);
    setIsRecording(false);
    setRecSeconds(0);
  };

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  const fmtSec = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const fmtSize = (bytes?: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /* ── Render ───────────────────────────────────────────────────────────── */
  const hasContent = messages.length > 0 || !!orderNotes;

  return (
    <View style={[cs.container, embedded && cs.containerEmbedded]}>

      {/* Message list */}
      <ScrollView
        ref={scrollRef}
        style={cs.list}
        contentContainerStyle={cs.listContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {loading ? (
          <View style={cs.emptyBox}>
            <Text style={cs.emptyText}>Yükleniyor...</Text>
          </View>
        ) : !hasContent ? (
          <View style={cs.emptyBox}>
            <AppIcon name={'message-outline' as any} size={32} color="#CBD5E1" />
            <Text style={cs.emptyTitle}>Henüz mesaj yok</Text>
            <Text style={cs.emptyText}>Hekim veya lab mesaj gönderdiğinde burada görünür</Text>
          </View>
        ) : (
          <>
          {/* Order note — shown as the first "message" from the doctor */}
          {orderNotes ? (
            <View style={cs.msgRow}>
              <View style={[cs.avatar, cs.avatarDoctor]}>
                <AppIcon name={'stethoscope' as any} size={14} color="#FFFFFF" />
              </View>
              <View style={[cs.bubble, cs.bubbleThem, cs.bubbleNote]}>
                <Text style={cs.noteLabel}>İş Emri Notu · Hekim</Text>
                <Text style={cs.msgText}>{orderNotes}</Text>
              </View>
            </View>
          ) : null}
          {messages.map((msg) => {
            const isMe       = msg.sender_id === profile?.id;
            const senderName = msg.sender?.full_name ?? 'Bilinmiyor';
            const senderType = msg.sender?.user_type ?? '';
            const roleLabel  = senderType === 'doctor' ? 'Hekim'
                             : senderType === 'lab'    ? 'Lab'
                             : senderType === 'admin'  ? 'Admin' : senderType;
            return (
              <View key={msg.id} style={[cs.msgRow, isMe && cs.msgRowMe]}>
                {!isMe && (
                  <View style={cs.avatar}>
                    <Text style={cs.avatarText}>{senderName.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={[cs.bubble, isMe ? cs.bubbleMe : cs.bubbleThem]}>
                  {!isMe && (
                    <Text style={cs.senderName}>{senderName} · {roleLabel}</Text>
                  )}

                  {/* Image attachment */}
                  {msg.attachment_type === 'image' && msg.attachment_url ? (
                    <TouchableOpacity
                      onPress={() => { if (typeof window !== 'undefined') window.open(msg.attachment_url!, '_blank'); }}
                      activeOpacity={0.85}
                    >
                      <Image source={{ uri: msg.attachment_url }} style={cs.attachImage} resizeMode="cover" />
                    </TouchableOpacity>
                  ) : null}

                  {/* Audio attachment */}
                  {msg.attachment_type === 'audio' && msg.attachment_url ? (
                    <AudioPlayer url={msg.attachment_url} isMe={isMe} />
                  ) : null}

                  {/* File attachment */}
                  {msg.attachment_type === 'file' && msg.attachment_url ? (
                    <TouchableOpacity
                      style={[cs.fileChip, isMe && cs.fileChipMe]}
                      onPress={() => { if (typeof window !== 'undefined') window.open(msg.attachment_url!, '_blank'); }}
                      activeOpacity={0.8}
                    >
                      <AppIcon name={'file-document-outline' as any} size={20} color={isMe ? '#FFF' : '#0F172A'} />
                      <View style={{ flex: 1 }}>
                        <Text style={[cs.fileChipName, isMe && { color: '#FFF' }]} numberOfLines={1}>
                          {msg.attachment_name ?? 'Dosya'}
                        </Text>
                        {msg.attachment_size ? (
                          <Text style={[cs.fileChipSize, isMe && { color: 'rgba(255,255,255,0.6)' }]}>
                            {fmtSize(msg.attachment_size)}
                          </Text>
                        ) : null}
                      </View>
                      <AppIcon name={'download-outline' as any} size={16} color={isMe ? 'rgba(255,255,255,0.7)' : '#94A3B8'} />
                    </TouchableOpacity>
                  ) : null}

                  {/* Text */}
                  {msg.content ? (
                    <Text style={[cs.msgText, isMe && cs.msgTextMe]}>{msg.content}</Text>
                  ) : null}

                  <Text style={[cs.msgTime, isMe && cs.msgTimeMe]}>{fmtTime(msg.created_at)}</Text>
                </View>
              </View>
            );
          })}
          </>
        )}
      </ScrollView>

      {/* Hidden file inputs (web only) */}
      {Platform.OS === 'web' ? (
        <>
          {/* @ts-ignore */}
          <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          {/* @ts-ignore */}
          <input ref={scanInputRef}  type="file" accept=".stl,.ply,.obj,.step,.stp,.dcm" style={{ display: 'none' }} onChange={handleFileChange} />
          {/* @ts-ignore */}
          <input ref={docInputRef}   type="file" style={{ display: 'none' }} onChange={handleFileChange} />
        </>
      ) : null}

      {/* File preview modal */}
      {pendingFile ? (
        <Modal transparent animationType="fade" onRequestClose={() => setPendingFile(null)}>
          <Pressable style={cs.previewOverlay} onPress={() => setPendingFile(null)}>
            <Pressable style={cs.previewCard} onPress={e => e.stopPropagation()}>
              {/* Header */}
              <View style={cs.previewHeader}>
                <Text style={cs.previewTitle}>Dosya Gönder</Text>
                <TouchableOpacity onPress={() => setPendingFile(null)}>
                  <AppIcon name={'close' as any} size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* File preview area */}
              {pendingFile.type.startsWith('image/') ? (
                // @ts-ignore
                <Image
                  source={{ uri: URL.createObjectURL(pendingFile) }}
                  style={cs.previewImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={cs.previewFileIcon}>
                  <AppIcon
                    name={
                      pendingFile.name.match(/\.(stl|ply|obj|step|stp)$/i)
                        ? ('cube-outline' as any)
                        : ('file-document-outline' as any)
                    }
                    size={48}
                    color="#0F172A"
                  />
                  <Text style={cs.previewFileName} numberOfLines={2}>{pendingFile.name}</Text>
                  <Text style={cs.previewFileSize}>{fmtSize(pendingFile.size)}</Text>
                </View>
              )}

              {/* Caption input */}
              <View style={cs.previewCaptionRow}>
                <TextInput
                  style={cs.previewCaption}
                  placeholder="Başlık ekle (isteğe bağlı)..."
                  placeholderTextColor="#94A3B8"
                  value={pendingCaption}
                  onChangeText={setPendingCaption}
                />
              </View>

              {/* Actions */}
              <View style={cs.previewActions}>
                <TouchableOpacity style={cs.previewCancelBtn} onPress={() => setPendingFile(null)}>
                  <Text style={cs.previewCancelText}>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[cs.previewSendBtn, uploading && cs.sendBtnDisabled]}
                  onPress={handleSendPending}
                  disabled={uploading}
                >
                  <AppIcon name={uploading ? ('loading' as any) : ('send' as any)} size={16} color="#FFFFFF" />
                  <Text style={cs.previewSendText}>{uploading ? 'Gönderiliyor...' : 'Gönder'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {/* Recording bar */}
      {isRecording ? (
        <View style={cs.recordBar}>
          <View style={cs.recDot} />
          <Text style={cs.recTime}>{fmtSec(recSeconds)}</Text>
          <Text style={cs.recLabel}>Kayıt yapılıyor</Text>
          <TouchableOpacity style={cs.recCancelBtn} onPress={cancelRecording}>
            <AppIcon name={'close' as any} size={18} color="#64748B" />
          </TouchableOpacity>
          <TouchableOpacity style={cs.recSendBtn} onPress={stopRecording} disabled={uploading}>
            <AppIcon name={'send' as any} size={16} color="#FFFFFF" />
            <Text style={cs.recSendText}>Gönder</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* Input bar */
        <View style={cs.inputBar}>
          {/* Attach menu — web only */}
          {Platform.OS === 'web' ? (
            <View style={{ position: 'relative' }}>
              {/* WhatsApp-style vertical menu — stacks upward above button */}
              {attachMenuOpen && (
                <>
                  {/* Full backdrop to catch outside clicks */}
                  <Pressable style={cs.attachBackdrop} onPress={() => setAttachMenuOpen(false)} />
                  {/* Menu items */}
                  <View style={cs.attachMenu}>
                    {/* Fotoğraf — top */}
                    <TouchableOpacity
                      style={cs.attachItem}
                      onPress={() => { setAttachMenuOpen(false); imageInputRef.current?.click(); }}
                      activeOpacity={0.85}
                    >
                      <Text style={cs.attachItemLabel}>Fotoğraf</Text>
                      <View style={[cs.attachIconCircle, { backgroundColor: '#0F172A' }]}>
                        <AppIcon name={'image-outline' as any} size={22} color="#FFFFFF" />
                      </View>
                    </TouchableOpacity>

                    {/* Dijital Tarama — middle */}
                    <TouchableOpacity
                      style={cs.attachItem}
                      onPress={() => { setAttachMenuOpen(false); scanInputRef.current?.click(); }}
                      activeOpacity={0.85}
                    >
                      <Text style={cs.attachItemLabel}>Dijital Tarama</Text>
                      <View style={[cs.attachIconCircle, { backgroundColor: '#0891B2' }]}>
                        <AppIcon name={'cube-scan' as any} size={22} color="#FFFFFF" />
                      </View>
                    </TouchableOpacity>

                    {/* Dosya — bottom (closest to button) */}
                    <TouchableOpacity
                      style={cs.attachItem}
                      onPress={() => { setAttachMenuOpen(false); docInputRef.current?.click(); }}
                      activeOpacity={0.85}
                    >
                      <Text style={cs.attachItemLabel}>Dosya</Text>
                      <View style={[cs.attachIconCircle, { backgroundColor: '#7C3AED' }]}>
                        <AppIcon name={'file-document-outline' as any} size={22} color="#FFFFFF" />
                      </View>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Paperclip / close toggle button */}
              <TouchableOpacity
                style={[cs.toolBtn, attachMenuOpen && cs.toolBtnActive]}
                onPress={() => setAttachMenuOpen(v => !v)}
                disabled={uploading || sending}
                activeOpacity={0.7}
              >
                <AppIcon
                  name={attachMenuOpen ? ('close' as any) : ('paperclip' as any)}
                  size={20}
                  color={attachMenuOpen ? '#0F172A' : uploading ? '#CBD5E1' : '#64748B'}
                />
              </TouchableOpacity>
            </View>
          ) : null}

          <TextInput
            style={cs.input}
            placeholder="Mesaj yaz..."
            placeholderTextColor="#94A3B8"
            value={text}
            onChangeText={setText}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />

          {/* Mic button — web only, show when no text */}
          {Platform.OS === 'web' && !text.trim() ? (
            <TouchableOpacity
              style={cs.toolBtn}
              onPress={startRecording}
              disabled={uploading || sending}
              activeOpacity={0.7}
            >
              <AppIcon name={'microphone-outline' as any} size={20} color="#64748B" />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[cs.sendBtn, (!text.trim() || sending || uploading) && cs.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending || uploading}
            activeOpacity={0.75}
          >
            <AppIcon
              name={uploading ? 'loading' : 'send'}
              size={18}
              color="#FFFFFF"
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const cs = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    minHeight: 520,
  },
  containerEmbedded: {
    borderRadius: 0,
    borderWidth: 0,
    minHeight: 0,
    flex: 1,
  },

  list: { flex: 1 },
  listContent: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  emptyText:  { fontSize: 13, color: '#94A3B8', textAlign: 'center', maxWidth: 240 },

  // Message rows
  msgRow:   { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 4 },
  msgRowMe: { flexDirection: 'row-reverse' },

  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText:   { fontSize: 12, fontWeight: '700', color: '#64748B' },
  avatarDoctor: { backgroundColor: '#6366F1' },

  bubble: {
    maxWidth: '72%',
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 9,
    gap: 4,
  },
  bubbleThem: { backgroundColor: '#F1F5F9', borderBottomLeftRadius: 4  },
  bubbleMe:   { backgroundColor: '#0F172A', borderBottomRightRadius: 4 },
  bubbleNote: { backgroundColor: '#EEF2FF', borderLeftWidth: 3, borderLeftColor: '#6366F1', maxWidth: '85%' },

  noteLabel:   { fontSize: 10, fontWeight: '700', color: '#6366F1', marginBottom: 2, letterSpacing: 0.2 },
  senderName:  { fontSize: 10, fontWeight: '600', color: '#64748B', marginBottom: 1 },
  msgText:     { fontSize: 14, color: '#0F172A', lineHeight: 20 },
  msgTextMe:   { color: '#FFFFFF' },
  msgTime:     { fontSize: 10, color: '#94A3B8', alignSelf: 'flex-end' },
  msgTimeMe:   { color: 'rgba(255,255,255,0.45)' },

  // Attachment — image
  attachImage: {
    width: 200, height: 150, borderRadius: 10, marginTop: 2,
  },

  // Attachment — file chip
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 2,
  },
  fileChipMe: { backgroundColor: 'rgba(255,255,255,0.15)' },
  fileChipName: { fontSize: 12, fontWeight: '600', color: '#0F172A', flex: 1 },
  fileChipSize: { fontSize: 10, color: '#64748B', marginTop: 1 },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  toolBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    height: 38,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 0,
    fontSize: 14,
    color: '#0F172A',
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#0F172A',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { backgroundColor: '#CBD5E1' },

  // Recording bar
  recordBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  recDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recTime: { fontSize: 14, fontWeight: '700', color: '#EF4444', minWidth: 40 },
  recLabel:{ fontSize: 12, color: '#64748B', flex: 1 },
  recCancelBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  recSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  recSendText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  // Attach menu — WhatsApp vertical style
  toolBtnActive: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  // Full-area invisible backdrop to close menu on outside click
  attachBackdrop: {
    position: 'absolute',
    // @ts-ignore
    top: -2000,
    left: -2000,
    right: -2000,
    bottom: -2000,
    zIndex: 98,
  },
  // Vertical list — floats above the button, aligned to left edge
  attachMenu: {
    position: 'absolute',
    bottom: 46,
    left: 0,
    flexDirection: 'column',
    gap: 6,
    // @ts-ignore
    zIndex: 99,
  },
  // Each row: [label pill] [icon circle]
  attachItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  // Label pill to the left of the circle
  attachItemLabel: {
    backgroundColor: '#1E293B',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    overflow: 'hidden',
    // @ts-ignore
    userSelect: 'none',
  },
  // Colored circle icon
  attachIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    // @ts-ignore
    boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
  },

  // File preview modal
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    overflow: 'hidden',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  previewTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  previewImage: {
    width: '100%',
    height: 240,
    backgroundColor: '#F8FAFC',
  },
  previewFileIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
    backgroundColor: '#F8FAFC',
  },
  previewFileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    textAlign: 'center',
    maxWidth: 280,
  },
  previewFileSize: { fontSize: 12, color: '#94A3B8' },
  previewCaptionRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  previewCaption: {
    fontSize: 14,
    color: '#0F172A',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    // @ts-ignore
    outlineStyle: 'none',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    justifyContent: 'flex-end',
  },
  previewCancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  previewCancelText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  previewSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#0F172A',
  },
  previewSendText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});

// ─────────────────────────────────────────────────────────────────────────────

function InfoPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.infoPill}>
      <Text style={styles.infoPillLabel}>{label}</Text>
      <Text style={[styles.infoPillValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

const toothDiagramStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  empty: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 16,
    fontStyle: 'italic',
  },
});

const detailRowStyles = StyleSheet.create({
  // Horizontal flex row — wraps to vertical on narrow screens
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    alignItems: 'flex-start',
  },
  // Each column takes equal space; minimum 220 so it wraps on phones
  col: {
    flex: 1,
    minWidth: 220,
  },
});

const sectionStyles = StyleSheet.create({
  heading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 4,
  },
  table: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    marginBottom: 16,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FFFFFF',
  },
  tableLabel: { width: 110, fontSize: 13, color: '#94A3B8', fontWeight: '500' },
  tableValue: { flex: 1, fontSize: 13, color: '#0F172A', fontWeight: '500' },
  filesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.1 },
  noFiles: { alignItems: 'center', paddingVertical: 40, gap: 8, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  noFilesText: { fontSize: 15, color: '#94A3B8' },
  noFilesSubText: { fontSize: 13, color: '#CBD5E1', textAlign: 'center', maxWidth: 260 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photo: { width: 120, height: 120, borderRadius: 12 },
  qrCard: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 14,
    gap: 16,
    marginBottom: 16,
  },
  qrLeft:  { flex: 1, gap: 3 },
  qrTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  qrSub:   { fontSize: 12, color: '#475569' },
  qrRoles: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  qrUrl:   { fontSize: 9, color: '#CBD5E1', marginTop: 4 },
  qrCodeWrap: {
    padding: 8, borderRadius: 10, backgroundColor: '#FFFFFF',
    borderWidth: 1, borderColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },

  // ── Header row (hero + tooth chart, same height) ──
  // Tüm row'ları saran outer container — tutarlı 12px padding + 12px gap her yerde
  pageGrid: {
    padding: 20,
    gap:     20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems:    'stretch',
    gap:           20,
    zIndex:        10,
  },

  // ── QR hero card (next to hero, same height) ──
  qrHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 0,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#EEF1F6',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
    // @ts-ignore
    boxShadow: '0 2px 10px rgba(15,23,42,0.07)',
    overflow: 'hidden',
  },
  qrHeroNum: {
    fontSize: 9,
    fontWeight: '600',
    color: '#94A3B8',
    letterSpacing: 0.3,
    textAlign: 'center',
    paddingBottom: 8,
  },

  // ── QR card inner elements ──
  qrTopRow: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  qrOrderNum: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.4,
    textAlign: 'center',
    flex: 1,
  },
  qrUrgentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
    flexShrink: 0,
  },
  qrDoctorRow: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FAFAFA',
  },
  qrDoctorName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  qrClinicName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },

  // ── Tooth chart — second row, full width ──
  toothSubRow: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 6,
    alignItems: 'center',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: '#EEF1F6',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
    // @ts-ignore
    boxShadow: '0 2px 10px rgba(15,23,42,0.07)',
    overflow: 'hidden',
  },

  // ── Row 2 wrapper: tooth chart + actions card ──
  subRow: {
    flexDirection: 'row',
    alignItems:    'stretch',
    gap:           12,           // kartlar arası — outer pageGrid kenar/üst boşluğunu sağlıyor
  },

  // ── Actions card (right of tooth chart in row 2) ──
  actionsCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#EEF1F6',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
    // @ts-ignore
    boxShadow: '0 2px 10px rgba(15,23,42,0.07)',
    justifyContent: 'center',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    // @ts-ignore
    outline: 'none',
    cursor: 'pointer',
  },
  actionItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },

  // ── Tooth chart card (legacy stub) ──
  toothChartCard: { backgroundColor: '#FFFFFF', borderRadius: 20 },
  // ══════════════════════════════════════════════════
  // ── Hero Card — stage-light radial glow, panel temasıyla override edilir ──
  heroCard: {
    borderRadius:  26,
    overflow:      'hidden',                              // kritik: içeriği kart sınırına kırp
    // backgroundColor: inline Platform.select ile kontrol ediliyor
    padding:       18,
    paddingBottom: 16,
    // Cam kenarı (border)
    borderWidth:   1.5,
    borderColor:   'rgba(255,255,255,0.18)',
    // Native gölge (derin cam gölgesi)
    shadowOffset:  { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius:  40,
    elevation:     16,
    // NOT: backdrop-filter overflow:hidden ile çakışıp child'ları
    // kart dışına sızdırıyordu → kaldırıldı. Cam efekti inset gölgeler
    // ve gradient overlay ile korunuyor.
    // @ts-ignore
    boxShadow:
      // Dış derinlik gölgeleri
      '0 16px 48px rgba(0,0,0,0.55),' +
      ' 0 4px 16px rgba(0,0,0,0.30),' +
      // Üst kenar parlak gloss çizgisi (cam yansıması)
      ' inset 0 1.5px 0 rgba(255,255,255,0.35),' +
      // Sol-üst köşe parlaklığı (specular)
      ' inset 1.5px 0 0 rgba(255,255,255,0.18),' +
      // Alt iç gölge
      ' inset 0 -2px 0 rgba(255,255,255,0.08),' +
      // İç çevresel mavi cam tini
      ' inset 0 0 60px rgba(59,130,246,0.12)',
  },

  // Top row
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  heroBackBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    // @ts-ignore
    outline: 'none',
  },
  heroTopMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  heroOrderNum: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: -0.2,
  },
  heroUrgentTag: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  heroUrgentText: { fontSize: 10, fontWeight: '700', color: '#FCA5A5', letterSpacing: 0.3 },
  heroDoctor: { fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },
  heroAdvanceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    // @ts-ignore
    outline: 'none',
  },
  heroAdvanceBtnText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  heroDoneTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(5,150,105,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(5,150,105,0.4)',
  },
  heroDoneText: { fontSize: 12, fontWeight: '600', color: '#34D399' },

  // Big metrics
  heroMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  heroMetricLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '500',
    marginBottom: 4,
  },
  heroMetricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },

  // ── Main two-column row (info+disc left + büyük aksiyon sağ) ──
  heroMainRow: {
    flexDirection: 'row',
    alignItems:    'stretch',
    gap:           12,
    marginBottom:  14,
    overflow:      'hidden',     // child taşmasını da kart içinde kırp
  },

  // ── Prod block header row (iş tipi + sağda büyük disc) ──
  heroProdHeaderRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    marginBottom:   12,
    overflow:       'visible',   // dış halka ring'in kırpılmaması için
  },

  // ── Sağ taraftaki büyük aksiyon butonu (mavi gradient — neon kaldırıldı) ──
  // Genişlik artık inline'da useWindowDimensions ile responsive set ediliyor
  heroBigActionBtn: {
    borderRadius:      18,
    paddingVertical:   16,
    paddingHorizontal: 10,
    alignItems:        'center',
    justifyContent:    'center',
    gap:               8,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.20)',
    // Solid mavi (native fallback)
    backgroundColor: '#3B82F6',
    // Yumuşak gölge (neon değil, normal drop shadow)
    shadowColor:   '#1E3A8A',
    shadowOpacity: 0.35,
    shadowRadius:  14,
    shadowOffset:  { width: 0, height: 6 },
    elevation:     8,
    // Web: diyagonal mavi gradient
    // @ts-ignore
    backgroundImage:
      'linear-gradient(135deg,' +
      ' #60A5FA 0%,' +    // blue-400 — açık üst sol
      ' #3B82F6 45%,' +   // blue-500 — orta
      ' #2563EB 100%)',   // blue-600 — koyu sağ alt
    // @ts-ignore
    boxShadow:
      // Tek katman yumuşak gölge
      '0 6px 16px rgba(30,58,138,0.35),' +
      // İnce üst gloss çizgisi (gradient'ı vurgular)
      ' inset 0 1px 0 rgba(255,255,255,0.30)',
  },
  heroBigActionIconCircle: {
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: 'rgba(255,255,255,0.18)',  // şeffaf beyaz, gradient üstüne otursun
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.32)',
    alignItems:      'center',
    justifyContent:  'center',
    overflow:        'visible',                  // halo dışa taşabilsin
  },
  heroBigActionText: {
    fontSize:      18,
    fontWeight:    '800',
    color:         '#FFFFFF',
    letterSpacing: 0.3,
    marginTop:     2,
    // @ts-ignore — hafif okunaklılık gölgesi
    textShadow:    '0 1px 2px rgba(30,58,138,0.45)',
  },
  heroBigActionSub: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(191,219,254,0.85)',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  // ── Production focus block ──
  heroProdBlock: {
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  heroProdTypeLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.32)',
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 5,
  },
  heroProdType: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.6,
    lineHeight: 38,
  },
  heroProdSubType: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.2,
    marginTop: 3,
    marginBottom: 8,
  },
  heroProdMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  heroProdChip: {
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  // Tıklanabilir diş numarası rozeti (hero card)
  heroProdToothBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  heroProdChipLabel: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  heroProdChipValue: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  heroProdSep: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 8,
  },

  // ── Hero status pills (bottom) ──
  heroStatusNow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroStatusNowText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroStatusNext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  heroStatusNextText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.38)',
    fontWeight: '500',
  },

  // Disc is rendered by HeroDisc (SVG component) — no stylesheet entries needed

  // ── Steps row ──
  heroStepsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  heroStepItem: {
    alignItems: 'center',
    gap: 4,
    minWidth: 38,
  },
  heroStepConnector: {
    flex: 1,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'flex-start',
    marginTop: 10,   // vertically center with 20px dot
  },
  heroStepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    // pulse ring'lerin dot dışına taşması için clip yok
    overflow: 'visible',
  },
  // heroStepDotDone / heroStepDotCurrent — inline heroTheme.accent ile override edilir
  heroStepDotInner: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    // backgroundColor inline heroTheme.accent ile set edilir
  },
  heroStepLabel: {
    fontSize:      11.5,                       // 8.5 → 11.5
    fontWeight:    '600',                      // 500 → 600
    color:         'rgba(255,255,255,0.45)',   // 0.22 → 0.45 (pasif step de okunsun)
    textAlign:     'center',
    letterSpacing: 0.2,
    marginTop:     2,
  },
  heroStepLabelDone: {
    color:      'rgba(255,255,255,0.78)',      // 0.5 → 0.78
    fontWeight: '700',
  },
  heroStepLabelCurrent: {
    color:         '#FFFFFF',
    fontWeight:    '800',
    letterSpacing: 0.3,
  },

  // ── Aktif Aşama Strip (Şu An / Sorumlu / Aksiyon) ──
  heroActiveStripWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  heroActiveStripCol: {
    flex: 1,
    minWidth: 0,
  },
  heroActiveStripLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  heroActiveStripValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  heroActiveStripDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroActiveStripBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  heroActiveStripBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },

  // ── Üretim istasyonları satırı (heroStepsRow'un altında, sadece üretim'de) ──
  heroProdStationsWrap: {
    marginTop:    10,
    paddingTop:   10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  heroProdStationsTitle: {
    fontSize:      9,
    fontWeight:    '700',
    color:         'rgba(255,255,255,0.45)',
    letterSpacing: 1,
    textAlign:     'center',
    marginBottom:  8,
  },
  heroProdStationsRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
  },
  heroProdStationItem: {
    alignItems: 'center',
    gap:        4,
    minWidth:   34,
  },
  heroProdStationConnector: {
    flex:           1,
    height:         1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignSelf:      'flex-start',
    marginTop:      8,    // 16px dot ortası
  },
  heroProdStationDot: {
    width:           16,
    height:          16,
    borderRadius:    8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth:     1.2,
    borderColor:     'rgba(255,255,255,0.18)',
    alignItems:      'center',
    justifyContent:  'center',
    overflow:        'visible',
  },
  heroProdStationLabel: {
    fontSize:    9.5,
    fontWeight:  '600',
    color:       'rgba(255,255,255,0.45)',
    textAlign:   'center',
    marginTop:   1,
    maxWidth:    72,
  },
  heroProdStationLabelDone: {
    color:      'rgba(255,255,255,0.78)',
    fontWeight: '700',
  },

  // Timeline row (başlangıç · disc · kalan)
  heroTimeline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroTimelineLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.38)',
    fontWeight: '500',
    marginBottom: 3,
  },
  heroTimelineValue: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
  },

  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
  },

  // Bottom status pills
  heroBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroStops: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  heroStopAccent: { width: 3, borderRadius: 2, backgroundColor: '#6366F1' },
  heroStopLabel: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontWeight: '600', width: 34 },
  heroStopValue: { fontSize: 13, color: 'rgba(255,255,255,0.88)', fontWeight: '600' },
  heroActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    // @ts-ignore
    outline: 'none',
  },
  heroThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  // ── Legacy stubs (used by InfoPill or kept for safety) ──
  topBar: { flexDirection: 'row' },
  topBarOverdue: {},
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backText: { fontSize: 15, color: '#0F172A' },
  topMeta: { flex: 1, flexDirection: 'row' },
  stagePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, gap: 5 },
  stageDot: { width: 6, height: 6, borderRadius: 3 },
  stageLabel: { fontSize: 11, fontWeight: '700' },
  topOrderNum: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  topDoctor: { fontSize: 12, color: '#64748B' },
  urgentTag: { backgroundColor: '#FEF2F2', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  urgentTagText: { fontSize: 10, fontWeight: '700', color: '#EF4444' },
  overdueTag: { backgroundColor: '#FEF2F2', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  overdueTagText: { fontSize: 10, fontWeight: '700', color: '#EF4444' },
  btnAdvance: { backgroundColor: '#0F172A', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  btnAdvanceText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  overdueBanner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, borderRadius: 14 },
  overdueBannerDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#DC2626' },
  overdueBannerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#FCA5A5' },
  metaRow: { flexDirection: 'row' },
  metaCard: { flex: 1 },
  metaCardLabel: { fontSize: 9, color: '#94A3B8' },
  metaCardValue: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  actionRow: { flexDirection: 'row' },
  infoBar: { flexDirection: 'row' },
  infoMetaGrid: { flex: 1 },
  infoBarDivider: { width: 1 },
  infoActions: { flexDirection: 'row' },
  infoPill: { paddingHorizontal: 8, paddingVertical: 5 },
  infoPillLabel: { fontSize: 10, color: '#94A3B8' },
  infoPillValue: { fontSize: 13, color: '#0F172A' },
  infoBarSpacer: { flex: 1 },

  // Legacy button styles (kept for any remaining references)
  btnQR: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  btnQRText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  btnPrint: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    backgroundColor: '#F0FDF4',
  },
  btnPrintText: { fontSize: 12, fontWeight: '600', color: '#065F46' },
  btnReceipt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  btnReceiptText: { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  btnInvoice: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 16, paddingVertical: 13, borderRadius: 12,
    backgroundColor: '#2563EB',
    // @ts-ignore
    outline: 'none',
    cursor: 'pointer',
  },
  btnInvoiceText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  btnRoute: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#16A34A',
  },
  btnRouteText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  btnDelivery: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#7C3AED',
  },
  btnDeliveryText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  btnOcclusion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#EFF6FF',
  },
  btnOcclusionText: { fontSize: 12, fontWeight: '600', color: '#1E40AF' },

  // ── More actions ──
  btnMore: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    // @ts-ignore
    outline: 'none',
    cursor: 'pointer',
  },
  moreBackdrop: {
    position: 'fixed' as any,
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 50,
  },
  moreDropdown: {
    position: 'absolute',
    right: 0,
    top: 52,
    zIndex: 51,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingVertical: 6,
    minWidth: 170,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    // @ts-ignore
    boxShadow: '0 4px 24px rgba(15,23,42,0.12)',
  },
  moreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    // @ts-ignore
    outline: 'none',
    cursor: 'pointer',
  },
  moreItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0F172A',
  },

  // ── Body ──
  body: { flex: 1, flexDirection: 'column', backgroundColor: 'transparent', gap: 12 },
  bodyDesktop: { flexDirection: 'row', gap: 12 },

  // ── Section navigation — mobile pill tabs ──
  sectionTabsScroll: {
    backgroundColor: '#F9F9FB',
    flexGrow: 0,
  },
  sectionTabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  sectionTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECEEF2',
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  sectionTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  sectionTabActive: {
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(15,23,42,0.12)',
  },
  sectionTabLabel: { fontSize: 12, fontWeight: '500', color: '#64748B' },
  sectionTabLabelActive: { fontSize: 12, fontWeight: '700', color: '#0F172A' },

  // ── Section navigation — desktop sidebar card ──
  sectionSidebarDesktop: {
    width:           138,
    backgroundColor: '#FFFFFF',
    borderRadius:    18,
    margin:          0,         // gap outer body row'da yönetilir
    paddingTop:      10,
    paddingHorizontal: 8,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
    // @ts-ignore
    boxShadow: '0 2px 10px rgba(15,23,42,0.07)',
  },
  sectionItemDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 8,
    marginBottom: 2,
  },
  sectionItemDesktopActive: {
    backgroundColor: '#F1F5F9',
  },
  sectionLabel: { flex: 1, fontSize: 13, color: '#64748B', fontWeight: '500' },
  sectionLabelActive: { color: '#0F172A', fontWeight: '700' },

  // ── Content area ──
  contentArea: { flex: 1, backgroundColor: '#F9F9FB', margin: 0, borderRadius: 18, overflow: 'hidden' },
  contentPad: { padding: 16, paddingBottom: 40 },

  // ── Desktop chat panel ──
  chatPanel: {
    width: 280,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderLeftColor: '#F1F5F9',
    flexDirection: 'column',
  },
  chatPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  chatPanelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.1,
  },
});

// ── Chat popup close button (absolute top-right) ────────────────────────────
const chatCloseBtn = {
  position:        'absolute' as const,
  top:             10,
  right:           10,
  width:           32,
  height:          32,
  borderRadius:    16,
  alignItems:      'center' as const,
  justifyContent:  'center' as const,
  backgroundColor: 'rgba(241,245,249,0.9)',
  borderWidth:     1,
  borderColor:     '#E5E9F0',
  zIndex:          10,
};

// ── Files Popup styles ──────────────────────────────────────────────────────
const filesPopup = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 880,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E9F0',
    ...Platform.select({
      web: {
        // @ts-ignore
        boxShadow: '0 20px 60px rgba(15,23,42,0.25)',
      },
      default: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.25,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
});
