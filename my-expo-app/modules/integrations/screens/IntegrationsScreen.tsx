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
  Zap, Check, Trash2, X, Truck, MessageCircle,
} from 'lucide-react-native';

import { HubContext } from '../../../core/ui/HubContext';
import { toast } from '../../../core/ui/Toast';
import { ConfirmDialog, type ConfirmState } from '../../../core/ui/ConfirmDialog';
import { DS } from '../../../core/theme/dsTokens';
import {
  fetchCredentials, upsertCredential, deleteCredential, activateCredential, testCredential,
  sendWhatsAppTest, subscribeWhatsAppWebhook,
  EFATURA_PROVIDERS, PAYMENT_PROVIDERS, COURIER_PROVIDERS, MESSAGING_PROVIDERS,
  type IntegrationType, type ProviderCredential, type ProviderDefinition,
} from '../api';
import { AddressAutocompleteField } from '../components/AddressAutocompleteField';

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

interface Props {
  accentColor?: string;
}

export function IntegrationsScreen({ accentColor = '#4771AB' }: Props) {
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

  const efatura   = items.filter(i => i.type === 'efatura');
  const payment   = items.filter(i => i.type === 'payment');
  const courier   = items.filter(i => i.type === 'courier');
  const messaging = items.filter(i => i.type === 'messaging');

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
    const result = await testCredential(r.id, r.type, r.provider, r.credentials, r.environment);
    if (result.ok) toast.success(result.message);
    else {
      const netErr = /failed to fetch|network|load failed|send a request/i.test(result.message ?? '');
      toast.error(netErr ? 'Bağlantı kurulamadı — sağlayıcıya/servise ulaşılamadı' : result.message);
    }
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

        {/* Kurye — her lab kendi BanaBiKurye üyeliğiyle bağlanır (lab-bazlı) */}
        <Section
          title="Kurye · Teslimat"
          IconCmp={Truck}
          accentColor={accentColor}
          credentials={courier}
          providers={COURIER_PROVIDERS}
          onAdd={() => setEditor({ open: true, type: 'courier', record: null })}
          onEdit={(r) => setEditor({ open: true, type: 'courier', record: r })}
          onActivate={handleActivate}
          onDelete={handleDelete}
          onTest={handleTest}
        />

        {/* WhatsApp · Mesajlaşma — kliniklerden fotoğraf/kağıt sipariş almak için (lab-bazlı) */}
        <Section
          title="WhatsApp · Mesajlaşma"
          IconCmp={MessageCircle}
          accentColor={accentColor}
          credentials={messaging}
          providers={MESSAGING_PROVIDERS}
          onAdd={() => setEditor({ open: true, type: 'messaging', record: null })}
          onEdit={(r) => setEditor({ open: true, type: 'messaging', record: r })}
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
  const providers = type === 'efatura' ? EFATURA_PROVIDERS
    : type === 'courier' ? COURIER_PROVIDERS
    : type === 'messaging' ? MESSAGING_PROVIDERS
    : PAYMENT_PROVIDERS;
  const [providerKey, setProviderKey] = useState<string>('demo');
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [credentials, setCredentials] = useState<Record<string, any>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  // WhatsApp test mesajı
  const [waTestTo, setWaTestTo]     = useState('');
  const [waTestText, setWaTestText] = useState('Sipariş alındı ✅');
  const [waTplName, setWaTplName]   = useState('');
  const [waSending, setWaSending]   = useState<null | 'text' | 'template'>(null);
  const [waSubscribing, setWaSubscribing] = useState(false);

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
    const payload = {
      id:           record?.id,
      type,
      provider:     providerKey,
      display_name: def.label,
      environment,
      credentials,
      notes:        notes.trim() || undefined,
    };
    const isNetErr = (m?: string) => !!m && /failed to fetch|network|load failed|send a request/i.test(m);
    setSaving(true);
    let res = await upsertCredential(payload);
    // Geçici ağ kopmasında (ör. hot-reload sırasında uçuştaki istek iptali) 1 kez daha dene
    if (res.error && isNetErr((res.error as any).message)) {
      await new Promise((r) => setTimeout(r, 800));
      res = await upsertCredential(payload);
    }
    setSaving(false);
    if (res.error) {
      const m = (res.error as any).message;
      toast.error(isNetErr(m) ? 'Bağlantı kurulamadı — internet bağlantını kontrol edip tekrar dene' : (m ?? 'Kayıt başarısız'));
      return;
    }
    toast.success(record ? 'Güncellendi' : 'Eklendi');
    onSaved();
  };

  const sendWa = async (kind: 'text' | 'template') => {
    const to = waTestTo.trim();
    if (!to) { toast.error('Alıcı numara gir'); return; }
    if (!credentials?.phone_number_id || !credentials?.access_token) {
      toast.error('Önce Phone Number ID + Access Token gir'); return;
    }
    setWaSending(kind);
    const res = await sendWhatsAppTest(
      credentials, to,
      kind === 'template'
        ? { template: true, templateName: waTplName.trim() || undefined }
        : { text: waTestText },
    );
    setWaSending(null);
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
  };

  const subscribeWa = async () => {
    if (!credentials?.business_account_id || !credentials?.access_token) {
      toast.error('Önce Business Account ID + Access Token gir'); return;
    }
    setWaSubscribing(true);
    const res = await subscribeWhatsAppWebhook(credentials);
    setWaSubscribing(false);
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
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
              {record ? 'Sağlayıcıyı Düzenle' : `Yeni ${type === 'efatura' ? 'e-Fatura' : type === 'courier' ? 'Kurye' : type === 'messaging' ? 'WhatsApp' : 'POS'} Sağlayıcı`}
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
                    Canlı ortam seçildi — gerçek işlem/mesaj gönderilir. Bilgileriniz güvenle saklanır.
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
                ) : f.type === 'address' ? (
                  <AddressAutocompleteField
                    value={credentials[f.key] ?? ''}
                    onChangeText={v => setCredentials(c => ({ ...c, [f.key]: v }))}
                    onSelect={(addr, lat, lng) => setCredentials(c => ({
                      ...c,
                      [f.key]: addr,
                      ...(f.latKey && lat != null ? { [f.latKey]: lat } : {}),
                      ...(f.lngKey && lng != null ? { [f.lngKey]: lng } : {}),
                    }))}
                    placeholder={f.placeholder}
                    inputStyle={INP}
                    accentColor={accentColor}
                  />
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

            {/* WhatsApp webhook otomatik bağla */}
            {type === 'messaging' && providerKey === 'whatsapp-cloud' && (
              <View style={{
                padding: 12, borderRadius: 12, gap: 8,
                backgroundColor: 'rgba(5,150,105,0.06)',
                borderWidth: 1, borderColor: 'rgba(5,150,105,0.18)',
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: '#047857' }}>
                  Gelen mesaj bağlantısı
                </Text>
                <Text style={{ fontSize: 11, color: DS.ink[500], lineHeight: 15 }}>
                  Kliniklerin gönderdiği fotoğrafların sisteme düşmesi için WhatsApp numarasını
                  otomatik webhook'a bağlar (Meta panelinde ayar gerekmez).
                </Text>
                <Pressable
                  disabled={waSubscribing}
                  onPress={subscribeWa}
                  style={{
                    paddingVertical: 10, borderRadius: 999, alignItems: 'center',
                    backgroundColor: '#059669', opacity: waSubscribing ? 0.5 : 1,
                    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                    {waSubscribing ? 'Bağlanıyor…' : 'Webhook’u otomatik bağla'}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* WhatsApp test mesajı gönder */}
            {type === 'messaging' && providerKey === 'whatsapp-cloud' && (
              <View style={{
                padding: 12, borderRadius: 12, gap: 8,
                backgroundColor: 'rgba(37,99,235,0.05)',
                borderWidth: 1, borderColor: 'rgba(37,99,235,0.14)',
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: '#1D4ED8' }}>
                  Test mesajı gönder
                </Text>
                <TextInput
                  style={INP}
                  value={waTestTo}
                  onChangeText={setWaTestTo}
                  placeholder="Alıcı numara (ör. +905342649620)"
                  placeholderTextColor={DS.ink[400]}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  style={INP}
                  value={waTestText}
                  onChangeText={setWaTestText}
                  placeholder="Mesaj metni (serbest metin için)"
                  placeholderTextColor={DS.ink[400]}
                />
                <TextInput
                  style={INP}
                  value={waTplName}
                  onChangeText={setWaTplName}
                  placeholder="Şablon adı (boş = hello_world)"
                  placeholderTextColor={DS.ink[400]}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    disabled={!!waSending}
                    onPress={() => sendWa('text')}
                    style={{
                      flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: 'center',
                      backgroundColor: accentColor, opacity: waSending ? 0.5 : 1,
                      ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                      {waSending === 'text' ? 'Gönderiliyor…' : 'Metin gönder'}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={!!waSending}
                    onPress={() => sendWa('template')}
                    style={{
                      flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: 'center',
                      borderWidth: 1.5, borderColor: accentColor, opacity: waSending ? 0.5 : 1,
                      ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }}>
                      {waSending === 'template' ? 'Gönderiliyor…' : 'Şablon gönder'}
                    </Text>
                  </Pressable>
                </View>
                <Text style={{ fontSize: 10, color: DS.ink[400], lineHeight: 14 }}>
                  İlk temas serbest metinle olmaz (Meta 24s kuralı). Kendi numaranızdan göndermek için
                  Meta'da onaylı bir şablon oluşturup adını yukarı yazın. "hello_world" yalnız Meta'nın
                  hazır test numaralarında çalışır.
                </Text>
              </View>
            )}

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
