// core/i18n/autoTranslate.tsx
// Runtime sözlük çeviri katmanı — kaynak kodu DEĞİŞTİRMEDEN tüm <Text> ve
// <TextInput placeholder> metinlerini aktif dile çevirir (birebir string eşleşmesi).
// JSX runtime'ları (jsx / jsxs / jsxDEV) + React.createElement yamalanır, böylece
// Text'in nasıl import edildiğinden bağımsız çalışır.
// Sözlük: locales/auto.en.json { "Türkçe": "English" }. Dil "tr" iken no-op.

import React from 'react';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import i18n, { isRTL } from './index';
// Sözlükler DİNAMİK yüklenir — statik import ETME.
// auto.en/de/fa.json toplam ~925 KB ve üçü birden giriş paketine giriyordu:
// `core/i18n` tek başına 8,16 MB'lık paketin 1,39 MB'ı, yani %17'siydi.
// Kullanıcıların çoğu Türkçe; onlar için sözlük HİÇ gerekmiyor (autoT `tr`de
// no-op). Diğer diller sözlüğü açılışta arka planda çeker.

// Arapça/Farsça betik aralığı — metin gerçekten RTL karakter içeriyor mu?
// (Para "₺125", ID, tarih gibi salt-LTR içerik yön almaz → düzen bozulmaz.)
const RTL_CHARS = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
function hasRTL(s: any): boolean {
  return typeof s === 'string' && RTL_CHARS.test(s);
}
// Yalnız metin DÜĞÜMÜNE eklenir (View container'a DEĞİL) → flex satırları LTR kalır,
// yalnız o Text'in kendi içeriği RTL akar + sağa hizalanır. Explicit style kazanır.
const RTL_TEXT_STYLE = { writingDirection: 'rtl' as const };
function withRTLStyle(existing: any): any {
  return existing != null ? [RTL_TEXT_STYLE, existing] : RTL_TEXT_STYLE;
}

const DICTS: Record<string, Record<string, string>> = {};
const dictLoading = new Set<string>();

/**
 * Aktif dilin sözlüğünü (yoksa) arka planda yükler.
 * Yüklenene kadar autoT kaynak metni (Türkçe) döndürür — çeviri kaybolmaz,
 * yalnız ilk anda gecikir. Yükleme bitince `languageChanged` yayınlanır ve
 * react-i18next tüketicileri yeniden render eder.
 */
function ensureDict(lng?: string): void {
  const l = lng ?? i18n.language;
  if (!l || l === 'tr' || DICTS[l] || dictLoading.has(l)) return;
  const load =
    l === 'en' ? () => import('./locales/auto.en.json') :
    l === 'de' ? () => import('./locales/auto.de.json') :
    l === 'fa' ? () => import('./locales/auto.fa.json') : null;
  if (!load) return;
  dictLoading.add(l);
  load()
    .then((m: any) => {
      DICTS[l] = (m?.default ?? m) as Record<string, string>;
      try { (i18n as any).emit?.('languageChanged', l); } catch { /* yoksay */ }
    })
    .catch((e) => console.warn('[i18n] sözlük yüklenemedi:', l, e?.message))
    .finally(() => dictLoading.delete(l));
}

// ── Farsça rakamlar (۰–۹) ────────────────────────────────────────────────
// Yalnız Farsça (fa) modda, RENDER edilen metindeki Batı rakamlarını (0-9)
// Farsça rakama çevir. ÖNEMLİ: sözlük eşleşmesinden (autoT) SONRA uygulanır —
// çünkü auto.*.json anahtarları Batı rakamlı Türkçe stringlerdir; önce çevirsek
// eşleşme kaçardı. Yalnız <Text> içeriği + placeholder'a; TextInput value'suna
// DOKUNULMAZ (patchProps zaten value'ya dokunmuyor) → parse/düzenleme bozulmaz.
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function toFaDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
}
function faNumChild(c: any): any {
  // ÖNEMLİ: sayısal <Text>{86}</Text> çocuğu string DEĞİL number'dır → onu da çevir.
  if (typeof c === 'string') return /[0-9]/.test(c) ? toFaDigits(c) : c;
  if (typeof c === 'number' && Number.isFinite(c)) return toFaDigits(String(c));
  if (Array.isArray(c)) {
    let ch = false;
    const m = c.map((x) => {
      if (typeof x === 'string' && /[0-9]/.test(x)) { ch = true; return toFaDigits(x); }
      if (typeof x === 'number' && Number.isFinite(x)) { ch = true; return toFaDigits(String(x)); }
      return x;
    });
    return ch ? m : c;
  }
  return c;
}

export function autoT(s: string): string {
  const lng = i18n.language;
  if (!lng || lng === 'tr' || typeof s !== 'string') return s;
  const dict = DICTS[lng];
  if (!dict) return s;
  const key = s.trim();
  if (!key) return s;
  const hit = dict[key];
  if (!hit) return s;
  return s === key ? hit : s.replace(key, hit);
}

