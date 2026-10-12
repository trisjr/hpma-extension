/* eslint-disable react/require-default-props -- React 19 bỏ defaultProps cho function component; default nằm ở tham số */
import { JSX } from 'react';
import type { Lang } from '@/shared/i18n';
import { translate } from '@/shared/i18n';
import type { RunMode } from './riskStyles';


import Icon from './Icon';
import { MODE_STYLES, RUN_MODES } from './riskStyles';

type ModeSwitchProps = {
  lang: Lang;
  mode: RunMode;
  fullLocked: boolean;
  disabled?: boolean;
  onChange: (mode: RunMode) => void;
};

export default function ModeSwitch({
  lang,
  mode,
  fullLocked,
  disabled = false,
  onChange,
}: ModeSwitchProps): JSX.Element {
  return (
    <div
      role='group'
      aria-label={translate(lang, 'mode.group')}
      className='flex gap-1 rounded-lg bg-base-200 p-[3px]'
    >
      {RUN_MODES.map((candidate) => {
        const { selected, icon, labelKey } = MODE_STYLES[candidate];
        const locked = candidate === 'full' && fullLocked;
        const isSelected = candidate === mode;
        const stateClass = isSelected
          ? `${selected} font-semibold`
          : 'border-transparent text-base-content/70';
        return (
          <button
            key={candidate}
            type='button'
            aria-pressed={isSelected}
            disabled={locked || (disabled && !isSelected)}
            onClick={() => onChange(candidate)}
            className={`disabled:text-base-content/40 flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border text-[13px] disabled:cursor-not-allowed ${stateClass}`}
          >
            <Icon name={locked ? 'lock' : icon} size={15} />
            {translate(lang, labelKey)}
          </button>
        );
      })}
    </div>
  );
}
