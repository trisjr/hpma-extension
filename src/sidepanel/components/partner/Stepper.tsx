import { JSX } from 'react';
import type { Lang, MessageKey } from '@/shared/i18n';
import type { WizardStep } from '@/shared/partnerAssign';

import { translate } from '@/shared/i18n';
import { WIZARD_STEPS } from '@/shared/partnerAssign';

import Icon from '../Icon';

type StepperProps = {
  lang: Lang;
  current: WizardStep;
  onGoTo: (step: WizardStep) => void;
};

export default function Stepper({
  lang,
  current,
  onGoTo,
}: StepperProps): JSX.Element {
  return (
    <nav aria-label={translate(lang, 'pa.stepsLabel')} className='-mt-2'>
      <span className='text-base-content/70 text-xs font-medium'>
        {translate(lang, 'pa.stepOf', { n: current })}
      </span>
      <ol className='m-0 mt-1.5 flex list-none gap-1.5 p-0'>
        {WIZARD_STEPS.map((step) => {
          const name = translate(lang, `pa.step.${step}` as MessageKey);
          const done = step < current;
          const active = step === current;
          const bar = `h-1 rounded-full ${
            done || active ? 'bg-blue-500' : 'bg-base-content/15'
          }`;
          return (
            <li
              key={step}
              aria-current={active ? 'step' : undefined}
              className='flex min-w-0 flex-1 flex-col gap-1.5'
            >
              <span aria-hidden='true' className={bar} />
              {done ? (
                <a
                  href={`#step-${step}`}
                  aria-label={translate(lang, 'pa.step.doneLabel', {
                    n: step,
                    name,
                  })}
                  onClick={(event) => {
                    event.preventDefault();
                    onGoTo(step);
                  }}
                  className='flex items-center gap-0.5 truncate text-xs font-medium text-blue-600 no-underline dark:text-blue-400'
                >
                  <Icon name='check' size={12} />
                  <span className='truncate'>{name}</span>
                </a>
              ) : (
                <span
                  className={`truncate text-xs ${
                    active ? 'font-semibold' : 'text-base-content/60'
                  }`}
                >
                  {step} · {name}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
