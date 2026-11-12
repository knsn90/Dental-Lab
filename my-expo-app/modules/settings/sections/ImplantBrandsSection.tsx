// Ayarlar › İmplant markaları — lab yöneticisi kendi lab'ının implant kataloğunu düzeltir
// (kullanıcı kararı 2026-11-12). Yeniden adlandırma, gizleme/gösterme, birleştirme.
// Silme = gizleme: geçmiş siparişler marka/model'i METİN sakladığı için etkilenmez.
// Yetki sunucuda: implant_catalog_update / merge_brand yalnız can_manage_lab_settings().
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable, TextInput, Modal, Platform } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { hexA } from '../../../core/theme/stationPalette';
import { PAGE_PADDING, CARD_GAP } from '../../../core/ui/pageMetrics';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { autoT } from '../../../core/i18n/autoTranslate';
import { Pencil, Eye, EyeOff, GitMerge, ChevronDown, ChevronRight, Search, X, Check } from '../../../core/ui/icons';
import {
  fetchImplantCatalog, updateImplantCatalogItem, mergeImplantBrand, useCatalogLabId, type CatalogBrand,
} from '../../orders/implantCatalog';
import { catalogKey, cleanCatalogName } from '../../orders/implantCatalogModel';

const pointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};

type Editing = { kind: 'brand' | 'model'; id: string; draft: string } | null;

