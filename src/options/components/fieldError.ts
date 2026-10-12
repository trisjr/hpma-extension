import type { Lang, MessageKey } from '@/shared/i18n';
import type { FieldError } from '@/shared/pacingForm';

import { translate } from '@/shared/i18n';

// `floorKey`: thông điệp riêng cho ngưỡng an toàn của ô delay (giây hoặc %).
export default function fieldErrorText(
  lang: Lang,
  error: FieldError,
  floorKey: MessageKey
): string {
  if (error.kind === 'invalid') return translate(lang, 'opt.err.invalid');
  if (error.kind === 'min') {
    return translate(lang, floorKey, { min: error.min });
  }
  return translate(lang, 'opt.err.range', { min: error.min, max: error.max });
}
