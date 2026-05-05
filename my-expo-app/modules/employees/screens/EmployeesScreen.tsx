/**
 * EmployeesScreen — Çalışanlar (Patterns Design Language)
 *
 * §10 Hero (glassmorphism), §09 tableCard, §05 cardSolid,
 * §04 CHIP_TONES, §05.5 form, §08 dialog, §03 pill buttons,
 * Lucide icons.
 */
import React, { useState, useMemo, useContext } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, ActivityIndicator, Alert, RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { toast } from '../../../core/ui/Toast';

import { useEmployees, useEmployeeDetail } from '../hooks/useEmployees';
import {
  createEmployee, updateEmployee, deleteEmployee,
  createSalaryPayment, deleteSalaryPayment,
  createAdvance, markAdvanceDeducted, deleteAdvance,
  ROLE_LABELS, ROLE_COLORS, MONTH_NAMES,
  type Employee, type EmployeeRole, type SalaryPaymentMethod,
} from '../api';
import { DS } from '../../../core/theme/dsTokens';
import {
  Plus, Search, X, Inbox, Pencil, Trash2,
  UserPlus, UserX, Users, Phone, Mail, Clock,
  CircleCheck, Banknote, Landmark, CreditCard,
  ChevronRight, CircleDollarSign, CheckCircle,
} from 'lucide-react-native';

// ── Patterns tokens ─────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

const cardSolid = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  padding: 22,
  // @ts-ignore web
  boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)',
};

const tableCard = {
  backgroundColor: '#FFF',
  borderRadius: 24,
  borderWidth: 1,
  borderColor: 'rgba(0,0,0,0.05)',
  overflow: 'hidden' as const,
};

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
};

const modalShadow = '0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)';

const inputStyle = {
  height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
  paddingHorizontal: 14, fontSize: 14, color: DS.ink[900], backgroundColor: '#FFF',
};

// ── Helpers ──────────────────────────────────────────────────────────
function fmtMoney(n: number | null | undefined) {
  return '₺' + Number(n ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string) {
  try {
    const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

const ROLES: EmployeeRole[] = ['teknisyen', 'sef_teknisyen', 'muhasebe', 'sekreter', 'yonetici', 'diger'];
const PAY_METHODS: { v: SalaryPaymentMethod; l: string; icon: React.ComponentType<any> }[] = [
  { v: 'nakit',  l: 'Nakit',  icon: Banknote },
  { v: 'havale', l: 'Havale', icon: Landmark },
  { v: 'kart',   l: 'Kart',   icon: CreditCard },
];
const NOW = new Date();
const CUR_YEAR  = NOW.getFullYear();
const CUR_MONTH = NOW.getMonth() + 1;

// ── §03 Pill Button ─────────────────────────────────────────────────
function PillBtn({ icon: Icon, label, onPress, variant = 'dark', size = 'md', disabled }: {
  icon: React.ComponentType<any>; label: string; onPress: () => void;
  variant?: 'dark' | 'ghost' | 'danger' | 'warning'; size?: 'sm' | 'md'; disabled?: boolean;
}) {
  const dark = variant === 'dark';
  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';
  const h = size === 'sm' ? 32 : 38;
  const bg = dark ? DS.ink[900] : isDanger ? CHIP_TONES.danger.bg : isWarning ? CHIP_TONES.warning.bg : 'transparent';
  const fg = dark ? '#FFF' : isDanger ? CHIP_TONES.danger.fg : isWarning ? CHIP_TONES.warning.fg : DS.ink[700];
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        height: h, paddingHorizontal: size === 'sm' ? 12 : 16, borderRadius: 999,
        backgroundColor: bg,
        borderWidth: dark || isDanger || isWarning ? 0 : 1, borderColor: 'rgba(0,0,0,0.10)',
        opacity: disabled ? 0.5 : 1, cursor: 'pointer' as any,
      }}
    >
      <Icon size={size === 'sm' ? 13 : 15} color={fg} strokeWidth={1.8} />
      <Text style={{ fontSize: size === 'sm' ? 11 : 13, fontWeight: '600', color: fg }}>{label}</Text>
    </Pressable>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 6 }}>
      {children}
    </Text>
  );
}

