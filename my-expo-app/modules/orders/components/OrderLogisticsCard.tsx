// modules/orders/components/OrderLogisticsCard.tsx
// Siparişin TÜM kurye hareketleri: final teslimat + ara bacaklar (eksik parça,
// model alma, prova gidiş/dönüş, iade). Masraf her zaman lab giderdir ve
// calculate_order_profit içinde siparişin maliyetine yazılır.
//
// Tek kaynak: hem desktop sağ kolonu hem mobil handoff bu bileşeni kullanır.
// `frameless` mobilde dış kartın içine gömmek için (kendi çerçevesini çizmez).

import React from 'react';
import { View, Text, Pressable, Platform, Linking } from 'react-native';
import { Truck, ArrowLeft, ArrowRight, Plus, ChevronLeft, ChevronRight, Printer, ScanLine, ArrowUpRight } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import { isRTL } from '../../../core/i18n';
import { DELIVERY_PURPOSE_LABELS, type DeliveryPurpose } from '../api';
import { StaticRouteMap, legRouteAddresses } from './StaticRouteMap';
import { formatMoney } from '../../../core/money/currency';
import { hexA } from '../../../core/theme/stationPalette';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { ProofRow } from '../../delivery/proof/ProofRow';
import { ProofViewerModal } from '../../delivery/proof/ProofViewerModal';
import { CloseWithoutProofModal } from '../../delivery/proof/CloseWithoutProofModal';
import { measureOrigin, type OriginRect } from '../../delivery/proof/useAnchoredSpring';
import { ShipLabelTypeModal } from './ShipLabelTypeModal';
import { CarrierBadge } from './CarrierLogo';


/** Teslimat durumu rozetleri — kurye takip ekranıyla aynı dil. */
export const DELIVERY_STATUS_CFG: Record<string, { label: string; bg: string; fg: string }> = {
  beklemede:     { label: 'Beklemede', bg: 'rgba(0,0,0,0.06)',      fg: '#6B6B6B' },
  atandi:        { label: 'Atandı',    bg: 'rgba(0,0,0,0.06)',      fg: '#6B6B6B' },
  teslim_alindi: { label: 'Aldı',      bg: 'rgba(37,99,235,0.14)',  fg: '#1E3A8A' },
  yolda:         { label: 'Yolda',     bg: 'rgba(37,99,235,0.22)',  fg: '#1E3A8A' },
  teslim_edildi: { label: 'Teslim',    bg: 'rgba(16,185,129,0.14)', fg: '#0F6E50' },
  iptal:         { label: 'İptal',     bg: 'rgba(220,38,38,0.14)',  fg: '#9C2E2E' },
};

export interface DeliveryLeg {
  id: string;
  status: string;
  mode?: string | null;
  purpose?: string | null;
  direction?: string | null;
  external_provider?: string | null;
  /** Shipink gönderi id'si — etiket ucu bunu ister. */
  external_tracking_code?: string | null;
  external_label_url?: string | null;
  /** Toplayıcının seçtiği gerçek taşıyıcı (ör. "Kolay Gelsin"). */
  external_carrier_name?: string | null;
  external_tracking_no?: string | null;
  external_tracking_url?: string | null;
  stage_snapshot?: string | null;
  created_at?: string | null;
  fee_amount?: number | null;
  fee_currency?: string | null;
  destination_address?: string | null;
  courier?: { full_name?: string | null } | null;
  // Teslim kanıtı (2. dalga 5 — PROOF_SELECT)
  delivered_at?: string | null;
  ext_courier_name?: string | null;
  recipient_name?: string | null;
  recipient_title?: string | null;
  signature_path?: string | null;
  proof_photo_path?: string | null;
  signature_skipped_reason?: string | null;
  proof_source?: string | null;
  proof_captured_at?: string | null;
  proof_override_reason?: string | null;
  proof_override_by_name?: string | null;
  proof_override_at?: string | null;
  provider_proof_checked_at?: string | null;
}

