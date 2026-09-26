// PartyPickerField — gönderide karşı tarafı (alıcı / gönderen) kayıtlı
// kişilerden seçtiren ad alanı.
//
// NEDEN: bağımsız gönderide alıcı çoğu zaman zaten sistemde kayıtlı bir
// tedarikçi, klinik ya da hekim oluyordu; kullanıcı adı, adresi ve telefonu
// elle yeniden yazıyordu. Artık yazdıkça bunlar aranır, seçilince üç alan
// birden dolar. Eşleşme yoksa alan serbest metin olarak kalır — eskisi gibi
// elle girilir, hiçbir şey zorunlu hâle gelmez.
//
// KAPSAM: lab_id filtresi BİLEREK yok. Erişimi RLS belirliyor; klinikler
// `clinic_lab_memberships` üzerinden de bağlı olabildiği için elle lab_id
// filtrelemek bu kliniklerin önerilerden düşmesine yol açardı.
//
// Hekimde adres yok (doctors tablosunda kolon yok) → bağlı kliniğin adresi
// kullanılır.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Platform } from 'react-native';
import { Search, Building2, Stethoscope, Package } from '../../../core/ui/icons';
import { supabase } from '../../../core/api/supabase';
import { formatAddress } from '../../../core/util/formatAddress';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

export type PartyKind = 'supplier' | 'clinic' | 'doctor';

export interface PartyHit {
  kind: PartyKind;
  name: string;
  address: string | null;
  phone: string | null;
}

const KIND_META: Record<PartyKind, { label: string; icon: any }> = {
  supplier: { label: 'Tedarikçi', icon: Package },
  clinic:   { label: 'Klinik',    icon: Building2 },
  doctor:   { label: 'Hekim',     icon: Stethoscope },
};

/** Kayıtlı taraflarda ada göre arar. Hata durumunda boş liste döner — öneri
 *  gelmemesi kullanıcıyı durdurmaz, elle yazmaya devam eder. */
async function searchParties(q: string): Promise<PartyHit[]> {
  const like = `%${q}%`;
  const [sup, cli, doc] = await Promise.all([
    supabase.from('suppliers').select('name, address, phone')
      .ilike('name', like).or('is_active.eq.true,is_active.is.null').limit(5),
    supabase.from('clinics').select('name, address, phone')
      .ilike('name', like).or('is_active.eq.true,is_active.is.null').limit(5),
    supabase.from('doctors').select('full_name, phone, clinic_id')
      .ilike('full_name', like).or('is_active.eq.true,is_active.is.null').limit(5),
  ]);

  // Adres bazı kayıtlarda JSON string ({"il":…,"ilce":…}) olarak tutuluyor →
  // ham basılırsa küme parantezli çöp görünür. Paylaşılan formatAddress düz
  // metni aynen döndürdüğü için her iki biçim de güvenle geçer.
  const addr = (v: unknown) => formatAddress(v as any) || null;

  const out: PartyHit[] = [];
  for (const r of (sup.data ?? []) as any[]) {
    out.push({ kind: 'supplier', name: r.name, address: addr(r.address), phone: r.phone ?? null });
  }
  for (const r of (cli.data ?? []) as any[]) {
    out.push({ kind: 'clinic', name: r.name, address: addr(r.address), phone: r.phone ?? null });
  }

  // Hekimlerin adresi bağlı klinikten gelir — tek sorguda toplanır.
  const docs = (doc.data ?? []) as any[];
  if (docs.length) {
    const ids = Array.from(new Set(docs.map(d => d.clinic_id).filter(Boolean)));
    let addrOf: Record<string, string | null> = {};
    if (ids.length) {
      const { data: cs } = await supabase.from('clinics').select('id, address').in('id', ids);
      for (const c of (cs ?? []) as any[]) addrOf[c.id] = addr(c.address);
    }
    for (const d of docs) {
      out.push({
        kind: 'doctor',
        name: d.full_name,
        address: d.clinic_id ? (addrOf[d.clinic_id] ?? null) : null,
        phone: d.phone ?? null,
      });
    }
  }
  return out;
}

export function PartyPickerField({
  value, onChangeText, onPick, placeholder, inputStyle, accentColor,
}: {
  value: string;
  onChangeText: (v: string) => void;
  /** Bir kayıt seçildi — ad/adres/telefon birlikte gelir. */
  onPick: (hit: PartyHit) => void;
  placeholder?: string;
  inputStyle: any;
  accentColor: string;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [hits, setHits] = useState<PartyHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debRef = useRef<any>(null);
  // Seçimden sonra aynı metinle yeniden aramayı engelle (liste geri açılmasın).
  const pickedRef = useRef(false);

  useEffect(() => {
    if (pickedRef.current) { pickedRef.current = false; return; }
    const q = (value ?? '').trim();
    if (debRef.current) clearTimeout(debRef.current);
    if (q.length < 2) { setHits([]); setOpen(false); return; }
    debRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await searchParties(q);
        setHits(rows);
        setOpen(rows.length > 0);
      } catch {
        setHits([]); setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [value]);

  const pick = (h: PartyHit) => {
    pickedRef.current = true;
    onPick(h);
    setHits([]); setOpen(false);
  };

  const rowBg = isDark ? T.card : '#FFFFFF';
  const rowLine = isDark ? T.hairline : 'rgba(0,0,0,0.05)';

  return (
    <View style={{ position: 'relative' as any, zIndex: 30 }}>
      <View style={{ position: 'relative' as any }}>
        <TextInput
          style={[inputStyle, { paddingEnd: 34 }]}
          value={value ?? ''}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={T.ink3}
          autoCorrect={false}
        />
        <View style={{ position: 'absolute' as any, end: 12, top: 0, bottom: 0, justifyContent: 'center' }}>
          {loading
            ? <ActivityIndicator size="small" color={accentColor} />
            : <Search size={15} color={T.ink3} strokeWidth={1.9} />}
        </View>
      </View>

      {open && hits.length > 0 && (
        <View style={{
          marginTop: 4, borderRadius: 12, backgroundColor: rowBg,
          borderWidth: 1, borderColor: isDark ? T.hairline : 'rgba(0,0,0,0.08)',
          overflow: 'hidden',
          ...(Platform.OS === 'web'
            ? ({ boxShadow: '0 8px 24px rgba(0,0,0,0.14)' } as any)
            : { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 6 }),
        }}>
          {hits.map((h, i) => {
            const meta = KIND_META[h.kind];
            const Icon = meta.icon;
            return (
              <Pressable
                key={`${h.kind}-${h.name}-${i}`}
                onPress={() => pick(h)}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'flex-start', gap: 8,
                  paddingHorizontal: 12, paddingVertical: 10,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: rowLine,
                  backgroundColor: hovered ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)') : rowBg,
                  ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                })}
              >
                <Icon size={15} color={accentColor} strokeWidth={1.9} style={{ marginTop: 1 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: T.ink, flexShrink: 1 }} numberOfLines={1}>
                      {h.name}
                    </Text>
                    <View style={{
                      paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999,
                      backgroundColor: `${accentColor}1F`,
                    }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '700', color: accentColor }}>
                        {autoT(meta.label)}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 11.5, color: T.ink3, lineHeight: 15 }} numberOfLines={2}>
                    {h.address || autoT('Adres kayıtlı değil — elle girin')}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}
