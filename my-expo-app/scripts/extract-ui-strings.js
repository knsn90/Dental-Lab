#!/usr/bin/env node
/**
 * extract-ui-strings.js  (AST tabanlı)
 * Tüm .tsx dosyalarındaki kullanıcıya görünen Türkçe metinleri Babel ile çıkarır:
 *   - JSXText node'ları (gerçek metin, generic <T> değil)
 *   - UI string prop'ları: title/label/placeholder/subtitle/sub/message/heading/hint/
 *     cta/caption/emptyText/tooltip/header/confirmText/cancelText/accessibilityLabel
 *   - Alert.alert(...) ve toast.*(...) string argümanları
 * Çıktı: core/i18n/locales/auto.en.json  →  { "Türkçe metin": "" }  (İngilizce doldurulacak)
 * Mevcut doldurulmuş çeviriler korunur.
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['modules', 'app', 'core'];
const SKIP = /node_modules|\.expo|dist|[/\\]app[/\\]dev[/\\]|[/\\]locales[/\\]|[/\\]core[/\\]i18n[/\\]/;
const OUT = path.join(ROOT, 'core/i18n/locales/auto.en.json');

const UI_PROPS = new Set([
  'title','label','placeholder','subtitle','sub','message','heading','hint','cta',
  'caption','emptyText','tooltip','header','confirmText','cancelText','accessibilityLabel',
  'description','text','value',
]);

const HAS_LETTER = /[A-Za-zÇĞİÖŞÜçğıöşü]/;
const TR_DIA = /[çğıöşüÇĞİÖŞÜ]/; // Türkçe'ye özgü harf → "bu metin Türkçe UI" güçlü sinyali
function ok(raw) {
  const s = (raw || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length < 2 || s.length > 90) return null;
  if (!HAS_LETTER.test(s)) return null;
  if (/^[a-z][a-zA-Z0-9_]*$/.test(s)) return null;            // camelCase tek token
  if (/^[a-z0-9_]+([.\-][a-z0-9_]+)+$/.test(s)) return null;  // dotted/kebab key
  if (/^https?:|^www\.|@.*\.|\.(png|jpe?g|svg|webp|ttf|json|tsx?|js|css)$/i.test(s)) return null;
  if (/^[A-Z0-9_]{2,}$/.test(s)) return null;                 // ENUM_SABIT
  if (/^#?[0-9a-fA-F]{3,8}$/.test(s)) return null;            // renk
  if (/^[\d\s.,:%/+\-—·•|()]+$/.test(s)) return null;         // salt sayı/sembol
  return s;
}

const found = new Set();

function scanFile(p) {
  let ast;
  try {
    ast = parser.parse(fs.readFileSync(p, 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
  } catch { return; }

  traverse(ast, {
    JSXText(pth) {
      const v = ok(pth.node.value);
      if (v) found.add(v);
    },
    // Türkçe diakritik içeren HER string literal (dizi/ternary/değişken/return/obje değeri…)
    StringLiteral(pth) {
      if (!TR_DIA.test(pth.node.value)) return;
      const v = ok(pth.node.value);
      if (v) found.add(v);
    },
    // Sabit (ifadesiz) template literal — `... Türkçe ...`
    TemplateLiteral(pth) {
      if (pth.node.expressions.length > 0) return; // interpolasyonlu → runtime'da eşleşmez
      const raw = pth.node.quasis.map(q => q.value.cooked).join('');
      if (!TR_DIA.test(raw)) return;
      const v = ok(raw);
      if (v) found.add(v);
    },
    JSXAttribute(pth) {
      const name = pth.node.name && pth.node.name.name;
      if (!UI_PROPS.has(name)) return;
      const val = pth.node.value;
      if (val && val.type === 'StringLiteral') {
        const v = ok(val.value);
        if (v) found.add(v);
      }
    },
    CallExpression(pth) {
      const c = pth.node.callee;
      let isUiCall = false;
      if (c.type === 'MemberExpression' && c.object && c.property) {
        const obj = c.object.name; const prop = c.property.name;
        if ((obj === 'Alert' && prop === 'alert') ||
            (obj === 'toast') ||
            (obj === 'console' === false && (prop === 'error' || prop === 'success' || prop === 'info' || prop === 'warn') && obj === 'toast')) {
          isUiCall = obj === 'Alert' || obj === 'toast';
        }
      }
      if (!isUiCall) return;
      for (const arg of pth.node.arguments) {
        if (arg.type === 'StringLiteral') {
          const v = ok(arg.value);
          if (v) found.add(v);
        }
      }
    },
  });
}

function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.d.ts')) continue;
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) scanFile(p);
  }
}
SCAN_DIRS.forEach((d) => walk(path.join(ROOT, d)));

let existing = {};
if (fs.existsSync(OUT)) { try { existing = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {} }

const keys = [...found].sort((a, b) => a.localeCompare(b, 'tr'));
const out = {};
let filled = 0;
for (const k of keys) { out[k] = existing[k] ?? ''; if (out[k]) filled++; }
for (const [k, v] of Object.entries(existing)) { if (v && !(k in out)) out[k] = v; }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`✓ ${keys.length} benzersiz UI metni → ${path.relative(ROOT, OUT)}  (${filled} dolu, ${keys.length - filled} boş)`);
