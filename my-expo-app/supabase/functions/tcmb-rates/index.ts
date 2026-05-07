/**
 * TCMB-rates edge function — Türkiye Cumhuriyet Merkez Bankası
 * günlük döviz kurlarını çeker.
 *
 * Endpoint: https://www.tcmb.gov.tr/kurlar/today.xml
 *  - 15:30 sonrası güncel rate yayınlanır
 *  - Hafta sonu son iş gününün kuru kullanılır
 *
 * Response shape:
 *   { ok: true, rates: [{ currency, rate }] }
 *   { ok: false, error }
 *
 * Frontend: core/money/currency.ts → fetchRatesFromTCMB()
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
// "ForexSelling" tag'i en üst düzey güncel satış kuru (TCMB'nin standart bankalar arası satış kuru)

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // TCMB güncel kur XML'i
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

    // ── Parse XML ──
    // Format:
    //   <Currency Kod="EUR" CurrencyCode="EUR">
    //     <Unit>1</Unit>
    //     <ForexSelling>38.1234</ForexSelling>
    //     ...
    //   </Currency>
    const rates: { currency: string; rate: number }[] = [];

    for (const code of TARGET_CURRENCIES) {
      // Bul: <Currency ... CurrencyCode="EUR"> ... </Currency>
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
        // Rate: 1 unit foreign = X TRY
        // TCMB'de unit genelde 1, JPY gibi exotic'lerde 100 olabilir
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

    return new Response(
      JSON.stringify({ ok: true, rates, fetchedAt: new Date().toISOString() }),
      { headers: CORS_HEADERS, status: 200 },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? 'TCMB bağlantı hatası' }),
      { headers: CORS_HEADERS, status: 200 },
    );
  }
});
