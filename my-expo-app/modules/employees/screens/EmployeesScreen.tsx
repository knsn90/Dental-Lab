import React, { useState, useMemo, useContext } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SkeletonCardList } from '../../../core/ui/Skeleton';
import { SafeAreaView } from 'react-native-safe-area-context';
import { toast } from '../../../core/ui/Toast';

import { useEmployees, useEmployeeDetail } from '../hooks/useEmployees';
import {
  createEmployee, updateEmployee, deleteEmployee,
  createSalaryPayment, deleteSalaryPayment,
  createAdvance, markAdvanceDeducted, deleteAdvance,
  ROLE_LABELS, ROLE_COLORS, MONTH_NAMES,
  type Employee, type EmployeeRole, type SalaryPaymentMethod,
} from '../api';
import { useBreakpoint } from '../../../core/layout/Responsive';

import { AppIcon } from '../../../core/ui/AppIcon';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtMoney(n: number | null | undefined) {
  return '₺' + Number(n ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string) {
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const ROLES: EmployeeRole[] = ['teknisyen', 'sef_teknisyen', 'muhasebe', 'sekreter', 'yonetici', 'diger'];
const PAY_METHODS: { v: SalaryPaymentMethod; l: string; icon: string }[] = [
  { v: 'nakit',  l: 'Nakit',  icon: 'cash' },
  { v: 'havale', l: 'Havale', icon: 'bank-outline' },
  { v: 'kart',   l: 'Kart',   icon: 'credit-card-outline' },
];
const NOW = new Date();
const CUR_YEAR  = NOW.getFullYear();
const CUR_MONTH = NOW.getMonth() + 1;

// ─── Screen ───────────────────────────────────────────────────────────────────
export function EmployeesScreen() {
  const { isDesktop, px, gap } = useBreakpoint();
  const isEmbedded = useContext(HubContext);
  const safeEdges  = isEmbedded ? ([] as any) : (['top'] as any);
  const { employees, loading, refetch } = useEmployees();

  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [formOpen,    setFormOpen]    = useState(false);
  const [editEmp,     setEditEmp]     = useState<Employee | null>(null);
  const [salaryOpen,  setSalaryOpen]  = useState(false);
  const [advOpen,     setAdvOpen]     = useState(false);
  const [filterActive, setFilterActive] = useState(true);

  const activeCount   = employees.filter(e => e.is_active).length;
  const totalSalary   = employees.filter(e => e.is_active).reduce((s, e) => s + Number(e.base_salary), 0);
  const unpaidCount   = employees.filter(e => e.is_active && !e.current_month_paid).length;
  const totalAdvances = employees.reduce((s, e) => s + Number(e.pending_advances ?? 0), 0);

  const filtered = useMemo(() =>
    filterActive ? employees.filter(e => e.is_active) : employees,
  [employees, filterActive]);

  const handleDelete = (emp: Employee) => {
    Alert.alert('Çalışanı Sil', `"${emp.full_name}" kaydını silmek istiyor musunuz? Tüm maaş ve avans geçmişi silinecek.`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        const { error } = await deleteEmployee(emp.id);
        if (error) toast.error((error as any).message);
        else { if (selectedEmp?.id === emp.id) setSelectedEmp(null); refetch(); }
      }},
    ]);
  };

  const handleDeactivate = async (emp: Employee) => {
    await updateEmployee(emp.id, { is_active: false, end_date: new Date().toISOString().slice(0, 10) });
    refetch();
  };

  return (
    <SafeAreaView style={s.safe} edges={safeEdges}>
      {/* Header */}
      <View style={[s.header, { paddingHorizontal: px }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Çalışanlar</Text>
          <Text style={s.subtitle}>Personel, maaş ve avans yönetimi</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => { setEditEmp(null); setFormOpen(true); }} activeOpacity={0.85}>
          <AppIcon name={'account-plus' as any} size={16} color="#fff" />
          <Text style={s.addBtnText}>Çalışan Ekle</Text>
        </TouchableOpacity>
      </View>

      {loading && employees.length === 0 ? (
        <SkeletonCardList count={4} />
      ) : (
        <View style={[s.body, isDesktop && { flexDirection: 'row' }]}>

          {/* ── Sol: KPI + Liste ── */}
          <View style={s.left}>
            {/* KPI */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={[s.kpiScroll, { paddingHorizontal: px }]}>
              <KpiCard label="Aktif Personel" value={String(activeCount)} icon="account-group" color="#2563EB" />
              <KpiCard label="Bu Ay Maaş" value={fmtMoney(totalSalary)} icon="cash-multiple" color="#047857" />
              <KpiCard label="Ödenmemiş" value={`${unpaidCount} kişi`} icon="alert-circle-outline"
                color={unpaidCount > 0 ? '#EF4444' : '#64748B'} />
              <KpiCard label="Bekleyen Avans" value={fmtMoney(totalAdvances)} icon="currency-usd" color="#B45309" />
            </ScrollView>

            {/* Filtre */}
            <View style={[s.filterRow, { paddingHorizontal: px }]}>
              <TouchableOpacity style={[s.pill, filterActive && s.pillActive]}
                onPress={() => setFilterActive(true)}>
                <Text style={[s.pillText, filterActive && s.pillTextActive]}>Aktif ({activeCount})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.pill, !filterActive && s.pillActive]}
                onPress={() => setFilterActive(false)}>
                <Text style={[s.pillText, !filterActive && s.pillTextActive]}>Tümü ({employees.length})</Text>
              </TouchableOpacity>
            </View>

            {/* Çalışan listesi */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: px, paddingBottom: 60, gap: gap }}
              showsVerticalScrollIndicator={false}
            >
              {filtered.length === 0 ? (
                <View style={s.empty}>
                  <AppIcon name={'account-off-outline' as any} size={40} color="#CBD5E1" />
                  <Text style={s.emptyText}>Çalışan bulunamadı</Text>
                </View>
              ) : filtered.map(emp => (
                <EmployeeCard
                  key={emp.id}
                  employee={emp}
                  selected={selectedEmp?.id === emp.id}
                  onPress={() => setSelectedEmp(emp)}
                  onEdit={() => { setEditEmp(emp); setFormOpen(true); }}
                  onDelete={() => handleDelete(emp)}
                  onDeactivate={() => handleDeactivate(emp)}
                />
              ))}
            </ScrollView>
          </View>

          {/* ── Sağ: Detay paneli ── */}
          {selectedEmp && (
            <EmployeeDetailPanel
              employee={selectedEmp}
              isDesktop={isDesktop}
              px={px}
              onSalaryAdd={() => setSalaryOpen(true)}
              onAdvAdd={() => setAdvOpen(true)}
              onRefresh={() => { refetch(); }}
            />
          )}
        </View>
      )}

      {/* Çalışan form modal */}
      <EmployeeFormModal
        visible={formOpen}
        employee={editEmp}
        onClose={() => { setFormOpen(false); setEditEmp(null); }}
        onSaved={() => { setFormOpen(false); setEditEmp(null); refetch(); }}
      />

      {/* Maaş ödeme modal */}
      {selectedEmp && (
        <SalaryModal
          visible={salaryOpen}
          employee={selectedEmp}
          onClose={() => setSalaryOpen(false)}
          onSaved={() => { setSalaryOpen(false); refetch(); }}
        />
      )}

      {/* Avans modal */}
      {selectedEmp && (
        <AdvanceModal
          visible={advOpen}
          employee={selectedEmp}
          onClose={() => setAdvOpen(false)}
          onSaved={() => { setAdvOpen(false); refetch(); }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <View style={kpi.card}>
      <View style={[kpi.icon, { backgroundColor: color + '18' }]}>
        <AppIcon name={icon as any} size={16} color={color} />
      </View>
      <Text style={kpi.label}>{label}</Text>
      <Text style={[kpi.value, { color }]}>{value}</Text>
    </View>
  );
}

// ─── Employee Card ────────────────────────────────────────────────────────────
function EmployeeCard({ employee: emp, selected, onPress, onEdit, onDelete, onDeactivate }: {
  employee: Employee; selected: boolean;
  onPress: () => void; onEdit: () => void; onDelete: () => void; onDeactivate: () => void;
}) {
  const role = ROLE_COLORS[emp.role];
  const initials = emp.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const pendAdv = Number(emp.pending_advances ?? 0);

  return (
    <TouchableOpacity
      style={[ec.card, selected && ec.cardSelected, !emp.is_active && ec.cardInactive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Avatar */}
      <View style={[ec.avatar, { backgroundColor: role.bg }]}>
        <Text style={[ec.avatarText, { color: role.fg }]}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={ec.name}>{emp.full_name}</Text>
          {!emp.is_active && (
            <View style={ec.inactiveBadge}>
              <Text style={ec.inactiveBadgeText}>Ayrıldı</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <View style={[ec.roleBadge, { backgroundColor: role.bg }]}>
            <Text style={[ec.roleText, { color: role.fg }]}>{ROLE_LABELS[emp.role]}</Text>
          </View>
          {emp.phone && <Text style={ec.phone}>{emp.phone}</Text>}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <Text style={ec.salary}>{fmtMoney(emp.base_salary)}<Text style={ec.salaryPer}>/ay</Text></Text>
          {pendAdv > 0 && (
            <View style={ec.advBadge}>
              <AppIcon name={'currency-usd' as any} size={10} color="#B45309" />
              <Text style={ec.advText}>{fmtMoney(pendAdv)} avans</Text>
            </View>
          )}
        </View>
      </View>

      {/* Bu ay maaş durumu */}
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <View style={[ec.payStatus,
          { backgroundColor: emp.current_month_paid ? '#ECFDF5' : '#FEF9C3' }]}>
          <AppIcon
            name={(emp.current_month_paid ? 'check-circle' : 'clock-outline') as any}
            size={12}
            color={emp.current_month_paid ? '#047857' : '#B45309'}
          />
          <Text style={[ec.payStatusText, { color: emp.current_month_paid ? '#047857' : '#B45309' }]}>
            {emp.current_month_paid ? 'Ödendi' : 'Bekliyor'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity style={ec.iconBtn} onPress={onEdit}>
            <AppIcon name={'pencil-outline' as any} size={14} color="#64748B" />
          </TouchableOpacity>
          {emp.is_active && (
            <TouchableOpacity style={ec.iconBtn} onPress={onDeactivate}>
              <AppIcon name={'account-off-outline' as any} size={14} color="#B45309" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={ec.iconBtn} onPress={onDelete}>
            <AppIcon name={'trash-can-outline' as any} size={14} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Employee Detail Panel ────────────────────────────────────────────────────
function EmployeeDetailPanel({ employee, isDesktop, px, onSalaryAdd, onAdvAdd, onRefresh }: {
  employee: Employee; isDesktop: boolean; px: number;
  onSalaryAdd: () => void; onAdvAdd: () => void; onRefresh: () => void;
}) {
  const { salaries, advances, loading, refetch } = useEmployeeDetail(employee.id);
  const role = ROLE_COLORS[employee.role];

  const handleDelSalary = (id: string) => {
    Alert.alert('Maaş Kaydını Sil', 'Bu ödeme kaydı silinecek. Onaylıyor musunuz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await deleteSalaryPayment(id); refetch(); onRefresh();
      }},
    ]);
  };

  const handleDelAdv = (id: string) => {
    Alert.alert('Avansı Sil', 'Bu avans kaydı silinecek?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await deleteAdvance(id); refetch(); onRefresh();
      }},
    ]);
  };

  const handleMarkDeducted = async (id: string) => {
    await markAdvanceDeducted(id); refetch(); onRefresh();
  };

  return (
    <View style={[dp.panel, isDesktop && { borderLeftWidth: 1, borderLeftColor: '#F1F5F9' }]}>
      {/* Personel başlığı */}
      <View style={[dp.header, { paddingHorizontal: px }]}>
        <View style={[dp.avatar, { backgroundColor: role.bg }]}>
          <Text style={[dp.avatarText, { color: role.fg }]}>
            {employee.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={dp.name}>{employee.full_name}</Text>
          <Text style={dp.role}>{ROLE_LABELS[employee.role]}</Text>
          {employee.phone && <Text style={dp.phone}>{employee.phone}</Text>}
        </View>
        <View style={{ gap: 6 }}>
          <View style={dp.salaryBox}>
            <Text style={dp.salaryLabel}>Maaş</Text>
            <Text style={dp.salaryValue}>{fmtMoney(employee.base_salary)}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <SkeletonCardList count={3} />
        ) : (
          <View style={{ padding: px, gap: 20 }}>

            {/* ── Maaş geçmişi ── */}
            <View>
              <View style={dp.sectionHeader}>
                <Text style={dp.sectionTitle}>Maaş Ödemeleri</Text>
                <TouchableOpacity style={dp.sectionBtn} onPress={onSalaryAdd}>
                  <AppIcon name={'plus' as any} size={13} color="#2563EB" />
                  <Text style={dp.sectionBtnText}>Ödeme Ekle</Text>
                </TouchableOpacity>
              </View>
              {salaries.length === 0 ? (
                <Text style={dp.emptyText}>Henüz maaş ödemesi yok</Text>
              ) : salaries.map(sal => (
                <View key={sal.id} style={dp.row}>
                  <View style={dp.rowIcon}>
                    <AppIcon name={'cash-check' as any} size={15} color="#047857" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={dp.rowTitle}>
                      {MONTH_NAMES[sal.period_month]} {sal.period_year}
                    </Text>
                    <Text style={dp.rowMeta}>
                      {fmtDate(sal.payment_date)} · {sal.payment_method === 'nakit' ? 'Nakit' : sal.payment_method === 'havale' ? 'Havale' : 'Kart'}
                      {sal.deductions > 0 ? ` · Kesinti: ${fmtMoney(sal.deductions)}` : ''}
                    </Text>
                  </View>
                  <Text style={dp.rowAmount}>{fmtMoney(sal.net_amount)}</Text>
                  <TouchableOpacity onPress={() => handleDelSalary(sal.id)} style={dp.delBtn}>
                    <AppIcon name={'trash-can-outline' as any} size={14} color="#CBD5E1" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* ── Avanslar ── */}
            <View>
              <View style={dp.sectionHeader}>
                <Text style={dp.sectionTitle}>Avanslar</Text>
                <TouchableOpacity style={dp.sectionBtn} onPress={onAdvAdd}>
                  <AppIcon name={'plus' as any} size={13} color="#B45309" />
                  <Text style={[dp.sectionBtnText, { color: '#B45309' }]}>Avans Ver</Text>
                </TouchableOpacity>
              </View>
              {advances.length === 0 ? (
                <Text style={dp.emptyText}>Avans kaydı yok</Text>
              ) : advances.map(adv => (
                <View key={adv.id} style={[dp.row, adv.is_deducted && dp.rowDeducted]}>
                  <View style={[dp.rowIcon, { backgroundColor: adv.is_deducted ? '#F1F5F9' : '#FEF3C7' }]}>
                    <AppIcon
                      name={'currency-usd' as any} size={15}
                      color={adv.is_deducted ? '#94A3B8' : '#B45309'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[dp.rowTitle, adv.is_deducted && { color: '#94A3B8' }]}>
                      {adv.description || 'Avans'}
                    </Text>
                    <Text style={dp.rowMeta}>
                      {fmtDate(adv.advance_date)} · {adv.is_deducted ? '✓ Kesildi' : 'Bekliyor'}
                    </Text>
                  </View>
                  <Text style={[dp.rowAmount, { color: adv.is_deducted ? '#94A3B8' : '#B45309' }]}>
                    {fmtMoney(adv.amount)}
                  </Text>
                  {!adv.is_deducted && (
                    <TouchableOpacity
                      style={[dp.smallBtn, { backgroundColor: '#FEF3C7' }]}
                      onPress={() => handleMarkDeducted(adv.id)}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#B45309' }}>Kesildi</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => handleDelAdv(adv.id)} style={dp.delBtn}>
                    <AppIcon name={'trash-can-outline' as any} size={14} color="#CBD5E1" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            {/* ── Özet ── */}
            <View style={dp.summaryBox}>
              <SummaryRow label="Toplam Ödenen Maaş" value={fmtMoney(employee.total_salary_paid)} color="#047857" />
              <SummaryRow label="Toplam Verilen Avans" value={fmtMoney(employee.total_advances)} color="#B45309" />
              <SummaryRow label="Bekleyen Avans" value={fmtMoney(employee.pending_advances)} color="#EF4444" />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function SummaryRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '500' }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '800', color }}>{value}</Text>
    </View>
  );
}

// ─── Employee Form Modal ──────────────────────────────────────────────────────
function EmployeeFormModal({ visible, employee, onClose, onSaved }: {
  visible: boolean; employee: Employee | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [name,     setName]     = useState('');
  const [role,     setRole]     = useState<EmployeeRole>('teknisyen');
  const [phone,    setPhone]    = useState('');
  const [email,    setEmail]    = useState('');
  const [salary,   setSalary]   = useState('');
  const [start,    setStart]    = useState(new Date().toISOString().slice(0, 10));
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);

  React.useEffect(() => {
    if (visible) {
      setName(employee?.full_name ?? '');
      setRole(employee?.role ?? 'teknisyen');
      setPhone(employee?.phone ?? '');
      setEmail(employee?.email ?? '');
      setSalary(employee ? String(employee.base_salary) : '');
      setStart(employee?.start_date ?? new Date().toISOString().slice(0, 10));
      setNotes(employee?.notes ?? '');
    }
  }, [visible, employee]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Ad Soyad zorunlu.'); return; }
    const sal = Number(salary.replace(',', '.'));
    if (!Number.isFinite(sal) || sal < 0) { toast.error('Geçerli maaş girin.'); return; }
    setSaving(true);
    const params = { full_name: name.trim(), role, phone: phone || undefined,
      email: email || undefined, base_salary: sal, start_date: start, notes: notes || undefined };
    const { error } = employee
      ? await updateEmployee(employee.id, params)
      : await createEmployee(params);
    setSaving(false);
    if (error) { toast.error((error as any).message); return; }
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={fm.overlay}>
        <View style={fm.card}>
          <View style={fm.header}>
            <Text style={fm.title}>{employee ? 'Çalışanı Düzenle' : 'Yeni Çalışan'}</Text>
            <TouchableOpacity onPress={onClose} style={fm.closeBtn}>
              <AppIcon name={'close' as any} size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={fm.body} showsVerticalScrollIndicator={false}>
            {/* Rol */}
            <Text style={fm.label}>Pozisyon</Text>
            <View style={fm.chipRow}>
              {ROLES.map(r => (
                <TouchableOpacity key={r}
                  style={[fm.chip, role === r && { borderColor: ROLE_COLORS[r].fg, backgroundColor: ROLE_COLORS[r].bg }]}
                  onPress={() => setRole(r)}>
                  <Text style={[fm.chipText, role === r && { color: ROLE_COLORS[r].fg, fontWeight: '700' }]}>
                    {ROLE_LABELS[r]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Ad */}
            <Text style={fm.label}>Ad Soyad *</Text>
            <TextInput style={fm.input} value={name} onChangeText={setName}
              placeholder="Tam ad giriniz" placeholderTextColor="#94A3B8" />

            {/* Telefon + Email */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={fm.label}>Telefon</Text>
                <TextInput style={fm.input} value={phone} onChangeText={setPhone}
                  placeholder="0555 000 00 00" placeholderTextColor="#94A3B8" keyboardType="phone-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fm.label}>E-posta</Text>
                <TextInput style={fm.input} value={email} onChangeText={setEmail}
                  placeholder="ad@mail.com" placeholderTextColor="#94A3B8" keyboardType="email-address" />
              </View>
            </View>

            {/* Maaş + Başlangıç tarihi */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={fm.label}>Maaş (₺/ay) *</Text>
                <TextInput style={fm.input} value={salary} onChangeText={setSalary}
                  placeholder="0,00" placeholderTextColor="#94A3B8" keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fm.label}>İşe Başlama</Text>
                <TextInput style={fm.input} value={start} onChangeText={setStart}
                  placeholder="YYYY-AA-GG" placeholderTextColor="#94A3B8" />
              </View>
            </View>

            {/* Notlar */}
            <Text style={fm.label}>Notlar</Text>
            <TextInput style={[fm.input, { minHeight: 64, textAlignVertical: 'top' }]}
              value={notes} onChangeText={setNotes} placeholder="Ek bilgi…"
              placeholderTextColor="#94A3B8" multiline />
          </ScrollView>

          <View style={fm.footer}>
            <TouchableOpacity style={fm.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={fm.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[fm.saveBtn, saving && { opacity: 0.5 }]}
              onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={fm.saveText}>{employee ? 'Güncelle' : 'Kaydet'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Salary Modal ─────────────────────────────────────────────────────────────
function SalaryModal({ visible, employee, onClose, onSaved }: {
  visible: boolean; employee: Employee; onClose: () => void; onSaved: () => void;
}) {
  const [year,       setYear]       = useState(String(CUR_YEAR));
  const [month,      setMonth]      = useState(String(CUR_MONTH));
  const [gross,      setGross]      = useState('');
  const [deductions, setDeductions] = useState('');
  const [method,     setMethod]     = useState<SalaryPaymentMethod>('havale');
  const [payDate,    setPayDate]    = useState(new Date().toISOString().slice(0, 10));
  const [notes,      setNotes]      = useState('');
  const [saving,     setSaving]     = useState(false);

  React.useEffect(() => {
    if (visible) {
      setYear(String(CUR_YEAR)); setMonth(String(CUR_MONTH));
      setGross(String(employee.base_salary)); setDeductions('');
      setMethod('havale'); setPayDate(new Date().toISOString().slice(0, 10)); setNotes('');
    }
  }, [visible, employee]);

  const net = (Number(gross.replace(',', '.')) || 0) - (Number(deductions.replace(',', '.')) || 0);

  const handleSave = async () => {
    const g = Number(gross.replace(',', '.'));
    const d = Number(deductions.replace(',', '.')) || 0;
    if (!Number.isFinite(g) || g <= 0) { toast.error('Brüt maaş giriniz.'); return; }
    setSaving(true);
    const { error } = await createSalaryPayment({
      employee_id: employee.id, period_year: parseInt(year), period_month: parseInt(month),
      gross_amount: g, deductions: d, payment_method: method, payment_date: payDate,
      notes: notes || undefined,
    });
    setSaving(false);
    if (error) { toast.error((error as any)?.message ?? 'Bu dönem için zaten ödeme var.'); return; }
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={fm.overlay}>
        <View style={[fm.card, { maxWidth: 440 }]}>
          <View style={fm.header}>
            <View style={{ flex: 1 }}>
              <Text style={fm.title}>Maaş Ödemesi</Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{employee.full_name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={fm.closeBtn}>
              <AppIcon name={'close' as any} size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <View style={fm.body}>
            {/* Dönem */}
            <Text style={fm.label}>Dönem</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 2 }}>
                <TextInput style={fm.input} value={month} onChangeText={setMonth}
                  placeholder="Ay (1-12)" placeholderTextColor="#94A3B8" keyboardType="number-pad" />
              </View>
              <View style={{ flex: 2 }}>
                <TextInput style={fm.input} value={year} onChangeText={setYear}
                  placeholder="Yıl" placeholderTextColor="#94A3B8" keyboardType="number-pad" />
              </View>
            </View>
            {/* Hint */}
            {parseInt(month) >= 1 && parseInt(month) <= 12 && (
              <Text style={fm.hint}>{MONTH_NAMES[parseInt(month)]} {year}</Text>
            )}

            {/* Brüt + Kesintiler */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={fm.label}>Brüt Maaş (₺)</Text>
                <TextInput style={fm.input} value={gross} onChangeText={setGross}
                  placeholder="0,00" placeholderTextColor="#94A3B8" keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={fm.label}>Kesintiler (₺)</Text>
                <TextInput style={fm.input} value={deductions} onChangeText={setDeductions}
                  placeholder="SGK, vergi…" placeholderTextColor="#94A3B8" keyboardType="decimal-pad" />
              </View>
            </View>

            {/* Net göster */}
            <View style={fm.netBox}>
              <Text style={fm.netLabel}>Net Ödenecek</Text>
              <Text style={fm.netValue}>{fmtMoney(net)}</Text>
            </View>

            {/* Yöntem */}
            <Text style={fm.label}>Ödeme Yöntemi</Text>
            <View style={fm.chipRow}>
              {PAY_METHODS.map(m => (
                <TouchableOpacity key={m.v}
                  style={[fm.chip, method === m.v && fm.chipActive]}
                  onPress={() => setMethod(m.v)}>
                  <AppIcon name={m.icon as any} size={13}
                    color={method === m.v ? '#2563EB' : '#94A3B8'} />
                  <Text style={[fm.chipText, method === m.v && fm.chipTextActive]}>{m.l}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Ödeme tarihi */}
            <Text style={fm.label}>Ödeme Tarihi</Text>
            <TextInput style={fm.input} value={payDate} onChangeText={setPayDate}
              placeholder="YYYY-AA-GG" placeholderTextColor="#94A3B8" />
          </View>

          <View style={fm.footer}>
            <TouchableOpacity style={fm.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={fm.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[fm.saveBtn, saving && { opacity: 0.5 }]}
              onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={fm.saveText}>Ödemeyi Kaydet</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Advance Modal ────────────────────────────────────────────────────────────
function AdvanceModal({ visible, employee, onClose, onSaved }: {
  visible: boolean; employee: Employee; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount]   = useState('');
  const [date,   setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [desc,   setDesc]     = useState('');
  const [saving, setSaving]   = useState(false);

  React.useEffect(() => {
    if (visible) { setAmount(''); setDate(new Date().toISOString().slice(0, 10)); setDesc(''); }
  }, [visible]);

  const handleSave = async () => {
    const amt = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Geçerli tutar girin.'); return; }
    setSaving(true);
    const { error } = await createAdvance({
      employee_id: employee.id, amount: amt, advance_date: date,
      description: desc.trim() || undefined,
    });
    setSaving(false);
    if (error) { toast.error((error as any).message); return; }
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={fm.overlay}>
        <View style={[fm.card, { maxWidth: 400 }]}>
          <View style={fm.header}>
            <View style={{ flex: 1 }}>
              <Text style={fm.title}>Avans Ver</Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{employee.full_name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={fm.closeBtn}>
              <AppIcon name={'close' as any} size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>
          <View style={fm.body}>
            <Text style={fm.label}>Tutar (₺)</Text>
            <TextInput style={fm.input} value={amount} onChangeText={setAmount}
              placeholder="0,00" placeholderTextColor="#94A3B8" keyboardType="decimal-pad" />
            <Text style={fm.label}>Tarih</Text>
            <TextInput style={fm.input} value={date} onChangeText={setDate}
              placeholder="YYYY-AA-GG" placeholderTextColor="#94A3B8" />
            <Text style={fm.label}>Açıklama (opsiyonel)</Text>
            <TextInput style={fm.input} value={desc} onChangeText={setDesc}
              placeholder="Kısa not…" placeholderTextColor="#94A3B8" />
          </View>
          <View style={fm.footer}>
            <TouchableOpacity style={fm.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={fm.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[fm.saveBtn, { backgroundColor: '#B45309' }, saving && { opacity: 0.5 }]}
              onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={fm.saveText}>Avansı Kaydet</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: '#fff' },
  header:   { flexDirection: 'row', alignItems: 'center', paddingTop: 18, paddingBottom: 10, gap: 12 },
  title:    { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  addBtn:   {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: '#2563EB',
  },
  addBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },
  body:        { flex: 1 },
  left:        { flex: 1 },
  kpiScroll:   { gap: 10, paddingVertical: 10 },
  filterRow:   { flexDirection: 'row', gap: 8, paddingBottom: 8 },
  pill:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' },
  pillActive:  { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  pillText:    { fontSize: 13, fontWeight: '500', color: '#64748B' },
  pillTextActive: { color: '#2563EB', fontWeight: '700' },
  empty:       { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText:   { fontSize: 14, color: '#94A3B8', fontWeight: '600' },
});

const kpi = StyleSheet.create({
  card:  { minWidth: 160, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F1F5F9', gap: 6 },
  icon:  { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
});

const ec = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  cardSelected: { borderColor: '#2563EB', backgroundColor: '#F0F7FF' },
  cardInactive: { opacity: 0.6 },
  avatar:       { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { fontSize: 16, fontWeight: '800' },
  name:         { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  inactiveBadge:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#F1F5F9' },
  inactiveBadgeText: { fontSize: 9, fontWeight: '700', color: '#94A3B8' },
  roleBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  roleText:     { fontSize: 10, fontWeight: '700' },
  phone:        { fontSize: 11, color: '#64748B' },
  salary:       { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  salaryPer:    { fontSize: 10, fontWeight: '500', color: '#94A3B8' },
  advBadge:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#FEF3C7' },
  advText:      { fontSize: 10, fontWeight: '600', color: '#B45309' },
  payStatus:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  payStatusText:{ fontSize: 10, fontWeight: '700' },
  iconBtn:      { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
});

const dp = StyleSheet.create({
  panel:       { flex: 1.2, backgroundColor: '#FAFAFA' },
  header:      {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#fff',
  },
  avatar:      { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 18, fontWeight: '800' },
  name:        { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  role:        { fontSize: 11, color: '#64748B', marginTop: 2 },
  phone:       { fontSize: 11, color: '#2563EB', marginTop: 1 },
  salaryBox:   { alignItems: 'flex-end' },
  salaryLabel: { fontSize: 9, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },
  salaryValue: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  sectionHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle:    { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  sectionBtn:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#EFF6FF' },
  sectionBtnText:  { fontSize: 11, fontWeight: '700', color: '#2563EB' },
  emptyText:       { fontSize: 12, color: '#94A3B8', fontStyle: 'italic', paddingVertical: 8 },
  row:         {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  rowDeducted: { opacity: 0.6 },
  rowIcon:     { width: 34, height: 34, borderRadius: 10, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  rowTitle:    { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  rowMeta:     { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  rowAmount:   { fontSize: 13, fontWeight: '800', color: '#047857' },
  delBtn:      { padding: 4 },
  smallBtn:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  summaryBox:  { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F1F5F9', gap: 2 },
});

const fm = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:     { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '92%', overflow: 'hidden' },
  header:   {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  title:    { flex: 1, fontSize: 16, fontWeight: '700', color: '#0F172A' },
  closeBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  body:     { padding: 20, gap: 4 },
  label:    { fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  input:    { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', backgroundColor: '#fff' },
  hint:     { fontSize: 11, color: '#2563EB', fontWeight: '600', marginTop: 2 },
  chipRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  chipActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  chipText:   { fontSize: 12, color: '#94A3B8', fontWeight: '500' },
  chipTextActive: { color: '#2563EB', fontWeight: '700' },
  netBox:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12, marginTop: 8 },
  netLabel: { fontSize: 12, fontWeight: '600', color: '#047857' },
  netValue: { fontSize: 18, fontWeight: '800', color: '#047857' },
  footer:   { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cancelBtn:  { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  saveBtn:    { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2563EB', alignItems: 'center' },
  saveText:   { fontSize: 14, fontWeight: '700', color: '#fff' },
});
