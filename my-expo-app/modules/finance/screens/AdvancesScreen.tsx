/**
 * AdvancesScreen — Avanslar (tüm çalışanlar için)
 *
 * Finans Hub içinde "Avanslar" tab'ı olarak servis edilir.
 * Her satır: çalışan + bekleyen avans + toplam verilen + "Avans Ver" butonu.
 *
 * Patterns §13 Form Popup pattern uygulandı.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator,
  TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Banknote, Plus, Check, X, Trash2, CheckCircle2 } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { DS } from '../../../core/theme/dsTokens';
import { DatePicker } from '../../../core/ui/DatePicker';
import {
  createAdvance, deleteAdvance, markAdvanceDeducted,
  ROLE_LABELS,
  type Employee, type EmployeeAdvance,
} from '../../employees/api';

const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300' as const };
const fmtMoney = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0);

// Panel accent — Patterns §13 Form Popup
const P = '#7C3AED';

interface EmpRow extends Employee {
  total_advances?: number;
  pending_advances?: number;
  last_advance?: EmployeeAdvance | null;
}

export function AdvancesScreen() {
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [advOpen, setAdvOpen] = useState<EmpRow | null>(null);
  const [recent, setRecent] = useState<EmployeeAdvance[]>([]);

  const load = async () => {
    setLoading(true);
    const [empsRes, advRes] = await Promise.all([
      supabase.from('employees')
        .select('*')
        .eq('is_active', true)
        .order('full_name'),
      supabase.from('employee_advances')
        .select('*')
        .order('advance_date', { ascending: false })
        .limit(200),
    ]);
    const emps = (empsRes.data ?? []) as EmpRow[];
    const advs = (advRes.data ?? []) as EmployeeAdvance[];

    // Çalışan başına özet
    const totalsByEmp: Record<string, number> = {};
    const pendingByEmp: Record<string, number> = {};
    const lastByEmp: Record<string, EmployeeAdvance> = {};
    advs.forEach(a => {
      totalsByEmp[a.employee_id] = (totalsByEmp[a.employee_id] || 0) + (a.amount || 0);
      if (!a.is_deducted) pendingByEmp[a.employee_id] = (pendingByEmp[a.employee_id] || 0) + (a.amount || 0);
      if (!lastByEmp[a.employee_id]) lastByEmp[a.employee_id] = a;
    });
    emps.forEach(e => {
      e.total_advances   = totalsByEmp[e.id] || 0;
      e.pending_advances = pendingByEmp[e.id] || 0;
      e.last_advance     = lastByEmp[e.id] ?? null;
    });
    setEmployees(emps);
    setRecent(advs.slice(0, 50));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totalAll       = useMemo(() => employees.reduce((s, e) => s + (e.total_advances || 0), 0),   [employees]);
  const totalPending   = useMemo(() => employees.reduce((s, e) => s + (e.pending_advances || 0), 0), [employees]);

  if (loading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}><ActivityIndicator color={DS.ink[500]} /></View>;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* KPI */}
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <KPI label="Aktif Çalışan"     value={String(employees.length)}     accent="#0F172A" />
        <KPI label="Toplam Verilen"    value={fmtMoney(totalAll)}            accent={P} />
        <KPI label="Bekleyen (kesilecek)" value={fmtMoney(totalPending)}     accent="#D97706" />
      </View>

      {/* Çalışanlar listesi */}
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }}>
          <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900] }}>Çalışanlar ve Avans Durumu</Text>
        </View>
        {employees.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
            <Banknote size={28} color={DS.ink[300]} strokeWidth={1.5} />
            <Text style={{ fontSize: 13, color: DS.ink[500] }}>Henüz aktif çalışan yok. Ekip menüsünden ekleyebilirsiniz.</Text>
          </View>
        ) : (
          employees.map((e, i) => (
            <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: i < employees.length - 1 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: P + '15', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: P }}>{(e.full_name?.[0] ?? '?').toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>{e.full_name}</Text>
                <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }}>
                  {ROLE_LABELS[e.role]} · Maaş: {fmtMoney(e.base_salary)}
                  {(e.pending_advances ?? 0) > 0 ? `  ·  Bekleyen: ${fmtMoney(e.pending_advances ?? 0)}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: DS.ink[400] }}>Toplam verilen</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: P }}>{fmtMoney(e.total_advances || 0)}</Text>
              </View>
              <Pressable onPress={() => setAdvOpen(e)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: DS.ink[900] }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: P }} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF', marginLeft: 2 }}>Avans Ver</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      {/* Son avanslar */}
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }}>
          <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900] }}>Son Avanslar</Text>
        </View>
        {recent.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: DS.ink[500] }}>Henüz avans yok.</Text>
          </View>
        ) : (
          recent.slice(0, 20).map((a, i) => {
            const emp = employees.find(e => e.id === a.employee_id);
            return (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < Math.min(recent.length, 20) - 1 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{emp?.full_name ?? '—'}</Text>
                    {a.is_deducted ? (
                      <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(5,150,105,0.10)' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#059669' }}>KESİLDİ</Text>
                      </View>
                    ) : (
                      <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(217,119,6,0.10)' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#D97706' }}>BEKLİYOR</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>
                    {new Date(a.advance_date).toLocaleDateString('tr-TR')}{a.description ? ` · ${a.description}` : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: P }}>{fmtMoney(a.amount)}</Text>
                {!a.is_deducted && (
                  <Pressable
                    onPress={async () => {
                      const { error } = await markAdvanceDeducted(a.id);
                      if (error) toast.error((error as any).message);
                      else { toast.success('Avans kesildi olarak işaretlendi'); load(); }
                    }}
                    style={{ padding: 6 }}
                  >
                    <CheckCircle2 size={15} color={'#059669'} strokeWidth={1.6} />
                  </Pressable>
                )}
                <Pressable
                  onPress={async () => {
                    const { error } = await deleteAdvance(a.id);
                    if (error) toast.error((error as any).message);
                    else { toast.success('Avans silindi'); load(); }
                  }}
                  style={{ padding: 6 }}
                >
                  <Trash2 size={14} color={DS.ink[400]} strokeWidth={1.6} />
                </Pressable>
              </View>
            );
          })
        )}
      </View>

      {advOpen && (
        <GiveAdvanceModal
          employee={advOpen}
          onClose={() => setAdvOpen(null)}
          onSaved={() => { setAdvOpen(null); load(); }}
        />
      )}
    </ScrollView>
  );
}

function KPI({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={{ flex: 1, minWidth: 160, padding: 16, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' }}>
      <Text style={{ fontSize: 11, color: DS.ink[500], textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</Text>
      <Text style={{ ...DISPLAY, fontSize: 22, color: accent, marginTop: 6 }}>{value}</Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════════
// GiveAdvanceModal — Patterns §13 Form Popup
// ═════════════════════════════════════════════════════════════════════
function GiveAdvanceModal({ employee, onClose, onSaved }: {
  employee: Employee; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [desc, setDesc]     = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const amt = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Geçerli tutar girin'); return; }
    setSaving(true);
    const { error } = await createAdvance({
      employee_id: employee.id, amount: amt, advance_date: date,
      description: desc.trim() || undefined,
    });
    setSaving(false);
    if (error) { toast.error((error as any).message); return; }
    toast.success('Avans kaydedildi');
    onSaved();
  };

  const FL = { fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.7, textTransform: 'uppercase' as const, color: '#1A1A1A', marginBottom: 6 };
  const INP: any = {
    height: 44, borderRadius: 14, borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)', paddingHorizontal: 14,
    fontSize: 14, color: '#0A0A0A', backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
      >
        <View style={{
          backgroundColor: '#FFFFFF', borderRadius: 24, width: '100%', maxWidth: 440,
          maxHeight: '92%', overflow: 'hidden',
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          // @ts-ignore web
          boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
        }}>
          {/* Header — Patterns §13 */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
            paddingHorizontal: 28, paddingTop: 28, paddingBottom: 18,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...DISPLAY, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, color: DS.ink[900] }}>Avans Ver</Text>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 4 }}>{employee.full_name}</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 1.5, borderColor: P, alignItems: 'center', justifyContent: 'center', marginLeft: 12, marginTop: 2, cursor: 'pointer' as any }}
            >
              <X size={14} color={P} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 28, paddingVertical: 20, gap: 14 }}>
            <View>
              <Text style={FL}>Tutar (₺) *</Text>
              <TextInput style={INP} value={amount} onChangeText={setAmount}
                placeholder="0,00" placeholderTextColor={DS.ink[400]} keyboardType="decimal-pad" />
            </View>
            <View>
              <Text style={FL}>Tarih</Text>
              <DatePicker value={date} onChange={setDate} placeholder="Tarih seç" />
            </View>
            <View>
              <Text style={FL}>Açıklama (opsiyonel)</Text>
              <TextInput style={INP} value={desc} onChangeText={setDesc}
                placeholder="Kısa not…" placeholderTextColor={DS.ink[400]} />
            </View>
          </View>

          {/* Footer — Patterns §13 */}
          <View style={{
            flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
            paddingHorizontal: 28, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.12)', opacity: saving ? 0.5 : 1, cursor: 'pointer' as any }}
            >
              <X size={12} color={DS.ink[500]} strokeWidth={2.5} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave} disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999,
                backgroundColor: DS.ink[900], opacity: saving ? 0.5 : 1,
                cursor: 'pointer' as any,
              }}
            >
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : (
                <>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: P }} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>Avansı Kaydet</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
