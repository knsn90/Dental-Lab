/**
 * Prim Motoru — Sayılan İş Türleri Seçici (Modal).
 *
 * Desktop: iki bölmeli (kategori rayı + checklist).
 * Mobile (<768px): kategori chip stripe + tam ekran sheet.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, Pressable, ScrollView, TextInput,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { Check, Search, X, Inbox } from 'lucide-react-native';
import { DS } from '../../../../core/theme/dsTokens';
import { DISPLAY, TH, PillButton, EmptyCard } from './atoms';
import { listAvailableWorkTypesWithCategory, type WorkTypeWithCategory } from '../api';

type Props = {
  visible: boolean;
  selected: string[];
  onClose: () => void;
  onApply: (next: string[]) => void;
};

export default function WorkTypeSelectorModal({ visible, selected, onClose, onApply }: Props) {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [items, setItems] = useState<WorkTypeWithCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selected));
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | string>('all');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listAvailableWorkTypesWithCategory()
      .then(rows => { if (alive) setItems(rows); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (visible) {
      setLocalSelected(new Set(selected));
      setSearchQuery('');
      setActiveCategory('all');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const grouped = useMemo(() => {
    const m = new Map<string, WorkTypeWithCategory[]>();
    items.forEach(it => {
      const k = it.category || 'Diğer';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    });
    return Array.from(m.entries());
  }, [items]);

  const totalCount = items.length;

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr');
    let base = items;
    if (activeCategory !== 'all') base = base.filter(i => i.category === activeCategory);
    if (q) base = base.filter(i => i.name.toLocaleLowerCase('tr').includes(q));
    return base;
  }, [items, activeCategory, searchQuery]);

  const isFlat = searchQuery.trim().length > 0 || activeCategory !== 'all';

  const filteredGrouped = useMemo(() => {
    if (!isFlat) return grouped;
    return [['__flat__', filtered]] as [string, WorkTypeWithCategory[]][];
  }, [grouped, filtered, isFlat]);

  const toggle = (name: string) => {
    setLocalSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // Görünür (filtre + arama uygulanmış) öğelerin tamamını seç/temizle.
  // Kategori seçili değilse tüm öğeler — kategori seçiliyse sadece o kategori.
  const selectAll = () => {
    setLocalSelected(prev => {
      const next = new Set(prev);
      filtered.forEach(it => next.add(it.name));
      return next;
    });
  };
  const clearAll = () => {
    setLocalSelected(prev => {
      const next = new Set(prev);
      filtered.forEach(it => next.delete(it.name));
      return next;
    });
  };

  /* ---------- responsive container ---------- */
  const containerStyle = isMobile
    ? { width: '100%' as const, height: '100%' as const, borderRadius: 0, maxWidth: undefined, maxHeight: undefined }
    : { maxWidth: 1080, width: '92%' as const, maxHeight: '90%' as const, borderRadius: 22 };

  const overlayStyle = isMobile
    ? { padding: 0 }
    : { padding: 16 };

  /* ====================================================================== */

  return (
    <Modal visible={visible} transparent animationType={isMobile ? 'slide' : 'fade'} onRequestClose={onClose}>
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        alignItems: 'center',
        justifyContent: isMobile ? 'flex-end' : 'center',
        ...overlayStyle,
      }}>
        <View style={{
          backgroundColor: '#FFF',
          overflow: 'hidden',
          ...containerStyle,
        }}>
          {/* HEADER */}
          <View style={{
            padding: isMobile ? 16 : 22,
            borderBottomWidth: 1,
            borderBottomColor: DS.ink[100],
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 12,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...DISPLAY, fontSize: isMobile ? 20 : 24, letterSpacing: -0.5, color: DS.ink[900], lineHeight: isMobile ? 24 : 28 }}>
                İş Türü Seçimi
              </Text>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>
                Prim hesaplamasına dahil edilecek iş türlerini seç
              </Text>
            </View>
            <Pressable onPress={onClose} style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: DS.ink[100],
              alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={16} color={DS.ink[700]} strokeWidth={2.2} />
            </Pressable>
          </View>

          {/* MOBILE: kategori chip stripe (yatay scroll) */}
          {isMobile ? (
            <View style={{ borderBottomWidth: 1, borderBottomColor: DS.ink[100] }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 6 }}
              >
                <CategoryChip
                  label="Tümü"
                  count={totalCount}
                  active={activeCategory === 'all'}
                  onPress={() => setActiveCategory('all')}
                />
                {grouped.map(([cat, list]) => (
                  <CategoryChip
                    key={cat}
                    label={cat}
                    count={list.length}
                    active={activeCategory === cat}
                    onPress={() => setActiveCategory(cat)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          {/* BODY */}
          <View style={{
            flexDirection: 'row',
            flex: 1,
            minHeight: 0,
          }}>
            {/* DESKTOP LEFT RAIL */}
            {!isMobile ? (
              <View style={{
                width: 260,
                borderRightWidth: 1,
                borderRightColor: DS.ink[100],
                padding: 18,
                gap: 4,
              }}>
                <Text style={{
                  fontSize: 10, fontWeight: '700', color: DS.ink[500],
                  textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8,
                }}>
                  Kategoriler
                </Text>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
                  <CategoryRow
                    label="Tümü"
                    count={totalCount}
                    active={activeCategory === 'all'}
                    onPress={() => setActiveCategory('all')}
                  />
                  {grouped.map(([cat, list]) => (
                    <CategoryRow
                      key={cat}
                      label={cat}
                      count={list.length}
                      active={activeCategory === cat}
                      onPress={() => setActiveCategory(cat)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* MAIN */}
            <View style={{
              flex: 1, padding: isMobile ? 16 : 18,
              gap: 12, minWidth: 0,
            }}>
              {/* Search */}
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                borderWidth: 1, borderColor: DS.ink[200], borderRadius: 12,
                paddingHorizontal: 12, paddingVertical: 8,
                backgroundColor: '#FFF',
              }}>
                <Search size={16} color={DS.ink[400]} strokeWidth={2} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="İş türü ara…"
                  placeholderTextColor={DS.ink[400]}
                  style={{ flex: 1, fontSize: 14, color: DS.ink[900], outlineStyle: 'none' as any, paddingVertical: 2 }}
                />
              </View>

              {/* Toolbar */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <PillButton variant="light" size="sm" onPress={selectAll}>
                  {isFlat ? `Tümünü seç (${filtered.length})` : 'Tümünü seç'}
                </PillButton>
                <PillButton variant="light" size="sm" onPress={clearAll}>
                  {isFlat ? 'Bu seçimi temizle' : 'Seçimi temizle'}
                </PillButton>
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 12, color: DS.ink[500] }}>
                  {localSelected.size} seçili
                </Text>
              </View>

              {/* Checklist */}
              <View style={{ flex: 1, minHeight: 0 }}>
                {loading ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color={TH.primary} />
                  </View>
                ) : items.length === 0 ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <EmptyCard icon={Inbox} title="Hizmet kataloğu boş" />
                  </View>
                ) : (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {filteredGrouped.map(([cat, list]) => (
                      <View key={cat} style={{ marginBottom: 12 }}>
                        {!isFlat && (
                          <Text style={{
                            fontSize: 10, fontWeight: '700', color: DS.ink[500],
                            textTransform: 'uppercase', letterSpacing: 0.8,
                            paddingVertical: 8,
                          }}>
                            {cat}
                          </Text>
                        )}
                        {list.length === 0 ? (
                          <Text style={{ fontSize: 12, color: DS.ink[400], paddingVertical: 12 }}>
                            Sonuç yok
                          </Text>
                        ) : list.map(it => {
                          const checked = localSelected.has(it.name);
                          return (
                            <Pressable
                              key={it.name}
                              onPress={() => toggle(it.name)}
                              style={({ pressed }) => ({
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 12,
                                paddingVertical: isMobile ? 14 : 10,
                                paddingHorizontal: 12,
                                borderBottomWidth: 1,
                                borderBottomColor: DS.ink[100],
                                backgroundColor: checked ? TH.bgSoft : 'transparent',
                                borderRadius: 8,
                                opacity: pressed ? 0.85 : 1,
                              })}
                            >
                              <View style={{
                                width: 20, height: 20, borderRadius: 6,
                                borderWidth: checked ? 0 : 1,
                                borderColor: DS.ink[300],
                                backgroundColor: checked ? TH.success : '#FFF',
                                alignItems: 'center', justifyContent: 'center',
                              }}>
                                {checked && <Check size={13} color="#FFF" strokeWidth={3} />}
                              </View>
                              <Text style={{ fontSize: 14, color: DS.ink[900], flex: 1 }} numberOfLines={2}>
                                {it.name}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            </View>
          </View>

          {/* FOOTER */}
          <View style={{
            padding: isMobile ? 14 : 18,
            borderTopWidth: 1,
            borderTopColor: DS.ink[100],
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'stretch' : 'center',
            gap: isMobile ? 10 : 12,
          }}>
            {!isMobile ? (
              <Text style={{ flex: 1, fontSize: 13, color: DS.ink[500] }}>
                {localSelected.size} iş türü seçili
              </Text>
            ) : (
              <Text style={{ fontSize: 12, color: DS.ink[500], textAlign: 'center' }}>
                {localSelected.size} iş türü seçili
              </Text>
            )}
            <View style={{
              flexDirection: 'row', gap: 8,
              ...(isMobile ? { width: '100%', justifyContent: 'space-between' } : {}),
            }}>
              <View style={isMobile ? { flex: 1 } : undefined}>
                <PillButton variant="ghost" onPress={onClose}>Vazgeç</PillButton>
              </View>
              <View style={isMobile ? { flex: 2 } : undefined}>
                <PillButton variant="dark" onPress={() => { onApply(Array.from(localSelected)); onClose(); }}>
                  Uygula
                </PillButton>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ─────────────────────────────  CategoryRow (desktop sidebar)  ──────── */
function CategoryRow({ label, count, active, onPress }: {
  label: string; count: number; active: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: active ? TH.bgSoft : 'transparent',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{
        flex: 1,
        fontSize: 13,
        color: active ? TH.primary : DS.ink[800],
        fontWeight: active ? '600' : '400',
      }} numberOfLines={1}>
        {label}
      </Text>
      <View style={{
        backgroundColor: active ? '#FFF' : DS.ink[100],
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        minWidth: 24,
        alignItems: 'center',
      }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: DS.ink[500] }}>{count}</Text>
      </View>
    </Pressable>
  );
}

/* ─────────────────────────────  CategoryChip (mobile stripe)  ───────── */
function CategoryChip({ label, count, active, onPress }: {
  label: string; count: number; active: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: active ? DS.ink[900] : DS.ink[100],
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text style={{
        fontSize: 12,
        fontWeight: active ? '600' : '500',
        color: active ? '#FFF' : DS.ink[700],
      }} numberOfLines={1}>
        {label}
      </Text>
      <View style={{
        backgroundColor: active ? 'rgba(255,255,255,0.20)' : DS.ink[200],
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 999,
        minWidth: 20,
        alignItems: 'center',
      }}>
        <Text style={{
          fontSize: 10, fontWeight: '700',
          color: active ? '#FFF' : DS.ink[700],
        }}>
          {count}
        </Text>
      </View>
    </Pressable>
  );
}
