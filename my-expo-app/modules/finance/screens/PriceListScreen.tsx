/**
 * PriceListScreen — Mali İşlemler > Fiyat Listesi
 *
 * 3 sekme:
 *   Standart     → Genel hizmet kataloğu ve fiyatları
 *   Özel Listeler → Klinik / hekim bazlı fiyat istisnası
 *   Promosyonlar  → Kampanya, iskonto ve promosyon yönetimi
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator, Alert,
} from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { C } from '../../../core/theme/colors';
import { Shadows, CardSpec } from '../../../core/theme/shadows';
import { AppIcon } from '../../../core/ui/AppIcon';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';

import { fetchAllLabServices, createLabService, updateLabService } from '../../services/api';
import { fetchClinics } from '../../clinics/api';
import type { LabService } from '../../services/types';
import type { Clinic } from '../../clinics/types';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
const SERVICE_CATEGORIES = [
  'Sabit Protez', 'Hareketli Protez', 'İmplant',
  'Ortodonti', 'CAD/CAM', 'Seramik', 'Diğer',
];

interface PriceOverride {
  id: string;
  clinic_id: string;
  service_id: string;
  custom_price: number | null;
  discount_percent: number | null;
  currency: string;
  notes: string | null;
}

interface Promotion {
  id: string;
  name: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  scope: 'all' | 'category' | 'services';
  category: string | null;
  clinic_ids: string[] | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Root
// ────────────────────────────────────────────────────────────────────────────
export function PriceListScreen() {
  const [tab, setTab] = useState('standard');

  return (
    <View style={s.root}>
      <View style={s.tabBar}>
        <SlideTabBar
          items={[
            { key: 'standard',   label: 'Standart' },
            { key: 'custom',     label: 'Özel Listeler' },
            { key: 'promotions', label: 'Promosyonlar' },
          ]}
          activeKey={tab}
          onChange={setTab}
          accentColor={C.primary}
        />
      </View>

      {tab === 'standard'   && <StandardTab />}
      {tab === 'custom'     && <CustomTab />}
      {tab === 'promotions' && <PromotionsTab />}
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab 1 — Standart Fiyat Listesi
// ────────────────────────────────────────────────────────────────────────────
interface ServiceForm {
  name: string; category: string; price: string; currency: string;
}
const EMPTY_SVC: ServiceForm = { name: '', category: '', price: '0', currency: 'TRY' };

function StandardTab() {
  const [services, setServices]       = useState<LabService[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [catFilter, setCatFilter]     = useState('Tümü');
  const [modal, setModal]             = useState(false);
  const [edit, setEdit]               = useState<LabService | null>(null);
  const [form, setForm]               = useState<ServiceForm>(EMPTY_SVC);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchAllLabServices();
    setServices((data as LabService[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setEdit(null); setForm(EMPTY_SVC); setError(''); setModal(true); };
  const openEdit = (sv: LabService) => {
    setEdit(sv);
    setForm({ name: sv.name, category: sv.category ?? '', price: String(sv.price), currency: sv.currency });
    setError(''); setModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Hizmet adı zorunludur.'); return; }
    const price = parseFloat(form.price) || 0;
    setSaving(true);
    const payload = { name: form.name.trim(), category: form.category || undefined, price, currency: form.currency };
    if (edit) await updateLabService(edit.id, payload);
    else await createLabService(payload);
    setSaving(false); setModal(false); load();
  };

  const handleToggle = async (sv: LabService) => {
    await updateLabService(sv.id, { is_active: !sv.is_active }); load();
  };

  const allCats   = ['Tümü', ...SERVICE_CATEGORIES];
  const filtered  = services.filter((sv) => {
    const matchCat    = catFilter === 'Tümü' || sv.category === catFilter;
    const matchSearch = !search || sv.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });
  const grouped = SERVICE_CATEGORIES.reduce<Record<string, LabService[]>>((acc, cat) => {
    const items = filtered.filter((sv) => sv.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});
  const ungrouped = filtered.filter((sv) => !sv.category || !SERVICE_CATEGORIES.includes(sv.category));

  return (
    <View style={s.tabContent}>
      {/* Toolbar */}
      <View style={s.toolbar}>
        <View style={s.searchWrap}>
          <AppIcon name="search" size={15} color="#94A3B8" />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Hizmet ara..."
            placeholderTextColor="#C7C7CC"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <AppIcon name="x" size={14} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.85}>
          <AppIcon name="plus" size={15} color="#FFFFFF" />
          <Text style={s.addBtnText}>Ekle</Text>
        </TouchableOpacity>
      </View>

      {/* Category filter */}
      <View style={s.catBarWrap}>
        <SlideTabBar
          items={allCats.map((c) => ({
            key: c, label: c,
            count: c === 'Tümü' ? services.length : services.filter((sv) => sv.category === c).length,
          }))}
          activeKey={catFilter}
          onChange={setCatFilter}
          accentColor={C.primary}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {Object.entries(grouped).map(([cat, items]) => (
            <View key={cat}>
              <View style={s.groupHeader}>
                <Text style={s.groupTitle}>{cat}</Text>
                <Text style={s.groupCount}>{items.length} hizmet</Text>
              </View>
              {items.map((sv) => (
                <ServiceRow key={sv.id} service={sv} onEdit={openEdit} onToggle={handleToggle} />
              ))}
            </View>
          ))}
          {ungrouped.length > 0 && (
            <View>
              <View style={s.groupHeader}>
                <Text style={s.groupTitle}>Diğer</Text>
                <Text style={s.groupCount}>{ungrouped.length} hizmet</Text>
              </View>
              {ungrouped.map((sv) => (
                <ServiceRow key={sv.id} service={sv} onEdit={openEdit} onToggle={handleToggle} />
              ))}
            </View>
          )}
          {filtered.length === 0 && (
            <View style={s.empty}>
              <AppIcon name="tag" size={36} color="#CBD5E1" />
              <Text style={s.emptyTitle}>{search ? 'Sonuç bulunamadı' : 'Henüz hizmet eklenmemiş'}</Text>
              {!search && (
                <TouchableOpacity style={s.emptyBtn} onPress={openAdd}>
                  <Text style={s.emptyBtnText}>İlk hizmeti ekle</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </ScrollView>
      )}

      <ServiceModal
        visible={modal}
        edit={edit}
        form={form}
        setForm={setForm}
        error={error}
        setError={setError}
        saving={saving}
        onClose={() => setModal(false)}
        onSave={handleSave}
      />
    </View>
  );
}

