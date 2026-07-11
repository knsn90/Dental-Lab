// app/dev/triage-mockup.tsx
// MOCKUP — yeni "Aşama Planlama" UX önerisi. Statik veri, backend yok.
// Önizleme: /dev/triage-mockup
//
// İki yüzey:
//   1) Plan Önizleme & Onay  — sipariş başına hızlı: şablon otomatik dolar,
//      teknisyenler yetkinlik+yüke göre atanır, müdür satır içi ince ayar yapıp
//      tek tıkla başlatır.
//   2) Şablon Stüdyosu        — lab kendi akışını bir kez kurar (biz varsayılan vermeyiz).

import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import {
  ListChecks, GripVertical, X, Plus, AlertTriangle, Clock, Sparkles,
  ChevronRight, Layers, UserCheck, Save, Play, FileText, Box, Stethoscope,
  Cpu, Wand2, Hammer, Flame, Brush, Info,
} from 'lucide-react-native';
import { DS } from '../../core/theme/dsTokens';

const A      = DS.lab.primary;      // safran (lab/müdür paneli accent)
const A_DEEP = DS.lab.primaryDeep;
const INK    = DS.ink;
const DISPLAY = Platform.select({ web: 'Inter Tight, Inter, sans-serif', default: 'InterTight_300Light' }) as string;
const PAGE   = '#F5F1EB';          // lab bgPage

function tint(hex: string, a: number) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ─── Mock veri ──────────────────────────────────────────────────────────────
type Tech = { name: string; load: number; expert?: boolean; auto?: boolean };
type Stage = {
  key: string; name: string; icon: any; color: string;
  skill: string; dur: string; critical?: boolean; first?: boolean;
  tech?: Tech; warn?: string;
};

const STAGES: Stage[] = [
  { key: 'cad',   name: 'CAD Tasarım',     icon: Wand2,  color: '#3B82F6', skill: 'CAD-tasarım', dur: '3.0 sa', first: true,
    tech: { name: 'Melike Çamur', load: 70, expert: true } },
  { key: 'model', name: 'Model Döküm',     icon: Layers, color: '#8B5CB8', skill: 'Döküm',       dur: '2.0 sa',
    tech: { name: 'Aryan Talebi', load: 40 } },
  { key: 'mill',  name: 'Frezeleme',       icon: Hammer, color: '#EA7A4C', skill: 'CAM/Frezeleme', dur: '1.5 sa', critical: true,
    tech: { name: 'Enes Balaban', load: 92 }, warn: 'İstasyon dolu — tahmini +1 gün' },
  { key: 'sinter',name: 'Sinterleme',      icon: Flame,  color: '#D94B4B', skill: 'Fırın',        dur: '4.0 sa',
    tech: { name: 'Otomatik atanacak', load: 0, auto: true } },
  { key: 'glaze', name: 'Glazür & Bitirme', icon: Brush, color: '#2BA39B', skill: 'Estetik',      dur: '2.0 sa',
    tech: { name: 'Aryan Talebi', load: 40 } },
];
const POOL = [
  { key: 'paint', name: 'Boyama',           icon: Brush },
  { key: 'clean', name: 'Döküm Temizleme',  icon: Cpu },
];

function initials(n: string) {
  return n.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

// ─── Ortak: yük çubuğu ────────────────────────────────────────────────────────
function LoadBar({ value }: { value: number }) {
  const c = value >= 85 ? '#D94B4B' : value >= 65 ? '#E89B2A' : '#2D9A6B';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 54, height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <View style={{ width: `${value}%`, height: 5, borderRadius: 3, backgroundColor: c }} />
      </View>
      <Text style={{ fontSize: 10, fontWeight: '700', color: c }}>%{value}</Text>
    </View>
  );
}

function Avatar({ name, color, auto }: { name: string; color: string; auto?: boolean }) {
  if (auto) {
    return (
      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: INK[300] }}>
        <Sparkles size={14} color={INK[400]} strokeWidth={1.8} />
      </View>
    );
  }
  return (
    <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(color, 0.16) }}>
      <Text style={{ fontSize: 12, fontWeight: '800', color }}>{initials(name)}</Text>
    </View>
  );
}

