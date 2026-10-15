import { JSX } from 'react';
import type { Lang, MessageKey } from '@/shared/i18n';
import type { RemoteFlow, RemoteJob } from '@/shared/remoteJob';

import { translate } from '@/shared/i18n';
import { PARTNER_TASKS } from '@/shared/partnerAssign';
import { jobPartnerName } from '@/shared/remoteJob';
import { parseRunConfig } from '@/shared/runConfig';

type RemoteJobsCardProps = {
  lang: Lang;
  jobs: RemoteJob[];
  tabBusinessId: string | undefined;
  onUse: (job: RemoteJob) => void;
};

const FLOW_KEYS: Record<RemoteFlow, MessageKey> = {
  'partner-assign': 'remote.card.assign',
  'partner-approve': 'remote.card.approve',
  'requests.scan': 'remote.card.scan',
};

export default function RemoteJobsCard({
  lang,
  jobs,
  tabBusinessId,
  onUse,
}: RemoteJobsCardProps): JSX.Element | null {
  if (jobs.length === 0) return null;

  const summary = (job: RemoteJob): string | undefined => {
    const assign = job.flow === 'partner-assign' && parseRunConfig(job.config);
    if (assign)
      return translate(lang, 'remote.card.summaryAssign', {
        bm: assign.partnerBmId,
        count: assign.queries.length,
      });
    const name = jobPartnerName(job);
    return name
      ? translate(lang, 'remote.card.summaryPartner', { name })
      : undefined;
  };

  return (
    <section
      aria-label={translate(lang, 'remote.card.title')}
      className='border-base-content/12 flex flex-col gap-2 rounded-md border bg-base-100 p-3'
    >
      <div className='flex flex-col gap-0.5'>
        <h2 className='m-0 text-sm font-semibold'>
          {translate(lang, 'remote.card.title')} · {jobs.length}
        </h2>
        <p className='text-base-content/70 m-0 text-[13px] leading-[18px]'>
          {translate(lang, 'remote.card.sub')}
        </p>
      </div>
      {jobs.map((job) => {
        const config =
          job.flow === 'partner-assign'
            ? parseRunConfig(job.config)
            : undefined;
        return (
          <div
            key={job.id}
            className='border-base-content/12 flex flex-col gap-1.5 rounded-md border p-2.5'
          >
            <div className='flex items-start justify-between gap-2'>
              <span className='flex min-w-0 flex-col'>
                <span className='text-sm font-medium'>
                  {translate(lang, FLOW_KEYS[job.flow])}
                </span>
                <span className='text-base-content/70 break-words text-[13px]'>
                  {summary(job)}
                </span>
              </span>
              <button
                type='button'
                onClick={() => onUse(job)}
                className='btn btn-primary btn-sm shrink-0'
              >
                {translate(lang, 'remote.card.use')}
              </button>
            </div>
            {tabBusinessId !== undefined &&
              tabBusinessId !== job.businessId && (
                <p className='m-0 text-[13px] text-warning'>
                  {translate(lang, 'remote.card.bmMismatch', {
                    job: job.businessId,
                    tab: tabBusinessId,
                  })}
                </p>
              )}
            {config && (
              <ul className='m-0 flex list-none flex-wrap gap-1 p-0'>
                {PARTNER_TASKS.filter((entry) =>
                  config.tasks.includes(entry.task)
                ).map((entry) => (
                  <li
                    key={entry.task}
                    className={`badge badge-sm ${entry.high ? 'badge-warning' : 'badge-ghost'}`}
                  >
                    {translate(lang, entry.labelKey)}
                  </li>
                ))}
              </ul>
            )}
            {config && (
              <details className='text-[13px]'>
                <summary className='cursor-pointer'>
                  {translate(lang, 'remote.card.queries')}
                </summary>
                <ul className='m-0 mt-1 list-disc pl-5'>
                  {config.queries.map((query) => (
                    <li key={query} className='break-all'>
                      {query}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}
    </section>
  );
}
