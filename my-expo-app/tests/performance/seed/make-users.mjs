#!/usr/bin/env node
/**
 * Create N tenants × M users on a STAGING Supabase project and write
 * tests/performance/seed/users.json for the k6 suite.
 *
 * Uses the service-role key against the Admin API, so it can create confirmed
 * users without e-mail verification.
 *
 *   SUPABASE_URL=https://<staging-ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
 *   node tests/performance/seed/make-users.mjs --tenants 100 --per-tenant 10
 *
 * ⚠️  Refuses to run against the known production project ref. Point it at a
 *     branch or a separate project. Creating 1,000 auth users on production is
 *     not reversible in any pleasant way.
 *
 * Prerequisite: run seed/seed-tenants.sql first — it creates the labs/clinics
 * rows and returns their ids, which this script attaches to the new profiles.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROD_REFS = ['kjwjxqfdsxkxgcgophdy'];

const args = parseArgs(process.argv.slice(2));
const URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANTS = Number(args.tenants ?? 100);
const PER_TENANT = Number(args['per-tenant'] ?? 10);
const PASSWORD = process.env.SEED_PASSWORD || `k6-${randomToken(16)}`;
const OUT = args.out ?? join(__dirname, 'users.json');

if (!URL || !SERVICE_KEY) {
  die('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}
for (const ref of PROD_REFS) {
  if (URL.includes(ref) && process.env.I_REALLY_MEAN_PRODUCTION !== 'yes') {
    die(
      `Refusing to seed users into production project "${ref}".\n` +
        'Create a Supabase branch or a separate staging project and point SUPABASE_URL at it.',
    );
  }
}

/** Roles per tenant — proportions match a real lab (userflows § reference tenant). */
const ROLE_MIX = [
  { user_type: 'admin', role: 'manager', share: 0.1 },
  { user_type: 'lab', role: 'manager', share: 0.2 },
  { user_type: 'lab', role: 'technician', share: 0.4 },
  { user_type: 'doctor', role: null, share: 0.2 },
  { user_type: 'clinic_admin', role: 'clinic_admin', share: 0.1 },
];

const tenantCtx = loadTenantContext();

console.log(
  `Seeding ${TENANTS} tenants × ${PER_TENANT} users = ${TENANTS * PER_TENANT} auth users`,
);
console.log(`Target: ${URL}`);
console.log(`Password for all seeded users: ${PASSWORD}`);

const users = [];
let created = 0;
let failed = 0;

for (let t = 0; t < TENANTS; t++) {
  const ctx = tenantCtx[t] || {};
  const roles = expandRoles(PER_TENANT);

  for (let i = 0; i < PER_TENANT; i++) {
    const spec = roles[i];
    const email = `k6.t${t}.u${i}.${spec.user_type}@perf.invalid`;

    const metadata = {
      full_name: `K6 ${spec.user_type} ${t}-${i}`,
      user_type: spec.user_type,
      ...(spec.role ? { role: spec.role } : {}),
      ...(ctx.lab_id && spec.user_type !== 'doctor' && spec.user_type !== 'clinic_admin'
        ? { lab_id: ctx.lab_id } : {}),
      ...(ctx.clinic_id && (spec.user_type === 'doctor' || spec.user_type === 'clinic_admin')
        ? { clinic_id: ctx.clinic_id } : {}),
    };

    const res = await fetch(`${URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: metadata,
        app_metadata: metadata,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      // 422 = already exists; that is fine on a re-run.
      if (res.status !== 422) {
        failed++;
        if (failed <= 5) console.error(`  ✗ ${email}: ${res.status} ${text.slice(0, 160)}`);
      }
    } else {
      created++;
    }

    users.push({
      email,
      password: PASSWORD,
      user_type: spec.user_type,
      role: spec.role,
      lab_id: ctx.lab_id ?? null,
      clinic_id: ctx.clinic_id ?? null,
      tenant: t,
    });
  }

  if ((t + 1) % 10 === 0) {
    console.log(`  … ${t + 1}/${TENANTS} tenants (${created} created, ${failed} failed)`);
  }
}

writeFileSync(OUT, JSON.stringify(users, null, 2));

console.log('');
console.log(`✅ ${created} users created, ${failed} failed, ${users.length} written to ${OUT}`);
console.log('');
console.log('Next:');
console.log(`  k6 run -e USERS_FILE=${OUT} -e BASE_URL=${URL} -e ANON_KEY=<anon> \\`);
console.log('        tests/performance/multitenant.js');
console.log('');
console.log('To remove them afterwards, see the teardown section of seed-tenants.sql.');

// ── helpers ─────────────────────────────────────────────────────────────────

function expandRoles(count) {
  const out = [];
  for (const r of ROLE_MIX) {
    const n = Math.max(1, Math.round(count * r.share));
    for (let i = 0; i < n && out.length < count; i++) out.push(r);
  }
  while (out.length < count) out.push(ROLE_MIX[2]); // pad with technicians
  return out.slice(0, count);
}

/**
 * seed-tenants.sql writes its output here so lab_id / clinic_id can be attached.
 * Format: [{ "tenant": 0, "lab_id": "...", "clinic_id": "..." }, …]
 */
function loadTenantContext() {
  const p = join(__dirname, 'tenants.json');
  if (!existsSync(p)) {
    console.warn(
      `⚠️  ${p} not found — users will be created without lab_id/clinic_id.\n` +
        '   Run seed-tenants.sql first and save its JSON output there, otherwise\n' +
        '   multitenant.js cannot verify isolation.',
    );
    return {};
  }
  const rows = JSON.parse(readFileSync(p, 'utf8'));
  const map = {};
  for (const r of rows) map[r.tenant] = r;
  return map;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out;
}

function randomToken(n) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function die(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}
