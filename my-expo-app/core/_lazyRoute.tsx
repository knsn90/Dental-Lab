/**
 * lazyRoute — Expo Router route dosyalarını ayrı chunk'a böler.
 *
 * Kullanım:
 *   export default lazyRoute(() => import('../../modules/x/X'), 'XScreen');
 *
 * Yerel state'li route wrapper içinden de kullanılabilir:
 *   const LazyX = lazyRoute(() => import('../../modules/x/X'), 'XScreen');
 *   return <LazyX panel="admin" />;
 */
import React from 'react';

export function lazyRoute<P = any>(
  loader: () => Promise<any>,
  exportName?: string,
): React.ComponentType<P> {
  const Comp = React.lazy(async () => {
    const mod = await loader();
    const C = exportName ? mod[exportName] : (mod.default ?? mod);
    return { default: C as React.ComponentType<P> };
  });
  return function LazyRouteWrapper(props: P) {
    return (
      <React.Suspense fallback={null}>
        <Comp {...(props as any)} />
      </React.Suspense>
    );
  };
}
