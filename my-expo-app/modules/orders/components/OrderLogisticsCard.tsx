// modules/orders/components/OrderLogisticsCard.tsx
// Siparişin TÜM kurye hareketleri: final teslimat + ara bacaklar (eksik parça,
// model alma, prova gidiş/dönüş, iade). Masraf her zaman lab giderdir ve
// calculate_order_profit içinde siparişin maliyetine yazılır.
//
// Tek kaynak: hem desktop sağ kolonu hem mobil handoff bu bileşeni kullanır.
// `frameless` mobilde dış kartın içine gömmek için (kendi çerçevesini çizmez).

import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Truck, ArrowLeft, ArrowRight, Plus, ChevronRight } from 'lucide-react-native';
import { DELIVERY_PURPOSE_LABELS, type DeliveryPurpose } from '../api';
import { StaticRouteMap, legRouteAddresses } from './StaticRouteMap';
import { formatMoney } from '../../../core/money/currency';
import { hexA } from '../../../core/theme/stationPalette';


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
  stage_snapshot?: string | null;
  created_at?: string | null;
  fee_amount?: number | null;
  fee_currency?: string | null;
  destination_address?: string | null;
  courier?: { full_name?: string | null } | null;
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
}

const LIGHT_TONE = { label: '#9A9A9A', title: '#0A0A0A', muted: '#6B6B6B' };

export function OrderLogisticsCard({
  legs, accent, rowBg, isManager, canCall = true, onCall, onEditFee, fmtDate,
  frameless = false, tone = LIGHT_TONE,
  mapsApiKey, labAddress, clinicAddress, onOpenTracking, clientView = false,
}: Props) {
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Truck size={12} color={tone.label} strokeWidth={1.8} />
        <Text style={{ fontSize: 11, fontWeight: '600', color: tone.label, letterSpacing: 1.1, textTransform: 'uppercase' }}>
          Lojistik
        </Text>
        <View style={{ flex: 1 }} />
        {shownLegs.length > 0 && (
          <Text style={{ fontSize: 11, fontWeight: '500', color: tone.muted }}>
            {shownLegs.length} hareket
          </Text>
        )}
        {isManager && canCall && shownLegs.length > 0 && (
          <Pressable
            onPress={onCall}
            style={({ pressed }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 5,
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
              backgroundColor: hexA(accent, 0.10),
              opacity: pressed ? 0.6 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            })}
          >
            <Plus size={12} color={accent} strokeWidth={2.4} />
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: accent }}>Kurye</Text>
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
              <Text style={{ fontSize: 13, fontWeight: '600', color: tone.title }}>Kurye çağır</Text>
              <Text style={{ fontSize: 11.5, color: tone.muted }}>Henüz kurye hareketi yok</Text>
            </View>
            <ChevronRight size={15} color={tone.muted} strokeWidth={2} />
          </Pressable>
        ) : (
          <Text style={{ fontSize: 12, color: tone.muted, paddingHorizontal: 2 }}>
            Henüz kurye hareketi yok.
          </Text>
        )
      ) : (
        <View style={{ gap: 8 }}>
          {shownLegs.map(leg => {
            const st = DELIVERY_STATUS_CFG[leg.status]
              ?? { label: leg.status, bg: 'rgba(0,0,0,0.05)', fg: tone.muted };
            const purposeLabel = DELIVERY_PURPOSE_LABELS[(leg.purpose ?? 'teslimat') as DeliveryPurpose] ?? 'Teslimat';
            const who = leg.mode === 'internal'
              ? (leg.courier?.full_name ?? 'Bizim kurye')
              : (leg.external_provider ?? 'Dış kargo');
            const fee = leg.fee_amount != null
              ? formatMoney(Number(leg.fee_amount) || 0, (leg.fee_currency ?? 'TRY') as any)
              : null;
            return (
              <Pressable
                key={leg.id}
                onPress={onOpenTracking ? () => onOpenTracking(leg) : undefined}
                disabled={!onOpenTracking}
                style={({ pressed }: any) => ({
                  padding: 12, borderRadius: 16, backgroundColor: rowBg,
                  // Tıklanabilir satır basıldığı anda cevap versin — bırakmayı beklemesin.
                  opacity: onOpenTracking && pressed ? 0.7 : 1,
                  transform: [{ scale: onOpenTracking && pressed ? 0.99 : 1 }],
                  ...(onOpenTracking && Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: tone.title }}>{purposeLabel}</Text>
                  {leg.direction === 'clinic_to_lab'
                    ? <ArrowLeft size={11} color={tone.muted} strokeWidth={2} />
                    : <ArrowRight size={11} color={tone.muted} strokeWidth={2} />}
                  <Text style={{ flex: 1, fontSize: 11, color: tone.muted }} numberOfLines={1}>
                    {leg.direction === 'clinic_to_lab' ? 'Klinik → Lab' : 'Lab → Klinik'}
                  </Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: st.bg }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: st.fg }}>{st.label}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ flex: 1, fontSize: 11, color: tone.muted }} numberOfLines={1}>
                    {who}
                    {leg.stage_snapshot ? ` · ${leg.stage_snapshot}` : ''}
                    {' · '}{fmtDate(leg.created_at)}
                  </Text>
                  {/* Ücret: klinik/hekimde HİÇ gösterilmez (lab gideri). Yönetici düzenler,
                      diğer lab kullanıcıları salt-okunur görür. */}
                  {clientView ? null : isManager ? (
                    <Pressable onPress={() => onEditFee(leg)} hitSlop={8}>
                      <Text style={{ fontSize: 11.5, fontWeight: '600', color: fee ? tone.title : accent }}>
                        {fee ?? '+ ücret'}
                      </Text>
                    </Pressable>
                  ) : (
                    !!fee && <Text style={{ fontSize: 11.5, fontWeight: '600', color: tone.title }}>{fee}</Text>
                  )}
                </View>

                {/* Rota önizlemesi yalnız en son kurye hareketinde. Anahtar ya da
                    adres yoksa bileşen kendini zaten gizler. */}
                {(() => {
                  if (leg.id !== mapLegId) return null;
                  const { originText, destText } = legRouteAddresses(leg, labAddress, clinicAddress);
                  if (!mapsApiKey || !originText || !destText) return null;
                  return (
                    <View style={{ marginTop: 10 }}>
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
              </Pressable>
            );
          })}
        </View>
      )}

    </>
  );

  if (frameless) return <View>{body}</View>;

  return (
    <View style={{
      backgroundColor: '#FFFFFF', borderRadius: 24, borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.06)', padding: 20,
    }}>
      {body}
    </View>
  );
}
