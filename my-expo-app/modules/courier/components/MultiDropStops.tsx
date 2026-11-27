/**
 * MultiDropStops — BanaBiKurye çok noktalı gönderinin durak listesi.
 *
 * Tek kurye labdan bir kez alır, N farklı adrese teslim eder. Her durak ya bir
 * SİPARİŞ (adres/alıcı sunucuda siparişin hekim-kliniğinden çözülür; teslim edilince
 * yalnız o iş kapanır) ya da SERBEST bir adrestir (ad + adres + telefon formdan).
 *
 * Sıra kullanıcınındır (acil olan önce). "Rotayı BanaBiKurye sıralasın" açılırsa
 * sağlayıcı sırayı kendisi optimize eder — eşleme sıraya değil nokta kimliğine
 * dayandığı için güvenli.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, Platform } from 'react-native';
import { X, Plus, Search, MapPin, ClipboardList, ArrowUp } from '../../../core/ui/icons';
import { supabase } from '../../../lib/supabase';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { AddressAutocompleteField } from '../../integrations/components/AddressAutocompleteField';
import { PartyPickerField } from './PartyPickerField';

export interface StopOrder { id: string; order_number: string | null; patient_name: string | null }

export interface Stop {
  key: string;
  kind: 'order' | 'free';
  order?: StopOrder;
  name: string;
  address: string;
  sel: { address: string; lat: string | null; lng: string | null } | null;
  silent: string | null;
  phone: string;
  note: string;
}

export const MAX_STOPS = 98;

let seq = 0;
export function newStop(kind: 'order' | 'free', order?: StopOrder): Stop {
  seq += 1;
  return { key: `s${Date.now()}_${seq}`, kind, order, name: '', address: '', sel: null, silent: null, phone: '', note: '' };
}

/** Eksik alanı olan ilk durağın sıra numarası ve sebebi (yoksa null). */
export function stopsProblem(stops: Stop[]): string | null {
  if (stops.length < 2) return autoT('Çok noktalı gönderide en az 2 teslim noktası olmalı.');
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (s.kind === 'free') {
      const addr = (s.sel?.address ?? s.address).trim();
      if (!s.name.trim() || !addr) return `${i + 1}. ${autoT('nokta: alıcı adı ve adres zorunlu.')}`;
      if (!s.phone.trim()) return `${i + 1}. ${autoT('nokta: telefon zorunlu.')}`;
    }
  }
  return null;
}

/** Durak → banabikurye-dispatch `drops[]` öğesi. */
export function stopToDrop(s: Stop) {
  if (s.kind === 'order') {
    return { work_order_id: s.order!.id, note: s.note.trim() || undefined };
  }
  return {
    dest_name: s.name.trim(),
    dest_address: (s.sel?.address ?? s.address).trim(),
    dest_lat: s.sel?.lat ?? undefined,
    dest_lng: s.sel?.lng ?? undefined,
    dest_phone: s.phone.trim(),
    note: s.note.trim() || undefined,
  };
}