// ═════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════
export function EmployeesScreen() {
  const isEmbedded = useContext(HubContext);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const { employees, loading, refetch } = useEmployees();

  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [formOpen,    setFormOpen]    = useState(false);
  const [editEmp,     setEditEmp]     = useState<Employee | null>(null);
  const [salaryOpen,  setSalaryOpen]  = useState(false);
  const [advOpen,     setAdvOpen]     = useState(false);
  const [filterActive, setFilterActive] = useState(true);
  const [search, setSearch] = useState('');

  const activeCount   = employees.filter(e => e.is_active).length;
  const totalSalary   = employees.filter(e => e.is_active).reduce((s, e) => s + Number(e.base_salary), 0);
  const unpaidCount   = employees.filter(e => e.is_active && !e.current_month_paid).length;
  const totalAdvances = employees.reduce((s, e) => s + Number(e.pending_advances ?? 0), 0);

  const filtered = useMemo(() => {
    let list = filterActive ? employees.filter(e => e.is_active) : employees;
    if (search) {
      const sl = search.toLowerCase();
      list = list.filter(e =>
        e.full_name.toLowerCase().includes(sl) ||
        ROLE_LABELS[e.role].toLowerCase().includes(sl),
      );
    }
    return list;
  }, [employees, filterActive, search]);

  const handleDelete = (emp: Employee) => {
    Alert.alert('Çalışanı Sil', `"${emp.full_name}" kaydını silmek istiyor musunuz?`, [
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
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: isDesktop ? 0 : 16, paddingBottom: 48, gap: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={DS.ink[300]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero — §10 glassmorphism ─────────────────────────── */}
        <View style={{
          borderRadius: 28, overflow: 'hidden',
          backgroundColor: DS.lab.bg, padding: isDesktop ? 36 : 24,
          position: 'relative',
        }}>
          <View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: DS.lab.bgDeep, opacity: 0.6 }} />
          <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: DS.lab.bgDeep, opacity: 0.4 }} />

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 12 }}>
                Aktif Personel
              </Text>
              <Text style={{ ...DISPLAY, fontSize: isDesktop ? 48 : 36, letterSpacing: -1.4, color: DS.ink[900] }}>
                {activeCount}
              </Text>
              <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 6 }}>
                {employees.length} toplam kayıt
              </Text>
            </View>
            <PillBtn icon={UserPlus} label="Çalışan Ekle" onPress={() => { setEditEmp(null); setFormOpen(true); }} />
          </View>

          {/* KPI breakdown */}
          <View style={{ flexDirection: 'row', gap: isDesktop ? 36 : 16, marginTop: 20, flexWrap: 'wrap' }}>
            <View>
              <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>
                Bu Ay Maaş
              </Text>
              <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color: DS.ink[700], marginTop: 2 }}>
                {fmtMoney(totalSalary)}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>
                Ödenmemiş
              </Text>
              <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color: unpaidCount > 0 ? CHIP_TONES.danger.fg : DS.ink[700], marginTop: 2 }}>
                {unpaidCount} kişi
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>
                Bekleyen Avans
              </Text>
              <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color: CHIP_TONES.warning.fg, marginTop: 2 }}>
                {fmtMoney(totalAdvances)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Filter pills ────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[
            { key: true,  label: `Aktif (${activeCount})` },
            { key: false, label: `Tümü (${employees.length})` },
          ].map(f => {
            const active = filterActive === f.key;
            return (
              <Pressable
                key={String(f.key)}
                onPress={() => setFilterActive(f.key)}
                style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? DS.ink[900] : 'rgba(0,0,0,0.08)',
                  backgroundColor: active ? DS.ink[50] : '#FFF',
                  cursor: 'pointer' as any,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? DS.ink[900] : DS.ink[500] }}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Search — §05.5 ──────────────────────────────────── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          height: 44, paddingHorizontal: 14, borderRadius: 14,
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#FFF',
        }}>
          <Search size={15} color={DS.ink[400]} strokeWidth={1.8} />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: DS.ink[900], outline: 'none' as any }}
            placeholder="Ad veya pozisyon ara..."
            placeholderTextColor={DS.ink[400]}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} style={{ cursor: 'pointer' as any }}>
              <X size={14} color={DS.ink[400]} strokeWidth={2} />
            </Pressable>
          )}
        </View>

        {/* ── Employee list ───────────────────────────────────── */}
        {filtered.length === 0 ? (
          <View style={{ ...cardSolid, alignItems: 'center', paddingVertical: 48, gap: 10 }}>
            <Inbox size={32} color={DS.ink[300]} strokeWidth={1.4} />
            <Text style={{ fontSize: 14, fontWeight: '500', color: DS.ink[400] }}>
              {search ? 'Sonuç bulunamadı' : 'Çalışan bulunamadı'}
            </Text>
          </View>
        ) : isDesktop ? (
          /* ── Desktop: two-column ────────────────────────────── */
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {/* Left: tableCard */}
            <View style={{ flex: 1, ...tableCard }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
                <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Personel</Text>
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 12, color: DS.ink[400] }}>{filtered.length} kişi</Text>
              </View>

              {/* Header */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
                {[
                  { label: 'ÇALIŞAN',  flex: 2.5 },
                  { label: 'POZİSYON', flex: 1.2 },
                  { label: 'MAAŞ',     flex: 1, align: 'right' as const },
                  { label: 'DURUM',    flex: 1 },
                  { label: 'İŞLEM',    flex: 1 },
                ].map((h, i) => (
                  <Text key={i} style={{ flex: h.flex, fontSize: 10, fontWeight: '600', letterSpacing: 0.7, color: DS.ink[500], textAlign: h.align }}>
                    {h.label}
                  </Text>
                ))}
              </View>

              {/* Rows */}
              {filtered.map((emp, i) => {
                const role = ROLE_COLORS[emp.role];
                const isActive = selectedEmp?.id === emp.id;
                const initials = emp.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <Pressable
                    key={emp.id}
                    onPress={() => setSelectedEmp(emp)}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: 20, paddingVertical: 14,
                      borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                      borderBottomColor: 'rgba(0,0,0,0.04)',
                      backgroundColor: isActive ? 'rgba(74,143,201,0.06)' : 'transparent',
                      opacity: emp.is_active ? 1 : 0.5,
                      cursor: 'pointer' as any,
                    }}
                  >
                    <View style={{ flex: 2.5, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: role.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: role.fg }}>{initials}</Text>
                      </View>
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{emp.full_name}</Text>
                          {!emp.is_active && (
                            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: DS.ink[100] }}>
                              <Text style={{ fontSize: 9, fontWeight: '600', color: DS.ink[500] }}>Ayrıldı</Text>
                            </View>
                          )}
                        </View>
                        {emp.phone && (
                          <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 1 }}>{emp.phone}</Text>
                        )}
                      </View>
                    </View>
                    <View style={{ flex: 1.2 }}>
                      <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: role.bg }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: role.fg }}>{ROLE_LABELS[emp.role]}</Text>
                      </View>
                    </View>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: DS.ink[900], textAlign: 'right' }}>
                      {fmtMoney(emp.base_salary)}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <View style={{
                        alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                        backgroundColor: emp.current_month_paid ? CHIP_TONES.success.bg : CHIP_TONES.warning.bg,
                      }}>
                        {emp.current_month_paid
                          ? <CheckCircle size={10} color={CHIP_TONES.success.fg} strokeWidth={2} />
                          : <Clock size={10} color={CHIP_TONES.warning.fg} strokeWidth={2} />
                        }
                        <Text style={{ fontSize: 10, fontWeight: '600', color: emp.current_month_paid ? CHIP_TONES.success.fg : CHIP_TONES.warning.fg }}>
                          {emp.current_month_paid ? 'Ödendi' : 'Bekliyor'}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
                      <Pressable
                        onPress={() => { setEditEmp(emp); setFormOpen(true); }}
                        style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: DS.ink[50], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                      >
                        <Pencil size={13} color={DS.ink[500]} strokeWidth={1.6} />
                      </Pressable>
                      {emp.is_active && (
                        <Pressable
                          onPress={() => handleDeactivate(emp)}
                          style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: CHIP_TONES.warning.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                        >
                          <UserX size={13} color={CHIP_TONES.warning.fg} strokeWidth={1.6} />
                        </Pressable>
                      )}
                      <Pressable
                        onPress={() => handleDelete(emp)}
                        style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: CHIP_TONES.danger.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                      >
                        <Trash2 size={13} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Right: Detail panel */}
            {selectedEmp && (
              <View style={{ flex: 1, ...tableCard }}>
                <EmployeeDetailPanel
                  employee={selectedEmp}
                  onSalaryAdd={() => setSalaryOpen(true)}
                  onAdvAdd={() => setAdvOpen(true)}
                  onRefresh={refetch}
                />
              </View>
            )}
          </View>
        ) : (
          /* ── Mobile: cardSolid ──────────────────────────────── */
          filtered.map(emp => {
            const role = ROLE_COLORS[emp.role];
            const initials = emp.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const pendAdv = Number(emp.pending_advances ?? 0);
            return (
              <Pressable
                key={emp.id}
                onPress={() => setSelectedEmp(emp)}
                style={{ ...cardSolid, padding: 16, opacity: emp.is_active ? 1 : 0.5, cursor: 'pointer' as any }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: role.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: role.fg }}>{initials}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>{emp.full_name}</Text>
                      {!emp.is_active && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: DS.ink[100] }}>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: DS.ink[500] }}>Ayrıldı</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: role.bg }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: role.fg }}>{ROLE_LABELS[emp.role]}</Text>
                      </View>
                      {emp.phone && <Text style={{ fontSize: 11, color: DS.ink[400] }}>{emp.phone}</Text>}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={{ ...DISPLAY, fontSize: 18, letterSpacing: -0.3, color: DS.ink[900] }}>
                      {fmtMoney(emp.base_salary)}
                    </Text>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                      backgroundColor: emp.current_month_paid ? CHIP_TONES.success.bg : CHIP_TONES.warning.bg,
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: emp.current_month_paid ? CHIP_TONES.success.fg : CHIP_TONES.warning.fg }}>
                        {emp.current_month_paid ? 'Ödendi' : 'Bekliyor'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Action row */}
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 10, justifyContent: 'flex-end' }}>
                  <Pressable
                    onPress={() => { setEditEmp(emp); setFormOpen(true); }}
                    style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: DS.ink[50], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                  >
                    <Pencil size={13} color={DS.ink[500]} strokeWidth={1.6} />
                  </Pressable>
                  {emp.is_active && (
                    <Pressable
                      onPress={() => handleDeactivate(emp)}
                      style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: CHIP_TONES.warning.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                    >
                      <UserX size={13} color={CHIP_TONES.warning.fg} strokeWidth={1.6} />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => handleDelete(emp)}
                    style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: CHIP_TONES.danger.bg, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}
                  >
                    <Trash2 size={13} color={CHIP_TONES.danger.fg} strokeWidth={1.6} />
                  </Pressable>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      {/* ── Employee Form Modal — §08 ──────────────────────────── */}
      <EmployeeFormModal
        visible={formOpen}
        employee={editEmp}
        onClose={() => { setFormOpen(false); setEditEmp(null); }}
        onSaved={() => { setFormOpen(false); setEditEmp(null); refetch(); }}
      />

      {/* ── Salary Modal — §08 ─────────────────────────────────── */}
      {selectedEmp && (
        <SalaryModal
          visible={salaryOpen}
          employee={selectedEmp}
          onClose={() => setSalaryOpen(false)}
          onSaved={() => { setSalaryOpen(false); refetch(); }}
        />
      )}

      {/* ── Advance Modal — §08 ────────────────────────────────── */}
      {selectedEmp && (
        <AdvanceModal
          visible={advOpen}
          employee={selectedEmp}
          onClose={() => setAdvOpen(false)}
          onSaved={() => { setAdvOpen(false); refetch(); }}
        />
      )}
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Employee Detail Panel
// ═════════════════════════════════════════════════════════════════════
function EmployeeDetailPanel({ employee, onSalaryAdd, onAdvAdd, onRefresh }: {
  employee: Employee;
  onSalaryAdd: () => void; onAdvAdd: () => void; onRefresh: () => void;
}) {
  const { salaries, advances, loading, refetch } = useEmployeeDetail(employee.id);
  const role = ROLE_COLORS[employee.role];
  const initials = employee.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const handleDelSalary = (id: string) => {
    Alert.alert('Maaş Kaydını Sil', 'Bu ödeme kaydı silinecek.', [
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
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
        <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: role.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: role.fg }}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: DS.ink[900] }}>{employee.full_name}</Text>
          <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2 }}>{ROLE_LABELS[employee.role]}</Text>
          {employee.phone && <Text style={{ fontSize: 11, color: CHIP_TONES.info.fg, marginTop: 1 }}>{employee.phone}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 9, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', color: DS.ink[400] }}>Maaş</Text>
          <Text style={{ ...DISPLAY, fontSize: 20, letterSpacing: -0.3, color: DS.ink[900] }}>{fmtMoney(employee.base_salary)}</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={DS.lab.primary} />
        ) : (
          <>
            {/* ── Maaş Ödemeleri ── */}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>Maaş Ödemeleri</Text>
                <PillBtn icon={Plus} label="Ödeme Ekle" size="sm" onPress={onSalaryAdd} />
              </View>
              {salaries.length === 0 ? (
                <Text style={{ fontSize: 12, color: DS.ink[400], fontStyle: 'italic', paddingVertical: 8 }}>Henüz ödeme yok</Text>
              ) : salaries.map(sal => (
                <View key={sal.id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: '#FFF', borderRadius: 14, padding: 12, marginBottom: 6,
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
                }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: CHIP_TONES.success.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Banknote size={15} color={CHIP_TONES.success.fg} strokeWidth={1.6} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>
                      {MONTH_NAMES[sal.period_month]} {sal.period_year}
                    </Text>
                    <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 2 }}>
                      {fmtDate(sal.payment_date)} · {sal.payment_method === 'nakit' ? 'Nakit' : sal.payment_method === 'havale' ? 'Havale' : 'Kart'}
                      {sal.deductions > 0 ? ` · Kesinti: ${fmtMoney(sal.deductions)}` : ''}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: CHIP_TONES.success.fg }}>{fmtMoney(sal.net_amount)}</Text>
                  <Pressable onPress={() => handleDelSalary(sal.id)} style={{ padding: 4, cursor: 'pointer' as any }}>
                    <Trash2 size={13} color={DS.ink[300]} strokeWidth={1.6} />
                  </Pressable>
                </View>
              ))}
            </View>

            {/* ── Avanslar ── */}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: DS.ink[900] }}>Avanslar</Text>
                <PillBtn icon={CircleDollarSign} label="Avans Ver" size="sm" variant="warning" onPress={onAdvAdd} />
              </View>
              {advances.length === 0 ? (
                <Text style={{ fontSize: 12, color: DS.ink[400], fontStyle: 'italic', paddingVertical: 8 }}>Avans kaydı yok</Text>
              ) : advances.map(adv => (
                <View key={adv.id} style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  backgroundColor: '#FFF', borderRadius: 14, padding: 12, marginBottom: 6,
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
                  opacity: adv.is_deducted ? 0.5 : 1,
                }}>
                  <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: adv.is_deducted ? DS.ink[100] : CHIP_TONES.warning.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <CircleDollarSign size={15} color={adv.is_deducted ? DS.ink[400] : CHIP_TONES.warning.fg} strokeWidth={1.6} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: adv.is_deducted ? DS.ink[400] : DS.ink[900] }}>
                      {adv.description || 'Avans'}
                    </Text>
                    <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 2 }}>
                      {fmtDate(adv.advance_date)} · {adv.is_deducted ? 'Kesildi' : 'Bekliyor'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: adv.is_deducted ? DS.ink[400] : CHIP_TONES.warning.fg }}>
                    {fmtMoney(adv.amount)}
                  </Text>
                  {!adv.is_deducted && (
                    <Pressable
                      onPress={() => handleMarkDeducted(adv.id)}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: CHIP_TONES.warning.bg, cursor: 'pointer' as any }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: CHIP_TONES.warning.fg }}>Kesildi</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => handleDelAdv(adv.id)} style={{ padding: 4, cursor: 'pointer' as any }}>
                    <Trash2 size={13} color={DS.ink[300]} strokeWidth={1.6} />
                  </Pressable>
                </View>
              ))}
            </View>

            {/* ── Özet ── */}
            <View style={{ ...cardSolid, padding: 16, gap: 6 }}>
              <SummaryRow label="Toplam Ödenen Maaş" value={fmtMoney(employee.total_salary_paid)} color={CHIP_TONES.success.fg} />
              <SummaryRow label="Toplam Verilen Avans" value={fmtMoney(employee.total_advances)} color={CHIP_TONES.warning.fg} />
              <SummaryRow label="Bekleyen Avans" value={fmtMoney(employee.pending_advances)} color={CHIP_TONES.danger.fg} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SummaryRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ fontSize: 12, color: DS.ink[500], fontWeight: '500' }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color }}>{value}</Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Employee Form Modal — §08