export function ImplantBrandsSection({ accentColor = '#F5C24B' }: { accentColor?: string }) {
  const U = useInkUI();
  const labId = useCatalogLabId();
  const [rows, setRows] = useState<CatalogBrand[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});
  const [mergeFrom, setMergeFrom] = useState<CatalogBrand | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const load = useCallback(async () => {
    if (!labId) { setRows([]); return; }
    setLoadErr(null);
    try { setRows(await fetchImplantCatalog(labId, true)); }
    catch (e: any) { setRows([]); setLoadErr(autoT(String(e?.message ?? 'İşlem başarısız.'))); }
  }, [labId]);
  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setRowErr(m => { const { [key]: _d, ...rest } = m; return rest; });
    try { await fn(); await load(); return true; }
    catch (e: any) { setRowErr(m => ({ ...m, [key]: autoT(String(e?.message ?? 'İşlem başarısız.')) })); return false; }
    finally { setBusy(null); }
  };

  const saveEdit = async () => {
    if (!editing || !labId) return;
    const name = cleanCatalogName(editing.draft);
    if (!name) return;
    const ok = await run(editing.id, () => updateImplantCatalogItem(labId, editing.kind, editing.id, { name }));
    if (ok) setEditing(null);
  };

  const toggleHidden = (kind: 'brand' | 'model', id: string, hidden: boolean) => {
    if (!labId) return;
    void run(id, () => updateImplantCatalogItem(labId, kind, id, { hidden: !hidden }));
  };

  const filtered = useMemo(() => {
    const k = catalogKey(q);
    const list = rows ?? [];
    return k ? list.filter(b => catalogKey(b.name).includes(k) || b.models.some(m => catalogKey(m.name).includes(k))) : list;
  }, [rows, q]);

  if (rows === null) return <ActivityIndicator style={{ marginTop: 40 }} />;

  const iconBtn = (key: string, title: string, text: string, onPress: () => void, Icon: any) => (
    <GlassTooltip key={key} title={title} text={text}>
      <Pressable onPress={onPress} disabled={!!busy} hitSlop={4}
        style={({ hovered }: any) => ({
          width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
          backgroundColor: hovered ? U.rowHover : 'transparent', ...pointer,
        })}>
        <Icon size={15} color={U.ink[500]} strokeWidth={1.8} />
      </Pressable>
    </GlassTooltip>
  );

  const nameOrEditor = (kind: 'brand' | 'model', id: string, name: string, hidden: boolean, size: number) => (
    editing && editing.id === id ? (
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TextInput
          value={editing.draft}
          onChangeText={(v) => setEditing({ ...editing, draft: v })}
          onSubmitEditing={saveEdit}
          autoFocus maxLength={60}
          style={{ ...U.inputStyle, height: 36, flex: 1, fontSize: 13.5 }}
        />
        <Pressable onPress={saveEdit} disabled={!!busy}
          style={{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor, ...pointer }}>
          {busy === id ? <ActivityIndicator size="small" color="#0A0A0A" /> : <Check size={15} color="#0A0A0A" strokeWidth={2.2} />}
        </Pressable>
        <Pressable onPress={() => setEditing(null)} hitSlop={4}
          style={{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
            backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, ...pointer }}>
          <X size={14} color={U.plainBtn.fg} strokeWidth={2} />
        </Pressable>
      </View>
    ) : (
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text numberOfLines={1} style={{ fontSize: size, fontWeight: kind === 'brand' ? '600' : '500',
          color: hidden ? U.ink[400] : U.ink[900], textDecorationLine: hidden ? 'line-through' : 'none' }}>
          {name}
        </Text>
        {hidden && (
          <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: U.chipTones.neutral.bg }}>
            <Text style={{ fontSize: 10.5, fontWeight: '700', color: U.chipTones.neutral.fg }}>{autoT('Gizli')}</Text>
          </View>
        )}
      </View>
    )
  );

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: PAGE_PADDING, gap: CARD_GAP, paddingBottom: 60 }}>
        <View style={{ ...U.cardSolid, gap: 4 }}>
          <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2, color: U.ink[400], textTransform: 'uppercase' }}>
            {autoT('İmplant markaları')}
          </Text>
          <Text style={{ fontSize: 13, color: U.ink[500], lineHeight: 19 }}>
            {autoT('Yeni sipariş formunda görünen marka ve modeller. Hekim, klinik ve lab kullanıcıları formdan yeni marka/model ekleyebilir; düzeltme, gizleme ve birleştirme yalnız buradan yapılır. Geçmiş siparişler değişmez.')}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, ...U.inputStyle, height: 40 }}>
            <Search size={15} color={U.ink[400]} strokeWidth={1.8} />
            <TextInput value={q} onChangeText={setQ} placeholder={autoT('Marka veya model ara…')} placeholderTextColor={U.ink[400]}
              style={{ flex: 1, fontSize: 13.5, color: U.ink[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
            {!!q && <Pressable onPress={() => setQ('')} hitSlop={6} style={pointer}><X size={14} color={U.ink[400]} /></Pressable>}
          </View>

          {loadErr ? (
            <Text style={{ fontSize: 13, fontWeight: '600', color: U.chipTones.danger.fg, marginTop: 12 }} accessibilityLiveRegion="polite">{loadErr}</Text>
          ) : filtered.length === 0 ? (
            <Text style={{ fontSize: 13, color: U.ink[400], marginTop: 12 }}>{autoT('Sonuç yok')}</Text>
          ) : (
            <View style={{ marginTop: 8 }}>
              {filtered.map((b, i) => {
                const isOpen = open === b.id || (!!q && b.models.some(m => catalogKey(m.name).includes(catalogKey(q))));
                const visibleModels = b.models.filter(m => !m.hidden).length;
                return (
                  <View key={b.id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: U.hairlineSoft, paddingVertical: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Pressable onPress={() => setOpen(open === b.id ? null : b.id)} hitSlop={6}
                        style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center', ...pointer }}>
                        {isOpen ? <ChevronDown size={15} color={U.ink[400]} /> : <ChevronRight size={15} color={U.ink[400]} />}
                      </Pressable>
                      {nameOrEditor('brand', b.id, b.name, !!b.hidden, 14)}
                      {!(editing && editing.id === b.id) && (
                        <>
                          <Text style={{ fontSize: 11.5, color: U.ink[400], marginEnd: 4 }}>
                            {visibleModels} {autoT('model')}
                          </Text>
                          {busy === b.id && <ActivityIndicator size="small" />}
                          {iconBtn('e', autoT('Yeniden adlandır'), autoT('Markanın adını düzelt'),
                            () => setEditing({ kind: 'brand', id: b.id, draft: b.name }), Pencil)}
                          {iconBtn('h', b.hidden ? autoT('Göster') : autoT('Gizle'),
                            b.hidden ? autoT('Marka formda yeniden listelenir') : autoT('Marka formda listelenmez; geçmiş siparişler değişmez'),
                            () => toggleHidden('brand', b.id, !!b.hidden), b.hidden ? Eye : EyeOff)}
                          {iconBtn('m', autoT('Birleştir'), autoT('Bu markayı başka bir markayla birleştir'),
                            () => setMergeFrom(b), GitMerge)}
                        </>
                      )}
                    </View>
                    {!!rowErr[b.id] && (
                      <Text style={{ fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg, marginStart: 30, marginTop: 4 }} accessibilityLiveRegion="polite">
                        {rowErr[b.id]}
                      </Text>
                    )}
                    {isOpen && (
                      <View style={{ marginStart: 30, marginTop: 4 }}>
                        {b.models.length === 0 && (
                          <Text style={{ fontSize: 12, color: U.ink[400], paddingVertical: 6 }}>
                            {autoT('Bu markada model yok. Model, sipariş formundan eklenir.')}
                          </Text>
                        )}
                        {b.models.map(m => (
                          <View key={m.id}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}>
                              {nameOrEditor('model', m.id, m.name, !!m.hidden, 13)}
                              {!(editing && editing.id === m.id) && (
                                <>
                                  {busy === m.id && <ActivityIndicator size="small" />}
                                  {iconBtn('e', autoT('Yeniden adlandır'), autoT('Modelin adını düzelt'),
                                    () => setEditing({ kind: 'model', id: m.id, draft: m.name }), Pencil)}
                                  {iconBtn('h', m.hidden ? autoT('Göster') : autoT('Gizle'),
                                    m.hidden ? autoT('Model formda yeniden listelenir') : autoT('Model formda listelenmez; geçmiş siparişler değişmez'),
                                    () => toggleHidden('model', m.id, !!m.hidden), m.hidden ? Eye : EyeOff)}
                                </>
                              )}
                            </View>
                            {!!rowErr[m.id] && (
                              <Text style={{ fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }} accessibilityLiveRegion="polite">{rowErr[m.id]}</Text>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <MergeTargetModal
        from={mergeFrom}
        brands={(rows ?? []).filter(b => !b.hidden && b.id !== mergeFrom?.id)}
        accentColor={accentColor}
        onClose={() => setMergeFrom(null)}
        onPick={(into) => {
          const from = mergeFrom;
          setMergeFrom(null);
          if (!from || !labId) return;
          setConfirm({
            title: autoT('Markaları birleştir'),
            highlight: `${from.name} → ${into.name}`,
            message: autoT('Modeller hedef markaya taşınır, kaynak marka gizlenir. Geçmiş siparişler değişmez.'),
            label: autoT('Birleştir'),
            cancelLabel: autoT('Vazgeç'),
            variant: 'warning',
            onConfirm: async () => { setConfirm(null); await run(from.id, () => mergeImplantBrand(labId, from.id, into.id)); },
          });
        }}
      />
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

function MergeTargetModal({
  from, brands, accentColor, onClose, onPick,
}: {
  from: CatalogBrand | null;
  brands: CatalogBrand[];
  accentColor: string;
  onClose: () => void;
  onPick: (into: CatalogBrand) => void;
}) {
  const U = useInkUI();
  const [q, setQ] = useState('');
  useEffect(() => { if (from) setQ(''); }, [from]);
  const k = catalogKey(q);
  const list = k ? brands.filter(b => catalogKey(b.name).includes(k)) : brands;
  return (
    <Modal visible={!!from} transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        <View style={U.modalCard}>
          <View style={U.modalHeaderRow}>
            <Text style={U.modalTitle} numberOfLines={1}>
              {autoT('Birleştir')}: {from?.name}
            </Text>
            <Pressable onPress={onClose} style={{ ...U.modalCloseBtn, ...pointer }}><X size={14} color={U.ink[500]} /></Pressable>
          </View>
          <View style={{ padding: 16, gap: 10 }}>
            <Text style={{ fontSize: 12.5, color: U.ink[500] }}>{autoT('Hangi markayla birleştirilsin?')}</Text>
            <TextInput value={q} onChangeText={setQ} autoFocus placeholder={autoT('Marka ara…')} placeholderTextColor={U.ink[400]}
              style={{ ...U.inputStyle, height: 40 }} />
            <ScrollView style={{ maxHeight: 320 }}>
              {list.map(b => (
                <Pressable key={b.id} onPress={() => onPick(b)}
                  style={({ hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10,
                    backgroundColor: hovered ? hexA(accentColor, U.isDark ? 0.18 : 0.14) : 'transparent', ...pointer,
                  })}>
                  <Text style={{ flex: 1, fontSize: 13.5, color: U.ink[900] }}>{b.name}</Text>
                  <Text style={{ fontSize: 11.5, color: U.ink[400] }}>{b.models.length} {autoT('model')}</Text>
                </Pressable>
              ))}
              {list.length === 0 && <Text style={{ fontSize: 12.5, color: U.ink[400], padding: 10 }}>{autoT('Sonuç yok')}</Text>}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}
