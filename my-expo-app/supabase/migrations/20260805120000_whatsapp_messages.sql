-- WhatsApp sohbet geçmişi + insan devrini güvenilir tespit
--
-- SORUN: Lab, müşteriye telefondaki WhatsApp Business uygulamasından yazdı ama
-- bot yine cevapladı. Sebep: iş numarası (+90 216 606 66 11) Meta'da
-- `platform_type = CLOUD_API` — saf Cloud API hattı, Coexistence kapalı. Meta
-- `message_echoes` webhook'unu YALNIZ Coexistence (SMB_APP) numaraları için
-- gönderir. Yani `markHumanFromLab()` bu kurulumda hiç tetiklenemiyordu; WABA'da
-- da tek numara var, dolayısıyla telefondaki uygulama BAŞKA bir hatta.
--
-- İKİNCİ SORUN, birincisinin doğal sonucu: Cloud API hattında gelen müşteri
-- mesajlarını lab HİÇBİR YERDE okuyamıyor. WhatsApp Business uygulaması yok,
-- Cloud API'nin gelen kutusu yok. Sohbet yalnız botun gördüğü kadar var.
--
-- ÇÖZÜM: konuşmayı Siman'da saklamak. Bu tablo hem sohbet ekranını besler hem
-- de "bu mesajı biz mi gönderdik" sorusunun tek doğru cevabını verir (wamid).
-- Böylece Coexistence ileride açılırsa, iş numarasından gelen ama bizim
-- göndermediğimiz her mesaj = insanın elle yazdığı mesaj olarak anlaşılır.

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_id      uuid NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  -- Karşı taraf (müşteri) numarası — yön ne olursa olsun sohbetin anahtarı.
  peer_phone  text NOT NULL,
  direction   text NOT NULL CHECK (direction IN ('in', 'out')),
  body        text,
  -- Meta message id. Giden mesajlarda Graph yanıtından alınır; "bu mesajı biz
  -- gönderdik" kararının TEK güvenilir kaynağı. Gelen echo'lar bu listede
  -- yoksa mesajı bir insan elle yazmıştır.
  wamid       text,
  -- Kim yazdı: müşteri / bot / lab çalışanı (elle) / Coexistence echo'su
  source      text NOT NULL CHECK (source IN ('customer', 'bot', 'human', 'echo')),
  -- Siman'dan elle yazan kullanıcı (bot ve müşteri mesajlarında NULL)
  sent_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.whatsapp_messages IS
  'WhatsApp sohbet geçmişi. Cloud API hattında başka gelen kutusu olmadığı için tek kayıt yeri. wamid = "bu mesajı biz gönderdik" kanıtı.';

-- Sohbet ekranı: bir numaranın son mesajları.
CREATE INDEX IF NOT EXISTS idx_wa_messages_thread
  ON public.whatsapp_messages (lab_id, peer_phone, created_at DESC);

-- wamid ile "biz mi gönderdik" sorgusu + aynı webhook'un iki kez işlenmesine karşı
-- koruma (Meta yeniden dener). Kısmi UNIQUE: wamid'i olmayan satırlar serbest.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_messages_wamid
  ON public.whatsapp_messages (wamid) WHERE wamid IS NOT NULL;

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

-- Okuma: whatsapp_sessions ile AYNI yetki (lab manager/admin). Yazma politikası
-- YOK — tüm yazımlar service-role edge function'lardan geçer.
CREATE POLICY "wa_messages_lab_read"
ON public.whatsapp_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = (SELECT auth.uid())
       AND ( p.user_type = 'admin'
             OR ( p.user_type = 'lab'
                  AND p.role = ANY (ARRAY['manager', 'admin'])
                  AND p.lab_id = whatsapp_messages.lab_id ) )
  )
);

-- Sohbet ekranı canlı aksın (yeni mesaj anında düşsün).
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
