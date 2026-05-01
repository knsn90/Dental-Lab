/**
 * IntegrationsScreen — Ayarlar > Entegrasyonlar
 *
 *  • İki bölüm: e-Fatura · POS / Online Ödeme
 *  • Her bölümde mevcut credential'lar listelenir + yeni ekle
 *  • Editör: provider seç → form alanları otomatik gelir → kaydet → test et → aktif yap
 *  • Production key uyarısı + Edge Function bilgilendirmesi
 */
import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '../../../core/ui/AppIcon';
import { Shadows, CardSpec } from '../../../core/theme/shadows';
import { HubContext } from '../../../core/ui/HubContext';
import { toast } from '../../../core/ui/Toast';
import {
  fetchCredentials, upsertCredential, deleteCredential, activateCredential, testCredential,
  EFATURA_PROVIDERS, PAYMENT_PROVIDERS, findProviderDef,
  type IntegrationType, type ProviderCredential, type ProviderDefinition,
} from '../api';

export function IntegrationsScreen() {
  const isEmbedded = useContext(HubContext);
  const safeEdges  = isEmbedded ? ([] as any) : (['top'] as any);

  const [items, setItems] = useState<ProviderCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<{ open: boolean; type: IntegrationType; record: ProviderCredential | null }>(
    { open: false, type: 'efatura', record: null }
  );

  const load = async () => {
    setLoading(true);
    const { data } = await fetchCredentials();
    setItems((data ?? []) as ProviderCredential[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const efatura = items.filter(i => i.type === 'efatura');
  const payment = items.filter(i => i.type === 'payment');

  return (
    <SafeAreaView style={s.safe} edges={safeEdges}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}>
        {/* Güvenlik uyarısı */}
        <View style={s.warnBox}>
          <AppIcon name="shield-alert" size={18} color="#D97706" />
          <View style={{ flex: 1 }}>
            <Text style={s.warnTitle}>Production API anahtarları</Text>
            <Text style={s.warnText}>
              Sandbox key'leri buraya girilebilir. Production key'leri için Edge Function üzerinden
              Supabase Secrets kullanılmalı (kılavuz: docs/integrations.md).
            </Text>
          </View>
        </View>

        {/* e-Fatura bölümü */}
        <Section
          title="e-Fatura / e-Arşiv"
          icon="receipt-text"
          accent="#7C3AED"
          credentials={efatura}
          providers={EFATURA_PROVIDERS}
          onAdd={() => setEditor({ open: true, type: 'efatura', record: null })}
          onEdit={(r) => setEditor({ open: true, type: 'efatura', record: r })}
          onActivate={async (r) => { await activateCredential(r.id); toast.success('Aktif yapıldı'); load(); }}
          onDelete={(r) => confirmDelete(r, load)}
          onTest={(r) => runTest(r, load)}
        />

        {/* POS bölümü */}
        <Section
          title="POS / Online Ödeme"
          icon="credit-card"
          accent="#2563EB"
          credentials={payment}
          providers={PAYMENT_PROVIDERS}
          onAdd={() => setEditor({ open: true, type: 'payment', record: null })}
          onEdit={(r) => setEditor({ open: true, type: 'payment', record: r })}
          onActivate={async (r) => { await activateCredential(r.id); toast.success('Aktif yapıldı'); load(); }}
          onDelete={(r) => confirmDelete(r, load)}
          onTest={(r) => runTest(r, load)}
        />

        {loading && <ActivityIndicator color="#2563EB" />}
      </ScrollView>

      <CredentialEditor
        visible={editor.open}
        type={editor.type}
        record={editor.record}
        onClose={() => setEditor(e => ({ ...e, open: false }))}
        onSaved={() => { setEditor(e => ({ ...e, open: false })); load(); }}
      />
    </SafeAreaView>
  );
}

async function confirmDelete(r: ProviderCredential, reload: () => void) {
  Alert.alert('Sağlayıcıyı Sil', `${r.provider} kaydı silinsin mi?`, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'Sil', style: 'destructive', onPress: async () => {
      await deleteCredential(r.id);
      toast.success('Silindi');
      reload();
    }},
  ]);
}

async function runTest(r: ProviderCredential, reload: () => void) {
  const result = await testCredential(r.id, r.type, r.provider, r.credentials);
  if (result.ok) toast.success(result.message);
  else            toast.error(result.message);
  reload();
}

