/**
 * ConnectCodeField — kayıt formunda zorunlu lab bağlantı kodu.
 *
 * Kod lab panelindeki "Klinik Bağlantıları"ndan alınır (davet kodu ya da public
 * katılım kodu). Kayıtta yalnız metadata'ya yazılır; e-posta doğrulandıktan sonra
 * bekleme ekranı `clinic_signup_connect` ile kullanır. Burada sunucuya sorulmaz:
 * oturumsuz bir "kod var mı" kontrolü kod tahminine kapı açardı.
 *
 * Lab'ın kendi alan adından (hostLab.status 'found') açılan formda alan YOK:
 * kod sunucudan gelir, yerine "X laboratuvarına kayıt oluyorsunuz" notu çizilir.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { KeyRound, Building2 } from '../../../core/ui/icons';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { AuthInput, AUTH, AUTH_FONT } from './AuthShell';
import type { HostSignupLab } from '../hooks/useHostSignupLab';

const CONNECT_CODE_RE = /^[A-Z0-9]{4,12}$/;

export function normalizeConnectCode(v: string): string {
  return v.replace(/\s+/g, '').toUpperCase();
}

/** Boşsa / biçim dışıysa hata metni, geçerliyse undefined. */
export function connectCodeError(v: string): string | undefined {
  const c = normalizeConnectCode(v);
  if (!c) return 'Bağlantı kodu zorunlu';
  if (!CONNECT_CODE_RE.test(c)) return 'Geçersiz kod';
  return undefined;
}

const SAGE = '#7A9B85';

function HostLabNotice({ labName }: { labName: string }) {
  const MT = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      padding: 14, borderRadius: 14, marginBottom: 14, borderWidth: 1,
      backgroundColor: isDark ? 'rgba(122,155,133,0.14)' : 'rgba(122,155,133,0.10)',
      borderColor: isDark ? 'rgba(122,155,133,0.30)' : 'rgba(122,155,133,0.35)',
    }}>
      <View style={{
        width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        backgroundColor: isDark ? 'rgba(122,155,133,0.22)' : 'rgba(122,155,133,0.18)',
      }}>
        <Building2 size={17} color={isDark ? '#A9C4B2' : '#5C7E68'} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{
          fontFamily: AUTH_FONT.sans, fontSize: 11, fontWeight: '600', letterSpacing: 0.3,
          color: isDark ? (MT.ink3 as string) : AUTH.inkSoft,
        }}>
          Kayıt olduğunuz laboratuvar
        </Text>
        <Text style={{
          fontFamily: AUTH_FONT.display, fontSize: 15, fontWeight: '800', marginTop: 2,
          color: isDark ? (MT.ink as string) : AUTH.ink,
        }}>
          {labName}
        </Text>
        <Text style={{
          fontFamily: AUTH_FONT.sans, fontSize: 12, lineHeight: 17, marginTop: 6,
          color: isDark ? (MT.ink2 as string) : AUTH.inkSoft,
        }}>
          Davet kodu gerekmez. Hesabınız laboratuvar onayından sonra açılır; onaylanınca e-posta ve WhatsApp ile haber veririz.
        </Text>
      </View>
    </View>
  );
}

export function ConnectCodeField({
  value, onChangeText, error, hostLab,
}: {
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  /** useHostSignupLab() sonucu. 'found' → alan yerine lab notu; 'loading' → hiçbir şey. */
  hostLab?: HostSignupLab;
}) {
  const MT = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  if (hostLab?.status === 'found') return <HostLabNotice labName={hostLab.labName} />;
  if (hostLab?.status === 'loading') return null;
  return (
    <View>
      <Text style={{
        fontFamily: AUTH_FONT.sans, fontSize: 12, lineHeight: 17, marginBottom: 8,
        color: isDark ? (MT.ink3 as string) : AUTH.inkSoft,
      }}>
        Kayıt için çalıştığın laboratuvarın verdiği bağlantı kodu gerekir.
      </Text>
      <AuthInput
        value={value}
        onChangeText={(t) => onChangeText(normalizeConnectCode(t))}
        placeholder="Lab bağlantı kodu"
        autoCapitalize="characters"
        error={error}
        icon={<KeyRound size={15} color={AUTH.inkMuted} strokeWidth={1.8} />}
      />
    </View>
  );
}
