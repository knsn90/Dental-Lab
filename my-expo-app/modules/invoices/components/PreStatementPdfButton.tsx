/**
 * Ön ekstre PDF düğmesi + biçim seçici (Özet / Ayrıntılı) + para birimi (birden çoksa).
 * PDF mevcut cari ekstre tasarımındadır (buildPreStatementHtml → buildStatementHtml); tek para birimli.
 * Lab tarafında isteğe bağlı "Hekim" seçici (R7): hekim seçilince yalnız o hekimin kalemleri,
 * kliniğin geneline ait rakamlar ve karekod olmadan, dosya adında hekimle.
 * Düğme ayar kapalıyken ya da taslak yokken çizilmez (çağıran enabled/invoices'a bakar; burada da korunur).
 */
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, Platform } from 'react-native';
import { Download } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { exportHtmlPdf } from '../../../core/print/exportHtmlPdf';
import { buildPreStatementSummaryHtml, buildPreStatementDetailHtml, type PreStatementPdfInput } from '../buildPreStatementHtml';
import { scopeToDoctor, NO_DOCTOR, pdfCurrencies, pickCurrency } from '../lib/preStatementPdf';
import type { PreStatement } from '../types';
import type { LabLetterhead } from '../../receipt/buildReceiptHtml';

export type PdfFormat = 'ozet' | 'ayrintili';

/** Hekim seçici listesi: faturaların kalemlerindeki tekil doktor adları (boş ad "—"). */
export function doctorNamesOf(data: PreStatement | null | undefined): string[] {
  const set = new Set<string>();
  for (const inv of data?.invoices ?? []) for (const it of inv.items ?? []) set.add((it.doctor_name ?? '').trim() || NO_DOCTOR);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

const safe = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Klinik';

export function PreStatementPdfButton({ clinicName, data, lab, defaultFormat, approve, doctors, currency }: {
  clinicName: string;
  data: PreStatement;
  /** Hazır antet ya da (tıklamada çağrılan) çekici */
  lab: LabLetterhead | (() => Promise<LabLetterhead>);
  defaultFormat: PdfFormat;
  approve?: PreStatementPdfInput['approve'];
  /** Yalnız lab tarafında verilir → "Hekim" seçici (R7) */
  doctors?: string[];
  /** Varsayılan para birimi (lab: ekranda seçili olan). Yoksa ilk para birimi. */
  currency?: string;
}) {
  const U = useInkUI();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<PdfFormat>(defaultFormat);
  const [doctor, setDoctor] = useState<string | null>(null);
  // Hekim seçiliyse yalnız o hekimin kalemlerinin para birimleri (boş PDF eşleşmesi olmasın)
  const ccyList = useMemo(() => pdfCurrencies(data, doctor), [data, doctor]);
  const [ccyPick, setCcyPick] = useState<string | null>(null);
  const ccy = pickCurrency(ccyList, ccyPick, currency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const docList = useMemo(() => doctors ?? [], [doctors]);
  if (!data.enabled || (data.invoices ?? []).length === 0) return null;

  const run = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(null); setOpen(false);
    const scoped = doctor ? scopeToDoctor(data, doctor) : data;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = format === 'ayrintili' ? 'On-Ekstre-Ayrintili' : 'On-Ekstre';
    const ccyPart = ccyList.length > 1 ? `-${ccy}` : '';
    const fileName = `${prefix}-${safe(clinicName)}${doctor ? `-${safe(doctor)}` : ''}${ccyPart}-${ym}.pdf`;
    // await YOK: masaüstünde pencere tıklama jesti içinde açılmalı (exportHtmlPdf bunu ilk iş yapar).
    const html = (async () => {
      const letter = typeof lab === 'function' ? await lab() : lab;
      const input: PreStatementPdfInput = {
        clinicName, lab: letter, data: scoped, currency: ccy,
        // Hekimli PDF'te karekod/onay yok (R7)
        approve: doctor ? undefined : approve,
      };
      return format === 'ayrintili' ? buildPreStatementDetailHtml(input) : buildPreStatementSummaryHtml(input);
    })();
    exportHtmlPdf(html, fileName)
      .catch((e: any) => {
        const m = String(e?.message ?? e);
        setError(m === 'POPUP_BLOCKED'
          ? autoT('Açılır pencere engellendi — bu siteye izin verip tekrar deneyin.')
          : `${autoT('PDF oluşturulamadı')}: ${m}`);
      })
      .finally(() => { inFlight.current = false; setBusy(false); });
  };

  const chip = (label: string, active: boolean, onPress: () => void, key?: string) => (
    <Pressable
      key={key ?? label}
      onPress={onPress}
      style={{
        paddingHorizontal: active ? 18 : 12, paddingVertical: 8, borderRadius: 999,
        backgroundColor: active ? U.ink[900] : U.plainBtn.bg,
        borderWidth: 1, borderColor: active ? U.ink[900] : U.plainBtn.border,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      }}
    >
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: active ? U.onDarkPill : U.plainBtn.fg }}>{label}</Text>
    </Pressable>
  );
  const lbl = { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: U.ink[400] };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
      <GlassTooltip title={autoT('PDF indir')} text={autoT('Ön ekstreyi özet ya da ayrıntılı PDF olarak indirir')}>
        <Pressable
          disabled={busy}
          onPress={() => { setError(null); setOpen(true); }}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
            backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
            opacity: busy ? 0.6 : pressed ? 0.85 : 1,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
        >
          <Download size={13} color={U.plainBtn.fg} strokeWidth={2} />
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.plainBtn.fg }}>{busy ? autoT('Hazırlanıyor…') : 'PDF'}</Text>
        </Pressable>
      </GlassTooltip>
      {error ? <Text style={{ flex: 1, minWidth: 180, fontSize: 12, color: U.chipTones.danger.fg }}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={U.modalOverlay}>
          <View style={[U.modalCard, { maxWidth: 420 }]}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: U.ink[900] }}>{autoT('Ön ekstre PDF')}</Text>
              <View style={{ gap: 8 }}>
                <Text style={lbl}>{autoT('Biçim')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {chip(autoT('Özet'), format === 'ozet', () => setFormat('ozet'), 'ozet')}
                  {chip(autoT('Ayrıntılı'), format === 'ayrintili', () => setFormat('ayrintili'), 'ayr')}
                </View>
              </View>
              {ccyList.length > 1 ? (
                <View style={{ gap: 8 }}>
                  <Text style={lbl}>{autoT('Para birimi')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {ccyList.map(c => chip(c, ccy === c, () => setCcyPick(c), `c:${c}`))}
                  </View>
                </View>
              ) : null}
              {docList.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Text style={lbl}>{autoT('Hekim')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {chip(autoT('Tüm hekimler'), doctor === null, () => setDoctor(null), '__all')}
                    {docList.map(d => chip(d, doctor === d, () => setDoctor(d), `d:${d}`))}
                  </View>
                  {doctor ? (
                    <Text style={{ fontSize: 11.5, color: U.ink[500] }}>
                      {autoT('Yalnız bu hekimin kalemleri; kliniğin geneline ait rakamlar ve onay karekodu yer almaz')}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <Pressable
                  onPress={() => setOpen(false)}
                  style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Vazgeç')}</Text>
                </Pressable>
                <Pressable
                  onPress={run}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, backgroundColor: U.ink[900],
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                >
                  <Download size={13} color={U.onDarkPill} strokeWidth={2} />
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: U.onDarkPill }}>{autoT('İndir')}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
