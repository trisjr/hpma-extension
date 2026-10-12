import { JSX } from 'react';
import type { Lang } from '@/shared/i18n';

import { translate } from '@/shared/i18n';
import Icon from '@/sidepanel/components/Icon';

type AuditPagerProps = {
  lang: Lang;
  page: number;
  pages: number;
  onChange: (page: number) => void;
};

const BTN = 'inline-flex size-9 items-center justify-center rounded-md text-sm';
const WINDOW = 2;

export default function AuditPager({
  lang,
  page,
  pages,
  onChange,
}: AuditPagerProps): JSX.Element {
  const first = Math.max(1, Math.min(page - WINDOW, pages - WINDOW * 2));
  const last = Math.min(pages, first + WINDOW * 2);
  const numbers = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  return (
    <nav
      aria-label={translate(lang, 'opt.pager')}
      className='flex items-center gap-1'
    >
      <button
        type='button'
        aria-label={translate(lang, 'opt.pager.prev')}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className={`${BTN} border-base-content/20 border bg-base-100 disabled:opacity-40`}
      >
        <Icon name='chevronLeft' size={16} />
      </button>
      {numbers.map((number) => (
        <button
          key={number}
          type='button'
          aria-label={translate(lang, 'opt.pager.page', { n: number })}
          aria-current={number === page ? 'page' : undefined}
          onClick={() => onChange(number)}
          className={`${BTN} font-medium ${
            number === page
              ? 'bg-blue-600 font-semibold text-white'
              : 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
          }`}
        >
          {number}
        </button>
      ))}
      <button
        type='button'
        aria-label={translate(lang, 'opt.pager.next')}
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        className={`${BTN} border-base-content/20 border bg-base-100 disabled:opacity-40`}
      >
        <Icon name='chevronRight' size={16} />
      </button>
    </nav>
  );
}
