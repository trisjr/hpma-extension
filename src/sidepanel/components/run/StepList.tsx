import { JSX } from 'react';
import type { Lang, MessageKey } from '@/shared/i18n';
import type { PhaseState, RunStep, StepState } from '@/shared/run';

import { translate } from '@/shared/i18n';
import { RUN_PHASES } from '@/shared/run';

import Icon from '../Icon';

const ROW: Record<StepState, string> = {
  pending: '',
  running: 'bg-blue-50 dark:bg-blue-950/40',
  ok: '',
  waiting: 'bg-yellow-50 dark:bg-yellow-950/40',
  skipped: 'bg-base-200/60',
  failed: 'bg-red-50 dark:bg-red-950/40',
};

const LABEL: Record<StepState, string> = {
  pending: 'text-base-content/70',
  running: 'text-blue-600 dark:text-blue-400',
  ok: 'text-green-700 dark:text-green-300',
  waiting: 'text-yellow-800 dark:text-yellow-300',
  skipped: 'text-base-content/70',
  failed: 'text-red-700 dark:text-red-300',
};

const PHASE: Record<PhaseState, string> = {
  idle: 'bg-base-200 text-base-content/70',
  run: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  done: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  skip: 'bg-base-200 text-base-content/60',
  fail: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
};

function StepIcon({ step }: { step: RunStep }): JSX.Element {
  const base =
    'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold';
  switch (step.state) {
    case 'ok':
      return (
        <span
          className={`${base} border-green-200 bg-green-100 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300`}
        >
          <Icon name='check' size={13} />
        </span>
      );
    case 'running':
      return (
        <span
          className={`${base} border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300`}
        >
          <span className='size-2 rounded-full bg-current motion-safe:animate-pulse' />
        </span>
      );
    case 'waiting':
      return (
        <span
          className={`${base} border-yellow-400 bg-yellow-100 text-yellow-800 dark:border-yellow-600 dark:bg-yellow-950 dark:text-yellow-300`}
        >
          <Icon name='hand' size={13} />
        </span>
      );
    case 'skipped':
      return (
        <span
          className={`${base} border-base-content/40 text-base-content/60 border-dashed bg-base-100`}
        >
          {step.index}
        </span>
      );
    case 'failed':
      return (
        <span
          className={`${base} border-red-200 bg-red-100 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300`}
        >
          <Icon name='close' size={13} />
        </span>
      );
    default:
      return (
        <span className={`${base} border-base-content/20 text-base-content/70`}>
          {step.index}
        </span>
      );
  }
}

type StepListProps = { lang: Lang; steps: RunStep[] };

export default function StepList({ lang, steps }: StepListProps): JSX.Element {
  return (
    <section
      aria-label={translate(lang, 'run.steps')}
      className='border-base-content/12 overflow-hidden rounded-md border bg-base-100'
    >
      <ol className='m-0 flex list-none flex-col p-0'>
        {steps.map((step) => (
          <li
            key={step.index}
            aria-current={step.state === 'running' ? 'step' : undefined}
            className={`border-base-content/8 flex gap-2.5 border-b px-3 py-2.5 last:border-b-0 ${ROW[step.state]}`}
          >
            <StepIcon step={step} />
            <div className='flex min-w-0 flex-1 flex-col gap-1'>
              <div className='flex items-start justify-between gap-2'>
                <span
                  className={`break-words text-[13px] font-medium ${
                    step.state === 'pending' || step.state === 'skipped'
                      ? 'text-base-content/70'
                      : ''
                  }`}
                >
                  {translate(lang, step.titleKey)}
                </span>
                <span
                  className={`shrink-0 text-xs font-medium ${LABEL[step.state]}`}
                >
                  {translate(lang, `run.stepState.${step.state}` as MessageKey)}
                </span>
              </div>
              <div className='flex flex-wrap gap-1'>
                {RUN_PHASES.map((phase) => (
                  <span
                    key={phase}
                    className={`rounded px-1.5 py-px text-xs ${PHASE[step.phases[phase]]}`}
                  >
                    {phase}
                  </span>
                ))}
                {step.isWrite && (
                  <span className='rounded border border-orange-200 bg-orange-50 px-1.5 py-px text-xs font-medium text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300'>
                    {translate(lang, 'run.writeStep')}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
