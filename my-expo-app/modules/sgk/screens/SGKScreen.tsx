/**
 * SGK İşlemleri Ekranı
 * ── Sol panel : çalışan listesi + SGK durum rozeti
 * ── Sağ panel : 4 sekme
 *    1. Bildirge  — işe giriş / çıkış takibi
 *    2. Prim Hesabı — aylık SGK + vergi dökümü
 *    3. Kıdem/İhbar — tazminat hesaplayıcı
 *    4. Bilgi — çalışanın SGK/TC no, işyeri SGK no düzenleme
 */
import React, { useState, useMemo, useEffect, useContext } from 'react';
import { HubContext } from '../../../core/ui/HubContext';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { C } from '../../../core/theme/colors';
import { F, FS } from '../../../core/theme/typography';
import { toast } from '../../../core/ui/Toast';
import { useBreakpoint } from '../../../core/layout/Responsive';

import { AppIcon } from '../../../core/ui/AppIcon';

import {
  useSgkEmployees, useBildirge, useLabSgk, useSgkPrimRaporu,
} from '../hooks/useSGK';
import {
  createBildirge, updateBildirgeDurum, deleteBildirge,
  updateEmployeeSgk, updateLabSgk, fetchKumulatifGvMatrah,
  type SgkEmployee, type SgkBildirge, type BildirgeDurum,
} from '../api';
import {
  hesaplaNet, hesaplaTazminat, sgkCsvExport, formatTL,
  primGunSayisi, SGK_PARAMS, CIKIS_KODLARI,
} from '../calculations';

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
const MONTHS = ['','Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

function fmtPeriod(p: string): string {
  const [y, m] = p.split('-').map(Number);
  return `${MONTHS[m]} ${y}`;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const [y, m, g] = d.split('-').map(Number);
  return `${g} ${MONTHS[m]} ${y}`;
}

function shiftPeriod(p: string, delta: number): string {
  const [y, m] = p.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const DURUM_CFG: Record<BildirgeDurum, { label: string; fg: string; bg: string }> = {
  bekliyor:   { label: 'Bekliyor',   fg: '#D97706', bg: '#FEF3C7' },
  gonderildi: { label: 'Gönderildi', fg: '#2563EB', bg: '#DBEAFE' },
  onaylandi:  { label: 'Onaylandı',  fg: '#059669', bg: '#D1FAE5' },
};

function downloadCsv(content: string, filename: string) {
  if (Platform.OS !== 'web') {
    toast.info('CSV indirme yalnızca web tarayıcıda desteklenir.');
    return;
  }
  const bom   = '\uFEFF';
  const blob  = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href      = url;
  a.download  = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Ekran ────────────────────────────────────────────────────────────────────
interface Props { accentColor?: string }

export function SGKScreen({ accentColor = '#2563EB' }: Props) {
  const { isDesktop, px } = useBreakpoint();
  const isEmbedded = useContext(HubContext);
  const safeEdges  = isEmbedded ? ([] as any) : (['top'] as any);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'bildirge' | 'prim' | 'tazminat' | 'bilgi'>('bildirge');
  const [period, setPeriod] = useState(currentPeriod);
  const [bildirgeOpen, setBildirgeOpen] = useState(false);

  const { employees, loading: loadingEmp, refetch: refetchEmp } = useSgkEmployees();
  const { lab, refetch: refetchLab }                            = useLabSgk();
  const { bildirge, loading: loadingBil, refetch: refetchBil }  = useBildirge(selectedId);
  const { rows: primRows, loading: loadingPrim }                 = useSgkPrimRaporu(period);

  const selected = employees.find(e => e.id === selectedId) ?? null;

  const employeeList = (
    <EmployeeListPanel
      employees={employees}
      loading={loadingEmp}
      selectedId={selectedId}
      onSelect={id => { setSelectedId(id); setTab('bildirge'); }}
      accentColor={accentColor}
      px={px}
    />
  );

  const rightPanel = selected ? (
    <RightPanel
      employee={selected}
      tab={tab}
      setTab={setTab}
      period={period}
      setPeriod={setPeriod}
      bildirge={bildirge}
      loadingBildirge={loadingBil}
      onAddBildirge={() => setBildirgeOpen(true)}
      onUpdateBildirgeDurum={async (id: string, d: BildirgeDurum) => {
        const { error } = await updateBildirgeDurum(id, d);
        if (error) { toast.error('Güncellenemedi.'); return; }
        toast.success('Durum güncellendi.'); refetchBil();
      }}
      onDeleteBildirge={(id: string) => {
        Alert.alert('Bildirgeyi Sil', 'Bu bildirge kaydı silinecek?', [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Sil', style: 'destructive', onPress: async () => {
            const { error } = await deleteBildirge(id);
            if (error) { toast.error('Silinemedi.'); return; }
            toast.success('Silindi.'); refetchBil();
          }},
        ]);
      }}
      primRows={primRows}
      loadingPrim={loadingPrim}
      lab={lab}
      onSaveBilgi={async (data: Parameters<typeof updateEmployeeSgk>[1]) => {
        const { error } = await updateEmployeeSgk(selected.id, data);
        if (error) { toast.error('Kaydedilemedi.'); return; }
        toast.success('Kaydedildi.'); refetchEmp();
      }}
      onSaveLabSgk={async (no: string) => {
        try { await updateLabSgk(no); toast.success('İşyeri SGK no kaydedildi.'); refetchLab(); }
        catch (e: any) { toast.error(e?.message ?? 'Hata.'); }
      }}
      accentColor={accentColor}
      px={px}
    />
  ) : (
    <View style={s.emptyRight}>
      <AppIcon name="user" size={40} color={C.textDisabled} />
      <Text style={s.emptyRightText}>Sol panelden çalışan seçin</Text>
    </View>
  );

  // ── CSV İndir (dönem raporu) ─────────────────────────────────────────────
  function handleCsvExport() {
    if (primRows.length === 0) { toast.warning('Bu dönem için bordro kaydı yok.'); return; }
    const csvRows = primRows.map(r => {
      const net = hesaplaNet(Number(r.gross_salary), 0);
      return {
        isim:    r.employees?.full_name ?? '',
        tcNo:    r.employees?.tc_no ?? '',
        sgkNo:   r.employees?.sgk_sicil_no ?? '',
        primGun: 30,
        brut:    Number(r.gross_salary),
        net,
      };
    });
    const csv = sgkCsvExport(csvRows);
    downloadCsv(csv, `SGK_${period}.csv`);
  }

  return (
    <SafeAreaView style={s.safe} edges={safeEdges}>
      {/* Header */}
      <View style={[s.header, { paddingHorizontal: px }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>SGK İşlemleri</Text>
          <Text style={s.subtitle}>{employees.filter(e => e.is_active).length} aktif çalışan</Text>
        </View>
        <TouchableOpacity style={[s.csvBtn, { borderColor: accentColor }]} onPress={handleCsvExport}>
          <AppIcon name="download" size={14} color={accentColor} />
          <Text style={[s.csvBtnText, { color: accentColor }]}>CSV İndir</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.addBtn, { backgroundColor: accentColor }]}
          onPress={() => { if (!selectedId) { toast.warning('Önce çalışan seçin.'); return; } setBildirgeOpen(true); }}
        >
          <AppIcon name="plus" size={14} color="#fff" />
          <Text style={s.addBtnText}>Bildirge Ekle</Text>
        </TouchableOpacity>
      </View>

      {/* Body */}
      {isDesktop ? (
        <View style={s.body}>
          <View style={s.leftPanel}>{employeeList}</View>
          <View style={s.rightPanel}>{rightPanel}</View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {selectedId && selected ? (
            <View style={{ flex: 1 }}>
              <View style={[s.mobileBack, { paddingHorizontal: px }]}>
                <TouchableOpacity style={s.backBtn} onPress={() => setSelectedId(null)}>
                  <AppIcon name="chevron-left" size={20} color={accentColor} />
                  <Text style={[s.backText, { color: accentColor }]}>Geri</Text>
                </TouchableOpacity>
                <Text style={s.mobileEmpName} numberOfLines={1}>{selected.full_name}</Text>
              </View>
              {rightPanel}
            </View>
          ) : employeeList}
        </View>
      )}

      {/* Bildirge Ekleme Modal */}
      <BildirgeModal
        visible={bildirgeOpen}
        employeeId={selectedId}
        employeeName={selected?.full_name ?? ''}
        onClose={() => setBildirgeOpen(false)}
        onSaved={() => { setBildirgeOpen(false); refetchBil(); }}
        accentColor={accentColor}
      />
    </SafeAreaView>
  );
}

// ─── Sol Panel: Çalışan Listesi ───────────────────────────────────────────────
function EmployeeListPanel({
  employees, loading, selectedId, onSelect, accentColor, px,
}: {
  employees: SgkEmployee[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  accentColor: string;
  px: number;
}) {
  if (loading) return (
    <View style={s.centerLoader}>
      <ActivityIndicator size="large" color={accentColor} />
    </View>
  );

  const aktif  = employees.filter(e => e.is_active);
  const pasif  = employees.filter(e => !e.is_active);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: px, paddingBottom: 60, gap: 8 }}
      showsVerticalScrollIndicator={false}
    >
      {aktif.length > 0 && (
        <>
          <Text style={el.sectionLabel}>Aktif ({aktif.length})</Text>
          {aktif.map(emp => (
            <EmpRow key={emp.id} emp={emp} selected={emp.id === selectedId}
              onPress={() => onSelect(emp.id)} accentColor={accentColor} />
          ))}
        </>
      )}
      {pasif.length > 0 && (
        <>
          <Text style={[el.sectionLabel, { marginTop: 12 }]}>Pasif ({pasif.length})</Text>
          {pasif.map(emp => (
            <EmpRow key={emp.id} emp={emp} selected={emp.id === selectedId}
              onPress={() => onSelect(emp.id)} accentColor={accentColor} />
          ))}
        </>
      )}
    </ScrollView>
  );
}

