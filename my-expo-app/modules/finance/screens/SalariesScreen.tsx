/**
 * SalariesScreen — Maaş ödemeleri (tüm çalışanlar için)
 *
 * Finans Hub içinde "Maaşlar" tab'ı olarak servis edilir.
 * Her satır: çalışan + son ödeme + toplam ödenen + "Maaş Öde" butonu.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, ActivityIndicator,
  TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Wallet, Plus, Check, X, Trash2 } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { DS } from '../../../core/theme/dsTokens';
import { DatePicker } from '../../../core/ui/DatePicker';
import {
  createSalaryPayment, deleteSalaryPayment,
  ROLE_LABELS, MONTH_NAMES,
  type Employee, type SalaryPaymentMethod,
} from '../../employees/api';

const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300' as const };
const fmtMoney = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n || 0);

interface EmpRow extends Employee {
  total_paid?: number;
  last_payment?: { paid_at: string; gross: number; month: number; year: number } | null;
}

interface SalaryRow {
  id: string;
  employee_id: string;
  paid_at: string;
  month: number;
  year: number;
  gross: number;
  net: number;
  method: SalaryPaymentMethod;
}

export function SalariesScreen() {
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState<EmpRow | null>(null);
  const [recent, setRecent] = useState<SalaryRow[]>([]);

  const load = async () => {
    setLoading(true);
    const [empsRes, paysRes] = await Promise.all([
      supabase.from('employees')
        .select('*')
        .eq('is_active', true)
        .order('full_name'),
      supabase.from('salary_payments')
        .select('id, employee_id, paid_at, month, year, gross, net, method')
        .order('paid_at', { ascending: false })
        .limit(200),
    ]);
    const emps = (empsRes.data ?? []) as EmpRow[];
    const pays = (paysRes.data ?? []) as SalaryRow[];

    // Çalışan başına özet
    const totalsByEmp: Record<string, number> = {};
    const lastByEmp: Record<string, SalaryRow> = {};
    pays.forEach(p => {
      totalsByEmp[p.employee_id] = (totalsByEmp[p.employee_id] || 0) + (p.net || 0);
      if (!lastByEmp[p.employee_id]) lastByEmp[p.employee_id] = p;
    });
    emps.forEach(e => {
      e.total_paid = totalsByEmp[e.id] || 0;
      e.last_payment = lastByEmp[e.id] ?? null;
    });
    setEmployees(emps);
    setRecent(pays.slice(0, 50));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totalPaidAll = useMemo(() => employees.reduce((s, e) => s + (e.total_paid || 0), 0), [employees]);

  if (loading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}><ActivityIndicator color={DS.ink[500]} /></View>;
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* KPI */}
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <KPI label="Aktif Çalışan" value={String(employees.length)} accent="#0F172A" />
        <KPI label="Bu Yıl Ödenen" value={fmtMoney(totalPaidAll)} accent="#059669" />
        <KPI label="Son 30 Gün" value={fmtMoney(recent.filter(r => {
          const d = new Date(r.paid_at); return Date.now() - d.getTime() < 30*86400000;
        }).reduce((s, r) => s + (r.net || 0), 0))} accent="#2563EB" />
      </View>

      {/* Çalışanlar listesi */}
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }}>
          <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900] }}>Çalışanlar ve Maaş Durumu</Text>
        </View>
        {employees.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
            <Wallet size={28} color={DS.ink[300]} strokeWidth={1.5} />
            <Text style={{ fontSize: 13, color: DS.ink[500] }}>Henüz aktif çalışan yok. Ekip menüsünden ekleyebilirsiniz.</Text>
          </View>
        ) : (
          employees.map((e, i) => (
            <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: i < employees.length - 1 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: '#7C3AED15', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#7C3AED' }}>{(e.full_name?.[0] ?? '?').toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>{e.full_name}</Text>
                <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }}>
                  {ROLE_LABELS[e.role]} · Maaş: {fmtMoney(e.base_salary)}
                  {e.last_payment ? `  ·  Son: ${MONTH_NAMES[e.last_payment.month - 1]} ${e.last_payment.year}` : '  ·  ödeme yok'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: DS.ink[400] }}>Toplam ödenen</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>{fmtMoney(e.total_paid || 0)}</Text>
              </View>
              <Pressable onPress={() => setPayOpen(e)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: DS.ink[900] }}>
                <Plus size={12} color="#FFFFFF" strokeWidth={2} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFFFFF' }}>Maaş Öde</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      {/* Son ödemeler */}
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' }}>
          <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900] }}>Son Maaş Ödemeleri</Text>
        </View>
        {recent.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: DS.ink[500] }}>Henüz ödeme yok.</Text>
          </View>
        ) : (
          recent.slice(0, 20).map((p, i) => {
            const emp = employees.find(e => e.id === p.employee_id);
            return (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < Math.min(recent.length, 20) - 1 ? 1 : 0, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[900] }}>{emp?.full_name ?? '—'}</Text>
                  <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>
                    {MONTH_NAMES[p.month - 1]} {p.year} · {p.method} · {new Date(p.paid_at).toLocaleDateString('tr-TR')}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>{fmtMoney(p.net)}</Text>
                <Pressable
                  onPress={async () => {
                    const { error } = await deleteSalaryPayment(p.id);
                    if (error) toast.error((error as any).message);
                    else { toast.success('Ödeme silindi'); load(); }
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

      {payOpen && (
        <PaySalaryModal
          employee={payOpen}
          onClose={() => setPayOpen(null)}
          onSaved={() => { setPayOpen(null); load(); }}
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

function PaySalaryModal({ employee, onClose, onSaved }: { employee: Employee; onClose: () => void; onSaved: () => void }) {
  const today = new Date();
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [gross, setGross] = useState(String(employee.base_salary || 0));
  const [deductions, setDeductions] = useState('0');
  const [method, setMethod] = useState<SalaryPaymentMethod>('havale');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const m = Number(month), y = Number(year);
    const g = Number(gross.replace(',', '.'));
    const d = Number(deductions.replace(',', '.'));
    if (!Number.isFinite(m) || m < 1 || m > 12) { toast.error('Ay 1–12 arası olmalı'); return; }
    if (!Number.isFinite(y) || y < 2020) { toast.error('Geçerli yıl girin'); return; }
    if (!Number.isFinite(g) || g <= 0) { toast.error('Brüt maaş girin'); return; }
    setSaving(true);
    const { error } = await createSalaryPayment({
      employee_id: employee.id, month: m, year: y, gross: g, deductions: d || 0,
      method, paid_at: paidAt, notes: notes || undefined,
    });
    setSaving(false);
    if (error) { toast.error((error as any).message); return; }
    toast.success('Maaş ödemesi kaydedildi');
    onSaved();
  };

  const inputStyle: any = {
    borderWidth: 1, borderColor: DS.ink[200], borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: DS.ink[900], backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, width: '100%', maxWidth: 460, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' }}>
            <View>
              <Text style={{ ...DISPLAY, fontSize: 20, color: DS.ink[900] }}>Maaş Öde</Text>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 2 }}>{employee.full_name}</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color={DS.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700], marginBottom: 6 }}>Ay *</Text>
                <TextInput style={inputStyle} value={month} onChangeText={setMonth} keyboardType="number-pad" placeholder="1-12" placeholderTextColor={DS.ink[400]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700], marginBottom: 6 }}>Yıl *</Text>
                <TextInput style={inputStyle} value={year} onChangeText={setYear} keyboardType="number-pad" placeholderTextColor={DS.ink[400]} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700], marginBottom: 6 }}>Brüt *</Text>
                <TextInput style={inputStyle} value={gross} onChangeText={setGross} keyboardType="decimal-pad" placeholderTextColor={DS.ink[400]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700], marginBottom: 6 }}>Kesinti</Text>
                <TextInput style={inputStyle} value={deductions} onChangeText={setDeductions} keyboardType="decimal-pad" placeholderTextColor={DS.ink[400]} />
              </View>
            </View>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700], marginBottom: 6 }}>Ödeme Yöntemi</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {(['havale', 'nakit', 'cek'] as SalaryPaymentMethod[]).map(m => (
                  <Pressable key={m} onPress={() => setMethod(m)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: method === m ? DS.ink[900] : DS.ink[100] }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: method === m ? '#FFFFFF' : DS.ink[700] }}>{m.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700], marginBottom: 6 }}>Ödeme Tarihi</Text>
              <DatePicker value={paidAt} onChange={setPaidAt} placeholder="Tarih seç" />
            </View>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700], marginBottom: 6 }}>Not</Text>
              <TextInput style={{ ...inputStyle, minHeight: 60, textAlignVertical: 'top' }} value={notes} onChangeText={setNotes} multiline placeholder="İsteğe bağlı..." placeholderTextColor={DS.ink[400]} />
            </View>
            <Text style={{ fontSize: 12, color: DS.ink[500] }}>
              Net: <Text style={{ fontWeight: '700', color: '#059669' }}>{fmtMoney(Math.max(0, Number(gross.replace(',', '.')) - Number(deductions.replace(',', '.') || 0)))}</Text>
            </Text>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' }}>
            <Pressable onPress={onClose} style={{ flex: 1, paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: DS.ink[200], alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[700] }}>İptal</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={saving} style={{ flex: 2, paddingVertical: 12, borderRadius: 999, backgroundColor: DS.ink[900], alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: saving ? 0.6 : 1 }}>
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                <>
                  <Check size={14} color="#FFFFFF" strokeWidth={2} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>Kaydet</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
