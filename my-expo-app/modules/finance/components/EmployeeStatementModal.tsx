/**
 * EmployeeStatementModal — Çalışan hesap dökümü (maaş + avans, kronolojik).
 *
 * NEDEN "cari bakiye" DEĞİL: Sistemde maaş TAHAKKUKU (hakediş) kaydı yok —
 * yalnızca yapılan ödemeler (salary_payments) ve avanslar (employee_advances)
 * tutuluyor. Borç/alacak bakiyesi ancak tahakkuk varsa hesaplanabilir;
 * `base_salary × çalışılan ay` ile üretmek işe başlama tarihi, izinsiz günler,
 * zam geçmişi ve kısmi aylar yüzünden yanlış rakam verir. Bu yüzden ekran
 * bilerek "hesap dökümü": ne zaman ne ödendiği + yürüyen toplam.
 *
 * KATI PER-CURRENCY: tutarlar kendi para biriminde kalır, çevrilip toplanmaz
 * (projenin finans kuralı). Birden çok para birimi varsa üstte sekme çıkar ve
 * her sekme kendi dökümünü/yürüyen toplamını gösterir.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, Platform } from 'react-native';
import { X, Printer, Wallet, Banknote } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { buildCariStatementHtml, type CariLine } from '../../../core/util/buildCariStatementHtml';
import { DS } from '../../../core/theme/dsTokens';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { useAuthStore } from '../../../core/store/authStore';

const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300' as const };

const MONTHS = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

export interface StatementEmployee {
  id: string;
  full_name: string;
  role?: string | null;
  base_salary?: number | null;
  phone?: string | null;
  email?: string | null;
  start_date?: string | null;
}

/** Tek satır — maaş ya da avans. */
interface Entry {
  id: string;
  kind: 'salary' | 'advance';
  date: string;
  amount: number;
  currency: string;
  label: string;
  sub?: string | null;
}

interface LabLetterhead {
  name: string; logo_url?: string | null; address?: string | null;
  phone?: string | null; email?: string | null; tax_number?: string | null;
}

