/**
 * TCMB-rates edge function — TCMB günlük döviz kurlarını çeker VE global
 * currency_rates satırlarını (lab_id NULL, source='tcmb') günceller.
 *
 * Endpoint: https://www.tcmb.gov.tr/kurlar/today.xml (15:30 sonrası güncel).
 * Persist: bugünün global satırlarını sil + ekle (lab_id NULL → unique index
 * NULL'ları ayrı saydığı için upsert yerine delete+insert ile tek satır garanti).
 * Böylece get_currency_rate(bugün) manuel kur yoksa güncel TCMB'yi döner.
 *
 * Çağrı: app (fetchRatesFromTCMB) + günlük pg_cron (tcmb-daily-rates).
 */

// @ts-ignore  Deno runtime
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json',
};

const TARGET_CURRENCIES = ['EUR', 'USD', 'GBP'];

async function persistRates(rates: { currency: string; rate: number }[]): Promise<number> {
  // @ts-ignore Deno
  const url = Deno.env.get('SUPABASE_URL');
  // @ts-ignore Deno
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key || rates.length === 0) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  try {
    // Bugünün global (lab_id NULL) TRY kurlarını sil
    const curList = rates.map((r) => r.currency).join(',');
    await fetch(
      `${url}/rest/v1/currency_rates?lab_id=is.null&base_currency=eq.TRY&effective_date=eq.${today}&currency=in.(${curList})`,
      { method: 'DELETE', headers: h },
    );
    // Yeni satırları ekle
    const rows = rates.map((r) => ({
      lab_id: null,
      currency: r.currency,
      base_currency: 'TRY',
      rate: r.rate,
      effective_date: today,
      source: 'tcmb',
    }));
    const res = await fetch(`${url}/rest/v1/currency_rates`, {
      method: 'POST',
      headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    });
    return res.ok ? rows.length : 0;
  } catch (_e) {
    return 0;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const tcmbRes = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 dental-lab-app' },
    });

    if (!tcmbRes.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `TCMB HTTP ${tcmbRes.status}` }),
        { headers: CORS_HEADERS, status: 200 },
      );
    }

    const xml = await tcmbRes.text();
    const rates: { currency: string; rate: number }[] = [];

    for (const code of TARGET_CURRENCIES) {
      const blockRegex = new RegExp(
        `<Currency[^>]*CurrencyCode="${code}"[^>]*>([\\s\\S]*?)</Currency>`,
        'i',
      );
      const block = xml.match(blockRegex)?.[1];
      if (!block) continue;

      const unit = parseFloat(block.match(/<Unit>([\d.]+)<\/Unit>/)?.[1] ?? '1');
      const forexSelling = parseFloat(
        block.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/)?.[1] ?? '',
      );

      if (!isNaN(forexSelling) && forexSelling > 0) {
        const ratePerUnit = forexSelling / unit;
        rates.push({ currency: code, rate: Number(ratePerUnit.toFixed(4)) });
      }
    }

    if (rates.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: 'TCMB XML parse edilemedi' }),
        { headers: CORS_HEADERS, status: 200 },
      );
    }

    const persisted = await persistRates(rates);

    return new Response(
      JSON.stringify({ ok: true, rates, persisted, fetchedAt: new Date().toISOString() }),
      { headers: CORS_HEADERS, status: 200 },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? 'TCMB bağlantı hatası' }),
      { headers: CORS_HEADERS, status: 200 },
    );
  }
});
