import { JSX } from 'react';
import type { FlowDef } from '@/shared/flows';
import type { Lang } from '@/shared/i18n';

import { FLOWS, groupFlowsByRisk } from '@/shared/flows';
import { translate } from '@/shared/i18n';

import FlowCard from './FlowCard';
import { RISK_STYLES } from './riskStyles';

type FlowsScreenProps = {
  lang: Lang;
  onOpenFlow: (flow: FlowDef) => void;
};

export default function FlowsScreen({
  lang,
  onOpenFlow,
}: FlowsScreenProps): JSX.Element {
  return (
    <>
      <div className='flex items-baseline justify-between gap-2'>
        <h1 className='m-0 text-lg font-medium'>
          {translate(lang, 'flows.title')}
        </h1>
        <span className='text-base-content/70 text-xs'>
          {translate(lang, 'flows.sortHint')}
        </span>
      </div>
      {groupFlowsByRisk(FLOWS).map(({ risk, flows }) => (
        <section key={risk} className='flex flex-col gap-2'>
          <div className='flex items-center gap-2'>
            <span
              aria-hidden='true'
              className={`size-2 rounded-full ${RISK_STYLES[risk].dot}`}
            />
            <h2 className='text-base-content/70 m-0 text-xs font-medium uppercase tracking-[0.05rem]'>
              {translate(lang, RISK_STYLES[risk].titleKey)}
            </h2>
            <span className='text-base-content/70 text-xs'>
              · {flows.length}
            </span>
          </div>
          {flows.map((flow) => (
            <FlowCard
              key={flow.id}
              lang={lang}
              flow={flow}
              onOpen={onOpenFlow}
            />
          ))}
        </section>
      ))}
    </>
  );
}
