// integration-status — Hangi entegrasyon secret'larının server-side ENV'de
// tanımlı olduğunu döner (sadece varlık/yokluk; değerler ASLA döndürülmez).
//
// UI bu bilgiyle "sistemde tanımlı" rozetini gösterir → kullanıcı API key'i
// yeniden girmek zorunda kalmaz.
//
// Output:
//   {
//     ok: true,
//     env: {
//       anthropic:   boolean,
//       openai:      boolean,
//       mapbox:      boolean,
//       google_maps: boolean,
//       whatsapp_meta: boolean,
//       twilio:      boolean,
//       netgsm:      boolean,
//     }
//   }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const has = (k: string) => Boolean(Deno.env.get(k));

  const env = {
    anthropic:      has('ANTHROPIC_API_KEY'),
    openai:         has('OPENAI_API_KEY'),
    mapbox:         has('MAPBOX_ACCESS_TOKEN') || has('EXPO_PUBLIC_MAPBOX_TOKEN'),
    google_maps:    has('GOOGLE_MAPS_API_KEY'),
    whatsapp_meta:  has('WHATSAPP_ACCESS_TOKEN'),
    twilio:         has('TWILIO_ACCOUNT_SID'),
    netgsm:         has('NETGSM_USERNAME'),
    iletimerkezi:   has('ILETIMERKEZI_USERNAME'),
    telegram:       has('TELEGRAM_BOT_TOKEN'),
  };

  return new Response(JSON.stringify({ ok: true, env }), {
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
});