// ─── Aşama kartı (pipeline satırı) ─────────────────────────────────────────────
function StageCard({ s, idx }: { s: Stage; idx: number }) {
  const Icon = s.icon;
  return (
    <View style={{
      borderRadius: 16, backgroundColor: '#FFFFFF',
      borderWidth: 1, borderColor: s.warn ? tint('#D94B4B', 0.35) : 'rgba(0,0,0,0.07)',
      borderLeftWidth: 3, borderLeftColor: s.color,
      ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.05)' } as any : {}),
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
        {/* sürükle + sıra */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <GripVertical size={15} color={INK[300]} strokeWidth={1.8} />
          <View style={{ width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(A, 0.14) }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: A_DEEP, fontFamily: DISPLAY }}>{idx + 1}</Text>
          </View>
        </View>

        {/* istasyon ikon */}
        <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(s.color, 0.12) }}>
          <Icon size={18} color={s.color} strokeWidth={1.9} />
        </View>

        {/* ad + yetkinlik + rozetler */}
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: INK[900] }}>{s.name}</Text>
            {s.first && (
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: tint(A, 0.16) }}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: A_DEEP, letterSpacing: 0.4 }}>İLK AŞAMA</Text>
              </View>
            )}
            {s.critical && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: tint('#D94B4B', 0.12) }}>
                <AlertTriangle size={9} color="#9C2E2E" strokeWidth={2} />
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#9C2E2E', letterSpacing: 0.4 }}>KRİTİK</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Cpu size={11} color={INK[400]} strokeWidth={1.8} />
              <Text style={{ fontSize: 11, color: INK[500] }}>{s.skill}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Clock size={11} color={INK[400]} strokeWidth={1.8} />
              <Text style={{ fontSize: 11, color: INK[500] }}>{s.dur}</Text>
            </View>
          </View>
        </View>

        {/* atanan teknisyen + yük */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ alignItems: 'flex-end', gap: 3 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: s.tech?.auto ? INK[400] : INK[800] }}>
              {s.tech?.name}
            </Text>
            {s.tech?.auto
              ? <Text style={{ fontSize: 9.5, color: INK[400] }}>yetkinlik+yüke göre</Text>
              : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {s.tech?.expert && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Sparkles size={9} color={A_DEEP} strokeWidth={2} />
                      <Text style={{ fontSize: 9, fontWeight: '700', color: A_DEEP }}>uzman</Text>
                    </View>
                  )}
                  <LoadBar value={s.tech?.load ?? 0} />
                </View>
              )}
          </View>
          <Avatar name={s.tech?.name ?? ''} color={s.color} auto={s.tech?.auto} />
          <Pressable style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}>
            <X size={13} color={INK[400]} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* kapasite uyarısı (satır içi) */}
      {s.warn && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: tint('#D94B4B', 0.05), borderTopWidth: 1, borderTopColor: tint('#D94B4B', 0.12) }}>
          <Info size={12} color="#9C2E2E" strokeWidth={2} />
          <Text style={{ fontSize: 11, color: '#9C2E2E', fontWeight: '500' }}>{s.warn}</Text>
          <Pressable style={{ marginLeft: 'auto' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: A_DEEP }}>Başka teknisyen öner →</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Sol referans rayı ─────────────────────────────────────────────────────────
function RefRail() {
  return (
    <View style={{ width: 260, gap: 12 }}>
      <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 14, gap: 10 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 1, textTransform: 'uppercase' }}>Hekim & Klinik</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: tint('#6BA888', 0.18), alignItems: 'center', justifyContent: 'center' }}>
            <Stethoscope size={14} color="#4D8A6B" strokeWidth={1.8} />
          </View>
          <View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: INK[900] }}>Dr. Aylar Teke</Text>
            <Text style={{ fontSize: 11, color: INK[500] }}>Dent Hekim Kliniği</Text>
          </View>
        </View>
      </View>

      <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 14, gap: 6 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 1, textTransform: 'uppercase' }}>Hekim Notu</Text>
        <Text style={{ fontSize: 12.5, color: INK[800], lineHeight: 18 }}>
          Distal bölgede hafif pembe estetik istiyoruz, renk A2. Köprü gövdesi ovat pontik olsun.
        </Text>
      </View>

      <View style={{ borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 14, gap: 8 }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 1, textTransform: 'uppercase' }}>Tarama & Dosyalar (3)</Text>
        {['Üst çene.stl', 'Alt çene.stl', 'Kapanış.stl'].map(f => (
          <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10, backgroundColor: PAGE }}>
            <Box size={15} color={A_DEEP} strokeWidth={1.8} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: INK[700] }}>{f}</Text>
            <View style={{ marginLeft: 'auto', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: tint(A, 0.16) }}>
              <Text style={{ fontSize: 8.5, fontWeight: '800', color: A_DEEP }}>STL</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── 1) PLAN ÖNİZLEME & ONAY ───────────────────────────────────────────────────
