import { supabase } from '../../core/api/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
export type DocType =
  | 'kimlik' | 'sozlesme' | 'sertifika' | 'sigorta'
  | 'saglik' | 'izin_belgesi' | 'bordro' | 'diger';

export interface EmployeeDocument {
  id: string;
  lab_id: string;
  employee_id: string;
  doc_type: DocType;
  title: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  valid_from: string | null;
  valid_until: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────
export const DOC_TYPE_CFG: Record<DocType, { label: string; icon: string; color: string }> = {
  kimlik:       { label: 'Kimlik',        icon: 'credit-card',   color: '#2563EB' },
  sozlesme:     { label: 'Sözleşme',      icon: 'file-text',     color: '#7C3AED' },
  sertifika:    { label: 'Sertifika',     icon: 'award',         color: '#059669' },
  sigorta:      { label: 'Sigorta',       icon: 'shield',        color: '#0EA5E9' },
  saglik:       { label: 'Sağlık',        icon: 'activity',      color: '#DC2626' },
  izin_belgesi: { label: 'İzin Belgesi',  icon: 'calendar',      color: '#D97706' },
  bordro:       { label: 'Bordro',        icon: 'dollar-sign',   color: '#374151' },
  diger:        { label: 'Diğer',         icon: 'paperclip',     color: '#64748B' },
};

export const DOC_TYPES: DocType[] = [
  'kimlik','sozlesme','sertifika','sigorta','saglik','izin_belgesi','bordro','diger'
];

export function isImageFile(mimeType: string | null): boolean {
  return !!mimeType && mimeType.startsWith('image/');
}

export function isPdfFile(mimeType: string | null): boolean {
  return mimeType === 'application/pdf';
}

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function daysUntilExpiry(validUntil: string | null): number | null {
  if (!validUntil) return null;
  const d = new Date(validUntil + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / 86_400_000);
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function fetchDocuments(employeeId: string) {
  return supabase
    .from('employee_documents')
    .select('*')
    .eq('employee_id', employeeId)
    .order('doc_type')
    .order('created_at', { ascending: false });
}

export async function fetchExpiringDocuments() {
  return supabase
    .from('v_expiring_documents')
    .select('*')
    .order('days_until_expiry');
}

export async function addDocument(
  doc: Omit<EmployeeDocument, 'id' | 'lab_id' | 'created_at' | 'updated_at'> & { created_by: string }
) {
  return supabase
    .from('employee_documents')
    .insert(doc)
    .select()
    .single();
}

export async function updateDocument(id: string, updates: Partial<Pick<EmployeeDocument,
  'title' | 'doc_type' | 'valid_from' | 'valid_until' | 'notes'
>>) {
  return supabase
    .from('employee_documents')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
}

export async function deleteDocument(id: string, filePath: string) {
  await supabase.storage.from('employee-docs').remove([filePath]);
  return supabase.from('employee_documents').delete().eq('id', id);
}

/** Dosya yükle — Supabase Storage */
export async function uploadDocument(
  labId: string,
  employeeId: string,
  file: { uri: string; name: string; type: string; size?: number },
): Promise<{ path: string; publicUrl: string } | null> {
  const ext = file.name.split('.').pop() ?? 'bin';
  const path = `${labId}/${employeeId}/${Date.now()}.${ext}`;

  // Web: fetch blob, Native: use uri directly
  let uploadData: Blob | ArrayBuffer;
  try {
    const response = await fetch(file.uri);
    uploadData = await response.blob();
  } catch {
    return null;
  }

  const { error } = await supabase.storage
    .from('employee-docs')
    .upload(path, uploadData, { contentType: file.type, upsert: false });

  if (error) return null;

  const { data: urlData } = supabase.storage
    .from('employee-docs')
    .getPublicUrl(path);

  return { path, publicUrl: urlData.publicUrl };
}

/** Geçici erişim URL'i oluştur */
export async function getDocumentUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('employee-docs')
    .createSignedUrl(filePath, 3600); // 1 saat geçerli
  return error ? null : data.signedUrl;
}
