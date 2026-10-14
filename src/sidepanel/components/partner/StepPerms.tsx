import { JSX } from 'react';
import type { Lang } from '@/shared/i18n';
import type { PartnerTask } from '@/shared/partnerAssign';

import { translate } from '@/shared/i18n';
import { PARTNER_TASKS } from '@/shared/partnerAssign';

import Icon from '../Icon';

type StepPermsProps = {
  lang: Lang;
  accountCount: number;
  tasks: PartnerTask[];
  onChange: (tasks: PartnerTask[]) => void;
};

export default function StepPerms({
  lang,
  accountCount,
  tasks,
  onChange,
}: StepPermsProps): JSX.Element {
  const toggle = (task: PartnerTask): void => {
    const next = tasks.includes(task)
      ? tasks.filter((item) => item !== task)
      : [...tasks, task];
    // Giữ thứ tự cố định của danh sách quyền.
    onChange(
      PARTNER_TASKS.map((item) => item.task).filter((item) =>
        next.includes(item)
      )
    );
  };

  return (
    <section className='border-base-content/12 flex flex-col gap-3 rounded-md border bg-base-100 p-3'>
      <div className='flex flex-col gap-0.5'>
        <h2
          tabIndex={-1}
          data-step-heading
          className='m-0 text-sm font-semibold outline-none'
        >
          {translate(lang, 'pa.perm.title')}
        </h2>
        <p className='text-base-content/70 m-0 text-[13px]'>
          {translate(lang, 'pa.perm.desc', { n: accountCount })}
        </p>
      </div>
      <div
        role='group'
        aria-label={translate(lang, 'pa.perm.title')}
        className='border-base-content/12 flex shrink-0 flex-col overflow-hidden rounded-md border'
      >
        {PARTNER_TASKS.map((item) => (
          <label
            key={item.task}
            htmlFor={`perm-${item.task}`}
            className='border-base-content/8 flex min-h-11 cursor-pointer items-start gap-2.5 border-b px-3 py-2.5 last:border-b-0'
          >
            <input
              id={`perm-${item.task}`}
              type='checkbox'
              className='checkbox checkbox-sm mt-0.5 shrink-0'
              checked={tasks.includes(item.task)}
              onChange={() => toggle(item.task)}
            />
            <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
              <span className='flex flex-wrap items-center gap-1.5'>
                <span className='text-[13px] font-semibold'>
                  {translate(lang, item.labelKey)}
                </span>
                <code className='text-base-content/70 text-xs'>
                  {item.task}
                </code>
                {item.high && (
                  <span className='rounded-md border border-orange-200 bg-orange-50 px-1.5 text-xs font-medium text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300'>
                    {translate(lang, 'pa.perm.high')}
                  </span>
                )}
              </span>
              <span className='text-base-content/70 text-xs'>
                {translate(lang, item.descKey)}
              </span>
            </span>
          </label>
        ))}
      </div>
      {tasks.includes('MANAGE') && (
        <div
          role='alert'
          className='flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200'
        >
          <Icon name='alert' size={16} className='mt-px' />
          <div className='flex flex-col gap-0.5'>
            <span className='text-[13px] font-semibold'>
              {translate(lang, 'pa.perm.warnTitle')}
            </span>
            <span className='text-xs'>
              {translate(lang, 'pa.perm.warnBody')}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