// ═════════════════════════════════════════════════════════════════════
function EmployeeFormModal({ visible, employee, onClose, onSaved }: {
  visible: boolean; employee: Employee | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [name,   setName]   = useState('');
  const [role,   setRole]   = useState<EmployeeRole>('teknisyen');
  const [phone,  setPhone]  = useState('');
  const [email,  setEmail]  = useState('');
  const [salary, setSalary] = useState('');
  const [start,  setStart]  = useState(new Date().toISOString().slice(0, 10));
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);

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
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{
          backgroundColor: '#FFF', borderRadius: 24, width: '100%', maxWidth: 520,
          maxHeight: '92%', overflow: 'hidden',
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          // @ts-ignore web
          boxShadow: modalShadow,
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 24, paddingTop: 22, paddingBottom: 16,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <Text style={{ ...DISPLAY, flex: 1, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>
              {employee ? 'Çalışanı Düzenle' : 'Yeni Çalışan'}
            </Text>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} color={DS.ink[500]} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, gap: 14 }} showsVerticalScrollIndicator={false}>
            {/* Role pills */}
            <View>
              <FieldLabel>Pozisyon</FieldLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {ROLES.map(r => {
                  const active = role === r;
                  const rc = ROLE_COLORS[r];
                  return (
                    <Pressable
                      key={r}
                      onPress={() => setRole(r)}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? rc.fg : 'rgba(0,0,0,0.08)',
                        backgroundColor: active ? rc.bg : '#FFF',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? rc.fg : DS.ink[500] }}>
                        {ROLE_LABELS[r]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <FieldLabel>Ad Soyad *</FieldLabel>
              <TextInput style={inputStyle} value={name} onChangeText={setName}
                placeholder="Tam ad giriniz" placeholderTextColor={DS.ink[400]} />
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel>Telefon</FieldLabel>
                <TextInput style={inputStyle} value={phone} onChangeText={setPhone}
                  placeholder="0555 000 00 00" placeholderTextColor={DS.ink[400]} keyboardType="phone-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel>E-posta</FieldLabel>
                <TextInput style={inputStyle} value={email} onChangeText={setEmail}
                  placeholder="ad@mail.com" placeholderTextColor={DS.ink[400]} keyboardType="email-address" />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel>Maaş (₺/ay) *</FieldLabel>
                <TextInput style={inputStyle} value={salary} onChangeText={setSalary}
                  placeholder="0,00" placeholderTextColor={DS.ink[400]} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel>İşe Başlama</FieldLabel>
                <TextInput style={inputStyle} value={start} onChangeText={setStart}
                  placeholder="YYYY-AA-GG" placeholderTextColor={DS.ink[400]} />
              </View>
            </View>

            <View>
              <FieldLabel>Notlar</FieldLabel>
              <TextInput
                style={{ ...inputStyle, minHeight: 64, textAlignVertical: 'top' as any, paddingVertical: 12 }}
                value={notes} onChangeText={setNotes} placeholder="Ek bilgi…"
                placeholderTextColor={DS.ink[400]} multiline />
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={{
            flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
            paddingHorizontal: 24, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            <PillBtn icon={X} label="İptal" variant="ghost" onPress={onClose} disabled={saving} />
            <Pressable
              onPress={handleSave} disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                height: 38, paddingHorizontal: 18, borderRadius: 999,
                backgroundColor: DS.ink[900], opacity: saving ? 0.5 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>
                  {employee ? 'Güncelle' : 'Kaydet'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Salary Modal — §08
// ═════════════════════════════════════════════════════════════════════
function SalaryModal({ visible, employee, onClose, onSaved }: {
  visible: boolean; employee: Employee; onClose: () => void; onSaved: () => void;
}) {
  const [year,       setYear]       = useState(String(CUR_YEAR));
  const [month,      setMonth]      = useState(String(CUR_MONTH));
  const [gross,      setGross]      = useState('');
  const [deductions, setDeductions] = useState('');
  const [method,     setMethod]     = useState<SalaryPaymentMethod>('havale');
  const [payDate,    setPayDate]    = useState(new Date().toISOString().slice(0, 10));
  const [saving,     setSaving]     = useState(false);

  React.useEffect(() => {
    if (visible) {
      setYear(String(CUR_YEAR)); setMonth(String(CUR_MONTH));
      setGross(String(employee.base_salary)); setDeductions('');
      setMethod('havale'); setPayDate(new Date().toISOString().slice(0, 10));
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
    });
    setSaving(false);
    if (error) { toast.error((error as any)?.message ?? 'Bu dönem için zaten ödeme var.'); return; }
    onSaved();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{
          backgroundColor: '#FFF', borderRadius: 24, width: '100%', maxWidth: 440,
          maxHeight: '90%', overflow: 'hidden',
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          // @ts-ignore web
          boxShadow: modalShadow,
        }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 24, paddingTop: 22, paddingBottom: 16,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Maaş Ödemesi</Text>
              <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2 }}>{employee.full_name}</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} color={DS.ink[500]} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel>Ay (1-12)</FieldLabel>
                <TextInput style={inputStyle} value={month} onChangeText={setMonth}
                  placeholder="Ay" placeholderTextColor={DS.ink[400]} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel>Yıl</FieldLabel>
                <TextInput style={inputStyle} value={year} onChangeText={setYear}
                  placeholder="Yıl" placeholderTextColor={DS.ink[400]} keyboardType="number-pad" />
              </View>
            </View>
            {parseInt(month) >= 1 && parseInt(month) <= 12 && (
              <Text style={{ fontSize: 12, fontWeight: '600', color: CHIP_TONES.info.fg }}>
                {MONTH_NAMES[parseInt(month)]} {year}
              </Text>
            )}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel>Brüt Maaş (₺)</FieldLabel>
                <TextInput style={inputStyle} value={gross} onChangeText={setGross}
                  placeholder="0,00" placeholderTextColor={DS.ink[400]} keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel>Kesintiler (₺)</FieldLabel>
                <TextInput style={inputStyle} value={deductions} onChangeText={setDeductions}
                  placeholder="SGK, vergi…" placeholderTextColor={DS.ink[400]} keyboardType="decimal-pad" />
              </View>
            </View>

            {/* Net box */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: CHIP_TONES.success.bg, borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: CHIP_TONES.success.fg }}>Net Ödenecek</Text>
              <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.5, color: CHIP_TONES.success.fg }}>{fmtMoney(net)}</Text>
            </View>

            {/* Payment method */}
            <View>
              <FieldLabel>Ödeme Yöntemi</FieldLabel>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {PAY_METHODS.map(m => {
                  const active = method === m.v;
                  const MIcon = m.icon;
                  return (
                    <Pressable
                      key={m.v}
                      onPress={() => setMethod(m.v)}
                      style={{
                        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                        paddingVertical: 10, borderRadius: 14,
                        borderWidth: 1, borderColor: active ? DS.ink[900] : 'rgba(0,0,0,0.08)',
                        backgroundColor: active ? DS.ink[50] : '#FFF',
                        cursor: 'pointer' as any,
                      }}
                    >
                      <MIcon size={14} color={active ? DS.ink[900] : DS.ink[400]} strokeWidth={1.6} />
                      <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? DS.ink[900] : DS.ink[500] }}>
                        {m.l}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <FieldLabel>Ödeme Tarihi</FieldLabel>
              <TextInput style={inputStyle} value={payDate} onChangeText={setPayDate}
                placeholder="YYYY-AA-GG" placeholderTextColor={DS.ink[400]} />
            </View>
          </ScrollView>

          <View style={{
            flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
            paddingHorizontal: 24, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            <PillBtn icon={X} label="İptal" variant="ghost" onPress={onClose} disabled={saving} />
            <Pressable
              onPress={handleSave} disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                height: 38, paddingHorizontal: 18, borderRadius: 999,
                backgroundColor: DS.ink[900], opacity: saving ? 0.5 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : (
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Ödemeyi Kaydet</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ═════════════════════════════════════════════════════════════════════
// Advance Modal — §08
// ═════════════════════════════════════════════════════════════════════
function AdvanceModal({ visible, employee, onClose, onSaved }: {
  visible: boolean; employee: Employee; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [date,   setDate]   = useState(new Date().toISOString().slice(0, 10));
  const [desc,   setDesc]   = useState('');
  const [saving, setSaving] = useState(false);

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
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{
          backgroundColor: '#FFF', borderRadius: 24, width: '100%', maxWidth: 400,
          maxHeight: '90%', overflow: 'hidden',
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          // @ts-ignore web
          boxShadow: modalShadow,
        }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 24, paddingTop: 22, paddingBottom: 16,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...DISPLAY, fontSize: 22, letterSpacing: -0.4, color: DS.ink[900] }}>Avans Ver</Text>
              <Text style={{ fontSize: 12, color: DS.ink[400], marginTop: 2 }}>{employee.full_name}</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center', cursor: 'pointer' as any }}>
              <X size={16} color={DS.ink[500]} strokeWidth={2} />
            </Pressable>
          </View>

          <View style={{ padding: 24, gap: 14 }}>
            <View>
              <FieldLabel>Tutar (₺)</FieldLabel>
              <TextInput style={inputStyle} value={amount} onChangeText={setAmount}
                placeholder="0,00" placeholderTextColor={DS.ink[400]} keyboardType="decimal-pad" />
            </View>
            <View>
              <FieldLabel>Tarih</FieldLabel>
              <TextInput style={inputStyle} value={date} onChangeText={setDate}
                placeholder="YYYY-AA-GG" placeholderTextColor={DS.ink[400]} />
            </View>
            <View>
              <FieldLabel>Açıklama (opsiyonel)</FieldLabel>
              <TextInput style={inputStyle} value={desc} onChangeText={setDesc}
                placeholder="Kısa not…" placeholderTextColor={DS.ink[400]} />
            </View>
          </View>

          <View style={{
            flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
            paddingHorizontal: 24, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            <PillBtn icon={X} label="İptal" variant="ghost" onPress={onClose} disabled={saving} />
            <Pressable
              onPress={handleSave} disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                height: 38, paddingHorizontal: 18, borderRadius: 999,
                backgroundColor: CHIP_TONES.warning.fg, opacity: saving ? 0.5 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : (
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Avansı Kaydet</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
