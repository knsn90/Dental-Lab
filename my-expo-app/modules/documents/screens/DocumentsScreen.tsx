import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Alert, Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { C } from '../../../core/theme/colors';
import { F, FS } from '../../../core/theme/typography';
import { useIsDesktop } from '../../../core/layout/DesktopShell';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';
import { useEmployees } from '../../employees/hooks/useEmployees';
import { AppIcon } from '../../../core/ui/AppIcon';

import {
  fetchDocuments, fetchExpiringDocuments, addDocument, updateDocument,
  deleteDocument, uploadDocument, getDocumentUrl,
  DOC_TYPE_CFG, DOC_TYPES, formatFileSize, daysUntilExpiry,
  type EmployeeDocument, type DocType,
} from '../api';

// ─── ExpiryBadge ─────────────────────────────────────────────────────────────
function ExpiryBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  const color = days <= 7 ? '#DC2626' : days <= 30 ? '#D97706' : '#059669';
  const label = days <= 0 ? 'Süresi doldu' : `${days} gün`;
  return (
    <View style={[xb.badge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <AppIcon name="clock" size={10} color={color} />
      <Text style={[xb.badgeText, { color }]}>{label}</Text>
    </View>
  );
}
const xb = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontSize: FS.xs, fontFamily: F.semibold, fontWeight: '600' },
});

