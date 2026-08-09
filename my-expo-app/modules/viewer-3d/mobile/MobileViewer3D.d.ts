// MobileViewer3D tip bildirimi — TS'in platform-özel (.native/.web) dosyaları base
// isimle çözmesi için. Metro `.d.ts`'i yok sayar, doğru varyantı (.native/.web) bundle'lar.
import type { Viewer3DProps } from '../types';

declare const MobileViewer3D: (props: Viewer3DProps) => JSX.Element | null;
export default MobileViewer3D;
