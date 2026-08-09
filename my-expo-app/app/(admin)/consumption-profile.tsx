import { Redirect } from 'expo-router';

/**
 * Eski derin baglanti — bu sayfa artik Stok & Depo hub'inda bir alt sekme.
 * Tek giris noktasi hub olsun diye yonlendiriyoruz.
 */
export default function AdminConsumptionProfileRedirect() {
  return <Redirect href="/(admin)/stock?tab=setup&sub=consumption_profile" />;
}