// ─── DocCard ─────────────────────────────────────────────────────────────────
function DocCard({
  doc, accentColor, onOpen, onEdit, onDelete,
}: {
  doc: EmployeeDocument;
  accentColor: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cfg  = DOC_TYPE_CFG[doc.doc_type];
  const days = daysUntilExpiry(doc.valid_until);
  const isExp = days !== null && days <= 0;

  return (
    <View style={[dc.card, isExp && dc.expired]}>
      <View style={[dc.iconBox, { backgroundColor: cfg.color + '18' }]}>
        <AppIcon name={cfg.icon as any} size={20} color={cfg.color} />
      </View>
      <View style={dc.info}>
        <Text style={dc.title} numberOfLines={1}>{doc.title}</Text>
        <Text style={dc.meta}>
          {cfg.label}
          {doc.file_size ? `  •  ${formatFileSize(doc.file_size)}` : ''}
          {doc.valid_until ? `  •  ${doc.valid_until.slice(0, 10)}` : ''}
        </Text>
        {days !== null && <ExpiryBadge days={days} />}
      </View>
      <View style={dc.actions}>
        <TouchableOpacity style={dc.iconBtn} onPress={onOpen}>
          <AppIcon name="external-link" size={15} color={accentColor} />
        </TouchableOpacity>
        <TouchableOpacity style={dc.iconBtn} onPress={onEdit}>
          <AppIcon name="edit-2" size={15} color={C.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={dc.iconBtn} onPress={onDelete}>
          <AppIcon name="trash-2" size={15} color="#DC2626" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
const dc = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 8 },
  expired: { borderColor: '#FCA5A5', backgroundColor: '#FFF5F5' },
  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  info: { flex: 1, gap: 2 },
  title: { fontSize: FS.md, fontFamily: F.semibold, fontWeight: '600', color: C.textPrimary },
  meta: { fontSize: FS.sm, fontFamily: F.regular, color: C.textSecondary },
  actions: { flexDirection: 'row', gap: 4 },
  iconBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
});

// ─── DocTypeGrid ─────────────────────────────────────────────────────────────
function DocTypeGrid({ selected, onChange }: { selected: DocType; onChange: (t: DocType) => void }) {
  return (
    <View style={tg.grid}>
      {DOC_TYPES.map(t => {
        const cfg = DOC_TYPE_CFG[t];
        const sel = selected === t;
        return (
          <TouchableOpacity
            key={t}
            style={[tg.btn, { borderColor: sel ? cfg.color : '#E2E8F0' }, sel && { backgroundColor: cfg.color }]}
            onPress={() => onChange(t)}
          >
            <AppIcon name={cfg.icon as any} size={12} color={sel ? '#fff' : cfg.color} />
            <Text style={[tg.btnText, { color: sel ? '#fff' : cfg.color }]}>{cfg.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
const tg = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5 },
  btnText: { fontSize: FS.sm, fontFamily: F.semibold, fontWeight: '600' },
});

// ─── UploadModal ─────────────────────────────────────────────────────────────
function UploadModal({
  visible, onClose, employeeId, labId, userId, accentColor, onDone,
}: {
  visible: boolean; onClose: () => void; employeeId: string;
  labId: string; userId: string; accentColor: string; onDone: () => void;
}) {
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
      <View style={um.overlay}>
        <View style={um.sheet}>
          <View style={um.header}>
            <Text style={um.headerTitle}>Belge Yükle</Text>
            <TouchableOpacity onPress={onClose}><AppIcon name="x" size={22} color={C.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView style={um.body} showsVerticalScrollIndicator={false}>

            <TouchableOpacity style={[um.filePicker, file && um.filePicked]} onPress={pickFile}>
              <AppIcon name={file ? 'check-circle' : 'upload'} size={22} color={file ? '#059669' : accentColor} />
              <Text style={[um.filePickerText, file && { color: '#059669' }]}>
                {file ? file.name : 'Dosya seç (PDF, görsel, Word vb.)'}
              </Text>
              {!!file?.size && <Text style={um.fileSize}>{formatFileSize(file.size ?? null)}</Text>}
            </TouchableOpacity>

            <Text style={um.label}>Belge Türü</Text>
            <DocTypeGrid selected={docType} onChange={setDocType} />

            <Text style={[um.label, { marginTop: 16 }]}>Başlık *</Text>
            <TextInput style={um.input} value={title} onChangeText={setTitle} placeholder="Örn: TC Kimlik Ön Yüz" placeholderTextColor={C.textMuted} />

            <View style={um.row}>
              <View style={{ flex: 1 }}>
                <Text style={um.label}>Geçerlilik Başlangıcı</Text>
                <TextInput style={um.input} value={validFrom} onChangeText={setFrom} placeholder="YYYY-MM-DD" placeholderTextColor={C.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={um.label}>Geçerlilik Bitişi</Text>
                <TextInput style={um.input} value={validUntil} onChangeText={setUntil} placeholder="YYYY-MM-DD" placeholderTextColor={C.textMuted} />
              </View>
            </View>

            <Text style={um.label}>Notlar</Text>
            <TextInput
              style={[um.input, { height: 72, textAlignVertical: 'top' }]}
              value={notes} onChangeText={setNotes}
              placeholder="İsteğe bağlı not" multiline
              placeholderTextColor={C.textMuted}
            />
          </ScrollView>

          <View style={um.footer}>
            <TouchableOpacity style={um.cancelBtn} onPress={onClose}>
              <Text style={um.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[um.uploadBtn, { backgroundColor: accentColor }, (!file || !title.trim() || uploading) && { opacity: 0.5 }]}
              onPress={handleUpload} disabled={!file || !title.trim() || uploading}
            >
              {uploading
                ? <ActivityIndicator color="#fff" size="small" />
                : <><AppIcon name="upload" size={15} color="#fff" /><Text style={um.uploadBtnText}>Yükle</Text></>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const um = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000055', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerTitle: { fontSize: FS.lg, fontFamily: F.bold, fontWeight: '700', color: C.textPrimary },
  body: { padding: 20, maxHeight: 500 },
  footer: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  filePicker: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed', marginBottom: 16 },
  filePicked: { borderStyle: 'solid', borderColor: '#D1FAE5', backgroundColor: '#F0FDF4' },
  filePickerText: { fontSize: FS.md, fontFamily: F.regular, color: C.textSecondary, flex: 1 },
  fileSize: { fontSize: FS.sm, fontFamily: F.regular, color: C.textSecondary },
  label: { fontSize: FS.xs, fontFamily: F.semibold, fontWeight: '600', color: C.textSecondary, marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: FS.md, fontFamily: F.regular, color: C.textPrimary, backgroundColor: '#FAFAFA' },
  row: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  cancelText: { fontSize: FS.md, fontFamily: F.semibold, fontWeight: '600', color: C.textSecondary },
  uploadBtn: { flex: 1, padding: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  uploadBtnText: { fontSize: FS.md, fontFamily: F.bold, fontWeight: '700', color: '#fff' },
});

// ─── EditModal ────────────────────────────────────────────────────────────────
function EditModal({
  visible, doc, onClose, onDone, accentColor,
}: {
  visible: boolean; doc: EmployeeDocument | null; onClose: () => void; onDone: () => void; accentColor: string;
}) {
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
      <View style={um.overlay}>
        <View style={um.sheet}>
          <View style={um.header}>
            <Text style={um.headerTitle}>Belgeyi Düzenle</Text>
            <TouchableOpacity onPress={onClose}><AppIcon name="x" size={22} color={C.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView style={um.body}>
            <Text style={um.label}>Başlık *</Text>
            <TextInput style={um.input} value={title} onChangeText={setTitle} placeholderTextColor={C.textMuted} />
            <Text style={[um.label, { marginTop: 16 }]}>Belge Türü</Text>
            <DocTypeGrid selected={docType} onChange={setDocType} />
            <View style={[um.row, { marginTop: 4 }]}>
              <View style={{ flex: 1 }}>
                <Text style={um.label}>Geçerlilik Başlangıcı</Text>
                <TextInput style={um.input} value={validFrom} onChangeText={setFrom} placeholder="YYYY-MM-DD" placeholderTextColor={C.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={um.label}>Geçerlilik Bitişi</Text>
                <TextInput style={um.input} value={validUntil} onChangeText={setUntil} placeholder="YYYY-MM-DD" placeholderTextColor={C.textMuted} />
              </View>
            </View>
            <Text style={um.label}>Notlar</Text>
            <TextInput style={[um.input, { height: 72, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} multiline placeholderTextColor={C.textMuted} />
          </ScrollView>
          <View style={um.footer}>
            <TouchableOpacity style={um.cancelBtn} onPress={onClose}><Text style={um.cancelText}>İptal</Text></TouchableOpacity>
            <TouchableOpacity style={[um.uploadBtn, { backgroundColor: accentColor }, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={um.uploadBtnText}>Kaydet</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── ExpiryPanel ─────────────────────────────────────────────────────────────
function ExpiryPanel() {
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
    <View style={ep.emptyCard}>
      <AppIcon name="shield" size={16} color="#059669" />
      <Text style={ep.emptyText}>Süresi dolmak üzere belge yok</Text>
    </View>
  );

  return (
    <View style={ep.card}>
      <View style={ep.cardHeader}>
        <AppIcon name="alert-triangle" size={14} color="#D97706" />
        <Text style={ep.cardTitle}>Dolmak Üzere ({docs.length})</Text>
      </View>
      {docs.map((d: any) => (
        <View key={d.id} style={ep.row}>
          <View style={{ flex: 1 }}>
            <Text style={ep.rowName} numberOfLines={1}>{d.full_name}</Text>
            <Text style={ep.rowDoc} numberOfLines={1}>{DOC_TYPE_CFG[d.doc_type as DocType]?.label} — {d.title}</Text>
          </View>
          <ExpiryBadge days={d.days_until_expiry} />
        </View>
      ))}
    </View>
  );
}
const ep = StyleSheet.create({
  emptyCard: { flexDirection: 'row', gap: 7, alignItems: 'center', backgroundColor: '#F0FDF4', borderRadius: 10, padding: 10, margin: 12 },
  emptyText: { fontSize: FS.sm, fontFamily: F.semibold, fontWeight: '600', color: '#059669', flex: 1 },
  card: { backgroundColor: '#FFFBEB', borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A', padding: 10, margin: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  cardTitle: { fontSize: FS.sm, fontFamily: F.bold, fontWeight: '700', color: '#D97706' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#FDE68A' },
  rowName: { fontSize: FS.sm, fontFamily: F.semibold, fontWeight: '600', color: C.textPrimary },
  rowDoc: { fontSize: FS.xs, fontFamily: F.regular, color: C.textSecondary },
});

// ─── Employee List (Left Panel) ───────────────────────────────────────────────
function EmployeeList({
  employees, selectedId, onSelect, accentColor, search, setSearch, docCounts,
}: {
  employees: any[]; selectedId: string | null; onSelect: (id: string) => void;
  accentColor: string; search: string; setSearch: (v: string) => void;
  docCounts: Record<string, number>;
}) {
  const filtered = employees.filter(e => e.full_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <View style={el.container}>
      <View style={el.searchWrap}>
        <AppIcon name="search" size={14} color={C.textSecondary} />
        <TextInput style={el.searchInput} placeholder="Çalışan ara…" value={search} onChangeText={setSearch} placeholderTextColor={C.textMuted} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        {filtered.map(emp => {
          const sel   = emp.id === selectedId;
          const count = docCounts[emp.id] ?? 0;
          return (
            <TouchableOpacity
              key={emp.id}
              style={[el.row, sel && { backgroundColor: accentColor + '12', borderColor: accentColor + '30' }]}
              onPress={() => onSelect(emp.id)}
            >
              <View style={[el.avatar, { backgroundColor: accentColor + '22' }]}>
                <Text style={[el.avatarText, { color: accentColor }]}>{emp.full_name?.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[el.empName, sel && { color: accentColor }]} numberOfLines={1}>{emp.full_name}</Text>
                <Text style={el.empRole}>{emp.role ?? 'Çalışan'}</Text>
              </View>
              <View style={[el.countBadge, { backgroundColor: count > 0 ? accentColor + '18' : '#F1F5F9' }]}>
                <Text style={[el.countText, { color: count > 0 ? accentColor : C.textSecondary }]}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
const el = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 10, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 10, height: 36 },
  searchInput: { flex: 1, fontSize: FS.md, fontFamily: F.regular, color: C.textPrimary, padding: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9, marginHorizontal: 6, marginBottom: 2, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: FS.md, fontFamily: F.bold, fontWeight: '700' },
  empName: { fontSize: FS.sm, fontFamily: F.semibold, fontWeight: '600', color: C.textPrimary },
  empRole: { fontSize: FS.xs, fontFamily: F.regular, color: C.textSecondary },
  countBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: FS.xs, fontFamily: F.bold, fontWeight: '700' },
});

// ─── Documents Detail (Right Panel) ──────────────────────────────────────────
function DocumentsDetail({
  employee, accentColor, userId, labId,
}: {
  employee: any; accentColor: string; userId: string; labId: string;
}) {
  const [docs, setDocs]         = useState<EmployeeDocument[]>([]);
  const [loading, setLoading]   = useState(true);
  const [uploadOpen, setUpload] = useState(false);
  const [editDoc, setEditDoc]   = useState<EmployeeDocument | null>(null);
  const [filter, setFilter]     = useState<DocType | 'all'>('all');

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
    <View style={dd.root}>
      {/* Header */}
      <View style={dd.header}>
        <View>
          <Text style={dd.headerName}>{employee.full_name}</Text>
          <Text style={dd.headerMeta}>{employee.role ?? 'Çalışan'}  •  {docs.length} belge</Text>
        </View>
        <TouchableOpacity style={[dd.uploadBtn, { backgroundColor: accentColor }]} onPress={() => setUpload(true)}>
          <AppIcon name="upload" size={14} color="#fff" />
          <Text style={dd.uploadBtnText}>Belge Yükle</Text>
        </TouchableOpacity>
      </View>

      {/* Expiry warning */}
      {expiring.length > 0 && (
        <View style={dd.warnStrip}>
          <AppIcon name="alert-triangle" size={14} color="#D97706" />
          <Text style={dd.warnText}>{expiring.length} belge 30 gün içinde sona eriyor</Text>
        </View>
      )}

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 50 }} contentContainerStyle={dd.filterRow}>
        {([['all', 'Tümü', docs.length]] as any[]).concat(
          DOC_TYPES.filter(t => grouped[t]).map(t => [t, DOC_TYPE_CFG[t].label, grouped[t].length])
        ).map(([t, label, count]: [string, string, number]) => {
          const sel = filter === t;
          const color = t === 'all' ? accentColor : (DOC_TYPE_CFG[t as DocType]?.color ?? accentColor);
          return (
            <TouchableOpacity
              key={t}
              style={[dd.filterTab, sel && { backgroundColor: color, borderColor: color }]}
              onPress={() => setFilter(t as any)}
            >
              {t !== 'all' && <AppIcon name={DOC_TYPE_CFG[t as DocType]?.icon as any} size={11} color={sel ? '#fff' : color} />}
              <Text style={[dd.filterText, { color: sel ? '#fff' : (t === 'all' ? C.textSecondary : color) }]}>
                {label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Document list */}
      <ScrollView style={dd.list} contentContainerStyle={dd.listContent}>
        {loading && <ActivityIndicator color={accentColor} style={{ marginTop: 40 }} />}
        {!loading && filtered.length === 0 && (
          <View style={dd.empty}>
            <AppIcon name="folder" size={32} color={C.textMuted} />
            <Text style={dd.emptyTitle}>Henüz belge yok</Text>
            <Text style={dd.emptyHint}>Yukarıdan belge yükleyebilirsiniz</Text>
          </View>
        )}
        {!loading && filtered.map(doc => (
          <DocCard
            key={doc.id} doc={doc} accentColor={accentColor}
            onOpen={() => openDoc(doc)}
            onEdit={() => setEditDoc(doc)}
            onDelete={() => confirmDelete(doc)}
          />
        ))}
      </ScrollView>

      <UploadModal
        visible={uploadOpen} onClose={() => setUpload(false)}
        employeeId={employee.id} labId={labId} userId={userId}
        accentColor={accentColor} onDone={loadDocs}
      />
      <EditModal
        visible={!!editDoc} doc={editDoc}
        onClose={() => setEditDoc(null)} onDone={loadDocs} accentColor={accentColor}
      />
    </View>
  );
}
const dd = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerName: { fontSize: FS.xl, fontFamily: F.bold, fontWeight: '700', color: C.textPrimary },
  headerMeta: { fontSize: FS.sm, fontFamily: F.regular, color: C.textSecondary, marginTop: 2 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },
  uploadBtnText: { fontSize: FS.md, fontFamily: F.bold, fontWeight: '700', color: '#fff' },
  warnStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 24, marginTop: 12, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#FDE68A' },
  warnText: { fontSize: FS.sm, fontFamily: F.semibold, fontWeight: '600', color: '#D97706' },
  filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 24, paddingVertical: 10, alignItems: 'center' },
  filterTab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5, borderColor: '#E2E8F0' },
  filterText: { fontSize: FS.xs, fontFamily: F.semibold, fontWeight: '600' },
  list: { flex: 1 },
  listContent: { padding: 24 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: FS.lg, fontFamily: F.semibold, fontWeight: '600', color: C.textSecondary },
  emptyHint: { fontSize: FS.md, fontFamily: F.regular, color: C.textMuted },
});

// ─── Placeholder ──────────────────────────────────────────────────────────────
function SelectEmployeePlaceholder({ accentColor }: { accentColor: string }) {
  return (
    <View style={ph.root}>
      <View style={[ph.iconWrap, { backgroundColor: accentColor + '12' }]}>
        <AppIcon name="folder" size={40} color={accentColor} />
      </View>
      <Text style={ph.title}>Personel Dosyaları</Text>
      <Text style={ph.sub}>Sol taraftan bir çalışan seçerek belgelerini görüntüleyin veya yeni belge yükleyin.</Text>
    </View>
  );
}
const ph = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 },
  iconWrap: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FS['2xl'], fontFamily: F.bold, fontWeight: '700', color: C.textPrimary },
  sub: { fontSize: FS.md, fontFamily: F.regular, color: C.textSecondary, textAlign: 'center', maxWidth: 360 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export function DocumentsScreen({ accentColor = C.primary }: { accentColor?: string }) {
  const { profile }   = useAuthStore();
  const isDesktop     = useIsDesktop();
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
      <View style={s.desktopRoot}>
        {/* LEFT */}
        <View style={s.left}>
          <View style={s.leftHeader}>
            <AppIcon name="folder" size={16} color={accentColor} />
            <Text style={[s.leftTitle, { color: accentColor }]}>Personel Dosyaları</Text>
          </View>
          <View style={{ flex: 1 }}>
            <EmployeeList
              employees={activeEmps}
              selectedId={selectedId}
              onSelect={setSelectedId}
              accentColor={accentColor}
              search={search}
              setSearch={setSearch}
              docCounts={docCounts}
            />
          </View>
          <ExpiryPanel />
        </View>

        {/* Divider */}
        <View style={s.divider} />

        {/* RIGHT */}
        <View style={s.right}>
          {selectedEmployee
            ? <DocumentsDetail employee={selectedEmployee} accentColor={accentColor} userId={userId} labId={labId} />
            : <SelectEmployeePlaceholder accentColor={accentColor} />
          }
        </View>
      </View>
    );
  }

  // ── Mobile ──────────────────────────────────────────────────────────────────
  if (selectedEmployee) {
    return (
      <View style={s.mobileRoot}>
        <TouchableOpacity style={s.backBtn} onPress={() => setSelectedId(null)}>
          <AppIcon name="arrow-left" size={17} color={accentColor} />
          <Text style={[s.backText, { color: accentColor }]}>Geri</Text>
        </TouchableOpacity>
        <DocumentsDetail employee={selectedEmployee} accentColor={accentColor} userId={userId} labId={labId} />
      </View>
    );
  }

  return (
    <View style={s.mobileRoot}>
      <View style={s.mobileHeader}>
        <Text style={s.mobileTitle}>Personel Dosyaları</Text>
      </View>
      <ExpiryPanel />
      <EmployeeList
        employees={activeEmps}
        selectedId={selectedId}
        onSelect={setSelectedId}
        accentColor={accentColor}
        search={search}
        setSearch={setSearch}
        docCounts={docCounts}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  desktopRoot: { flex: 1, flexDirection: 'row', backgroundColor: '#F8FAFC' },
  left: { width: 280, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#F1F5F9', flexDirection: 'column' },
  leftHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 4 },
  leftTitle: { fontSize: FS.base, fontFamily: F.bold, fontWeight: '700' },
  divider: { width: 1, backgroundColor: '#F1F5F9' },
  right: { flex: 1 },
  mobileRoot: { flex: 1, backgroundColor: '#fff' },
  mobileHeader: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  mobileTitle: { fontSize: FS['2xl'], fontFamily: F.bold, fontWeight: '700', color: C.textPrimary },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backText: { fontSize: FS.md, fontFamily: F.semibold, fontWeight: '600' },
});
