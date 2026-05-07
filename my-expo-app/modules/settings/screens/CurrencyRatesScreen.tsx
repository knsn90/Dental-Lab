/**
 * Kur Yönetim Ekranı (Phase 1).
 *
 * Özellikler:
 *   • Mevcut günün kurlarını göster (EUR/USD/GBP → base)
 *   • Manuel kur giriş + güncelleme (modal)
 *   • TCMB'den çek butonu (edge function)
 *   • Geçmiş kur tablosu (son 30 kayıt)
 *   • Base currency seçimi (lab_settings.default_currency)
 *
 * Patterns design language uyumlu.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, Platform, ScrollView, Modal, TextInput, ActivityIndicator } from 'react-native';
import {
  Plus, X, Check, RefreshCw, Globe, AlertCircle,
  Calendar, ArrowRight, ChevronDown, History,
} from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import {
  Currency, SUPPORTED_CURRENCIES, CURRENCY_META,
  ExchangeRate, listRates, upsertRate, fetchRatesFromTCMB,
} from '../../../core/money/currency';

interface Props {
  accentColor?: string;
}

export function CurrencyRatesScreen({ accentColor = '#0A0A0A' }: Props) {
  const profile = useAuthStore(s => s.profile);
  const labId = (profile as any)?.lab_id ?? null;

  const [baseCurrency, setBaseCurrency] = useState<Currency>('TRY');
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tcmbLoading, setTcmbLoading] = useState(false);
  const [editModal, setEditModal] = useState<{ visible: boolean; currency: Currency | null }>({ visible: false, currency: null });
  const [basePickerOpen, setBasePickerOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // ── Patterns design tokens ──
  const PCard = {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } : {}),
  } as any;
  const DisplayFont = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';
  const eyebrow = { fontSize: 11, fontWeight: '600' as const, color: '#9A9A9A', letterSpacing: 1, textTransform: 'uppercase' as const };

  // ── Load ──
  const load = useCallback(async () => {
    setLoading(true);
    if (labId) {
      const { data } = await supabase
        .from('lab_settings')
        .select('default_currency')
        .eq('lab_id', labId)
        .single();
      const c = (data as any)?.default_currency as Currency | undefined;
      if (c && SUPPORTED_CURRENCIES.includes(c)) setBaseCurrency(c);
    }
    const list = await listRates(labId, baseCurrency, 100);
    setRates(list);
    setLoading(false);
  }, [labId, baseCurrency]);

  useEffect(() => { load(); }, [load]);

  // ── Latest rate per currency ──
  const latestByCurrency = SUPPORTED_CURRENCIES
    .filter(c => c !== baseCurrency)
    .map(c => {
      const found = rates.find(r => r.currency === c);
      return { currency: c, rate: found ?? null };
    });

  // ── Handlers ──
  const handleBaseChange = async (c: Currency) => {
    if (!labId) return;
    setBasePickerOpen(false);
    const { error } = await supabase
      .from('lab_settings')
      .update({ default_currency: c })
      .eq('lab_id', labId);
    if (error) setToast({ msg: 'Base currency güncellenemedi', type: 'err' });
    else {
      setToast({ msg: `Base currency: ${c}`, type: 'ok' });
      setBaseCurrency(c);
    }
    setTimeout(() => setToast(null), 2500);
  };

  const handleTCMB = async () => {
    setTcmbLoading(true);
    const result = await fetchRatesFromTCMB();
    setTcmbLoading(false);
    if (!result.ok) {
      setToast({ msg: result.error ?? 'TCMB hatası', type: 'err' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (!result.rates) return;
    // Save each rate
    const today = new Date().toISOString().slice(0, 10);
    for (const r of result.rates) {
      if (r.currency === baseCurrency) continue;
      await upsertRate({
        labId, currency: r.currency, baseCurrency,
        rate: r.rate, effectiveDate: today, source: 'tcmb',
      });
    }
    setToast({ msg: `${result.rates.length} kur güncellendi`, type: 'ok' });
    setTimeout(() => setToast(null), 2500);
    load();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 14 }}>
      {/* ── Hero: base currency + actions ── */}
      <View style={[PCard, { gap: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={eyebrow}>Para birimi yönetimi</Text>
            <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 28, letterSpacing: -0.8, color: '#0A0A0A', marginTop: 4 }}>
              Döviz kurları
            </Text>
            <Text style={{ fontSize: 13, color: '#9A9A9A', marginTop: 4, lineHeight: 19 }}>
              Sarf alımları, giderler ve satış fiyatları için günlük kur yönetimi.
              Movement girişinde günün kuru dondurulur — geçmiş kayıtlar etkilenmez.
            </Text>
          </View>
          <Pressable
            onPress={handleTCMB}
            disabled={tcmbLoading}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 7,
              paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999,
              backgroundColor: accentColor,
              opacity: tcmbLoading ? 0.5 : 1,
              ...(Platform.OS === 'web' ? { cursor: tcmbLoading ? 'wait' : 'pointer' } as any : {}),
            }}
          >
            {tcmbLoading
              ? <ActivityIndicator size="small" color="#FFF" />
              : <RefreshCw size={13} color="#FFF" strokeWidth={2} />
            }
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFF' }}>
              TCMB'den çek
            </Text>
          </Pressable>
        </View>

        {/* Base currency picker */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: 14, paddingVertical: 12,
          backgroundColor: '#FBF9F4', borderRadius: 12,
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
        }}>
          <Globe size={16} color="#6B6B6B" strokeWidth={1.6} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: '#6B6B6B', fontWeight: '500' }}>Base currency (raporlama para birimi)</Text>
            <Text style={{ fontSize: 11, color: '#9A9A9A', marginTop: 1 }}>Tüm raporlar ve toplamlar bu birime çevrilir</Text>
          </View>
          <Pressable
            onPress={() => setBasePickerOpen(true)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
              backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.05)' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B6B6B' }}>{CURRENCY_META[baseCurrency].symbol}</Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#0A0A0A', letterSpacing: 0.4 }}>{baseCurrency}</Text>
            <ChevronDown size={12} color="#6B6B6B" strokeWidth={1.8} />
          </Pressable>
        </View>
      </View>

      {/* ── Bugünkü kurlar grid ── */}
      <View style={{ gap: 8 }}>
        <Text style={[eyebrow, { paddingHorizontal: 4 }]}>Aktif kurlar</Text>
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          {latestByCurrency.map(({ currency, rate }) => {
            const m = CURRENCY_META[currency];
            const isStale = !rate;
            return (
              <Pressable
                key={currency}
                onPress={() => setEditModal({ visible: true, currency })}
                style={[PCard, {
                  flex: 1, minWidth: 200, gap: 6,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '14', borderWidth: 1, borderColor: accentColor + '22' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: accentColor, letterSpacing: 0.4 }}>{m.symbol}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#0A0A0A', letterSpacing: 0.4 }}>{currency}</Text>
                      <Text style={{ fontSize: 11, color: '#9A9A9A' }}>{m.label}</Text>
                    </View>
                  </View>
                  {isStale && <AlertCircle size={14} color="#D97706" strokeWidth={1.8} />}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
                  <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 32, letterSpacing: -1, color: isStale ? '#9A9A9A' : '#0A0A0A', lineHeight: 38 }}>
                    {rate ? rate.rate.toFixed(2) : '—'}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#9A9A9A', fontWeight: '500' }}>{baseCurrency}</Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <Text style={{ fontSize: 11, color: '#6B6B6B' }}>1 {currency}</Text>
                  <ArrowRight size={10} color="#9A9A9A" strokeWidth={1.6} />
                  <Text style={{ fontSize: 11, color: '#6B6B6B' }}>
                    {rate ? `${rate.rate.toFixed(2)} ${baseCurrency}` : '—'}
                  </Text>
                </View>

                {rate && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                    <Calendar size={10} color="#9A9A9A" strokeWidth={1.6} />
                    <Text style={{ fontSize: 10, color: '#9A9A9A' }}>
                      {new Date(rate.effectiveDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </Text>
                    <View style={{ width: 1, height: 10, backgroundColor: 'rgba(0,0,0,0.1)' }} />
                    <Text style={{ fontSize: 10, color: '#9A9A9A', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {rate.source}
                    </Text>
                  </View>
                )}
                {isStale && (
                  <Text style={{ fontSize: 11, color: '#D97706', marginTop: 4 }}>
                    Henüz tanımlı değil — düzenlemek için tıkla
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Manuel kur ekle ── */}
      <Pressable
        onPress={() => setEditModal({ visible: true, currency: null })}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
          paddingVertical: 12, borderRadius: 14,
          backgroundColor: '#FFFFFF',
          borderWidth: 1, borderStyle: 'dashed', borderColor: accentColor + '55',
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        }}
      >
        <Plus size={14} color={accentColor} strokeWidth={1.8} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: accentColor }}>Manuel kur ekle / güncelle</Text>
      </Pressable>

      {/* ── Geçmiş ── */}
      <View style={[PCard, { padding: 0, overflow: 'hidden' }]}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 18, paddingVertical: 14,
          borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
        }}>
          <History size={14} color="#6B6B6B" strokeWidth={1.6} />
          <Text style={[eyebrow, { color: '#6B6B6B' }]}>Kur geçmişi</Text>
          <View style={{ flex: 1 }} />
          <Text style={{ fontSize: 11, color: '#9A9A9A' }}>{rates.length} kayıt</Text>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator color={accentColor} />
          </View>
        ) : rates.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: 'center', gap: 8 }}>
            <Globe size={28} color="#D9D9D9" strokeWidth={1.4} />
            <Text style={{ fontSize: 13, color: '#9A9A9A' }}>Henüz kur kaydı yok</Text>
          </View>
        ) : (
          rates.slice(0, 30).map((r, idx) => (
            <View
              key={`${r.currency}-${r.effectiveDate}-${idx}`}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingHorizontal: 18, paddingVertical: 11,
                ...(idx < rates.slice(0, 30).length - 1 ? { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.03)' } : {}),
              }}
            >
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B6B6B' }}>{CURRENCY_META[r.currency].symbol}</Text>
              </View>
              <View style={{ width: 50 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#0A0A0A', letterSpacing: 0.3 }}>{r.currency}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: 13, color: '#0A0A0A', fontWeight: '500' }}>
                {r.rate.toFixed(4)} {r.baseCurrency}
              </Text>
              <Text style={{ fontSize: 11, color: '#9A9A9A' }}>
                {new Date(r.effectiveDate).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Text>
              <View style={{
                paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999,
                backgroundColor: r.source === 'tcmb' ? '#1F568914' : r.source === 'manual' ? accentColor + '14' : 'rgba(0,0,0,0.04)',
              }}>
                <Text style={{
                  fontSize: 10, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase',
                  color: r.source === 'tcmb' ? '#1F5689' : r.source === 'manual' ? accentColor : '#6B6B6B',
                }}>
                  {r.source}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* ── Toast ── */}
      {toast && (
        <View style={{
          position: 'absolute', bottom: 24, left: 24, right: 24,
          paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
          backgroundColor: toast.type === 'ok' ? '#10B981' : '#9C2E2E',
          alignItems: 'center',
          ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(0,0,0,0.18)' } as any : {}),
        }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>{toast.msg}</Text>
        </View>
      )}

      {/* ── Edit modal ── */}
      <RateEditModal
        visible={editModal.visible}
        defaultCurrency={editModal.currency}
        baseCurrency={baseCurrency}
        labId={labId}
        accentColor={accentColor}
        onClose={() => setEditModal({ visible: false, currency: null })}
        onSaved={() => { setEditModal({ visible: false, currency: null }); load(); setToast({ msg: 'Kur kaydedildi', type: 'ok' }); setTimeout(() => setToast(null), 2000); }}
      />

      {/* ── Base currency picker modal ── */}
      <Modal visible={basePickerOpen} transparent animationType="fade" onRequestClose={() => setBasePickerOpen(false)}>
        <Pressable
          onPress={() => setBasePickerOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
        >
          <Pressable onPress={() => {}} style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 8, width: 280, ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.16)' } as any : {}) }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#9A9A9A', letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
              Base currency seç
            </Text>
            {SUPPORTED_CURRENCIES.map(c => {
              const m = CURRENCY_META[c];
              const active = c === baseCurrency;
              return (
                <Pressable
                  key={c}
                  onPress={() => handleBaseChange(c)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingHorizontal: 14, paddingVertical: 11, borderRadius: 11,
                    backgroundColor: active ? accentColor + '14' : 'transparent',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? accentColor + '22' : 'rgba(0,0,0,0.04)', borderWidth: 1, borderColor: active ? accentColor + '33' : 'rgba(0,0,0,0.05)' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? accentColor : '#6B6B6B' }}>{m.symbol}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: active ? accentColor : '#0A0A0A' }}>{m.code} · {m.symbol}</Text>
                    <Text style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{m.label}</Text>
                  </View>
                  {active && <Check size={16} color={accentColor} strokeWidth={2} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

// ─── RateEditModal ───────────────────────────────────────────────────────────

function RateEditModal({
  visible, defaultCurrency, baseCurrency, labId, accentColor, onClose, onSaved,
}: {
  visible: boolean;
  defaultCurrency: Currency | null;
  baseCurrency: Currency;
  labId: string | null;
  accentColor: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [currency, setCurrency] = useState<Currency>(defaultCurrency ?? 'EUR');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      setCurrency(defaultCurrency ?? 'EUR');
      setRate('');
      setDate(new Date().toISOString().slice(0, 10));
      setNotes('');
      setError('');
    }
  }, [visible, defaultCurrency]);

  const handleSave = async () => {
    setError('');
    const r = parseFloat(rate.replace(',', '.'));
    if (!r || r <= 0) { setError('Geçerli bir kur değeri girin'); return; }
    if (currency === baseCurrency) { setError('Base ile aynı para birimi seçilemez'); return; }
    setSaving(true);
    const result = await upsertRate({
      labId, currency, baseCurrency, rate: r, effectiveDate: date,
      source: 'manual', notes: notes.trim() || null,
    });
    setSaving(false);
    if (!result.ok) { setError(result.error ?? 'Kayıt hatası'); return; }
    onSaved();
  };

  const m = CURRENCY_META[currency];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          backgroundColor: '#FFFFFF', borderRadius: 20, width: 420, maxWidth: '100%',
          ...(Platform.OS === 'web' ? { boxShadow: '0 16px 48px rgba(0,0,0,0.2)' } as any : {}),
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#9A9A9A', letterSpacing: 1, textTransform: 'uppercase' }}>Manuel kur</Text>
              <Text style={{ fontFamily: Platform.OS === 'web' ? 'Inter Tight, system-ui, sans-serif' : 'InterTight_300Light', fontWeight: '300', fontSize: 22, letterSpacing: -0.4, color: '#0A0A0A', marginTop: 2 }}>
                Kur ekle / güncelle
              </Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
              <X size={14} color="#6B6B6B" strokeWidth={1.8} />
            </Pressable>
          </View>

          {/* Body */}
          <View style={{ padding: 20, gap: 14 }}>
            {/* Currency */}
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#6B6B6B', letterSpacing: 0.6, marginBottom: 6 }}>PARA BİRİMİ</Text>
              <Pressable
                onPress={() => setPickerOpen(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 10,
                  paddingHorizontal: 14, height: 46,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '14' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }}>{m.symbol}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#0A0A0A' }}>{m.code} · {m.symbol}</Text>
                  <Text style={{ fontSize: 11, color: '#9A9A9A' }}>{m.label}</Text>
                </View>
                <ChevronDown size={14} color="#6B6B6B" strokeWidth={1.8} />
              </Pressable>
            </View>

            {/* Rate */}
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#6B6B6B', letterSpacing: 0.6, marginBottom: 6 }}>KUR (1 {currency} = X {baseCurrency})</Text>
              <TextInput
                value={rate}
                onChangeText={setRate}
                placeholder={`Örn: 38.50`}
                placeholderTextColor="#9A9A9A"
                keyboardType="decimal-pad"
                style={{
                  paddingHorizontal: 14, height: 46, fontSize: 15, fontWeight: '500',
                  backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                  color: '#0A0A0A',
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                }}
              />
            </View>

            {/* Date */}
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#6B6B6B', letterSpacing: 0.6, marginBottom: 6 }}>GEÇERLİ TARİH</Text>
              <TextInput
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#9A9A9A"
                style={{
                  paddingHorizontal: 14, height: 46, fontSize: 14,
                  backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                  color: '#0A0A0A',
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                }}
              />
            </View>

            {/* Notes (optional) */}
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: '#6B6B6B', letterSpacing: 0.6, marginBottom: 6 }}>NOT (opsiyonel)</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Örn: Sarf alımı için sabit kur"
                placeholderTextColor="#9A9A9A"
                style={{
                  paddingHorizontal: 14, paddingVertical: 11, fontSize: 13, minHeight: 46,
                  backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                  color: '#0A0A0A',
                  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                }}
                multiline
              />
            </View>

            {error ? (
              <Text style={{ fontSize: 12, color: '#9C2E2E', fontWeight: '500' }}>{error}</Text>
            ) : null}
          </View>

          {/* Footer */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)' }}>
            <Pressable
              onPress={onClose}
              style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.04)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#6B6B6B' }}>Vazgeç</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999, backgroundColor: accentColor, opacity: saving ? 0.5 : 1, ...(Platform.OS === 'web' ? { cursor: saving ? 'wait' : 'pointer' } as any : {}) }}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Check size={13} color="#FFF" strokeWidth={2} />
              }
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Kaydet</Text>
            </Pressable>
          </View>

          {/* Currency picker (nested modal) */}
          <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
            <Pressable
              onPress={() => setPickerOpen(false)}
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
            >
              <Pressable onPress={() => {}} style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 8, width: 280, ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.16)' } as any : {}) }}>
                {SUPPORTED_CURRENCIES.filter(c => c !== baseCurrency).map(c => {
                  const cm = CURRENCY_META[c];
                  const active = c === currency;
                  return (
                    <Pressable
                      key={c}
                      onPress={() => { setCurrency(c); setPickerOpen(false); }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 12,
                        paddingHorizontal: 14, paddingVertical: 11, borderRadius: 11,
                        backgroundColor: active ? accentColor + '14' : 'transparent',
                        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                      }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? accentColor + '22' : 'rgba(0,0,0,0.04)', borderWidth: 1, borderColor: active ? accentColor + '33' : 'rgba(0,0,0,0.05)' }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: active ? accentColor : '#6B6B6B' }}>{cm.symbol}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: active ? accentColor : '#0A0A0A' }}>{cm.code}</Text>
                        <Text style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{cm.label}</Text>
                      </View>
                      {active && <Check size={16} color={accentColor} strokeWidth={2} />}
                    </Pressable>
                  );
                })}
              </Pressable>
            </Pressable>
          </Modal>
        </View>
      </View>
    </Modal>
  );
}