function PlanPreview() {
  return (
    <View style={{ gap: 16 }}>
      {/* Sipariş başlığı kartı */}
      <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18,
          // @ts-ignore
          backgroundImage: `linear-gradient(135deg, ${tint(A, 0.16)} 0%, #FFFFFF 70%)` }}>
          <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: A }}>
            <ListChecks size={22} color={INK[900]} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: A_DEEP, letterSpacing: 1, textTransform: 'uppercase' }}>Plan Önizleme · Şablon: Zirkonyum Köprü</Text>
            <Text style={{ fontSize: 24, color: INK[900], fontFamily: DISPLAY, letterSpacing: -0.6, marginTop: 2 }}>
              #LAB-2026-0105 · Ayşe Yıldız
            </Text>
            <Text style={{ fontSize: 12.5, color: INK[500], marginTop: 2 }}>Zirkonyum Köprü · 3 üye · Renk A2 · Teslim 5 Haziran</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: tint('#D94B4B', 0.10), borderWidth: 1, borderColor: tint('#D94B4B', 0.25) }}>
            <AlertTriangle size={12} color="#9C2E2E" strokeWidth={2} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#9C2E2E' }}>Acil</Text>
          </View>
        </View>
      </View>

      {/* gövde: sol referans + sağ pipeline */}
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <RefRail />

        <View style={{ flex: 1, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: INK[700] }}>Üretim Akışı · {STAGES.length} aşama</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Sparkles size={12} color={A_DEEP} strokeWidth={2} />
              <Text style={{ fontSize: 11, color: INK[500] }}>Teknisyenler yetkinlik + iş yüküne göre otomatik atandı</Text>
            </View>
          </View>

          {STAGES.map((s, i) => <StageCard key={s.key} s={s} idx={i} />)}

          {/* aşama havuzu */}
          <View style={{ borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: INK[300], padding: 12, gap: 8, marginTop: 2 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', color: INK[400], letterSpacing: 0.8, textTransform: 'uppercase' }}>+ Aşama Ekle</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {POOL.map(p => {
                const Icon = p.icon;
                return (
                  <Pressable key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)' }}>
                    <Plus size={13} color={INK[500]} strokeWidth={2} />
                    <Icon size={13} color={INK[500]} strokeWidth={1.8} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: INK[700] }}>{p.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>

      {/* sticky özet + birincil aksiyon */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 16,
        borderRadius: 18, padding: 16, backgroundColor: INK[900],
        ...(Platform.OS === 'web' ? { position: 'sticky', bottom: 16 } as any : {}),
      }}>
        <Summary label="Aşama" value="5" />
        <Summary label="Tahmini süre" value="12.5 sa" />
        <Summary label="İlk istasyon" value="CAD Tasarım" />
        <Summary label="Tahmini teslim" value="5 Haz" warn />
        <View style={{ flex: 1 }} />
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' }}>
          <Save size={14} color="#FFF" strokeWidth={1.9} />
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#FFF' }}>Şablon Kaydet</Text>
        </Pressable>
        <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: A }}>
          <Play size={15} color={INK[900]} strokeWidth={2.2} />
          <Text style={{ fontSize: 14, fontWeight: '800', color: INK[900] }}>Onayla & Üretime Başlat</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Summary({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 9.5, fontWeight: '700', color: 'rgba(255,255,255,0.45)', letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 16, fontWeight: '800', color: warn ? '#FBBF77' : '#FFF', fontFamily: DISPLAY, letterSpacing: -0.3 }}>{value}</Text>
    </View>
  );
}