export function MultiDropStops({
  stops, onChange, optimize, onOptimize, accent, inputStyle, label,
}: {
  stops: Stop[];
  onChange: (next: Stop[]) => void;
  optimize: boolean;
  onOptimize: (v: boolean) => void;
  accent: string;
  inputStyle: any;
  label: any;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const web = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};
  const soft = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)';

  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StopOrder[]>([]);
  const [ready, setReady] = useState<StopOrder[]>([]);

  // Teslime hazır işler — tek dokunuşla durak olsun (çok noktalının asıl senaryosu).
  // Açık (bitmemiş) teslimatı olan iş listelenmez: ikinci kez kurye çağrılmasın.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('work_orders')
        .select('id, order_number, patient_name')
        .in('status', ['teslimata_hazir', 'kurye_bekleniyor'])
        .order('created_at', { ascending: false }).limit(20);
      const rows = (data ?? []) as StopOrder[];
      if (!rows.length) { if (alive) setReady([]); return; }
      const { data: open } = await supabase.from('deliveries').select('work_order_id')
        .in('work_order_id', rows.map(r => r.id))
        .not('status', 'in', '(teslim_edildi,iptal,iade)');
      const busy = new Set((open ?? []).map((d: any) => d.work_order_id));
      if (alive) setReady(rows.filter(r => !busy.has(r.id)).slice(0, 12));
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!adding) return;
    const term = q.trim();
    const h = setTimeout(async () => {
      let qq = supabase.from('work_orders').select('id, order_number, patient_name')
        .order('created_at', { ascending: false }).limit(8);
      if (term.length >= 2) qq = qq.or(`order_number.ilike.%${term}%,patient_name.ilike.%${term}%`);
      const { data } = await qq;
      setHits((data ?? []) as StopOrder[]);
    }, 250);
    return () => clearTimeout(h);
  }, [adding, q]);

  const usedIds = new Set(stops.filter(s => s.kind === 'order').map(s => s.order!.id));
  const full = stops.length >= MAX_STOPS;

  const set = (i: number, patch: Partial<Stop>) =>
    onChange(stops.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => onChange(stops.filter((_, j) => j !== i));
  const moveUp = (i: number) => {
    if (i === 0) return;
    const next = stops.slice();
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
  };
  const addOrder = (o: StopOrder) => {
    if (usedIds.has(o.id) || full) return;
    onChange([...stops, newStop('order', o)]);
    setAdding(false); setQ('');
  };

  const readyFree = ready.filter(o => !usedIds.has(o.id));

  const smallBtn = (onPress: () => void, Icon: any, text: string, disabled = false) => (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
               paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: T.hairline,
               opacity: disabled ? 0.4 : 1, ...web }}>
      <Icon size={13} color={T.ink2} strokeWidth={2} />
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: T.ink2 }}>{autoT(text)}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: T.ink3, letterSpacing: 1.1 }}>
          {autoT('TESLİM NOKTALARI')}
        </Text>
        <Text style={{ fontSize: 11, color: T.ink3, fontVariant: ['tabular-nums'] }}>
          {stops.length} / {MAX_STOPS}
        </Text>
      </View>
      <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: -4 }}>
        {autoT('Kurye laboratuvardan bir kez alır, sırayla her noktaya teslim eder. Ücret noktalara eşit bölünür.')}
      </Text>

      {stops.map((s, i) => {
        const title = s.kind === 'order'
          ? `#${s.order?.order_number ?? '—'}`
          : (s.name.trim() || autoT('Serbest adres'));
        const sub = s.kind === 'order'
          ? [s.order?.patient_name, autoT('adres siparişten')].filter(Boolean).join(' · ')
          : null;
        return (
          <View key={s.key} style={{ padding: 10, borderRadius: 14, backgroundColor: soft, gap: 8, zIndex: 200 - i * 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: accent,
                             alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#FFFFFF', fontVariant: ['tabular-nums'] }}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: T.ink }} numberOfLines={1}>{title}</Text>
                {sub ? <Text style={{ fontSize: 11.5, color: T.ink3 }} numberOfLines={1}>{sub}</Text> : null}
              </View>
              {i > 0 && !optimize ? (
                <Pressable onPress={() => moveUp(i)} hitSlop={6} accessibilityRole="button"
                  accessibilityLabel={autoT('Yukarı taşı')} style={{ padding: 4, ...web }}>
                  <ArrowUp size={14} color={T.ink3} strokeWidth={2} />
                </Pressable>
              ) : null}
              <Pressable onPress={() => remove(i)} hitSlop={6} accessibilityRole="button"
                accessibilityLabel={autoT('Noktayı kaldır')} style={{ padding: 4, ...web }}>
                <X size={14} color={T.ink3} strokeWidth={2.2} />
              </Pressable>
            </View>

            {s.kind === 'free' && (
              <>
                <View style={{ zIndex: 3 }}>
                  <PartyPickerField
                    value={s.name}
                    onChangeText={(v) => set(i, { name: v })}
                    onPick={(h) => set(i, {
                      name: h.name,
                      ...(h.phone ? { phone: h.phone } : {}),
                      ...(h.address ? { address: h.address, sel: null, silent: h.address } : {}),
                    })}
                    placeholder={autoT('Alıcı adı')}
                    inputStyle={inputStyle}
                    accentColor={accent}
                  />
                </View>
                <View style={{ zIndex: 2 }}>
                  <AddressAutocompleteField
                    value={s.address}
                    silentValue={s.silent}
                    onChangeText={(v) => set(i, { address: v, sel: null, silent: null })}
                    onSelect={(a, lat, lng) => set(i, { address: a, sel: { address: a, lat, lng }, silent: null })}
                    placeholder={autoT('Teslim adresi ara')}
                    inputStyle={inputStyle}
                    accentColor={accent}
                  />
                </View>
                <TextInput value={s.phone} onChangeText={(v) => set(i, { phone: v })} style={inputStyle}
                  keyboardType="phone-pad" placeholder={autoT('Alıcı telefonu')} placeholderTextColor={T.ink3} />
              </>
            )}
            <TextInput value={s.note} onChangeText={(v) => set(i, { note: v.slice(0, 250) })}
              style={[inputStyle, { paddingVertical: 8, fontSize: 12.5 }]}
              placeholder={autoT('Kuryeye not (isteğe bağlı)')} placeholderTextColor={T.ink3} />
          </View>
        );
      })}

      {/* Teslime hazır işler — tek dokunuşla durak */}
      {readyFree.length > 0 && !full && (
        <View>
          <Text style={label}>{autoT('Teslime hazır işler')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {readyFree.map(o => (
              <Pressable key={o.id} onPress={() => addOrder(o)} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6,
                         borderRadius: 999, borderWidth: 1, borderColor: T.hairline, ...web }}>
                <Plus size={11} color={accent} strokeWidth={2.4} />
                <Text style={{ fontSize: 12, color: T.ink2 }} numberOfLines={1}>
                  #{o.order_number ?? '—'}{o.patient_name ? ` · ${o.patient_name}` : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {adding && (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <TextInput value={q} onChangeText={setQ} autoFocus style={inputStyle}
                placeholder={autoT('Sipariş no ya da hasta adı')} placeholderTextColor={T.ink3} />
            </View>
            <Pressable onPress={() => { setAdding(false); setQ(''); }} hitSlop={6} style={{ padding: 4, ...web }}
              accessibilityRole="button" accessibilityLabel={autoT('Kapat')}>
              <X size={15} color={T.ink3} strokeWidth={2.2} />
            </Pressable>
          </View>
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: T.hairline, overflow: 'hidden' }}>
            {hits.filter(o => !usedIds.has(o.id)).length === 0 ? (
              <Text style={{ fontSize: 12, color: T.ink3, padding: 10 }}>{autoT('Sipariş bulunamadı.')}</Text>
            ) : hits.filter(o => !usedIds.has(o.id)).map((o, k) => (
              <Pressable key={o.id} onPress={() => addOrder(o)}
                style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 11, paddingVertical: 9,
                         borderTopWidth: k ? 1 : 0, borderTopColor: T.hairline, ...web }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }}>#{o.order_number ?? '—'}</Text>
                <Text style={{ flex: 1, fontSize: 13, color: T.ink2 }} numberOfLines={1}>{o.patient_name ?? ''}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {smallBtn(() => setAdding(true), Search, 'Sipariş ekle', full || adding)}
        {smallBtn(() => onChange([...stops, newStop('free')]), MapPin, 'Adres ekle', full)}
      </View>

      <Pressable onPress={() => onOptimize(!optimize)} accessibilityRole="switch" accessibilityState={{ checked: optimize }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: soft, ...web }}>
        <ClipboardList size={15} color={optimize ? accent : T.ink3} strokeWidth={1.9} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13, color: T.ink }}>{autoT('Rotayı BanaBiKurye sıralasın')}</Text>
          <Text style={{ fontSize: 11, color: T.ink3 }}>
            {autoT(optimize ? 'Sıra en kısa rotaya göre değişebilir.' : 'Kurye yukarıdaki sırayla gider.')}
          </Text>
        </View>
        <View style={{ width: 36, height: 22, borderRadius: 11, padding: 2,
                       backgroundColor: optimize ? accent : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.15)'),
                       alignItems: optimize ? 'flex-end' : 'flex-start' }}>
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' }} />
        </View>
      </Pressable>
    </View>
  );
}
