#!/usr/bin/env node
/**
 * generate-vapid-keys.mjs
 *
 * VAPID public/private key çifti üretir.
 * Public key → EXPO_PUBLIC_VAPID_PUBLIC_KEY (client bundle)
 * Private key + Public key → Supabase Edge Function Secrets
 *
 * Kullanım: node scripts/generate-vapid-keys.mjs
 */
import webpush from 'web-push';

const keys = webpush.generateVAPIDKeys();

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('VAPID Keys generated');
console.log('══════════════════════════════════════════════════════════════════\n');

console.log('1. .env (client — public key only):\n');
console.log(`EXPO_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}\n`);

console.log('2. Supabase Edge Function Secrets (private + public):\n');
console.log('   supabase secrets set \\');
console.log(`     VAPID_PUBLIC_KEY="${keys.publicKey}" \\`);
console.log(`     VAPID_PRIVATE_KEY="${keys.privateKey}" \\`);
console.log(`     VAPID_SUBJECT="mailto:noreply@nexadent.net"\n`);

console.log("3. Veya Dashboard'tan elle:");
console.log('   Supabase Dashboard → Edge Functions → send-web-push → Secrets');
console.log(`     VAPID_PUBLIC_KEY  = ${keys.publicKey}`);
console.log(`     VAPID_PRIVATE_KEY = ${keys.privateKey}`);
console.log(`     VAPID_SUBJECT     = mailto:noreply@nexadent.net\n`);