interface Props {
  legs: DeliveryLeg[];
  accent: string;
  /** Satır zemini — panelin soft fill'i. */
  rowBg: string;
  /** Ücret düzenleme + "Kurye çağır" yalnız yöneticide. */
  isManager: boolean;
  /** false → "Kurye çağır" gizlenir (ör. iptal edilmiş sipariş). */
  canCall?: boolean;
  onCall: () => void;
  onEditFee: (leg: DeliveryLeg) => void;
  fmtDate: (d?: string | null) => string;
  /** Mobilde dış kartın içine gömülürken kendi çerçevesini çizmez. */
  frameless?: boolean;
  /** Mobil koyu/açık zemin için metin renkleri. */
  tone?: { label: string; title: string; muted: string };
  /** Rota önizlemesi için Google Maps anahtarı — yoksa harita çizilmez. */
  mapsApiKey?: string | null;
  /** Laboratuvarın adresi (lab çıkışlı bacaklarda çıkış noktası). */
  labAddress?: string | null;
  /** Siparişin kliniğinin adresi (klinikten alım bacaklarında çıkış noktası). */
  clinicAddress?: string | null;
  /** Satıra tıklanınca Kurye Takip ekranını o teslimat seçili açar. */
  onOpenTracking?: (leg: DeliveryLeg) => void;
  /**
   * Klinik/hekim görünümü. true ise: yalnızca kliniğe giden (outbound) teslimat
   * bacağı gösterilir (ara/gelen bacaklar gizli) ve HİÇBİR ücret gösterilmez —
   * lojistik masrafı lab giderdir, müşteriye açılmaz.
   */
  clientView?: boolean;
  /**
   * Hareketin A6 gönderi fişini bas (kargoya / kutuya yapıştırılır). Verilmezse
   * düğme çizilmez — yazdırma yalnız web'de; klinik/hekim görünümünde hiç yok.
   */
  onPrintLabel?: (leg: DeliveryLeg) => void;
  /**
   * Kurye hareketi OLMADAN teslimat belgesi bas: başlıktaki yazıcı düğmesi her
   * zaman görünür, basınca teslimat türünü sorar. Başarısızsa fırlatmalı (hata
   * pencerede gösterilir). Verilmezse düğme çizilmez; klinik/hekimde hiç yok.
   */
  onPrintForPurpose?: (purpose: DeliveryPurpose) => Promise<void>;
  /**
   * Kargo firmasının kendi etiketi (barkod) — Shipink hareketlerinin satırında
   * düğme olarak çıkar. Yalnız yönetici; klinik/hekimde hiç yok.
   */
  onCargoLabel?: (leg: DeliveryLeg) => void;
  /** Kargo etiketi alınan hareket — düğmesi o sırada "Alınıyor…" yazar. */
  cargoLabelLegId?: string | null;
  /** Fişi hazırlanan hareket — düğmesi o sırada sönük ve basılamaz. */
  printingLegId?: string | null;
  /** Kanıt penceresinin alt başlığı için sipariş no. */
  orderNumber?: string | null;
  /** Yönetici kanıtsız kapattıktan sonra (realtime de yeniler). */
  onProofChanged?: () => void;
}

const LIGHT_TONE = { label: '#9A9A9A', title: '#0A0A0A', muted: '#6B6B6B' };

/** Kartta gösterilen tam durum adı (DELIVERY_STATUS_CFG'deki kısaltmalar "Aldı"/"Teslim" başka ekranlarda kullanılıyor). */
const STATUS_LONG: Record<string, string> = {
  beklemede: 'Beklemede', atandi: 'Atandı', teslim_alindi: 'Teslim alındı',
  yolda: 'Yolda', teslim_edildi: 'Teslim edildi', iptal: 'İptal',
};

