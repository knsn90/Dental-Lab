// Tarama randevusu detayı (prototip: randevu penceresi). Bilgiler, hasta satırları (ekle / düzelt / sil,
// dosya yükle), "Tarama yapıldı" + geri al, nedenli iptal, düzenle ve karar penceresine geçiş.
// Yetki sunucuda (RPC); burada yalnız düğmelerin görünürlüğü: yönetici her şey, atanmış teknisyen hasta + "yapıldı".
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Linking, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useInkUI } from '../../../core/theme/inkScale';
import { useAuthStore } from '../../../core/store/authStore';
import { autoT } from '../../../core/i18n/autoTranslate';
import { Check, Upload, CalendarClock, X, Trash2, Undo2, Plus, Paperclip } from '../../../core/ui/icons';
import { labLocalParts, hhmm, canMarkDone, CANCEL_REASONS, SOURCE_LABEL, INTENT_LABEL } from '../scanModel';
import {
  fetchScanAppointment, markDone, undoDone, cancelAppointment, savePatient, deletePatient,
  uploadScanFile, listScanFiles, signScanFiles,
} from '../api';
import type { ScanAppointmentRow, ScanPatientRow } from '../types';
import type { ScanCatalog } from '../hooks/useScanCatalog';
import type { OriginRect } from '../../delivery/proof/useAnchoredSpring';
import { SheetModal, Btn, IconBtn, Toggle, Chip, FieldLabel, KIND_LABEL, WEB_PTR, pressScale } from './ui';

const STATUS_LABEL: Record<string, string> = { planlandi: 'Planlandı', yapildi: 'Yapıldı', kapandi: 'Kapandı', iptal: 'İptal' };
const DECISION_LABEL: Record<string, string> = { siparise_baglandi: 'Siparişe bağlandı', yeni_siparis: 'Yeni sipariş', yalniz_tarama: 'Yalnız tarama' };

function initials(name: string | null): string {
  const p = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : '')).toLocaleUpperCase('tr') : '?';
}

