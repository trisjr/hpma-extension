import type { Lang, MessageKey } from '@/shared/i18n';
import type { RemoteFlow, RemoteJob } from '@/shared/remoteJob';

import { translate } from '@/shared/i18n';
import { jobPartnerName } from '@/shared/remoteJob';
import { parseRunConfig } from '@/shared/runConfig';

export const FLOW_KEYS: Record<RemoteFlow, MessageKey> = {
  'partner-assign': 'remote.card.assign',
  'partner-approve': 'remote.card.approve',
  'requests.scan': 'remote.card.scan',
};

// Một dòng tóm tắt job cho popup và card ở side panel; undefined khi config không đọc được.
export default function summarizeJob(
  lang: Lang,
  job: RemoteJob
): string | undefined {
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
}