/** Hareket kutusundaki etiketli eylem düğmesi (beyaz kapsül; ne yaptığını yazar). */
function LegAction({ label, tip, accent, isDark, title, disabled, onPress }: {
  label: string; tip?: string; accent: string; isDark: boolean; title: string; disabled?: boolean; onPress: () => void;
}) {
  const btn = (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }: any) => ({
        flex: 1, minWidth: 0, alignItems: 'center',
        paddingHorizontal: 6, paddingVertical: 7, borderRadius: 999,
        backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : '#FFFFFF',
        opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
        ...(Platform.OS === 'web' ? { cursor: disabled ? 'default' : 'pointer' } as any : {}),
      })}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: isDark ? title : accent }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
  // Tooltip sarmalayıcısı da alanı paylaşsın diye flex:1 kapsayıcı içinde
  return tip
    ? <View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}><GlassTooltip title={label} text={tip}>{btn}</GlassTooltip></View>
    : btn;
}

/** Koyu modda teslimat rozeti ön-plan renkleri (açık koyu-lacivert/yeşil/kırmızı okunmaz). */
const DARK_STATUS_FG: Record<string, string> = {
  '#6B6B6B': 'rgba(247,242,233,0.72)',
  '#1E3A8A': '#93C5FD',
  '#0F6E50': '#6EE7B7',
  '#9C2E2E': '#FCA5A5',
};

