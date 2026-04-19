import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ClinicIcon } from '../../../core/ui/ClinicIcon';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { supabase } from '../../../core/api/supabase';
import { fetchClinics, createClinic, updateClinic, createDoctor, updateDoctor } from '../api';
import { ILLER, ILCELER } from '../data/turkey';

const ERR = '#EF4444';

// ─── Category ─────────────────────────────────────────────────────────────────
type ClinicCategory = 'klinik' | 'poliklinik' | 'hastane' | 'laboratuvar';
const CLINIC_CATEGORIES: { value: ClinicCategory; label: string; icon: string; color: string; bg: string }[] = [
  { value: 'klinik',      label: 'Klinik',      icon: 'tooth-outline',          color: '#2563EB', bg: '#EFF6FF' },
  { value: 'poliklinik',  label: 'Poliklinik',  icon: 'stethoscope',            color: '#7C3AED', bg: '#EDE9FE' },
  { value: 'hastane',     label: 'Hastane',     icon: 'hospital-box-outline',   color: '#059669', bg: '#D1FAE5' },
  { value: 'laboratuvar', label: 'Laboratuvar', icon: 'flask-outline',          color: '#D97706', bg: '#FEF3C7' },
];

// ─── Types ────────────────────────────────────────────────────────────────────
type Clinic = {
  id: string; name: string;
  category?: ClinicCategory | null;
  phone?: string | null; email?: string | null;
  address?: string | null; contact_person?: string | null;
  notes?: string | null; is_active: boolean;
};
type Doctor = {
  id: string; full_name: string;
  phone?: string | null; specialty?: string | null;
  notes?: string | null; clinic_id?: string | null;
  is_active: boolean;
};
type ClinicForm = {
  name: string; category: ClinicCategory; phone: string; email: string;
  il: string; ilce: string; mahalle: string;
  contact_person: string; notes: string; is_active: boolean;
};
type DoctorForm = {
  full_name: string; phone: string; specialty: string;
  notes: string; clinic_id: string; is_active: boolean;
};

const EMPTY_CLINIC: ClinicForm = { name: '', category: 'klinik', phone: '', email: '', il: '', ilce: '', mahalle: '', contact_person: '', notes: '', is_active: true };

function parseAddress(raw?: string | null): { il: string; ilce: string; mahalle: string } {
  if (!raw) return { il: '', ilce: '', mahalle: '' };
  try {
    const p = JSON.parse(raw);
    if (p && typeof p === 'object') return { il: p.il ?? '', ilce: p.ilce ?? '', mahalle: p.mahalle ?? '' };
  } catch {}
  return { il: '', ilce: '', mahalle: raw }; // legacy: put old text in mahalle
}
const EMPTY_DOCTOR: DoctorForm = { full_name: '', phone: '', specialty: '', notes: '', clinic_id: '', is_active: true };

// ─── Screen ───────────────────────────────────────────────────────────────────
interface Props {
  accentColor?: string;
}