// ─── Section ──────────────────────────────────────────────────────────────
function Section({
  title, icon, accent, credentials, providers, onAdd, onEdit, onActivate, onDelete, onTest,
}: {
  title: string;
  icon: string;
  accent: string;
  credentials: ProviderCredential[];
  providers: ProviderDefinition[];
  onAdd: () => void;
  onEdit: (r: ProviderCredential) => void;
  onActivate: (r: ProviderCredential) => void;
  onDelete: (r: ProviderCredential) => void;
  onTest: (r: ProviderCredential) => void;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <View style={[s.sectionIcon, { backgroundColor: accent + '15' }]}>
          <AppIcon name={icon as any} size={16} color={accent} />
        </View>
        <Text style={s.sectionTitle}>{title}</Text>
        <TouchableOpacity style={[s.addBtn, { backgroundColor: accent }]} onPress={onAdd}>
          <AppIcon name="plus" size={14} color="#FFFFFF" />
          <Text style={s.addBtnText}>Ekle</Text>
        </TouchableOpacity>
      </View>

      {credentials.length === 0 ? (
        <Text style={s.emptyHint}>Henüz sağlayıcı tanımlanmadı.</Text>
      ) : credentials.map(r => {
        const def = providers.find(p => p.key === r.provider);
        return (
          <TouchableOpacity key={r.id} style={s.row} onPress={() => onEdit(r)} activeOpacity={0.85}>
            <View style={[s.envDot, { backgroundColor: r.environment === 'production' ? '#DC2626' : '#10B981' }]} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.rowName}>{def?.label ?? r.provider}</Text>
                {r.is_active && <View style={s.activeBadge}><Text style={s.activeBadgeText}>AKTİF</Text></View>}
                {r.environment === 'production' && (
                  <View style={s.prodBadge}><Text style={s.prodBadgeText}>PROD</Text></View>
                )}
              </View>
              {r.last_test_at && (
                <Text style={s.rowMeta}>
                  Son test: {new Date(r.last_test_at).toLocaleString('tr-TR')} ·
                  {r.last_test_ok ? ' ✓ Başarılı' : ' ✗ Başarısız'}
                </Text>
              )}
              {r.last_test_message && !r.last_test_ok && (
                <Text style={s.errorText}>{r.last_test_message}</Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <TouchableOpacity style={s.iconBtn} onPress={(e) => { e.stopPropagation(); onTest(r); }}>
                <AppIcon name="flash" size={14} color="#0EA5E9" />
              </TouchableOpacity>
              {!r.is_active && (
                <TouchableOpacity style={s.iconBtn} onPress={(e) => { e.stopPropagation(); onActivate(r); }}>
                  <AppIcon name="check" size={14} color="#10B981" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.iconBtn} onPress={(e) => { e.stopPropagation(); onDelete(r); }}>
                <AppIcon name="trash-can-outline" size={14} color="#DC2626" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Editor ───────────────────────────────────────────────────────────────
function CredentialEditor({
  visible, type, record, onClose, onSaved,
}: {
  visible: boolean;
  type: IntegrationType;
  record: ProviderCredential | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const providers = type === 'efatura' ? EFATURA_PROVIDERS : PAYMENT_PROVIDERS;
  const [providerKey, setProviderKey] = useState<string>('demo');
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [credentials, setCredentials] = useState<Record<string, any>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const def = useMemo(() => providers.find(p => p.key === providerKey), [providers, providerKey]);

  useEffect(() => {
    if (record) {
      setProviderKey(record.provider);
      setEnvironment(record.environment);
      setCredentials(record.credentials ?? {});
      setNotes(record.notes ?? '');
    } else {
      setProviderKey('demo');
      setEnvironment('sandbox');
      setCredentials({});
      setNotes('');
    }
  }, [record, visible]);

  const handleSave = async () => {
    if (!def) return;
    // Required field check
    for (const f of def.fields) {
      if (f.required && !credentials[f.key]?.toString().trim()) {
        toast.error(`${f.label} zorunlu`);
        return;
      }
    }
    setSaving(true);
    const { error } = await upsertCredential({
      id:           record?.id,
      type,
      provider:     providerKey,
      display_name: def.label,
      environment,
      credentials,
      notes:        notes.trim() || undefined,
    });
    setSaving(false);
    if (error) { toast.error((error as any).message ?? 'Kayıt başarısız'); return; }
    toast.success(record ? 'Güncellendi' : 'Eklendi');
    onSaved();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={ed.overlay}>
        <View style={ed.sheet}>
          <View style={ed.header}>
            <Text style={ed.title}>{record ? 'Sağlayıcıyı Düzenle' : `Yeni ${type === 'efatura' ? 'e-Fatura' : 'POS'} Sağlayıcı`}</Text>
            <TouchableOpacity onPress={onClose} style={ed.closeBtn}>
              <AppIcon name="close" size={18} color="#475569" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            {/* Provider seçimi */}
            <View>
              <Text style={ed.label}>Sağlayıcı</Text>
              <View style={ed.chipRow}>
                {providers.map(p => (
                  <TouchableOpacity key={p.key}
                    style={[ed.chip, providerKey === p.key && ed.chipActive, !p.implemented && p.key !== 'demo' && { opacity: 0.5 }]}
                    onPress={() => { setProviderKey(p.key); setCredentials({}); }}
                    disabled={!p.implemented && p.key !== 'demo' && false /* allow choose, just show "yakında" */}
                  >
                    <Text style={[ed.chipText, providerKey === p.key && ed.chipTextActive]}>{p.label}</Text>
                    {!p.implemented && <Text style={ed.soonBadge}>yakında</Text>}
                  </TouchableOpacity>
                ))}
              </View>
              {def?.description && <Text style={ed.desc}>{def.description}</Text>}
              {def?.pricing && <Text style={ed.pricing}>💰 {def.pricing}</Text>}
            </View>

            {/* Ortam */}
            <View>
              <Text style={ed.label}>Ortam</Text>
              <View style={ed.chipRow}>
                {(['sandbox', 'production'] as const).map(env => (
                  <TouchableOpacity key={env}
                    style={[ed.chip, environment === env && (env === 'production' ? ed.chipDanger : ed.chipActive)]}
                    onPress={() => setEnvironment(env)}
                  >
                    <Text style={[ed.chipText, environment === env && (env === 'production' ? { color: '#FFFFFF', fontWeight: '700' } : ed.chipTextActive)]}>
                      {env === 'sandbox' ? 'Sandbox (Test)' : 'Production (Canlı)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {environment === 'production' && (
                <Text style={ed.warnText}>
                  ⚠️ Production key'leri client tarafına asla bırakma. Edge Function yapılandır.
                </Text>
              )}
            </View>

            {/* Dinamik provider alanları */}
            {def?.fields.map(f => (
              <View key={f.key}>
                <Text style={ed.label}>{f.label}{f.required ? ' *' : ''}</Text>
                {f.type === 'select' ? (
                  <View style={ed.chipRow}>
                    {f.options?.map(opt => (
                      <TouchableOpacity key={opt.value}
                        style={[ed.chip, credentials[f.key] === opt.value && ed.chipActive]}
                        onPress={() => setCredentials(c => ({ ...c, [f.key]: opt.value }))}
                      >
                        <Text style={[ed.chipText, credentials[f.key] === opt.value && ed.chipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <TextInput
                    style={ed.input}
                    value={credentials[f.key] ?? ''}
                    onChangeText={v => setCredentials(c => ({ ...c, [f.key]: v }))}
                    placeholder={f.placeholder}
                    placeholderTextColor="#94A3B8"
                    secureTextEntry={f.type === 'password'}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                )}
                {f.helpText && <Text style={ed.help}>{f.helpText}</Text>}
              </View>
            ))}

            {/* Notlar */}
            <View>
              <Text style={ed.label}>Notlar</Text>
              <TextInput
                style={[ed.input, { minHeight: 56 }]}
                multiline value={notes} onChangeText={setNotes}
                placeholder="İsteğe bağlı"
                placeholderTextColor="#94A3B8"
              />
            </View>
          </ScrollView>

          <View style={ed.footer}>
            <TouchableOpacity style={ed.cancelBtn} onPress={onClose}>
              <Text style={ed.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ed.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              <Text style={ed.saveText}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CardSpec.pageBg },

  warnBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' },
  warnTitle: { fontSize: 13, fontWeight: '800', color: '#92400E', marginBottom: 2 },
  warnText:  { fontSize: 12, color: '#78350F', lineHeight: 18 },

  section: { backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius, borderWidth: 1, borderColor: CardSpec.border, padding: 14, gap: 10, ...Shadows.card } as any,
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: '#0F172A' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  addBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  emptyHint: { fontSize: 12, color: '#94A3B8', fontStyle: 'italic', paddingVertical: 6 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#FFFFFF' },
  envDot: { width: 6, height: 28, borderRadius: 3 },
  rowName: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  rowMeta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  errorText: { fontSize: 11, color: '#DC2626', marginTop: 2 },
  activeBadge: { backgroundColor: '#10B981', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  activeBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.4 },
  prodBadge: { backgroundColor: '#DC2626', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  prodBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.4 },
  iconBtn: { width: 28, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
});

const ed = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet:   { width: '100%', maxWidth: 540, maxHeight: '92%', backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius, borderWidth: 1, borderColor: CardSpec.border, overflow: 'hidden', ...Shadows.card } as any,
  header:  { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title:   { flex: 1, fontSize: 16, fontWeight: '800', color: '#0F172A' },
  closeBtn:{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },

  label:   { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' },
  chipActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  chipDanger: { borderColor: '#DC2626', backgroundColor: '#DC2626' },
  chipText:{ fontSize: 12, color: '#64748B', fontWeight: '600' },
  chipTextActive: { color: '#2563EB', fontWeight: '700' },
  soonBadge: { fontSize: 9, color: '#94A3B8', backgroundColor: '#F1F5F9', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, fontWeight: '700' },

  desc:    { fontSize: 12, color: '#64748B', marginTop: 6, lineHeight: 18 },
  pricing: { fontSize: 12, fontWeight: '600', color: '#0F172A', marginTop: 4 },
  warnText:{ fontSize: 11, color: '#DC2626', marginTop: 6 },
  help:    { fontSize: 11, color: '#94A3B8', marginTop: 4 },

  input:   { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF' },

  footer:  { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cancelBtn:  { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  saveBtn:    { flex: 1, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563EB', alignItems: 'center' },
  saveText:   { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
