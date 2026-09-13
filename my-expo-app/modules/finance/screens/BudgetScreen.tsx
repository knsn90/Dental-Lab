import { localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
/**
 * BudgetScreen — Bütçe vs. Gerçekleşen
 *
 *  • Kategori + total bütçesi tanımla
 *  • Aylık / yıllık dönem
 *  • İlerleme çubuğu + uyarı (>%100 kırmızı, >%80 sarı, ≤%80 yeşil)
 *  • Yeni bütçe ekleme modalı
 *
 *  Kullanım: FinanceHub'da yeni "Bütçe" sekmesi olarak bağlanır.
 */
import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal,
  TextInput, RefreshControl, Alert,
  Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { confirmAsync } from '../../../core/util/confirm';
import {
  Plus, PieChart, Wallet, Tag, X, Trash2,
} from '../../../core/ui/icons';

import { supabase } from '../../../core/api/supabase';
import { HubContext } from '../../../core/ui/HubContext';
import { DS } from '../../../core/theme/dsTokens';
import { toast } from '../../../core/ui/Toast';
import { useAuthStore } from '../../../core/store/authStore';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { baseSymbol, useBaseCurrency } from '../../../core/money/baseCurrency';

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

const CHIP_TONES = {
  success: { bg: 'rgba(45,154,107,0.12)', fg: '#1F6B47' },
  warning: { bg: 'rgba(232,155,42,0.15)', fg: '#9C5E0E' },
  danger:  { bg: 'rgba(217,75,75,0.12)',  fg: '#9C2E2E' },
  info:    { bg: 'rgba(74,143,201,0.12)', fg: '#1F5689' },
};

type BudgetCategory = 'malzeme' | 'kira' | 'personel' | 'ekipman' | 'vergi' | 'diger' | 'total';
type BudgetPeriod   = 'monthly' | 'yearly';

const CATEGORY_LABEL: Record<BudgetCategory, string> = {
  total:     'Toplam',
  kira:      'Kira',
  personel:  'Personel',
  malzeme:   'Malzeme',
  ekipman:   'Ekipman',
  vergi:     'Vergi',
  diger:     'Diğer',
};

const CATEGORY_COLOR: Record<BudgetCategory, string> = {
  total:     '#0F172A',
  kira:      '#7C3AED',
  personel:  '#DC2626',
  malzeme:   '#2563EB',
  ekipman:   '#0EA5E9',
  vergi:     '#D97706',
  diger:     '#64748B',
};

interface BudgetActual {
  id: string;
  lab_id: string;
  category: BudgetCategory;
  period: BudgetPeriod;
  period_start: string;
  budget_amount: number;
  actual_amount: number;
  notes: string | null;
}

function fmtMoney(n: number): string {
  return baseSymbol() + (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function periodLabel(period: BudgetPeriod, start: string): string {
  const d = new Date(start + 'T00:00:00');
  if (period === 'yearly') return d.getFullYear().toString();
  return d.toLocaleDateString(localeTag(), { month: 'long', year: 'numeric' });
}

function currentPeriodStart(period: BudgetPeriod): string {
  const d = new Date();
  if (period === 'yearly') return `${d.getFullYear()}-01-01`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const web = (s: any) => Platform.OS === 'web' ? s : {};

export function BudgetScreen() {
  const isEmbedded = useContext(HubContext);
  const safeEdges  = isEmbedded ? ([] as any) : (['top'] as any);
  const labId      = useAuthStore(st => st.profile?.lab_id);
  const { width }  = useWindowDimensions();
  const isDesktop  = width >= 900;
  const T = useMobileTokens();
  // SlideTabBar cursor'ı beyaz metin basar → koyu ink şart.
  const panelTheme = usePanelTheme();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  useBaseCurrency();

  const [period, setPeriod]     = useState<BudgetPeriod>('monthly');

  const cacheKey = labId ? `budget_screen_v1:${labId}:${period}` : null;
  const loadCached = (): BudgetActual[] | null => {
    if (!cacheKey || typeof window === 'undefined' || !window.localStorage) return null;
    try { const r = window.localStorage.getItem(cacheKey); return r ? JSON.parse(r) : null; } catch { return null; }
  };
  const saveCached = (data: BudgetActual[]) => {
    if (!cacheKey || typeof window === 'undefined' || !window.localStorage) return;
    try { window.localStorage.setItem(cacheKey, JSON.stringify(data)); } catch { /* quota */ }
  };
  const cached = loadCached();

  const [items, setItems]       = useState<BudgetActual[]>(cached ?? []);
  const [loading, setLoading]   = useState(cached === null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing]   = useState<BudgetActual | null>(null);

  const load = async () => {
    if (!labId) return;
    const cachedNow = loadCached();
    if (cachedNow === null) setLoading(true);
    const start = currentPeriodStart(period);
    const { data } = await supabase
      .from('v_budget_actuals')
      .select('*')
      .eq('period', period)
      .eq('period_start', start);
    const rows = (data ?? []) as BudgetActual[];
    setItems(rows);
    saveCached(rows);
    setLoading(false);
  };

  useEffect(() => { load(); }, [period, labId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    return items.reduce((acc, b) => ({
      budget: acc.budget + Number(b.budget_amount),
      actual: acc.actual + Number(b.actual_amount),
    }), { budget: 0, actual: 0 });
  }, [items]);

  const overall = totals.budget > 0 ? (totals.actual / totals.budget) * 100 : 0;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={safeEdges}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 120, gap: 14 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {/* Period switcher + Add button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <SlideTabBar
                size="sm"
                items={[{ key: 'monthly', label: 'Aylık' }, { key: 'yearly', label: 'Yıllık' }]}
                activeKey={period}
                onChange={(k) => setPeriod(k as BudgetPeriod)}
                accentColor={panelTheme.accent}
                style={{ marginStart: -3 }}
              />
          <Text style={{ fontSize: 13, fontWeight: '500', color: T.ink3 }}>
            {periodLabel(period, currentPeriodStart(period))}
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 16, paddingVertical: 8,
              borderRadius: 9999, backgroundColor: T.ink,
              // @ts-ignore web
              cursor: 'pointer',
            }}
            onPress={() => { setEditing(null); setEditorOpen(true); }}
          >
            <Plus size={14} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>Bütçe Ekle</Text>
          </Pressable>
        </View>

        {/* Overall summary */}
        {items.length > 0 && (
          <View style={{ ...cardSolid, backgroundColor: T.card, gap: 8 } as any}>
            <Text style={{ fontSize: 10, fontWeight: '600', color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {period === 'monthly' ? 'Bu Ayın' : 'Bu Yılın'} Bütçesi
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
              <View>
                <Text style={{ fontSize: 10, fontWeight: '600', color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.8 }}>Gerçekleşen</Text>
                <Text style={[{ ...DISPLAY, fontSize: 28, color: T.ink, letterSpacing: -0.6 }, overall > 100 && { color: CHIP_TONES.danger.fg }]}>
                  {fmtMoney(totals.actual)}
                </Text>
              </View>
              <Text style={{ ...DISPLAY, fontSize: 24, color: T.hairline }}>/</Text>
              <View>
                <Text style={{ fontSize: 10, fontWeight: '600', color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.8 }}>Bütçe</Text>
                <Text style={{ ...DISPLAY, fontSize: 18, color: T.ink3 }}>{fmtMoney(totals.budget)}</Text>
              </View>
            </View>
            <ProgressBar pct={overall} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: T.ink3 }}>%{overall.toFixed(0)} kullanıldı</Text>
          </View>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
            <PieChart size={48} color={T.ink3} strokeWidth={1.4} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: T.ink3 }}>Bu dönem için bütçe yok</Text>
            <Text style={{ fontSize: 13, color: T.ink3, textAlign: 'center', maxWidth: 260 }}>
              "Bütçe Ekle" ile kategorilere limit tanımlayın.
            </Text>
          </View>
        )}

        {/* Per-category bars */}
        {items.map(b => (
          <BudgetCard
            key={b.id} item={b}
            onEdit={() => { setEditing(b); setEditorOpen(true); }}
          />
        ))}
      </ScrollView>

      <BudgetEditor
        visible={editorOpen}
        record={editing}
        defaultPeriod={period}
        labId={labId ?? null}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { setEditorOpen(false); load(); }}
      />
    </SafeAreaView>
  );
}