export function OrderLogisticsCard({
  legs, accent, rowBg, isManager, canCall = true, onCall, onEditFee, fmtDate,
  frameless = false, tone,
  mapsApiKey, labAddress, clinicAddress, onOpenTracking, clientView = false,
  onPrintLabel, onPrintForPurpose, onCargoLabel, cargoLabelLegId = null, printingLegId = null, orderNumber = null, onProofChanged,
}: Props) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // Teslim kanıtı görüntüleyici + yöneticinin "Kanıtsız kapat"ı (kapanış yayı için son bacak tutulur)
  const [viewer, setViewer] = React.useState<{ leg: DeliveryLeg; origin: OriginRect | null } | null>(null);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [noProof, setNoProof] = React.useState<{ leg: DeliveryLeg; origin: OriginRect | null } | null>(null);
  const [noProofOpen, setNoProofOpen] = React.useState(false);
  const [typeOpen, setTypeOpen] = React.useState(false);
  const [typeOrigin, setTypeOrigin] = React.useState<OriginRect | null>(null);
  const typeBtnRef = React.useRef<any>(null);
  // Çağıran tone geçmediyse: koyuda token-tabanlı, açıkta mevcut açık ton.
  const toneEff = tone ?? (isDark
    ? { label: T.ink3, title: T.ink, muted: T.ink2 }
    : LIGHT_TONE);
  // İptal edilmiş bacaklar listede yer kaplamasın — kayıt DB'de durur (gider/denetim
  // izi), yalnız bu kartta gizlenir.
  // Klinik/hekim (clientView): yalnız kliniğe giden (outbound) teslimat bacağı görünür;
  // klinikten alım (clinic_to_lab) ve ara hareketler müşteriye gösterilmez.
  const shownLegs = React.useMemo(() => {
    const active = legs.filter(l => l.status !== 'iptal');
    if (!clientView) return active;
    return active.filter(l => l.direction !== 'clinic_to_lab');
  }, [legs, clientView]);

  // Rota önizlemesi yalnız EN SON kurye hareketinde gösterilir; her bacağa
  // harita gömmek kartı gereksiz uzatıyordu. En yeni = en büyük created_at
  // (liste created_at DESC gelse de indekse güvenmeden hesapla).
  const mapLegId = React.useMemo(() => {
    let best: DeliveryLeg | null = null;
    for (const l of shownLegs) {
      if (!best) { best = l; continue; }
      const a = l.created_at ? Date.parse(l.created_at) : 0;
      const b = best.created_at ? Date.parse(best.created_at) : 0;
      if (a >= b) best = l;
    }
    return best?.id ?? null;
  }, [shownLegs]);

  const body = (
    <>
      {/* Başlık — sayaç + eylem sağda.
          "Kurye çağır" eskiden kartın altında tam genişlikte bir çubuktu;
          hemen üstündeki "Mesaj gönder" ile birlikte sağ kolonda iki kalın
          buton üst üste geliyordu. İkisi de aynı ağırlıkta olunca göz hangisine
          bakacağını bilmiyordu. Eylem artık etkilediği kartın başlığında,
          içerikten hafif. */}
      {/* Başlık diğer kartlarla aynı ölçü (14/600, büyük harfsiz). Sağda yalnız "Kurye
          çağır"; teslimat belgesi düğmesi etiketli olarak kartın altına indi (başlıkta
          ve satırda iki ayrı yazıcı ikonu vardı, hangisinin neyi bastığı belli değildi). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', letterSpacing: -0.1, color: toneEff.title }}>
          Lojistik
        </Text>
        {shownLegs.length > 0 && (
          <Text style={{ fontSize: 12, color: toneEff.muted }}>
            {shownLegs.length} hareket
          </Text>
        )}
        <View style={{ flex: 1 }} />
        {isManager && canCall && shownLegs.length > 0 && (
          <Pressable
            onPress={onCall}
            accessibilityRole="button"
            style={({ pressed }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
              backgroundColor: hexA(accent, 0.10),
              opacity: pressed ? 0.6 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <Plus size={13} color={accent} strokeWidth={2.4} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: accent }}>{autoT('Kurye çağır')}</Text>
          </Pressable>
        )}
      </View>

      {shownLegs.length === 0 ? (
        /* Boş durum eylemin KENDİSİ — italik bir cümle + ayrı bir buton yerine
           tek dokunulabilir satır. Hem durumu söyler hem çıkış yolunu verir. */
        isManager && canCall ? (
          <Pressable
            onPress={onCall}
            style={({ pressed }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 12,
              padding: 14, borderRadius: 16, backgroundColor: rowBg,
              opacity: pressed ? 0.7 : 1,
              transform: [{ scale: pressed ? 0.99 : 1 }],
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <View style={{
              width: 34, height: 34, borderRadius: 999,
              backgroundColor: hexA(accent, 0.12),
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Truck size={16} color={accent} strokeWidth={1.9} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: toneEff.title }}>Kurye çağır</Text>
              <Text style={{ fontSize: 11.5, color: toneEff.muted }}>Henüz kurye hareketi yok</Text>
            </View>
            {isRTL() ? <ChevronLeft size={15} color={toneEff.muted} strokeWidth={2} /> : <ChevronRight size={15} color={toneEff.muted} strokeWidth={2} />}
          </Pressable>
        ) : (
          <Text style={{ fontSize: 12, color: toneEff.muted, paddingHorizontal: 2 }}>
            Henüz kurye hareketi yok.
          </Text>
        )
      ) : (
        <View style={{ gap: 8 }}>
          {shownLegs.map(leg => {
            const stRaw = DELIVERY_STATUS_CFG[leg.status]
              ?? { label: leg.status, bg: 'rgba(0,0,0,0.05)', fg: '#6B6B6B' };
            // Koyu modda: nötr (siyah-alfa) zemini beyaz-alfaya çevir, koyu ön-planı aç.
            const st = isDark
              ? {
                  label: stRaw.label,
                  bg: stRaw.bg.startsWith('rgba(0,0,0') ? 'rgba(255,255,255,0.10)' : stRaw.bg,
                  fg: DARK_STATUS_FG[stRaw.fg] ?? toneEff.muted,
                }
              : stRaw;
            const purposeLabel = DELIVERY_PURPOSE_LABELS[(leg.purpose ?? 'teslimat') as DeliveryPurpose] ?? 'Teslimat';
            const who = leg.mode === 'internal'
              ? (leg.courier?.full_name ?? 'Bizim kurye')
              // Toplayıcıyla gönderildiyse gerçek taşıyıcı öne gelir: "Kolay Gelsin · Shipink".
              : ([leg.external_carrier_name, leg.external_provider].filter(Boolean).join(' · ') || 'Dış kargo');
            // Kargo (toplayıcı) hareketi: canlı kurye yok → rota haritası anlamsız; takip no gösterilir.
            const isCargo = leg.external_provider === 'Shipink';
            const trackNo = isCargo && !clientView ? (leg.external_tracking_no ?? null) : null;
            const trackUrl = leg.external_tracking_url ?? null;
            const fee = leg.fee_amount != null
              ? formatMoney(Number(leg.fee_amount) || 0, (leg.fee_currency ?? 'TRY') as any)
              : null;
            return (
              <View
                key={leg.id}
                style={{ padding: 12, borderRadius: 16, backgroundColor: rowBg }}
              >
                {/* 1) Yön başlık + TEK durum rozeti. Eskiden ikinci satırda aşama adı
                    ("Teslim Edildi") rozetteki durumla ("Beklemede") yan yana durup
                    çelişki gibi okunuyordu; aşama artık "Aşama:" diye etiketli. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: toneEff.title }} numberOfLines={1}>
                    {leg.direction === 'clinic_to_lab' ? 'Klinik' : 'Lab'}
                  </Text>
                  {isRTL()
                    ? <ArrowLeft size={13} color={toneEff.muted} strokeWidth={2} />
                    : <ArrowRight size={13} color={toneEff.muted} strokeWidth={2} />}
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: toneEff.title }} numberOfLines={1}>
                    {leg.direction === 'clinic_to_lab' ? 'Lab' : 'Klinik'}
                  </Text>
                  <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: st.bg }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: st.fg }}>{autoT(STATUS_LONG[leg.status] ?? st.label)}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  {isCargo && leg.external_carrier_name ? <CarrierBadge name={leg.external_carrier_name} width={40} height={16} /> : null}
                  <Text style={{ flex: 1, fontSize: 12, color: toneEff.muted }} numberOfLines={2}>
                    {[purposeLabel, who, fmtDate(leg.created_at)].filter(Boolean).join(' · ')}
                    {leg.stage_snapshot ? ` · ${autoT('Aşama')}: ${leg.stage_snapshot}` : ''}
                  </Text>
                </View>

                {/* 2) Üç adımlı ilerleme */}
                {(() => {
                  const step = leg.status === 'teslim_edildi' ? 3 : (leg.status === 'teslim_alindi' || leg.status === 'yolda') ? 2 : 1;
                  const on = isDark ? '#6EE7B7' : '#1D9E75';
                  const off = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)';
                  const labels = [autoT('Hazırlandı'), autoT('Yolda'), autoT('Teslim edildi')];
                  return (
                    <View style={{ marginTop: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        {[1, 2, 3].map(n => (
                          <React.Fragment key={n}>
                            {n > 1 ? <View style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: step >= n ? on : off }} /> : null}
                            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: step >= n ? on : off }} />
                          </React.Fragment>
                        ))}
                      </View>
                      <View style={{ flexDirection: 'row', marginTop: 5 }}>
                        {labels.map((l, i) => (
                          <Text key={l} numberOfLines={1} style={{
                            flex: 1, fontSize: 11, textAlign: i === 0 ? (isRTL() ? 'right' : 'left') : i === 1 ? 'center' : (isRTL() ? 'left' : 'right'),
                            color: step === i + 1 ? toneEff.title : toneEff.muted, fontWeight: step === i + 1 ? '600' : '400',
                          }}>{l}</Text>
                        ))}
                      </View>
                    </View>
                  );
                })()}

                {/* Teslim kanıtı (2. dalga 5) — türü yoksa hiçbir şey çizilmez */}
                <ProofRow leg={leg as any} onOpen={(origin) => { setViewer({ leg, origin }); setViewerOpen(true); }} />

                {/* 3) Takip no (solda) + ücret (sağda). Ücret: klinik/hekimde HİÇ gösterilmez
                    (lab gideri). Yönetici düzenler, diğer lab kullanıcıları salt-okunur görür. */}
                {(trackNo || (!clientView && (isManager || fee))) ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                    {trackNo ? (
                      <Pressable
                        onPress={trackUrl ? () => {
                          if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.open(trackUrl, '_blank', 'noopener'); }
                          else void Linking.openURL(trackUrl);
                        } : undefined}
                        disabled={!trackUrl}
                        accessibilityRole={trackUrl ? 'link' : undefined}
                        accessibilityLabel={`${autoT('Takip no')} ${trackNo}`}
                        style={({ pressed }: any) => ({
                          flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5,
                          opacity: pressed ? 0.6 : 1,
                          ...(trackUrl && Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        })}
                      >
                        <Text
                          selectable
                          style={{
                            flexShrink: 1, fontSize: 12, color: toneEff.muted, fontVariant: ['tabular-nums'],
                            fontFamily: Platform.OS === 'web' ? 'JetBrains Mono, ui-monospace, Menlo, monospace' : undefined,
                          }}
                          numberOfLines={1}
                        >
                          {trackNo}
                        </Text>
                        {trackUrl ? <ArrowUpRight size={12} color={toneEff.muted} strokeWidth={2} /> : null}
                      </Pressable>
                    ) : <View style={{ flex: 1 }} />}
                    {clientView ? null : isManager ? (
                      <Pressable onPress={() => onEditFee(leg)} hitSlop={8} accessibilityRole="button">
                        <Text style={{ fontSize: 14, fontWeight: '600', color: fee ? toneEff.title : accent }}>
                          {fee ?? '+ ücret'}
                        </Text>
                      </Pressable>
                    ) : (
                      !!fee && <Text style={{ fontSize: 14, fontWeight: '600', color: toneEff.title }}>{fee}</Text>
                    )}
                  </View>
                ) : null}

                {/* 4) ETİKETLİ eylemler — ikon yerine ne yaptığını yazan düğmeler */}
                {(onOpenTracking || (onPrintLabel && !clientView) || (onCargoLabel && isManager && !clientView && isCargo && (leg.external_label_url || leg.external_tracking_code))) ? (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                    {/* TEK satır: düğmeler alanı eşit paylaşır, alt satıra düşmez (kullanıcı kararı) */}
                    {onOpenTracking ? (
                      <LegAction label={autoT('Kurye Takip')} accent={accent} isDark={isDark} title={toneEff.title} onPress={() => onOpenTracking(leg)} />
                    ) : null}
                    {onCargoLabel && isManager && !clientView && isCargo && (leg.external_label_url || leg.external_tracking_code) ? (
                      <LegAction
                        label={autoT(cargoLabelLegId === leg.id ? 'Alınıyor…' : 'Kargo etiketi')}
                        tip={autoT('Kargo firmasının barkodlu etiketini açar; kutuya yapıştırılır')}
                        accent={accent} isDark={isDark} title={toneEff.title}
                        disabled={cargoLabelLegId === leg.id}
                        onPress={() => onCargoLabel(leg)}
                      />
                    ) : null}
                    {onPrintLabel && !clientView ? (
                      <LegAction
                        label={autoT('Gönderi fişi')}
                        tip={autoT('Kargoya ya da kutuya yapıştırılacak A6 fişi basar')}
                        accent={accent} isDark={isDark} title={toneEff.title}
                        disabled={printingLegId === leg.id}
                        onPress={() => onPrintLabel(leg)}
                      />
                    ) : null}
                  </View>
                ) : null}
                {isManager && !clientView && leg.mode === 'internal' && leg.status !== 'teslim_edildi' && leg.status !== 'iptal' ? (
                  <NoProofButton accent={accent} onOpen={(origin) => { setNoProof({ leg, origin }); setNoProofOpen(true); }} />
                ) : null}

                {/* Rota önizlemesi yalnız en son kurye hareketinde (kargo dahil — kullanıcı
                    haritayı kartta görmek istiyor). Anahtar ya da adres yoksa çizilmez. */}
                {(() => {
                  if (leg.id !== mapLegId) return null;
                  const { originText, destText } = legRouteAddresses(leg, labAddress, clinicAddress);
                  if (!mapsApiKey || !originText || !destText) return null;
                  return (
                    <View style={{ marginTop: 12 }}>
                      <StaticRouteMap
                        originText={originText}
                        destText={destText}
                        apiKey={mapsApiKey}
                        accent={accent}
                        height={90}
                        radius={11}
                      />
                    </View>
                  );
                })()}
              </View>
            );
          })}
        </View>
      )}

      {/* Teslimat belgesi = gönderi fişinin türü henüz belli olmayan hâli (kullanıcı,
          2026-11-14): yalnız kurye hareketi YOKKEN görünür ve türü sorar. Hareket
          oluşunca kalkar; o hareketin "Gönderi fişi" düğmesi aynı belgeyi basar. */}
      {onPrintForPurpose && !clientView && shownLegs.length === 0 ? (
        <View style={{ flexDirection: 'row', marginTop: 10 }}>
          <GlassTooltip title={autoT('Teslimat belgesi')} text={autoT('Teslimat türünü sorar, A6 belgeyi basar. Kurye çağırmadan da kullanılır.')}>
            <Pressable
              ref={typeBtnRef}
              onPress={() => measureOrigin(typeBtnRef.current, (o) => { setTypeOrigin(o); setTypeOpen(true); })}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={autoT('Teslimat belgesi yazdır')}
              style={({ pressed }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                backgroundColor: hexA(accent, 0.10),
                opacity: pressed ? 0.6 : 1,
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <Printer size={13} color={accent} strokeWidth={2} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: accent }}>{autoT('Teslimat belgesi')}</Text>
            </Pressable>
          </GlassTooltip>
        </View>
      ) : null}

      <ProofViewerModal
        visible={viewerOpen}
        onClose={() => setViewerOpen(false)}
        leg={(viewer?.leg ?? null) as any}
        origin={viewer?.origin ?? null}
        orderNumber={orderNumber}
      />
      {onPrintForPurpose && !clientView ? (
        <ShipLabelTypeModal
          visible={typeOpen}
          onClose={() => setTypeOpen(false)}
          accent={accent}
          origin={typeOrigin}
          orderNumber={orderNumber}
          onPick={onPrintForPurpose}
        />
      ) : null}
      <CloseWithoutProofModal
        visible={noProofOpen}
        onClose={() => setNoProofOpen(false)}
        deliveryId={noProof?.leg.id ?? null}
        subtitle={[noProof?.leg.courier?.full_name, orderNumber ? `#${orderNumber}` : null].filter(Boolean).join(' · ')}
        origin={noProof?.origin ?? null}
        onClosed={() => onProofChanged?.()}
      />
    </>
  );

  if (frameless) return <View>{body}</View>;

  return (
    <View style={{
      backgroundColor: isDark ? T.card : '#FFFFFF', borderRadius: 24, borderWidth: 1,
      borderColor: isDark ? T.hairline : 'rgba(0,0,0,0.06)', padding: 20,
    }}>
      {body}
    </View>
  );
}

/** Yönetici: kendi kurye teslimatını gerekçeli kanıtsız kapatma düğmesi (pencere buradan açılır). */
function NoProofButton({ accent, onOpen }: { accent: string; onOpen: (origin: OriginRect | null) => void }) {
  const ref = React.useRef<any>(null);
  return (
    <View style={{ flexDirection: 'row', marginTop: 10 }}>
      <GlassTooltip title={autoT('Kanıtsız kapat')} text={autoT('Kurye kanıt alamadıysa nedeniyle kapat')}>
        <Pressable
          ref={ref}
          onPress={() => measureOrigin(ref.current, onOpen)}
          accessibilityRole="button"
          accessibilityLabel={autoT('Kanıtsız kapat')}
          style={({ pressed }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
            backgroundColor: hexA(accent, 0.10), transform: [{ scale: pressed ? 0.97 : 1 }],
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: accent }}>{autoT('Kanıtsız kapat')}</Text>
        </Pressable>
      </GlassTooltip>
    </View>
  );
}