export default function ClinicsScreen({ accentColor = '#0F172A' }: Props) {
  const [clinics, setClinics]   = useState<Clinic[]>([]);
  const [doctors, setDoctors]   = useState<Doctor[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search,   setSearch]   = useState('');

  const [showClinicModal, setShowClinicModal] = useState(false);
  const [editingClinic,   setEditingClinic]   = useState<Clinic | null>(null);

  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [editingDoctor,   setEditingDoctor]   = useState<Doctor | null>(null);
  const [defaultClinicId, setDefaultClinicId] = useState('');

  const [activeTab,       setActiveTab]       = useState<'all' | ClinicCategory | 'doctors'>('all');
  const [searchExpanded,  setSearchExpanded]  = useState(false);
  const [searchFocused,   setSearchFocused]   = useState(false);
  const [categoryFilter,  setCategoryFilter]  = useState<ClinicCategory | 'all'>('all');
  const [statusFilter,    setStatusFilter]    = useState<'all' | 'active' | 'inactive'>('all');
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [clinicsRes, doctorsRes] = await Promise.all([
      fetchClinics(),
      supabase.from('doctors').select('*').order('full_name'),
    ]);
    if (!clinicsRes.error && clinicsRes.data) setClinics(clinicsRes.data as Clinic[]);
    if (!doctorsRes.error && doctorsRes.data) setDoctors(doctorsRes.data as Doctor[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleExpand = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleToggleClinic = async (clinic: Clinic) => {
    const val = !clinic.is_active;
    await updateClinic(clinic.id, { is_active: val });
    setClinics(prev => prev.map(c => c.id === clinic.id ? { ...c, is_active: val } : c));
  };

  const handleDeleteClinic = (clinic: Clinic) => {
    Alert.alert('Klinik Sil', `"${clinic.name}" kliniğini silmek istiyor musunuz?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('clinics').delete().eq('id', clinic.id);
        if (!error) setClinics(prev => prev.filter(c => c.id !== clinic.id));
        else Alert.alert('Hata', 'Klinik silinemedi.');
      }},
    ]);
  };

  const handleToggleDoctor = async (doctor: Doctor) => {
    const val = !doctor.is_active;
    await updateDoctor(doctor.id, { is_active: val });
    setDoctors(prev => prev.map(d => d.id === doctor.id ? { ...d, is_active: val } : d));
  };

  const handleDeleteDoctor = (doctor: Doctor) => {
    Alert.alert('Hekim Sil', `"${doctor.full_name}" adlı hekimi silmek istiyor musunuz?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('doctors').delete().eq('id', doctor.id);
        if (!error) setDoctors(prev => prev.filter(d => d.id !== doctor.id));
        else Alert.alert('Hata', 'Hekim silinemedi.');
      }},
    ]);
  };

  const openAddDoctor = (clinicId = '') => {
    setEditingDoctor(null);
    setDefaultClinicId(clinicId);
    setShowDoctorModal(true);
  };

  const openEditDoctor = (doctor: Doctor) => {
    setEditingDoctor(doctor);
    setDefaultClinicId(doctor.clinic_id ?? '');
    setShowDoctorModal(true);
  };

  const getDoctorsByClinic = (clinicId: string) => doctors.filter(d => d.clinic_id === clinicId);
  const unassigned = doctors.filter(d => !d.clinic_id);

  const q = search.trim().toLowerCase();
  const activeFilterCount = (categoryFilter !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);
  // Draft state for filter panel
  const [draftCategory, setDraftCategory] = React.useState<ClinicCategory | 'all'>('all');
  const [draftStatus,   setDraftStatus]   = React.useState<'all' | 'active' | 'inactive'>('all');

  const openFilter = () => {
    setDraftCategory(categoryFilter);
    setDraftStatus(statusFilter);
    setShowFilterSheet(true);
  };
  const applyFilter = () => {
    setCategoryFilter(draftCategory);
    setStatusFilter(draftStatus);
    setShowFilterSheet(false);
  };
  const filteredClinics = clinics.filter(c => {
    if (activeTab !== 'all' && activeTab !== 'doctors' && c.category !== activeTab) return false;
    if (categoryFilter !== 'all' && c.category !== categoryFilter) return false;
    if (statusFilter === 'active' && !c.is_active) return false;
    if (statusFilter === 'inactive' && c.is_active) return false;
    if (!q) return true;
    if (c.name.toLowerCase().includes(q)) return true;
    if (c.contact_person?.toLowerCase().includes(q)) return true;
    return getDoctorsByClinic(c.id).some(d => d.full_name.toLowerCase().includes(q));
  });

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

        {/* Toolbar row */}
        <View style={s.toolbarRow}>
          {/* Category + Doctors tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.tabsScroll}
            contentContainerStyle={s.tabsContent}
          >
            <View style={s.tabBar}>
              {([
                { value: 'all',         label: 'Tümü' },
                { value: 'klinik',      label: 'Klinik' },
                { value: 'poliklinik',  label: 'Poliklinik' },
                { value: 'hastane',     label: 'Hastane' },
                { value: 'laboratuvar', label: 'Laboratuvar' },
                { value: 'doctors',     label: 'Hekimler' },
              ] as { value: string; label: string }[]).map(tab => {
                const active = activeTab === tab.value;
                return (
                  <TouchableOpacity
                    key={tab.value}
                    style={[s.tabItem, active && s.tabItemActive]}
                    onPress={() => setActiveTab(tab.value as any)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.tabText, active && s.tabTextActive]}>{tab.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={s.rightGroup}>
            {/* Search icon */}
            <TouchableOpacity
              style={[s.iconBtn, (searchExpanded || search.length > 0) && s.iconBtnActive]}
              onPress={() => setSearchExpanded(!searchExpanded)}
              activeOpacity={0.75}
            >
              <Feather name="search" size={18} color={(searchExpanded || search.length > 0) ? '#0F172A' : '#94A3B8'} />
            </TouchableOpacity>

            {/* Filter icon — only for clinics tabs */}
            {activeTab !== 'doctors' && (
              <TouchableOpacity
                style={[s.iconBtn, activeFilterCount > 0 && s.iconBtnActive]}
                onPress={openFilter}
                activeOpacity={0.75}
              >
                <MaterialCommunityIcons name={'tune-variant' as any} size={18} color={activeFilterCount > 0 ? '#0F172A' : '#94A3B8'} />
                {activeFilterCount > 0 && (
                  <View style={s.filterBadge}>
                    <Text style={s.filterBadgeText}>{activeFilterCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}

            {/* Add button */}
            <TouchableOpacity
              style={[s.addBtn, { backgroundColor: accentColor }]}
              onPress={() => {
                if (activeTab === 'doctors') { setEditingDoctor(null); setDefaultClinicId(''); setShowDoctorModal(true); }
                else { setEditingClinic(null); setShowClinicModal(true); }
              }}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={15} color="#FFFFFF" />
              <Text style={s.addBtnText}>{activeTab === 'doctors' ? 'Hekim Ekle' : 'Sağlık Kurumu Ekle'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Expandable search row */}
        {(searchExpanded || search.length > 0) && (
          <View style={s.searchRow}>
            <View style={[s.searchWrap, searchFocused && s.searchWrapFocused]}>
              <Feather name="search" size={16} color={searchFocused ? '#0F172A' : '#AEAEB2'} />
              <TextInput
                style={s.searchInput}
                value={search}
                onChangeText={setSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={activeTab === 'doctors' ? 'Hekim ara...' : 'Klinik ara...'}
                placeholderTextColor="#AEAEB2"
                returnKeyType="search"
                autoFocus={searchExpanded && search.length === 0}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => { setSearch(''); setSearchExpanded(false); }}>
                  <Feather name="x-circle" size={15} color="#AEAEB2" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={accentColor} style={{ marginTop: 60 }} />
        ) : activeTab === 'doctors' ? (
          // ── Doctors tab ──
          (() => {
            const filteredDoctors = doctors.filter(d => {
              if (!q) return true;
              return d.full_name.toLowerCase().includes(q) || d.specialty?.toLowerCase().includes(q) || d.phone?.includes(q);
            });
            if (filteredDoctors.length === 0) return (
              <View style={s.empty}>
                <Feather name="search" size={36} color="#E5E7EB" />
                <Text style={s.emptyTitle}>{q ? 'Sonuç bulunamadı' : 'Henüz hekim eklenmemiş'}</Text>
                <Text style={s.emptySub}>{q ? `"${q}" ile eşleşen hekim yok` : 'İlk hekimi ekleyerek başlayın'}</Text>
              </View>
            );
            return (
              <View style={tbl.card}>
                {/* Table header */}
                <View style={tbl.headerRow}>
                  <Text style={[tbl.hCell, { flex: 2.8 }]}>HEKİM</Text>
                  <Text style={[tbl.hCell, { flex: 1.5 }]}>UZMANLIK</Text>
                  <Text style={[tbl.hCell, { flex: 1.8 }]}>KLİNİK</Text>
                  <Text style={[tbl.hCell, { flex: 1.4 }]}>TELEFON</Text>
                  <Text style={[tbl.hCell, { flex: 0.9, textAlign: 'center' }]}>DURUM</Text>
                  <View style={{ width: 76 }} />
                </View>
                {filteredDoctors.map((d, i) => {
                  const clinicName = clinics.find(c => c.id === d.clinic_id)?.name;
                  return (
                    <View key={d.id} style={[tbl.row, !d.is_active && tbl.rowInactive, i < filteredDoctors.length - 1 && tbl.rowBorder]}>
                      {/* HEKİM */}
                      <View style={[tbl.col, { flex: 2.8, gap: 10 }]}>
                        <View style={[tbl.catDot, { backgroundColor: accentColor + '18' }]}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: accentColor }}>
                            {d.full_name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={tbl.name} numberOfLines={1}>{d.full_name}</Text>
                          {!d.is_active && (
                            <View style={[tbl.inactivePill, { marginTop: 2, alignSelf: 'flex-start' }]}>
                              <Text style={tbl.inactivePillText}>PASİF</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      {/* UZMANLIK */}
                      <Text style={[tbl.cell, { flex: 1.5 }]} numberOfLines={1}>
                        {d.specialty || <Text style={tbl.cellMuted}>—</Text>}
                      </Text>
                      {/* KLİNİK */}
                      <Text style={[clinicName ? tbl.cell : tbl.cellMuted, { flex: 1.8 }]} numberOfLines={1}>
                        {clinicName ?? '—'}
                      </Text>
                      {/* TELEFON */}
                      <Text style={[d.phone ? tbl.cell : tbl.cellMuted, { flex: 1.4 }]} numberOfLines={1}>
                        {d.phone ?? '—'}
                      </Text>
                      {/* DURUM */}
                      <View style={[tbl.col, { flex: 0.9, justifyContent: 'center' }]}>
                        <AppSwitch
                          value={d.is_active}
                          onValueChange={() => handleToggleDoctor(d)}
                          accentColor={accentColor}
                        />
                      </View>
                      {/* ACTIONS */}
                      <View style={tbl.actions}>
                        <TouchableOpacity style={tbl.iconBtn} onPress={() => openEditDoctor(d)} activeOpacity={0.7}>
                          <Feather name="edit-2" size={14} color="#6C6C70" />
                        </TouchableOpacity>
                        <TouchableOpacity style={tbl.iconBtn} onPress={() => handleDeleteDoctor(d)} activeOpacity={0.7}>
                          <Feather name="trash-2" size={14} color={ERR} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })()
        ) : clinics.length === 0 ? (
          <View style={s.empty}>
            <ClinicIcon size={44} color="#AEAEB2" />
            <Text style={s.emptyTitle}>Henüz klinik eklenmemiş</Text>
            <Text style={s.emptySub}>İlk kliniği ekleyerek başlayın</Text>
          </View>
        ) : filteredClinics.length === 0 ? (
          <View style={s.empty}>
            <Feather name="search" size={36} color="#E5E7EB" />
            <Text style={s.emptyTitle}>Sonuç bulunamadı</Text>
            <Text style={s.emptySub}>"{search}" ile eşleşen kayıt yok</Text>
          </View>
        ) : (
          <>
            {/* ── Table Card ── */}
            <View style={tbl.card}>
              {/* Table header */}
              <View style={tbl.headerRow}>
                <Text style={[tbl.hCell, { flex: 2.8 }]}>KLİNİK</Text>
                <Text style={[tbl.hCell, { flex: 1.1 }]}>KATEGORİ</Text>
                <Text style={[tbl.hCell, { flex: 0.7, textAlign: 'center' }]}>HEKİM</Text>
                <Text style={[tbl.hCell, { flex: 1.4 }]}>TELEFON</Text>
                <Text style={[tbl.hCell, { flex: 0.9, textAlign: 'center' }]}>DURUM</Text>
                <View style={{ width: 76 }} />
              </View>

              {filteredClinics.map((clinic, idx) => (
                <ClinicRow
                  key={clinic.id}
                  clinic={clinic}
                  doctors={getDoctorsByClinic(clinic.id)}
                  isExpanded={expanded.has(clinic.id)}
                  isLast={idx === filteredClinics.length - 1}
                  accentColor={accentColor}
                  onToggleExpand={() => toggleExpand(clinic.id)}
                  onToggleClinic={() => handleToggleClinic(clinic)}
                  onEditClinic={() => { setEditingClinic(clinic); setShowClinicModal(true); }}
                  onDeleteClinic={() => handleDeleteClinic(clinic)}
                  onAddDoctor={() => openAddDoctor(clinic.id)}
                  onToggleDoctor={handleToggleDoctor}
                  onEditDoctor={openEditDoctor}
                  onDeleteDoctor={handleDeleteDoctor}
                />
              ))}
            </View>

            {/* ── Kliniksiz Hekimler ── */}
            {unassigned.length > 0 && (
              <View style={s.unassignedSection}>
                <View style={s.unassignedHeader}>
                  <Feather name="user-x" size={13} color="#AEAEB2" />
                  <Text style={s.unassignedLabel}>Kliniksiz Hekimler</Text>
                  <View style={s.countBadge}>
                    <Text style={s.countBadgeText}>{unassigned.length}</Text>
                  </View>
                </View>
                <View style={tbl.card}>
                  {unassigned.map((d, i) => (
                    <DoctorRow
                      key={d.id}
                      doctor={d}
                      isLast={i === unassigned.length - 1}
                      accentColor={accentColor}
                      onToggle={() => handleToggleDoctor(d)}
                      onEdit={() => openEditDoctor(d)}
                      onDelete={() => handleDeleteDoctor(d)}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <ClinicModal
        visible={showClinicModal}
        editingClinic={editingClinic}
        existingClinics={clinics}
        accentColor={accentColor}
        onClose={() => { setShowClinicModal(false); setEditingClinic(null); }}
        onSuccess={() => { setShowClinicModal(false); setEditingClinic(null); loadData(); }}
      />

      <DoctorModal
        visible={showDoctorModal}
        editingDoctor={editingDoctor}
        clinics={clinics}
        defaultClinicId={defaultClinicId}
        accentColor={accentColor}
        onClose={() => { setShowDoctorModal(false); setEditingDoctor(null); }}
        onSuccess={() => { setShowDoctorModal(false); setEditingDoctor(null); loadData(); }}
      />

      {/* Filter Panel */}
      <Modal visible={showFilterSheet} transparent animationType="fade" onRequestClose={() => setShowFilterSheet(false)}>
        <TouchableOpacity style={fp.backdrop} activeOpacity={1} onPress={() => setShowFilterSheet(false)}>
          <View style={fp.panel} onStartShouldSetResponder={() => true}>

            {/* Header */}
            <View style={fp.header}>
              <View style={fp.headerLeft}>
                <MaterialCommunityIcons name={'tune-variant' as any} size={16} color="#0F172A" />
                <Text style={fp.headerTitle}>Filtrele</Text>
                {activeFilterCount > 0 && (
                  <View style={fp.countBadge}>
                    <Text style={fp.countBadgeText}>{activeFilterCount}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => { setDraftCategory('all'); setDraftStatus('all'); }} activeOpacity={0.7}>
                <Text style={fp.clearText}>Temizle</Text>
              </TouchableOpacity>
            </View>

            <View style={fp.divider} />

            {/* Kategori */}
            <View style={fp.section}>
              <Text style={fp.sectionLabel}>Kategori</Text>
              <View style={fp.chipRow}>
                {([{ value: 'all', label: 'Tümü' }, ...CLINIC_CATEGORIES] as const).map(item => {
                  const active = draftCategory === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      style={[fp.chip, active && fp.chipActive]}
                      onPress={() => setDraftCategory(item.value as any)}
                      activeOpacity={0.7}
                    >
                      <Text style={[fp.chipText, active && fp.chipTextActive]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={fp.divider} />

            {/* Durum */}
            <View style={fp.section}>
              <Text style={fp.sectionLabel}>Durum</Text>
              <View style={fp.chipRow}>
                {([{ value: 'all', label: 'Tümü' }, { value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Pasif' }] as const).map(item => {
                  const active = draftStatus === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      style={[fp.chip, active && fp.chipActive]}
                      onPress={() => setDraftStatus(item.value)}
                      activeOpacity={0.7}
                    >
                      <Text style={[fp.chipText, active && fp.chipTextActive]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={fp.divider} />

            <View style={fp.footer}>
              <TouchableOpacity style={fp.cancelBtn} onPress={() => setShowFilterSheet(false)} activeOpacity={0.7}>
                <Text style={fp.cancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={fp.applyBtn} onPress={applyFilter} activeOpacity={0.7}>
                <Text style={fp.applyText}>Uygula</Text>
              </TouchableOpacity>
            </View>

          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Clinic Row (table row with accordion) ────────────────────────────────────
function ClinicRow({
  clinic, doctors, isExpanded, isLast, accentColor,
  onToggleExpand, onToggleClinic, onEditClinic, onDeleteClinic,
  onAddDoctor, onToggleDoctor, onEditDoctor, onDeleteDoctor,
}: {
  clinic: Clinic; doctors: Doctor[]; isExpanded: boolean; isLast: boolean; accentColor: string;
  onToggleExpand: () => void; onToggleClinic: () => void;
  onEditClinic: () => void; onDeleteClinic: () => void;
  onAddDoctor: () => void;
  onToggleDoctor: (d: Doctor) => void;
  onEditDoctor: (d: Doctor) => void;
  onDeleteDoctor: (d: Doctor) => void;
}) {
  const cat = CLINIC_CATEGORIES.find(c => c.value === (clinic.category ?? 'klinik')) ?? CLINIC_CATEGORIES[0];

  return (
    <View style={[!isLast && tbl.rowBorder]}>
      {/* Table row */}
      <TouchableOpacity style={[tbl.row, !clinic.is_active && tbl.rowInactive]} onPress={onToggleExpand} activeOpacity={0.7}>

        {/* Clinic name */}
        <View style={[tbl.col, { flex: 2.8, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
          <View style={[tbl.catDot, { backgroundColor: cat.color + '18' }]}>
            <MaterialCommunityIcons name={cat.icon as any} size={14} color={cat.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={tbl.name} numberOfLines={1}>{clinic.name}</Text>
            {clinic.contact_person ? (
              <Text style={tbl.meta} numberOfLines={1}>{clinic.contact_person}</Text>
            ) : null}
          </View>
          {!clinic.is_active && (
            <View style={tbl.inactivePill}><Text style={tbl.inactivePillText}>PASİF</Text></View>
          )}
        </View>

        {/* Category */}
        <View style={[tbl.col, { flex: 1.1 }]}>
          <View style={[tbl.badge, { backgroundColor: cat.bg }]}>
            <Text style={[tbl.badgeText, { color: cat.color }]}>{cat.label}</Text>
          </View>
        </View>

        {/* Doctor count */}
        <Text style={[tbl.cell, { flex: 0.7, textAlign: 'center' }]}>
          {doctors.length > 0 ? doctors.length : '—'}
        </Text>

        {/* Phone */}
        <Text style={[tbl.cellMuted, { flex: 1.4 }]} numberOfLines={1}>
          {clinic.phone || '—'}
        </Text>

        {/* Status */}
        <View style={[tbl.col, { flex: 0.9, alignItems: 'center' }]}>
          <View style={[tbl.statusPill, { backgroundColor: clinic.is_active ? '#D1FAE5' : '#F3F4F6' }]}>
            <Text style={[tbl.statusPillText, { color: clinic.is_active ? '#059669' : '#9CA3AF' }]}>
              {clinic.is_active ? 'Aktif' : 'Pasif'}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={tbl.actions}>
          <TouchableOpacity style={tbl.iconBtn} onPress={(e) => { e.stopPropagation?.(); onEditClinic(); }} activeOpacity={0.7}>
            <Feather name="edit-2" size={13} color="#6C6C70" />
          </TouchableOpacity>
          <TouchableOpacity style={tbl.iconBtn} onPress={(e) => { e.stopPropagation?.(); onDeleteClinic(); }} activeOpacity={0.7}>
            <Feather name="trash-2" size={13} color={ERR} />
          </TouchableOpacity>
          <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#AEAEB2" />
        </View>
      </TouchableOpacity>

      {/* Expanded body */}
      {isExpanded && (
        <View style={tbl.expanded}>

          {/* Clinic info */}
          {(clinic.phone || clinic.email || clinic.address) && (
            <View style={tbl.detailBlock}>
              {clinic.phone   && <InfoRow icon="phone"   text={clinic.phone} />}
              {clinic.email   && <InfoRow icon="mail"    text={clinic.email} />}
              {clinic.address && (() => {
                const a = parseAddress(clinic.address);
                const display = [a.mahalle, a.ilce, a.il].filter(Boolean).join(', ');
                return <InfoRow icon="map-pin" text={display || clinic.address} />;
              })()}
            </View>
          )}

          {/* Doctors */}
          {doctors.length > 0 && (
            <View>
              <Text style={tbl.subLabel}>HEKİMLER</Text>
              {doctors.map((d, i) => (
                <DoctorRow
                  key={d.id}
                  doctor={d}
                  isLast={i === doctors.length - 1}
                  accentColor={accentColor}
                  onToggle={() => onToggleDoctor(d)}
                  onEdit={() => onEditDoctor(d)}
                  onDelete={() => onDeleteDoctor(d)}
                />
              ))}
            </View>
          )}

          {/* Add doctor + toggle footer */}
          <View style={tbl.expandedFooter}>
            <TouchableOpacity style={tbl.addDoctorBtn} onPress={onAddDoctor} activeOpacity={0.7}>
              <Feather name="user-plus" size={13} color="#6C6C70" />
              <Text style={tbl.addDoctorText}>Bu kliniğe hekim ekle</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <AppSwitch
              value={clinic.is_active}
              onValueChange={onToggleClinic}
              accentColor={accentColor}
            />
            <Text style={tbl.activeLabel}>{clinic.is_active ? 'Aktif' : 'Pasif'}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Doctor Row ───────────────────────────────────────────────────────────────
function DoctorRow({
  doctor, isLast, accentColor, clinicName, onToggle, onEdit, onDelete,
}: {
  doctor: Doctor; isLast?: boolean; accentColor: string; clinicName?: string;
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  return (
    <View style={[dr.row, !isLast && dr.rowBorder, !doctor.is_active && dr.rowInactive]}>
      <View style={[dr.avatar, { backgroundColor: accentColor + '18' }]}>
        <Text style={[dr.avatarText, { color: accentColor }]}>{doctor.full_name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[dr.name, !doctor.is_active && dr.nameInactive]} numberOfLines={1}>
          {doctor.full_name}
        </Text>
        {(doctor.specialty || doctor.phone || clinicName) ? (
          <Text style={dr.sub} numberOfLines={1}>
            {[doctor.specialty, clinicName ? `🏥 ${clinicName}` : null, doctor.phone].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
      <AppSwitch
        value={doctor.is_active}
        onValueChange={onToggle}
        accentColor={accentColor}
      />
      <TouchableOpacity style={dr.iconBtn} onPress={onEdit} activeOpacity={0.7}>
        <Feather name="edit-2" size={14} color="#6C6C70" />
      </TouchableOpacity>
      <TouchableOpacity style={dr.iconBtn} onPress={onDelete} activeOpacity={0.7}>
        <Feather name="trash-2" size={14} color={ERR} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Info Row ─────────────────────────────────────────────────────────────────
function InfoRow({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Feather name={icon} size={12} color="#AEAEB2" />
      <Text style={{ fontSize: 12, color: '#6C6C70', flex: 1 }} numberOfLines={1}>{text}</Text>
    </View>
  );
}

// ─── Clinic Modal ─────────────────────────────────────────────────────────────
function ClinicModal({
  visible, editingClinic, existingClinics, accentColor, onClose, onSuccess,
}: {
  visible: boolean; editingClinic: Clinic | null; existingClinics: Clinic[];
  accentColor: string; onClose: () => void; onSuccess: () => void;
}) {
  const [form,        setForm]        = useState<ClinicForm>(EMPTY_CLINIC);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [ilSearch,    setIlSearch]    = useState('');
  const [ilOpen,      setIlOpen]      = useState(false);
  const [ilceSearch,  setIlceSearch]  = useState('');
  const [ilceOpen,    setIlceOpen]    = useState(false);

  useEffect(() => {
    if (editingClinic) {
      const addr = parseAddress(editingClinic.address);
      setForm({
        name: editingClinic.name,
        category: editingClinic.category ?? 'klinik',
        phone: editingClinic.phone ?? '',
        email: editingClinic.email ?? '',
        il: addr.il, ilce: addr.ilce, mahalle: addr.mahalle,
        contact_person: editingClinic.contact_person ?? '',
        notes: editingClinic.notes ?? '',
        is_active: editingClinic.is_active,
      });
    } else {
      setForm(EMPTY_CLINIC);
    }
    setError('');
    setIlOpen(false); setIlceOpen(false);
    setIlSearch(''); setIlceSearch('');
  }, [editingClinic, visible]);

  const set = (k: keyof ClinicForm, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError('');
    if (!form.name.trim())            { setError('Kurum adı zorunludur'); return; }
    if (isDuplicate)                   { setError('Bu isimde bir kurum zaten mevcut'); return; }
    if (!form.contact_person.trim())   { setError('İrtibat kişisi zorunludur'); return; }
    if (!form.phone.trim())            { setError('Telefon zorunludur'); return; }
    if (!form.il.trim())               { setError('İl zorunludur'); return; }
    if (!form.ilce.trim())             { setError('İlçe zorunludur'); return; }
    if (!form.mahalle.trim())          { setError('Adres zorunludur'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), category: form.category,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: JSON.stringify({ il: form.il.trim(), ilce: form.ilce.trim(), mahalle: form.mahalle.trim() }),
        contact_person: form.contact_person.trim(),
        notes: form.notes.trim() || undefined,
        is_active: form.is_active,
      };
      const { error: err } = editingClinic
        ? await updateClinic(editingClinic.id, payload)
        : await createClinic({ name: payload.name, ...payload });
      if (err) { setError(err.message ?? 'Bir hata oluştu'); return; }
      onSuccess();
    } catch (e: any) { setError(e.message ?? 'Bir hata oluştu'); }
    finally { setSaving(false); }
  };

  const nameQ = form.name.trim().toLowerCase();
  const otherclinics = existingClinics.filter(c => c.id !== editingClinic?.id);
  const suggestions = nameQ.length >= 1
    ? otherclinics.filter(c => c.name.toLowerCase().includes(nameQ))
    : [];
  const isDuplicate = nameQ.length > 0 &&
    otherclinics.some(c => c.name.toLowerCase() === nameQ);

  const ilResults    = ILLER.filter(il => il.toLowerCase().includes(ilSearch.toLowerCase()));
  const ilceResults  = (form.il ? (ILCELER[form.il] ?? []) : [])
    .filter(d => d.toLowerCase().includes(ilceSearch.toLowerCase()));

  const selectIl = (il: string) => {
    set('il', il); set('ilce', ''); set('mahalle', '');
    setIlOpen(false); setIlSearch('');
  };
  const selectIlce = (ilce: string) => {
    set('ilce', ilce); setIlceOpen(false); setIlceSearch('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={m.overlay}>
        <View style={m.sheet}>
          {/* Header */}
          <View style={m.header}>
            <Text style={m.title}>{editingClinic ? 'Sağlık Kurumu Düzenle' : 'Sağlık Kurumu Ekle'}</Text>
            <TouchableOpacity onPress={onClose} style={m.closeBtn}>
              <Feather name="x" size={18} color="#6C6C70" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={m.body}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Kategori ── */}
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Kategori</Text>
              <View style={m.catGrid}>
                {CLINIC_CATEGORIES.map(cat => {
                  const active = form.category === cat.value;
                  return (
                    <TouchableOpacity
                      key={cat.value}
                      style={[m.catChip, active && { borderColor: cat.color, backgroundColor: cat.bg }]}
                      onPress={() => set('category', cat.value)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name={cat.icon as any} size={18} color={active ? cat.color : '#AEAEB2'} />
                      <Text style={[m.catChipText, active && { color: cat.color }]}>{cat.label}</Text>
                      {active && <Feather name="check" size={13} color={cat.color} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* ── Kurum Bilgileri ── */}
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Kurum Bilgileri</Text>

              {/* Kurum Adı */}
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>Kurum Adı <Text style={m.req}>*</Text></Text>
                <TextInput
                  style={[m.fieldInput, isDuplicate && { color: '#DC2626' }]}
                  value={form.name}
                  onChangeText={v => set('name', v)}
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => setTimeout(() => setNameFocused(false), 150)}
                  placeholder="Örn: Merkez Diş Kliniği"
                  placeholderTextColor="#C7C7CC"
                  autoCorrect={false}
                />
                {(isDuplicate || (nameFocused && suggestions.length > 0 && !isDuplicate)) && (
                  <View style={m.suggestBox}>
                    {isDuplicate ? (
                      <View style={m.dupRow}>
                        <Feather name="alert-circle" size={13} color="#DC2626" />
                        <Text style={m.dupText}>Bu kurum zaten eklenmiş</Text>
                      </View>
                    ) : suggestions.slice(0, 5).map((c, i) => {
                      const cat = CLINIC_CATEGORIES.find(x => x.value === c.category);
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[m.suggestItem, i < Math.min(suggestions.length, 5) - 1 && m.suggestItemBorder]}
                          onPress={() => { set('name', c.name); setNameFocused(false); }}
                          activeOpacity={0.7}
                        >
                          {cat && <View style={[m.suggestIcon, { backgroundColor: cat.color + '18' }]}>
                            <MaterialCommunityIcons name={cat.icon as any} size={12} color={cat.color} />
                          </View>}
                          <Text style={m.suggestName} numberOfLines={1}>{c.name}</Text>
                          <View style={m.existsBadge}><Text style={m.existsBadgeText}>Kayıtlı</Text></View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>İrtibat Kişisi <Text style={m.req}>*</Text></Text>
                <TextInput style={m.fieldInput} value={form.contact_person} onChangeText={v => set('contact_person', v)}
                  placeholder="Örn: Mehmet Bey" placeholderTextColor="#C7C7CC" />
              </View>

              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>Telefon <Text style={m.req}>*</Text></Text>
                <TextInput style={m.fieldInput} value={form.phone} onChangeText={v => set('phone', v)}
                  placeholder="0555 000 00 00" placeholderTextColor="#C7C7CC" keyboardType="phone-pad" />
              </View>

              <View style={[m.fieldWrap, { marginBottom: 0 }]}>
                <Text style={m.fieldLabel}>E-posta</Text>
                <TextInput style={m.fieldInput} value={form.email} onChangeText={v => set('email', v)}
                  placeholder="info@klinik.com" placeholderTextColor="#C7C7CC"
                  keyboardType="email-address" autoCapitalize="none" />
              </View>
            </View>

            {/* ── Adres ── */}
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Adres</Text>

              {/* İl */}
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>İl <Text style={m.req}>*</Text></Text>
                <TouchableOpacity
                  style={m.fieldDropdown}
                  onPress={() => { setIlOpen(v => !v); setIlceOpen(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[m.fieldDropdownText, !form.il && m.fieldPlaceholder]}>
                    {form.il || 'Seçiniz'}
                  </Text>
                  <Feather name={ilOpen ? 'chevron-up' : 'chevron-down'} size={15} color="#C7C7CC" />
                </TouchableOpacity>
                {ilOpen && (
                  <View style={m.dropBox}>
                    <View style={m.dropSearch}>
                      <Feather name="search" size={14} color="#AEAEB2" />
                      <TextInput
                        style={m.dropSearchInput}
                        value={ilSearch}
                        onChangeText={setIlSearch}
                        placeholder="İl ara..."
                        placeholderTextColor="#C7C7CC"
                        autoFocus
                      />
                    </View>
                    <ScrollView style={m.dropList} nestedScrollEnabled keyboardShouldPersistTaps="always">
                      {ilResults.map((il, i) => (
                        <TouchableOpacity
                          key={il}
                          style={[m.dropItem, i < ilResults.length - 1 && m.dropItemBorder, form.il === il && m.dropItemActive]}
                          onPress={() => selectIl(il)}
                          activeOpacity={0.7}
                        >
                          <Text style={[m.dropItemText, form.il === il && { color: accentColor, fontWeight: '600' }]}>{il}</Text>
                          {form.il === il && <Feather name="check" size={14} color={accentColor} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* İlçe */}
              <View style={m.fieldWrap}>
                <Text style={m.fieldLabel}>İlçe <Text style={m.req}>*</Text></Text>
                <TouchableOpacity
                  style={[m.fieldDropdown, !form.il && { opacity: 0.4 }]}
                  onPress={() => { if (!form.il) return; setIlceOpen(v => !v); setIlOpen(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[m.fieldDropdownText, !form.ilce && m.fieldPlaceholder]}>
                    {form.ilce || (form.il ? 'Seçiniz' : 'Önce il seçin')}
                  </Text>
                  <Feather name={ilceOpen ? 'chevron-up' : 'chevron-down'} size={15} color="#C7C7CC" />
                </TouchableOpacity>
                {ilceOpen && (
                  <View style={m.dropBox}>
                    <View style={m.dropSearch}>
                      <Feather name="search" size={14} color="#AEAEB2" />
                      <TextInput
                        style={m.dropSearchInput}
                        value={ilceSearch}
                        onChangeText={setIlceSearch}
                        placeholder="İlçe ara..."
                        placeholderTextColor="#C7C7CC"
                        autoFocus
                      />
                    </View>
                    <ScrollView style={m.dropList} nestedScrollEnabled keyboardShouldPersistTaps="always">
                      {ilceResults.map((ilce, i) => (
                        <TouchableOpacity
                          key={ilce}
                          style={[m.dropItem, i < ilceResults.length - 1 && m.dropItemBorder, form.ilce === ilce && m.dropItemActive]}
                          onPress={() => selectIlce(ilce)}
                          activeOpacity={0.7}
                        >
                          <Text style={[m.dropItemText, form.ilce === ilce && { color: accentColor, fontWeight: '600' }]}>{ilce}</Text>
                          {form.ilce === ilce && <Feather name="check" size={14} color={accentColor} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Adres */}
              <View style={[m.fieldWrap, { marginBottom: 0 }]}>
                <Text style={m.fieldLabel}>Adres <Text style={m.req}>*</Text></Text>
                <TextInput style={m.fieldInput} value={form.mahalle} onChangeText={v => set('mahalle', v)}
                  placeholder="Örn: Moda Mahallesi" placeholderTextColor="#C7C7CC" autoCapitalize="words" />
              </View>
            </View>

            {/* ── Notlar ── */}
            <View style={m.sectionCard}>
              <Text style={m.sectionTitle}>Notlar</Text>
              <TextInput
                style={[m.fieldInput, { minHeight: 72, textAlignVertical: 'top' }]}
                value={form.notes}
                onChangeText={v => set('notes', v)}
                placeholder="İsteğe bağlı notlar..."
                placeholderTextColor="#C7C7CC"
                multiline
                numberOfLines={3}
              />
            </View>

            {/* ── Durum ── */}
            <View style={m.sectionCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={m.fieldLabel}>Aktif</Text>
                <AppSwitch value={form.is_active} onValueChange={v => set('is_active', v)}
                  accentColor={accentColor} />
              </View>
            </View>

            {error ? (
              <View style={m.errorBox}>
                <Feather name="alert-circle" size={13} color="#DC2626" />
                <Text style={m.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={{ height: 8 }} />
          </ScrollView>

          {/* Footer */}
          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={m.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.saveBtn, { backgroundColor: accentColor }, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={m.saveText}>{editingClinic ? 'Güncelle' : 'Ekle'}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Doctor Modal ─────────────────────────────────────────────────────────────
function DoctorModal({
  visible, editingDoctor, clinics, defaultClinicId, accentColor, onClose, onSuccess,
}: {
  visible: boolean; editingDoctor: Doctor | null; clinics: Clinic[];
  defaultClinicId: string; accentColor: string;
  onClose: () => void; onSuccess: () => void;
}) {
  const [form,   setForm]   = useState<DoctorForm>(EMPTY_DOCTOR);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    setForm(editingDoctor ? {
      full_name: editingDoctor.full_name, phone: editingDoctor.phone ?? '',
      specialty: editingDoctor.specialty ?? '', notes: editingDoctor.notes ?? '',
      clinic_id: editingDoctor.clinic_id ?? '', is_active: editingDoctor.is_active,
    } : { ...EMPTY_DOCTOR, clinic_id: defaultClinicId });
    setError('');
  }, [editingDoctor, defaultClinicId, visible]);

  const set = (k: keyof DoctorForm, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError('');
    if (!form.full_name.trim()) { setError('Ad Soyad zorunludur'); return; }
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        specialty: form.specialty.trim() || null,
        notes: form.notes.trim() || null,
        clinic_id: form.clinic_id || null,
        is_active: form.is_active,
      };
      const { error: err } = editingDoctor
        ? await updateDoctor(editingDoctor.id, payload)
        : await createDoctor(payload);
      if (err) { setError(err.message ?? 'Bir hata oluştu'); return; }
      onSuccess();
    } catch (e: any) { setError(e.message ?? 'Bir hata oluştu'); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={dm.overlay}>
        <View style={dm.popup}>
          <View style={dm.header}>
            <Text style={dm.title}>{editingDoctor ? 'Hekim Düzenle' : 'Yeni Hekim'}</Text>
            <TouchableOpacity onPress={onClose} style={dm.closeBtn}>
              <Feather name="x" size={16} color="#64748B" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={dm.body} keyboardShouldPersistTaps="handled">
            <View style={dm.sectionCard}>
              <Text style={dm.sectionTitle}>Hekim Bilgileri</Text>
              <Field label="Ad Soyad *">
                <TextInput style={dm.input} value={form.full_name} onChangeText={v => set('full_name', v)}
                  placeholder="Örn: Dr. Ayşe Kaya" placeholderTextColor="#C7C7CC" />
              </Field>
              <Field label="Uzmanlık">
                <TextInput style={dm.input} value={form.specialty} onChangeText={v => set('specialty', v)}
                  placeholder="Örn: Ortodonti" placeholderTextColor="#C7C7CC" />
              </Field>
              <Field label="Telefon">
                <TextInput style={dm.input} value={form.phone} onChangeText={v => set('phone', v)}
                  placeholder="0555 000 00 00" placeholderTextColor="#C7C7CC" keyboardType="phone-pad" />
              </Field>
              <Text style={dm.fieldLabel}>Klinik</Text>
              <ClinicDropdown value={form.clinic_id} clinics={clinics} accentColor={accentColor} onChange={id => set('clinic_id', id)} />
            </View>
            <View style={dm.sectionCard}>
              <Text style={dm.sectionTitle}>Ek Bilgiler</Text>
              <Field label="Notlar">
                <TextInput style={[dm.input, dm.multiline]} value={form.notes} onChangeText={v => set('notes', v)}
                  placeholder="İsteğe bağlı notlar..." placeholderTextColor="#C7C7CC"
                  multiline numberOfLines={3} textAlignVertical="top" />
              </Field>
              <View style={dm.toggleRow}>
                <Text style={dm.fieldLabel}>Aktif</Text>
                <AppSwitch value={form.is_active} onValueChange={v => set('is_active', v)}
                  accentColor={accentColor} />
              </View>
            </View>
            {error ? <ErrorBox msg={error} /> : null}
          </ScrollView>
          <View style={dm.footer}>
            <TouchableOpacity style={dm.cancelBtn} onPress={onClose}>
              <Text style={dm.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[dm.saveBtn, { backgroundColor: accentColor }, saving && dm.saveBtnOff]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                <>
                  <Feather name="check" size={15} color="#FFFFFF" />
                  <Text style={dm.saveText}>{editingDoctor ? 'Güncelle' : 'Hekim Ekle'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Clinic Dropdown ──────────────────────────────────────────────────────────
function ClinicDropdown({ value, clinics, accentColor, onChange }: {
  value: string; clinics: Clinic[]; accentColor: string; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = clinics.find(c => c.id === value);

  return (
    <View style={{ marginBottom: 14 }}>
      <TouchableOpacity
        style={[dd.trigger, open && dd.triggerOpen]}
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.8}
      >
        <View style={dd.triggerLeft}>
          <Feather name="briefcase" size={15} color={selected ? accentColor : '#AEAEB2'} />
          <Text style={[dd.triggerText, !selected && dd.triggerPlaceholder]} numberOfLines={1}>
            {selected ? selected.name : 'Klinik seçin...'}
          </Text>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#AEAEB2" />
      </TouchableOpacity>
      {open && (
        <View style={dd.list}>
          <TouchableOpacity style={[dd.item, dd.itemBorder]} onPress={() => { onChange(''); setOpen(false); }} activeOpacity={0.7}>
            <Feather name="minus-circle" size={14} color="#AEAEB2" />
            <Text style={[dd.itemText, !value && { color: accentColor, fontWeight: '600' }]}>Seçilmedi</Text>
            {!value && <Feather name="check" size={14} color={accentColor} />}
          </TouchableOpacity>
          {clinics.map((c, i) => {
            const isSelected = value === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                style={[dd.item, i < clinics.length - 1 && dd.itemBorder, isSelected && { backgroundColor: accentColor + '0A' }]}
                onPress={() => { onChange(c.id); setOpen(false); }}
                activeOpacity={0.7}
              >
                <View style={[dd.clinicDot, { backgroundColor: isSelected ? accentColor : '#E5E7EB' }]} />
                <Text style={[dd.itemText, isSelected && { color: accentColor, fontWeight: '600' }]} numberOfLines={1}>
                  {c.name}
                </Text>
                {isSelected && <Feather name="check" size={14} color={accentColor} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 0 }}>
      <Text style={dm.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <View style={dm.errorBox}>
      <Feather name="alert-circle" size={13} color={ERR} />
      <Text style={dm.errorText}>{msg}</Text>
    </View>
  );
}

// Doctor modal styles — New Order form design system
const dm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  popup:      { backgroundColor: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '90%', overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.15, shadowRadius: 48 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title:      { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  closeBtn:   { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  body:       { padding: 16 },
  sectionCard:{ backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E9EEF4', padding: 16, marginBottom: 12 },
  sectionTitle:{ fontSize: 13, fontWeight: '600', color: '#1E293B', marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '500', color: '#64748B', marginBottom: 7, letterSpacing: 0.5 },
  input: {
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#1C1C1E',
    backgroundColor: '#FFFFFF', marginBottom: 12,
    // @ts-ignore
    outlineStyle: 'none',
  },
  multiline:  { minHeight: 72, textAlignVertical: 'top' as const },
  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 },
  errorBox:   { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText:  { fontSize: 13, color: ERR, flex: 1 },
  footer:     { flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cancelBtn:  { flex: 1, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  saveBtn:    { flex: 2, borderRadius: 10, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  saveBtnOff: { opacity: 0.6 },
  saveText:   { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: '#FFFFFF' },
  container: { padding: 20, paddingBottom: 60 },

  toolbarRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 12,
  },
  rightGroup: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  iconBtn: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnActive: {
    backgroundColor: '#F1F5F9',
  },
  searchRow: {
    marginBottom: 12,
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F8FAFC', borderRadius: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
    paddingHorizontal: 12, height: 42,
  },
  searchWrapFocused: {
    borderColor: '#CBD5E1',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1C1C1E', height: 42, outlineStyle: 'none' } as any,

  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  empty:      { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  emptySub:   { fontSize: 13, color: '#AEAEB2' },

  // Tab bar (orders-page pill style)
  tabsScroll: { flex: 1 },
  tabsContent: { alignItems: 'center', paddingRight: 8 },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 100,
    padding: 3,
    gap: 2,
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
  },
  tabItemActive: {
    backgroundColor: '#FFFFFF',
    // @ts-ignore
    boxShadow: '0 1px 6px rgba(15,23,42,0.12)',
  },
  tabText: {
    fontSize: 13, fontWeight: '500', color: '#94A3B8',
  },
  tabTextActive: {
    fontSize: 13, fontWeight: '600', color: '#0F172A',
  },

  filterBadge: {
    position: 'absolute', top: 4, right: 4,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#0F172A',
    alignItems: 'center', justifyContent: 'center',
  },
  filterBadgeText: { fontSize: 8, fontWeight: '700', color: '#FFFFFF' },

  unassignedSection: { marginTop: 20 },
  unassignedHeader:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  unassignedLabel:   { fontSize: 11, fontWeight: '700', color: '#AEAEB2', textTransform: 'uppercase', letterSpacing: 0.8 },
  countBadge:        { backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  countBadgeText:    { fontSize: 11, fontWeight: '700', color: '#6C6C70' },
});

// Table styles — mirrors orders page
const tbl = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
    // @ts-ignore
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  hCell: {
    fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.6, textTransform: 'uppercase',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 52,
  },
  rowBorder:   { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  rowInactive: { opacity: 0.6 },

  col: { flexDirection: 'row', alignItems: 'center' },

  catDot: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },

  name:     { fontSize: 13, fontWeight: '600', color: '#1C1C1E', letterSpacing: -0.1 },
  meta:     { fontSize: 11, color: '#AEAEB2', marginTop: 1 },
  cell:     { fontSize: 13, color: '#374151', fontWeight: '500' },
  cellMuted:{ fontSize: 12, color: '#94A3B8' },

  badge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

  inactivePill:     { backgroundColor: '#FEF2F2', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  inactivePillText: { fontSize: 9, fontWeight: '800', color: ERR, letterSpacing: 0.5 },

  actions: {
    width: 76, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', gap: 2,
  },
  iconBtn: {
    width: 28, height: 28, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },

  // Expanded
  expanded: {
    borderTopWidth: 1, borderTopColor: '#F8FAFC',
    backgroundColor: '#FAFAFA',
  },
  detailBlock: {
    gap: 5, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  subLabel: {
    fontSize: 10, fontWeight: '700', color: '#AEAEB2',
    letterSpacing: 0.8, textTransform: 'uppercase',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6,
  },
  expandedFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  addDoctorBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  addDoctorText: { fontSize: 13, color: '#6C6C70', fontWeight: '500' },
  activeLabel:   { fontSize: 12, color: '#6C6C70', fontWeight: '500' },
});

const dr = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 11,
    backgroundColor: '#FAFAFA',
  },
  rowBorder:   { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  rowInactive: { opacity: 0.55 },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarText:   { fontSize: 13, fontWeight: '800' },
  name:         { fontSize: 13, fontWeight: '600', color: '#1C1C1E' },
  nameInactive: { color: '#AEAEB2' },
  sub:          { fontSize: 11, color: '#AEAEB2' },
  iconBtn: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
});

const m = StyleSheet.create({
  // ── Overlay & container ──────────────────────────────────────────
  overlay: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sheet: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    width: '100%', maxWidth: 540, maxHeight: '92%', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.15, shadowRadius: 48,
  },

  // ── Header ──────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 22, paddingBottom: 18,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Body ────────────────────────────────────────────────────────
  body: { padding: 16 },

  // ── Section card ────────────────────────────────────────────────
  sectionCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14,
    borderWidth: 1, borderColor: '#E9EEF4',
    padding: 16, marginBottom: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#1E293B', marginBottom: 14 },

  // ── Category chips ──────────────────────────────────────────────
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC',
    flex: 1, minWidth: '45%',
  },
  catChipText: { fontSize: 13, fontWeight: '600', color: '#94A3B8', flex: 1 },

  // ── Field ───────────────────────────────────────────────────────
  fieldWrap: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 11, fontWeight: '500', color: '#64748B',
    marginBottom: 7, letterSpacing: 0.5,
  },
  req: { color: '#EF4444' },
  fieldInput: {
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF',
    // @ts-ignore
    outlineStyle: 'none',
  },
  fieldDropdown: {
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  fieldDropdownText: { fontSize: 14, color: '#0F172A', flex: 1 },
  fieldPlaceholder: { color: '#C7C7CC' },

  // ── Dropdown ────────────────────────────────────────────────────
  dropBox: {
    borderWidth: 1, borderColor: '#E9EEF4', borderRadius: 10,
    backgroundColor: '#FAFAFA', marginTop: 4, overflow: 'hidden',
  },
  dropSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  dropSearchInput: {
    flex: 1, fontSize: 14, color: '#0F172A',
    // @ts-ignore
    outlineStyle: 'none',
  },
  dropList: { maxHeight: 180 },
  dropItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  dropItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  dropItemActive: { backgroundColor: '#F8FAFC' },
  dropItemText: { fontSize: 14, color: '#0F172A' },

  // ── Name autocomplete ───────────────────────────────────────────
  suggestBox: {
    borderWidth: 1, borderColor: '#E9EEF4', borderRadius: 10,
    backgroundColor: '#FAFAFA', marginTop: 4, overflow: 'hidden',
  },
  dupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  dupText: { fontSize: 12, color: '#DC2626', fontWeight: '500' },
  suggestItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  suggestItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  suggestIcon: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  suggestName: { flex: 1, fontSize: 13, color: '#0F172A', fontWeight: '500' },
  existsBadge: { backgroundColor: '#FEF3C7', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  existsBadgeText: { fontSize: 10, fontWeight: '700', color: '#D97706' },

  // ── Error ───────────────────────────────────────────────────────
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginTop: 4,
  },
  errorText: { fontSize: 13, color: '#DC2626', flex: 1 },

  // ── Footer ──────────────────────────────────────────────────────
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 10, paddingHorizontal: 24, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  cancelBtn: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  saveBtn: {
    paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  saveText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});

const dd = StyleSheet.create({
  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#FAFAFA', marginBottom: 4,
  },
  triggerOpen:        { borderColor: '#CBD5E1' },
  triggerLeft:        { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  triggerText:        { fontSize: 14, color: '#1C1C1E', flex: 1 },
  triggerPlaceholder: { color: '#AEAEB2' },

  list: {
    borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 10,
    backgroundColor: '#FFFFFF', overflow: 'hidden', marginBottom: 10,
  },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  itemBorder:   { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  itemText:     { flex: 1, fontSize: 14, color: '#374151' },
  clinicDot:    { width: 8, height: 8, borderRadius: 4 },
});

const fp = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.25)',
    alignItems: 'flex-end',
    paddingTop: 116,
    paddingRight: 16,
  },
  panel: {
    width: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  countBadge: {
    backgroundColor: '#0F172A', borderRadius: 10,
    minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  countBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  clearText: { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  divider: { height: 1, backgroundColor: '#F1F5F9' },
  section: { paddingHorizontal: 16, paddingVertical: 14 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#94A3B8',
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#F1F5F9', backgroundColor: '#FAFAFA',
  },
  chipActive:     { borderColor: '#0F172A', backgroundColor: '#F1F5F9' },
  chipText:       { fontSize: 13, fontWeight: '500', color: '#94A3B8' },
  chipTextActive: { color: '#0F172A', fontWeight: '600' },
  footer: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#6C6C70' },
  applyBtn: {
    flex: 2, paddingVertical: 11, borderRadius: 10,
    backgroundColor: '#0F172A',
    alignItems: 'center', justifyContent: 'center',
  },
  applyText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
