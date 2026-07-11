// core/i18n/autoTranslate.tsx
// Runtime sözlük çeviri katmanı — kaynak kodu DEĞİŞTİRMEDEN tüm <Text> ve
// <TextInput placeholder> metinlerini aktif dile çevirir (birebir string eşleşmesi).
// JSX runtime'ları (jsx / jsxs / jsxDEV) + React.createElement yamalanır, böylece
// Text'in nasıl import edildiğinden bağımsız çalışır.
// Sözlük: locales/auto.en.json { "Türkçe": "English" }. Dil "tr" iken no-op.

import React from 'react';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import i18n, { isRTL } from './index';
import enDict from './locales/auto.en.json';
import deDict from './locales/auto.de.json';
import faDict from './locales/auto.fa.json';

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

const DICTS: Record<string, Record<string, string>> = {
  en: enDict as Record<string, string>,
  de: deDict as Record<string, string>,
  fa: faDict as Record<string, string>,
};

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

  if (isText(type) && props.children != null) {
    const tc = tChild(props.children);
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
    const tp = autoT(props.placeholder);
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
          const tc = children.map((c) => (typeof c === 'string' ? autoT(c) : c));
          return oce.call(this, type, p, ...tc);
        }
        return oce.call(this, type, p, ...children);
      }
      return oce.apply(this, [type, props, ...children]);
    };
    dbg.createElement = true;
  } catch { /* yoksay */ }

  try { (globalThis as any).__autoTr = dbg; } catch { /* yoksay */ }
}
