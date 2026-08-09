// Offline 3D motorunu paketler: three.js + jsm loader'ları → tek IIFE minified JS,
// sonra bir TS string modülüne gömer (viewerEngineBundle.generated.ts).
// WebView bunu inline <script> olarak çalıştırır → CDN/internet gerekmez.
//
// Çalıştır:  node scripts/build-viewer-engine.mjs
// (esbuild CLI'ı npx ile indirilir; ayrı bağımlılık gerekmez.)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const entry = resolve(root, 'modules/viewer-3d/mobile/engine/entry.js');
const tmpOut = resolve(root, 'modules/viewer-3d/mobile/engine/.bundle.tmp.js');
const outTs = resolve(root, 'modules/viewer-3d/mobile/viewerEngineBundle.generated.ts');

// esbuild CLI (npx --yes → yerel cache'ten çalışır)
execFileSync(
  'npx',
  ['--yes', 'esbuild', entry, '--bundle', '--format=iife', '--minify',
   '--target=safari16', '--legal-comments=none', `--outfile=${tmpOut}`],
  { stdio: 'inherit', cwd: root },
);

let js = readFileSync(tmpOut, 'utf8');
rmSync(tmpOut, { force: true });

// Güvenlik: inline <script> içinde </script> dizisi script'i erken kapatmasın.
if (js.includes('</script')) js = js.replaceAll('</script', '<\\/script');

// TS template-literal içine gömmek için kaçış: backslash, backtick, ${.
const escaped = js
  .replaceAll('\\', '\\\\')
  .replaceAll('`', '\\`')
  .replaceAll('${', '\\${');

const header = `// OTOMATIK URETILDI — elle duzenleme. Kaynak: modules/viewer-3d/mobile/engine/entry.js
// Yeniden uret:  node scripts/build-viewer-engine.mjs
// three.js + STL/PLY/OBJ loader + ArcballControls (offline, CDN gerekmez).
/* eslint-disable */
// prettier-ignore
export const VIEWER_ENGINE_JS = \`${escaped}\`;
`;

writeFileSync(outTs, header, 'utf8');
const kb = (js.length / 1024).toFixed(0);
console.log(`✓ viewerEngineBundle.generated.ts yazildi — ${kb} KB (minified JS)`);
