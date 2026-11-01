// Ayarlar › Tarama Randevuları (scan_appointments modülü, spec 4.4–4.11): tarama saatleri ve günleri,
// varsayılan süre, yol payı, sabah/akşam program bildirimi saatleri (cron saat başı → yalnız tam saat),
// teknisyen havuzu (boş = bütün teknisyenler). lab_settings'e upsert (mevcut ayar bölümlerinin kalıbı).
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { Plus, Minus } from '../../../core/ui/icons';
import { hhmm, parseHHMM, parseScanSettings } from '../../scans/scanModel';
import { Btn, Toggle, FieldLabel, Eyebrow, WEB_PTR, pressScale } from '../../scans/components/ui';
import { TimeField } from '../../scans/components/WheelTimePicker';

const DAYS: [number, string][] = [[1, 'Pzt'], [2, 'Sal'], [3, 'Çar'], [4, 'Per'], [5, 'Cum'], [6, 'Cmt'], [7, 'Paz']];
const MORNING = [6, 7, 8, 9, 10, 11];
const EVENING = [16, 17, 18, 19, 20, 21];

export function ScanSettingsSection({ accentColor: _accent }: { accentColor?: string }) {
  const U = useInkUI();
  const labId = useAuthStore((s) => s.profile?.lab_id ?? null);
  const [ready, setReady] = useState(false);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('20:00');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [minutes, setMinutes] = useState(90);
  const [buffer, setBuffer] = useState(10);
  const [morning, setMorning] = useState(8);
  const [evening, setEvening] = useState(18);
  const [pool, setPool] = useState<string[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [wheel, setWheel] = useState<'start' | 'end' | null>(null);

  useEffect(() => {
    if (!labId) return;
    let alive = true;
    (async () => {
      const [{ data: ls }, { data: ppl }] = await Promise.all([
        supabase.from('lab_settings')
          .select('scan_hours_start, scan_hours_end, scan_workdays, scan_default_minutes, scan_buffer_minutes, scan_morning_at, scan_evening_at, scan_technician_ids')
          .eq('lab_id', labId).maybeSingle(),
        supabase.from('profiles').select('id, full_name').eq('lab_id', labId).eq('user_type', 'lab')
          .in('role', ['technician', 'manager']).not('is_active', 'is', false).order('full_name'),
      ]);
      if (!alive) return;
      const s = parseScanSettings(ls ?? null);
      setStart(hhmm(s.hoursStart)); setEnd(hhmm(s.hoursEnd)); setDays(s.workdays);
      setMinutes(s.defaultMinutes); setBuffer(s.bufferMinutes);
      setMorning(Number(String((ls as any)?.scan_morning_at ?? '08').slice(0, 2)) || 8);
      setEvening(Number(String((ls as any)?.scan_evening_at ?? '18').slice(0, 2)) || 18);
      setPool(Array.isArray((ls as any)?.scan_technician_ids) ? (ls as any).scan_technician_ids : []);
      setPeople((ppl ?? []).map((p: any) => ({ id: p.id, name: p.full_name ?? '' })));
      setReady(true);
    })();
    return () => { alive = false; };
  }, [labId]);

  const save = async () => {
    const a = parseHHMM(start), b = parseHHMM(end);
    if (a == null || b == null || b <= a) { setMsg({ ok: false, text: autoT('Tarama saatlerini kontrol edin') }); return; }
    if (!days.length) { setMsg({ ok: false, text: autoT('En az bir tarama günü seçin') }); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.from('lab_settings').upsert({
      lab_id: labId,
      scan_hours_start: hhmm(a), scan_hours_end: hhmm(b),
      scan_workdays: [...days].sort(), scan_default_minutes: minutes, scan_buffer_minutes: buffer,
      scan_morning_at: `${String(morning).padStart(2, '0')}:00`, scan_evening_at: `${String(evening).padStart(2, '0')}:00`,
      scan_technician_ids: pool,
    }, { onConflict: 'lab_id' });
    setBusy(false);
    setMsg(error ? { ok: false, text: autoT(error.message || 'Kayıt başarısız.') } : { ok: true, text: autoT('Kaydedildi') });
  };

  if (!ready) return <ActivityIndicator style={{ marginTop: 40 }} />;
  const toggleDay = (d: number) => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]));
  const togglePerson = (id: string) => setPool((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }}>
      <View style={{ ...U.cardSolid, gap: 18 }}>
        <View style={{ gap: 4 }}>
          <Eyebrow>{autoT('Tarama Randevuları')}</Eyebrow>
          <Text style={{ fontSize: 13, color: U.ink[500] }}>{autoT('Uygun saat önerisi ve uyarılar bu ayarlarla hesaplanır.')}</Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flexGrow: 1, flexBasis: 140 }}>
            <TimeField label={autoT('Tarama başlangıcı')} value={parseHHMM(start)} onChange={(v) => setStart(hhmm(v))} fallback={540}
              open={wheel === 'start'} onToggle={() => setWheel((w) => (w === 'start' ? null : 'start'))} minuteStep={15} />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 140 }}>
            <TimeField label={autoT('Tarama bitişi')} value={parseHHMM(end)} onChange={(v) => setEnd(hhmm(v))} fallback={1200}
              open={wheel === 'end'} onToggle={() => setWheel((w) => (w === 'end' ? null : 'end'))} minuteStep={15} />
          </View>
        </View>

        <View>
          <FieldLabel>{autoT('Tarama günleri')}</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DAYS.map(([d, l]) => <Toggle key={d} label={autoT(l)} on={days.includes(d)} onPress={() => toggleDay(d)} />)}
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <Stepper label={autoT('Varsayılan süre')} value={minutes} unit={autoT('dk')} onChange={(v) => setMinutes(Math.max(15, Math.min(600, v)))} step={15} />
          <Stepper label={autoT('Her geçişte yol payı')} value={buffer} unit={autoT('dk')} onChange={(v) => setBuffer(Math.max(0, Math.min(60, v)))} step={5} />
        </View>

        <View>
          <FieldLabel>{autoT('Sabah programı (bugünün)')}</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MORNING.map((h) => <Toggle key={h} label={`${String(h).padStart(2, '0')}:00`} on={morning === h} onPress={() => setMorning(h)} />)}
          </View>
        </View>
        <View>
          <FieldLabel>{autoT('Akşam programı (yarının)')}</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {EVENING.map((h) => <Toggle key={h} label={`${String(h).padStart(2, '0')}:00`} on={evening === h} onPress={() => setEvening(h)} />)}
          </View>
        </View>

        <View>
          <FieldLabel>{autoT('Taramaya giden teknisyenler')}</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {people.map((p) => <Toggle key={p.id} label={p.name} on={pool.includes(p.id)} onPress={() => togglePerson(p.id)} />)}
          </View>
          <Text style={{ fontSize: 11.5, color: U.ink[400], marginTop: 6 }}>{autoT('Hiçbiri seçili değilse bütün teknisyenler önerilir.')}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ flex: 1, fontSize: 12.5, color: msg ? (msg.ok ? U.chipTones.success.fg : U.chipTones.danger.fg) : U.ink[400] }} accessibilityLiveRegion="polite">
            {msg?.text ?? ''}
          </Text>
          <Btn kind="pri" label={autoT('Kaydet')} onPress={save} busy={busy} tip={autoT('Tarama ayarlarını kaydeder')} />
        </View>
      </View>
    </ScrollView>
  );
}

function Stepper({ label, value, unit, onChange, step }: { label: string; value: number; unit: string; onChange: (v: number) => void; step: number }) {
  const U = useInkUI();
  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 14, borderWidth: 1, borderColor: U.fieldBorder, backgroundColor: U.surfaceSoft }}>
        <Pressable onPress={() => onChange(value - step)} accessibilityLabel={autoT('Azalt')} style={({ pressed }: any) => ({ width: 40, height: 42, alignItems: 'center', justifyContent: 'center', ...pressScale(pressed), ...WEB_PTR })}>
          <Minus size={16} color={U.ink[700]} />
        </Pressable>
        <Text style={{ minWidth: 64, textAlign: 'center', fontSize: 14, fontWeight: '600', color: U.ink[900], fontVariant: ['tabular-nums'] }}>{value} {unit}</Text>
        <Pressable onPress={() => onChange(value + step)} accessibilityLabel={autoT('Artır')} style={({ pressed }: any) => ({ width: 40, height: 42, alignItems: 'center', justifyContent: 'center', ...pressScale(pressed), ...WEB_PTR })}>
          <Plus size={16} color={U.ink[700]} />
        </Pressable>
      </View>
    </View>
  );
}
