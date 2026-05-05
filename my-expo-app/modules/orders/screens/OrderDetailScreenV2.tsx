/**
 * OrderDetailScreenV2 — Patterns dili (NativeWind), gerçek WorkOrder verisi
 *
 *   Mockup (OrderDetailMockup.tsx) tabanlı, useOrderDetail ile canlı veri.
 *   Multi-turn implementation:
 *     Tur 1 (bu): header + hero + aktif istasyon + çalışmalar tablosu +
 *                 sağ kolon (doktor/klinik + diş şeması)
 *     Tur 2: Tabs (Aktivite/Dosya/Yorum) — ChatSection/FilesSection
 *     Tur 3: Mali bilgi + print/QR + ilgili siparişler
 *     Tur 4: Action handlers + permissions + edge cases
 */
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Modal, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../core/store/authStore';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { supabase } from '../../../core/api/supabase';
import { useOrderDetail } from '../hooks/useOrderDetail';
import { useOrderStages } from '../hooks/useOrderStages';
import { LivingToothChart } from '../components/LivingToothChart';
import { LinearProgressX, PercentRingX, StepsTimelineX } from '../../../core/ui/ProgressX';
import { Bell, Printer, Check, ArrowUpRight, ChevronRight, Phone, MapPin, Download, MessageSquare, FileText, Image as ImageIcon, File as FileIcon, QrCode, RotateCcw, UserCheck, Upload, AlertTriangle, CircleCheck, Circle, Clock, ChevronDown, ChevronUp } from 'lucide-react-native';
import { STATUS_CONFIG, getNextStatus, isOrderOverdue } from '../constants';
import { advanceOrderStatus } from '../api';
import { ChatDetail } from '../components/MessagesPopup';
import { useChatMessages } from '../hooks/useChatMessages';
import { toast } from '../../../core/ui/Toast';
import { X as CloseIcon } from 'lucide-react-native';
import { QCRejectModal } from '../components/QCRejectModal';
import { ReassignModal } from '../components/ReassignModal';
import { STAGE_ORDER, STAGE_LABEL, STAGE_COLOR, legacyStatusToStage } from '../stages';
import type { Stage } from '../stages';
import type { WorkOrderStatus } from '../../../lib/types';
import type { WorkOrder } from '../types';
import type { StatusHistory, WorkOrderPhoto } from '../../../lib/types';

// ── Profit RPC return shape ─────────────────────────────────────────
interface ProfitData {
  sale_price:      number;
  discount_amount: number;
  net_revenue:     number;
  material_cost:   number;
  labor_cost:      number;
  overhead_cost:   number;
  total_cost:      number;
  profit:          number;
  margin_pct:      number | null;
}
const fmtTL = (n: number) =>
  n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const, fontWeight: '300' as const };

// ── VITA shade color (referans) ─────────────────────────────────────
const VITA_SHADE_HEX: Record<string, string> = {
  A1:    '#F0E2C0', A2:   '#E6CFA1', A3:   '#D9B27C', 'A3.5': '#C99A5E', A4: '#B07F4A',
  B1:    '#EFDFB6', B2:   '#E5CB94', B3:   '#D4AE6F', B4:    '#BC8F4F',
  C1:    '#D9CFB7', C2:   '#C7B89A', C3:   '#A8987B', C4:    '#897962',
  D2:    '#D7C2A6', D3:   '#C2A98B', D4:   '#A88E72',
};
const readableInk = (hex: string) => {
  const m = hex.replace('#', '');
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#3A2E1F' : '#FFFFFF';
};

// Status → patterns timeline index (0..4)
const STATUS_ORDER = ['alindi', 'uretimde', 'kalite_kontrol', 'teslimata_hazir', 'teslim_edildi'] as const;
const STATUS_LABELS = ['Alındı', 'Üretim', 'Final QC', 'Hazır', 'Teslim'];

// Panel → patterns DS theme (renk paleti)
// Aktif panel route segments primary signal — role değil, hangi panelin
// içinde gezildiği önemli (admin lab paneline girince saffron görmeli).
function panelToTheme(userType?: string | null, panelGroup?: string): 'lab' | 'clinic' | 'exec' {
  // Önce route segment kontrol et (hangi panelde gezildiğini gösterir)
  if (panelGroup === '(lab)')                                 return 'lab';
  if (panelGroup === '(clinic)' || panelGroup === '(doctor)') return 'clinic';
  if (panelGroup === '(admin)')                               return 'exec';
  // Segment yoksa user_type'a düş
  if (userType === 'lab')                                     return 'lab';
  if (userType === 'clinic_admin' || userType === 'doctor')   return 'clinic';
  if (userType === 'admin')                                   return 'exec';
  return 'lab';
}
function themeAccent(theme: 'lab' | 'clinic' | 'exec'): string {
  return theme === 'clinic' ? '#6BA888' : theme === 'exec' ? '#E97757' : '#F5C24B';
}
function themeHero(theme: 'lab' | 'clinic' | 'exec'): { bg: string; gradEnd: string; kicker: string } {
  if (theme === 'clinic') return { bg: '#EDF2EE', gradEnd: '#6BA888', kicker: '#1F4A35' };
  if (theme === 'exec')   return { bg: '#FAF5F1', gradEnd: '#E97757', kicker: '#7A2F18' };
  return { bg: '#FFF6D9', gradEnd: '#F5C24B', kicker: '#6B5A1F' };
}

