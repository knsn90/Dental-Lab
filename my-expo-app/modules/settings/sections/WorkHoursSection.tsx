// Ayarlar → Çalışma Saatleri (vardiya) editörü.
// Admin/müdür her gün için çalışma aralıklarını tanımlar (öğle = aralıklar arası boşluk).
// lab_shifts tablosu + labs.timezone / labs.max_active_jobs_per_tech.
// Bu saatler: oto-durdur/devam + net-süre analiz (lab_working_seconds) için kullanılır.
//
// Düzen: başlığı Ayarlar hub'ı verir; burada özet kartı + tek kartta haftalık tablo.
// Doğrulama istemcide yapılır (biçim, bitiş > başlangıç, çakışma) ve hata ilgili
// günün satırında gösterilir; sunucu hatası da aynı yere düşer.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Platform, useWindowDimensions, Animated, Easing, AccessibilityInfo } from 'react-native';
import { Plus, X, Clock, Minus, Copy, AlertCircle, Check } from '../../../core/ui/icons';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useInkUI } from '../../../core/theme/inkScale';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { autoT } from '../../../core/i18n/autoTranslate';
import { toast } from '../../../core/ui/Toast';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { PAGE_PADDING, CARD_GAP } from '../../../core/ui/pageMetrics';

interface Win { id: string; start_time: string; end_time: string; }

// Pzt..Paz sırası (DB weekday: 0=Pazar..6=Cumartesi)
const DAYS: { wd: number; label: string }[] = [
  { wd: 1, label: 'Pazartesi' }, { wd: 2, label: 'Salı' }, { wd: 3, label: 'Çarşamba' },
  { wd: 4, label: 'Perşembe' }, { wd: 5, label: 'Cuma' }, { wd: 6, label: 'Cumartesi' },
  { wd: 0, label: 'Pazar' },
];
const WEEKDAYS_AFTER_MON = [2, 3, 4, 5];
const DEFAULT_DAY: Array<[string, string]> = [['09:00', '12:30'], ['13:30', '18:00']];
const DANGER = '#DC2626';
const WEB = Platform.OS === 'web';

const hhmm = (t: string) => (t ?? '').slice(0, 5); // "09:00:00" → "09:00"
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (n: number) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const sortWins = (w: Win[]) => [...w].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
const dayMinutes = (w: Win[]) => w.reduce((s, x) => s + Math.max(0, toMin(x.end_time) - toMin(x.start_time)), 0);