// ─── 2) ŞABLON STÜDYOSU ────────────────────────────────────────────────────────
function TemplateStudio() {
  return (
    <View style={{ gap: 16 }}>
      <View style={{ borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 18, gap: 4 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: A_DEEP, letterSpacing: 1, textTransform: 'uppercase' }}>Şablon Stüdyosu</Text>
        <Text style={{ fontSize: 24, color: INK[900], fontFamily: DISPLAY, letterSpacing: -0.6 }}>İş Akışı Şablonları</Text>
        <Text style={{ fontSize: 12.5, color: INK[500] }}>Her vaka tipi için üretim akışını bir kez tasarla — siparişlerde otomatik uygulanır. (Hazır şablon gelmez, lab kendi kurar.)</Text>
      </View>

      {/* vaka tipi seçici */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {['Zirkonyum Köprü', 'Zirkonyum Kron', 'İmplant Üstü', 'Gece Plağı', 'Hareketli Protez'].map((c, i) => (
          <View key={c} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: i === 0 ? A : '#FFFFFF', borderWidth: 1, borderColor: i === 0 ? A : 'rgba(0,0,0,0.10)' }}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: i === 0 ? INK[900] : INK[500] }}>{c}</Text>
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: INK[300] }}>
          <Plus size={13} color={INK[500]} strokeWidth={2} />
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: INK[500] }}>Yeni vaka tipi</Text>
        </View>
      </View>

      {/* görsel akış kurucu */}
      <View style={{ borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', padding: 18, gap: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: INK[700] }}>Zirkonyum Köprü — Akış (sürükle-sırala)</Text>
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          return (
            <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: PAGE, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', borderLeftWidth: 3, borderLeftColor: s.color }}>
              <GripVertical size={15} color={INK[300]} strokeWidth={1.8} />
              <Text style={{ width: 18, fontSize: 12, fontWeight: '700', color: INK[400], fontFamily: DISPLAY }}>{i + 1}</Text>
              <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(s.color, 0.12) }}>
                <Icon size={16} color={s.color} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: INK[900] }}>{s.name}</Text>
                <Text style={{ fontSize: 11, color: INK[500] }}>Yetkinlik: {s.skill} · ~{s.dur} · atama: yetkinlik+yük</Text>
              </View>
              {s.critical && (
                <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: tint('#D94B4B', 0.12) }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#9C2E2E' }}>KRİTİK</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <View style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
                  <UserCheck size={13} color={INK[500]} strokeWidth={1.8} />
                </View>
                <View style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }}>
                  <X size={13} color={INK[400]} strokeWidth={2} />
                </View>
              </View>
            </View>
          );
        })}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: INK[300] }}>
            <Plus size={14} color={INK[500]} strokeWidth={2} />
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: INK[500] }}>Aşama ekle</Text>
          </Pressable>
          <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: INK[300] }}>
            <Layers size={14} color={INK[500]} strokeWidth={2} />
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: INK[500] }}>Paralel kulvar ekle</Text>
          </Pressable>
        </View>
      </View>

      <Pressable style={{ alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: A }}>
        <Save size={15} color={INK[900]} strokeWidth={2.1} />
        <Text style={{ fontSize: 14, fontWeight: '800', color: INK[900] }}>Şablonu Kaydet</Text>
      </Pressable>
    </View>
  );
}

// ─── Sayfa ──────────────────────────────────────────────────────────────────
export default function TriageMockup() {
  const [view, setView] = useState<'plan' | 'studio'>('plan');
  return (
    <ScrollView style={{ flex: 1, backgroundColor: PAGE }} contentContainerStyle={{ padding: 24, paddingBottom: 120, maxWidth: 1180, width: '100%', alignSelf: 'center' }}>
      <Text style={{ fontSize: 32, color: INK[900], fontFamily: DISPLAY, letterSpacing: -0.9, marginBottom: 4 }}>Aşama Planlama — Mockup</Text>
      <Text style={{ fontSize: 13, color: INK[500], marginBottom: 18 }}>UX önerisi önizlemesi · statik veri · /dev/triage-mockup</Text>

      {/* segmented */}
      <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', alignSelf: 'flex-start', marginBottom: 18 }}>
        {([['plan', 'Plan Önizleme & Onay'], ['studio', 'Şablon Stüdyosu']] as const).map(([k, label]) => (
          <Pressable key={k} onPress={() => setView(k)} style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: view === k ? A : 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: view === k ? INK[900] : INK[500] }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {view === 'plan' ? <PlanPreview /> : <TemplateStudio />}
    </ScrollView>
  );
}
