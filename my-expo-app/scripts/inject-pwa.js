// scripts/inject-pwa.js
// Post-export: dist/index.html'e PWA meta tag'leri inject et + public/ klasörünü dist'e kopyala.
// expo export'tan sonra çalışır; vercel build prebuilt için dist/ kullanır.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PUBLIC = path.join(ROOT, 'public');

const indexPath = path.join(DIST, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const PWA_HEAD = `
    <!-- ── PWA Manifest ──────────────────────────────────────────────── -->
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#F2EDE3" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0E0E0E" media="(prefers-color-scheme: dark)" />

    <!-- ── iOS PWA capable ──────────────────────────────────────────── -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Siman" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-180.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-180.png" />
    <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
    <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png" />

    <!-- ── Android / general ─────────────────────────────────────────── -->
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="application-name" content="Siman" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
    <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />

    <!-- ── Service Worker register + auto-update ─────────────────── -->
    <script>
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', async function () {
          try {
            var reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

            // Yeni SW bulununca anında skip-waiting → kullanıcı reload beklemez
            reg.addEventListener('updatefound', function () {
              var nw = reg.installing;
              if (!nw) return;
              nw.addEventListener('statechange', function () {
                if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                  // Yeni sürüm hazır → hemen aktif et
                  nw.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            });

            // Controller değişince (yeni SW aktif olduğunda) sayfayı yenile
            var refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', function () {
              if (refreshing) return;
              refreshing = true;
              window.location.reload();
            });

            // Periyodik update kontrolü — her 60 saniyede bir
            setInterval(function () { reg.update().catch(function(){}); }, 60_000);

            // Sekme tekrar aktif olunca da kontrol et
            document.addEventListener('visibilitychange', function () {
              if (document.visibilityState === 'visible') reg.update().catch(function(){});
            });
          } catch (err) {
            console.warn('[pwa] sw register failed:', err);
          }
        });
      }
    </script>

    <!-- ── Safe area CSS (üst notch + alt home indicator) + no-zoom ── -->
    <style>
      :root { --app-bg: #F2EDE3; }
      html, body {
        background-color: var(--app-bg);
        /* PWA: pinch-zoom / double-tap zoom kapalı */
        touch-action: manipulation;
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
        -ms-content-zooming: none;
      }
      /* iOS Safari: form input'larda 16px altı font auto-zoom tetikler — engelle */
      input, textarea, select { font-size: 16px; }
      /* body padding her zaman 0 — şerit oluşturmaz. SafeAreaProvider içerideki
         useSafeAreaInsets() ile env() değerlerini okur, screen header'ları
         kendi paddingTop'una insets.top ekler. BG kesintisiz akar. */
      body { padding: 0; margin: 0; }
    </style>`;

// Viewport — viewport-fit=cover + no-zoom (PWA app benzeri davranış)
html = html.replace(
  /<meta name="viewport" content="[^"]+"\s*\/>/,
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover" />',
);

// ─── Preload entry JS — browser bundle'ı header'ı parse eder etmez fetch'lemeye başlasın
// Expo dist'inde script tag <body>'de en sona ekleniyor; bu HTML parse blocking olmasa da
// browser scheduler'ı için "high priority" hint vermek ilk paint'i 1-3s hızlandırabiliyor.
const entryMatch = html.match(/<script[^>]+src=["']([^"']*\/_expo\/static\/js\/web\/entry-[^"']+\.js)["']/);
if (entryMatch && !html.includes('rel="modulepreload"')) {
  const preloadTag = `\n    <link rel="modulepreload" href="${entryMatch[1]}" />\n  `;
  html = html.replace('</head>', preloadTag + '</head>');
  console.log('✓ entry JS modulepreload hint injected');
}

// PWA meta blok'unu sadece bir kere ekle — title regex'i daha tolerant (Dental Lab veya Nexadent Lab)
if (!html.includes('rel="manifest"')) {
  const titleMatch = html.match(/<title>[^<]*<\/title>/);
  if (!titleMatch) {
    console.error('✗ <title> tag bulunamadı — PWA inject başarısız!');
    process.exit(1);
  }
  html = html.replace(titleMatch[0], titleMatch[0] + PWA_HEAD);
  fs.writeFileSync(indexPath, html);
  console.log('✓ PWA meta tags injected into dist/index.html');
} else {
  console.log('✓ PWA meta tags already present, skipping injection');
}

// ─── Splash screen — JS bundle yüklenirken kullanıcı blank ekran görmesin ─────
// Logo: transparent SVG (assets/images/labflow-logo.svg) — gradient stroke,
// arka plansız. MutationObserver React mount edince splash'i fade-out + remove.
const logoSvgPath = path.join(__dirname, '..', 'assets/images/siman-logo.svg');
const legacyIconPath = path.join(PUBLIC, 'icons/icon-192.png');
const hasTransparentLogo = fs.existsSync(logoSvgPath);
if ((hasTransparentLogo || fs.existsSync(legacyIconPath)) && !html.includes('id="lf-splash"')) {
  // Logo markup — Siman logosu (statik, animasyonsuz). SVG ise inline, yoksa PNG fallback.
  let logoMarkup;
  if (hasTransparentLogo) {
    let svg = fs.readFileSync(logoSvgPath, 'utf8')
      .replace(/<\?xml[^>]*\?>\s*/i, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    // root <svg ...> üzerinde width/height ekle (yoksa)
    svg = svg.replace(/<svg([^>]*)>/, (m, attrs) => {
      const hasWH = /\bwidth=/.test(attrs) || /\bheight=/.test(attrs);
      const extra = hasWH ? '' : ' width="132" height="132"';
      return `<svg${attrs}${extra}>`;
    });
    logoMarkup = svg;
  } else {
    const logoB64 = fs.readFileSync(legacyIconPath).toString('base64');
    logoMarkup = `<img src="data:image/png;base64,${logoB64}" alt="" style="width: 120px; height: 120px;" />`;
  }
  const SPLASH = `
    <div id="lf-splash" style="
      position: fixed; inset: 0; z-index: 9999;
      background: #FFFFFF;
      display: flex; align-items: center; justify-content: center;
      transition: opacity 320ms ease-out;
    ">
      ${logoMarkup}
    </div>
    <script>
      (function() {
        var splash = document.getElementById('lf-splash');
        if (!splash) return;
        function fadeOut() {
          splash.style.opacity = '0';
          setTimeout(function() { if (splash && splash.parentNode) splash.parentNode.removeChild(splash); }, 320);
        }
        // React tarafı auth + profile hazır olunca window.__nxReady = true set eder
        // ve 'nx:ready' event'i dispatch eder. Splash o ana kadar görünür kalır
        // → tek seferlik, kesintisiz loading deneyimi.
        if (window.__nxReady === true) { fadeOut(); return; }
        window.addEventListener('nx:ready', function () { fadeOut(); }, { once: true });
        // Güvenlik: 12 saniyede her halükarda kapat (auth takılı kalırsa)
        setTimeout(fadeOut, 12_000);
      })();
    </script>`;
  html = html.replace('<body>', '<body>\n' + SPLASH);
  fs.writeFileSync(indexPath, html);
  console.log('✓ Splash screen injected (' + (hasTransparentLogo ? 'inline SVG' : 'inline PNG base64') + ')');
}

// public/ klasörünü dist'e kopyala (manifest.webmanifest, sw.js, icons/)
function copyRecursive(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry));
    }
  } else {
    fs.copyFileSync(src, dst);
  }
}

if (fs.existsSync(PUBLIC)) {
  copyRecursive(PUBLIC, DIST);
  console.log('✓ public/ assets copied into dist/');
}