// ─── Budget Card ──────────────────────────────────────────────────────────
function BudgetCard({ item, onEdit }: { item: BudgetActual; onEdit: () => void }) {
  const T = useMobileTokens();
  const pct      = item.budget_amount > 0 ? (item.actual_amount / item.budget_amount) * 100 : 0;
  const remaining = item.budget_amount - item.actual_amount;
  const color    = CATEGORY_COLOR[item.category];

  return (
    <Pressable
      style={[
        { ...cardSolid, backgroundColor: T.card, gap: 8 } as any,
        // @ts-ignore web
        web({ cursor: 'pointer' }),
      ]}
      onPress={onEdit}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: color + '15' }}>
          {item.category === 'total'
            ? <Wallet size={16} color={color} strokeWidth={1.8} />
            : <Tag size={16} color={color} strokeWidth={1.8} />
          }
        </View>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: T.ink }}>
          {CATEGORY_LABEL[item.category]}
        </Text>
        <Text style={[
          { fontSize: 14, fontWeight: '800', color: CHIP_TONES.success.fg },
          pct > 100 && { color: CHIP_TONES.danger.fg },
          pct > 80 && pct <= 100 && { color: CHIP_TONES.warning.fg },
        ]}>
          %{pct.toFixed(0)}
        </Text>
      </View>
      <ProgressBar pct={pct} accent={color} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: T.ink3, fontWeight: '600' }}>
          {fmtMoney(Number(item.actual_amount))} / {fmtMoney(Number(item.budget_amount))}
        </Text>
        <Text style={[
          { fontSize: 12, color: CHIP_TONES.success.fg, fontWeight: '700' },
          remaining < 0 && { color: CHIP_TONES.danger.fg },
        ]}>
          {remaining >= 0 ? `Kalan: ${fmtMoney(remaining)}` : `Aşım: ${fmtMoney(-remaining)}`}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────
