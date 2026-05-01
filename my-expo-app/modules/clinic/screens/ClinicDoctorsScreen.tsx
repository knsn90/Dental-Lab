import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Modal,
  TouchableOpacity, RefreshControl, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  fetchMyClinicDoctors, updateClinicDoctor, inviteClinicDoctor,
} from '../api';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';

const P  = '#0369A1';
const BG = '#F1F5F9';

interface ClinicDoctor {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  clinic_id: string | null;
  clinic_name: string | null;
}

function initials(name?: string | null) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function ClinicDoctorsScreen() {
  const { profile } = useAuthStore();
  const [doctors,  setDoctors]  = useState<ClinicDoctor[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing]   = useState<ClinicDoctor | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await fetchMyClinicDoctors();
    if (!error && data) setDoctors(data as ClinicDoctor[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(); };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={handleRefresh} tintColor={P} />}
      >
        {/* Header — başlık + Davet Et butonu */}
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Hekimler</Text>
            <Text style={s.subtitle}>Kliniğinizdeki kayıtlı hekimler</Text>
          </View>
          <TouchableOpacity style={s.inviteBtn} onPress={() => setInviteOpen(true)} activeOpacity={0.85}>
            <Text style={s.inviteBtnText}>+ Hekim Davet Et</Text>
          </TouchableOpacity>
        </View>

        {/* İstatistikler */}
        <View style={s.stats}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{doctors.length}</Text>
            <Text style={s.statLabel}>TOPLAM</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: '#16A34A' }]}>{doctors.filter(d => d.is_active).length}</Text>
            <Text style={s.statLabel}>AKTİF</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: '#94A3B8' }]}>{doctors.filter(d => !d.is_active).length}</Text>
            <Text style={s.statLabel}>PASİF</Text>
          </View>
        </View>

        {/* Liste */}
        {doctors.length === 0 && !loading ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🩺</Text>
            <Text style={s.emptyTitle}>Henüz hekim yok</Text>
            <Text style={s.emptySub}>
              "Hekim Davet Et" ile yeni hekim ekleyin. Hekim e-postasıyla davet alır ve hesabını aktive eder.
            </Text>
          </View>
        ) : (
          <View style={s.list}>
            {doctors.map((d, i) => (
              <TouchableOpacity
                key={d.id}
                style={[s.row, i === doctors.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => setEditing(d)}
                activeOpacity={0.75}
              >
                <View style={[s.avatar, { backgroundColor: d.is_active ? P : '#CBD5E1' }]}>
                  <Text style={s.avatarText}>{initials(d.full_name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{d.full_name}</Text>
                  {d.phone && <Text style={s.phone} numberOfLines={1}>{d.phone}</Text>}
                </View>
                {!d.is_active && (
                  <View style={s.inactivePill}>
                    <Text style={s.inactiveText}>PASİF</Text>
                  </View>
                )}
                <Text style={s.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Edit modal */}
      <DoctorEditModal
        doctor={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />

      {/* Invite modal */}
      <InviteDoctorModal
        visible={inviteOpen}
        clinicId={profile?.clinic_id ?? null}
        onClose={() => setInviteOpen(false)}
        onSaved={() => { setInviteOpen(false); load(); }}
      />
    </SafeAreaView>
  );
}

// ─── Edit Modal ────────────────────────────────────────────────────────────
function DoctorEditModal({
  doctor, onClose, onSaved,
}: {
  doctor: ClinicDoctor | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (doctor) {
      setPhone(doctor.phone ?? '');
      setActive(doctor.is_active);
    }
  }, [doctor]);

  if (!doctor) return null;

  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateClinicDoctor(doctor.id, {
      phone: phone.trim() || null,
      is_active: active,
    });
    setSaving(false);
    if (error) { toast.error((error as any).message ?? 'Güncelleme başarısız'); return; }
    toast.success('Hekim güncellendi');
    onSaved();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <Text style={m.title}>Hekimi Düzenle</Text>
            <TouchableOpacity onPress={onClose} style={m.closeBtn}>
              <Text style={{ fontSize: 18, color: '#475569' }}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={{ padding: 18, gap: 14 }}>
            {/* İsim (read-only) */}
            <View style={m.row}>
              <View style={[m.avatar, { backgroundColor: P }]}>
                <Text style={m.avatarText}>{initials(doctor.full_name)}</Text>
              </View>
              <View>
                <Text style={m.docName}>{doctor.full_name}</Text>
                <Text style={m.docHint}>İsim değişikliği için lab'a başvurun</Text>
              </View>
            </View>

            {/* Telefon */}
            <View>
              <Text style={m.label}>Telefon</Text>
              <TextInput
                style={m.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="+90 555 000 00 00"
                keyboardType="phone-pad"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Aktif toggle */}
            <View style={m.toggleRow}>
              <View>
                <Text style={m.toggleLabel}>Aktif</Text>
                <Text style={m.toggleHint}>Pasif hekimler yeni sipariş alamaz</Text>
              </View>
              <TouchableOpacity
                style={[m.toggle, active && m.toggleActive]}
                onPress={() => setActive(v => !v)}
                activeOpacity={0.8}
              >
                <View style={[m.toggleKnob, active && m.toggleKnobActive]} />
              </TouchableOpacity>
            </View>

            {active && doctor.is_active === false && (
              <Text style={m.warn}>⚠️ Bu hekim tekrar aktif edilecek</Text>
            )}
          </View>

          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}>
              <Text style={m.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={m.saveText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Invite Modal ──────────────────────────────────────────────────────────
function InviteDoctorModal({
  visible, clinicId, onClose, onSaved,
}: {
  visible: boolean;
  clinicId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy]   = useState(false);

  const handleSend = async () => {
    if (!clinicId) { toast.error('Klinik bilgisi yüklenemedi'); return; }
    if (!email.trim() || !name.trim()) {
      toast.error('İsim ve e-posta zorunlu');
      return;
    }
    setBusy(true);
    const { error } = await inviteClinicDoctor({
      email:     email.trim(),
      full_name: name.trim(),
      phone:     phone.trim() || undefined,
      clinic_id: clinicId,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Davet Başarısız', (error as any).message ?? 'Hekim davet edilemedi. Lütfen lab yöneticisiyle görüşün.');
      return;
    }
    toast.success('Davet gönderildi');
    setEmail(''); setName(''); setPhone('');
    onSaved();
  };

  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <Text style={m.title}>Hekim Davet Et</Text>
            <TouchableOpacity onPress={onClose} style={m.closeBtn}>
              <Text style={{ fontSize: 18, color: '#475569' }}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={{ padding: 18, gap: 14 }}>
            <View>
              <Text style={m.label}>Ad Soyad *</Text>
              <TextInput style={m.input} value={name} onChangeText={setName}
                placeholder="Dr. Ayşe Yılmaz" placeholderTextColor="#94A3B8" />
            </View>
            <View>
              <Text style={m.label}>E-posta *</Text>
              <TextInput style={m.input} value={email} onChangeText={setEmail}
                placeholder="ornek@email.com" placeholderTextColor="#94A3B8"
                keyboardType="email-address" autoCapitalize="none" />
            </View>
            <View>
              <Text style={m.label}>Telefon</Text>
              <TextInput style={m.input} value={phone} onChangeText={setPhone}
                placeholder="+90 555 000 00 00" placeholderTextColor="#94A3B8" keyboardType="phone-pad" />
            </View>
            <Text style={m.hint}>
              Hekim e-postasına davet linki gönderilir. Linkten hesabını aktive edip uygulamaya giriş yapabilir.
            </Text>
          </View>

          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose}>
              <Text style={m.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[m.saveBtn, busy && { opacity: 0.6 }]} onPress={handleSend} disabled={busy}>
              {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <Text style={m.saveText}>{busy ? 'Gönderiliyor...' : 'Davet Gönder'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { padding: 20, paddingBottom: 80 },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 18 },
  title:    { fontSize: 26, fontWeight: '800', color: '#0F172A', letterSpacing: -0.6 },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  inviteBtn:{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: P },
  inviteBtnText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.1 },

  stats: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  statCard: {
    flex: 1, backgroundColor: '#FFFFFF',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    padding: 14, gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: P, letterSpacing: -0.6 },
  statLabel: { fontSize: 9, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase' },

  list: { backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', overflow: 'hidden' },
  row:  {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  avatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  name:       { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  phone:      { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  chevron:    { fontSize: 22, color: '#CBD5E1', fontWeight: '300' },

  inactivePill: { backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  inactiveText: { fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8 },

  empty:      { alignItems: 'center', paddingVertical: 64, gap: 8 },
  emptyIcon:  { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  emptySub:   { fontSize: 13, color: '#64748B', textAlign: 'center', maxWidth: 320, lineHeight: 19 },
});

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet:   { width: '100%', maxWidth: 460, backgroundColor: '#FFFFFF', borderRadius: 18, overflow: 'hidden' },
  header:  { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title:   { flex: 1, fontSize: 16, fontWeight: '800', color: '#0F172A' },
  closeBtn:{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },

  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12 },
  avatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  docName:    { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  docHint:    { fontSize: 11, color: '#94A3B8', marginTop: 2 },

  label:   { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input:   { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF' },
  hint:    { fontSize: 12, color: '#64748B', lineHeight: 18 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12 },
  toggleLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A', flex: 1 },
  toggleHint:  { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  toggle: { width: 42, height: 24, borderRadius: 12, padding: 2, backgroundColor: '#E2E8F0' },
  toggleActive: { backgroundColor: '#16A34A' },
  toggleKnob:   { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
  toggleKnobActive: { transform: [{ translateX: 18 }] },

  warn: { fontSize: 12, color: '#D97706', fontWeight: '600' },

  footer:    { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  cancelText:{ fontSize: 14, fontWeight: '600', color: '#475569' },
  saveBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 10, backgroundColor: P },
  saveText:  { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
