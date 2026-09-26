/**
 * NewShipmentModal — kurye takip ekranından gönderi açma.
 *
 * İki mod: SİPARİŞE BAĞLI (adres siparişin hekim/kliniğinden sunucuda çözülür)
 * ve BAĞIMSIZ gönderi (serbest adres).
 *
 * Lab bazen işe bağlı olmayan bir şey gönderir/aldırır: tedarikçiye iade,
 * kliniğe belge, şubeden malzeme. Kayıt ayrı tabloda değil, `deliveries`in
 * `work_order_id IS NULL` hâlinde tutulur → kurye paneli, harita ve ücret→gider
 * akışı aynen çalışır. Numara sunucuda üretilir (GND-YYYY-NNNN).
 *
 * Alıcı serbest adrestir (kullanıcı kararı): kayıtlı klinik/hekim seçimi YOK.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { X, Truck, ArrowUpRight, ArrowDownLeft } from '../../../core/ui/icons';

import { supabase } from '../../../lib/supabase';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';
import { createDelivery } from '../../orders/api';
import { AddressAutocompleteField } from '../../integrations/components/AddressAutocompleteField';
import { PartyPickerField } from './PartyPickerField';
import { ILLER, ILCELER } from '../../clinics/data/turkey';

/** Türkçe harfleri hesaba katan gevşek karşılaştırma (İ/ı tuzağı). */
function norm(v: string): string {
  return (v ?? '').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

/**
 * Google biçimli TR adresinden il/ilçe/posta kodunu çıkarır:
 *   "Güzeloba, 2365. Sk. No:67, 07230 Muratpaşa/Antalya" → 07230 · Muratpaşa · Antalya
 * Kargo bu üçünü ayrı ayrı istiyor; kullanıcı adresi zaten yukarıda seçtiği için
 * ikinci kez elle yazdırmak hem yorucu hem hata kaynağı.
 */
function parseTrAddress(addr: string): { il: string; ilce: string; zip: string } {
  const out = { il: '', ilce: '', zip: '' };
  const tail = (addr ?? '').split(',').pop()?.trim() ?? '';
  const m = tail.match(/^(?:(\d{5})\s+)?([^/]+?)\s*\/\s*(.+)$/);
  if (!m) return out;
  out.zip = m[1] ?? '';
  const ilce = m[2].trim();
  const il   = m[3].trim();
  const ilMatch = ILLER.find(x => norm(x) === norm(il));
  if (ilMatch) {
    out.il = ilMatch;
    out.ilce = (ILCELER[ilMatch] ?? []).find(x => norm(x) === norm(ilce)) ?? ilce;
  } else {
    out.il = il; out.ilce = ilce;
  }
  return out;
}

type Direction = 'lab_to_other' | 'other_to_lab';
type Carrier = 'internal' | 'bbk' | 'shipink';
interface ShpCard { id: string; default?: boolean; [k: string]: any }
interface ShpRate { carrier_service_id: string; provider?: string; carrier_account_id?: string;
                    name?: string; price?: number; currency?: string; carrier?: string }
/** Gönderi siparişe bağlanabilir ya da tamamen bağımsız olabilir. */
type Mode = 'order' | 'free';
interface CourierOption { id: string; full_name: string | null }
interface OrderOption { id: string; order_number: string | null; patient_name: string | null }

export function NewShipmentModal({
  visible, onClose, onCreated, accent,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (deliveryId: string) => void;
  accent: string;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const profile = useAuthStore(s => s.profile as any);
  const labId: string | null = profile?.lab_id ?? profile?.id ?? null;

  const [mode, setMode]           = useState<Mode>('order');
  const [orderQ, setOrderQ]       = useState('');
  const [orders, setOrders]       = useState<OrderOption[]>([]);
  const [orderSel, setOrderSel]   = useState<OrderOption | null>(null);
  /** Siparişli modda yön klinik uçludur; bağımsızda dış taraf uçlu. */
  const [orderDir, setOrderDir]   = useState<'lab_to_clinic' | 'clinic_to_lab'>('lab_to_clinic');
  const [direction, setDirection] = useState<Direction>('lab_to_other');
  const [partyName, setPartyName] = useState('');
  const [address, setAddress]     = useState('');
  const [addrSel, setAddrSel]     = useState<{ address: string; lat: string | null; lng: string | null } | null>(null);
  /** Programatik yazılan adres metni — bu metin için öneri listesi açılmaz. */
  const [addrSilent, setAddrSilent] = useState<string | null>(null);
  const [phone, setPhone]         = useState('');
  const [notes, setNotes]         = useState('');
  const [fee, setFee]             = useState('');
  const [carrier, setCarrier]     = useState<Carrier>('internal');
  // BanaBiKurye — araç tipi ve hizmet tipi sunucuda varsayılıyor (motor/standard);
  // burada yalnız ağırlık ve fiyat tutulur.
  const [bbkWeight, setBbkWeight] = useState('1');
  const [bbkPrice, setBbkPrice]   = useState<number | null>(null);
  // Shipink — yapılandırılmış adres (state=İL, city=İLÇE) ve paket ölçüsü ister.
  const [shpState, setShpState]   = useState('');
  const [shpCity, setShpCity]     = useState('');
  const [shpZip, setShpZip]       = useState('');
  // Shipink sipariş ucu e-posta bekliyor olabilir — siparişli akışta hekim
  // kaydından geliyor, serbest gönderide elle girilir.
  const [shpEmail, setShpEmail]   = useState('');
  // Bazı taşıyıcılar alıcının TCKN (11) / VKN (10) numarasını zorunlu tutuyor.
  // Siparişli modda boş bırakılırsa sunucu klinik VKN / hekim TCKN'sinden doldurur.
  const [shpTaxId, setShpTaxId]   = useState('');
  // Kart seçimi ZORUNLU olarak kullanıcıya bırakıldı: fonksiyon yalnız varsayılan
  // (yoksa listedeki ilk) kartı deniyordu, yeni eklenen kart hiç denenmiyordu.
  const [shpCards, setShpCards]   = useState<ShpCard[]>([]);
  const [shpCardId, setShpCardId] = useState<string | null>(null);
  // Varsayılan BAKİYE: Shipink 250 TL üstü kart çekimini 3D Secure'a düşürüyor,
  // API'den tamamlanamıyor. Kart yalnız küçük tutarlar için bilinçli seçilir.
  const [shpPayWith, setShpPayWith] = useState<'balance' | 'card'>('balance');
  const [shpW, setShpW]           = useState('1');
  const [shpL, setShpL]           = useState('20');
  const [shpB, setShpB]           = useState('15');
  const [shpH, setShpH]           = useState('10');
  const [shpRates, setShpRates]   = useState<ShpRate[]>([]);
  const [shpService, setShpService] = useState<string | null>(null);
  const [err, setErr]             = useState<string | null>(null);
  const [couriers, setCouriers]   = useState<CourierOption[]>([]);
  const [courierId, setCourierId] = useState<string | null>(null);
  const [busy, setBusy]           = useState(false);

  useEffect(() => {
    if (!visible || !labId) return;
    // Kurye listesi: labın kendi kuryeleri (DeliveryModal ile aynı kural).
    supabase.from('profiles').select('id, full_name')
      .eq('user_type', 'lab').eq('role', 'courier')
      .or(`id.eq.${labId},lab_id.eq.${labId}`)
      .then(({ data }) => setCouriers((data ?? []) as CourierOption[]));
  }, [visible, labId]);

  // Sipariş arama: numara ya da hasta adı. Kapalı siparişler de aranabilir —
  // teslim sonrası ek gönderi (unutulan parça) gerçek bir ihtiyaç.
  useEffect(() => {
    if (!visible || mode !== 'order') return;
    const q = orderQ.trim();
    const h = setTimeout(async () => {
      let qq = supabase.from('work_orders')
        .select('id, order_number, patient_name')
        .order('created_at', { ascending: false }).limit(20);
      if (q.length >= 2) qq = qq.or(`order_number.ilike.%${q}%,patient_name.ilike.%${q}%`);
      const { data } = await qq;
      setOrders((data ?? []) as OrderOption[]);
    }, 250);
    return () => clearTimeout(h);
  }, [visible, mode, orderQ]);

  // Shipink kartları — yalnız kargo modunda ve bir kez.
  useEffect(() => {
    if (!visible || carrier !== 'shipink' || shpCards.length) return;
    supabase.functions.invoke('shipink-dispatch', { body: { action: 'cards' } })
      .then(({ data }) => {
        const d = data as any;
        if (!d?.ok) return;
        const list = (d.cards ?? []) as ShpCard[];
        setShpCards(list);
        setShpCardId(prev => prev ?? (list.find(c => c.default)?.id ?? list[0]?.id ?? null));
      })
      .catch(() => { /* kart listesi opsiyonel — seçilmezse sunucu varsayılanı dener */ });
  }, [visible, carrier, shpCards.length]);

  function reset() {
    setMode('order'); setOrderQ(''); setOrderSel(null); setOrderDir('lab_to_clinic');
    setDirection('lab_to_other'); setPartyName(''); setAddress(''); setAddrSel(null); setAddrSilent(null);
    setPhone(''); setNotes(''); setFee(''); setCourierId(null);
    setCarrier('internal'); setBbkPrice(null); setBbkWeight('1');
    setShpState(''); setShpCity(''); setShpZip(''); setShpEmail(''); setShpTaxId(''); setShpRates([]); setShpService(null);
    setErr(null);
  }


  /**
   * Edge fonksiyonlarının bildiği yön sözlüğü yalnız lab_to_clinic / clinic_to_lab.
   * Serbest gönderinin yeni değerleri oraya çevrilmeli; aksi hâlde "alım" yönü
   * teslim sanılıp kurye ters uca gönderilir.
   */
  function apiDirection(): 'lab_to_clinic' | 'clinic_to_lab' {
    const d = mode === 'order' ? orderDir : direction;
    return (d === 'clinic_to_lab' || d === 'other_to_lab') ? 'clinic_to_lab' : 'lab_to_clinic';
  }

  /** Siparişli modda adresi sunucu siparişten çözer; bağımsızda biz veririz. */
  function destBody() {
    if (mode === 'order') return { work_order_id: orderSel?.id };
    const addr = (addrSel?.address ?? address).trim();
    return {
      dest_name:    partyName.trim() || undefined,
      dest_address: addr || undefined,
      dest_lat:     addrSel?.lat ?? undefined,
      dest_lng:     addrSel?.lng ?? undefined,
      dest_phone:   phone.trim() || undefined,
    };
  }

  function commonFields() {
    const feeNum = fee.trim() ? Number(fee.trim().replace(',', '.')) : null;
    return {
      workOrderId: mode === 'order' ? orderSel!.id : null,
      direction: (mode === 'order' ? orderDir : direction) as any,
      purpose: (mode === 'order' ? 'teslimat' : 'diger') as any,
      notes: notes.trim() || undefined,
      ...(mode === 'free' ? {
        partyName: partyName.trim(),
        partyAddress: (addrSel?.address ?? address).trim(),
        partyPhone: phone.trim() || undefined,
        partyLat: addrSel?.lat ? Number(addrSel.lat) : null,
        partyLng: addrSel?.lng ? Number(addrSel.lng) : null,
      } : {}),
      manualFee: feeNum != null && isFinite(feeNum) ? feeNum : null,
    };
  }

  /**
   * Fiyat, girilen bilgiye bağlı. Adres/ölçü/alıcı değişince eldeki tarife
   * geçersizdir — temizlenmezse buton "Gönderi oluştur"da kilitli kalıyor ve
   * kullanıcı yanlış bilgiyle aldığı fiyattan çıkamıyordu.
   */
  function invalidateQuote() {
    if (bbkPrice != null) setBbkPrice(null);
    if (shpRates.length) { setShpRates([]); setShpService(null); }
    if (err) setErr(null);
  }

  /** Ortak ön koşullar — taşıyıcıdan bağımsız. */
  function guard(): boolean {
    setErr(null);
    if (mode === 'order' && !orderSel) { toast.error(autoT('Sipariş seçin.')); return false; }
    if (mode === 'free') {
      const addr = (addrSel?.address ?? address).trim();
      if (!partyName.trim() || !addr) { toast.error(autoT('Karşı taraf adı ve adres zorunlu.')); return false; }
    }
    return true;
  }

  /** BanaBiKurye — fiyat hesapla (kurye ÇAĞIRMAZ, ücretsiz). */
  async function bbkCalculate() {
    if (!guard()) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.functions.invoke('banabikurye-dispatch', {
      body: {
        action: 'calculate', direction: apiDirection(),
        notes: notes.trim() || undefined,
        total_weight_kg: Number(bbkWeight) || 1,
        ...destBody(),
      },
    });
    setBusy(false);
    const d = data as any;
    if (error || !d?.ok) { setErr(d?.message ?? error?.message ?? autoT('Fiyat alınamadı')); return; }
    setBbkPrice(Number(d.price));
  }

  /** BanaBiKurye — kuryeyi ÇAĞIRIR ve teslimat kaydını açar. */
  async function bbkCreate() {
    if (!guard()) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.functions.invoke('banabikurye-dispatch', {
      body: {
        action: 'create', direction: apiDirection(),
        notes: notes.trim() || undefined,
        total_weight_kg: Number(bbkWeight) || 1,
        ...destBody(),
      },
    });
    const d = data as any;
    if (error || !d?.ok) { setBusy(false); setErr(d?.message ?? error?.message ?? autoT('Kurye çağrılamadı')); return; }
    const orderId = d.order_id ?? d.order_name ?? null;
    // BanaBiKurye ₺ ile çalışır → para birimi TRY sabit. Fiyat API'den SAYI gelir;
    // TR metin ayrıştırıcısı noktayı binlik sanıp 100× şişirir — Number kullan.
    const c = commonFields();
    const price = Number(d.price ?? bbkPrice);
    const res = await createDelivery({
      ...c, mode: 'external', externalProvider: 'banabikurye',
      externalTrackingNo: orderId ? String(orderId) : undefined,
      feeAmount: isFinite(price) && price >= 0 ? price : c.manualFee,
      feeCurrency: 'TRY', feeSource: 'banabikurye',
    });
    setBusy(false);
    if (!res.ok) { setErr(autoT('Kurye çağrıldı ama teslimat kaydı açılmadı: ') + (res.error ?? '')); return; }
    toast.success(autoT('Kurye çağrıldı.'));
    reset(); onCreated(res.deliveryId!);
  }

  function shpBody() {
    return {
      direction: apiDirection(),
      note: notes.trim() || undefined,
      ...(mode === 'order' ? { work_order_id: orderSel?.id } : {
        recipient_name:   partyName.trim() || undefined,
        recipient_phone:  phone.trim() || undefined,
        recipient_email:  shpEmail.trim() || undefined,
        recipient_street: (addrSel?.address ?? address).trim() || undefined,
      }),
      recipient_tax_id: shpTaxId.replace(/\D/g, '') || undefined,
      recipient_state: shpState.trim() || undefined,   // İL
      recipient_city:  shpCity.trim()  || undefined,   // İLÇE
      recipient_zip:   shpZip.trim()   || undefined,
      packages: [{ weight: Number(shpW) || 1, length: Number(shpL) || 20,
                   width: Number(shpB) || 15, height: Number(shpH) || 10 }],
    };
  }

  /** Shipink — taşıyıcı fiyatlarını sorgular (gönderi OLUŞTURMAZ). */
  async function shpFetchRates() {
    if (!guard()) return;
    if (!shpState.trim() || !shpCity.trim()) {
      toast.error(autoT('Kargo için alıcının ili ve ilçesi zorunlu.')); return;
    }
    setBusy(true); setErr(null);
    const { data, error } = await supabase.functions.invoke('shipink-dispatch', {
      body: { action: 'rates', ...shpBody() },
    });
    setBusy(false);
    const d = data as any;
    if (error || !d?.ok) { setErr(d?.message ?? error?.message ?? autoT('Fiyat alınamadı')); return; }
    const rates = (d.rates ?? []) as ShpRate[];
    setShpRates(rates);
    if (rates.length) setShpService(String(rates[0].carrier_service_id));
  }

  /** Shipink — gönderiyi oluşturur ve teslimat kaydını açar. */
  async function shpCreate() {
    const tax = shpTaxId.replace(/\D/g, '');
    if (tax && tax.length !== 10 && tax.length !== 11) {
      toast.error(autoT('TC kimlik no 11, vergi no 10 haneli olmalı.')); return;
    }
    const rate = shpRates.find(r => String(r.carrier_service_id) === shpService) ?? null;
    if (!rate) { toast.error(autoT('Taşıyıcı seçin.')); return; }
    setBusy(true); setErr(null);
    const { data, error } = await supabase.functions.invoke('shipink-dispatch', {
      body: {
        action: 'create', carrier_service_id: shpService,
        carrier_account_id: rate.carrier_account_id ?? undefined,
        carrier_provider:   rate.provider ?? undefined,
        pay_with:           shpPayWith,
        card_id:            shpPayWith === 'card' ? (shpCardId ?? undefined) : undefined,
        ...shpBody(),
      },
    });
    const d = data as any;
    if (error || !d?.ok) {
      setBusy(false);
      // Yukarı taraftan gelen ayrıntı (hangi alan reddedildi) kaybolmasın.
      // dbg() şekli: { status, resp, sent, + teşhis alanları }. Yalnız "resp"
      // gösterilirse kart/hesap teşhisi kaybolur — ikisini birlikte yaz.
      const dg = d?.debug ?? null;
      const diag = dg && (dg.used_card_id !== undefined || dg.carrier_account_id !== undefined)
        ? `ödeme=${dg.pay_with ?? '-'} · kart=${dg.used_card_id ?? '-'} · kart_gerekli=${dg.needs_card ? 'evet' : 'hayır'} · hesap=${dg.carrier_account_id ?? '-'} · vergi_no_hane=${dg.tax_id_len ?? '-'} · gönderildi=${dg.tax_id_sent ? 'evet' : 'hayır'}`
        : null;
      const detail = [
        dg?.resp ? (typeof dg.resp === 'string' ? dg.resp : JSON.stringify(dg.resp)) : null,
        diag,
      ].filter(Boolean).join('\n') || null;
      setErr((d?.message ?? error?.message ?? autoT('Gönderi oluşturulamadı.'))
             + (detail ? `\n${detail.slice(0, 700)}` : ''));
      return;
    }
    const c = commonFields();
    const price = Number(d.price ?? rate.price);
    const hasFee = isFinite(price) && price >= 0;
    const res = await createDelivery({
      ...c, mode: 'external', externalProvider: 'Shipink',
      externalTrackingNo: d.tracking_number ? String(d.tracking_number) : undefined,
      feeAmount: hasFee ? price : c.manualFee,
      feeCurrency: hasFee ? String(d.currency ?? rate.currency ?? 'TRY') : null,
      feeSource: hasFee ? 'shipink' : undefined,
    });
    if (!res.ok) { setBusy(false); setErr(autoT('Gönderi oluştu ama teslimat kaydı açılmadı: ') + (res.error ?? '')); return; }
    // İptal ve etiket uçları takip numarasını DEĞİL Shipink'in kendi id'sini ister.
    if (d.shipment_id || d.label_url) {
      await supabase.from('deliveries').update({
        external_tracking_code: d.shipment_id ? String(d.shipment_id) : null,
        external_label_url:     d.label_url ?? null,
      }).eq('id', res.deliveryId!);
    }
    setBusy(false);
    toast.success(autoT('Gönderi oluşturuldu.'));
    reset(); onCreated(res.deliveryId!);
  }

  async function submit() {
    const name = partyName.trim();
    const addr = (addrSel?.address ?? address).trim();
    if (mode === 'order' && !orderSel) { toast.error(autoT('Sipariş seçin.')); return; }
    if (mode === 'free' && (!name || !addr)) {
      toast.error(autoT('Karşı taraf adı ve adres zorunlu.')); return;
    }
    if (!courierId) { toast.error(autoT('Kurye seçin.')); return; }

    setBusy(true);
    const feeNum = fee.trim() ? Number(fee.trim().replace(',', '.')) : null;
    // Siparişli modda adres/alıcı SUNUCUDA siparişin hekim-klinik kaydından
    // çözülür; party_* alanları gönderilmez.
    const res = await createDelivery({
      workOrderId: mode === 'order' ? orderSel!.id : null,
      mode: 'internal',
      courierId,
      direction: mode === 'order' ? orderDir : direction,
      purpose: mode === 'order' ? 'teslimat' : 'diger',
      notes: notes.trim() || undefined,
      ...(mode === 'free' ? {
        partyName: name,
        partyAddress: addr,
        partyPhone: phone.trim() || undefined,
        partyLat: addrSel?.lat ? Number(addrSel.lat) : null,
        partyLng: addrSel?.lng ? Number(addrSel.lng) : null,
      } : {}),
      feeAmount: feeNum != null && isFinite(feeNum) ? feeNum : null,
      feeSource: feeNum != null && isFinite(feeNum) ? 'manuel' : undefined,
    });
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? autoT('Gönderi oluşturulamadı.')); return; }
    toast.success(autoT('Gönderi oluşturuldu.'));
    reset();
    onCreated(res.deliveryId!);
  }

  const inputStyle = {
    borderWidth: 1, borderColor: T.hairline, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13,
    color: T.ink, backgroundColor: isDark ? T.cardSoft : '#FFFFFF',
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } as any : {}),
  };
  const label = { fontSize: 11, fontWeight: '600' as const, color: T.ink2, marginBottom: 5 };

  const isOut = direction === 'lab_to_other';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Arka plan bulanık — kurye haritası altta hareketli olduğu için düz
          koyu perde yetmiyordu, form üzerinde odak kalmıyordu. */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center',
                     backgroundColor: 'rgba(10,14,26,0.52)', padding: 16,
                     ...(Platform.OS === 'web'
                       ? { backdropFilter: 'blur(10px) saturate(120%)',
                           WebkitBackdropFilter: 'blur(10px) saturate(120%)' } as any
                       : null) }}>
        <View style={{ width: '100%', maxWidth: 480, maxHeight: '88%', borderRadius: 22,
                       backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline, overflow: 'hidden' }}>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                         paddingHorizontal: 16, paddingVertical: 13,
                         borderBottomWidth: 1, borderBottomColor: T.hairline }}>
            <Truck size={16} color={accent} strokeWidth={1.8} />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: T.ink }}>
              {autoT('Yeni gönderi')}
            </Text>
            <Pressable onPress={onClose} hitSlop={8}
              style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}>
              <X size={16} color={T.ink3} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
            {/* Mod — siparişe bağlı mı, bağımsız mı */}
            <View style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 999,
                           backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)' }}>
              {([
                { v: 'order' as const, t: 'Siparişe bağlı' },
                { v: 'free'  as const, t: 'Bağımsız gönderi' },
              ]).map(({ v, t }) => {
                const on = mode === v;
                return (
                  <Pressable key={v} onPress={() => setMode(v)}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999,
                             backgroundColor: on ? (isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF') : 'transparent',
                             ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                    <Text style={{ fontSize: 12.5, fontWeight: on ? '700' : '500', color: on ? T.ink : T.ink3 }}>
                      {autoT(t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Yön — siparişli modda klinik uçlu, bağımsızda dış taraf uçlu */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(mode === 'order'
                ? [{ v: 'lab_to_clinic', t: 'Kliniğe teslim', Icon: ArrowUpRight },
                   { v: 'clinic_to_lab', t: 'Klinikten alım', Icon: ArrowDownLeft }]
                : [{ v: 'lab_to_other',  t: 'Gönderi', Icon: ArrowUpRight },
                   { v: 'other_to_lab',  t: 'Alım',    Icon: ArrowDownLeft }]
              ).map(({ v, t, Icon }) => {
                const on = mode === 'order' ? orderDir === v : direction === v;
                return (
                  <Pressable key={v}
                    onPress={() => mode === 'order'
                      ? setOrderDir(v as 'lab_to_clinic' | 'clinic_to_lab')
                      : setDirection(v as Direction)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                             gap: 6, paddingVertical: 9, borderRadius: 999, borderWidth: 1,
                             borderColor: on ? accent : T.hairline,
                             backgroundColor: on ? `${accent}1A` : 'transparent',
                             ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                    <Icon size={13} color={on ? accent : T.ink3} strokeWidth={1.9} />
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? accent : T.ink2 }}>
                      {autoT(t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* SİPARİŞE BAĞLI: sipariş seç — adres sunucuda siparişten çözülür */}
            {mode === 'order' && (
              <View>
                <Text style={label}>{autoT('Sipariş')}</Text>
                {orderSel ? (
                  <Pressable onPress={() => setOrderSel(null)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11,
                             borderRadius: 14, borderWidth: 1, borderColor: accent,
                             backgroundColor: `${accent}14`,
                             ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: T.ink }}>
                      #{orderSel.order_number ?? '—'}
                      <Text style={{ fontWeight: '400', color: T.ink2 }}>
                        {orderSel.patient_name ? `  ·  ${orderSel.patient_name}` : ''}
                      </Text>
                    </Text>
                    <X size={14} color={T.ink3} strokeWidth={2} />
                  </Pressable>
                ) : (
                  <>
                    <TextInput value={orderQ} onChangeText={setOrderQ} style={inputStyle}
                      placeholder={autoT('Sipariş no ya da hasta adı')} placeholderTextColor={T.ink3} />
                    <View style={{ marginTop: 6, maxHeight: 168, borderRadius: 14, borderWidth: orders.length ? 1 : 0,
                                   borderColor: T.hairline, overflow: 'hidden' }}>
                      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {orders.map(o => (
                          <Pressable key={o.id} onPress={() => { setOrderSel(o); invalidateQuote(); }}
                            style={{ paddingHorizontal: 12, paddingVertical: 9,
                                     borderBottomWidth: 1, borderBottomColor: T.hairline,
                                     ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                            <Text style={{ fontSize: 12.5, color: T.ink }}>
                              #{o.order_number ?? '—'}
                              <Text style={{ color: T.ink3 }}>
                                {o.patient_name ? `  ·  ${o.patient_name}` : ''}
                              </Text>
                            </Text>
                          </Pressable>
                        ))}
                        {orders.length === 0 && (
                          <Text style={{ fontSize: 12, color: T.ink3, paddingVertical: 6 }}>
                            {autoT('Sipariş bulunamadı.')}
                          </Text>
                        )}
                      </ScrollView>
                    </View>
                  </>
                )}
                <Text style={{ fontSize: 10.5, color: T.ink3, marginTop: 5 }}>
                  {autoT('Adres siparişin hekim/kliniğinden otomatik alınır.')}
                </Text>
              </View>
            )}

            {mode === 'free' && (
            // Kayıtlı tedarikçi/klinik/hekim arasından seçilirse adres ve telefon
            // birlikte dolar; eşleşme yoksa alan serbest metin olarak kalır.
            <View style={{ zIndex: 30 }}>
              <Text style={label}>{autoT(isOut ? 'Alıcı adı' : 'Gönderen adı')}</Text>
              <PartyPickerField
                value={partyName}
                onChangeText={(v) => { setPartyName(v); invalidateQuote(); }}
                onPick={(h) => {
                  setPartyName(h.name);
                  if (h.phone) setPhone(h.phone);
                  if (h.address) {
                    // Konum bilgisi yok (kayıtta enlem/boylam tutulmuyor) → adres
                    // metni yazılır, addrSel boş bırakılır. Kullanıcı isterse
                    // adres alanından tekrar seçip koordinatı da ekleyebilir.
                    setAddress(h.address);
                    setAddrSel(null);
                    // Bu metin programatik yazıldı → adres alanı kendiliğinden
                    // öneri listesi açmasın (kullanıcı yazmaya başlayınca açılır).
                    setAddrSilent(h.address);
                    const g = parseTrAddress(h.address);
                    if (g.il)   setShpState(g.il);
                    if (g.ilce) setShpCity(g.ilce);
                    if (g.zip)  setShpZip(g.zip);
                  }
                  invalidateQuote();
                }}
                placeholder={autoT('Ör. Dentsply Sirona Türkiye')}
                inputStyle={inputStyle}
                accentColor={accent}
              />
            </View>
            )}

            {mode === 'free' && (
            <View style={{ zIndex: 20 }}>
              <Text style={label}>{autoT(isOut ? 'Teslim adresi' : 'Alım adresi')}</Text>
              <AddressAutocompleteField
                value={address}
                silentValue={addrSilent}
                onChangeText={(v) => { setAddress(v); setAddrSel(null); setAddrSilent(null); invalidateQuote(); }}
                onSelect={(a, lat, lng) => {
                  setAddress(a); setAddrSel({ address: a, lat, lng }); setAddrSilent(null); invalidateQuote();
                  // Kargo alanlarını adresten doldur — kullanıcı aynı bilgiyi
                  // ikinci kez yazmasın. Elle değiştirmek serbest.
                  const g = parseTrAddress(a);
                  if (g.il)   setShpState(g.il);
                  if (g.ilce) setShpCity(g.ilce);
                  if (g.zip)  setShpZip(g.zip);
                }}
                placeholder={autoT('Adres ara')}
                inputStyle={inputStyle}
                accentColor={accent}
              />
            </View>
            )}

            {mode === 'free' && (
            <View>
              <Text style={label}>{autoT('Telefon')}</Text>
              <TextInput value={phone} onChangeText={(v) => { setPhone(v); invalidateQuote(); }} style={inputStyle}
                keyboardType="phone-pad" placeholder="05XX XXX XX XX" placeholderTextColor={T.ink3} />
            </View>
            )}

            {/* Taşıyıcı */}
            <View>
              <Text style={label}>{autoT('Taşıyıcı')}</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {([
                  { v: 'internal' as const, t: 'Kendi kuryemiz' },
                  { v: 'bbk' as const,      t: 'BanaBiKurye' },
                  { v: 'shipink' as const,  t: 'Kargo' },
                ]).map(({ v, t }) => {
                  const on = carrier === v;
                  return (
                    <Pressable key={v} onPress={() => { setCarrier(v); setErr(null); setBbkPrice(null); setShpRates([]); }}
                      style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999, borderWidth: 1,
                               borderColor: on ? accent : T.hairline,
                               backgroundColor: on ? `${accent}1A` : 'transparent',
                               ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                      <Text style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? accent : T.ink2 }}>
                        {autoT(t)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* BanaBiKurye — araç tipi ve hizmet tipi sunucuda varsayılı (motor/standart) */}
            {carrier === 'bbk' && (
              <View>
                <Text style={label}>{autoT('Ağırlık (kg)')}</Text>
                <TextInput value={bbkWeight} onChangeText={(v) => { setBbkWeight(v); invalidateQuote(); }}
                  style={inputStyle} keyboardType="decimal-pad" placeholderTextColor={T.ink3} />
                {bbkPrice != null && (
                  <Text style={{ fontSize: 12.5, color: T.ink, marginTop: 8, fontWeight: '700' }}>
                    {autoT('Tahmini ücret')}: ₺{bbkPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                )}
              </View>
            )}

            {/* Kargo (Shipink) — yapılandırılmış adres + paket ölçüsü ister */}
            {carrier === 'shipink' && (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={label}>{autoT('İl')}</Text>
                    <GeoCombo
                      value={shpState}
                      options={ILLER}
                      placeholder="İstanbul"
                      onPick={(v) => { setShpState(v); setShpCity(''); invalidateQuote(); }}
                      inputStyle={inputStyle} T={T} accent={accent}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={label}>{autoT('İlçe')}</Text>
                    <GeoCombo
                      value={shpCity}
                      options={ILCELER[shpState] ?? []}
                      placeholder="Kadıköy"
                      onPick={(v) => { setShpCity(v); invalidateQuote(); }}
                      inputStyle={inputStyle} T={T} accent={accent}
                    />
                  </View>
                  <View style={{ width: 90 }}>
                    <Text style={label}>{autoT('Posta kodu')}</Text>
                    <TextInput value={shpZip} onChangeText={(v) => { setShpZip(v); invalidateQuote(); }} style={inputStyle}
                      keyboardType="number-pad" placeholderTextColor={T.ink3} />
                  </View>
                </View>
                <View>
                  <Text style={label}>{autoT('Alıcı e-postası')}</Text>
                  <TextInput value={shpEmail} onChangeText={(v) => { setShpEmail(v); invalidateQuote(); }}
                    style={inputStyle} keyboardType="email-address" autoCapitalize="none"
                    placeholder="ornek@firma.com" placeholderTextColor={T.ink3} />
                </View>
                <View>
                  <Text style={label}>{autoT('TC kimlik / Vergi no')}</Text>
                  <TextInput value={shpTaxId}
                    onChangeText={(v) => { setShpTaxId(v.replace(/\D/g, '').slice(0, 11)); invalidateQuote(); }}
                    style={inputStyle} keyboardType="number-pad" maxLength={11}
                    placeholder={mode === 'order' ? autoT('Boşsa klinik/hekim kaydından alınır') : '11 / 10 hane'}
                    placeholderTextColor={T.ink3} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {([['Ağırlık (kg)', shpW, setShpW], ['En (cm)', shpB, setShpB],
                     ['Boy (cm)', shpL, setShpL], ['Yükseklik (cm)', shpH, setShpH]] as const).map(([lbl, val, set]) => (
                    <View key={lbl} style={{ flex: 1 }}>
                      <Text style={label}>{autoT(lbl)}</Text>
                      <TextInput value={val} onChangeText={(v) => { (set as any)(v); invalidateQuote(); }} style={inputStyle}
                        keyboardType="decimal-pad" placeholderTextColor={T.ink3} />
                    </View>
                  ))}
                </View>
                {/* Ödeme kartı — Shipink kontratlı tarifelerde gönderi anında çekilir.
                    Seçim kullanıcıda: varsayılan kart bozuksa yenisine geçebilsin. */}
                <View>
                  <Text style={label}>{autoT('Ödeme')}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {([
                      { v: 'balance' as const, t: 'Bakiyeden öde' },
                      { v: 'card' as const,    t: 'Kartla öde' },
                    ]).map(({ v, t: lbl }) => {
                      const on = shpPayWith === v;
                      return (
                        <Pressable key={v} onPress={() => { setShpPayWith(v); setErr(null); }}
                          style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999, borderWidth: 1,
                                   borderColor: on ? accent : T.hairline,
                                   backgroundColor: on ? `${accent}1A` : 'transparent',
                                   ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                          <Text style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? accent : T.ink2 }}>
                            {autoT(lbl)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={{ fontSize: 10.5, color: T.ink3, marginTop: 4 }}>
                    {shpPayWith === 'balance'
                      ? autoT('Ücret önce Shipink bakiyenizden düşer; kart yine de güvence olarak eklenir. Bakiye yetersizse karttan çekilir.')
                      : autoT('250 TL üstü kart çekimleri 3D Secure ister ve API üzerinden tamamlanamaz.')}
                  </Text>
                </View>

                {shpPayWith === 'card' && shpCards.length > 0 && (
                  <View>
                    <Text style={label}>{autoT('Ödeme kartı')}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {shpCards.map(c => {
                        const on = shpCardId === c.id;
                        const name = c.alias ?? c.name ?? c.holder_name ?? c.title
                          ?? (c.last_four ? `**** ${c.last_four}` : null)
                          ?? (c.bin ? `${c.bin}…` : null)
                          ?? String(c.id).slice(0, 8);
                        return (
                          <Pressable key={String(c.id)} onPress={() => { setShpCardId(String(c.id)); setErr(null); }}
                            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
                                     borderColor: on ? accent : T.hairline,
                                     backgroundColor: on ? `${accent}1A` : 'transparent',
                                     ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                            <Text style={{ fontSize: 12, color: on ? accent : T.ink2, fontWeight: on ? '600' : '400' }}>
                              {String(name)}{c.default ? ` · ${autoT('varsayılan')}` : ''}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                {shpRates.length > 0 && (
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[label, { flex: 1 }]}>{autoT('Taşıyıcı seç')}</Text>
                      <Pressable onPress={() => { setShpRates([]); setShpService(null); void shpFetchRates(); }}
                        style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}>
                        <Text style={{ fontSize: 11.5, color: accent, fontWeight: '600' }}>
                          {autoT('Fiyatları yenile')}
                        </Text>
                      </Pressable>
                    </View>
                    <View style={{ gap: 6 }}>
                      {shpRates.map(r => {
                        const on = String(r.carrier_service_id) === shpService;
                        return (
                          <Pressable key={String(r.carrier_service_id)} onPress={() => setShpService(String(r.carrier_service_id))}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12,
                                     borderWidth: 1, borderColor: on ? accent : T.hairline,
                                     backgroundColor: on ? `${accent}14` : 'transparent',
                                     ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 12.5, color: T.ink }}>
                                {/* provider alanı entegrasyonun adı ('shipink') — taşıyıcı adı `name`de */}
                                {r.name ?? r.carrier ?? autoT('Taşıyıcı')}
                              </Text>
                              {/* provider='shipink' → Shipink'in kendi kontratı: gönderi anında
                                  karttan çekim yapılır. Kendi anlaşmanla gelen tarifelerde olmaz. */}
                              {String(r.provider ?? '').toLowerCase() === 'shipink' && (
                                <Text style={{ fontSize: 10.5, color: T.ink3, marginTop: 2 }}>
                                  {autoT('Shipink kontratı · karttan çekim yapılır')}
                                </Text>
                              )}
                            </View>
                            <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? accent : T.ink2 }}>
                              {r.price != null ? `${(Number(r.price) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${r.currency ?? 'TRY'}` : '—'}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            )}

            {carrier === 'internal' && (
            <View>
              <Text style={label}>{autoT('Kurye')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {couriers.length === 0 ? (
                  <Text style={{ fontSize: 12, color: T.ink3 }}>{autoT('Kayıtlı kurye yok.')}</Text>
                ) : couriers.map(c => {
                  const on = courierId === c.id;
                  return (
                    <Pressable key={c.id} onPress={() => setCourierId(on ? null : c.id)}
                      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
                               borderColor: on ? accent : T.hairline,
                               backgroundColor: on ? `${accent}1A` : 'transparent',
                               ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                      <Text style={{ fontSize: 12.5, color: on ? accent : T.ink2, fontWeight: on ? '600' : '400' }}>
                        {c.full_name ?? autoT('Kurye')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            )}

            <View>
              <Text style={label}>{autoT('İçerik / not')}</Text>
              <TextInput value={notes} onChangeText={setNotes} style={[inputStyle, { minHeight: 60 }]}
                multiline placeholder={autoT('Ör. 2 kutu scan body, iade')} placeholderTextColor={T.ink3} />
            </View>

            {carrier === 'internal' && (
            <View>
              <Text style={label}>{autoT('Kurye ücreti')}</Text>
              <TextInput value={fee} onChangeText={setFee} style={inputStyle}
                keyboardType="decimal-pad" placeholder="0" placeholderTextColor={T.ink3} />
              <Text style={{ fontSize: 10.5, color: T.ink3, marginTop: 4 }}>
                {autoT('Girilirse giderlere kurye masrafı olarak düşer.')}
              </Text>
            </View>
            )}

            {!!err && (
              <View style={{ padding: 10, borderRadius: 12, backgroundColor: 'rgba(220,38,38,0.10)',
                             borderWidth: 1, borderColor: 'rgba(220,38,38,0.35)' }}>
                <Text style={{ fontSize: 12, color: '#DC2626' }}>{err}</Text>
              </View>
            )}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 8, padding: 14,
                         borderTopWidth: 1, borderTopColor: T.hairline }}>
            <Pressable onPress={onClose} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
                         borderWidth: 1, borderColor: T.hairline,
                         ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <Text style={{ fontSize: 13, color: T.ink2 }}>{autoT('Vazgeç')}</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            {/* Dış taşıyıcıda akış iki adımlı: önce ücretsiz fiyat sorgusu,
                sonra gerçek çağrı. Buton hangi adımdaysa onu yazar. */}
            <Pressable
              onPress={() => {
                if (carrier === 'internal') { void submit(); return; }
                if (carrier === 'bbk')      { void (bbkPrice == null ? bbkCalculate() : bbkCreate()); return; }
                void (shpRates.length === 0 ? shpFetchRates() : shpCreate());
              }}
              disabled={busy}
              // Genişlik SABİT: gösterge koşullu eklenince buton büyüyordu; ayrıca
              // etiket ("Fiyat sorgula" → "İşleniyor…") kısalıp uzadıkça da oynuyordu.
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                       paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, minWidth: 176,
                       backgroundColor: accent, opacity: busy ? 0.5 : 1,
                       ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              {/* İkon yuvası hep aynı ölçüde — gösterge girip çıkarken buton oynamasın */}
              <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
                {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                {carrier === 'internal' ? autoT('Gönderi oluştur')
                  : carrier === 'bbk'   ? (bbkPrice == null ? autoT('Fiyat hesapla') : autoT('Kurye çağır'))
                                        : (shpRates.length === 0 ? autoT('Fiyat sorgula') : autoT('Gönderi oluştur'))}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * GeoCombo — aranabilir il/ilçe seçici.
 *
 * Liste AÇILIR KUTU değil, alanın altına akan satırlar: modal + ScrollView
 * içinde mutlak konumlu bir liste kırpılıyor. Yazarken süzer, seçilince kapanır;
 * listede olmayan bir değer de elle yazılabilir (adresten gelen ilçe her zaman
 * veri setiyle birebir eşleşmeyebiliyor).
 */
function GeoCombo({
  value, options, placeholder, onPick, inputStyle, T, accent,
}: {
  value: string;
  options: string[];
  placeholder?: string;
  onPick: (v: string) => void;
  inputStyle: any;
  T: any;
  accent: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);

  const list = React.useMemo(() => {
    const needle = norm(q);
    const base = needle ? options.filter(o => norm(o).includes(needle)) : options;
    return base.slice(0, 8);
  }, [q, options]);

  return (
    <View>
      <TextInput
        value={open ? q : value}
        onChangeText={(v) => { setQ(v); setOpen(true); onPick(v); }}
        onFocus={() => { setQ(value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={inputStyle}
        placeholder={placeholder}
        placeholderTextColor={T.ink3}
      />
      {open && list.length > 0 && (
        <View style={{ marginTop: 4, borderRadius: 12, borderWidth: 1, borderColor: T.hairline,
                       overflow: 'hidden', maxHeight: 176 }}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {list.map(o => (
              <Pressable
                key={o}
                onPress={() => { onPick(o); setQ(o); setOpen(false); }}
                style={{ paddingHorizontal: 11, paddingVertical: 8,
                         borderBottomWidth: 1, borderBottomColor: T.hairline,
                         ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
              >
                <Text style={{ fontSize: 12.5, color: norm(o) === norm(value) ? accent : T.ink }}>{o}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
