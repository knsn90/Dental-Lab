import React, { useState, useCallback, useEffect, useContext } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, Modal, TextInput, Alert, Platform,
  useWindowDimensions,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DS } from '../../../core/theme/dsTokens';
import { useInkUI } from '../../../core/theme/inkScale';
import { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { DatePicker } from '../../../core/ui/DatePicker';
import { HubContext } from '../../../core/ui/HubContext';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';
import { useEmployees } from '../../employees/hooks/useEmployees';
import {
  Clock, CheckCircle, Upload, X, AlertTriangle, ShieldCheck,
  Search, FolderOpen, ExternalLink, Pencil, Trash2, ArrowLeft, ArrowRight,
  FileText, CreditCard, Award, Activity, Calendar, DollarSign,
  Paperclip, Shield,
} from '../../../core/ui/icons';

import {
  fetchDocuments, fetchExpiringDocuments, addDocument, updateDocument,
  deleteDocument, uploadDocument, getDocumentUrl,
  DOC_TYPE_CFG, DOC_TYPES, formatFileSize, daysUntilExpiry,
  type EmployeeDocument, type DocType,
} from '../api';

// ─── Lucide icon map for doc types ──────────────────────────────────────────
const LUCIDE_DOC_ICON_MAP: Record<string, React.ComponentType<any>> = {
  'credit-card': CreditCard,
  'file-text':   FileText,
  'award':       Award,
  'shield':      Shield,
  'activity':    Activity,
  'calendar':    Calendar,
  'dollar-sign': DollarSign,
  'paperclip':   Paperclip,
};

function DocTypeIcon({ name, size, color }: { name: string; size: number; color: string }) {
  const Comp = LUCIDE_DOC_ICON_MAP[name] ?? FileText;
  return <Comp size={size} color={color} strokeWidth={1.6} />;
}

// ─── Patterns tokens ────────────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};




const WEB_CURSOR = Platform.OS === 'web' ? { cursor: 'pointer' as const } : {};

// ─── ExpiryBadge ─────────────────────────────────────────────────────────────
function ExpiryBadge({ days }: { days: number | null }) {
  const U = useInkUI();
  if (days === null) return null;
  const tone = days <= 7 ? U.chipTones.danger : days <= 30 ? U.chipTones.warning : U.chipTones.success;
  const label = days <= 0 ? autoT('Süresi doldu') : `${days} ${autoT('gün')}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: tone.bg }}>
      <Clock size={10} color={tone.fg} strokeWidth={1.6} />
      <Text style={{ fontSize: 10, fontWeight: '600', color: tone.fg }}>{label}</Text>
    </View>
  );
}

// ─── DocCard ─────────────────────────────────────────────────────────────────
function DocCard({
  doc, onOpen, onEdit, onDelete,
}: {
  doc: EmployeeDocument;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const U = useInkUI();
  const cfg  = DOC_TYPE_CFG[doc.doc_type];
  const days = daysUntilExpiry(doc.valid_until);
  const isExp = days !== null && days <= 0;

  return (
    <View style={[
      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
      !isExp && { borderBottomWidth: 1, borderBottomColor: U.hairline },
      isExp && { backgroundColor: U.chipTones.danger.bg, borderBottomWidth: 1, borderBottomColor: U.hairline },
    ]}>
      <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: U.ink[100] }}>
        <DocTypeIcon name={cfg.icon} size={18} color={U.ink[500]} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: U.ink[900] }} numberOfLines={1}>{doc.title}</Text>
        <Text style={{ fontSize: 12, color: U.ink[500] }}>
          {cfg.label}
          {doc.file_size ? `  ·  ${formatFileSize(doc.file_size)}` : ''}
          {doc.valid_until ? `  ·  ${doc.valid_until.slice(0, 10)}` : ''}
        </Text>
        {days !== null && <ExpiryBadge days={days} />}
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <Pressable style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8, ...WEB_CURSOR } as any} onPress={onOpen}>
          <ExternalLink size={15} color={U.ink[500]} strokeWidth={1.6} />
        </Pressable>
        <Pressable style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8, ...WEB_CURSOR } as any} onPress={onEdit}>
          <Pencil size={15} color={U.ink[500]} strokeWidth={1.6} />
        </Pressable>
        <Pressable style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8, ...WEB_CURSOR } as any} onPress={onDelete}>
          <Trash2 size={15} color={U.chipTones.danger.fg} strokeWidth={1.6} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── DocTypeGrid ─────────────────────────────────────────────────────────────
function DocTypeGrid({ selected, onChange }: { selected: DocType; onChange: (t: DocType) => void }) {
  const U = useInkUI();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {DOC_TYPES.map(t => {
        const cfg = DOC_TYPE_CFG[t];
        const sel = selected === t;
        return (
          <Pressable
            key={t}
            style={[
              { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999, borderWidth: 1.5, borderColor: U.fieldBorder, ...WEB_CURSOR },
              sel && { backgroundColor: U.ink[900], borderColor: U.ink[900] },
            ] as any}
            onPress={() => onChange(t)}
          >
            <DocTypeIcon name={cfg.icon} size={12} color={sel ? '#fff' : U.ink[500]} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: sel ? '#fff' : U.ink[500] }}>{cfg.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Modal shared styles ────────────────────────────────────────────────────
function useModalStyles() {
  const U = useInkUI();
  const T = useMobileTokens();
  return {
    modalSheet: {
      width: '100%' as any, maxWidth: 560, backgroundColor: T.card, borderRadius: 24, overflow: 'hidden' as const,
      // @ts-ignore web
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    },
    modalHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, padding: 20, borderBottomWidth: 1, borderBottomColor: T.hairline2 },
    modalBody: { padding: 20, maxHeight: 500 },
    modalFooter: { flexDirection: 'row' as const, gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: T.hairline2 },
    modalLabel: { fontSize: 10, fontWeight: '700' as const, color: T.ink3, marginBottom: 6, marginTop: 12, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
    modalInput: { borderWidth: 1, borderColor: T.hairline, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: T.ink, backgroundColor: T.cardSoft },
  };
}

// ─── UploadModal ─────────────────────────────────────────────────────────────
function UploadModal({
  visible, onClose, employeeId, labId, userId, onDone,
}: {
  visible: boolean; onClose: () => void; employeeId: string;
  labId: string; userId: string; onDone: () => void;
}) {
  const U = useInkUI();
  const T = useMobileTokens();
  const { modalSheet, modalHeader, modalBody, modalFooter, modalLabel, modalInput } = useModalStyles();
  const [docType, setDocType] = useState<DocType>('diger');
  const [title, setTitle]     = useState('');
  const [validFrom, setFrom]  = useState('');
  const [validUntil, setUntil]= useState('');
  const [notes, setNotes]     = useState('');
  const [file, setFile]       = useState<{ uri: string; name: string; type: string; size?: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  const reset = () => { setDocType('diger'); setTitle(''); setFrom(''); setUntil(''); setNotes(''); setFile(null); };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    setFile({ uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/octet-stream', size: asset.size ?? undefined });
    if (!title) setTitle(asset.name.replace(/\.[^.]+$/, ''));
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) { toast.warning('Dosya ve başlık zorunlu'); return; }
    setUploading(true);
    const uploaded = await uploadDocument(labId, employeeId, file);
    if (!uploaded) { toast.error('Yükleme başarısız'); setUploading(false); return; }
    await addDocument({
      employee_id: employeeId,
      doc_type: docType,
      title: title.trim(),
      file_path: uploaded.path,
      file_name: file.name,
      file_size: file.size ?? null,
      mime_type: file.type,
      valid_from: validFrom || null,
      valid_until: validUntil || null,
      notes: notes || null,
      created_by: userId,
    });
    setUploading(false);
    toast.success('Belge yüklendi');
    reset(); onDone(); onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        <View style={modalSheet}>
          <View style={U.modalHeaderRow}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T.ink }}>Belge Yükle</Text>
            <Pressable onPress={onClose} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline, alignItems: 'center', justifyContent: 'center', ...WEB_CURSOR } as any}>
              <X size={18} color={T.ink3} strokeWidth={1.8} />
            </Pressable>
          </View>
          <ScrollView style={modalBody} showsVerticalScrollIndicator={false}>

            <Pressable
              style={[
                { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, borderWidth: 2, borderColor: U.ink[200], borderStyle: 'dashed' as any, marginBottom: 16, ...WEB_CURSOR },
                file && { borderStyle: 'solid' as any, borderColor: U.chipTones.success.fg, backgroundColor: U.chipTones.success.bg },
              ] as any}
              onPress={pickFile}
            >
              {file
                ? <CheckCircle size={22} color={U.chipTones.success.fg} strokeWidth={1.6} />
                : <Upload size={22} color={U.ink[500]} strokeWidth={1.6} />
              }
              <Text style={[{ fontSize: 13, color: U.ink[500], flex: 1 }, file && { color: U.chipTones.success.fg }]}>
                {file ? file.name : 'Dosya seç (PDF, görsel, Word vb.)'}
              </Text>
              {!!file?.size && <Text style={{ fontSize: 12, color: U.ink[500] }}>{formatFileSize(file.size ?? null)}</Text>}
            </Pressable>

            <Text style={modalLabel}>Belge Türü</Text>
            <DocTypeGrid selected={docType} onChange={setDocType} />

            <Text style={[modalLabel, { marginTop: 16 }]}>Başlık *</Text>
            <TextInput style={modalInput} value={title} onChangeText={setTitle} placeholder="Örn: TC Kimlik Ön Yüz" placeholderTextColor={T.ink3} />

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={modalLabel}>Geçerlilik Başlangıcı</Text>
                <DatePicker value={validFrom} onChange={setFrom} placeholder="Tarih seç" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={modalLabel}>Geçerlilik Bitişi</Text>
                <DatePicker value={validUntil} onChange={setUntil} placeholder="Tarih seç" />
              </View>
            </View>

            <Text style={modalLabel}>Notlar</Text>
            <TextInput
              style={[modalInput, { height: 72, textAlignVertical: 'top' }]}
              value={notes} onChangeText={setNotes}
              placeholder="İsteğe bağlı not" multiline
              placeholderTextColor={T.ink3}
            />
          </ScrollView>

          <View style={modalFooter}>
            <Pressable style={{ flex: 1, padding: 14, borderRadius: 9999, borderWidth: 1, borderColor: T.hairline, backgroundColor: T.card, alignItems: 'center', ...WEB_CURSOR } as any} onPress={onClose}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink2 }}>İptal</Text>
            </Pressable>
            <Pressable
              style={[{ flex: 1, padding: 14, borderRadius: 9999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: U.ink[900], ...WEB_CURSOR }, (!file || !title.trim() || uploading) && { opacity: 0.5 }] as any}
              onPress={handleUpload} disabled={!file || !title.trim() || uploading}
            >
              {uploading
                ? <ActivityIndicator color={U.onDarkPill} size="small" />
                : <><Upload size={15} color={U.onDarkPill} strokeWidth={1.6} /><Text style={{ fontSize: 13, fontWeight: '700', color: U.onDarkPill }}>Yükle</Text></>
              }
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── EditModal ────────────────────────────────────────────────────────────────
function EditModal({
  visible, doc, onClose, onDone,
}: {
  visible: boolean; doc: EmployeeDocument | null; onClose: () => void; onDone: () => void;
}) {
  const U = useInkUI();
  const T = useMobileTokens();
  const { modalSheet, modalHeader, modalBody, modalFooter, modalLabel, modalInput } = useModalStyles();
  const [title, setTitle]     = useState('');
  const [docType, setDocType] = useState<DocType>('diger');
  const [validFrom, setFrom]  = useState('');
  const [validUntil, setUntil]= useState('');
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (doc) { setTitle(doc.title); setDocType(doc.doc_type); setFrom(doc.valid_from ?? ''); setUntil(doc.valid_until ?? ''); setNotes(doc.notes ?? ''); }
  }, [doc]);

  const handleSave = async () => {
    if (!doc || !title.trim()) return;
    setSaving(true);
    await updateDocument(doc.id, { title: title.trim(), doc_type: docType, valid_from: validFrom || null, valid_until: validUntil || null, notes: notes || null });
    setSaving(false);
    toast.success('Belge güncellendi');
    onDone(); onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        <View style={modalSheet}>
          <View style={U.modalHeaderRow}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T.ink }}>Belgeyi Düzenle</Text>
            <Pressable onPress={onClose} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline, alignItems: 'center', justifyContent: 'center', ...WEB_CURSOR } as any}>
              <X size={18} color={T.ink3} strokeWidth={1.8} />
            </Pressable>
          </View>
          <ScrollView style={modalBody}>
            <Text style={modalLabel}>Başlık *</Text>
            <TextInput style={modalInput} value={title} onChangeText={setTitle} placeholderTextColor={T.ink3} />
            <Text style={[modalLabel, { marginTop: 16 }]}>Belge Türü</Text>
            <DocTypeGrid selected={docType} onChange={setDocType} />
            <View style={[{ flexDirection: 'row', gap: 12 }, { marginTop: 4 }]}>
              <View style={{ flex: 1 }}>
                <Text style={modalLabel}>Geçerlilik Başlangıcı</Text>
                <DatePicker value={validFrom} onChange={setFrom} placeholder="Tarih seç" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={modalLabel}>Geçerlilik Bitişi</Text>
                <DatePicker value={validUntil} onChange={setUntil} placeholder="Tarih seç" />
              </View>
            </View>
            <Text style={modalLabel}>Notlar</Text>
            <TextInput style={[modalInput, { height: 72, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={T.ink3} />
          </ScrollView>
          <View style={modalFooter}>
            <Pressable style={{ flex: 1, padding: 14, borderRadius: 9999, borderWidth: 1, borderColor: T.hairline, backgroundColor: T.card, alignItems: 'center', ...WEB_CURSOR } as any} onPress={onClose}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink2 }}>İptal</Text>
            </Pressable>
            <Pressable
              style={[{ flex: 1, padding: 14, borderRadius: 9999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: U.ink[900], ...WEB_CURSOR }, saving && { opacity: 0.5 }] as any}
              onPress={handleSave} disabled={saving}
            >
              {saving ? <ActivityIndicator color={U.onDarkPill} size="small" /> : <Text style={{ fontSize: 13, fontWeight: '700', color: U.onDarkPill }}>Kaydet</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── ExpiryPanel ─────────────────────────────────────────────────────────────
function ExpiryPanel() {
  const U = useInkUI();
  const [docs, setDocs]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await fetchExpiringDocuments();
      setDocs(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return null;
  if (docs.length === 0) return (
    <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: U.chipTones.success.bg, borderRadius: 12, padding: 10, margin: 12 }}>
      <ShieldCheck size={16} color={U.chipTones.success.fg} strokeWidth={1.6} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: U.chipTones.success.fg, flex: 1 }}>Süresi dolmak üzere belge yok</Text>
    </View>
  );

  return (
    <View style={{ backgroundColor: U.chipTones.warning.bg, borderRadius: 12, padding: 10, margin: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <AlertTriangle size={14} color={U.chipTones.warning.fg} strokeWidth={1.6} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: U.chipTones.warning.fg }}>Dolmak Üzere ({docs.length})</Text>
      </View>
      {docs.map((d: any) => (
        <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderTopWidth: 1, borderTopColor: U.hairline }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{d.full_name}</Text>
            <Text style={{ fontSize: 10, color: U.ink[500] }} numberOfLines={1}>{DOC_TYPE_CFG[d.doc_type as DocType]?.label} — {d.title}</Text>
          </View>
          <ExpiryBadge days={d.days_until_expiry} />
        </View>
      ))}
    </View>
  );
}

// ─── Employee List (Left Panel) ───────────────────────────────────────────────
function EmployeeList({
  employees, selectedId, onSelect, search, setSearch, docCounts,
}: {
  employees: any[]; selectedId: string | null; onSelect: (id: string) => void;
  search: string; setSearch: (v: string) => void;
  docCounts: Record<string, number>;
}) {
  const U = useInkUI();
  const filtered = employees.filter(e => e.full_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, margin: 10, backgroundColor: U.ink[100], borderRadius: 12, paddingHorizontal: 10, height: 36 }}>
        <Search size={14} color={U.ink[400]} strokeWidth={1.6} />
        <TextInput style={{ flex: 1, fontSize: 13, color: U.ink[900], padding: 0 }} placeholder="Personel ara..." value={search} onChangeText={setSearch} placeholderTextColor={U.ink[400]} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        {filtered.map(emp => {
          const sel   = emp.id === selectedId;
          const count = docCounts[emp.id] ?? 0;
          return (
            <Pressable
              key={emp.id}
              style={[
                { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9, marginHorizontal: 6, marginBottom: 2, borderRadius: 12, ...WEB_CURSOR },
                sel && { backgroundColor: U.ink[50] },
              ] as any}
              onPress={() => onSelect(emp.id)}
            >
              <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: U.ink[100] }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: U.ink[500] }}>{emp.full_name?.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[{ fontSize: 12, fontWeight: '600', color: U.ink[900] }, sel && { fontWeight: '700' }]} numberOfLines={1}>{emp.full_name}</Text>
                <Text style={{ fontSize: 10, color: U.ink[500] }}>{emp.role ?? 'Personel'}</Text>
              </View>
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: count > 0 ? U.ink[200] : U.ink[100] }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: U.ink[500] }}>{count}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Documents Detail (Right Panel) ──────────────────────────────────────────
function DocumentsDetail({
  employee, userId, labId,
}: {
  employee: any; userId: string; labId: string;
}) {
  const U = useInkUI();
  const [docs, setDocs]         = useState<EmployeeDocument[]>([]);
  const [loading, setLoading]   = useState(true);
  const [uploadOpen, setUpload] = useState(false);
  const [editDoc, setEditDoc]   = useState<EmployeeDocument | null>(null);
  const [filter, setFilter]     = useState<DocType | 'all'>('all');

  const { width }     = useWindowDimensions();
  const isDesktop     = width >= 900;
  const isEmbedded    = useContext(HubContext);
  const insets        = useSafeAreaInsets();

  const loadDocs = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchDocuments(employee.id);
    setDocs((data as EmployeeDocument[]) ?? []);
    setLoading(false);
  }, [employee.id]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const openDoc = async (doc: EmployeeDocument) => {
    const url = await getDocumentUrl(doc.file_path);
    if (!url) { toast.error('Belge açılamadı'); return; }
    if (Platform.OS === 'web') {
      (window as any).open(url, '_blank');
    } else {
      const { Linking } = require('react-native');
      Linking.openURL(url);
    }
  };

  const confirmDelete = (doc: EmployeeDocument) => {
    Alert.alert('Belgeyi sil?', `"${doc.title}" silinecek, geri alınamaz.`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: async () => {
        await deleteDocument(doc.id, doc.file_path);
        toast.success('Belge silindi');
        loadDocs();
      }},
    ]);
  };

  const grouped = DOC_TYPES.reduce((acc, t) => {
    const items = docs.filter(d => d.doc_type === t);
    if (items.length) acc[t] = items;
    return acc;
  }, {} as Record<DocType, EmployeeDocument[]>);

  const filtered = filter === 'all' ? docs : docs.filter(d => d.doc_type === filter);

  const expiring = docs.filter(d => { const days = daysUntilExpiry(d.valid_until); return days !== null && days <= 30; });

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: isEmbedded ? 0 : 24, paddingTop: isEmbedded ? 0 : 70, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
        <View>
          <Text style={{ ...DISPLAY, fontSize: 18, fontWeight: '700', color: U.ink[900] }}>{employee.full_name}</Text>
          <Text style={{ fontSize: 12, color: U.ink[500], marginTop: 2 }}>{employee.role ?? 'Personel'}  ·  {docs.length} belge</Text>
        </View>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999, backgroundColor: U.ink[900], ...WEB_CURSOR } as any} onPress={() => setUpload(true)}>
          <Upload size={14} color={U.onDarkPill} strokeWidth={1.6} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: U.onDarkPill }}>Belge Yükle</Text>
        </Pressable>
      </View>

      {/* Expiry warning */}
      {expiring.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 24, marginTop: 12, backgroundColor: U.chipTones.warning.bg, borderRadius: 12, padding: 10 }}>
          <AlertTriangle size={14} color={U.chipTones.warning.fg} strokeWidth={1.6} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: U.chipTones.warning.fg }}>{expiring.length} belge 30 gün içinde sona eriyor</Text>
        </View>
      )}

      {/* Filter pills — pill-group */}
      <View style={{ paddingHorizontal: isEmbedded ? 0 : 24, paddingVertical: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 6, backgroundColor: U.ink[100], borderRadius: 9999, padding: 4 }}>
            {([['all', 'Tümü', docs.length]] as any[]).concat(
              DOC_TYPES.filter(t => grouped[t]).map(t => [t, DOC_TYPE_CFG[t].label, grouped[t].length])
            ).map(([t, label, count]: [string, string, number]) => {
              const sel = filter === t;
              return (
                <Pressable
                  key={t}
                  style={[
                    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999, ...WEB_CURSOR },
                    sel && { backgroundColor: U.surface, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
                  ] as any}
                  onPress={() => setFilter(t as any)}
                >
                  {t !== 'all' && <DocTypeIcon name={DOC_TYPE_CFG[t as DocType]?.icon} size={11} color={sel ? U.ink[900] : U.ink[400]} />}
                  <Text style={{ fontSize: 11, fontWeight: sel ? '700' : '600', color: sel ? U.ink[900] : U.ink[400] }}>
                    {label} ({count})
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Document list */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: isEmbedded ? 0 : 24, paddingTop: isDesktop || isEmbedded ? 0 : insets.top + 56, paddingBottom: 120 }}>
        {loading && <ActivityIndicator color={U.ink[400]} style={{ marginTop: 40 }} />}
        {!loading && filtered.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 10 }}>
            <FolderOpen size={32} color={U.ink[300]} strokeWidth={1.6} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: U.ink[500] }}>Henüz belge yok</Text>
            <Text style={{ fontSize: 13, color: U.ink[400] }}>Yukarıdan belge yükleyebilirsiniz</Text>
          </View>
        )}
        {!loading && filtered.length > 0 && (
          <View style={{ ...U.tableCard } as any}>
            {filtered.map(doc => (
              <DocCard
                key={doc.id} doc={doc}
                onOpen={() => openDoc(doc)}
                onEdit={() => setEditDoc(doc)}
                onDelete={() => confirmDelete(doc)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <UploadModal
        visible={uploadOpen} onClose={() => setUpload(false)}
        employeeId={employee.id} labId={labId} userId={userId}
        onDone={loadDocs}
      />
      <EditModal
        visible={!!editDoc} doc={editDoc}
        onClose={() => setEditDoc(null)} onDone={loadDocs}
      />
    </View>
  );
}

// ─── Placeholder ──────────────────────────────────────────────────────────────
function SelectEmployeePlaceholder() {
  const U = useInkUI();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 }}>
      <View style={{ width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: U.ink[100] }}>
        <FolderOpen size={40} color={U.ink[400]} strokeWidth={1.6} />
      </View>
      <Text style={{ ...DISPLAY, fontSize: 22, fontWeight: '700', color: U.ink[900] }}>Personel Dosyaları</Text>
      <Text style={{ fontSize: 13, color: U.ink[500], textAlign: 'center', maxWidth: 360 }}>Sol taraftan bir personel seçerek belgelerini görüntüleyin veya yeni belge yükleyin.</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
interface DocumentsScreenProps {
  /** Panel rengi (accentColor) — şu an layout için minimal kullanım, ileride satır vurgusu vb. için */
  accentColor?: string;
}

export function DocumentsScreen(_props: DocumentsScreenProps = {}) {
  const U = useInkUI();
  const { profile }   = useAuthStore();
  const { width }     = useWindowDimensions();
  const isDesktop     = width >= 900;
  const isEmbedded    = useContext(HubContext);
  const insets        = useSafeAreaInsets();
  const { employees } = useEmployees();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [docCounts, setDocCounts]   = useState<Record<string, number>>({});

  const activeEmps = employees.filter((e: any) => e.is_active !== false);

  // Load doc counts for sidebar badges
  useEffect(() => {
    if (!activeEmps.length) return;
    (async () => {
      const counts: Record<string, number> = {};
      await Promise.all(activeEmps.map(async (e: any) => {
        const { data } = await fetchDocuments(e.id);
        counts[e.id] = (data as EmployeeDocument[])?.length ?? 0;
      }));
      setDocCounts(counts);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmps.length]);

  const selectedEmployee = activeEmps.find((e: any) => e.id === selectedId);
  const labId  = profile?.lab_id ?? '';
  const userId = profile?.id ?? '';

  // ── Desktop ─────────────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* LEFT */}
        <View style={{ width: 280, borderEndWidth: 1, borderEndColor: U.hairline, flexDirection: 'column' }}>
          {!isEmbedded && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 }}>
              <FolderOpen size={16} color={U.ink[500]} strokeWidth={1.6} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: U.ink[900] }}>Personel Dosyaları</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <EmployeeList
              employees={activeEmps}
              selectedId={selectedId}
              onSelect={setSelectedId}
              search={search}
              setSearch={setSearch}
              docCounts={docCounts}
            />
          </View>
          <ExpiryPanel />
        </View>

        {/* RIGHT */}
        <View style={{ flex: 1 }}>
          {selectedEmployee
            ? <DocumentsDetail employee={selectedEmployee} userId={userId} labId={labId} />
            : <SelectEmployeePlaceholder />
          }
        </View>
      </View>
    );
  }

  // ── Mobile ──────────────────────────────────────────────────────────────────
  if (selectedEmployee) {
    return (
      <View style={{ flex: 1 }}>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderBottomWidth: 1, borderBottomColor: U.hairline, ...WEB_CURSOR } as any} onPress={() => setSelectedId(null)}>
          {isRTL()
            ? <ArrowRight size={17} color={U.ink[500]} strokeWidth={1.6} />
            : <ArrowLeft size={17} color={U.ink[500]} strokeWidth={1.6} />}
          <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[500] }}>Geri</Text>
        </Pressable>
        <DocumentsDetail employee={selectedEmployee} userId={userId} labId={labId} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {!isEmbedded && (
        <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
          <Text style={{ ...DISPLAY, fontSize: 22, fontWeight: '700', color: U.ink[900] }}>Personel Dosyaları</Text>
        </View>
      )}
      <ExpiryPanel />
      <EmployeeList
        employees={activeEmps}
        selectedId={selectedId}
        onSelect={setSelectedId}
        search={search}
        setSearch={setSearch}
        docCounts={docCounts}
      />
    </View>
  );
}
