import type { Lang } from '@/shared/i18n';
import type { CurfewConfig } from '@/shared/settings';

import { translate } from '@/shared/i18n';

// Nhãn curfew ở footer/popup theo cấu hình Options (không còn hard-code 0h–6h).
export default function curfewLabel(lang: Lang, curfew: CurfewConfig): string {
  if (!curfew.on || curfew.from === curfew.to) {
    return translate(lang, 'footer.curfewOff');
  }
  return translate(lang, 'footer.curfew', { from: curfew.from, to: curfew.to });
}
