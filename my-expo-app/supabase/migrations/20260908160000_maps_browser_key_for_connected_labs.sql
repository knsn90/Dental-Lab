-- Klinik/hekim panelinde kurye takip haritası Google yerine Leaflet'e düşüyordu:
-- get_active_provider('maps') lab_id = get_my_lab_id() ile süzüyor, get_my_lab_id()
-- ise profiles.lab_id okuyor — klinik/hekim kullanıcılarında bu alan NULL.
--
-- provider_credentials tablosu courier + maps + messaging sırlarını tuttuğu için
-- kliniğe TABLO erişimi verilemez. Bunun yerine YALNIZ maps tarayıcı anahtarını
-- döndüren dar bir SECURITY DEFINER fonksiyon: lab/admin davranışı aynı kalır,
-- klinik/hekim yalnızca BAĞLI OLDUĞU labların anahtarını görür (çapraz kiracı yok).
create or replace function public.get_maps_browser_key()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select pc.credentials->>'api_key'
    from provider_credentials pc
   where pc.type = 'maps'
     and pc.provider = 'google-maps'
     and pc.is_active = true
     and (
       pc.lab_id = get_my_lab_id()
       or pc.lab_id in (select my_connected_lab_ids())
     )
   limit 1
$$;

revoke all on function public.get_maps_browser_key() from public;
revoke all on function public.get_maps_browser_key() from anon;
grant execute on function public.get_maps_browser_key() to authenticated;

comment on function public.get_maps_browser_key() is
  'Google Maps tarayıcı anahtarı (yalnız type=maps). Lab/admin: kendi labı; klinik/hekim: my_connected_lab_ids(). provider_credentials''in diğer türlerini (courier/messaging) ASLA açmaz.';