export function AppointmentDetailModal({ visible, origin, onClose, rowId, catalog, canManage, onChanged, onEdit, onDecide }: {
  visible: boolean; origin: OriginRect | null; onClose: () => void; rowId: string | null; catalog: ScanCatalog;
  canManage: boolean; onChanged: () => void; onEdit: (row: ScanAppointmentRow) => void; onDecide: (row: ScanAppointmentRow) => void;
}) {
  const U = useInkUI();
  const me = useAuthStore((s) => s.profile?.id ?? null);
  const [row, setRow] = useState<ScanAppointmentRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');

  const load = useCallback(async () => { if (rowId) setRow(await fetchScanAppointment(rowId)); }, [rowId]);
  useEffect(() => {
    if (!visible) return;
    setErr(null); setEditing(null); setCancelOpen(false); setReason(null); setOther('');
    setRow(null); void load();
  }, [visible, load]);

  const isTech = !!row && row.technician_id === me;
  const canTouch = canManage || isTech;
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true); setErr(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? autoT('İşlem tamamlanamadı')); return false; }
    await load(); onChanged();
    return true;
  };

  const lp = row ? labLocalParts(row.starts_at, catalog.tz) : null;
  const sub = row && lp
    ? `${lp.date.split('-').reverse().slice(0, 2).join('.')} ${hhmm(lp.minutes)} – ${hhmm(lp.minutes + row.duration_min)} · ${row.technician?.full_name ?? ''}`
    : undefined;
  const decided = !!row?.patients.some((p) => p.decision);

  const doDone = async () => {
    const pre = canMarkDone(row?.patients ?? []);
    if (pre) { setErr(autoT(pre)); return; }
    await run(() => markDone(row!.id, null));
  };
  const doCancel = async () => {
    const r = reason === 'Diğer' ? other.trim() : reason;
    if (!r || r.length < 3) { setErr(autoT('İptal nedenini yazın')); return; }
    if (await run(() => cancelAppointment(row!.id, r))) setCancelOpen(false);
  };

  const footer = !row ? null : (
    <View style={{ gap: 8 }}>
      {err ? <Text style={{ fontSize: 12.5, color: U.chipTones.danger.fg }} accessibilityLiveRegion="polite">{err}</Text> : null}
      {cancelOpen ? (
        <View style={{ gap: 10 }}>
          <FieldLabel>{autoT('İptal nedeni')}</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CANCEL_REASONS.map((r) => <Toggle key={r} label={autoT(r)} on={reason === r} onPress={() => setReason(r)} />)}
          </View>
          {reason === 'Diğer' ? (
            <TextInput value={other} onChangeText={setOther} placeholder={autoT('Kısaca yazın')} placeholderTextColor={U.ink[400]} style={{ ...U.inputStyle, fontSize: 16 }} />
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
            <Btn kind="ghost" label={autoT('Vazgeç')} onPress={() => setCancelOpen(false)} />
            <Btn kind="sec" label={autoT('Randevuyu iptal et')} onPress={doCancel} busy={busy} tip={autoT('Randevu iptal edilir, teknisyene bildirilir; ücretlendirilmez')} />
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {row.status === 'planlandi' && canManage ? (
            <>
              <IconBtn label={autoT('Ertele')} tip={autoT('Saati, günü ya da teknisyeni değiştir')} onPress={() => onEdit(row)}>
                {(c) => <CalendarClock size={17} color={c} />}
              </IconBtn>
              <IconBtn label={autoT('İptal et')} tip={autoT('Randevuyu nedeniyle iptal et')} onPress={() => setCancelOpen(true)}>
                {(c) => <X size={17} color={c} />}
              </IconBtn>
            </>
          ) : null}
          <View style={{ flex: 1 }} />
          {row.status === 'yapildi' && canTouch && !decided ? (
            <Btn kind="sec" label={autoT('Geri al')} onPress={() => run(() => undoDone(row.id))} busy={busy}
              icon={(c) => <Undo2 size={15} color={c} />} tip={autoT('"Tarama yapıldı" işaretini kaldırır')} />
          ) : null}
          {(row.status === 'yapildi' || row.status === 'kapandi') && canManage ? (
            <Btn kind={row.status === 'kapandi' ? 'sec' : 'pri'} label={row.status === 'kapandi' ? autoT('Kararlar') : autoT('Karar ver')}
              onPress={() => onDecide(row)} tip={autoT('Her hasta için: siparişe bağla, yeni sipariş aç ya da yalnız tarama')} />
          ) : null}
          {row.status === 'planlandi' && canTouch ? (
            <Btn kind="pri" label={autoT('Tarama yapıldı')} onPress={doDone} busy={busy}
              icon={(c) => <Check size={15} color={c} />} tip={autoT('Hastalar tamamsa taramayı yapıldı olarak işaretler')} />
          ) : null}
        </View>
      )}
    </View>
  );

  return (
    <SheetModal visible={visible} origin={origin} onClose={onClose} title={row?.clinic?.name ?? autoT('Tarama randevusu')} subtitle={sub} footer={footer}>
      {!row ? <ActivityIndicator style={{ marginVertical: 24 }} /> : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Fact k={autoT('Durum')} v={autoT(STATUS_LABEL[row.status] ?? row.status)} />
            <Fact k={autoT('Kaynak')} v={autoT(SOURCE_LABEL[row.source] ?? row.source)} />
            <Fact k={autoT('Beklenen')} v={`${autoT(INTENT_LABEL[row.intent] ?? INTENT_LABEL.belirsiz)}${row.intended_order?.order_number ? ` · #${row.intended_order.order_number}` : ''}`} />
            <Fact k={autoT('Tarama')} v={row.services.map((s) => (s.scan_kind ? autoT(KIND_LABEL[s.scan_kind]) : s.name)).join(', ')} />
            {row.services.some((s) => s.equipment_id) ? (
              <Fact k={autoT('Cihaz')} v={row.services.map((s) => catalog.devices.find((d) => d.id === s.equipment_id)?.name).filter(Boolean).join(', ')} />
            ) : null}
          </View>
          {row.status === 'iptal' && row.cancel_reason ? <Text style={{ fontSize: 13, color: U.ink[500] }}>{`${autoT('İptal nedeni')}: ${autoT(row.cancel_reason)}`}</Text> : null}
          {row.note ? <Text style={{ fontSize: 13, color: U.ink[700] }}>{row.note}</Text> : null}

          <View style={{ gap: 8 }}>
            <FieldLabel>{autoT('Taranan hastalar')}</FieldLabel>
            {row.patients.map((p) => editing === p.id ? (
              <PatientEditor key={p.id} row={row} patient={p} busy={busy} onCancel={() => setEditing(null)}
                onSave={async (name, svc) => { if (await run(() => savePatient({ id: p.id, appointmentId: row.id, patientName: name, serviceIds: svc, note: p.note, workOrderId: p.work_order_id }))) setEditing(null); }}
                onDelete={async () => { if (await run(() => deletePatient(p.id))) setEditing(null); }} />
            ) : (
              <PatientRow key={p.id} row={row} p={p} canEdit={canTouch && !p.decision && row.status !== 'iptal'} onEdit={() => setEditing(p.id)} />
            ))}
            {editing === 'new' ? (
              <PatientEditor row={row} busy={busy} onCancel={() => setEditing(null)}
                onSave={async (name, svc) => { if (await run(() => savePatient({ id: null, appointmentId: row.id, patientName: name, serviceIds: svc, note: null, workOrderId: null }))) setEditing(null); }} />
            ) : canTouch && (row.status === 'planlandi' || row.status === 'yapildi') ? (
              <Pressable onPress={() => setEditing('new')} accessibilityRole="button" accessibilityLabel={autoT('Hasta ekle')}
                style={({ pressed }: any) => ({ height: 46, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: U.fieldBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...pressScale(pressed), ...WEB_PTR })}>
                <Plus size={15} color={U.ink[500]} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[500] }}>{autoT('Hasta ekle')}</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      )}
    </SheetModal>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  const U = useInkUI();
  return (
    <View style={{ flexGrow: 1, flexBasis: 140, borderRadius: 14, backgroundColor: U.surfaceSoft, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Text style={{ fontSize: 11, color: U.ink[400] }}>{k}</Text>
      <Text style={{ fontSize: 13.5, fontWeight: '600', color: U.ink[900], marginTop: 2 }} numberOfLines={2}>{v || '—'}</Text>
    </View>
  );
}

function PatientRow({ row, p, canEdit, onEdit }: { row: ScanAppointmentRow; p: ScanPatientRow; canEdit: boolean; onEdit: () => void }) {
  const U = useInkUI();
  const [files, setFiles] = useState<{ path: string; name: string }[] | null>(null);
  const [up, setUp] = useState(false);
  const [ferr, setFerr] = useState<string | null>(null);
  const loadFiles = useCallback(async () => setFiles(await listScanFiles(row.lab_id, row.id, p.id)), [row.lab_id, row.id, p.id]);
  useEffect(() => { void loadFiles(); }, [loadFiles]);

  const pick = async () => {
    setFerr(null);
    const res = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const a: any = res.assets[0];
    setUp(true);
    const r = await uploadScanFile(row.lab_id, row.id, p.id, { uri: a.uri, name: a.name ?? 'dosya', mimeType: a.mimeType, blob: a.file ?? null });
    setUp(false);
    if (r.error) { setFerr(r.error); return; }
    await loadFiles();
  };
  const open = async (path: string) => {
    const u = (await signScanFiles([path]))[path];
    if (!u) return;
    if (Platform.OS === 'web') (globalThis as any).open?.(u, '_blank'); else void Linking.openURL(u);
  };
  const svcNames = p.charges.map((c) => row.services.find((s) => s.service_id === c.service_id)).filter(Boolean);
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: U.hairline, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: U.surfaceSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: U.ink[700] }}>{initials(p.patient_name)}</Text>
        </View>
        <Pressable onPress={canEdit ? onEdit : undefined} accessibilityRole={canEdit ? 'button' : undefined} accessibilityLabel={p.patient_name ?? autoT('Hasta')}
          style={{ flex: 1, minWidth: 0, ...(canEdit ? WEB_PTR : {}) }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>{p.patient_name || autoT('Adı yazılmadı')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {svcNames.map((s) => s!.scan_kind ? <Chip key={s!.service_id} kind={s!.scan_kind} label={autoT(KIND_LABEL[s!.scan_kind])} /> : null)}
            {p.decision ? <Chip tone="success" label={autoT(DECISION_LABEL[p.decision])} /> : row.status !== 'planlandi' ? <Chip tone="warning" label={autoT('Karar bekliyor')} /> : null}
            {files ? <Chip tone={files.length ? 'neutral' : 'warning'} label={files.length ? `${files.length} ${autoT('dosya')}` : autoT('Dosya yok')} /> : null}
          </View>
        </Pressable>
        {row.status !== 'iptal' ? (
          <IconBtn label={autoT('Dosya yükle')} tip={autoT('Medit Link\'ten indirilen tarama dosyasını ekle')} onPress={pick}>
            {(c) => (up ? <ActivityIndicator size="small" /> : <Upload size={17} color={c} />)}
          </IconBtn>
        ) : null}
      </View>
      {files?.length ? (
        <View style={{ gap: 4, paddingLeft: 46 }}>
          {files.map((f) => (
            <Pressable key={f.path} onPress={() => open(f.path)} accessibilityRole="link" accessibilityLabel={f.name}
              style={({ pressed }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, ...pressScale(pressed), ...WEB_PTR })}>
              <Paperclip size={13} color={U.ink[400]} />
              <Text style={{ fontSize: 12.5, color: U.ink[700], textDecorationLine: 'underline' }} numberOfLines={1}>{f.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {ferr ? <Text style={{ fontSize: 12, color: U.chipTones.danger.fg }}>{ferr}</Text> : null}
    </View>
  );
}

function PatientEditor({ row, patient, busy, onSave, onCancel, onDelete }: {
  row: ScanAppointmentRow; patient?: ScanPatientRow; busy: boolean;
  onSave: (name: string, serviceIds: string[]) => void; onCancel: () => void; onDelete?: () => void;
}) {
  const U = useInkUI();
  const [name, setName] = useState(patient?.patient_name ?? '');
  const [svc, setSvc] = useState<string[]>(patient ? patient.charges.map((c) => c.service_id) : row.services.map((s) => s.service_id));
  const ok = name.trim().length >= 2 && svc.length > 0;
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: U.ink[900], padding: 12, gap: 10 }}>
      <TextInput value={name} onChangeText={setName} autoFocus placeholder={autoT('Hasta adı soyadı')} placeholderTextColor={U.ink[400]} style={{ ...U.inputStyle, fontSize: 16 }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {row.services.map((s) => (
          <Toggle key={s.service_id} label={s.scan_kind ? autoT(KIND_LABEL[s.scan_kind]) : s.name} on={svc.includes(s.service_id)}
            onPress={() => setSvc((x) => (x.includes(s.service_id) ? x.filter((y) => y !== s.service_id) : [...x, s.service_id]))} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {onDelete ? (
          <IconBtn label={autoT('Hastayı sil')} tip={autoT('Bu hastayı randevudan çıkarır')} onPress={onDelete}>
            {(c) => <Trash2 size={16} color={c} />}
          </IconBtn>
        ) : null}
        <View style={{ flex: 1 }} />
        <Btn kind="ghost" label={autoT('Vazgeç')} onPress={onCancel} />
        <Btn kind="pri" label={autoT('Kaydet')} onPress={() => onSave(name.trim(), svc)} disabled={!ok} busy={busy} tip={autoT('Hastayı ve taranan hizmetleri kaydeder')} />
      </View>
    </View>
  );
}
