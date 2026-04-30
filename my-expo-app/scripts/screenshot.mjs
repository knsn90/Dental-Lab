// scripts/screenshot.mjs
// Auto-login + screenshot helper.
// Reads credentials from .env.local (PUPPETEER_TEST_EMAIL, PUPPETEER_TEST_PASSWORD).
// Optional: PUPPETEER_TEST_PANEL=lab|admin (default lab).
//
// Usage:
//   node scripts/screenshot.mjs <route> [outFile] [width] [height]
//
// Example:
//   node scripts/screenshot.mjs "/(lab)/production" .preview/board.png 1440 900
//
// Use route="login" to skip auto-login.

import puppeteer from 'puppeteer';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// ── Args ────────────────────────────────────────────────────────────────────
const [, , rawPath = '/(lab)/production', rawOut = '.preview/screen.png', rawW = '1440', rawH = '900'] = process.argv;
const url     = `http://localhost:8081${rawPath.startsWith('/') ? '' : '/'}${rawPath}`;
const outFile = resolve(process.cwd(), rawOut);
const width   = parseInt(rawW, 10);
const height  = parseInt(rawH, 10);

// ── Load .env.local ─────────────────────────────────────────────────────────
async function loadEnv() {
  try {
    const txt = await readFile(resolve(process.cwd(), '.env.local'), 'utf8');
    const env = {};
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
    return env;
  } catch {
    return {};
  }
}

const env      = await loadEnv();
const email    = env.PUPPETEER_TEST_EMAIL;
const password = env.PUPPETEER_TEST_PASSWORD;
const panel    = (env.PUPPETEER_TEST_PANEL ?? 'lab').toLowerCase();

const skipLogin = rawPath === 'login' || rawPath === '/' || rawPath === '/login';

// ── Run ─────────────────────────────────────────────────────────────────────
console.log(`→ Target: ${url}`);
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });

  // Always start at landing for auth
  if (!skipLogin && email && password) {
    console.log('→ Logging in...');
    await page.goto('http://localhost:8081/', { waitUntil: 'networkidle2', timeout: 30_000 });
    await new Promise(r => setTimeout(r, 1200));

    // Switch to admin tab if needed
    if (panel === 'admin' || panel === 'yonetici') {
      const adminBtn = await page.evaluateHandle(() => {
        const els = Array.from(document.querySelectorAll('div, span'));
        return els.find(el => el.textContent?.trim() === 'Yönetici') ?? null;
      });
      if (adminBtn) await adminBtn.asElement()?.click().catch(() => {});
      await new Promise(r => setTimeout(r, 400));
    }

    // Find inputs by placeholder
    const inputs = await page.$$('input');
    let emailInput = null, passInput = null;
    for (const inp of inputs) {
      const ph   = await inp.evaluate(n => n.getAttribute('placeholder') ?? '');
      const type = await inp.evaluate(n => n.getAttribute('type') ?? '');
      if (/posta|email/i.test(ph)) emailInput = inp;
      else if (/şifre|sifre|password/i.test(ph) || type === 'password') passInput = inp;
    }
    if (!emailInput || !passInput) {
      console.warn('⚠ Login inputs not found, capturing landing instead.');
    } else {
      await emailInput.click({ clickCount: 3 });
      await emailInput.type(email, { delay: 12 });
      await passInput.click({ clickCount: 3 });
      await passInput.type(password, { delay: 12 });

      // Click "Giriş Yap" button
      const submitClicked = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('div, button, span'));
        const btn = candidates.find(el => /^Giriş\s*Yap$/i.test(el.textContent?.trim() ?? ''));
        if (btn) {
          // Walk up to find clickable parent
          let target = btn;
          for (let i = 0; i < 4 && target; i++) {
            target.click?.();
            target = target.parentElement;
          }
          return true;
        }
        return false;
      });
      if (!submitClicked) console.warn('⚠ Submit button not found.');

      // Wait for navigation away from login
      await new Promise(r => setTimeout(r, 2200));
    }
  }

  // Navigate to target
  if (!skipLogin) {
    console.log(`→ Navigating: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
  }
  await new Promise(r => setTimeout(r, 1500));

  await mkdir(dirname(outFile), { recursive: true });
  await page.screenshot({ path: outFile, fullPage: false });
  console.log(`✓ Saved: ${outFile}`);
} finally {
  await browser.close();
}
