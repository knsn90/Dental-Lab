/**
 * Authentication for the k6 suite.
 *
 * Mirrors what the app actually does (lib/supabase.ts + core/store/authStore.ts):
 *   1. POST /auth/v1/token?grant_type=password
 *   2. GET  /rest/v1/profiles?id=eq.<sub>&select=*
 *   3. POST /rest/v1/rpc/get_my_permissions
 *
 * Tokens are cached per-VU. A VU logs in once and reuses the JWT, exactly like a
 * real browser session — logging in on every iteration would make GoTrue's bcrypt
 * cost dominate the results and tell you nothing about the app.
 */
import http from 'k6/http';
import { check } from 'k6';
import exec from 'k6/execution';
import { SharedArray } from 'k6/data';
import { AUTH, REST, ANON_KEY, REQUEST_TIMEOUT } from '../config.js';
import { apiDuration, loginFailures, tokenRefreshes } from './metrics.js';

/**
 * Test users, loaded once and shared across all VUs.
 *
 * File format (tests/performance/seed/users.json):
 *   [{ "email": "...", "password": "...", "lab_id": "uuid", "user_type": "lab",
 *      "role": "manager", "tenant": 0 }]
 *
 * Generate it with seed/seed-tenants.sql + seed/make-users.mjs.
 */
export const USERS = new SharedArray('users', function () {
  // NOTE: k6's open() resolves relative paths against THIS file (lib/auth.js),
  // not against the scenario script. Hence '../seed/…'. Pass an absolute path
  // via USERS_FILE if you keep credentials elsewhere.
  const path = __ENV.USERS_FILE || '../seed/users.json';
  let raw;
  try {
    raw = open(path);
  } catch (e) {
    throw new Error(
      `Could not open users file "${path}".\n` +
        'Copy seed/users.json.example to seed/users.json and fill in real credentials.\n' +
        'Relative paths resolve against tests/performance/lib/, so use "../seed/users.json"\n' +
        'or pass an absolute path: -e USERS_FILE=/abs/path/users.json',
    );
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`users file "${path}" is empty or not an array`);
  }
  return parsed;
});

/** Per-VU session cache. Survives across iterations within the same VU. */
const sessions = {};

/**
 * Pick a user for this VU. Deterministic, so a VU keeps the same identity for the
 * whole run (realistic) and so tenant distribution is even.
 */
export function userForVU(vu = exec.vu.idInTest) {
  return USERS[(vu - 1) % USERS.length];
}

/** Users belonging to a specific tenant index — used by multitenant.js. */
export function usersOfTenant(tenantIdx) {
  return USERS.filter((u) => u.tenant === tenantIdx);
}

/** Distinct tenant indices present in the users file. */
export function tenantIndices() {
  const seen = {};
  for (const u of USERS) if (u.tenant !== undefined) seen[u.tenant] = true;
  return Object.keys(seen).map(Number).sort((a, b) => a - b);
}

/**
 * Log in and bootstrap the session exactly like the app does.
 * Returns a session object or null.
 */
export function login(user) {
  const res = http.post(
    `${AUTH}/token?grant_type=password`,
    JSON.stringify({ email: user.email, password: user.password }),
    {
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      tags: { name: 'auth:login', flow: 'login' },
      timeout: REQUEST_TIMEOUT,
    },
  );
  apiDuration.add(res.timings.duration, { flow: 'login', call: 'token' });

  const ok = check(res, {
    'login 200': (r) => r.status === 200,
    'login returns access_token': (r) => {
      try {
        return !!r.json('access_token');
      } catch {
        return false;
      }
    },
  });

  loginFailures.add(ok ? 0 : 1);
  if (!ok) {
    console.error(`login failed for ${user.email}: ${res.status} ${String(res.body).slice(0, 200)}`);
    return null;
  }

  const body = res.json();
  return {
    token: body.access_token,
    refreshToken: body.refresh_token,
    userId: body.user && body.user.id,
    expiresAt: Date.now() + (body.expires_in || 3600) * 1000,
    user,
    profile: null,
    permissions: null,
  };
}

/** Refresh an expiring JWT instead of paying bcrypt again — what the app does. */
export function refresh(session) {
  const res = http.post(
    `${AUTH}/token?grant_type=refresh_token`,
    JSON.stringify({ refresh_token: session.refreshToken }),
    {
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      tags: { name: 'auth:refresh', flow: 'login' },
      timeout: REQUEST_TIMEOUT,
    },
  );
  apiDuration.add(res.timings.duration, { flow: 'login', call: 'refresh' });
  if (res.status !== 200) return null;
  tokenRefreshes.add(1);
  const body = res.json();
  session.token = body.access_token;
  session.refreshToken = body.refresh_token;
  session.expiresAt = Date.now() + (body.expires_in || 3600) * 1000;
  return session;
}

/**
 * The rest of the app's bootstrap: profile + permissions.
 * Separated from login() so smoke.js can measure them independently.
 */
export function bootstrap(session) {
  const prof = http.get(
    `${REST}/profiles?id=eq.${session.userId}&select=*`,
    { headers: authHeaders(session), tags: { name: 'auth:profile', flow: 'login' }, timeout: REQUEST_TIMEOUT },
  );
  apiDuration.add(prof.timings.duration, { flow: 'login', call: 'profile' });

  const perms = http.post(
    `${REST}/rpc/get_my_permissions`,
    '{}',
    {
      headers: { ...authHeaders(session), 'Content-Type': 'application/json' },
      tags: { name: 'auth:permissions', flow: 'login' },
      timeout: REQUEST_TIMEOUT,
    },
  );
  apiDuration.add(perms.timings.duration, { flow: 'login', call: 'permissions' });

  check(prof, { 'profile 200': (r) => r.status === 200 });
  check(perms, { 'permissions 200': (r) => r.status === 200 });

  try {
    const arr = prof.json();
    session.profile = Array.isArray(arr) ? arr[0] : arr;
  } catch { /* leave null */ }
  try {
    session.permissions = perms.json();
  } catch { /* leave null */ }

  // lab_id from the live profile beats whatever the users file claims.
  if (session.profile && session.profile.lab_id) {
    session.user = { ...session.user, lab_id: session.profile.lab_id };
  }
  return session;
}

/**
 * Get this VU's session, logging in on first use and refreshing when near expiry.
 * This is the entry point every flow should use.
 */
export function getSession(user = userForVU()) {
  const key = `${exec.vu.idInTest}:${user.email}`;
  let s = sessions[key];

  if (s && s.expiresAt - Date.now() < 60_000) {
    s = refresh(s) || null;
    if (!s) delete sessions[key];
  }

  if (!s) {
    s = login(user);
    if (!s) return null;
    bootstrap(s);
    sessions[key] = s;
  }
  return s;
}

/** Drop this VU's cached session — call after a 401 to force a clean re-login. */
export function invalidateSession(user = userForVU()) {
  delete sessions[`${exec.vu.idInTest}:${user.email}`];
}

/** Standard PostgREST headers for an authenticated request. */
export function authHeaders(session, extra = {}) {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${session.token}`,
    Accept: 'application/json',
    ...extra,
  };
}

/** Headers for a write that should return the created row (PostgREST). */
export function writeHeaders(session, extra = {}) {
  return authHeaders(session, {
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extra,
  });
}

/** Headers for an exact-count HEAD request. */
export function countHeaders(session) {
  return authHeaders(session, { Prefer: 'count=exact', Range: '0-0' });
}
