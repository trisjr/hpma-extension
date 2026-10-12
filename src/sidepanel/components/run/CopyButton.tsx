import { JSX, useState } from 'react';
import type { Lang } from '@/shared/i18n';

import { translate } from '@/shared/i18n';

import Icon from '../Icon';

type CopyButtonProps = {
  lang: Lang;
  text: string;
  label: string;
};

// Báo kết quả bằng vùng aria-live, không dùng toast (SPEC-UI-003 §10).
export default function CopyButton({
  lang,
  text,
  label,
}: CopyButtonProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <>
      <button
        type='button'
        onClick={copy}
        className='border-base-content/20 inline-flex h-9 items-center gap-1.5 rounded-md border bg-base-100 px-3 text-[13px] font-medium'
      >
        <Icon name='copy' size={14} />
        {label}
      </button>
      <span aria-live='polite' className='sr-only'>
        {copied ? translate(lang, 'result.copied') : ''}
      </span>
    </>
  );
}