function ProgressBar({ pct, accent }: { pct: number; accent?: string }) {
  const T = useMobileTokens();
  const clamped = Math.max(0, Math.min(100, pct));
  const color   =
    pct > 100 ? CHIP_TONES.danger.fg :
    pct > 80  ? CHIP_TONES.warning.fg :
                (accent ?? CHIP_TONES.success.fg);
  return (
    <View style={{ height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: T.cardSoft }}>
      <View style={{ height: 8, borderRadius: 4, width: `${clamped}%`, backgroundColor: color }} />
      {pct > 100 && (
        <View style={{ position: 'absolute', end: 0, top: 0, bottom: 0, width: 4, backgroundColor: CHIP_TONES.danger.fg }} />
      )}
    </View>
  );
}

// ─── Budget Editor ────────────────────────────────────────────────────────
function BudgetEditor({
  visible, record, defaultPeriod, labId, onClose, onSaved,
}: {
  visible: boolean;
  record: BudgetActual | null;
  defaultPeriod: BudgetPeriod;
  labId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const panelTheme = usePanelTheme();
  const [category, setCategory] = useState<BudgetCategory>('total');
  const [period, setPeriod]     = useState<BudgetPeriod>('monthly');
  const [amount, setAmount]     = useState('0');
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (record) {
      setCategory(record.category);
      setPeriod(record.period);
      setAmount(String(record.budget_amount));
      setNotes(record.notes ?? '');
    } else {
      setCategory('total');
      setPeriod(defaultPeriod);
      setAmount('0');
      setNotes('');
    }
  }, [record, defaultPeriod, visible]);

  const handleSave = async () => {
    if (!labId) { toast.error('Lab ID bulunamadı'); return; }
    const num = Number(amount.replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) { toast.error('Geçerli tutar girin'); return; }
    setSaving(true);
    const payload = {
      lab_id:       labId,
      category,
      period,
      period_start: currentPeriodStart(period),
      amount:       num,
      notes:        notes.trim() || null,
      updated_at:   new Date().toISOString(),
    };
    let error: any = null;
    if (record) {
      const r = await supabase.from('budgets').update(payload).eq('id', record.id);
      error = r.error;
    } else {
      const r = await supabase.from('budgets').upsert(payload, {
        onConflict: 'lab_id,category,period,period_start',
      });
      error = r.error;
    }
    setSaving(false);
    if (error) { toast.error(error.message ?? 'Kayıt başarısız'); return; }
    toast.success(record ? 'Bütçe güncellendi' : 'Bütçe eklendi');
    onSaved();
  };

  const handleDelete = async () => {
    if (!record) return;
    // Alert.alert web'de no-op → cross-platform confirmAsync
    const ok = await confirmAsync('Bütçeyi Sil', `${autoT(CATEGORY_LABEL[record.category])} ${autoT('bütçesi silinsin mi?')}`, { confirmText: 'Sil', destructive: true });
    if (!ok) return;
    await supabase.from('budgets').delete().eq('id', record.id);
    toast.success('Silindi');
    onSaved();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          width: '100%', maxWidth: 480, maxHeight: '92%',
          backgroundColor: T.card, borderRadius: 24,
          overflow: 'hidden',
          // @ts-ignore web
          boxShadow: '0 24px 48px -12px rgba(0,0,0,0.18)',
        } as any}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: T.hairline }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: T.ink }}>
              {record ? 'Bütçeyi Düzenle' : 'Yeni Bütçe'}
            </Text>
            <Pressable
              onPress={onClose}
              style={[
                { width: 32, height: 32, borderRadius: 8, backgroundColor: T.cardSoft, alignItems: 'center', justifyContent: 'center' },
                // @ts-ignore web
                web({ cursor: 'pointer' }),
              ]}
            >
              <X size={18} color={T.ink3} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                Kategori
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(['total','kira','personel','malzeme','ekipman','vergi','diger'] as BudgetCategory[]).map(cat => {
                  const active = category === cat;
                  const color = CATEGORY_COLOR[cat];
                  return (
                    <Pressable key={cat}
                      style={{
                        paddingHorizontal: 12, paddingVertical: 7,
                        borderRadius: 9999,
                        borderWidth: 1,
                        borderColor: active ? color : T.hairline,
                        backgroundColor: active ? color + '12' : T.card,
                        // @ts-ignore web
                        cursor: 'pointer',
                      }}
                      onPress={() => setCategory(cat)}
                    >
                      <Text style={{
                        fontSize: 12,
                        fontWeight: active ? '600' : '500',
                        color: active ? color : T.ink3,
                      }}>
                        {CATEGORY_LABEL[cat]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                Periyot
              </Text>
              <SlideTabBar
                size="sm"
                items={[{ key: 'monthly', label: 'Aylık' }, { key: 'yearly', label: 'Yıllık' }]}
                activeKey={period}
                onChange={(k) => setPeriod(k as BudgetPeriod)}
                accentColor={panelTheme.accent}
                style={{ marginStart: -3 }}
              />
            </View>

            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                {`Tutar (${baseSymbol()})`}
              </Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: T.hairline, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: T.ink, backgroundColor: T.card }}
                value={amount} onChangeText={setAmount}
                keyboardType="decimal-pad" placeholder="0"
              />
            </View>

            <View>
              <Text style={{ fontSize: 10, fontWeight: '600', color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                Notlar
              </Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: T.hairline, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: T.ink, backgroundColor: T.card, minHeight: 64 }}
                multiline value={notes} onChangeText={setNotes}
              />
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderTopWidth: 1, borderTopColor: T.hairline }}>
            {record ? (
              <Pressable
                style={[
                  {
                    flexDirection: 'row', alignItems: 'center', gap: 5,
                    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(217,75,75,0.30)' : '#FECACA',
                    backgroundColor: isDark ? 'rgba(217,75,75,0.14)' : '#FEF2F2',
                    flex: 1,
                  },
                  // @ts-ignore web
                  web({ cursor: 'pointer' }),
                ]}
                onPress={handleDelete}
              >
                <Trash2 size={14} color={isDark ? '#FCA5A5' : CHIP_TONES.danger.fg} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FCA5A5' : CHIP_TONES.danger.fg }}>Sil</Text>
              </Pressable>
            ) : <View style={{ flex: 1 }} />}
            <Pressable
              style={[
                { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: T.hairline },
                // @ts-ignore web
                web({ cursor: 'pointer' }),
              ]}
              onPress={onClose}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink3 }}>İptal</Text>
            </Pressable>
            <Pressable
              style={[
                { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 14, backgroundColor: T.ink },
                saving && { opacity: 0.6 },
                // @ts-ignore web
                web({ cursor: 'pointer' }),
              ]}
              onPress={handleSave} disabled={saving}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
