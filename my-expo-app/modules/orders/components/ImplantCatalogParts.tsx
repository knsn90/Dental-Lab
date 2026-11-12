/**
 * Yeni sipariş formundaki implant marka/model seçicilerinin katalog parçaları.
 *
 *  - useImplantBrandNames: lab kataloğundaki markalar (yüklenemezse koddaki liste)
 *  - ImplantBrandAddRow:   listede yoksa "Bunu mu demek istediniz?" + "+ marka ekle"
 *  - ImplantModelField:    markanın modelleri (isteğe bağlı) + "+ model ekle"
 *
 * Ekleme sipariş girebilen herkese açık; sunucu aynı adı ikinci kez açmaz.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, Platform, ActivityIndicator } from 'react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import { Plus, Lightbulb, Check } from '../../../core/ui/icons';
import { useNOTokens, NORadius } from './NOTokens';
import { useImplantCatalog, addImplantBrand, addImplantModel } from '../implantCatalog';
import { catalogKey, cleanCatalogName, findByKey, suggestSimilar } from '../implantCatalogModel';

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {};

/**
 * Seçicide gösterilecek marka adları. `head` (ör. "Markası bilinmiyor") en üstte,
 * `tail` (ör. "Diğer") en altta kalır; katalog yüklenmediyse `fallback` döner.
 */
export function useImplantBrandNames(fallback: string[], head: string[] = [], tail: string[] = []) {
  const { brands, labId } = useImplantCatalog();
  const names = useMemo(() => {
    if (!brands || brands.length === 0) return fallback;
    const fixed = new Set([...head, ...tail].map(catalogKey));
    const mid = brands.map(b => b.name).filter(n => !fixed.has(catalogKey(n)));
    return [...head, ...mid, ...tail];
  }, [brands, fallback, head.join('|'), tail.join('|')]);
  return { names, canAdd: !!labId && !!brands, brands };
}

export function ImplantBrandAddRow({
  search, names, onPick, accent,
}: {
  search: string;
  names: string[];
  onPick: (name: string) => void;
  accent: string;
}) {
  const NO = useNOTokens();
  const { labId, brands } = useImplantCatalog();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const typed = cleanCatalogName(search);
  if (!typed || !labId || !brands) return null;
  if (findByKey(names.map(name => ({ name })), typed)) return null;
  const similar = suggestSimilar(names, typed);

  const add = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await addImplantBrand(labId, typed);
      onPick(r.name);
    } catch (e: any) {
      setErr(autoT(String(e?.message ?? 'İşlem başarısız.')));
    } finally { setBusy(false); }
  };

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: NO.borderSoft, paddingVertical: 6 }}>
      {!!similar && (
        <Pressable
          onPress={() => onPick(similar)}
          style={({ hovered }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8,
            backgroundColor: hovered ? accent + '10' : 'transparent', ...webPointer,
          })}
        >
          <Lightbulb size={13} color={accent} strokeWidth={1.8} />
          <Text style={{ flex: 1, fontSize: 12.5, color: NO.inkStrong }} numberOfLines={2}>
            {autoT('Bunu mu demek istediniz:')} <Text style={{ fontWeight: '700', color: accent }}>{similar}</Text>?
          </Text>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, flexWrap: 'wrap' }}>
        <Pressable
          onPress={add}
          disabled={busy}
          style={({ hovered }: any) => ({
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 10, paddingVertical: 6, borderRadius: NORadius.pill,
            borderWidth: 1, borderColor: accent + '55',
            backgroundColor: hovered ? accent + '18' : accent + '0D', ...webPointer,
          })}
        >
          {busy ? <ActivityIndicator size="small" color={accent} /> : <Plus size={13} color={accent} strokeWidth={2} />}
          <Text style={{ fontSize: 12, fontWeight: '700', color: accent }} numberOfLines={1}>
            {autoT('Yeni marka ekle:')} «{typed}»
          </Text>
        </Pressable>
        {!!err && <Text style={{ fontSize: 11.5, color: '#D94B4B', flexShrink: 1 }}>{err}</Text>}
      </View>
    </View>
  );
}

export function ImplantModelField({
  brand, value, onChange, accent,
}: {
  brand: string;
  value: string;
  onChange: (model: string) => void;
  accent: string;
}) {
  const NO = useNOTokens();
  const { labId, brands } = useImplantCatalog();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const entry = brands && brand ? findByKey(brands, brand) : undefined;
  if (!labId || !entry) return null;
  const models = entry.models ?? [];

  const save = async () => {
    const name = cleanCatalogName(draft);
    if (!name || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await addImplantModel(labId, entry.id, name);
      onChange(r.name);
      setAdding(false); setDraft('');
    } catch (e: any) {
      setErr(autoT(String(e?.message ?? 'İşlem başarısız.')));
    } finally { setBusy(false); }
  };

  const addLink = (
    <Pressable onPress={() => { setAdding(true); setErr(null); }} hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, ...webPointer }}>
      <Plus size={12} color={accent} strokeWidth={2} />
      <Text style={{ fontSize: 11.5, fontWeight: '600', color: accent }}>{autoT('Model ekle')}</Text>
    </Pressable>
  );

  return (
    <View style={{ marginBottom: 10 }}>
      {models.length > 0 && (
        <>
          <Text style={{ fontSize: 10.5, fontWeight: '600', color: NO.inkMedium, marginBottom: 5 }}>
            {autoT('Model')} <Text style={{ fontWeight: '400', color: NO.inkSoft }}>({autoT('isteğe bağlı')})</Text>
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            {models.map(m => {
              const active = catalogKey(m.name) === catalogKey(value);
              return (
                <Pressable key={m.id} onPress={() => onChange(active ? '' : m.name)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 10, paddingVertical: 5, borderRadius: NORadius.pill, borderWidth: 1,
                    borderColor: active ? accent : NO.borderMedium,
                    backgroundColor: active ? accent + '14' : 'transparent', ...webPointer,
                  }}>
                  {active && <Check size={11} color={accent} strokeWidth={2.2} />}
                  <Text style={{ fontSize: 11.5, fontWeight: active ? '700' : '500', color: active ? accent : NO.inkMedium }}>{m.name}</Text>
                </Pressable>
              );
            })}
            {!adding && addLink}
          </View>
        </>
      )}
      {models.length === 0 && !adding && addLink}
      {adding && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={save}
            autoFocus
            maxLength={60}
            placeholder={autoT('Model adı (ör. BLX)')}
            placeholderTextColor={NO.inkMute}
            style={{
              flexGrow: 1, minWidth: 140, fontSize: 12.5, color: NO.inkStrong,
              paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
              borderWidth: 1, borderColor: NO.borderMedium, backgroundColor: NO.bgInput, ...webNoOutline,
            }}
          />
          <Pressable onPress={save} disabled={busy || !cleanCatalogName(draft)}
            style={{
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: NORadius.pill,
              backgroundColor: accent, opacity: busy || !cleanCatalogName(draft) ? 0.5 : 1, ...webPointer,
            }}>
            {busy ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{autoT('Ekle')}</Text>}
          </Pressable>
          <Pressable onPress={() => { setAdding(false); setDraft(''); setErr(null); }} hitSlop={6} style={webPointer}>
            <Text style={{ fontSize: 12, color: NO.inkSoft }}>{autoT('Vazgeç')}</Text>
          </Pressable>
          {!!err && <Text style={{ fontSize: 11.5, color: '#D94B4B', flexShrink: 1 }}>{err}</Text>}
        </View>
      )}
    </View>
  );
}