function EmpRow({ emp, selected, onPress, accentColor }: {
  emp: SgkEmployee; selected: boolean; onPress: () => void; accentColor: string;
}) {
  const hasSgk   = !!emp.sgk_sicil_no;
  const hasTc    = !!emp.tc_no;
  const dotColor = !emp.is_active ? '#94A3B8' : hasSgk && hasTc ? '#059669' : '#F59E0B';
  const dotLabel = !emp.is_active ? 'Pasif' : hasSgk ? 'Kayıtlı' : 'Eksik bilgi';

  return (
    <TouchableOpacity
      style={[el.card, selected && { borderColor: accentColor, backgroundColor: accentColor + '08' }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {selected && <View style={[el.selectedBar, { backgroundColor: accentColor }]} />}
      <View style={el.info}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={el.name} numberOfLines={1}>{emp.full_name}</Text>
          <View style={[el.dot, { backgroundColor: dotColor }]} />
        </View>
        <Text style={el.sub}>{dotLabel} · {formatTL(emp.base_salary)}/ay</Text>
        {!hasTc && <Text style={el.warn}>⚠ TC kimlik eksik</Text>}
        {hasTc && !hasSgk && <Text style={el.warn}>⚠ SGK sicil eksik</Text>}
      </View>
      <AppIcon name="chevron-right" size={16} color={C.textMuted} />
    </TouchableOpacity>
  );
}

// ─── Sağ Panel ────────────────────────────────────────────────────────────────
function RightPanel({
  employee, tab, setTab, period, setPeriod,
  bildirge, loadingBildirge, onAddBildirge, onUpdateBildirgeDurum, onDeleteBildirge,
  primRows, loadingPrim,
  lab, onSaveBilgi, onSaveLabSgk,
  accentColor, px,
}: any) {
  const TABS = [
    { key: 'bildirge', label: 'Bildirge', icon: 'file-text' as const },
    { key: 'prim',     label: 'Prim',     icon: 'bar-chart-2' as const },
    { key: 'tazminat', label: 'Tazminat', icon: 'dollar-sign' as const },
    { key: 'bilgi',    label: 'Bilgi',    icon: 'edit-2' as const },
  ] as const;

  return (
    <View style={{ flex: 1 }}>
      {/* Employee header strip */}
      <View style={[rp.empHeader, { paddingHorizontal: px }]}>
        <View style={[rp.avatar, { backgroundColor: accentColor + '18' }]}>
          <Text style={[rp.avatarText, { color: accentColor }]}>
            {employee.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={rp.empName}>{employee.full_name}</Text>
          <Text style={rp.empSub}>İşe giriş: {fmtDate(employee.start_date)}</Text>
        </View>
        <View style={[rp.salaryBadge, { backgroundColor: accentColor + '12' }]}>
          <Text style={[rp.salaryText, { color: accentColor }]}>{formatTL(employee.base_salary)}</Text>
        </View>
      </View>

      {/* Tab bar */}
      <View style={[rp.tabBar, { paddingHorizontal: px }]}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[rp.tabBtn, tab === t.key && { borderBottomColor: accentColor, borderBottomWidth: 2 }]}
            onPress={() => setTab(t.key)}
          >
            <AppIcon name={t.icon} size={14} color={tab === t.key ? accentColor : C.textMuted} />
            <Text style={[rp.tabText, tab === t.key && { color: accentColor, fontFamily: F.bold }]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: px, paddingBottom: 60, gap: 14 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'bildirge' && (
          <BildirgeTab
            bildirge={bildirge}
            loading={loadingBildirge}
            onAdd={onAddBildirge}
            onUpdateDurum={onUpdateBildirgeDurum}
            onDelete={onDeleteBildirge}
            accentColor={accentColor}
          />
        )}
        {tab === 'prim' && (
          <PrimTab
            employee={employee}
            period={period}
            onPrev={() => setPeriod((p: string) => shiftPeriod(p, -1))}
            onNext={() => setPeriod((p: string) => shiftPeriod(p,  1))}
            accentColor={accentColor}
          />
        )}
        {tab === 'tazminat' && (
          <TazminatTab employee={employee} accentColor={accentColor} />
        )}
        {tab === 'bilgi' && (
          <BilgiTab
            employee={employee}
            lab={lab}
            onSave={onSaveBilgi}
            onSaveLabSgk={onSaveLabSgk}
            accentColor={accentColor}
          />
        )}
      </ScrollView>
    </View>
  );
}

// ─── Tab: Bildirge ────────────────────────────────────────────────────────────
function BildirgeTab({ bildirge, loading, onAdd, onUpdateDurum, onDelete, accentColor }: {
  bildirge: SgkBildirge[]; loading: boolean;
  onAdd: () => void;
  onUpdateDurum: (id: string, d: BildirgeDurum) => void;
  onDelete: (id: string) => void;
  accentColor: string;
}) {
  if (loading) return <ActivityIndicator color={accentColor} style={{ marginTop: 40 }} />;

  const giris = bildirge.filter(b => b.tip === 'giris');
  const cikis = bildirge.filter(b => b.tip === 'cikis');

  return (
    <>
      {/* İşe Giriş */}
      <View style={card.box}>
        <View style={card.titleRow}>
          <AppIcon name="log-in" size={15} color="#059669" />
          <Text style={card.title}>İşe Giriş Bildirgeleri</Text>
        </View>
        {giris.length === 0 ? (
          <Text style={card.empty}>Henüz bildirge yok</Text>
        ) : giris.map(b => <BildirgeRow key={b.id} b={b} onUpdateDurum={onUpdateDurum} onDelete={onDelete} />)}
      </View>

      {/* İşten Çıkış */}
      <View style={card.box}>
        <View style={card.titleRow}>
          <AppIcon name="log-out" size={15} color="#DC2626" />
          <Text style={card.title}>İşten Çıkış Bildirgeleri</Text>
        </View>
        {cikis.length === 0 ? (
          <Text style={card.empty}>Henüz bildirge yok</Text>
        ) : cikis.map(b => <BildirgeRow key={b.id} b={b} onUpdateDurum={onUpdateDurum} onDelete={onDelete} />)}
      </View>

      {/* Info card */}
      <View style={card.infoBox}>
        <AppIcon name="info" size={14} color={accentColor} />
        <Text style={[card.infoText, { color: accentColor + 'CC' }]}>
          SGK e-Bildirge sistemine giriş yaparak bildirgeyi yükledikten sonra durumu
          "Gönderildi" olarak işaretleyin.
        </Text>
      </View>

      <TouchableOpacity style={[s.footerBtn, { borderColor: accentColor, backgroundColor: accentColor + '0C' }]} onPress={onAdd}>
        <AppIcon name="plus" size={14} color={accentColor} />
        <Text style={[s.footerBtnText, { color: accentColor }]}>Bildirge Ekle</Text>
      </TouchableOpacity>
    </>
  );
}

function BildirgeRow({ b, onUpdateDurum, onDelete }: {
  b: SgkBildirge;
  onUpdateDurum: (id: string, d: BildirgeDurum) => void;
  onDelete: (id: string) => void;
}) {
  const cfg = DURUM_CFG[b.durum];
  const isGiris = b.tip === 'giris';

  return (
    <View style={br.row}>
      <View style={br.dateCol}>
        <AppIcon name={isGiris ? 'log-in' : 'log-out'} size={13} color={isGiris ? '#059669' : '#DC2626'} />
        <View>
          <Text style={br.date}>{fmtDate(isGiris ? b.ise_baslama : b.ayrilma_tarihi)}</Text>
          <Text style={br.type}>{isGiris ? 'Giriş' : 'Çıkış'}</Text>
        </View>
      </View>

      {!isGiris && b.cikis_kodu && (
        <Text style={br.kod}>Kod {b.cikis_kodu}</Text>
      )}

      {/* Durum seçici */}
      <View style={{ flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {(['bekliyor', 'gonderildi', 'onaylandi'] as BildirgeDurum[]).map(d => (
          <TouchableOpacity
            key={d}
            style={[br.durumChip,
              b.durum === d
                ? { backgroundColor: DURUM_CFG[d].bg, borderColor: DURUM_CFG[d].fg }
                : { borderColor: C.borderMid, backgroundColor: '#fff' },
            ]}
            onPress={() => b.durum !== d && onUpdateDurum(b.id, d)}
          >
            <Text style={[br.durumText, { color: b.durum === d ? DURUM_CFG[d].fg : C.textMuted }]}>
              {DURUM_CFG[d].label}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={br.delBtn} onPress={() => onDelete(b.id)}>
          <AppIcon name="trash-2" size={12} color={C.textDisabled} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Tab: Prim Hesabı ─────────────────────────────────────────────────────────
function PrimTab({ employee, period, onPrev, onNext, accentColor }: {
  employee: SgkEmployee; period: string;
  onPrev: () => void; onNext: () => void; accentColor: string;
}) {
  const [kumulatif, setKumulatif] = useState(0);
  const [loading, setLoading]    = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchKumulatifGvMatrah(employee.id, period).then(k => {
      setKumulatif(k);
      setLoading(false);
    });
  }, [employee.id, period]);

  const net = useMemo(() => hesaplaNet(employee.base_salary, kumulatif), [employee.base_salary, kumulatif]);
  const [y, m] = period.split('-').map(Number);

  if (loading) return <ActivityIndicator color={accentColor} style={{ marginTop: 40 }} />;

  const SGK_TAVAN = SGK_PARAMS.asgariUcret * SGK_PARAMS.sgkTavanKatsayi;
  const isTavanUstunde = employee.base_salary > SGK_TAVAN;

  return (
    <>
      {/* Dönem seçici */}
      <View style={pr.monthRow}>
        <TouchableOpacity style={pr.arrow} onPress={onPrev}>
          <AppIcon name="chevron-left" size={18} color={C.textSecondary} />
        </TouchableOpacity>
        <Text style={pr.monthLabel}>{fmtPeriod(period)}</Text>
        <TouchableOpacity style={pr.arrow} onPress={onNext}>
          <AppIcon name="chevron-right" size={18} color={C.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Net maaş özet */}
      <View style={[pr.netCard, { borderColor: accentColor + '30', backgroundColor: accentColor + '06' }]}>
        <View style={pr.netRow}>
          <Text style={pr.netLabel}>Brüt Maaş</Text>
          <Text style={[pr.netVal, { color: C.textPrimary }]}>{formatTL(net.brut)}</Text>
        </View>
        <View style={[pr.divider, { backgroundColor: accentColor + '20' }]} />
        <View style={pr.netRow}>
          <Text style={pr.netLabel}>Toplam Kesinti</Text>
          <Text style={[pr.netVal, { color: '#DC2626' }]}>— {formatTL(net.toplamIsciKesinti)}</Text>
        </View>
        <View style={[pr.divider, { backgroundColor: accentColor + '20' }]} />
        <View style={pr.netRow}>
          <Text style={[pr.netLabel, { fontFamily: F.bold, fontSize: FS.md }]}>NET MAAŞ</Text>
          <Text style={[pr.netVal, { color: accentColor, fontSize: FS.xl, fontFamily: F.bold }]}>
            {formatTL(net.net)}
          </Text>
        </View>
      </View>

      {isTavanUstunde && (
        <View style={pr.tavanUyari}>
          <AppIcon name="alert-circle" size={13} color="#D97706" />
          <Text style={pr.tavanUyariText}>
            Maaş SGK tavanını ({formatTL(SGK_TAVAN)}) aşıyor. SGK primi tavan üzerinden hesaplanır.
          </Text>
        </View>
      )}

      {/* İŞÇİ Kesintileri */}
      <SectionCard title="İşçi Kesintileri" icon="minus-circle" iconColor="#DC2626">
        <PrimRow label={`SGK İşçi (%${(SGK_PARAMS.sgkIsci * 100).toFixed(0)})`}
          value={net.sgkIsci} color="#DC2626" />
        <PrimRow label={`İşsizlik Sigorta İşçi (%${(SGK_PARAMS.issizlikIsci * 100).toFixed(0)})`}
          value={net.issizlikIsci} color="#DC2626" />
        <PrimRow label="Gelir Vergisi (dilimli)" value={net.gelirVergisi} color="#DC2626"
          sub={kumulatif > 0 ? `Kümülatif matrah: ${formatTL(kumulatif)}` : undefined} />
        <PrimRow label={`Damga Vergisi (%${(SGK_PARAMS.damga * 100).toFixed(3)})`}
          value={net.damgaVergisi} color="#DC2626" />
        <View style={pr.totalRow}>
          <Text style={pr.totalLabel}>Toplam İşçi Kesintisi</Text>
          <Text style={pr.totalVal}>{formatTL(net.toplamIsciKesinti)}</Text>
        </View>
      </SectionCard>

      {/* İŞVEREN Yükü */}
      <SectionCard title="İşveren Yükü" icon="plus-circle" iconColor="#059669">
        <PrimRow label={`SGK İşveren (%${(SGK_PARAMS.sgkIsveren * 100).toFixed(1)})`}
          value={net.sgkIsveren} color="#059669" />
        <PrimRow label={`İşsizlik Sigorta İşveren (%${(SGK_PARAMS.issizlikIsveren * 100).toFixed(0)})`}
          value={net.issizlikIsveren} color="#059669" />
        <View style={pr.totalRow}>
          <Text style={pr.totalLabel}>Toplam İşveren Maliyeti</Text>
          <Text style={[pr.totalVal, { color: '#059669' }]}>{formatTL(net.toplamIsverenMaliyet)}</Text>
        </View>
      </SectionCard>

      {/* SGK Matrahı */}
      <View style={pr.matrahRow}>
        <Text style={pr.matrahLabel}>SGK Matrahı</Text>
        <Text style={pr.matrahVal}>{formatTL(net.sgkMatrah)}</Text>
        <Text style={pr.matrahSub}>
          {primGunSayisi(period, employee.start_date, employee.end_date ?? undefined)} prim günü
        </Text>
      </View>
    </>
  );
}

function SectionCard({ title, icon, iconColor, children }: {
  title: string; icon: any; iconColor: string; children: React.ReactNode;
}) {
  return (
    <View style={card.box}>
      <View style={card.titleRow}>
        <AppIcon name={icon} size={15} color={iconColor} />
        <Text style={card.title}>{title}</Text>
      </View>
      <View style={{ gap: 6 }}>{children}</View>
    </View>
  );
}

function PrimRow({ label, value, color, sub }: {
  label: string; value: number; color: string; sub?: string;
}) {
  return (
    <View>
      <View style={pr.primRow}>
        <Text style={pr.primLabel}>{label}</Text>
        <Text style={[pr.primVal, { color }]}>{formatTL(value)}</Text>
      </View>
      {sub && <Text style={pr.primSub}>{sub}</Text>}
    </View>
  );
}

// ─── Tab: Kıdem/İhbar Tazminat ────────────────────────────────────────────────
function TazminatTab({ employee, accentColor }: { employee: SgkEmployee; accentColor: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [cikisTarihi, setCikisTarihi] = useState(today);
  const [calculated, setCalculated]   = useState(false);

  const result = useMemo(() => {
    if (!calculated || !cikisTarihi || cikisTarihi.length !== 10) return null;
    return hesaplaTazminat(employee.base_salary, employee.start_date, cikisTarihi);
  }, [calculated, cikisTarihi, employee.base_salary, employee.start_date]);

  return (
    <>
      <View style={card.box}>
        <View style={card.titleRow}>
          <AppIcon name="clock" size={15} color={accentColor} />
          <Text style={card.title}>Tazminat Hesaplayıcı</Text>
        </View>
        <Text style={tz.sub}>
          İşe başlama: {fmtDate(employee.start_date)} · Brüt maaş: {formatTL(employee.base_salary)}
        </Text>

        <Text style={tz.label}>İşten Ayrılış Tarihi</Text>
        <TextInput
          style={tz.input}
          value={cikisTarihi}
          onChangeText={t => { setCikisTarihi(t); setCalculated(false); }}
          placeholder="YYYY-AA-GG"
          placeholderTextColor={C.textMuted}
        />

        <TouchableOpacity
          style={[tz.calcBtn, { backgroundColor: accentColor }]}
          onPress={() => {
            if (cikisTarihi.length !== 10) { toast.error('Geçerli tarih girin.'); return; }
            if (cikisTarihi <= employee.start_date) { toast.error('Çıkış tarihi başlangıçtan sonra olmalı.'); return; }
            setCalculated(true);
          }}
        >
          <AppIcon name="hash" size={15} color="#fff" />
          <Text style={tz.calcBtnText}>Hesapla</Text>
        </TouchableOpacity>
      </View>

      {result && (
        <>
          {/* Çalışma süresi */}
          <View style={card.box}>
            <View style={card.titleRow}>
              <AppIcon name="briefcase" size={15} color={accentColor} />
              <Text style={card.title}>Çalışma Süresi</Text>
            </View>
            <View style={tz.statRow}>
              <TazminatStat label="Yıl" value={String(result.kidemYil)} color={accentColor} />
              <TazminatStat label="Ay" value={String(result.kidemAy)} color={accentColor} />
              <TazminatStat label="Gün" value={String(result.kidemGun)} color={accentColor} />
            </View>
          </View>

          {/* Kıdem Tazminatı */}
          <View style={card.box}>
            <View style={card.titleRow}>
              <AppIcon name="award" size={15} color="#059669" />
              <Text style={card.title}>Kıdem Tazminatı</Text>
            </View>
            <TazminatRow label="Tazminat tutarı" value={result.kidemBrut} />
            <TazminatRow label="Net (SGK+Vergi muaf)" value={result.kidemNet} isNet />
            <View style={tz.tavan}>
              <AppIcon name="info" size={11} color={C.textMuted} />
              <Text style={tz.tavanText}>
                Tavan: {formatTL(SGK_PARAMS.kidemTavani)}/yıl · Kıdem tazminatı vergiden muaftır.
              </Text>
            </View>
          </View>

          {/* İhbar Tazminatı */}
          <View style={card.box}>
            <View style={card.titleRow}>
              <AppIcon name="bell" size={15} color="#D97706" />
              <Text style={card.title}>İhbar Tazminatı</Text>
            </View>
            <TazminatRow label={`İhbar süresi: ${result.ihbarHaftasi} hafta`} value={result.ihbarBrut} />
            <TazminatRow label="SGK işçi kesintisi" value={-result.ihbarSgkIsci} />
            <TazminatRow label="Gelir vergisi" value={-result.ihbarGv} />
            <TazminatRow label="Net İhbar" value={result.ihbarNet} isNet />
          </View>

          {/* Toplam */}
          <View style={[card.box, { backgroundColor: accentColor + '08', borderColor: accentColor + '30' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[card.title, { fontSize: FS.lg }]}>Toplam Tazminat (Net)</Text>
              <Text style={{ fontFamily: F.bold, fontSize: FS.xl, color: accentColor }}>
                {formatTL(result.toplam)}
              </Text>
            </View>
          </View>
        </>
      )}
    </>
  );
}

function TazminatStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[tz.statCell, { borderTopColor: color }]}>
      <Text style={[tz.statVal, { color }]}>{value}</Text>
      <Text style={tz.statLabel}>{label}</Text>
    </View>
  );
}

function TazminatRow({ label, value, isNet = false }: { label: string; value: number; isNet?: boolean }) {
  const isNeg = value < 0;
  return (
    <View style={tz.row}>
      <Text style={[tz.rowLabel, isNet && { fontFamily: F.bold }]}>{label}</Text>
      <Text style={[tz.rowVal, isNeg && { color: '#DC2626' }, isNet && { color: '#059669', fontFamily: F.bold }]}>
        {isNeg ? '— ' : ''}{formatTL(Math.abs(value))}
      </Text>
    </View>
  );
}

// ─── Tab: Bilgi ───────────────────────────────────────────────────────────────
function BilgiTab({ employee, lab, onSave, onSaveLabSgk, accentColor }: {
  employee: SgkEmployee; lab: any;
  onSave: (d: any) => void; onSaveLabSgk: (no: string) => void;
  accentColor: string;
}) {
  const [tc,    setTc]    = useState(employee.tc_no        ?? '');
  const [sicil, setSicil] = useState(employee.sgk_sicil_no ?? '');
  const [tescil,setTescil]= useState(employee.sgk_tescil_tarihi ?? '');
  const [isyeri,setIsyeri]= useState(lab?.sgk_isyeri_no   ?? '');
  const [saving, setSaving] = useState(false);

  // Reset when employee changes
  useEffect(() => {
    setTc(employee.tc_no ?? '');
    setSicil(employee.sgk_sicil_no ?? '');
    setTescil(employee.sgk_tescil_tarihi ?? '');
  }, [employee.id]);

  useEffect(() => { setIsyeri(lab?.sgk_isyeri_no ?? ''); }, [lab]);

  async function handleSave() {
    if (tc && tc.length !== 11) { toast.error('TC kimlik 11 haneli olmalı.'); return; }
    setSaving(true);
    await onSave({
      tc_no:             tc.trim()    || null,
      sgk_sicil_no:      sicil.trim() || null,
      sgk_tescil_tarihi: tescil.trim() || null,
    });
    setSaving(false);
  }

  async function handleSaveLabSgk() {
    if (!isyeri.trim()) { toast.error('İşyeri SGK no boş olamaz.'); return; }
    setSaving(true);
    await onSaveLabSgk(isyeri.trim());
    setSaving(false);
  }

  return (
    <>
      <View style={card.box}>
        <View style={card.titleRow}>
          <AppIcon name="user" size={15} color={accentColor} />
          <Text style={card.title}>Çalışan SGK Bilgileri</Text>
        </View>

        <FormField label="TC Kimlik No" value={tc} onChange={setTc}
          placeholder="12345678901" keyboard="number-pad" maxLength={11} />
        <FormField label="SGK Sigortalı Sicil No" value={sicil} onChange={setSicil}
          placeholder="5150..." keyboard="number-pad" />
        <FormField label="SGK İlk Tescil Tarihi" value={tescil} onChange={setTescil}
          placeholder="YYYY-AA-GG" />

        <TouchableOpacity
          style={[bi.saveBtn, { backgroundColor: accentColor }, saving && { opacity: 0.6 }]}
          onPress={handleSave} disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <AppIcon name="save" size={15} color="#fff" />}
          <Text style={bi.saveBtnText}>Çalışan Bilgilerini Kaydet</Text>
        </TouchableOpacity>
      </View>

      <View style={card.box}>
        <View style={card.titleRow}>
          <AppIcon name="briefcase" size={15} color={accentColor} />
          <Text style={card.title}>İşyeri SGK Bilgileri</Text>
        </View>
        <FormField label="İşyeri SGK Sicil Numarası" value={isyeri} onChange={setIsyeri}
          placeholder="1234567890" keyboard="number-pad" />
        <TouchableOpacity
          style={[bi.saveBtn, { backgroundColor: '#475569' }, saving && { opacity: 0.6 }]}
          onPress={handleSaveLabSgk} disabled={saving}
        >
          <AppIcon name="save" size={15} color="#fff" />
          <Text style={bi.saveBtnText}>İşyeri Numarasını Kaydet</Text>
        </TouchableOpacity>
      </View>

      {/* Oranlar referans kartı */}
      <View style={card.box}>
        <View style={card.titleRow}>
          <AppIcon name="percent" size={15} color={C.textSecondary} />
          <Text style={card.title}>2025 SGK Oranları (Referans)</Text>
        </View>
        {[
          ['SGK İşçi Payı',         '%14'],
          ['SGK İşveren Payı',      '%20,5'],
          ['İşsizlik İşçi',         '%1'],
          ['İşsizlik İşveren',      '%2'],
          ['Damga Vergisi',         '%0,759'],
          ['SGK Tavan (×7,5 Asg.)', formatTL(SGK_PARAMS.asgariUcret * SGK_PARAMS.sgkTavanKatsayi)],
          ['Kıdem Tazminatı Tavanı', formatTL(SGK_PARAMS.kidemTavani)],
        ].map(([l, v]) => (
          <View key={l} style={bi.rateRow}>
            <Text style={bi.rateLabel}>{l}</Text>
            <Text style={bi.rateVal}>{v}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

function FormField({ label, value, onChange, placeholder, keyboard = 'default', maxLength }: {
  label: string; value: string; onChange: (t: string) => void;
  placeholder: string; keyboard?: any; maxLength?: number;
}) {
  return (
    <View style={{ gap: 4, marginBottom: 10 }}>
      <Text style={bi.fieldLabel}>{label}</Text>
      <TextInput
        style={bi.input}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        keyboardType={keyboard}
        maxLength={maxLength}
      />
    </View>
  );
}

// ─── Bildirge Modal ───────────────────────────────────────────────────────────
function BildirgeModal({ visible, employeeId, employeeName, onClose, onSaved, accentColor }: {
  visible: boolean; employeeId: string | null; employeeName: string;
  onClose: () => void; onSaved: () => void; accentColor: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [tip, setTip]         = useState<'giris' | 'cikis'>('giris');
  const [tarih, setTarih]     = useState(today);
  const [bildTarih,setBild]   = useState(today);
  const [cikisKod, setCikisKod]= useState('01');
  const [notlar, setNotlar]   = useState('');
  const [saving, setSaving]   = useState(false);

  useEffect(() => { if (visible) { setTip('giris'); setTarih(today); setBild(today); setCikisKod('01'); setNotlar(''); } }, [visible]);

  async function handleSave() {
    if (!employeeId) return;
    if (!tarih || tarih.length !== 10) { toast.error('Geçerli tarih girin.'); return; }
    setSaving(true);
    try {
      const { error } = await createBildirge({
        employee_id:    employeeId,
        tip,
        ise_baslama:    tip === 'giris' ? tarih : undefined,
        ayrilma_tarihi: tip === 'cikis' ? tarih : undefined,
        cikis_kodu:     tip === 'cikis' ? cikisKod : undefined,
        bildirim_tarihi: bildTarih,
        notlar:         notlar.trim() || undefined,
      });
      if (error) throw error;
      toast.success('Bildirge kaydedildi.');
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? 'Kaydedilemedi.'); }
    finally { setSaving(false); }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={bm.overlay}>
        <View style={bm.card}>
          <View style={bm.header}>
            <Text style={bm.title}>Bildirge Ekle</Text>
            <Text style={bm.sub}>{employeeName}</Text>
            <TouchableOpacity style={bm.closeBtn} onPress={onClose}>
              <AppIcon name="x" size={18} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={bm.body} keyboardShouldPersistTaps="handled">
            {/* Tip */}
            <Text style={bm.label}>Bildirge Türü</Text>
            <View style={bm.tipRow}>
              {(['giris', 'cikis'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[bm.tipBtn, tip === t && { backgroundColor: accentColor, borderColor: accentColor }]}
                  onPress={() => setTip(t)}
                >
                  <AppIcon name={t === 'giris' ? 'log-in' : 'log-out'} size={14}
                    color={tip === t ? '#fff' : C.textSecondary} />
                  <Text style={[bm.tipBtnText, tip === t && { color: '#fff' }]}>
                    {t === 'giris' ? 'İşe Giriş' : 'İşten Çıkış'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Tarih */}
            <Text style={bm.label}>{tip === 'giris' ? 'İşe Başlama Tarihi' : 'Ayrılış Tarihi'} *</Text>
            <TextInput style={bm.input} value={tarih} onChangeText={setTarih}
              placeholder="YYYY-AA-GG" placeholderTextColor={C.textMuted} />

            {/* Çıkış kodu */}
            {tip === 'cikis' && (
              <>
                <Text style={bm.label}>SGK Çıkış Kodu *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {CIKIS_KODLARI.map(ck => (
                      <TouchableOpacity
                        key={ck.kod}
                        style={[bm.kodChip, cikisKod === ck.kod && { backgroundColor: accentColor + '15', borderColor: accentColor }]}
                        onPress={() => setCikisKod(ck.kod)}
                      >
                        <Text style={[bm.kodChipKod, cikisKod === ck.kod && { color: accentColor }]}>
                          {ck.kod}
                        </Text>
                        <Text style={bm.kodChipAciklama} numberOfLines={2}>{ck.aciklama}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Bildirim tarihi */}
            <Text style={bm.label}>Bildirim Tarihi</Text>
            <TextInput style={bm.input} value={bildTarih} onChangeText={setBild}
              placeholder="YYYY-AA-GG" placeholderTextColor={C.textMuted} />

            {/* Notlar */}
            <Text style={bm.label}>Notlar (opsiyonel)</Text>
            <TextInput
              style={[bm.input, { minHeight: 52, textAlignVertical: 'top' }]}
              value={notlar} onChangeText={setNotlar}
              placeholder="Ek bilgi..." placeholderTextColor={C.textMuted}
              multiline
            />
          </ScrollView>

          <View style={bm.footer}>
            <TouchableOpacity style={bm.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={bm.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[bm.saveBtn, { backgroundColor: accentColor }, saving && { opacity: 0.5 }]}
              onPress={handleSave} disabled={saving}
            >
              {saving ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={bm.saveText}>Kaydet</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: '#fff' },
  header:       { flexDirection: 'row', alignItems: 'center', paddingTop: 18, paddingBottom: 10, gap: 8 },
  title:        { fontFamily: F.bold, fontSize: FS.xl, color: C.textPrimary, letterSpacing: -0.3 },
  subtitle:     { fontFamily: F.regular, fontSize: FS.sm, color: C.textSecondary, marginTop: 2 },
  body:         { flex: 1, flexDirection: 'row' },
  leftPanel:    { width: 300, borderRightWidth: 1, borderRightColor: C.border, backgroundColor: '#fff' },
  rightPanel:   { flex: 1, backgroundColor: '#FAFBFC' },
  emptyRight:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyRightText: { fontFamily: F.semibold, fontSize: FS.md, color: C.textMuted },
  centerLoader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  csvBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5 },
  csvBtnText:   { fontFamily: F.semibold, fontSize: FS.sm },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  addBtnText:   { fontFamily: F.bold, fontSize: FS.sm, color: '#fff' },
  footerBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, marginTop: 4 },
  footerBtnText:{ fontFamily: F.bold, fontSize: FS.sm },
  mobileBack:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:      { flexDirection: 'row', alignItems: 'center' },
  backText:     { fontFamily: F.semibold, fontSize: FS.md },
  mobileEmpName:{ flex: 1, fontFamily: F.bold, fontSize: FS.md, color: C.textPrimary },
});

const el = StyleSheet.create({
  card:         { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  selectedBar:  { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  info:         { flex: 1, gap: 3 },
  name:         { fontFamily: F.semibold, fontSize: FS.sm, color: C.textPrimary },
  sub:          { fontFamily: F.regular, fontSize: FS.xs, color: C.textSecondary },
  warn:         { fontFamily: F.regular, fontSize: FS.xs, color: '#D97706' },
  dot:          { width: 8, height: 8, borderRadius: 4 },
  sectionLabel: { fontFamily: F.semibold, fontSize: FS.xs, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
});

const rp = StyleSheet.create({
  empHeader:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: '#fff' },
  avatar:       { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { fontFamily: F.bold, fontSize: FS.md },
  empName:      { fontFamily: F.bold, fontSize: FS.md, color: C.textPrimary },
  empSub:       { fontFamily: F.regular, fontSize: FS.xs, color: C.textSecondary, marginTop: 2 },
  salaryBadge:  { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  salaryText:   { fontFamily: F.bold, fontSize: FS.sm },
  tabBar:       { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: '#fff', paddingTop: 4 },
  tabBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:      { fontFamily: F.semibold, fontSize: FS.xs, color: C.textMuted },
});

const card = StyleSheet.create({
  box:          { backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#F1F5F9', gap: 10 },
  titleRow:     { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title:        { fontFamily: F.bold, fontSize: FS.md, color: C.textPrimary },
  empty:        { fontFamily: F.regular, fontSize: FS.sm, color: C.textMuted, textAlign: 'center', paddingVertical: 12 },
  infoBox:      { flexDirection: 'row', gap: 8, backgroundColor: '#F0F9FF', borderRadius: 12, padding: 14 },
  infoText:     { fontFamily: F.regular, fontSize: FS.sm, flex: 1, lineHeight: 19 },
});

const br = StyleSheet.create({
  row:          { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border, flexWrap: 'wrap' },
  dateCol:      { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 100 },
  date:         { fontFamily: F.semibold, fontSize: FS.sm, color: C.textPrimary },
  type:         { fontFamily: F.regular, fontSize: FS.xs, color: C.textSecondary },
  kod:          { fontFamily: F.semibold, fontSize: FS.xs, color: C.textSecondary, backgroundColor: C.border, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  durumChip:    { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  durumText:    { fontFamily: F.semibold, fontSize: FS.xs },
  delBtn:       { width: 26, height: 26, borderRadius: 7, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
});

const pr = StyleSheet.create({
  monthRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 4 },
  arrow:        { width: 36, height: 36, borderRadius: 10, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  monthLabel:   { fontFamily: F.bold, fontSize: FS.md, color: C.textPrimary, minWidth: 130, textAlign: 'center' },
  netCard:      { borderRadius: 16, padding: 18, borderWidth: 1, gap: 10 },
  netRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netLabel:     { fontFamily: F.semibold, fontSize: FS.sm, color: C.textSecondary },
  netVal:       { fontFamily: F.bold, fontSize: FS.lg },
  divider:      { height: 1 },
  tavanUyari:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: '#FEF9C3', borderRadius: 10, padding: 10 },
  tavanUyariText:{ fontFamily: F.regular, fontSize: FS.xs, color: '#92400E', flex: 1, lineHeight: 17 },
  primRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  primLabel:    { fontFamily: F.regular, fontSize: FS.sm, color: C.textSecondary, flex: 1 },
  primVal:      { fontFamily: F.semibold, fontSize: FS.sm },
  primSub:      { fontFamily: F.regular, fontSize: FS.xs, color: C.textMuted, marginTop: 2, marginLeft: 4 },
  totalRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border },
  totalLabel:   { fontFamily: F.bold, fontSize: FS.sm, color: C.textPrimary },
  totalVal:     { fontFamily: F.bold, fontSize: FS.md, color: C.textPrimary },
  matrahRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.border, borderRadius: 12, padding: 14 },
  matrahLabel:  { fontFamily: F.semibold, fontSize: FS.sm, color: C.textSecondary, flex: 1 },
  matrahVal:    { fontFamily: F.bold, fontSize: FS.md, color: C.textPrimary },
  matrahSub:    { fontFamily: F.regular, fontSize: FS.xs, color: C.textMuted },
});

const tz = StyleSheet.create({
  sub:          { fontFamily: F.regular, fontSize: FS.sm, color: C.textSecondary },
  label:        { fontFamily: F.semibold, fontSize: FS.xs, color: C.textSecondary, marginBottom: 4, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.3 },
  input:        { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontFamily: F.regular, fontSize: FS.md, color: C.textPrimary, backgroundColor: '#F8FAFC' },
  calcBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, paddingVertical: 13, marginTop: 8 },
  calcBtnText:  { fontFamily: F.bold, fontSize: FS.md, color: '#fff' },
  statRow:      { flexDirection: 'row', gap: 10 },
  statCell:     { flex: 1, borderRadius: 10, backgroundColor: C.border, padding: 12, alignItems: 'center', gap: 4, borderTopWidth: 3 },
  statVal:      { fontFamily: F.bold, fontSize: FS['2xl'] },
  statLabel:    { fontFamily: F.regular, fontSize: FS.xs, color: C.textSecondary },
  row:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.border },
  rowLabel:     { fontFamily: F.regular, fontSize: FS.sm, color: C.textSecondary, flex: 1 },
  rowVal:       { fontFamily: F.semibold, fontSize: FS.sm, color: C.textPrimary },
  tavan:        { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 4 },
  tavanText:    { fontFamily: F.regular, fontSize: FS.xs, color: C.textMuted, flex: 1, lineHeight: 16 },
});

const bi = StyleSheet.create({
  fieldLabel:   { fontFamily: F.semibold, fontSize: FS.xs, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  input:        { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontFamily: F.regular, fontSize: FS.md, color: C.textPrimary, backgroundColor: '#F8FAFC' },
  saveBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, paddingVertical: 13, marginTop: 8 },
  saveBtnText:  { fontFamily: F.bold, fontSize: FS.sm, color: '#fff' },
  rateRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.border },
  rateLabel:    { fontFamily: F.regular, fontSize: FS.sm, color: C.textSecondary },
  rateVal:      { fontFamily: F.bold, fontSize: FS.sm, color: C.textPrimary },
});

const bm = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card:         { backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, maxHeight: '92%', overflow: 'hidden' },
  header:       { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  title:        { fontFamily: F.bold, fontSize: FS.lg, color: C.textPrimary },
  sub:          { fontFamily: F.regular, fontSize: FS.sm, color: C.textSecondary, marginTop: 2 },
  closeBtn:     { position: 'absolute', right: 16, top: 16, width: 28, height: 28, borderRadius: 8, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  body:         { padding: 20, gap: 4 },
  label:        { fontFamily: F.semibold, fontSize: FS.xs, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6, marginTop: 10 },
  input:        { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontFamily: F.regular, fontSize: FS.md, color: C.textPrimary, backgroundColor: '#F8FAFC' },
  tipRow:       { flexDirection: 'row', gap: 10 },
  tipBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: C.borderMid },
  tipBtnText:   { fontFamily: F.semibold, fontSize: FS.sm, color: C.textSecondary },
  kodChip:      { width: 150, borderRadius: 10, borderWidth: 1, borderColor: C.borderMid, padding: 10, gap: 4 },
  kodChipKod:   { fontFamily: F.bold, fontSize: FS.lg, color: C.textPrimary },
  kodChipAciklama:{ fontFamily: F.regular, fontSize: FS.xs, color: C.textSecondary, lineHeight: 15 },
  footer:       { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: C.border },
  cancelBtn:    { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, borderColor: C.borderMid, alignItems: 'center' },
  cancelText:   { fontFamily: F.semibold, fontSize: FS.sm, color: C.textSecondary },
  saveBtn:      { flex: 2, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveText:     { fontFamily: F.bold, fontSize: FS.md, color: '#fff' },
});