function isText(type: any): boolean {
  return type === RNText || (type && (type.displayName === 'Text' || type.render?.displayName === 'Text'));
}
function isTextInput(type: any): boolean {
  return type === RNTextInput || (type && (type.displayName === 'TextInput' || type.render?.displayName === 'TextInput'));
}

function tChild(c: any): any {
  if (typeof c === 'string') return autoT(c);
  if (Array.isArray(c)) {
    let ch = false;
    const m = c.map((x) => { if (typeof x === 'string') { const t = autoT(x); if (t !== x) ch = true; return t; } return x; });
    return ch ? m : c;
  }
  return c;
}

// Bir props nesnesini (gerekirse) çevrilmiş kopyası + RTL yön stiliyle döndür
function patchProps(type: any, props: any): any {
  if (!props || i18n.language === 'tr') return props;
  const rtl = isRTL(i18n.language);

  const fa = i18n.language === 'fa';

  if (isText(type) && props.children != null) {
    let tc = tChild(props.children);
    // Farsça: çeviriden SONRA Batı rakamlarını Farsça rakama çevir.
    if (fa) tc = faNumChild(tc);
    // RTL: çevrilmiş içerik gerçekten RTL karakter içeriyorsa yön stili ekle.
    const content = typeof tc === 'string' ? tc : Array.isArray(tc) ? tc.filter((x) => typeof x === 'string').join('') : '';
    const needDir = rtl && hasRTL(content);
    if (tc !== props.children || needDir) {
      const next: any = { ...props };
      if (tc !== props.children) next.children = tc;
      if (needDir) next.style = withRTLStyle(props.style);
      return next;
    }
  } else if (isTextInput(type) && typeof props.placeholder === 'string') {
    let tp = autoT(props.placeholder);
    if (fa && /[0-9]/.test(tp)) tp = toFaDigits(tp);
    // RTL dilde Farsça placeholder → input yön stili (explicit style yine kazanır).
    const needDir = rtl && hasRTL(tp);
    if (tp !== props.placeholder || needDir) {
      const next: any = { ...props };
      if (tp !== props.placeholder) next.placeholder = tp;
      if (needDir) next.style = withRTLStyle(props.style);
      return next;
    }
  }
  return props;
}

let installed = false;

export function installAutoTranslate(): void {
  if (installed) return;
  installed = true;
  const dbg: any = { text: isText, jsx: false, jsxs: false, jsxDEV: false, createElement: false };

  // ── JSX automatic runtime (prod) ──
  try {
    const rt = require('react/jsx-runtime');
    if (rt && typeof rt.jsx === 'function') {
      const oj = rt.jsx, ojs = rt.jsxs;
      rt.jsx = function (type: any, props: any, key: any) { return oj.call(this, type, patchProps(type, props), key); };
      rt.jsxs = function (type: any, props: any, key: any) { return ojs.call(this, type, patchProps(type, props), key); };
      dbg.jsx = dbg.jsxs = true;
    }
  } catch { /* yoksay */ }

  // ── JSX dev runtime (Expo dev/Metro DEV builds bunu kullanır) ──
  try {
    const rtd = require('react/jsx-dev-runtime');
    if (rtd && typeof rtd.jsxDEV === 'function') {
      const od = rtd.jsxDEV;
      rtd.jsxDEV = function (type: any, props: any, key: any, isStatic: any, source: any, self: any) {
        return od.call(this, type, patchProps(type, props), key, isStatic, source, self);
      };
      dbg.jsxDEV = true;
    }
  } catch { /* yoksay */ }

  // ── React.createElement (classic runtime fallback) ──
  try {
    const oce = (React as any).createElement;
    (React as any).createElement = function (type: any, props: any, ...children: any[]) {
      if (i18n.language !== 'tr' && (isText(type) || isTextInput(type))) {
        let p = patchProps(type, props);
        if (isText(type) && children && children.length) {
          const fa = i18n.language === 'fa';
          const tc = children.map((c) => {
            if (typeof c !== 'string') return c;
            const t = autoT(c);
            return fa && /[0-9]/.test(t) ? toFaDigits(t) : t;
          });
          return oce.call(this, type, p, ...tc);
        }
        return oce.call(this, type, p, ...children);
      }
      return oce.apply(this, [type, props, ...children]);
    };
    dbg.createElement = true;
  } catch { /* yoksay */ }

  // Aktif dilin sözlüğünü şimdi çek, dil değişimlerinde de takip et.
  // Türkçede hiçbir şey indirilmez (ensureDict `tr`de erken döner).
  ensureDict();
  try { (i18n as any).on?.('languageChanged', (l: string) => ensureDict(l)); } catch { /* yoksay */ }

  try { (globalThis as any).__autoTr = dbg; } catch { /* yoksay */ }
}
