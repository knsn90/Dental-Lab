// node --test core/store/notificationPrefsDefaults.test.mts
// send-whatsapp-meta opt-OUT çalışır (yalnız whatsapp === false susturur) ve mağaza ayarı
// kaydederken varsayılanlarla birleşmiş TÜM nesneyi yazar. Meta şablonlu bir kategoride
// varsayılan false olursa, herhangi bir anahtarı değiştiren kullanıcıda o WhatsApp sessizce kapanır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS } from './notificationPrefsDefaults.ts';

// send-whatsapp-meta TEMPLATES + LAB_TEMPLATES anahtarları
const META_TEMPLATED = ['new_order', 'approval', 'payment', 'delivery', 'account', 'review_problem', 'review_low', 'review_low_reminder'] as const;

test('Meta şablonlu kategorilerde WhatsApp varsayılanı açık', () => {
  for (const c of META_TEMPLATED) {
    assert.equal(DEFAULT_PREFS.categories[c].whatsapp, true, c);
  }
});
