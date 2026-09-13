// Ayarlar → Çalışma Saatleri (vardiya) editörü.
// Admin/müdür her gün için çalışma pencerelerini tanımlar (öğle = pencere arası boşluk).
// lab_shifts tablosu + labs.timezone / labs.max_active_jobs_per_tech.
// Bu saatler: oto-durdur/devam + net-süre analiz (lab_working_seconds) için kullanılır.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Platform } from 'react-native';
import { Plus, X, Clock, Check } from '../../../core/ui/icons';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { toast } from '../../../core/ui/Toast';

interface Win { id: string; start_time: string; end_time: string; }

// Pzt..Paz sırası (DB weekday: 0=Pazar..6=Cumartesi)
const DAYS: { wd: number; label: string }[] = [
  { wd: 1, label: 'Pazartesi' }, { wd: 2, label: 'Salı' }, { wd: 3, label: 'Çarşamba' },
  { wd: 4, label: 'Perşembe' }, { wd: 5, label: 'Cuma' }, { wd: 6, label: 'Cumartesi' },
  { wd: 0, label: 'Pazar' },
];

const hhmm = (t: string) => (t ?? '').slice(0, 5); // "09:00:00" → "09:00"

export function WorkHoursSection({ accentColor = '#3B82F6' }: { accentColor?: string }) {
  const T = useMobileTokens();
  const { profile } = useAuthStore();
  const labId = (profile as any)?.lab_id ?? profile?.id ?? null;
  const A = accentColor;

  const [byDay, setByDay] = useState<Map<number, Win[]>>(new Map());
  const [maxActive, setMaxActive] = useState('1');
  const [tz, setTz] = useState('Europe/Istanbul');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!labId) { setLoading(false); return; }
    setLoading(true);
    const [{ data: shifts }, { data: lab }] = await Promise.all([
      supabase.from('lab_shifts').select('id, weekday, start_time, end_time, sort').eq('lab_id', labId).order('weekday').order('sort'),
      supabase.from('labs').select('timezone, max_active_jobs_per_tech').eq('id', labId).maybeSingle(),
    ]);
    const m = new Map<number, Win[]>();
    for (const r of (shifts ?? []) as any[]) {
      if (!m.has(r.weekday)) m.set(r.weekday, []);
      m.get(r.weekday)!.push({ id: r.id, start_time: hhmm(r.start_time), end_time: hhmm(r.end_time) });
    }
    setByDay(m);
    setTz((lab as any)?.timezone ?? 'Europe/Istanbul');
    setMaxActive(String((lab as any)?.max_active_jobs_per_tech ?? 1));
    setLoading(false);
  }, [labId]);
  useEffect(() => { load(); }, [load]);

  async function addWindow(wd: number) {
    if (!labId) return;
    const existing = byDay.get(wd) ?? [];
    const start = existing.length === 0 ? '09:00' : '13:30';
    const end = existing.length === 0 ? '12:30' : '18:00';
    const { data, error } = await supabase
      .from('lab_shifts')
      .insert({ lab_id: labId, weekday: wd, start_time: start, end_time: end, sort: existing.length })
      .select('id').single();
    if (error) { toast.error(error.message); return; }
    setByDay(prev => {
      const n = new Map(prev);
      n.set(wd, [...(n.get(wd) ?? []), { id: (data as any).id, start_time: start, end_time: end }]);
      return n;
    });
  }

  async function removeWindow(wd: number, id: string) {
    setByDay(prev => {
      const n = new Map(prev);
      n.set(wd, (n.get(wd) ?? []).filter(w => w.id !== id));
      return n;
    });
    const { error } = await supabase.from('lab_shifts').delete().eq('id', id);
    if (error) { toast.error(error.message); load(); }
  }

  async function saveWindowTime(wd: number, id: string, field: 'start_time' | 'end_time', value: string) {
    const v = value.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { toast.error('Saat formatı SS:DD olmalı (ör. 09:00)'); load(); return; }
    setByDay(prev => {
      const n = new Map(prev);
      n.set(wd, (n.get(wd) ?? []).map(w => w.id === id ? { ...w, [field]: v } : w));
      return n;
    });
    const { error } = await supabase.from('lab_shifts').update({ [field]: v }).eq('id', id);
    if (error) { toast.error(error.message); load(); }
  }

  async function saveMaxActive(val: string) {
    const n = Math.max(1, Math.min(20, parseInt(val || '1', 10) || 1));
    setMaxActive(String(n));
    if (labId) await supabase.from('labs').update({ max_active_jobs_per_tech: n }).eq('id', labId);
  }

  if (loading) {
    return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color={A} /></View>;
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: T.bg }} contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 4 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: T.ink, letterSpacing: -0.4 }}>Çalışma Saatleri</Text>
        <Text style={{ fontSize: 12.5, color: T.ink2, marginTop: 2, lineHeight: 18 }}>
          Vardiya pencerelerini gün gün tanımla. Öğle arası = iki pencere arasındaki boşluk. Bu saatler işin
          aktif çalışma süresinden mesai dışı + öğle molasını otomatik düşmek için kullanılır.
        </Text>
      </View>

      {/* Genel ayarlar */}
      <View style={{ backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.hairline, padding: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Clock size={16} color={A} strokeWidth={2} />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: T.ink }}>Saat dilimi</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: T.ink2 }}>{tz}</Text>
        </View>
        <View style={{ height: 1, backgroundColor: T.hairline }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: T.ink }}>Aynı anda en fazla aktif iş{'\n'}
            <Text style={{ fontSize: 11, fontWeight: '400', color: T.ink3 }}>Teknisyen başına (makine sayısına göre)</Text>
          </Text>
          <TextInput
            value={maxActive}
            onChangeText={setMaxActive}
            onBlur={() => saveMaxActive(maxActive)}
            keyboardType="number-pad"
            style={{ width: 56, textAlign: 'center', fontSize: 15, fontWeight: '700', color: T.ink, backgroundColor: T.cardSoft, borderRadius: 10, paddingVertical: 8, borderWidth: 1, borderColor: T.hairline } as any}
          />
        </View>
      </View>

      {/* Günler */}
      {DAYS.map(({ wd, label }) => {
        const wins = byDay.get(wd) ?? [];
        const closed = wins.length === 0;
        return (
          <View key={wd} style={{ backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.hairline, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: T.ink }}>{label}</Text>
              {closed && <Text style={{ fontSize: 11, color: T.ink3, marginEnd: 8 }}>Kapalı</Text>}
              <Pressable
                onPress={() => addWindow(wd)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: A + '14', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
              >
                <Plus size={13} color={A} strokeWidth={2.4} />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: A }}>Pencere</Text>
              </Pressable>
            </View>
            {wins.map(w => (
              <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TimeBox value={w.start_time} onSave={(v) => saveWindowTime(wd, w.id, 'start_time', v)} T={T} />
                <Text style={{ fontSize: 13, color: T.ink3 }}>–</Text>
                <TimeBox value={w.end_time} onSave={(v) => saveWindowTime(wd, w.id, 'end_time', v)} T={T} />
                <View style={{ flex: 1 }} />
                <Pressable onPress={() => removeWindow(wd, w.id)} hitSlop={8} style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: T.cardSoft }}>
                  <X size={14} color={T.ink3} strokeWidth={2} />
                </Pressable>
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

function TimeBox({ value, onSave, T }: { value: string; onSave: (v: string) => void; T: any }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <TextInput
      value={v}
      onChangeText={setV}
      onBlur={() => { if (v !== value) onSave(v); }}
      placeholder="09:00"
      placeholderTextColor={T.ink3}
      style={{ width: 68, textAlign: 'center', fontSize: 14, fontWeight: '700', color: T.ink, backgroundColor: T.cardSoft, borderRadius: 10, paddingVertical: 8, borderWidth: 1, borderColor: T.hairline } as any}
    />
  );
}