export function EmployeeStatementModal({
  employee, onClose,
}: { employee: StatementEmployee; onClose: () => void }) {
  const T = useMobileTokens();
  const primary = usePanelTheme().primary;
  const labId = useAuthStore(st => (st.profile as any)?.lab_id) as string | undefined;

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ccy, setCcy] = useState<string | null>(null);
  // Antet — belgede lab logosu/adresi görünsün diye. Boş bırakılırsa çıktıda
  // yalnız "LABORATUVAR" yazıyordu.
  const [lab, setLab] = useState<LabLetterhead | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [payRes, advRes] = await Promise.all([
        supabase.from('salary_payments')
          .select('id, payment_date, net_amount, gross_amount, currency, period_month, period_year, payment_method, notes')
          .eq('employee_id', employee.id)
          .order('payment_date', { ascending: true }),
        supabase.from('employee_advances')
          .select('id, advance_date, amount, currency, description, is_deducted')
          .eq('employee_id', employee.id)
          .order('advance_date', { ascending: true }),
      ]);
      if (!alive) return;

      const rows: Entry[] = [
        ...((payRes.data ?? []) as any[]).map(p => ({
          id: `s-${p.id}`,
          kind: 'salary' as const,
          date: p.payment_date,
          amount: Number(p.net_amount) || 0,
          currency: p.currency || 'TRY',
          label: `${MONTHS[(p.period_month ?? 1) - 1] ?? ''} ${p.period_year ?? ''} maaşı`.trim(),
          sub: [p.payment_method, p.notes].filter(Boolean).join(' · ') || null,
        })),
        ...((advRes.data ?? []) as any[]).map(a => ({
          id: `a-${a.id}`,
          kind: 'advance' as const,
          date: a.advance_date,
          amount: Number(a.amount) || 0,
          currency: a.currency || 'TRY',
          label: 'Avans',
          sub: [a.description, a.is_deducted ? 'maaştan kesildi' : 'kesilmedi'].filter(Boolean).join(' · ') || null,
        })),
      ].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

      setEntries(rows);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [employee.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      // labs RLS ile zaten kullanıcının kendi lab'ına kısıtlı. Daha önce
      // `if (!labId) return` ile bekleniyordu; profil geç geldiğinde antet boş
      // kalıp belgede "LABORATUVAR" yazıyordu. lab_id varsa filtreliyoruz,
      // yoksa görünen tek satırı alıyoruz — her iki durumda da antet dolu.
      let q = supabase.from('labs')
        .select('name, logo_url, address, phone, email, tax_number')
        .limit(1);
      if (labId) q = q.eq('id', labId);
      const { data } = await q.maybeSingle();
      if (alive && data) setLab(data as LabLetterhead);
    })();
    return () => { alive = false; };
  }, [labId]);

  /** Para birimleri — tutarı olanlar, işlem sayısına göre baskın olan başta. */
  const currencies = useMemo(() => {
    const m = new Map<string, number>();
    entries.forEach(e => m.set(e.currency, (m.get(e.currency) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [entries]);

  const active = ccy ?? currencies[0] ?? 'TRY';
  const rows = useMemo(() => entries.filter(e => e.currency === active), [entries, active]);

  /** Yürüyen toplam — ödeme ve avans birlikte, ikisi de çalışana yapılan çıkış. */
  const withRunning = useMemo(() => {
    let run = 0;
    return rows.map(r => ({ ...r, running: (run += r.amount) }));
  }, [rows]);

  const totals = useMemo(() => ({
    salary:  rows.filter(r => r.kind === 'salary').reduce((s, r) => s + r.amount, 0),
    advance: rows.filter(r => r.kind === 'advance').reduce((s, r) => s + r.amount, 0),
    all:     rows.reduce((s, r) => s + r.amount, 0),
  }), [rows]);

  const fmt = (n: number) => formatMoney(Number(n) || 0, active as Currency, { fractionDigits: 0 });

  const handlePrint = () => {
    if (Platform.OS !== 'web') return;
    const w = window.open('', '_blank');
    if (!w) return;

    const lines: CariLine[] = withRunning.map(r => ({
      refNo: null,
      reference: r.sub ?? null,
      date: r.date,
      counterparty: r.label,
      counterpartySub: r.kind === 'advance' ? 'Avans' : 'Maaş ödemesi',
      amount: r.amount,
      currency: r.currency,
      // Belge çalışana verilir; onun açısından tahsilat → yeşil (+).
      type: 'credit',
      balance: r.running,
    }));

    const html = buildCariStatementHtml({
      documentTitle: 'Personel Hesap Dökümü',
      periodFrom: rows[0]?.date ?? null,
      periodTo: rows[rows.length - 1]?.date ?? null,
      lab: {
        name:    lab?.name || 'Laboratuvar',
        logoUrl: lab?.logo_url ?? null,
        address: lab?.address ?? null,
        phone:   lab?.phone ?? null,
        email:   lab?.email ?? null,
        taxNo:   lab?.tax_number ?? null,
      },
      holder: {
        name: employee.full_name,
        phone: employee.phone ?? null,
        email: employee.email ?? null,
      },
      openingBalance: 0,
      closingBalance: totals.all,
      currency: active,
      lines,
      // Bu belge cari hesap değil — borç/alacak dili yanıltıcı olur. Lab
      // çalışana borçlu değil, ödemiş; o yüzden etiketler ve ton değiştirildi.
      // Maaş ve avans ikisi de çalışana yapılan ödeme → hepsi 'credit'.
      // Ayrım satır bazında (Maaş ödemesi / Avans) görünüyor; özet kutusunda
      // ikiye bölmek yanlış olurdu çünkü avans da ödenen paradır.
      labels: {
        opening:     'Dönem Başı',
        debit:       'Kesinti',
        credit:      'Toplam Ödeme',
        closing:     'Toplam Ödenen',
        closingHint: '',
      },
      // Basılı belge panel rengini değil kurumsal kobaltı kullanır — lab paneli
      // safran (#F5C24B) ve üzerine beyaz metin okunmuyor.
      accentColor: DS.exec.primary,
      balanceTone: 'neutral',
      hideBaBadges: true,
    });
    w.document.open(); w.document.write(html); w.document.close();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Pressable
          onPress={(e: any) => e?.stopPropagation?.()}
          style={{ width: '100%', maxWidth: 720, maxHeight: '88%', backgroundColor: T.card, borderRadius: 20, overflow: 'hidden' }}
        >
          {/* Başlık */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: T.hairline }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...DISPLAY, fontSize: 19, color: T.ink }}>Hesap Dökümü</Text>
              <Text style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>{employee.full_name}</Text>
            </View>
            {Platform.OS === 'web' && rows.length > 0 && (
              <Pressable
                onPress={handlePrint}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                  borderWidth: 1, borderColor: T.hairline,
                  backgroundColor: hovered ? T.hairline2 : 'transparent',
                  ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                })}
              >
                <Printer size={12} color={T.ink2} strokeWidth={1.8} />
                <Text style={{ fontSize: 12, fontWeight: '500', color: T.ink2 }}>Yazdır / PDF</Text>
              </Pressable>
            )}
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}>
              <X size={18} color={T.ink3} strokeWidth={2} />
            </Pressable>
          </View>

          {loading ? (
            <View style={{ padding: 40 }}><CenteredLoader /></View>
          ) : entries.length === 0 ? (
            <View style={{ padding: 44, alignItems: 'center', gap: 10 }}>
              <Wallet size={26} color={T.ink3} strokeWidth={1.5} />
              <Text style={{ fontSize: 13, color: T.ink3 }}>Bu personel için ödeme veya avans kaydı yok.</Text>
            </View>
          ) : (
            <>
              {/* Para birimi sekmeleri — sadece birden fazlaysa */}
              {currencies.length > 1 && (
                <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 18, paddingTop: 12 }}>
                  {currencies.map(c => {
                    const on = c === active;
                    return (
                      <Pressable
                        key={c}
                        onPress={() => setCcy(c)}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
                          backgroundColor: on ? T.ink : T.hairline2,
                          ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}),
                        }}
                      >
                        <Text style={{ fontSize: 11.5, fontWeight: '600', color: on ? T.bg : T.ink2 }}>{c}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {/* Özet */}
              <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4 }}>
                {[
                  { label: 'Maaş', value: totals.salary,  icon: Wallet },
                  { label: 'Avans', value: totals.advance, icon: Banknote },
                  { label: 'Toplam', value: totals.all,    icon: null },
                ].map(k => (
                  <View key={k.label} style={{ flex: 1, padding: 12, borderRadius: 14, backgroundColor: T.hairline2 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: T.ink3, letterSpacing: 0.6, textTransform: 'uppercase' }}>{k.label}</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: T.ink, marginTop: 4 }}>{fmt(k.value)}</Text>
                  </View>
                ))}
              </View>

              {/* Döküm */}
              <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 12 }}>
                {withRunning.map((r, i) => (
                  <View
                    key={r.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11,
                      borderBottomWidth: i < withRunning.length - 1 ? 1 : 0, borderBottomColor: T.hairline2,
                    }}
                  >
                    <View style={{
                      width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: r.kind === 'advance' ? '#F59E0B18' : `${primary}18`,
                    }}>
                      {r.kind === 'advance'
                        ? <Banknote size={14} color="#B45309" strokeWidth={1.8} />
                        : <Wallet size={14} color={primary} strokeWidth={1.8} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }} numberOfLines={1}>{r.label}</Text>
                      <Text style={{ fontSize: 11, color: T.ink3, marginTop: 2 }} numberOfLines={1}>
                        {new Date(r.date).toLocaleDateString('tr-TR')}{r.sub ? ` · ${r.sub}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: T.ink }}>{fmt(r.amount)}</Text>
                      <Text style={{ fontSize: 10.5, color: T.ink3, marginTop: 2 }}>∑ {fmt(r.running)}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
