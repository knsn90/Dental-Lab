/**
 * F1 — Login / session bootstrap.
 *
 * Mirrors core/store/authStore.ts + the panel _layout guards:
 *   token → profiles(select *) → rpc/get_my_permissions → panel guard re-read.
 */
import { check } from 'k6';
import { login, bootstrap, authHeaders, refresh } from '../lib/auth.js';
import { restGet } from '../lib/http.js';
import { newTally } from '../lib/http.js';
import { measure } from '../lib/metrics.js';

/**
 * A full cold login, as if the user just opened the app on a new device.
 * Expensive by design (bcrypt) — do not run this every iteration in load.js.
 */
export function flowLogin(user) {
  return measure('login', () => {
    const t = newTally();
    const session = login(user);
    if (!session) return { ...t, ok: false };
    t.requests += 1;

    bootstrap(session);
    t.requests += 2;

    // Panel guard self-heal: _layout.tsx re-reads the profile on mount.
    restGet(session, `profiles?id=eq.${session.userId}&select=id,user_type,role,lab_id,clinic_id`, {
      flow: 'login', call: 'profile_guard', tally: t,
    });

    const ok = check(session, {
      'session has token': (s) => !!s.token,
      'session has profile': (s) => !!s.profile,
    });

    return { ...t, ok: t.ok && ok, session };
  });
}

/** Token refresh path — cheap, but exercised constantly by long-lived sessions. */
export function flowRefresh(session) {
  return measure('login', () => {
    const t = newTally();
    const refreshed = refresh(session);
    t.requests += 1;
    return { ...t, ok: !!refreshed };
  });
}

/**
 * Verify the JWT actually carries what RLS needs. If `lab_id` is absent from the
 * token, every RLS predicate must hit `profiles` — the root cause in analysis §2.1.
 * Reported as a check so the suite documents the state rather than failing on it.
 */
export function checkJwtClaims(session) {
  const parts = String(session.token).split('.');
  let claims = {};
  try {
    claims = JSON.parse(decodeBase64Url(parts[1]));
  } catch { /* ignore */ }

  check(claims, {
    'jwt has sub': (c) => !!c.sub,
    'jwt carries lab_id (avoids per-row profiles lookup)': (c) =>
      !!(c.lab_id || (c.app_metadata && c.app_metadata.lab_id) ||
         (c.user_metadata && c.user_metadata.lab_id)),
    'jwt carries user_type': (c) =>
      !!(c.user_type || (c.app_metadata && c.app_metadata.user_type)),
  });
  return claims;
}

function decodeBase64Url(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  // k6 exposes encoding via the global `encoding` module in newer versions; fall
  // back to a manual decoder so this works everywhere.
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let out = '';
  for (let i = 0; i < b64.length; i += 4) {
    const n =
      (chars.indexOf(b64[i]) << 18) | (chars.indexOf(b64[i + 1]) << 12) |
      ((chars.indexOf(b64[i + 2]) & 63) << 6) | (chars.indexOf(b64[i + 3]) & 63);
    out += String.fromCharCode((n >> 16) & 255);
    if (b64[i + 2] !== '=') out += String.fromCharCode((n >> 8) & 255);
    if (b64[i + 3] !== '=') out += String.fromCharCode(n & 255);
  }
  return out;
}

export { authHeaders };
