// Metro config — Expo + NativeWind
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// ESM resolution — package.json "exports" field'ı kullanılsın.
// Bu sayede lucide-react-native gibi paketler ESM versiyonundan resolve edilir;
// experiments.treeShaking ile birlikte kullanılmayan icon'lar bundle'dan düşer.
// Aksi halde CJS barrel tüm icon setini (~2MB) entry'ye gömüyordu.
config.resolver.unstable_enablePackageExports = true;

module.exports = withNativeWind(config, { input: './global.css' });
