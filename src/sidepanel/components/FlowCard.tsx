import { JSX } from 'react';
import type { FlowDef } from '@/shared/flows';
import type { Lang } from '@/shared/i18n';

import { translate } from '@/shared/i18n';

import Icon from './Icon';
import { RISK_STYLES } from './riskStyles';

type FlowCardProps = {
  lang: Lang;
  flow: FlowDef;
  onOpen: (flow: FlowDef) => void;
};

const CHIP_CLASS =
  'inline-flex h-[22px] items-center gap-1 rounded-md border px-[7px] text-xs font-medium';

export default function FlowCard({
  lang,
  flow,
  onOpen,
}: FlowCardProps): JSX.Element {
  const style = RISK_STYLES[flow.risk];
  // Flow khoá hoặc chưa có màn cấu hình không dẫn tới bước ghi.
  const openable = flow.hasConfig && !flow.locked;

  return (
    <a
      href={`#${flow.id}`}
      aria-disabled={openable ? undefined : true}
      onClick={(event) => {
        event.preventDefault();
        if (openable) onOpen(flow);
      }}
      className={`border-base-content/12 flex items-start gap-2.5 rounded-md border bg-base-100 p-3 text-base-content no-underline ${
        openable ? '' : 'cursor-not-allowed'
      }`}
    >
      <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='text-sm font-semibold'>{flow.name[lang]}</span>
        <span className='text-base-content/70 text-[13px] leading-[18px]'>
          {flow.desc[lang]}
        </span>
        <span className='mt-2 flex flex-wrap gap-1.5'>
          <span className={`${CHIP_CLASS} ${style.chip}`}>
            <Icon name={style.icon} size={13} />
            {translate(lang, style.tierKey)}
          </span>
          {flow.locked && (
            <span
              className={`${CHIP_CLASS} border-base-content/15 text-base-content/70 bg-base-200`}
            >
              <Icon name='lock' size={13} />
              {translate(lang, 'flows.locked')}
            </span>
          )}
          {!flow.locked && !flow.hasConfig && (
            <span
              className={`${CHIP_CLASS} border-base-content/15 text-base-content/70 bg-base-200`}
            >
              {translate(lang, 'flows.soon')}
            </span>
          )}
        </span>
      </span>
      <Icon
        name='chevronRight'
        size={18}
        className='text-base-content/40 mt-px'
      />
    </a>
  );
}
