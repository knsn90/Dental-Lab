#!/bin/bash
# iOS yerel production build + TestFlight gönderimi.
#
# NEDEN: EAS Free plan aylık iOS build kotası bitince (veya sadece daha pratik
# olduğu için) build bu Mac'te alınır. `eas build --local` projeyi HER SEFERİNDE
# boş bir geçici klasöre kopyalar (çalışma klasörünün boş olması zorunlu), bu
# yüzden React Native'in hazır kütüphanelerini (~40 MB) yeniden indirir. Maven
# bağlantısı ara sıra 3 KB/s'e düşüyor ve build 8 saate çıkıyordu.
#
# ÇÖZÜM: tarball'ları ~/.siman-ios-cache içinde tut, pod install'a yerel dosya
# yolunu göster → indirme HİÇ yapılmaz.
#
#   RCT_TESTONLY_RNCORE_TARBALL_PATH → ReactNativeCore  (rncore.rb)
#   RCT_USE_LOCAL_RN_DEP             → ReactNativeDependencies (rndependencies.rb)
#
# DİKKAT: Önbellekteki tarball'lar **release** varyantıdır; bu betik yalnız
# production build için kullanılır. Dev-client (development profili) build'inde
# KULLANMA — debug varyantı gerekir.
#
# Kullanım:
#   scripts/ios-local-build.sh            # build alır, sonra sorar
#   scripts/ios-local-build.sh --submit   # bitince TestFlight'a gönderir
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$HOME/.siman-ios-cache"
OUT_DIR="${IOS_BUILD_OUT:-$HOME/Desktop/ios-builds}"
RN_VERSION="$(node -p "require('$APP_DIR/node_modules/react-native/package.json').version")"
CORE="$CACHE/reactnative-core-$RN_VERSION-release.tar.gz"
DEPS="$CACHE/reactnative-dependencies-$RN_VERSION-release.tar.gz"
BASE="https://repo1.maven.org/maven2/com/facebook/react/react-native-artifacts/$RN_VERSION"

mkdir -p "$CACHE" "$OUT_DIR"

# Önbellek eksikse bir kereliğine indir (sağlıklı bağlantıda ~5 sn).
[ -s "$CORE" ] || curl -fL --retry 3 -o "$CORE" "$BASE/react-native-artifacts-$RN_VERSION-reactnative-core-release.tar.gz"
[ -s "$DEPS" ] || curl -fL --retry 3 -o "$DEPS" "$BASE/react-native-artifacts-$RN_VERSION-reactnative-dependencies-release.tar.gz"

export RCT_TESTONLY_RNCORE_TARBALL_PATH="$CORE"
export RCT_USE_LOCAL_RN_DEP="$DEPS"

STAMP="$(date +%Y%m%d-%H%M)"
IPA="$OUT_DIR/siman-$STAMP.ipa"

echo "▸ RN $RN_VERSION · önbellek: $CACHE · çıktı: $IPA"
cd "$APP_DIR"
npx eas-cli build --platform ios --profile production --local --non-interactive --output "$IPA"

echo "✔ Build hazır: $IPA"
/usr/bin/unzip -qo "$IPA" -d "$OUT_DIR/.inspect-$STAMP" \
  && /usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$OUT_DIR/.inspect-$STAMP/Payload/Siman.app/Info.plist" \
  | sed 's/^/  build numarası: /' \
  && rm -rf "$OUT_DIR/.inspect-$STAMP"

if [ "${1:-}" = "--submit" ]; then
  npx eas-cli submit --platform ios --profile production --path "$IPA" --non-interactive
else
  echo "TestFlight'a göndermek için:"
  echo "  npx eas-cli submit --platform ios --profile production --path \"$IPA\" --non-interactive"
fi