function fmtDate(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s + 'T00:00:00');
  return `${d.getDate().toString().padStart(2,'0')}.${(d.getMonth()+1).toString().padStart(2,'0')}.${d.getFullYear()}`;
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function OrderDetailScreenV2() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuthStore();
  const { order, signedUrls, loading, error, refetch } = useOrderDetail(id);
  const { stages: orderStages, activeStage, completedCount, totalStages, refetch: refetchStages } = useOrderStages(id ?? undefined);
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [chartW, setChartW] = useState(280);
  const [activeTooth, setActiveTooth] = useState<number | null>(null);
  const [jawView, setJawView] = useState<'both' | 'upper' | 'lower'>('both');
  const [printOpen, setPrintOpen] = useState(false);
  const [sideTab, setSideTab] = useState<'activity' | 'files'>('activity');
  const [chatOpen, setChatOpen] = useState(false);
  const [profit, setProfit] = useState<ProfitData | null>(null);
  const [related, setRelated] = useState<Array<{ id: string; order_number: string; work_type: string | null; status: string; delivery_date: string | null; }>>([]);
  const [materials, setMaterials] = useState<Array<{ name: string; quantity: number; unit: string | null; line_cost: number }>>([]);
  const [advancing, setAdvancing] = useState(false);
  const { messages: chatMessages } = useChatMessages(id, profile?.id);
  const [togglingUrgent, setTogglingUrgent] = useState(false);
  const [qcRejectOpen, setQcRejectOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [stagesExpanded, setStagesExpanded] = useState(false);

  const isManager = profile?.role === 'manager' || profile?.user_type === 'admin';

  // ── Mali bilgi (profit RPC) ─────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('calculate_order_profit', { p_work_order_id: id });
      if (!cancelled) setProfit((data?.[0] ?? null) as ProfitData | null);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // ── Materyal hareketleri (calculate_order_cost RPC) ──────────────
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('calculate_order_cost', { p_work_order_id: id });
      if (!cancelled) setMaterials((data ?? []) as any);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // ── İlgili siparişler (aynı hasta) ──────────────────────────────
  useEffect(() => {
    if (!id || !order?.patient_name) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('work_orders')
        .select('id, order_number, work_type, status, delivery_date')
        .eq('patient_name', order.patient_name)
        .neq('id', id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (!cancelled) setRelated((data ?? []) as any);
    })();
    return () => { cancelled = true; };
  }, [id, order?.patient_name]);

  const segments = useSegments() as string[];
  const panelGroup = segments?.[0] ?? '';
  const panelTheme = panelToTheme(profile?.user_type, panelGroup);
  const panelAccent = themeAccent(panelTheme);
  const heroPalette = themeHero(panelTheme);

  // Page title — PatternsShell toolbar satırında gösterilir
  const { setTitle: setPageTitle, clear: clearPageTitle } = usePageTitleStore();
  const _clinic = order?.doctor?.clinic_name ?? order?.doctor?.clinic?.name ?? '';
  useEffect(() => {
    if (order) {
      setPageTitle(
        order.order_number,
        `Siparişler › ${_clinic || '—'}`
      );
    }
    return () => clearPageTitle();
  }, [order?.order_number, _clinic, panelGroup]);

  // Derived ────────────────────────────────────────────────────────
  const statusIdx = order ? STATUS_ORDER.indexOf(order.status as any) : 0;
  const overdue = order ? isOrderOverdue(order.delivery_date, order.status) : false;
  const today = new Date();
  const deliveryDate = order?.delivery_date ? new Date(order.delivery_date + 'T00:00:00') : null;
  const daysLeft = deliveryDate ? daysBetween(today, deliveryDate) : null;
  const progressPct = useMemo(() => {
    if (!order) return 0;
    if (order.status === 'teslim_edildi') return 100;
    return Math.round(((statusIdx + 1) / STATUS_ORDER.length) * 100);
  }, [order, statusIdx]);

  const allTeeth = order?.tooth_numbers ?? [];
  const upperTeeth = useMemo(() => allTeeth.filter(t => t < 30), [allTeeth]);
  const lowerTeeth = useMemo(() => allTeeth.filter(t => t >= 30), [allTeeth]);
  const visibleTeethCount =
    jawView === 'upper' ? upperTeeth.length :
    jawView === 'lower' ? lowerTeeth.length :
                          allTeeth.length;

  // Tooth chart hep tüm dişleri alır — jawView gösterimi forceJawMode ile yapılır
  const toothChartOrder = useMemo(() => ({
    tooth_numbers: allTeeth,
    photos: [],
  } as unknown as WorkOrder), [allTeeth]);
  const forcedJaw = jawView === 'both' ? undefined : jawView;

  // ── Diş renk haritası — order_items'a göre dağıt ──────────────────
  // Birden fazla item varsa her birine farklı renk; tek item / yoksa panelAccent
  const TOOTH_PALETTE = ['#3B82F6', '#10B981', '#F59E0B', '#9C2E2E', '#7C3AED', '#0EA5E9'];
  const toothColorMap = useMemo(() => {
    const items = (order as any)?.order_items as Array<{ id: string; quantity: number }> | undefined;
    const map: Record<number, string> = {};
    if (!items || items.length <= 1 || allTeeth.length === 0) {
      // Tek procedure ya da yok → tüm dişler panel accent
      allTeeth.forEach(t => { map[t] = panelAccent; });
      return map;
    }
    // Her item'a renk ata, miktar oranında diş dağıt
    let cursor = 0;
    items.forEach((it, i) => {
      const color = i === 0 ? panelAccent : TOOTH_PALETTE[(i - 1) % TOOTH_PALETTE.length];
      const slice = Math.max(1, Math.round((it.quantity / Math.max(1, items.reduce((s, x) => s + x.quantity, 0))) * allTeeth.length));
      for (let j = 0; j < slice && cursor < allTeeth.length; j++) {
        map[allTeeth[cursor]] = color;
        cursor++;
      }
    });
    // Geriye kalanlar (yuvarlama farkı) → son rengi
    while (cursor < allTeeth.length) {
      map[allTeeth[cursor]] = panelAccent;
      cursor++;
    }
    return map;
  }, [order, allTeeth, panelAccent]);

  // Render ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-cream-page items-center justify-center">
        <Text className="text-[14px] text-ink-500">Yükleniyor…</Text>
      </SafeAreaView>
    );
  }
  if (error || !order) {
    return (
      <SafeAreaView className="flex-1 bg-cream-page items-center justify-center">
        <Text className="text-[14px] text-ink-500">Sipariş bulunamadı.</Text>
      </SafeAreaView>
    );
  }

  const doctorName  = order.doctor?.full_name ?? '—';
  const clinicName  = order.doctor?.clinic_name ?? order.doctor?.clinic?.name ?? '—';
  const doctorPhone = order.doctor?.phone ?? '';
  const currentStation = activeStage?.station?.name ?? STATUS_LABELS[statusIdx] ?? '—';

  // Print — basit window.print() (full QR HTML için Tur 4'te detaylandırılacak)
  const qrUrl = Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}/order/${order.id}`
    : `https://dental-lab-steel.vercel.app/order/${order.id}`;
  const handleNavigateRelated = (relatedId: string) => {
    if (panelGroup && panelGroup.startsWith('(')) {
      router.push(`/${panelGroup}/order/${relatedId}` as any);
    } else {
      router.push(`/dev/order-detail-v2/${relatedId}` as any);
    }
  };

  // ── Permissions ─────────────────────────────────────────────────
  const isAssigned = !!profile && (order as any).assigned_to === profile.id;
  const canAdvance = isManager || isAssigned;
  const nextStatus = getNextStatus(order.status as WorkOrderStatus);
  const nextStatusLabel = nextStatus ? (STATUS_CONFIG[nextStatus]?.label ?? nextStatus) : null;

  // ── Aşamayı tamamla ──────────────────────────────────────────────
  const handleAdvanceStage = async () => {
    if (!profile || !nextStatus || advancing) return;
    setAdvancing(true);
    const { error } = await advanceOrderStatus(order.id, nextStatus, profile.id);
    setAdvancing(false);
    if (error) {
      toast.error('Durum güncellenemedi: ' + (error as any).message);
    } else {
      toast.success(`Sipariş "${STATUS_CONFIG[nextStatus]?.label ?? nextStatus}" durumuna geçti`);
      refetch();
    }
  };

  // ── Acil işaretle toggle ────────────────────────────────────────
  const handleToggleUrgent = async () => {
    if (!profile || togglingUrgent) return;
    setTogglingUrgent(true);
    const { error } = await supabase
      .from('work_orders')
      .update({ is_urgent: !order.is_urgent })
      .eq('id', order.id);
    setTogglingUrgent(false);
    if (error) toast.error('Güncellenemedi: ' + (error as any).message);
    else {
      toast.success(order.is_urgent ? 'Acil işareti kaldırıldı' : 'Acil olarak işaretlendi');
      refetch();
    }
  };

  // ── Print popup ─────────────────────────────────────────────────
  const handlePrintFull = () => setPrintOpen(true);
  const handleActualPrint = () => {
    if (typeof window === 'undefined') return;
    const iframe = document.getElementById('print-iframe') as HTMLIFrameElement;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    }
  };

  return (
    <ScrollView className="flex-1 bg-cream-page" contentContainerStyle={{ padding: isDesktop ? 10 : 16 }}>
      <View
        className={`w-full gap-4 ${isDesktop ? 'flex-row' : 'flex-col'}`}
      >
        {/* ═══════════ SOL KOLON ═══════════ */}
        <View className={`gap-4 ${isDesktop ? 'flex-1' : ''}`}>

          {/* HERO */}
          <View
            className="rounded-[28px] p-8 overflow-hidden relative"
            style={{
              backgroundColor: heroPalette.bg,
              // @ts-ignore web gradient
              backgroundImage: `linear-gradient(180deg, ${heroPalette.bg} 0%, ${heroPalette.gradEnd} 200%)`,
            }}
          >
            <View className="flex-row justify-between items-start mb-6 flex-wrap gap-4">
              <View className="flex-1" style={{ minWidth: 200 }}>
                <View className="flex-row items-center gap-2 mb-2">
                  <Text className="text-[11px] font-semibold uppercase" style={{ letterSpacing: 1.32, color: heroPalette.kicker }}>
                    Hasta · {allTeeth.length} diş çalışması
                  </Text>
                  {order.is_urgent && (
                    <View className="flex-row items-center gap-1.5 px-2.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(217,75,75,0.12)' }}>
                      <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#9C2E2E' }} />
                      <Text className="text-[11px] font-medium" style={{ color: '#9C2E2E' }}>Acil</Text>
                    </View>
                  )}
                </View>
                <Text className="text-ink-900" style={{ ...DISPLAY, fontSize: 54, letterSpacing: -2.16, lineHeight: 51 }}>
                  {order.patient_name ?? '—'}
                </Text>
                <Text className="text-[13px] text-ink-700 mt-2">{doctorName} · {clinicName}</Text>
                <Text className="text-[12px] text-ink-500 mt-1">Giriş: {fmtDate(order.created_at)}</Text>
              </View>
              <View className="items-end gap-3">
                {/* Actions */}
                <View className="flex-row items-center gap-2">
                  <Pressable onPress={handlePrintFull} className="w-8 h-8 rounded-full items-center justify-center bg-black/[0.06]">
                    <Printer size={14} color="#0A0A0A" strokeWidth={1.8} />
                  </Pressable>
                  {canAdvance && nextStatus && (
                    <Pressable onPress={handleAdvanceStage} disabled={advancing}>
                      <PillBtn variant="primary" size="sm" icon={Check}>
                        {advancing ? 'Güncelleniyor…' : `${nextStatusLabel}'a geç`}
                      </PillBtn>
                    </Pressable>
                  )}
                  {!nextStatus && (
                    <View className="flex-row items-center gap-1.5 px-3 py-1 rounded-full" style={{ backgroundColor: 'rgba(16,185,129,0.12)' }}>
                      <Check size={12} color="#0F6E50" strokeWidth={2.4} />
                      <Text className="text-[12px] font-medium" style={{ color: '#0F6E50' }}>Teslim edildi</Text>
                    </View>
                  )}
                </View>
                {/* Days counter */}
                {daysLeft != null && (
                  <View className="items-end">
                    <Text className="text-[11px] font-semibold uppercase" style={{ letterSpacing: 1.32, color: heroPalette.kicker }}>
                      {overdue ? 'Gecikti' : 'Kalan'}
                    </Text>
                    <View className="flex-row items-baseline mt-1.5" style={{ gap: 8 }}>
                      <Text className="text-ink-900" style={{ ...DISPLAY, fontSize: 56, letterSpacing: -2.24, lineHeight: 52 }}>
                        {Math.abs(daysLeft)}
                      </Text>
                      <Text
                        className="text-ink-500 uppercase"
                        style={{
                          fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
                          fontWeight: '500',
                          fontSize: 11,
                          letterSpacing: 2.2,
                        }}
                      >
                        gün
                      </Text>
                    </View>
                    <Text className="text-[12px] text-ink-700 mt-1">Teslim {fmtDate(order.delivery_date)}</Text>
                  </View>
                )}
              </View>
            </View>

            <StepsTimelineX
              steps={STATUS_LABELS}
              current={statusIdx >= 0 ? statusIdx : 0}
              theme={panelTheme}
              variant="light"
            />
          </View>

          {/* AKTİF İSTASYON */}
          <View className="bg-ink-900 rounded-3xl p-6 flex-row items-center gap-5 flex-wrap">
            <PercentRingX value={progressPct} size={88} theme={panelTheme} />
            <View className="flex-1" style={{ minWidth: 160 }}>
              <Text className="text-[11px] font-semibold uppercase" style={{ letterSpacing: 1.1, color: panelAccent }}>
                Şu an
              </Text>
              <Text className="text-white mt-0.5" style={{ ...DISPLAY, fontSize: 24, letterSpacing: -0.4 }}>
                {currentStation} istasyonu
              </Text>
              {overdue && (
                <View className="flex-row items-center gap-1.5 mt-1.5">
                  <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#FFD86B' }} />
                  <Text className="text-[12px] font-medium" style={{ color: '#FFD86B' }}>
                    {Math.abs(daysLeft ?? 0)} gün gecikti
                  </Text>
                </View>
              )}
            </View>
            {profile?.full_name && (
              <View className="flex-row items-center gap-2.5 pl-2 pr-3.5 py-2 rounded-full bg-white/10">
                <Avatar name={profile.full_name} size={32} bg={panelAccent} fg="#0A0A0A" />
                <View>
                  <Text className="text-[13px] font-medium text-white">{profile.full_name.split(' ')[0]}</Text>
                  <Text className="text-[10px] text-white/55">Sorumlu</Text>
                </View>
              </View>
            )}
          </View>

          {/* ÜRETİM AŞAMALARI — case_steps timeline */}
          {orderStages.length > 0 && (
            <View className="bg-white rounded-3xl overflow-hidden">
              <Pressable
                onPress={() => setStagesExpanded(v => !v)}
                className="px-6 py-5 flex-row items-center"
              >
                <Text className="text-[11px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 1.1 }}>
                  Üretim Aşamaları
                </Text>
                <View className="flex-1" />
                <View className="flex-row items-center gap-2">
                  <View className="px-2 py-0.5 rounded-full bg-ink-50">
                    <Text className="text-[11px] font-medium text-ink-700">
                      {completedCount}/{totalStages}
                    </Text>
                  </View>
                  {stagesExpanded
                    ? <ChevronUp size={14} color="#9A9A9A" strokeWidth={1.8} />
                    : <ChevronDown size={14} color="#9A9A9A" strokeWidth={1.8} />
                  }
                </View>
              </Pressable>

              {stagesExpanded && (
                <View className="px-6 pb-5">
                  {orderStages.map((stg, i) => {
                    const isCompleted = stg.status === 'onaylandi' || stg.status === 'tamamlandi';
                    const isActive = stg.status === 'aktif';
                    const isPending = stg.status === 'bekliyor';
                    const isRejected = stg.status === 'reddedildi';
                    const stationName = stg.station?.name ?? `Aşama ${i + 1}`;
                    const stationColor = stg.station?.color ?? '#94A3B8';
                    const techName = stg.technician?.full_name;
                    const isLast = i === orderStages.length - 1;

                    return (
                      <View key={stg.id} className="flex-row">
                        {/* Timeline rail */}
                        <View className="items-center" style={{ width: 32 }}>
                          <View
                            className="w-6 h-6 rounded-full items-center justify-center"
                            style={{
                              backgroundColor: isCompleted ? stationColor
                                : isActive ? stationColor + '20'
                                : isRejected ? '#DC262620'
                                : '#F1F5F9',
                              borderWidth: isActive ? 2 : 0,
                              borderColor: isActive ? stationColor : 'transparent',
                            }}
                          >
                            {isCompleted && <CircleCheck size={14} color="#FFF" strokeWidth={2.2} />}
                            {isActive && <Circle size={10} color={stationColor} strokeWidth={0} fill={stationColor} />}
                            {isRejected && <AlertTriangle size={12} color="#DC2626" strokeWidth={2} />}
                            {isPending && <Circle size={8} color="#CBD5E1" strokeWidth={0} fill="#CBD5E1" />}
                          </View>
                          {!isLast && (
                            <View
                              style={{
                                width: 2,
                                flex: 1,
                                backgroundColor: isCompleted ? stationColor + '40' : '#E2E8F0',
                                borderRadius: 1,
                              }}
                            />
                          )}
                        </View>

                        {/* Content */}
                        <View className={`flex-1 ml-2.5 ${isLast ? '' : 'pb-4'}`}>
                          <View className="flex-row items-center gap-2">
                            <Text className={`text-[13px] font-medium ${isActive ? 'text-ink-900' : isCompleted ? 'text-ink-700' : 'text-ink-400'}`}>
                              {stationName}
                            </Text>
                            {isActive && (
                              <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: stationColor + '20' }}>
                                <Text className="text-[9px] font-semibold uppercase" style={{ color: stationColor, letterSpacing: 0.5 }}>Aktif</Text>
                              </View>
                            )}
                            {isRejected && (
                              <View className="px-1.5 py-0.5 rounded bg-red-50">
                                <Text className="text-[9px] font-semibold uppercase text-red-600" style={{ letterSpacing: 0.5 }}>Red</Text>
                              </View>
                            )}
                            {stg.is_critical && (
                              <View className="px-1.5 py-0.5 rounded bg-amber-50">
                                <Text className="text-[9px] font-semibold uppercase text-amber-600" style={{ letterSpacing: 0.5 }}>Kritik</Text>
                              </View>
                            )}
                          </View>

                          {techName && (
                            <Text className="text-[11px] text-ink-500 mt-0.5">{techName}</Text>
                          )}

                          {(stg.started_at || stg.completed_at) && (
                            <View className="flex-row gap-3 mt-1">
                              {stg.started_at && (
                                <Text className="text-[10px] text-ink-400">
                                  Başladı: {fmtDate(stg.started_at)}
                                </Text>
                              )}
                              {stg.completed_at && (
                                <Text className="text-[10px] text-ink-400">
                                  Bitti: {fmtDate(stg.completed_at)}
                                </Text>
                              )}
                            </View>
                          )}

                          {stg.technician_note && (
                            <Text className="text-[11px] text-ink-500 mt-1 italic">
                              "{stg.technician_note}"
                            </Text>
                          )}

                          {/* Active stage quick actions */}
                          {isActive && isManager && (
                            <View className="flex-row gap-2 mt-2">
                              <Pressable
                                onPress={() => setReassignOpen(true)}
                                className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full bg-ink-50"
                              >
                                <UserCheck size={11} color="#0A0A0A" strokeWidth={1.8} />
                                <Text className="text-[10px] font-medium text-ink-700">Devret</Text>
                              </Pressable>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* ÇALIŞMALAR TABLOSU — basit (gerçek work item modeli yok, tooth listesi tek satır) */}
          <View className="bg-white rounded-3xl overflow-hidden">
            <View className="px-6 py-5 flex-row items-center flex-wrap gap-3">
              <Text className="text-[11px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 1.1 }}>Çalışma</Text>
              <View className="px-2 py-0.5 rounded-full bg-ink-50">
                <Text className="text-[11px] font-medium">{allTeeth.length} diş</Text>
              </View>
              <View className="flex-1" />
              {order.shade && (() => {
                const bg = VITA_SHADE_HEX[order.shade] ?? '#EAEAEA';
                const fg = readableInk(bg);
                return (
                  <View
                    className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full border border-black/[0.08]"
                    style={{ backgroundColor: bg }}
                  >
                    <View className="w-2 h-2 rounded-full opacity-70" style={{ backgroundColor: fg }} />
                    <Text className="text-[11px] font-semibold" style={{ color: fg, letterSpacing: 0.2 }}>{order.shade} renk</Text>
                  </View>
                );
              })()}
            </View>

            <View className="flex-row px-4 py-2.5 bg-cream-panel">
              {['DİŞ', 'ÇALIŞMA', 'ADET', 'İLERLEME', ''].map((h, i) => (
                <Text
                  key={i}
                  className="text-[10px] font-semibold uppercase text-ink-500"
                  style={{
                    flex: i === 1 ? 2 : i === 3 ? 1.4 : i === 4 ? 0.4 : 1,
                    letterSpacing: 0.8,
                  }}
                >
                  {h}
                </Text>
              ))}
            </View>

            <View className="flex-row px-4 py-3.5 items-center border-t border-black/[0.04]">
              <View className="flex-1 flex-row gap-1 flex-wrap">
                {allTeeth.length === 0 ? (
                  <Text className="text-[11px] text-ink-400">—</Text>
                ) : (
                  allTeeth.slice(0, 8).map(t => {
                    const fg = readableInk(panelAccent);
                    return (
                      <View
                        key={t}
                        className="px-2 py-0.5 rounded-md"
                        style={{ backgroundColor: panelAccent }}
                      >
                        <Text className="text-[11px] font-mono font-semibold" style={{ color: fg }}>{t}</Text>
                      </View>
                    );
                  })
                )}
                {allTeeth.length > 8 && (
                  <View className="px-2 py-0.5 rounded-md bg-black/5">
                    <Text className="text-[11px] font-medium text-ink-700">+{allTeeth.length - 8}</Text>
                  </View>
                )}
              </View>
              <Text className="text-[13px] font-medium text-ink-900" style={{ flex: 2 }}>{order.work_type || '—'}</Text>
              <Text className="text-[13px] text-ink-500" style={{ flex: 1 }}>{allTeeth.length} diş</Text>
              <View className="flex-row items-center gap-2.5" style={{ flex: 1.4 }}>
                <View className="flex-1">
                  <LinearProgressX value={progressPct} theme={panelTheme} compact hideLabel animate />
                </View>
                <Text className="text-[11px] text-ink-500 text-right" style={{ width: 32 }}>{progressPct}%</Text>
              </View>
              <View className="items-end" style={{ flex: 0.4 }}>
                <ArrowUpRight size={16} color="#9A9A9A" strokeWidth={1.6} />
              </View>
            </View>
          </View>

          {/* MATERYAL HAREKETLERİ */}
          {materials.length > 0 && (
            <View className="bg-white rounded-3xl p-6">
              <View className="flex-row items-center mb-3.5">
                <Text className="text-[11px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 1.1 }}>
                  Materyal hareketleri
                </Text>
                <View className="flex-1" />
                <View className="px-2 py-0.5 rounded-full bg-ink-50">
                  <Text className="text-[11px] font-medium text-ink-700">
                    {materials.length} kalem
                  </Text>
                </View>
              </View>
              <View className="flex-row flex-wrap gap-2.5">
                {materials.map((m, i) => (
                  <View
                    key={i}
                    className="flex-1 px-4 py-3.5 bg-cream-panel rounded-2xl"
                    style={{ minWidth: 200 }}
                  >
                    <Text numberOfLines={1} className="text-[13px] font-medium text-ink-900">
                      {m.name}
                    </Text>
                    <View className="flex-row justify-between mt-2">
                      <Text className="text-[11px] text-ink-500">
                        {m.quantity} {m.unit ?? ''}
                      </Text>
                      {isManager && (
                        <Text className="text-[11px] font-medium text-ink-900">
                          ₺ {fmtTL(m.line_cost)}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* HIZLI İŞLEM · ETİKETLER */}
          <View className="bg-white rounded-3xl p-5">
            <Text className="text-[11px] font-semibold uppercase text-ink-400 mb-3" style={{ letterSpacing: 1.1 }}>
              Hızlı işlem · etiket
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <Chip tone="outline">Doktor bekliyor</Chip>
              <Chip tone="outline">Yoğunluk</Chip>
              <Chip tone="outline">Teknisyen sorunu</Chip>
              <Chip tone="outline">Malzeme sorunu</Chip>
              {isManager && activeStage && (
                <Pressable onPress={() => setReassignOpen(true)}>
                  <Chip tone="outline" icon={UserCheck}>Yeniden ata</Chip>
                </Pressable>
              )}
              {isManager && ((order.status as string) === 'kalite_kontrol' || (order.status as string) === 'asamada') && (
                <Pressable onPress={() => setQcRejectOpen(true)}>
                  <Chip tone="danger" icon={RotateCcw}>QC Red</Chip>
                </Pressable>
              )}
              <Pressable onPress={handleToggleUrgent} disabled={togglingUrgent}>
                {order.is_urgent ? (
                  <Chip tone="danger" dot>Acil · Kaldır</Chip>
                ) : (
                  <Chip tone="outline">+ Acil işaretle</Chip>
                )}
              </Pressable>
            </View>
          </View>
        </View>

        {/* ═══════════ SAĞ KOLON ═══════════ */}
        <View className="gap-4" style={{ width: isDesktop ? 360 : undefined }}>

          {/* DOKTOR & KLİNİK */}
          <View className="bg-white rounded-3xl p-5">
            <Text className="text-[11px] font-semibold uppercase text-ink-400 mb-3.5" style={{ letterSpacing: 1.1 }}>
              Doktor & Klinik
            </Text>
            <View className="flex-row items-center gap-3 mb-3">
              <Avatar name={doctorName} size={40} bg="#3B82F6" fg="#FFF" />
              <View className="flex-1">
                <Text className="text-[13px] font-medium text-ink-900">{doctorName}</Text>
                <Text className="text-[11px] text-ink-500">{clinicName}</Text>
              </View>
              <Pressable className="w-8 h-8 rounded-lg border border-black/[0.08] items-center justify-center">
                <Bell size={15} color="#0A0A0A" strokeWidth={1.6} />
              </Pressable>
            </View>
            {(doctorPhone || clinicName) && (
              <View className="px-3 py-2.5 bg-cream-panel rounded-[10px] flex-row justify-between flex-wrap gap-2">
                {doctorPhone ? (
                  <View className="flex-row items-center gap-1.5">
                    <Phone size={11} color="#6B6B6B" strokeWidth={1.8} />
                    <Text className="text-[11px] text-ink-500">{doctorPhone}</Text>
                  </View>
                ) : null}
                {clinicName ? (
                  <View className="flex-row items-center gap-1.5">
                    <MapPin size={11} color="#6B6B6B" strokeWidth={1.8} />
                    <Text className="text-[11px] text-ink-500">{clinicName}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          {/* DİŞ ŞEMASI */}
          <View
            className="bg-white rounded-3xl p-4"
            onLayout={e => {
              const w = e.nativeEvent.layout.width - 32;
              if (w > 0 && Math.abs(w - chartW) > 2) setChartW(w);
            }}
          >
            <View className="flex-row items-center mb-2.5 px-1">
              <Text className="text-[11px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 1.1 }}>
                Diş Şeması
              </Text>
              <View className="flex-1" />
              <Text className="text-[11px] text-ink-500">{visibleTeethCount} diş</Text>
            </View>

            <LivingToothChart
              order={toothChartOrder}
              containerWidth={chartW}
              accentColor={panelAccent}
              colorMap={toothColorMap}
              activeTooth={activeTooth}
              onToothPress={(fdi) => setActiveTooth(prev => (prev === fdi ? null : fdi))}
              forceJawMode={forcedJaw}
              frameless
            />

            <View className="flex-row gap-0.5 p-0.5 bg-cream-panel rounded-full mt-3.5 self-center">
              {([
                { id: 'both',  label: 'Tümü', count: allTeeth.length },
                { id: 'upper', label: 'Üst',  count: upperTeeth.length },
                { id: 'lower', label: 'Alt',  count: lowerTeeth.length },
              ] as const).map(opt => {
                const active = jawView === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setJawView(opt.id)}
                    className={`py-1 px-2.5 rounded-full items-center ${active ? 'bg-ink-900' : ''}`}
                  >
                    <Text className={`text-[9px] font-semibold ${active ? 'text-white' : 'text-ink-500'}`}>
                      {opt.label}{' '}
                      <Text className={active ? 'text-white/60' : 'text-ink-400'}>({opt.count})</Text>
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Diş detay paneli — tıklanan diş */}
            {activeTooth && (
              <View className="mt-3 p-4 rounded-2xl border border-black/[0.06]" style={{ backgroundColor: '#FBFAF6' }}>
                <View className="flex-row items-center justify-between mb-3">
                  <View className="flex-row items-center gap-2.5">
                    <View
                      className="w-9 h-9 rounded-xl items-center justify-center"
                      style={{ backgroundColor: toothColorMap[activeTooth] ?? panelAccent }}
                    >
                      <Text className="text-[13px] font-mono font-bold" style={{ color: readableInk(toothColorMap[activeTooth] ?? panelAccent) }}>
                        {activeTooth}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-[14px] font-semibold text-ink-900">Diş #{activeTooth}</Text>
                      <Text className="text-[11px] text-ink-400">
                        {activeTooth >= 11 && activeTooth <= 28 ? 'Üst çene' : 'Alt çene'}
                        {' · '}
                        {activeTooth >= 11 && activeTooth <= 18 ? 'Sağ' :
                         activeTooth >= 21 && activeTooth <= 28 ? 'Sol' :
                         activeTooth >= 31 && activeTooth <= 38 ? 'Sol' : 'Sağ'}
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => setActiveTooth(null)} className="w-7 h-7 rounded-full bg-black/[0.06] items-center justify-center">
                    <Text className="text-[12px] text-ink-500">✕</Text>
                  </Pressable>
                </View>

                <View className="gap-2">
                  <View className="flex-row items-center justify-between py-2 border-t border-black/[0.06]">
                    <Text className="text-[12px] text-ink-500">Çalışma</Text>
                    <Text className="text-[12px] font-medium text-ink-900">{order.work_type || '—'}</Text>
                  </View>
                  {order.shade && (
                    <View className="flex-row items-center justify-between py-2 border-t border-black/[0.06]">
                      <Text className="text-[12px] text-ink-500">Renk</Text>
                      <View className="flex-row items-center gap-1.5">
                        <View className="w-3 h-3 rounded-full" style={{ backgroundColor: VITA_SHADE_HEX[order.shade] ?? '#CCC' }} />
                        <Text className="text-[12px] font-medium text-ink-900">{order.shade}</Text>
                      </View>
                    </View>
                  )}
                  <View className="flex-row items-center justify-between py-2 border-t border-black/[0.06]">
                    <Text className="text-[12px] text-ink-500">Durum</Text>
                    <Text className="text-[12px] font-medium text-ink-900">{STATUS_LABELS[statusIdx] ?? order.status}</Text>
                  </View>
                  <View className="flex-row items-center justify-between py-2 border-t border-black/[0.06]">
                    <Text className="text-[12px] text-ink-500">İlerleme</Text>
                    <View className="flex-row items-center gap-2" style={{ width: 120 }}>
                      <View className="flex-1">
                        <LinearProgressX value={progressPct} theme={panelTheme} compact hideLabel animate />
                      </View>
                      <Text className="text-[11px] text-ink-500">{progressPct}%</Text>
                    </View>
                  </View>
                  {order.machine_type && (
                    <View className="flex-row items-center justify-between py-2 border-t border-black/[0.06]">
                      <Text className="text-[12px] text-ink-500">Makine</Text>
                      <Text className="text-[12px] font-medium text-ink-900">{order.machine_type}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* TABS — Aktivite / Dosyalar / Yorumlar */}
          <View className="bg-white rounded-3xl p-5">
            <View className="flex-row gap-1 p-1 bg-cream-panel rounded-xl mb-3.5">
              {([
                { id: 'activity', label: 'Aktivite',     count: (order.status_history ?? []).length },
                { id: 'files',    label: 'Dosyalar',     count: (order.photos ?? []).length },
                { id: 'chat',     label: 'Mesaj kutusu', count: 0 },
              ] as const).map(tb => {
                const active = (tb.id === 'chat' ? false : sideTab === tb.id);
                return (
                  <Pressable
                    key={tb.id}
                    onPress={() => {
                      if (tb.id === 'chat') setChatOpen(true);
                      else setSideTab(tb.id);
                    }}
                    className={`flex-1 px-2.5 py-2 rounded-[9px] flex-row items-center justify-center gap-1.5 ${active ? 'bg-white' : ''}`}
                    style={active ? ({ /* @ts-ignore */ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' } as any) : undefined}
                  >
                    <Text className={`text-[12px] font-medium ${active ? 'text-ink-900' : 'text-ink-500'}`}>
                      {tb.label}
                    </Text>
                    {tb.count > 0 && (
                      <View className={`px-1.5 py-px rounded-full ${active ? 'bg-ink-900' : 'bg-black/5'}`}>
                        <Text className={`text-[10px] font-semibold ${active ? 'text-white' : 'text-ink-500'}`}>
                          {tb.count}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {sideTab === 'activity' && <ActivityFeed history={order.status_history ?? []} />}
            {sideTab === 'files' && (
              <FilesList
                photos={order.photos ?? []}
                signedUrls={signedUrls ?? {}}
              />
            )}
          </View>

          {/* MALİ BİLGİ — sadece manager veya cost erişimi */}
          {isManager && profit && (
            <View className="bg-ink-900 rounded-3xl p-5">
              <View className="flex-row items-center mb-3.5">
                <Text className="text-[11px] font-semibold uppercase text-white/50" style={{ letterSpacing: 1.1 }}>
                  Mali Bilgi
                </Text>
                <View className="flex-1" />
                <View
                  className="flex-row items-center gap-1.5 px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: panelAccent + '33' }}
                >
                  <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: panelAccent }} />
                  <Text className="text-[10px] font-medium" style={{ color: panelAccent }}>
                    {profit.sale_price > 0 ? 'Tanımlı' : 'Beklemede'}
                  </Text>
                </View>
              </View>
              <View className="gap-2.5">
                <View className="flex-row justify-between items-baseline">
                  <Text className="text-[12px] text-white/60">Satış fiyatı</Text>
                  <Text className="text-white" style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.66 }}>
                    ₺ {fmtTL(profit.sale_price)}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-[12px] text-white/60">Materyal</Text>
                  <Text className="text-[12px] text-white">₺ {fmtTL(profit.material_cost)}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-[12px] text-white/60">İşçilik</Text>
                  <Text className="text-[12px] text-white">₺ {fmtTL(profit.labor_cost)}</Text>
                </View>
                {profit.overhead_cost > 0 && (
                  <View className="flex-row justify-between">
                    <Text className="text-[12px] text-white/60">Genel gider</Text>
                    <Text className="text-[12px] text-white">₺ {fmtTL(profit.overhead_cost)}</Text>
                  </View>
                )}
                <View className="h-px bg-white/10 my-0.5" />
                <View className="flex-row justify-between items-baseline">
                  <Text className="text-[12px]" style={{ color: panelAccent }}>Net kâr</Text>
                  <Text style={{ ...DISPLAY, fontSize: 28, letterSpacing: -0.84, color: panelAccent }}>
                    ₺ {fmtTL(profit.profit)}
                  </Text>
                </View>
                {profit.margin_pct != null && (
                  <Text className="text-[10px] text-white/50 text-right">
                    Marj %{profit.margin_pct.toFixed(0)}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* QR / KARGO ETİKETİ */}
          <View className="bg-white rounded-3xl p-5 flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-xl bg-ink-50 items-center justify-center">
              <QrCode size={20} color="#0A0A0A" strokeWidth={1.6} />
            </View>
            <View className="flex-1">
              <Text className="text-[13px] font-medium text-ink-900">QR Kodu</Text>
              <Text numberOfLines={1} className="text-[11px] text-ink-500 mt-0.5">{qrUrl}</Text>
            </View>
            <Pressable onPress={handlePrintFull}>
              <PillBtn variant="surface" size="sm" icon={Printer}>Yazdır</PillBtn>
            </Pressable>
          </View>

          {/* İLGİLİ SİPARİŞLER */}
          {related.length > 0 && (
            <View className="bg-white rounded-3xl p-5">
              <Text className="text-[11px] font-semibold uppercase text-ink-400 mb-3" style={{ letterSpacing: 1.1 }}>
                İlgili siparişler
              </Text>
              {related.map((o, i) => {
                const cfg = STATUS_CONFIG[o.status as keyof typeof STATUS_CONFIG];
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => handleNavigateRelated(o.id)}
                    className={`px-3 py-2.5 bg-cream-panel rounded-xl flex-row items-center gap-2.5 ${i > 0 ? 'mt-2' : ''}`}
                  >
                    <View className="flex-1">
                      <Text className="text-[11px] font-mono text-ink-400">{o.order_number}</Text>
                      <Text className="text-[12px] font-medium text-ink-900 mt-0.5">
                        {o.work_type ?? '—'}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-[11px] text-ink-500">{fmtDate(o.delivery_date)}</Text>
                      <View
                        className="px-1.5 py-px rounded mt-0.5"
                        style={{ backgroundColor: (cfg?.color ?? '#94A3B8') + '20' }}
                      >
                        <Text
                          className="text-[10px] font-medium"
                          style={{ color: cfg?.color ?? '#475569' }}
                        >
                          {cfg?.label ?? o.status}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </View>

      {/* Order-scoped chat — Mesaj kutusu tab, ana ChatDetail bileşenini bu işe sabitler */}
      <OrderChatPopup
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        order={order}
        currentUserId={profile?.id ?? null}
        viewerType={profile?.user_type ?? null}
        panelAccent={panelAccent}
      />

      {/* QC Reject Modal */}
      {isManager && (
        <QCRejectModal
          visible={qcRejectOpen}
          workOrderId={order.id}
          rejectedBy={profile?.id ?? ''}
          availableStages={(() => {
            const currentStage = legacyStatusToStage(order.status);
            const idx = STAGE_ORDER.indexOf(currentStage);
            return STAGE_ORDER.slice(0, Math.max(0, idx)) as Stage[];
          })()}
          onClose={() => setQcRejectOpen(false)}
          onDone={() => refetch()}
        />
      )}

      {/* Reassign Modal */}
      {isManager && activeStage && (
        <ReassignModal
          visible={reassignOpen}
          stageId={activeStage.id}
          stage={legacyStatusToStage(order.status)}
          labId={profile?.lab_id ?? profile?.id ?? ''}
          currentOwnerId={activeStage.technician?.id}
          onClose={() => setReassignOpen(false)}
          onReassigned={() => refetch()}
        />
      )}

      {/* Print Preview Popup */}
      <Modal
        visible={printOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPrintOpen(false)}
      >
        <Pressable
          onPress={() => setPrintOpen(false)}
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{
              width: Math.min(width * 0.55, 580),
              height: Math.min(height * 0.92, 880),
              backgroundColor: '#fff',
              borderRadius: 24,
              overflow: 'hidden',
              // @ts-ignore
              boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
            }}
          >
            {/* Toolbar */}
            <View className="flex-row items-center justify-between px-5 py-3 border-b border-black/[0.06]">
              <Text className="text-[15px] font-semibold text-ink-900">İş Kağıdı</Text>
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={() => {
                    if (typeof window === 'undefined') return;
                    const html = buildPrintHtmlV2(order, qrUrl, chatMessages);
                    const w = window.open('', '_blank');
                    if (!w) return;
                    w.document.write(html + '<script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script>');
                    w.document.close();
                  }}
                  className="flex-row items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-ink-900"
                >
                  <Printer size={14} color="#FFF" strokeWidth={1.8} />
                  <Text className="text-[12px] font-medium text-white">Yazdır</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPrintOpen(false)}
                  className="w-8 h-8 rounded-full items-center justify-center bg-black/[0.06]"
                >
                  <Text className="text-[14px] text-ink-500">✕</Text>
                </Pressable>
              </View>
            </View>

            {/* Native preview */}
            <ScrollView
              className="flex-1"
              style={{ backgroundColor: '#F5F2EA' }}
              contentContainerStyle={{ padding: 24 }}
            >
              <View className="bg-white rounded-2xl p-6" style={{ maxWidth: 520, alignSelf: 'center', width: '100%',
                // @ts-ignore
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

                {/* Header */}
                <View className="flex-row justify-between items-start pb-3 mb-3" style={{ borderBottomWidth: 2.5, borderBottomColor: '#0A0A0A' }}>
                  <View>
                    <Text className="text-[16px] font-bold text-ink-900" style={{ letterSpacing: -0.4 }}>Aydın Lab</Text>
                    <Text className="text-[8px] text-ink-400 mt-0.5">Diş Protez Laboratuvarı · İstanbul</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1.5 }}>İş Kağıdı</Text>
                    <Text className="text-[13px] font-bold font-mono text-ink-900 mt-0.5">{order.order_number}</Text>
                    <Text className="text-[8px] text-ink-400 mt-0.5">{fmtDate(order.created_at)}</Text>
                  </View>
                </View>

                {order.is_urgent && (
                  <View className="py-1 mb-3 rounded" style={{ backgroundColor: '#9C2E2E' }}>
                    <Text className="text-[10px] font-bold text-white text-center" style={{ letterSpacing: 2 }}>⚠ ACİL</Text>
                  </View>
                )}

                {/* Patient + Order Info */}
                <View className="flex-row gap-3 mb-3">
                  <View className="flex-1 rounded-lg border border-black/[0.08] overflow-hidden">
                    <View className="px-2 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                      <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1 }}>Hasta / Hekim</Text>
                    </View>
                    <View className="px-2.5 py-2">
                      <Text style={{ fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300', fontSize: 18, letterSpacing: -0.6, color: '#0A0A0A' }}>
                        {order.patient_name ?? '—'}
                      </Text>
                      <Text className="text-[9px] text-ink-500 mt-1">
                        <Text className="font-semibold text-ink-900">{order.doctor?.full_name ?? '—'}</Text>
                        {clinicName !== '—' ? ` · ${clinicName}` : ''}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-1 rounded-lg border border-black/[0.08] overflow-hidden">
                    <View className="px-2 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                      <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1 }}>Sipariş Detayı</Text>
                    </View>
                    {[
                      ['İş Tipi', order.work_type ?? '—', true],
                      ['Renk', order.shade ?? '—', false],
                      ['Teslim', fmtDate(order.delivery_date), true],
                      ['Durum', STATUS_CONFIG[order.status as WorkOrderStatus]?.label ?? order.status, false],
                    ].map(([lbl, val, bold], i) => (
                      <View key={i} className="flex-row px-2.5 py-1 border-t border-black/[0.04]">
                        <Text className="text-[8px] font-semibold uppercase text-ink-400" style={{ width: 52, letterSpacing: 0.3 }}>{lbl as string}</Text>
                        <Text className={`text-[10px] ${bold ? 'font-bold' : 'font-medium'} text-ink-900`}>{val as string}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Teknik */}
                <View className="rounded-lg border border-black/[0.08] overflow-hidden mb-3">
                  <View className="px-2 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                    <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1 }}>Teknik Bilgiler</Text>
                  </View>
                  <View className="flex-row">
                    {[
                      ['Makine', order.machine_type === 'milling' ? 'Freze' : order.machine_type === '3d_printing' ? '3D Baskı' : '—'],
                      ['Model', order.model_type === 'dijital' ? 'Dijital' : order.model_type === 'fiziksel' ? 'Fiziksel' : order.model_type ?? '—'],
                      ['Teknisyen', order.assignee?.full_name ?? '—'],
                    ].map(([lbl, val], i) => (
                      <View key={i} className={`flex-1 px-2.5 py-1.5 ${i < 2 ? 'border-r border-black/[0.04]' : ''}`}>
                        <Text className="text-[7px] font-semibold uppercase text-ink-400" style={{ letterSpacing: 0.3 }}>{lbl}</Text>
                        <Text className="text-[10px] font-medium text-ink-900 mt-0.5">{val}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Diş Şeması — gerçek LivingToothChart */}
                <View className="rounded-lg border border-black/[0.08] overflow-hidden mb-3">
                  <View className="px-2 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                    <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1 }}>
                      Diş Şeması — {allTeeth.length} diş
                    </Text>
                  </View>
                  <View className="p-2">
                    <LivingToothChart
                      order={toothChartOrder}
                      containerWidth={440}
                      containerHeight={220}
                      accentColor={panelAccent}
                      colorMap={toothColorMap}
                      frameless
                    />
                  </View>
                </View>

                {/* Items */}
                {(order.order_items ?? []).length > 0 && (
                  <View className="rounded-lg border border-black/[0.08] overflow-hidden mb-3">
                    <View className="flex-row px-2.5 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                      <Text className="flex-1 text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 0.6 }}>Kalem / Hizmet</Text>
                      <Text className="text-[7px] font-bold uppercase text-ink-400 text-center" style={{ width: 40, letterSpacing: 0.6 }}>Adet</Text>
                      <Text className="text-[7px] font-bold uppercase text-ink-400 text-right" style={{ width: 60, letterSpacing: 0.6 }}>Fiyat</Text>
                    </View>
                    {(order.order_items ?? []).map((it: any, i: number) => (
                      <View key={i} className="flex-row px-2.5 py-1.5 border-t border-black/[0.03]">
                        <Text className="flex-1 text-[10px] text-ink-900">{it.name}</Text>
                        <Text className="text-[10px] text-ink-500 text-center" style={{ width: 40 }}>{it.quantity}</Text>
                        <Text className="text-[10px] text-ink-900 text-right" style={{ width: 60 }}>
                          {it.price > 0 ? `₺${it.price.toLocaleString('tr-TR')}` : '—'}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Notes */}
                <View className="flex-row gap-2 mb-3">
                  <View className="flex-1 rounded-lg border border-black/[0.08] overflow-hidden">
                    <View className="px-2 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                      <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1 }}>Hekim Notu</Text>
                    </View>
                    <View className="px-2.5 py-2" style={{ minHeight: 32 }}>
                      <Text className="text-[9px] text-ink-600">{order.notes || '—'}</Text>
                    </View>
                  </View>
                  <View className="flex-1 rounded-lg border border-black/[0.08] overflow-hidden">
                    <View className="px-2 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                      <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1 }}>Lab Notu</Text>
                    </View>
                    <View className="px-2.5 py-2" style={{ minHeight: 32 }}>
                      <Text className="text-[9px] text-ink-600">{order.lab_notes || '—'}</Text>
                    </View>
                  </View>
                </View>

                {/* Doctor Messages */}
                {chatMessages.filter(m => m.sender?.user_type === 'doctor' || m.sender?.user_type === 'clinic_admin').length > 0 && (
                  <View className="rounded-lg border border-black/[0.08] overflow-hidden mb-3">
                    <View className="px-2 py-1" style={{ backgroundColor: '#FAFAF5' }}>
                      <Text className="text-[7px] font-bold uppercase text-ink-400" style={{ letterSpacing: 1 }}>
                        Hekim Mesajları ({chatMessages.filter(m => m.sender?.user_type === 'doctor' || m.sender?.user_type === 'clinic_admin').length})
                      </Text>
                    </View>
                    <View className="px-2.5 py-1.5">
                      {chatMessages
                        .filter(m => m.sender?.user_type === 'doctor' || m.sender?.user_type === 'clinic_admin')
                        .map((m, i) => (
                          <View key={i} className={`py-1.5 ${i > 0 ? 'border-t border-black/[0.03]' : ''}`}>
                            <Text className="text-[7px] text-ink-400">
                              <Text className="font-semibold text-ink-500">{m.sender?.full_name ?? 'Hekim'}</Text>
                              {' · '}{fmtDate(m.created_at)}
                            </Text>
                            <Text className="text-[9px] text-ink-900 mt-0.5">{m.content}</Text>
                          </View>
                        ))}
                    </View>
                  </View>
                )}

                {/* Footer — QR + Signatures */}
                <View className="flex-row justify-between items-end pt-3 mt-2" style={{ borderTopWidth: 1.5, borderTopColor: '#0A0A0A' }}>
                  <View className="items-center">
                    {/* @ts-ignore web img */}
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrUrl)}&margin=4&bgcolor=ffffff&color=0a0a0a`} width={52} height={52} style={{ borderRadius: 4 }} />
                    <Text className="text-[7px] text-ink-300 mt-1">{order.order_number}</Text>
                  </View>
                  <View className="flex-row gap-4">
                    {['Teslim Alan', 'Teknisyen', 'Kalite Kontrol'].map(lbl => (
                      <View key={lbl} className="items-center">
                        <View style={{ width: 68, height: 28 }} />
                        <View style={{ width: 68, borderTopWidth: 1, borderTopColor: '#0A0A0A' }} />
                        <Text className="text-[7px] text-ink-400 mt-1 uppercase" style={{ letterSpacing: 0.3 }}>{lbl}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

// ═══════════════ TAB CONTENT ═══════════════
function ActivityFeed({ history }: { history: StatusHistory[] }) {
  if (history.length === 0) {
    return (
      <View className="py-6 items-center">
        <Text className="text-[12px] text-ink-400">Henüz aktivite kaydı yok</Text>
      </View>
    );
  }
  const sorted = [...history].sort((a, b) =>
    (b.created_at ?? '').localeCompare(a.created_at ?? '')
  );
  return (
    <View className="relative">
      <View className="absolute bg-black/[0.06]" style={{ left: 13, top: 14, bottom: 14, width: 1.5 }} />
      {sorted.map((h, i) => {
        const who = (h as any).changer?.full_name ?? 'Sistem';
        const newCfg = STATUS_CONFIG[h.new_status];
        const action = h.old_status
          ? `${STATUS_CONFIG[h.old_status]?.label ?? h.old_status} → ${newCfg?.label ?? h.new_status}`
          : `${newCfg?.label ?? h.new_status} olarak ayarladı`;
        const time = h.created_at ? timeAgo(h.created_at) : '';
        const dotBg = newCfg?.color ?? '#9A9A9A';
        return (
          <View key={h.id ?? i} className="flex-row gap-3 py-2.5 relative z-10">
            <View
              className="w-7 h-7 rounded-full items-center justify-center"
              style={{ backgroundColor: dotBg }}
            >
              <Text className="text-white text-[12px]">•</Text>
            </View>
            <View className="flex-1">
              <Text className="text-[12px]">
                <Text className="font-medium text-ink-900">{who}</Text>{' '}
                <Text className="text-ink-500">{action}</Text>
              </Text>
              {h.note ? (
                <Text className="text-[11px] text-ink-700 mt-1">{h.note}</Text>
              ) : null}
              <Text className="text-[11px] text-ink-400 mt-0.5">{time}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function FilesList({
  photos, signedUrls,
}: {
  photos: WorkOrderPhoto[];
  signedUrls: Record<string, string>;
}) {
  if (photos.length === 0) {
    return (
      <View className="py-6 items-center">
        <Text className="text-[12px] text-ink-400">Bu siparişe henüz dosya eklenmedi</Text>
      </View>
    );
  }
  return (
    <View className="gap-1.5">
      {photos.map((f) => {
        const url = signedUrls[f.storage_path] ?? f.signed_url ?? null;
        const ext = (f.storage_path.split('.').pop() ?? '').toUpperCase().slice(0, 4);
        const isImage = /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.storage_path);
        const color = isImage ? '#10B981' : '#3B82F6';
        const Icon = isImage ? ImageIcon : FileIcon;
        return (
          <Pressable
            key={f.id}
            onPress={() => {
              if (url && typeof window !== 'undefined') window.open(url, '_blank');
            }}
            className="px-3 py-2.5 bg-cream-panel rounded-xl flex-row items-center gap-2.5"
          >
            <View
              className="w-8 h-8 rounded-lg items-center justify-center"
              style={{ backgroundColor: color + '20' }}
            >
              <Icon size={14} color={color} strokeWidth={1.8} />
            </View>
            <View className="flex-1 min-w-0">
              <Text numberOfLines={1} className="text-[12px] font-medium text-ink-900">
                {f.caption ?? f.storage_path.split('/').pop() ?? '—'}
              </Text>
              <Text className="text-[10px] text-ink-400 mt-px">
                {ext} {f.tooth_number != null ? `· Diş ${f.tooth_number}` : ''}
              </Text>
            </View>
            <Download size={14} color="#9A9A9A" strokeWidth={1.6} />
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => toast.info('Dosya yükleme — yakında aktif olacak')}
        className="py-3 rounded-xl border border-dashed border-black/[0.15] items-center flex-row justify-center gap-2"
      >
        <Upload size={14} color="#6B6B6B" strokeWidth={1.6} />
        <Text className="text-[12px] font-medium text-ink-500">Dosya yükle</Text>
      </Pressable>
    </View>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)        return 'az önce';
  if (diff < 3600)      return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400)     return `${Math.floor(diff / 3600)} sa önce`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} g önce`;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

// ═══════════════ ORDER CHAT POPUP — ana ChatDetail bu işe sabitlenmiş ═══════════════
// Ana mesaj kutusunun TÜM özellikleri (attachments, ses, read receipts, vb.)
// burada da çalışır — sadece bu siparişin thread'ine sabit, sohbet listesi yok.
function OrderChatPopup({
  visible, onClose, order, currentUserId, viewerType, panelAccent,
}: {
  visible: boolean;
  onClose: () => void;
  order: WorkOrder;
  currentUserId: string | null;
  viewerType: any;
  panelAccent: string;
}) {
  // ChatDetail'in beklediği "selectedOrder" şekline çevir.
  // Inbox listesi item'ı gibi davranır — work_order_id zorunlu.
  const selectedOrder = useMemo(() => ({
    work_order_id:  order.id,
    order_number:   order.order_number,
    patient_name:   order.patient_name,
    work_type:      order.work_type,
    status:         order.status,
    tooth_numbers:  order.tooth_numbers,
    shade:          order.shade,
    delivery_date:  order.delivery_date,
    is_urgent:      order.is_urgent,
    doctor:         order.doctor,
    machine_type:   (order as any).machine_type,
    notes:          (order as any).notes,
  }), [order]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: 'rgba(10,10,10,0.45)' }}
      >
        <View
          className="bg-white rounded-3xl overflow-hidden"
          style={{
            width: '94%', maxWidth: 720, height: '88%', maxHeight: 880,
            // @ts-ignore web shadow
            boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
          }}
        >
          {/* Patterns kapatma butonu — sağ üstte yüzer */}
          <Pressable
            onPress={onClose}
            className="absolute z-10 w-9 h-9 rounded-full items-center justify-center bg-white border border-black/[0.06]"
            style={{
              top: 14, right: 14,
              // @ts-ignore web shadow
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          >
            <CloseIcon size={16} color="#0A0A0A" strokeWidth={2} />
          </Pressable>

          {/* Ana ChatDetail — tüm özellikleriyle */}
          <ChatDetail
            selectedOrder={selectedOrder}
            accentColor={panelAccent}
            currentUserId={currentUserId}
            viewerType={viewerType}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── Print HTML — İş Kağıdı A5 format ────────────────────────────────
function buildPrintHtmlV2(order: WorkOrder, qrUrl: string, messages?: Array<{ content: string; created_at: string; sender?: { full_name: string; user_type: string } | null }>): string {
  const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}&margin=4&bgcolor=ffffff&color=0a0a0a`;
  const teeth = (order.tooth_numbers ?? []).sort((a, b) => a - b);
  const doctor = order.doctor?.full_name ?? '—';
  const clinic = order.doctor?.clinic_name ?? order.doctor?.clinic?.name ?? '';
  const cfg = STATUS_CONFIG[order.status as WorkOrderStatus];
  const createdDate = fmtDate(order.created_at);
  const deliveryDate = fmtDate(order.delivery_date);
  const assignee = order.assignee?.full_name ?? '—';
  const items = order.order_items ?? [];
  const notes = order.notes ?? '';
  const labNotes = order.lab_notes ?? '';
  const machineLabel = order.machine_type === 'milling' ? 'Freze (CAD/CAM)' : order.machine_type === '3d_printing' ? '3D Baskı' : order.machine_type ?? '—';
  const modelLabel = order.model_type === 'dijital' ? 'Dijital' : order.model_type === 'fiziksel' ? 'Fiziksel Model' : order.model_type === 'fotograf' ? 'Fotoğraf' : order.model_type === 'cad' ? 'CAD Dosyası' : '—';

  // Hekim mesajları
  const doctorMessages = (messages ?? []).filter(m => m.sender?.user_type === 'doctor' || m.sender?.user_type === 'clinic_admin');

  const itemRows = items.length > 0
    ? items.map(it => `
        <tr>
          <td>${it.name}</td>
          <td class="c">${it.quantity}</td>
          <td class="r">${it.price > 0 ? '₺' + it.price.toLocaleString('tr-TR') : '—'}</td>
        </tr>`).join('')
    : '';

  // FDI tooth grid — 18→11 | 21→28 (üst) ve 48→41 | 31→38 (alt)
  const upperRight = [18,17,16,15,14,13,12,11];
  const upperLeft  = [21,22,23,24,25,26,27,28];
  const lowerRight = [48,47,46,45,44,43,42,41];
  const lowerLeft  = [31,32,33,34,35,36,37,38];
  const selectedSet = new Set(teeth);

  const toothCell = (fdi: number) => {
    const sel = selectedSet.has(fdi);
    return `<td class="tc ${sel ? 'sel' : ''}">${fdi}</td>`;
  };

  return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>İŞ KAĞIDI — ${order.order_number}</title>
  <style>
    @page { size: A5 portrait; margin: 8mm; }
    @media print {
      html, body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter Tight', Inter, -apple-system, sans-serif;
      color: #0A0A0A; background: #F5F2EA; font-size: 10px; line-height: 1.35;
      padding: 24px; margin: 0;
    }
    .page {
      background: #fff; max-width: 520px; margin: 0 auto; padding: 24px;
      border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    }
    @media print {
      body { background: #fff !important; padding: 0 !important; }
      .page { max-width: none; box-shadow: none; border-radius: 0; padding: 0; margin: 0; }
    }

    /* ── Header ── */
    .hdr { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; border-bottom: 2.5px solid #0A0A0A; margin-bottom: 10px; }
    .hdr-left .lab { font-size: 15px; font-weight: 800; letter-spacing: -0.4px; }
    .hdr-left .sub { font-size: 8px; color: #777; margin-top: 1px; }
    .hdr-right { text-align: right; }
    .hdr-right .tag { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #999; }
    .hdr-right .no { font-family: 'SF Mono', monospace; font-size: 13px; font-weight: 700; margin-top: 2px; }
    .hdr-right .dt { font-size: 8px; color: #999; margin-top: 2px; }

    /* ── Urgent ── */
    .urg { background: #9C2E2E; color: #fff; text-align: center; padding: 3px; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px; }

    /* ── Two-col info ── */
    .two-col { display: flex; gap: 10px; margin-bottom: 10px; }
    .col-l, .col-r { flex: 1; }

    /* ── Info box ── */
    .ibox { border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
    .ibox-title { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; background: #FAFAF5; padding: 4px 8px; border-bottom: 1px solid rgba(0,0,0,0.08); }
    .irow { display: flex; border-bottom: 1px solid rgba(0,0,0,0.04); }
    .irow:last-child { border-bottom: none; }
    .irow .lbl { width: 72px; font-size: 8px; color: #999; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 5px 8px; flex-shrink: 0; }
    .irow .val { flex: 1; font-size: 10px; font-weight: 500; padding: 5px 8px; }
    .irow .val.bold { font-weight: 700; }

    /* ── Patient ── */
    .patient { font-size: 18px; font-weight: 300; letter-spacing: -0.6px; line-height: 1.15; padding: 4px 0 2px; }

    /* ── FDI Tooth Grid ── */
    .fdi { border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
    .fdi-title { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; background: #FAFAF5; padding: 4px 8px; border-bottom: 1px solid rgba(0,0,0,0.08); }
    .fdi-grid { padding: 6px 4px; }
    .fdi-grid table { width: 100%; border-collapse: collapse; }
    .fdi-grid td { text-align: center; padding: 0; }
    .tc { font-family: monospace; font-size: 9px; font-weight: 500; color: #CCC;
      height: 26px; vertical-align: middle; border: 1px solid rgba(0,0,0,0.06); }
    .tc.sel { background: #0A0A0A; color: #F5C24B; font-weight: 700; border-color: #0A0A0A; border-radius: 3px; }
    .fdi-mid { height: 3px; }
    .fdi-label { font-size: 7px; color: #BBB; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 0 2px; border: none !important; width: 20px; }

    /* ── Items ── */
    .itbl { width: 100%; border-collapse: collapse; border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
    .itbl th { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #999; background: #FAFAF5; padding: 4px 8px; text-align: left; border-bottom: 1px solid rgba(0,0,0,0.08); }
    .itbl td { font-size: 10px; padding: 5px 8px; border-bottom: 1px solid rgba(0,0,0,0.03); }
    .itbl tr:last-child td { border-bottom: none; }
    .c { text-align: center; }
    .r { text-align: right; }

    /* ── Notes / Messages ── */
    .nbox { border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; overflow: hidden; margin-bottom: 8px; }
    .nbox-hd { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; background: #FAFAF5; padding: 4px 8px; border-bottom: 1px solid rgba(0,0,0,0.08); }
    .nbox-bd { padding: 6px 8px; font-size: 9px; color: #3C3C3C; white-space: pre-wrap; min-height: 22px; }
    .nbox-empty { color: #CCC; font-style: italic; }
    .msg { padding: 4px 0; border-bottom: 1px solid rgba(0,0,0,0.03); }
    .msg:last-child { border-bottom: none; }
    .msg-meta { font-size: 7px; color: #999; margin-bottom: 1px; }
    .msg-meta strong { color: #555; }
    .msg-text { font-size: 9px; color: #0A0A0A; }

    /* ── Footer ── */
    .ftr { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 10px; border-top: 1.5px solid #0A0A0A; margin-top: 8px; }
    .ftr-qr img { width: 56px; height: 56px; }
    .ftr-qr-txt { font-size: 7px; color: #BBB; text-align: center; margin-top: 2px; }
    .sigs { display: flex; gap: 16px; }
    .sig { text-align: center; }
    .sig-line { width: 72px; border-top: 1px solid #0A0A0A; margin-bottom: 3px; margin-top: 28px; }
    .sig-lbl { font-size: 7px; color: #777; text-transform: uppercase; letter-spacing: 0.4px; }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="hdr">
    <div class="hdr-left">
      <div class="lab">Aydın Lab</div>
      <div class="sub">Diş Protez Laboratuvarı · İstanbul</div>
    </div>
    <div class="hdr-right">
      <div class="tag">İş Kağıdı</div>
      <div class="no">${order.order_number}</div>
      <div class="dt">${createdDate}</div>
    </div>
  </div>

  ${order.is_urgent ? '<div class="urg">⚠ ACİL</div>' : ''}

  <!-- TWO COLUMN: Patient + Order Info -->
  <div class="two-col">
    <div class="col-l">
      <div class="ibox">
        <div class="ibox-title">Hasta / Hekim Bilgisi</div>
        <div style="padding: 6px 8px;">
          <div class="patient">${order.patient_name ?? '—'}</div>
          <div style="font-size:9px; color:#666; margin-top:2px;">
            <strong style="color:#0A0A0A">${doctor}</strong>${clinic ? ' · ' + clinic : ''}
          </div>
        </div>
      </div>
    </div>
    <div class="col-r">
      <div class="ibox">
        <div class="ibox-title">Sipariş Detayı</div>
        <div class="irow"><div class="lbl">İş Tipi</div><div class="val bold">${order.work_type ?? '—'}</div></div>
        <div class="irow"><div class="lbl">Renk</div><div class="val">${order.shade ?? '—'}</div></div>
        <div class="irow"><div class="lbl">Teslim</div><div class="val bold">${deliveryDate}</div></div>
        <div class="irow"><div class="lbl">Durum</div><div class="val">${cfg?.label ?? order.status}</div></div>
      </div>
    </div>
  </div>

  <!-- INFO ROW -->
  <div class="ibox">
    <div class="ibox-title">Teknik Bilgiler</div>
    <div style="display:flex;">
      <div style="flex:1; border-right:1px solid rgba(0,0,0,0.06);">
        <div class="irow"><div class="lbl">Makine</div><div class="val">${machineLabel}</div></div>
      </div>
      <div style="flex:1; border-right:1px solid rgba(0,0,0,0.06);">
        <div class="irow"><div class="lbl">Model</div><div class="val">${modelLabel}</div></div>
      </div>
      <div style="flex:1;">
        <div class="irow"><div class="lbl">Teknisyen</div><div class="val">${assignee}</div></div>
      </div>
    </div>
  </div>

  <!-- FDI TOOTH CHART -->
  <div class="fdi">
    <div class="fdi-title">Diş Şeması — ${teeth.length} diş seçili</div>
    <div class="fdi-grid">
      <table>
        <tr>
          ${upperRight.map(t => toothCell(t)).join('')}
          <td class="fdi-label"></td>
          ${upperLeft.map(t => toothCell(t)).join('')}
        </tr>
        <tr class="fdi-mid"><td colspan="17"></td></tr>
        <tr>
          ${lowerRight.map(t => toothCell(t)).join('')}
          <td class="fdi-label"></td>
          ${lowerLeft.map(t => toothCell(t)).join('')}
        </tr>
      </table>
    </div>
  </div>

  <!-- ITEMS -->
  ${items.length > 0 ? `
  <table class="itbl">
    <thead><tr><th>Kalem / Hizmet</th><th class="c">Adet</th><th class="r">Birim Fiyat</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>` : ''}

  <!-- NOTES -->
  <div class="two-col">
    <div class="col-l">
      <div class="nbox">
        <div class="nbox-hd">Hekim Notu</div>
        <div class="nbox-bd">${notes || '<span class="nbox-empty">—</span>'}</div>
      </div>
    </div>
    <div class="col-r">
      <div class="nbox">
        <div class="nbox-hd">Lab Notu (dahili)</div>
        <div class="nbox-bd">${labNotes || '<span class="nbox-empty">—</span>'}</div>
      </div>
    </div>
  </div>

  <!-- DOCTOR MESSAGES -->
  ${doctorMessages.length > 0 ? `
  <div class="nbox">
    <div class="nbox-hd">Hekim Mesajları (${doctorMessages.length})</div>
    <div class="nbox-bd" style="padding:4px 8px;">
      ${doctorMessages.map(m => `
        <div class="msg">
          <div class="msg-meta"><strong>${m.sender?.full_name ?? 'Hekim'}</strong> · ${fmtDate(m.created_at)}</div>
          <div class="msg-text">${m.content}</div>
        </div>`).join('')}
    </div>
  </div>` : ''}

  <!-- FOOTER -->
  <div class="ftr">
    <div class="ftr-qr">
      <img src="${qrImg}" alt="QR" />
      <div class="ftr-qr-txt">${order.order_number}</div>
    </div>
    <div class="sigs">
      <div class="sig"><div class="sig-line"></div><div class="sig-lbl">Teslim Alan</div></div>
      <div class="sig"><div class="sig-line"></div><div class="sig-lbl">Teknisyen</div></div>
      <div class="sig"><div class="sig-line"></div><div class="sig-lbl">Kalite Kontrol</div></div>
    </div>
  </div>

</div>
</body>
</html>`;
}

// ═══════════════ HELPERS ═══════════════
function Avatar({ name, size = 32, bg, fg }: { name: string; size?: number; bg: string; fg: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
  return (
    <View
      className="items-center justify-center shrink-0"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg }}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: '600', color: fg, letterSpacing: -0.3 }}>{initials}</Text>
    </View>
  );
}

function Chip({ children, tone, dot = false, icon: Icon }: {
  children: React.ReactNode;
  tone: 'outline' | 'neutral' | 'danger';
  dot?: boolean;
  icon?: any;
}) {
  if (tone === 'danger') {
    return (
      <View
        className="flex-row items-center gap-1.5 px-3 py-1 rounded-full"
        style={{ backgroundColor: 'rgba(217,75,75,0.12)' }}
      >
        {Icon && <Icon size={12} color="#9C2E2E" strokeWidth={1.8} />}
        {dot && <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#9C2E2E' }} />}
        <Text className="text-[12px] font-medium" style={{ color: '#9C2E2E' }}>{children}</Text>
      </View>
    );
  }
  const cls = tone === 'neutral' ? 'bg-black/5' : 'bg-transparent border border-ink-300';
  return (
    <View className={`flex-row items-center gap-1.5 px-3 py-1 rounded-full ${cls}`}>
      {Icon && <Icon size={12} color="#0A0A0A" strokeWidth={1.8} />}
      {dot && <View className="w-1.5 h-1.5 rounded-full bg-ink-900" />}
      <Text className="text-[12px] font-medium text-ink-900">{children}</Text>
    </View>
  );
}

function PillBtn({ children, variant = 'primary', size = 'md', icon: Icon }: {
  children: React.ReactNode;
  variant?: 'primary' | 'surface' | 'ghost';
  size?: 'sm' | 'md';
  icon?: any; // Lucide ForwardRefExoticComponent — accept any to avoid type friction
}) {
  const sizeCls = size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2';
  const textSize = size === 'sm' ? 'text-[12px]' : 'text-[13px]';
  const iconSize = size === 'sm' ? 14 : 16;
  const variantCls =
    variant === 'primary' ? 'bg-ink-900 border-ink-900' :
    variant === 'surface' ? 'bg-white border-ink-200' :
                            'bg-transparent border-transparent';
  const fgClass = variant === 'primary' ? 'text-white' : 'text-ink-900';
  const fgHex   = variant === 'primary' ? '#FFFFFF' : '#0A0A0A';

  return (
    <View className={`flex-row items-center gap-1.5 rounded-full border ${sizeCls} ${variantCls}`}>
      {Icon && <Icon size={iconSize} color={fgHex} strokeWidth={1.8} />}
      <Text className={`font-medium ${textSize} ${fgClass}`}>{children}</Text>
    </View>
  );
}