function ServiceRow({
  service: sv, onEdit, onToggle,
}: { service: LabService; onEdit: (s: LabService) => void; onToggle: (s: LabService) => void }) {
  return (
    <View style={[s.serviceRow, !sv.is_active && { opacity: 0.5 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.serviceName}>{sv.name}</Text>
        <Text style={s.servicePrice}>
          {sv.price > 0 ? `${sv.price.toLocaleString('tr-TR')} ${sv.currency}` : '—'}
        </Text>
      </View>
      <TouchableOpacity style={s.editBtn} onPress={() => onEdit(sv)}>
        <AppIcon name="pencil" size={14} color="#64748B" />
      </TouchableOpacity>
      <AppSwitch value={sv.is_active} onValueChange={() => onToggle(sv)} accentColor={C.primary} />
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab 2 — Özel Listeler (clinic / doctor-specific prices)
// ────────────────────────────────────────────────────────────────────────────
function CustomTab() {
  const [clinics, setClinics]         = useState<Clinic[]>([]);
  const [services, setServices]       = useState<LabService[]>([]);
  const [overrides, setOverrides]     = useState<PriceOverride[]>([]);
  const [overrideCounts, setOverrideCounts] = useState<Record<string, number>>({});
  const [selectedClinic, setSelected] = useState<Clinic | null>(null);
  const [loading, setLoading]         = useState(true);
  const [editModal, setEditModal]     = useState(false);
  const [editSvc, setEditSvc]         = useState<LabService | null>(null);
  const [oForm, setOForm]             = useState({ custom_price: '', discount_percent: '', notes: '' });
  const [saving, setSaving]           = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cl }, { data: sv }, { data: oc }] = await Promise.all([
      fetchClinics(),
      fetchAllLabServices(),
      supabase.from('clinic_price_overrides').select('clinic_id'),
    ]);
    setClinics((cl as Clinic[]) ?? []);
    setServices((sv as LabService[]) ?? []);
    // Group overrides by clinic_id for badge counts
    const counts: Record<string, number> = {};
    (oc as { clinic_id: string }[] | null)?.forEach((row) => {
      counts[row.clinic_id] = (counts[row.clinic_id] ?? 0) + 1;
    });
    setOverrideCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadOverrides = useCallback(async (clinicId: string) => {
    const { data } = await supabase
      .from('clinic_price_overrides')
      .select('*')
      .eq('clinic_id', clinicId);
    setOverrides((data as PriceOverride[]) ?? []);
  }, []);

  const selectClinic = (c: Clinic) => {
    setSelected(c);
    loadOverrides(c.id);
  };

  const openEditOverride = (sv: LabService) => {
    const existing = overrides.find((o) => o.service_id === sv.id);
    setEditSvc(sv);
    setOForm({
      custom_price:     existing?.custom_price != null ? String(existing.custom_price) : '',
      discount_percent: existing?.discount_percent != null ? String(existing.discount_percent) : '',
      notes:            existing?.notes ?? '',
    });
    setEditModal(true);
  };

  const handleSaveOverride = async () => {
    if (!selectedClinic || !editSvc) return;
    setSaving(true);
    const existing = overrides.find((o) => o.service_id === editSvc.id);
    const payload = {
      clinic_id:        selectedClinic.id,
      service_id:       editSvc.id,
      custom_price:     oForm.custom_price ? parseFloat(oForm.custom_price) : null,
      discount_percent: oForm.discount_percent ? parseFloat(oForm.discount_percent) : null,
      currency:         'TRY',
      notes:            oForm.notes || null,
    };
    let isNew = false;
    if (existing) {
      await supabase.from('clinic_price_overrides').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('clinic_price_overrides').insert(payload);
      isNew = true;
    }
    setSaving(false);
    setEditModal(false);
    loadOverrides(selectedClinic.id);
    if (isNew) {
      setOverrideCounts(prev => ({ ...prev, [selectedClinic.id]: (prev[selectedClinic.id] ?? 0) + 1 }));
    }
  };

  const handleDeleteOverride = async () => {
    if (!selectedClinic || !editSvc) return;
    const existing = overrides.find((o) => o.service_id === editSvc.id);
    if (!existing) { setEditModal(false); return; }
    await supabase.from('clinic_price_overrides').delete().eq('id', existing.id);
    setEditModal(false);
    loadOverrides(selectedClinic.id);
    setOverrideCounts(prev => ({ ...prev, [selectedClinic.id]: Math.max(0, (prev[selectedClinic.id] ?? 1) - 1) }));
  };

  const getEffectivePrice = (sv: LabService, override?: PriceOverride) => {
    if (!override) return null;
    if (override.custom_price != null) return override.custom_price;
    if (override.discount_percent != null) {
      return sv.price * (1 - override.discount_percent / 100);
    }
    return null;
  };

  const activeSvcs = services.filter((sv) => sv.is_active);

  if (loading) return <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />;

  return (
    <View style={s.tabContent}>
      {!selectedClinic ? (
        /* ── Clinic picker ── */
        <ScrollView contentContainerStyle={s.list}>
          <View style={s.infoCard}>
            <AppIcon name="info" size={15} color="#2563EB" />
            <Text style={s.infoText}>
              Klinik seçin ve o kliniğe özel fiyatları düzenleyin. Belirlenmemiş hizmetler standart fiyatla uygulanır.
            </Text>
          </View>

          {clinics.length === 0 ? (
            <View style={s.empty}>
              <AppIcon name="building-2" size={36} color="#CBD5E1" />
              <Text style={s.emptyTitle}>Henüz klinik eklenmemiş</Text>
            </View>
          ) : (
            clinics.map((c) => {
              const overrideCount = overrideCounts[c.id] ?? 0;
              return (
                <TouchableOpacity key={c.id} style={s.clinicCard} onPress={() => selectClinic(c)} activeOpacity={0.8}>
                  <View style={s.clinicIcon}>
                    <AppIcon name="building-2" size={18} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.clinicName}>{c.name}</Text>
                    {c.contact_person && (
                      <Text style={s.clinicSub}>{c.contact_person}</Text>
                    )}
                  </View>
                  {overrideCount > 0 && (
                    <View style={s.overrideBadge}>
                      <Text style={s.overrideBadgeText}>{overrideCount}</Text>
                    </View>
                  )}
                  <AppIcon name="chevron-right" size={16} color="#94A3B8" />
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      ) : (
        /* ── Service override list for selected clinic ── */
        <View style={{ flex: 1 }}>
          {/* Back + clinic name header */}
          <View style={s.clinicHeader}>
            <TouchableOpacity style={s.backBtn} onPress={() => setSelected(null)}>
              <AppIcon name="arrow-left" size={16} color="#2563EB" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={s.clinicHeaderTitle}>{selectedClinic.name}</Text>
              <Text style={s.clinicHeaderSub}>Özel fiyat listesi</Text>
            </View>
            <View style={s.overrideBadge}>
              <Text style={s.overrideBadgeText}>{overrides.length} özel fiyat</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={s.list}>
            {SERVICE_CATEGORIES.map((cat) => {
              const catSvcs = activeSvcs.filter((sv) => sv.category === cat);
              if (!catSvcs.length) return null;
              return (
                <View key={cat}>
                  <View style={s.groupHeader}>
                    <Text style={s.groupTitle}>{cat}</Text>
                  </View>
                  {catSvcs.map((sv) => {
                    const override = overrides.find((o) => o.service_id === sv.id);
                    const effPrice = getEffectivePrice(sv, override);
                    return (
                      <TouchableOpacity
                        key={sv.id}
                        style={s.overrideRow}
                        onPress={() => openEditOverride(sv)}
                        activeOpacity={0.8}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.serviceName}>{sv.name}</Text>
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 3, alignItems: 'center' }}>
                            {effPrice != null ? (
                              <>
                                <Text style={s.overridePrice}>{effPrice.toLocaleString('tr-TR')} ₺</Text>
                                <Text style={s.standardPrice}>{sv.price.toLocaleString('tr-TR')} ₺</Text>
                                {override?.discount_percent != null && (
                                  <View style={s.discountBadge}>
                                    <Text style={s.discountText}>-{override.discount_percent}%</Text>
                                  </View>
                                )}
                              </>
                            ) : (
                              <Text style={s.stdPriceLabel}>Standart: {sv.price.toLocaleString('tr-TR')} ₺</Text>
                            )}
                          </View>
                        </View>
                        <AppIcon
                          name={override ? 'pencil' : 'plus-circle'}
                          size={16}
                          color={override ? '#2563EB' : '#94A3B8'}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Override edit modal */}
      <Modal visible={editModal} transparent animationType="fade" onRequestClose={() => setEditModal(false)}>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.header}>
              <Text style={m.title}>Özel Fiyat Belirle</Text>
              <TouchableOpacity style={m.closeBtn} onPress={() => setEditModal(false)}>
                <AppIcon name="x" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={m.body} keyboardShouldPersistTaps="handled">
              {editSvc && (
                <View style={m.svcInfoCard}>
                  <Text style={m.svcInfoLabel}>Hizmet</Text>
                  <Text style={m.svcInfoName}>{editSvc.name}</Text>
                  <Text style={m.svcInfoPrice}>Standart: {editSvc.price.toLocaleString('tr-TR')} {editSvc.currency}</Text>
                </View>
              )}

              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Fiyatlandırma Yöntemi</Text>
                <Text style={m.hint}>Özel fiyat VEYA iskonto oranı belirleyebilirsiniz. İkisi birden girilirse özel fiyat önceliklidir.</Text>

                <View style={m.fieldWrap}>
                  <Text style={m.fieldLabel}>Özel Fiyat (₺)</Text>
                  <TextInput
                    style={m.fieldInput}
                    value={oForm.custom_price}
                    onChangeText={(v) => setOForm((f) => ({ ...f, custom_price: v }))}
                    placeholder="Örn: 850.00"
                    placeholderTextColor="#C7C7CC"
                    keyboardType="decimal-pad"
                  />
                </View>

                <View style={m.divider}>
                  <View style={m.dividerLine} />
                  <Text style={m.dividerText}>VEYA</Text>
                  <View style={m.dividerLine} />
                </View>

                <View style={m.fieldWrap}>
                  <Text style={m.fieldLabel}>İskonto Oranı (%)</Text>
                  <TextInput
                    style={m.fieldInput}
                    value={oForm.discount_percent}
                    onChangeText={(v) => setOForm((f) => ({ ...f, discount_percent: v }))}
                    placeholder="Örn: 15"
                    placeholderTextColor="#C7C7CC"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Not</Text>
                <TextInput
                  style={[m.fieldInput, { minHeight: 72, textAlignVertical: 'top' }]}
                  value={oForm.notes}
                  onChangeText={(v) => setOForm((f) => ({ ...f, notes: v }))}
                  placeholder="İsteğe bağlı açıklama..."
                  placeholderTextColor="#C7C7CC"
                  multiline
                />
              </View>

              <View style={{ height: 8 }} />
            </ScrollView>

            <View style={m.footer}>
              {overrides.find((o) => o.service_id === editSvc?.id) && (
                <TouchableOpacity style={m.deleteBtn} onPress={handleDeleteOverride}>
                  <AppIcon name="trash-2" size={15} color="#DC2626" />
                  <Text style={m.deleteText}>Sil</Text>
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={m.cancelBtn} onPress={() => setEditModal(false)}>
                <Text style={m.cancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[m.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSaveOverride}
                disabled={saving}
              >
                <Text style={m.saveText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab 3 — Promosyonlar
// ────────────────────────────────────────────────────────────────────────────
const DISCOUNT_COLORS: Record<string, string> = {
  active:  '#059669',
  expired: '#94A3B8',
  soon:    '#D97706',
};

function PromotionsTab() {
  const [promos, setPromos]   = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(false);
  const [editPromo, setEdit]  = useState<Promotion | null>(null);
  const [form, setForm]       = useState({
    name: '', discount_type: 'percent' as 'percent' | 'fixed',
    discount_value: '', scope: 'all' as 'all' | 'category' | 'services',
    category: '', starts_at: '', ends_at: '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('promotions')
      .select('*')
      .order('created_at', { ascending: false });
    setPromos((data as Promotion[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEdit(null);
    setForm({ name: '', discount_type: 'percent', discount_value: '', scope: 'all', category: '', starts_at: '', ends_at: '' });
    setModal(true);
  };

  const openEdit = (p: Promotion) => {
    setEdit(p);
    setForm({
      name: p.name,
      discount_type: p.discount_type,
      discount_value: String(p.discount_value),
      scope: p.scope,
      category: p.category ?? '',
      starts_at: p.starts_at ? p.starts_at.split('T')[0] : '',
      ends_at: p.ends_at ? p.ends_at.split('T')[0] : '',
    });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value) || 0,
      scope: form.scope,
      category: form.category || null,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      is_active: true,
    };
    if (editPromo) {
      await supabase.from('promotions').update(payload).eq('id', editPromo.id);
    } else {
      await supabase.from('promotions').insert(payload);
    }
    setSaving(false);
    setModal(false);
    load();
  };

  const toggleActive = async (p: Promotion) => {
    await supabase.from('promotions').update({ is_active: !p.is_active }).eq('id', p.id);
    load();
  };

  const getStatus = (p: Promotion): 'active' | 'expired' | 'soon' => {
    const now = new Date();
    if (p.ends_at && new Date(p.ends_at) < now) return 'expired';
    if (p.starts_at && new Date(p.starts_at) > now) return 'soon';
    return 'active';
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('tr-TR');
  };

  if (loading) return <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />;

  return (
    <View style={s.tabContent}>
      <View style={s.toolbar}>
        <Text style={s.toolbarTitle}>{promos.length} kampanya / promosyon</Text>
        <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.85}>
          <AppIcon name="plus" size={15} color="#FFFFFF" />
          <Text style={s.addBtnText}>Ekle</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.list}>
        {promos.length === 0 && (
          <View style={s.empty}>
            <AppIcon name="tag" size={36} color="#CBD5E1" />
            <Text style={s.emptyTitle}>Henüz promosyon eklenmemiş</Text>
            <Text style={s.emptySubtitle}>Kampanya veya toplu iskonto oluşturun</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={openAdd}>
              <Text style={s.emptyBtnText}>İlk kampanyayı ekle</Text>
            </TouchableOpacity>
          </View>
        )}

        {promos.map((p) => {
          const status  = getStatus(p);
          const color   = DISCOUNT_COLORS[status];
          const statusLabel = status === 'active' ? 'Aktif' : status === 'expired' ? 'Sona Erdi' : 'Yakında';

          return (
            <View key={p.id} style={[s.promoCard, !p.is_active && { opacity: 0.55 }]}>
              <View style={s.promoTop}>
                {/* Discount badge */}
                <View style={[s.discountCircle, { backgroundColor: color + '18' }]}>
                  <Text style={[s.discountCircleText, { color }]}>
                    {p.discount_type === 'percent'
                      ? `%${p.discount_value}`
                      : `${p.discount_value} ₺`}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.promoName}>{p.name}</Text>
                  <View style={s.promoMeta}>
                    <View style={[s.statusDot, { backgroundColor: color }]} />
                    <Text style={[s.promoStatus, { color }]}>{statusLabel}</Text>
                    <Text style={s.promoScope}>
                      · {p.scope === 'all' ? 'Tüm hizmetler' : p.scope === 'category' ? p.category ?? 'Kategori' : 'Seçili hizmetler'}
                    </Text>
                  </View>
                </View>
                <AppSwitch
                  value={p.is_active}
                  onValueChange={() => toggleActive(p)}
                  accentColor={color}
                />
              </View>

              <View style={s.promoDates}>
                <View style={s.dateChip}>
                  <AppIcon name="calendar" size={12} color="#94A3B8" />
                  <Text style={s.dateChipText}>{formatDate(p.starts_at)} → {formatDate(p.ends_at)}</Text>
                </View>
                <TouchableOpacity style={s.editSmallBtn} onPress={() => openEdit(p)}>
                  <AppIcon name="pencil" size={13} color="#64748B" />
                  <Text style={s.editSmallText}>Düzenle</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Promo modal */}
      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.header}>
              <Text style={m.title}>{editPromo ? 'Promosyon Düzenle' : 'Yeni Promosyon'}</Text>
              <TouchableOpacity style={m.closeBtn} onPress={() => setModal(false)}>
                <AppIcon name="x" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={m.body} keyboardShouldPersistTaps="handled">
              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Promosyon Adı</Text>
                <TextInput
                  style={m.fieldInput}
                  value={form.name}
                  onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                  placeholder="Örn: Ağustos Kampanyası"
                  placeholderTextColor="#C7C7CC"
                />
              </View>

              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>İskonto Türü</Text>
                <View style={s.toggleRow}>
                  {(['percent', 'fixed'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[s.toggleChip, form.discount_type === t && s.toggleChipActive]}
                      onPress={() => setForm((f) => ({ ...f, discount_type: t }))}
                    >
                      <Text style={[s.toggleChipText, form.discount_type === t && s.toggleChipTextActive]}>
                        {t === 'percent' ? 'Yüzde (%)' : 'Sabit (₺)'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={[m.fieldWrap, { marginTop: 14 }]}>
                  <Text style={m.fieldLabel}>İskonto Değeri</Text>
                  <TextInput
                    style={m.fieldInput}
                    value={form.discount_value}
                    onChangeText={(v) => setForm((f) => ({ ...f, discount_value: v }))}
                    placeholder={form.discount_type === 'percent' ? 'Örn: 15' : 'Örn: 200'}
                    placeholderTextColor="#C7C7CC"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Kapsam</Text>
                <View style={s.toggleRow}>
                  {([
                    { key: 'all',      label: 'Tüm Hizmetler' },
                    { key: 'category', label: 'Kategori' },
                  ] as const).map((sc) => (
                    <TouchableOpacity
                      key={sc.key}
                      style={[s.toggleChip, form.scope === sc.key && s.toggleChipActive]}
                      onPress={() => setForm((f) => ({ ...f, scope: sc.key }))}
                    >
                      <Text style={[s.toggleChipText, form.scope === sc.key && s.toggleChipTextActive]}>
                        {sc.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {form.scope === 'category' && (
                  <View style={[m.fieldWrap, { marginTop: 14 }]}>
                    <Text style={m.fieldLabel}>Kategori</Text>
                    <View style={s.toggleRow}>
                      {SERVICE_CATEGORIES.map((cat) => (
                        <TouchableOpacity
                          key={cat}
                          style={[s.toggleChip, form.category === cat && s.toggleChipActive]}
                          onPress={() => setForm((f) => ({ ...f, category: cat }))}
                        >
                          <Text style={[s.toggleChipText, form.category === cat && s.toggleChipTextActive]}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              <View style={m.sectionCard}>
                <Text style={m.sectionTitle}>Geçerlilik Tarihleri</Text>
                <View style={m.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={m.fieldLabel}>Başlangıç</Text>
                    <TextInput
                      style={m.fieldInput}
                      value={form.starts_at}
                      onChangeText={(v) => setForm((f) => ({ ...f, starts_at: v }))}
                      placeholder="YYYY-AA-GG"
                      placeholderTextColor="#C7C7CC"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={m.fieldLabel}>Bitiş</Text>
                    <TextInput
                      style={m.fieldInput}
                      value={form.ends_at}
                      onChangeText={(v) => setForm((f) => ({ ...f, ends_at: v }))}
                      placeholder="YYYY-AA-GG"
                      placeholderTextColor="#C7C7CC"
                    />
                  </View>
                </View>
              </View>

              <View style={{ height: 8 }} />
            </ScrollView>

            <View style={m.footer}>
              <TouchableOpacity style={m.cancelBtn} onPress={() => setModal(false)}>
                <Text style={m.cancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[m.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={m.saveText}>{saving ? 'Kaydediliyor...' : editPromo ? 'Güncelle' : 'Oluştur'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Shared: Service add/edit modal
// ────────────────────────────────────────────────────────────────────────────
function ServiceModal({
  visible, edit, form, setForm, error, setError, saving, onClose, onSave,
}: {
  visible: boolean;
  edit: LabService | null;
  form: ServiceForm;
  setForm: React.Dispatch<React.SetStateAction<ServiceForm>>;
  error: string;
  setError: (e: string) => void;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <Text style={m.title}>{edit ? 'Hizmeti Düzenle' : 'Hizmet Ekle'}</Text>
            <TouchableOpacity style={m.closeBtn} onPress={onClose}>
              <AppIcon name="x" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={m.body} keyboardShouldPersistTaps="handled">
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Hizmet Bilgileri</Text>
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>Hizmet Adı <Text style={{ color: '#EF4444' }}>*</Text></Text>
                <TextInput
                  style={m.fieldInput}
                  value={form.name}
                  onChangeText={(v) => { setForm((f) => ({ ...f, name: v })); setError(''); }}
                  placeholder="Örn: Zirkonyum Kron"
                  placeholderTextColor="#C7C7CC"
                />
              </View>
            </View>

            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Kategori</Text>
              <View style={s.toggleRow}>
                {SERVICE_CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setForm((f) => ({ ...f, category: c }))}
                    style={[s.toggleChip, form.category === c && s.toggleChipActive]}
                  >
                    <Text style={[s.toggleChipText, form.category === c && s.toggleChipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Fiyatlandırma</Text>
              <View style={m.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={m.fieldLabel}>Fiyat</Text>
                  <TextInput
                    style={m.fieldInput}
                    value={form.price}
                    onChangeText={(v) => setForm((f) => ({ ...f, price: v }))}
                    placeholder="0.00"
                    placeholderTextColor="#C7C7CC"
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ width: 100 }}>
                  <Text style={m.fieldLabel}>Para Birimi</Text>
                  <TextInput
                    style={m.fieldInput}
                    value={form.currency}
                    onChangeText={(v) => setForm((f) => ({ ...f, currency: v }))}
                    placeholder="TRY"
                    placeholderTextColor="#C7C7CC"
                    autoCapitalize="characters"
                  />
                </View>
              </View>
            </View>

            {error ? (
              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 4 }}>
                <Text style={{ color: '#DC2626', fontWeight: '600', fontSize: 13 }}>⚠️ {error}</Text>
              </View>
            ) : null}

            <View style={{ height: 8 }} />
          </ScrollView>

          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}>
              <Text style={m.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.saveBtn, saving && { opacity: 0.6 }]}
              onPress={onSave}
              disabled={saving}
            >
              <Text style={m.saveText}>{saving ? 'Kaydediliyor...' : edit ? 'Güncelle' : 'Ekle'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: CardSpec.pageBg },

  tabBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingHorizontal: 12,
  },
  tabContent: { flex: 1 },

  // Toolbar
  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  toolbarTitle: { flex: 1, fontSize: 13, color: '#64748B', fontWeight: '500' },

  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F8FAFC', borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 12, height: 38,
  },
  searchInput: {
    flex: 1, fontSize: 14, color: '#0F172A',
    // @ts-ignore
    outlineStyle: 'none',
  },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
  },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  catBarWrap: {
    backgroundColor: '#FFFFFF', paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },

  list: { padding: 14, paddingBottom: 40 },

  groupHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 2,
    marginTop: 6, marginBottom: 2,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  groupTitle: { fontSize: 12, fontWeight: '800', color: '#475569', letterSpacing: 0.5, textTransform: 'uppercase' },
  groupCount: { fontSize: 11, color: '#94A3B8' },

  serviceRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 12,
  },
  serviceName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  servicePrice: { fontSize: 13, color: C.primary, fontWeight: '700', marginTop: 2 },
  editBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
  },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: '#64748B' },
  emptySubtitle: { fontSize: 13, color: '#94A3B8' },
  emptyBtn: { backgroundColor: C.primary, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  // Info card
  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#EFF6FF', borderRadius: 12,
    borderWidth: 1, borderColor: '#BFDBFE',
    padding: 14, marginBottom: 14,
  },
  infoText: { flex: 1, fontSize: 13, color: '#1D4ED8', lineHeight: 20 },

  // Clinic list
  clinicCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius,
    borderWidth: 1, borderColor: CardSpec.border,
    padding: 14, marginBottom: 10,
    ...Shadows.card,
  },
  clinicIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  clinicName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  clinicSub: { fontSize: 12, color: '#64748B', marginTop: 2 },

  // Clinic override header
  clinicHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  clinicHeaderTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  clinicHeaderSub: { fontSize: 12, color: '#64748B' },
  overrideBadge: {
    backgroundColor: '#EFF6FF', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  overrideBadgeText: { fontSize: 12, color: '#2563EB', fontWeight: '700' },

  // Override row
  overrideRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  overridePrice: { fontSize: 13, fontWeight: '700', color: '#059669' },
  standardPrice: { fontSize: 12, color: '#94A3B8', textDecorationLine: 'line-through' },
  discountBadge: {
    backgroundColor: '#DCFCE7', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  discountText: { fontSize: 11, color: '#059669', fontWeight: '700' },
  stdPriceLabel: { fontSize: 13, color: '#94A3B8' },

  // Toggle chips
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggleChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
  },
  toggleChipActive: { borderColor: C.primary, backgroundColor: '#EFF6FF' },
  toggleChipText: { fontSize: 13, fontWeight: '600', color: '#94A3B8' },
  toggleChipTextActive: { color: C.primary, fontWeight: '700' },

  // Promo card
  promoCard: {
    backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius,
    borderWidth: 1, borderColor: CardSpec.border,
    padding: 16, marginBottom: 12,
    ...Shadows.card,
  },
  promoTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  discountCircle: {
    width: 56, height: 56, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  discountCircleText: { fontSize: 16, fontWeight: '900' },
  promoName: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  promoMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  promoStatus: { fontSize: 12, fontWeight: '700' },
  promoScope: { fontSize: 12, color: '#64748B' },

  promoDates: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  dateChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateChipText: { fontSize: 12, color: '#64748B' },
  editSmallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 7, borderWidth: 1, borderColor: '#E2E8F0',
  },
  editSmallText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
});

const m = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sheet: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    width: '100%', maxWidth: 560, maxHeight: '90%', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.18, shadowRadius: 48,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
  },
  body: { padding: 16 },
  sectionCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14,
    borderWidth: 1, borderColor: '#E9EEF4',
    padding: 16, marginBottom: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
  hint: { fontSize: 12, color: '#64748B', lineHeight: 18, marginBottom: 14 },
  fieldWrap: { marginBottom: 0 },
  fieldLabel: { fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 },
  fieldInput: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF',
    // @ts-ignore
    outlineStyle: 'none',
  },
  twoCol: { flexDirection: 'row', gap: 12 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#F1F5F9' },
  dividerText: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  svcInfoCard: {
    backgroundColor: '#F8FAFC', borderRadius: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
    padding: 14, marginBottom: 12,
  },
  svcInfoLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginBottom: 4 },
  svcInfoName: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  svcInfoPrice: { fontSize: 13, color: '#64748B' },
  footer: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, paddingHorizontal: 24, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  cancelBtn: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  saveBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10,
  },
  saveText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#FECACA',
  },
  deleteText: { fontSize: 13, color: '#DC2626', fontWeight: '600' },
});