function fmtDur(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} ${autoT('sa')} ${m} ${autoT('dk')}`;
  if (h) return `${h} ${autoT('sa')}`;
  return `${m} ${autoT('dk')}`;
}

/** "930" / "0930" / "9.30" → "09:30"; çözülemezse olduğu gibi döner (doğrulama yakalar). */
function normalizeTime(raw: string): string {
  const s = raw.trim().replace(/[.,\s]/g, ':');
  if (TIME_RE.test(s)) return s;
  const digits = s.replace(/\D/g, '');
  if (/^\d{1,2}$/.test(digits)) return `${digits.padStart(2, '0')}:00`;
  if (/^\d{3,4}$/.test(digits)) { const p = digits.padStart(4, '0'); return `${p.slice(0, 2)}:${p.slice(2)}`; }
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return s;
}

/** Bir günün aralık listesini doğrular; hata metni ya da null. */
function validateDay(wins: Win[]): string | null {
  for (const w of wins) {
    if (!TIME_RE.test(w.start_time) || !TIME_RE.test(w.end_time)) return autoT('Saat SS:DD biçiminde olmalı (ör. 09:00)');
    if (toMin(w.end_time) <= toMin(w.start_time)) return autoT('Bitiş saati başlangıçtan sonra olmalı');
  }
  const s = sortWins(wins);
  for (let i = 1; i < s.length; i++) {
    if (toMin(s[i].start_time) < toMin(s[i - 1].end_time)) return autoT('Aralıklar birbiriyle çakışıyor');
  }
  return null;
}

export function WorkHoursSection({ accentColor = '#3B82F6' }: { accentColor?: string }) {
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const { profile } = useAuthStore();
  const labId = (profile as any)?.lab_id ?? profile?.id ?? null;
  const A = accentColor;

  const [byDay, setByDay] = useState<Map<number, Win[]>>(new Map());
  const [errors, setErrors] = useState<Record<number, string | undefined>>({});
  const [maxActive, setMaxActive] = useState(1);
  const [maxState, setMaxState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [tz, setTz] = useState('Europe/Istanbul');
  const [loading, setLoading] = useState(true);
  const [busyDay, setBusyDay] = useState<number | null>(null);
  const [savedDay, setSavedDay] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const setDayError = (wd: number, msg?: string) => setErrors(e => ({ ...e, [wd]: msg }));
  // Tamamlanma geri bildirimi: kaydedilen günün toplamının yanında kısa süre ✓
  const flashSaved = (wd: number) => {
    setSavedDay(wd);
    setTimeout(() => setSavedDay(d => (d === wd ? null : d)), 1600);
  };
  const setDay = (wd: number, wins: Win[]) => setByDay(prev => { const n = new Map(prev); n.set(wd, sortWins(wins)); return n; });

  const load = useCallback(async () => {
    if (!labId) { setLoading(false); return; }
    const [{ data: shifts }, { data: lab }] = await Promise.all([
      supabase.from('lab_shifts').select('id, weekday, start_time, end_time, sort').eq('lab_id', labId).order('weekday').order('sort'),
      supabase.from('labs').select('timezone, max_active_jobs_per_tech').eq('id', labId).maybeSingle(),
    ]);
    const m = new Map<number, Win[]>();
    for (const r of (shifts ?? []) as any[]) {
      if (!m.has(r.weekday)) m.set(r.weekday, []);
      m.get(r.weekday)!.push({ id: r.id, start_time: hhmm(r.start_time), end_time: hhmm(r.end_time) });
    }
    m.forEach((v, k) => m.set(k, sortWins(v)));
    setByDay(m);
    setTz((lab as any)?.timezone ?? 'Europe/Istanbul');
    setMaxActive(Number((lab as any)?.max_active_jobs_per_tech ?? 1) || 1);
    setLoading(false);
  }, [labId]);
  useEffect(() => { load(); }, [load]);

  /** Günün tüm aralıklarını verilen listeyle değiştirir (sil + ekle). */
  async function replaceDays(days: number[], tpl: Array<[string, string]>) {
    if (!labId) return false;
    const del = await supabase.from('lab_shifts').delete().eq('lab_id', labId).in('weekday', days);
    if (del.error) { days.forEach(d => setDayError(d, del.error!.message)); load(); return false; }
    if (tpl.length) {
      const rows = days.flatMap(d => tpl.map(([s, e], i) => ({ lab_id: labId, weekday: d, start_time: s, end_time: e, sort: i })));
      const ins = await supabase.from('lab_shifts').insert(rows).select('id, weekday, start_time, end_time');
      if (ins.error) { days.forEach(d => setDayError(d, ins.error!.message)); load(); return false; }
      const m = new Map<number, Win[]>();
      for (const r of (ins.data ?? []) as any[]) {
        if (!m.has(r.weekday)) m.set(r.weekday, []);
        m.get(r.weekday)!.push({ id: r.id, start_time: hhmm(r.start_time), end_time: hhmm(r.end_time) });
      }
      setByDay(prev => { const n = new Map(prev); days.forEach(d => n.set(d, sortWins(m.get(d) ?? []))); return n; });
    } else {
      setByDay(prev => { const n = new Map(prev); days.forEach(d => n.set(d, [])); return n; });
    }
    days.forEach(d => setDayError(d, undefined));
    return true;
  }

  async function insertWindow(wd: number, start: string, end: string) {
    if (!labId) return;
    const existing = byDay.get(wd) ?? [];
    const err = validateDay([...existing, { id: 'new', start_time: start, end_time: end }]);
    if (err) { setDayError(wd, err); return; }
    setBusyDay(wd);
    const { data, error } = await supabase
      .from('lab_shifts')
      .insert({ lab_id: labId, weekday: wd, start_time: start, end_time: end, sort: existing.length })
      .select('id').single();
    setBusyDay(null);
    if (error) { setDayError(wd, error.message); return; }
    setDayError(wd, undefined);
    setDay(wd, [...existing, { id: (data as any).id, start_time: start, end_time: end }]);
    flashSaved(wd);
  }

  function addWindow(wd: number) {
    const existing = byDay.get(wd) ?? [];
    if (existing.length === 0) { insertWindow(wd, '09:00', '18:00'); return; }
    const lastEnd = toMin(existing[existing.length - 1].end_time);
    const start = lastEnd + 30;
    if (start > 23 * 60 + 29) { setDayError(wd, autoT('Günün sonunda yeni aralık için yer yok')); return; }
    insertWindow(wd, fromMin(start), fromMin(Math.min(start + 120, 23 * 60 + 59)));
  }

  async function removeWindow(wd: number, w: Win) {
    const before = byDay.get(wd) ?? [];
    setDay(wd, before.filter(x => x.id !== w.id));
    setDayError(wd, undefined);
    const { error } = await supabase.from('lab_shifts').delete().eq('id', w.id);
    if (error) { setDay(wd, before); setDayError(wd, error.message); return; }
    toast.info(`${w.start_time}–${w.end_time} · ${autoT('geri almak için dokun')}`, autoT('Aralık silindi'), {
      duration: 6000,
      onPress: () => insertWindow(wd, w.start_time, w.end_time),
    });
  }

  /** false → kaydedilmedi; kutu yazılanı korur, hata satırda görünür. */
  async function saveWindowTime(wd: number, id: string, field: 'start_time' | 'end_time', raw: string): Promise<boolean> {
    const v = normalizeTime(raw);
    const before = byDay.get(wd) ?? [];
    const next = before.map(w => (w.id === id ? { ...w, [field]: v } : w));
    const err = validateDay(next);
    if (err) { setDayError(wd, err); return false; }
    setDay(wd, next);
    setDayError(wd, undefined);
    const { error } = await supabase.from('lab_shifts').update({ [field]: v }).eq('id', id);
    if (error) { setDay(wd, before); setDayError(wd, error.message); return false; }
    flashSaved(wd);
    return true;
  }

  function toggleDay(wd: number, label: string, on: boolean) {
    if (on) {
      // Açılan güne Pazartesi'nin (yoksa ilk açık günün) düzeni gelir.
      const src = byDay.get(1)?.length ? byDay.get(1)! : DAYS.map(d => byDay.get(d.wd) ?? []).find(w => w.length) ?? [];
      const tpl = src.length ? src.map(w => [w.start_time, w.end_time] as [string, string]) : DEFAULT_DAY;
      setBusyDay(wd);
      replaceDays([wd], tpl).finally(() => setBusyDay(null));
      return;
    }
    // Geri alınabilir işlem → onay penceresi yerine "geri al" bildirimi.
    const prevTpl = (byDay.get(wd) ?? []).map(w => [w.start_time, w.end_time] as [string, string]);
    setBusyDay(wd);
    replaceDays([wd], []).then(ok => {
      setBusyDay(null);
      if (!ok) return;
      toast.info(autoT('geri almak için dokun'), `${autoT(label)} · ${autoT('Kapalı')}`, {
        duration: 6000,
        onPress: () => { setBusyDay(wd); replaceDays([wd], prevTpl).finally(() => setBusyDay(null)); },
      });
    });
  }

  function copyMondayToWeekdays() {
    const mon = byDay.get(1) ?? [];
    if (!mon.length) { setDayError(1, autoT('Kopyalamak için önce Pazartesi saatlerini gir')); return; }
    const tpl = mon.map(w => [w.start_time, w.end_time] as [string, string]);
    setConfirm({
      title: autoT('Hafta içine uygula'),
      highlight: tpl.map(([s, e]) => `${s}–${e}`).join(', '),
      message: autoT('düzeni Salı–Cuma günlerine uygulanacak. Bu günlerin mevcut saatleri değişecek.'),
      label: autoT('Uygula'),
      variant: 'info',
      onConfirm: async () => {
        setConfirm(null);
        const ok = await replaceDays(WEEKDAYS_AFTER_MON, tpl);
        if (ok) toast.success(autoT('Pazartesi saatleri Salı–Cuma günlerine uygulandı'));
      },
    });
  }

  async function changeMaxActive(delta: number) {
    const prev = maxActive;
    const n = Math.max(1, Math.min(20, prev + delta));
    if (n === prev || !labId) return;
    setMaxActive(n);
    setMaxState('saving');
    const { error } = await supabase.from('labs').update({ max_active_jobs_per_tech: n }).eq('id', labId);
    if (error) { setMaxActive(prev); setMaxState('error'); return; }
    setMaxState('saved');
    setTimeout(() => setMaxState(s => (s === 'saved' ? 'idle' : s)), 1800);
  }

  const weekly = useMemo(() => {
    let min = 0, open = 0;
    DAYS.forEach(({ wd }) => { const w = byDay.get(wd) ?? []; if (w.length) { open++; min += dayMinutes(w); } });
    return { min, open };
  }, [byDay]);

  if (loading) {
    return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color={A} /></View>;
  }

  // Dokunma hedefi: mobilde 36 (+hitSlop → 44), masaüstünde 32.
  const hit = wide ? 32 : 36;
  const stepBtn = (icon: React.ReactNode, onPress: () => void, disabled: boolean, label: string) => (
    <Tap
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      hoverBg={U.rowHover}
      style={{ width: hit, height: hit, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border }}
    >
      {icon}
    </Tap>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: T.bg }} contentContainerStyle={{ padding: PAGE_PADDING, gap: CARD_GAP, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
      {/* ── Özet + genel ayarlar ── */}
      <View style={{ backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.hairline, padding: 16, gap: 14 }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 24 : 14 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>Haftalık toplam</Text>
            <Text style={{ fontSize: 26, fontWeight: '300', color: T.ink, letterSpacing: -0.6, fontVariant: ['tabular-nums'] }}>{fmtDur(weekly.min)}</Text>
            <Text style={{ fontSize: 12, color: T.ink2 }}>{`${weekly.open} ${autoT('gün açık')} · ${7 - weekly.open} ${autoT('gün kapalı')}`}</Text>
          </View>

          <View style={{ flex: wide ? 1.2 : undefined, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Clock size={15} color={T.ink3} strokeWidth={1.8} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: T.ink }}>Saat dilimi</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink2 }}>{tz}</Text>
            </View>
            <View style={{ height: 1, backgroundColor: T.hairline }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }}>Aynı anda en fazla aktif iş</Text>
                <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 1 }}>Teknisyen başına (makine sayısına göre)</Text>
                {maxState === 'error' && (
                  <Text style={{ fontSize: 11.5, color: DANGER, marginTop: 3 }}>Kaydedilemedi, tekrar dene</Text>
                )}
              </View>
              {maxState === 'saved' && <Check size={14} color="#059669" strokeWidth={2.4} />}
              {stepBtn(<Minus size={14} color={U.plainBtn.fg} strokeWidth={2.2} />, () => changeMaxActive(-1), maxActive <= 1 || maxState === 'saving', autoT('Azalt'))}
              <Text style={{ minWidth: 26, textAlign: 'center', fontSize: 16, fontWeight: '700', color: T.ink, fontVariant: ['tabular-nums'] }}>{maxActive}</Text>
              {stepBtn(<Plus size={14} color={U.plainBtn.fg} strokeWidth={2.2} />, () => changeMaxActive(1), maxActive >= 20 || maxState === 'saving', autoT('Artır'))}
            </View>
          </View>
        </View>
        <Text style={{ fontSize: 12, color: T.ink3, lineHeight: 17 }}>
          Öğle arası, iki aralık arasındaki boşluktur. Bu saatlerin dışında geçen süre, işin net çalışma süresinden otomatik düşülür.
        </Text>
      </View>

      {/* ── Haftalık tablo ── */}
      <View style={{ backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.hairline, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.hairline }}>
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: T.ink }}>Haftalık program</Text>
          <GlassTooltip title={autoT('Hafta içine uygula')} text={autoT("Pazartesi'nin saatlerini Salı–Cuma günlerine kopyalar")}>
            <Tap
              onPress={copyMondayToWeekdays}
              hoverBg={U.rowHover}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border }}
            >
              <Copy size={13} color={U.plainBtn.fg} strokeWidth={2} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: U.plainBtn.fg }}>Hafta içine uygula</Text>
            </Tap>
          </GlassTooltip>
        </View>

        {DAYS.map(({ wd, label }, idx) => {
          const wins = byDay.get(wd) ?? [];
          const open = wins.length > 0;
          const err = errors[wd];
          const busy = busyDay === wd;

          const dayHead = (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: wide ? 170 : undefined, flex: wide ? undefined : 1 }}>
              <AppSwitch value={open} onValueChange={(v: boolean) => toggleDay(wd, label, v)} accentColor={A} disabled={busy} accessibilityLabel={autoT(label)} />
              <Text style={{ fontSize: 14, fontWeight: '600', color: open ? T.ink : T.ink3 }}>{label}</Text>
              {busy && <ActivityIndicator size="small" color={A} />}
            </View>
          );
          const total = (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, minWidth: wide ? 88 : undefined }}>
              {savedDay === wd && <FadeIn><Check size={13} color="#059669" strokeWidth={2.6} /></FadeIn>}
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: open ? T.ink2 : T.ink3, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                {open ? fmtDur(dayMinutes(wins)) : autoT('Kapalı')}
              </Text>
            </View>
          );

          const windows = open && (
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              {wins.map(w => (
                <Chip key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingStart: 4, paddingEnd: 2, paddingVertical: 3, borderRadius: 12, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border }}>
                  {(exit) => (<>
                    <TimeBox value={w.start_time} hasError={!!err} onRevert={() => setDayError(wd, undefined)} onSave={(v) => saveWindowTime(wd, w.id, 'start_time', v)} />
                    <Text style={{ fontSize: 13, color: T.ink3 }}>–</Text>
                    <TimeBox value={w.end_time} hasError={!!err} onRevert={() => setDayError(wd, undefined)} onSave={(v) => saveWindowTime(wd, w.id, 'end_time', v)} />
                    <GlassTooltip title={autoT('Aralığı sil')} text={autoT('Bu çalışma aralığını kaldırır; hemen geri alabilirsin')}>
                      <Tap onPress={() => exit(() => removeWindow(wd, w))} hitSlop={4} hoverBg={U.rowHover} accessibilityLabel={autoT('Aralığı sil')} style={{ width: wide ? 28 : 36, height: wide ? 28 : 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}>
                        <X size={13} color={T.ink3} strokeWidth={2} />
                      </Tap>
                    </GlassTooltip>
                  </>)}
                </Chip>
              ))}
              <GlassTooltip title={autoT('Aralık ekle')} text={autoT('Son aralıktan sonra yeni bir çalışma aralığı ekler; aradaki boşluk mola sayılır')}>
                <Tap
                  onPress={() => addWindow(wd)}
                  disabled={busy}
                  hitSlop={4}
                  accessibilityLabel={autoT('Aralık ekle')}
                  hoverBg={isDark ? U.rowHover : A + '2B'}
                  style={{ width: hit, height: hit, borderRadius: 999, alignItems: 'center', justifyContent: 'center', ...(isDark ? { backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border } : { backgroundColor: A + '1A' }) }}
                >
                  {/* Koyu accent (lacivert) koyu zeminde kaybolur → koyu temada krem ikon */}
                  <Plus size={14} color={isDark ? U.plainBtn.fg : A} strokeWidth={2.4} />
                </Tap>
              </GlassTooltip>
            </View>
          );

          return (
            <View key={wd} style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: T.hairline }}>
              {wide ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 }}>
                  {dayHead}
                  {windows || <View style={{ flex: 1 }} />}
                  {total}
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {dayHead}
                    {total}
                  </View>
                  {windows}
                </>
              )}
              {!!err && (
                <FadeIn style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginStart: wide ? 182 : 0 }}>
                  <AlertCircle size={13} color={DANGER} strokeWidth={2} />
                  <Text style={{ flex: 1, fontSize: 12, color: DANGER }}>{err}</Text>
                </FadeIn>
              )}
            </View>
          );
        })}
      </View>

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </ScrollView>
  );
}

/** Saat kutusu. Geçersiz giriş silinmez: yazılan kalır, kırmızı kenarla işaretlenir.
 *  Web'de ↑/↓ 15 dk, Shift ile 1 sa değiştirir (macOS saat alanı gibi). */
function TimeBox({ value, onSave, onRevert, hasError }: { value: string; onSave: (v: string) => Promise<boolean>; onRevert?: () => void; hasError?: boolean }) {
  const T = useMobileTokens();
  const U = useInkUI();
  const [v, setV] = useState(value);
  const [focused, setFocused] = useState(false);
  const [rejected, setRejected] = useState(false);
  // Bu kutu bir hataya sebep olduysa, kayıtlı değere dönülünce o hatayı kaldırır.
  const causedError = React.useRef(false);
  useEffect(() => { setV(value); setRejected(false); }, [value]);
  useEffect(() => { if (!hasError) setRejected(false); }, [hasError]);

  const commit = async () => {
    // Kullanıcı kayıtlı değere geri döndüyse hatayı da kaldır.
    if (v === value) { setRejected(false); if (causedError.current) { causedError.current = false; onRevert?.(); } return; }
    const ok = await onSave(v);
    causedError.current = !ok;
    setRejected(!ok);
  };

  const onKeyPress = (e: any) => {
    const k = e?.nativeEvent?.key;
    if (k !== 'ArrowUp' && k !== 'ArrowDown') return;
    const cur = normalizeTime(v);
    if (!TIME_RE.test(cur)) return;
    e.preventDefault?.();
    const step = (e?.nativeEvent?.shiftKey ? 60 : 15) * (k === 'ArrowUp' ? 1 : -1);
    setV(fromMin(Math.max(0, Math.min(23 * 60 + 59, toMin(cur) + step))));
  };

  const bad = rejected && hasError;
  return (
    <TextInput
      value={v}
      onChangeText={(t) => { setV(t); if (rejected) setRejected(false); }}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); commit(); }}
      onSubmitEditing={commit}
      onKeyPress={WEB ? onKeyPress : undefined}
      selectTextOnFocus
      maxLength={5}
      keyboardType="numbers-and-punctuation"
      placeholder="09:00"
      placeholderTextColor={T.ink3}
      accessibilityState={{ invalid: bad } as any}
      style={{
        width: 58, textAlign: 'center', fontSize: 14, fontWeight: '600', color: bad ? DANGER : T.ink,
        fontVariant: ['tabular-nums'], borderRadius: 8, paddingVertical: 5,
        backgroundColor: bad ? 'rgba(220,38,38,0.08)' : focused ? U.plainBtn.hoverBg : 'transparent',
        borderWidth: 1, borderColor: bad ? DANGER : focused ? U.plainBtn.border : 'transparent',
        ...(WEB ? { outlineStyle: 'none', transitionProperty: 'background-color, border-color', transitionDuration: '120ms' } : {}),
      } as any}
    />
  );
}

/** Sistemin "hareketi azalt" ayarı. */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then(r => { if (alive) setReduce(!!r); }).catch(() => {});
    const sub: any = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (r: boolean) => setReduce(!!r));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduce;
}

/** Basınca anında küçülen (0.96), web'de üzerine gelince zemini değişen düğme.
 *  Stil nesne dizisidir (fonksiyon-stil değil). Hareketi azalt açıksa yalnız saydamlık değişir. */
function Tap({ children, style, hoverBg, disabled, onPress, accessibilityLabel, hitSlop }: {
  children: React.ReactNode; style: any; hoverBg?: string; disabled?: boolean;
  onPress: () => void; accessibilityLabel?: string; hitSlop?: number;
}) {
  const reduce = useReduceMotion();
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = !disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        style,
        active && hovered && hoverBg ? { backgroundColor: hoverBg } : null,
        {
          opacity: disabled ? 0.4 : pressed && reduce ? 0.6 : 1,
          transform: [{ scale: active && pressed && !reduce ? 0.96 : 1 }],
        },
        WEB ? ({
          cursor: disabled ? 'default' : 'pointer',
          transitionProperty: 'transform, background-color, opacity',
          transitionDuration: pressed ? '60ms' : '140ms',
          transitionTimingFunction: 'cubic-bezier(0.2, 0, 0, 1)',
        } as any) : null,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** Kısa solma + hafif büyüme ile beliren kap (hareketi azalt → yalnız solma). */
function FadeIn({ children, style }: { children: React.ReactNode; style?: any }) {
  const reduce = useReduceMotion();
  const a = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: !WEB }).start();
  }, [a]);
  const scale = reduce ? 1 : a.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  return <Animated.View style={[style, { opacity: a, transform: [{ scale }] }]}>{children}</Animated.View>;
}

/** Aralık kapsülü: eklenince solarak belirir, silinirken aynı yoldan solarak çıkar. */
function Chip({ children, style }: { children: (exit: (done: () => void) => void) => React.ReactNode; style: any }) {
  const reduce = useReduceMotion();
  const a = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: !WEB }).start();
  }, [a]);
  const exit = (done: () => void) => {
    Animated.timing(a, { toValue: 0, duration: 130, easing: Easing.in(Easing.cubic), useNativeDriver: !WEB }).start(() => done());
  };
  const scale = reduce ? 1 : a.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  return <Animated.View style={[style, { opacity: a, transform: [{ scale }] }]}>{children(exit)}</Animated.View>;
}
