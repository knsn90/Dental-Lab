/**
 * IntegrationsScreen — Ayarlar > Entegrasyonlar (Patterns Design Language)
 *
 *  • Şeffaf arka plan — hub'ın krem zemini kullanılır
 *  • Panel-aware accentColor (admin coral default)
 *  • Lucide ikonlar (ReceiptText, CreditCard, ShieldAlert, …)
 *  • İki bölüm: e-Fatura · POS / Online Ödeme
 *  • Patterns §13 form modal — Display başlık + outlined X + dark+accent footer
 */
import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal,
  TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ReceiptText, CreditCard, ShieldAlert, Plus,
  Zap, Check, Trash2, X,
} from 'lucide-react-native';

import { HubContext } from '../../../core/ui/HubContext';
import { toast } from '../../../core/ui/Toast';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { DS } from '../../../core/theme/dsTokens';
import {
  fetchCredentials, upsertCredential, deleteCredential, activateCredential, testCredential,
  EFATURA_PROVIDERS, PAYMENT_PROVIDERS,
  type IntegrationType, type ProviderCredential, type ProviderDefinition,
} from '../api';

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

interface Props {
  accentColor?: string;
}

export function IntegrationsScreen({ accentColor = '#EA7A4C' }: Props) {
  const isEmbedded = useContext(HubContext);
  const safeEdges  = isEmbedded ? ([] as any) : (['top'] as any);

  const [items, setItems]     = useState<ProviderCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [editor, setEditor]   = useState<{ open: boolean; type: IntegrationType; record: ProviderCredential | null }>(
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

  const handleDelete = (r: ProviderCredential) => {
    setConfirm({
      title: 'Sağlayıcıyı sil',
      highlight: r.provider,
      message: 'kaydı kalıcı olarak silinecek. Bu işlem geri alınamaz.',
      label: 'Evet, sil',
      variant: 'danger',
      onConfirm: async () => {
        setConfirm(null);
        const { error } = await deleteCredential(r.id);
        if (error) toast.error('Silinemedi');
        else { toast.success('Silindi'); load(); }
      },
    });
  };

  const handleTest = async (r: ProviderCredential) => {
    const result = await testCredential(r.id, r.type, r.provider, r.credentials);
    if (result.ok) toast.success(result.message);
    else            toast.error(result.message);
    load();
  };

  const handleActivate = async (r: ProviderCredential) => {
    await activateCredential(r.id);
    toast.success('Aktif yapıldı');
    load();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }} edges={safeEdges}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }}>

        {/* Güvenlik notu */}
        <View style={{
          flexDirection: 'row', alignItems: 'flex-start', gap: 12,
          padding: 14, borderRadius: 14,
          backgroundColor: 'rgba(217,119,6,0.08)',
          borderWidth: 1, borderColor: 'rgba(217,119,6,0.18)',
        }}>
          <View style={{
            width: 32, height: 32, borderRadius: 10,
            backgroundColor: 'rgba(217,119,6,0.15)',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ShieldAlert size={16} color="#D97706" strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 2 }}>
              Production API Anahtarları
            </Text>
            <Text style={{ fontSize: 12, color: '#78350F', lineHeight: 18 }}>
              Sandbox key'leri buraya girilebilir. Production key'leri için Edge Function üzerinden
              Supabase Secrets kullanılmalı.
            </Text>
          </View>
        </View>

        {/* e-Fatura */}
        <Section
          title="e-Fatura · e-Arşiv"
          IconCmp={ReceiptText}
          accentColor={accentColor}
          credentials={efatura}
          providers={EFATURA_PROVIDERS}
          onAdd={() => setEditor({ open: true, type: 'efatura', record: null })}
          onEdit={(r) => setEditor({ open: true, type: 'efatura', record: r })}
          onActivate={handleActivate}
          onDelete={handleDelete}
          onTest={handleTest}
        />

        {/* POS */}
        <Section
          title="POS · Online Ödeme"
          IconCmp={CreditCard}
          accentColor={accentColor}
          credentials={payment}
          providers={PAYMENT_PROVIDERS}
          onAdd={() => setEditor({ open: true, type: 'payment', record: null })}
          onEdit={(r) => setEditor({ open: true, type: 'payment', record: r })}
          onActivate={handleActivate}
          onDelete={handleDelete}
          onTest={handleTest}
        />

        {loading && <ActivityIndicator color={accentColor} style={{ marginTop: 12 }} />}
      </ScrollView>

      <CredentialEditor
        visible={editor.open}
        type={editor.type}
        record={editor.record}
        accentColor={accentColor}
        onClose={() => setEditor(e => ({ ...e, open: false }))}
        onSaved={() => { setEditor(e => ({ ...e, open: false })); load(); }}
      />

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </SafeAreaView>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────
function Section({
  title, IconCmp, accentColor, credentials, providers, onAdd, onEdit, onActivate, onDelete, onTest,
}: {
  title: string;
  IconCmp: any;
  accentColor: string;
  credentials: ProviderCredential[];
  providers: ProviderDefinition[];
  onAdd: () => void;
  onEdit: (r: ProviderCredential) => void;
  onActivate: (r: ProviderCredential) => void;
  onDelete: (r: ProviderCredential) => void;
  onTest: (r: ProviderCredential) => void;
}) {
  return (
    <View style={{
      backgroundColor: '#FFFFFF',
      borderRadius: 18,
      padding: 16,
      borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
      gap: 10,
      ...Platform.select({
        web:     { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } as any,
        default: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
      }),
    }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <View style={{
          width: 36, height: 36, borderRadius: 12,
          backgroundColor: accentColor + '14',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <IconCmp size={17} color={accentColor} strokeWidth={1.8} />
        </View>
        <Text style={{ ...DISPLAY, fontSize: 18, color: DS.ink[900], flex: 1, letterSpacing: -0.3 }}>
          {title}
        </Text>
        <Pressable
          onPress={onAdd}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
            backgroundColor: accentColor,
            ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
          }}
        >
          <Plus size={14} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>Ekle</Text>
        </Pressable>
      </View>

      {credentials.length === 0 ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: DS.ink[400], fontStyle: 'italic' }}>
            Henüz sağlayıcı tanımlanmadı.
          </Text>
        </View>
      ) : credentials.map(r => {
        const def = providers.find(p => p.key === r.provider);
        const isProd = r.environment === 'production';
        return (
          <Pressable
            key={r.id}
            onPress={() => onEdit(r)}
            style={({ hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12,
              backgroundColor: hovered ? '#FAFAFA' : '#FFFFFF',
              borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
              ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
            })}
          >
            {/* Env indicator bar */}
            <View style={{
              width: 4, height: 32, borderRadius: 2,
              backgroundColor: isProd ? '#DC2626' : '#10B981',
            }} />

            {/* Info */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>
                  {def?.label ?? r.provider}
                </Text>
                {r.is_active && (
                  <View style={{
                    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999,
                    backgroundColor: 'rgba(16,185,129,0.12)',
                  }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#059669', letterSpacing: 0.4 }}>AKTİF</Text>
                  </View>
                )}
                {isProd && (
                  <View style={{
                    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999,
                    backgroundColor: 'rgba(220,38,38,0.12)',
                  }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#DC2626', letterSpacing: 0.4 }}>PROD</Text>
                  </View>
                )}
              </View>
              {r.last_test_at && (
                <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 3 }} numberOfLines={1}>
                  Son test: {new Date(r.last_test_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {r.last_test_ok ? ' · ✓ Başarılı' : ' · ✗ Başarısız'}
                </Text>
              )}
              {r.last_test_message && !r.last_test_ok && (
                <Text style={{ fontSize: 11, color: '#DC2626', marginTop: 2 }} numberOfLines={2}>
                  {r.last_test_message}
                </Text>
              )}
            </View>

            {/* Action icons */}
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <ActionIcon Icon={Zap} color="#0EA5E9" onPress={() => onTest(r)} />
              {!r.is_active && (
                <ActionIcon Icon={Check} color="#10B981" onPress={() => onActivate(r)} />
              )}
              <ActionIcon Icon={Trash2} color="#DC2626" onPress={() => onDelete(r)} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function ActionIcon({ Icon, color, onPress }: { Icon: any; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={(e) => { e.stopPropagation?.(); onPress(); }}
      style={({ hovered }: any) => ({
        width: 30, height: 30, borderRadius: 8,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: hovered ? color + '14' : '#FAFAFA',
        ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
      })}
    >
      <Icon size={14} color={color} strokeWidth={1.8} />
    </Pressable>
  );
}

// ─── Editor (Patterns §13) ─────────────────────────────────────────────────
function CredentialEditor({
  visible, type, record, accentColor, onClose, onSaved,
}: {
  visible: boolean;
  type: IntegrationType;
  record: ProviderCredential | null;
  accentColor: string;
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

  const FL: any = { fontSize: 10, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[700], marginBottom: 6 };
  const INP: any = {
    height: 44, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 14, fontSize: 14, color: DS.ink[900], backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <View style={{
          width: '100%', maxWidth: 540, maxHeight: '92%',
          backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden',
          borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          ...Platform.select({
            web:     { boxShadow: '0 24px 80px rgba(0,0,0,0.18)' } as any,
            default: { shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.16, shadowRadius: 48, elevation: 12 },
          }),
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
            paddingHorizontal: 28, paddingTop: 28, paddingBottom: 18,
            borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
          }}>
            <Text style={{ ...DISPLAY, flex: 1, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, color: DS.ink[900] }}>
              {record ? 'Sağlayıcıyı Düzenle' : `Yeni ${type === 'efatura' ? 'e-Fatura' : 'POS'} Sağlayıcı`}
            </Text>
            <Pressable
              onPress={onClose}
              style={{
                width: 32, height: 32, borderRadius: 8,
                borderWidth: 1.5, borderColor: accentColor,
                alignItems: 'center', justifyContent: 'center',
                marginLeft: 12, marginTop: 2,
                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
              }}
            >
              <X size={14} color={accentColor} strokeWidth={2.2} />
            </Pressable>
          </View>

          {/* Body */}
          <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingVertical: 20, gap: 16 }} showsVerticalScrollIndicator={false}>

            {/* Provider seç */}
            <View>
              <Text style={FL}>Sağlayıcı</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {providers.map(p => {
                  const sel = providerKey === p.key;
                  return (
                    <Pressable
                      key={p.key}
                      onPress={() => { setProviderKey(p.key); setCredentials({}); }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                        borderWidth: 1.5,
                        borderColor: sel ? accentColor : 'rgba(0,0,0,0.08)',
                        backgroundColor: sel ? accentColor + '10' : '#FFFFFF',
                        opacity: !p.implemented && p.key !== 'demo' ? 0.5 : 1,
                        ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: sel ? '700' : '500', color: sel ? accentColor : DS.ink[700] }}>
                        {p.label}
                      </Text>
                      {!p.implemented && (
                        <Text style={{ fontSize: 9, fontWeight: '700', color: DS.ink[400], backgroundColor: '#F1F5F9', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                          yakında
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
              {def?.description && (
                <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 8, lineHeight: 17 }}>{def.description}</Text>
              )}
              {def?.pricing && (
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[800], marginTop: 4 }}>💰 {def.pricing}</Text>
              )}
            </View>

            {/* Ortam */}
            <View>
              <Text style={FL}>Ortam</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['sandbox', 'production'] as const).map(env => {
                  const sel = environment === env;
                  const isProd = env === 'production';
                  return (
                    <Pressable
                      key={env}
                      onPress={() => setEnvironment(env)}
                      style={{
                        flex: 1,
                        paddingVertical: 9, borderRadius: 12, alignItems: 'center',
                        borderWidth: 1.5,
                        borderColor: sel ? (isProd ? '#DC2626' : accentColor) : 'rgba(0,0,0,0.08)',
                        backgroundColor: sel
                          ? (isProd ? '#DC2626' : accentColor + '10')
                          : '#FAFAFA',
                        ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                      }}
                    >
                      <Text style={{
                        fontSize: 13, fontWeight: sel ? '700' : '500',
                        color: sel ? (isProd ? '#FFFFFF' : accentColor) : DS.ink[700],
                      }}>
                        {env === 'sandbox' ? 'Sandbox · Test' : 'Production · Canlı'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {environment === 'production' && (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  marginTop: 8, padding: 10, borderRadius: 10,
                  backgroundColor: 'rgba(220,38,38,0.08)',
                }}>
                  <ShieldAlert size={13} color="#DC2626" strokeWidth={1.8} />
                  <Text style={{ flex: 1, fontSize: 11, color: '#991B1B', lineHeight: 16 }}>
                    Production key'leri client tarafına asla bırakma. Edge Function yapılandır.
                  </Text>
                </View>
              )}
            </View>

            {/* Dinamik provider alanları */}
            {def?.fields.map(f => (
              <View key={f.key}>
                <Text style={FL}>{f.label}{f.required ? ' *' : ''}</Text>
                {f.type === 'select' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {f.options?.map(opt => {
                      const sel = credentials[f.key] === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() => setCredentials(c => ({ ...c, [f.key]: opt.value }))}
                          style={{
                            paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                            borderWidth: 1.5,
                            borderColor: sel ? accentColor : 'rgba(0,0,0,0.08)',
                            backgroundColor: sel ? accentColor + '10' : '#FFFFFF',
                            ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: sel ? '700' : '500', color: sel ? accentColor : DS.ink[700] }}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <TextInput
                    style={INP}
                    value={credentials[f.key] ?? ''}
                    onChangeText={v => setCredentials(c => ({ ...c, [f.key]: v }))}
                    placeholder={f.placeholder}
                    placeholderTextColor={DS.ink[400]}
                    secureTextEntry={f.type === 'password'}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                )}
                {f.helpText && (
                  <Text style={{ fontSize: 11, color: DS.ink[400], marginTop: 4, lineHeight: 15 }}>
                    {f.helpText}
                  </Text>
                )}
              </View>
            ))}

            {/* Notlar */}
            <View>
              <Text style={FL}>Notlar</Text>
              <TextInput
                style={[INP, { minHeight: 64, paddingTop: 12, textAlignVertical: 'top' as any }]}
                multiline value={notes} onChangeText={setNotes}
                placeholder="İsteğe bağlı"
                placeholderTextColor={DS.ink[400]}
              />
            </View>
          </ScrollView>

          {/* Footer — Patterns §13 */}
          <View style={{
            flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
            paddingHorizontal: 28, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
          }}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999,
                borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.12)',
                opacity: saving ? 0.5 : 1,
                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
              }}
            >
              <X size={12} color={DS.ink[500]} strokeWidth={2.5} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[500] }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999,
                backgroundColor: DS.ink[900],
                opacity: saving ? 0.5 : 1,
                ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
              }}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: accentColor }} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                    {record ? 'Güncelle' : 'Kaydet'}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
