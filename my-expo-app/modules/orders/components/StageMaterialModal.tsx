/**
 * StageMaterialModal — aşama malzeme adımının TEK giriş noktası.
 *
 * `lab_settings.inventory_qtyless_enabled` bayrağına göre iki akıştan birini
 * gösterir:
 *   • açık  → MaterialSelectModal  (D2: teknisyen yalnız ürün seçer, miktar yok)
 *   • kapalı→ MaterialConfirmModal (bugünkü miktar girişli akış)
 *
 * Bayrak okunana kadar hiçbir modal açılmaz — yanlış akışın bir an görünüp
 * değişmesi kullanıcıda "sistem karar veremedi" hissi yaratır.
 *
 * Geri dönüş: bayrağı false yapmak yeterlidir, kod değişikliği gerekmez.
 */

import React, { useEffect, useState } from 'react';
import { fetchQtylessEnabled } from '../api';
import { MaterialConfirmModal } from './MaterialConfirmModal';
import { MaterialSelectModal } from './MaterialSelectModal';

interface Props {
  visible: boolean;
  stageId: string | null;
  accentColor?: string;
  /** false → aşama geçişini caller yönetir */
  advanceStage?: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}

export function StageMaterialModal(props: Props) {
  const [qtyless, setQtyless] = useState<boolean | null>(null);

  useEffect(() => {
    if (!props.visible) return;
    let alive = true;
    fetchQtylessEnabled().then(v => { if (alive) setQtyless(v); });
    return () => { alive = false; };
  }, [props.visible]);

  if (!props.visible || qtyless === null) return null;

  return qtyless
    ? <MaterialSelectModal {...props} />
    : <MaterialConfirmModal {...props} />;
}

export default StageMaterialModal;
