// Vercel Function — ziyaretçinin ülkesi (ISO 3166-1 alpha-2), Vercel'in kendi IP konum başlığından.
// Üçüncü taraf servis yok; IP okunmaz, saklanmaz, loglanmaz. Kayıt ve "Yeni Sağlık Kurumu"
// formlarında varsayılan ülke için (core/geo/detectCountry.ts). Kullanıcı formda değiştirebilir.
module.exports = (req, res) => {
  const c = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ country: /^[A-Z]{2}$/.test(c) ? c : null });
};
