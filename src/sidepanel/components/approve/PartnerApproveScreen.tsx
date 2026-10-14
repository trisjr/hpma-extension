import { JSX, ReactNode } from 'react';
import type { ApproveDraftApi } from '@/shared/hooks/useApproveDraft';
import type { ConnectionState } from '@/shared/hooks/useConnection';
import type { ScanState } from '@/shared/hooks/useRequestsScan';
import type { Lang, MessageKey } from '@/shared/i18n';
import type { RunMode } from '../riskStyles';

import {
  cleanPartnerName,
  MAX_PARTNER_NAME_LENGTH,
  validatePartnerName,
} from '@/shared/approve';
import { usePacingConfig } from '@/shared/hooks/useSettings';
import useWriteBudget from '@/shared/hooks/useWriteBudget';
import { translate } from '@/shared/i18n';
import { isCurfew } from '@/shared/settings';

import Icon from '../Icon';
import { RISK_STYLES } from '../riskStyles';

type PartnerApproveScreenProps = {
  lang: Lang;
  connection: ConnectionState;
  mode: RunMode;
  // false: simulator Devtest đang bật, flow này chỉ chạy bằng engine thật.
  engineMode: boolean;
  banner: ReactNode;
  draft: ApproveDraftApi;
  scan: { state: ScanState; scan: (partnerName: string) => void };
  onExit: () => void;
  onRun: () => void;
};

const RUN_VIEW: Record<
  'dry' | 'assist',
  { labelKey: MessageKey; hintKey: MessageKey; button: string }
> = {
  dry: {
    labelKey: 'approve.run.dry',
    hintKey: 'approve.run.hintDry',
    button: 'bg-green-700 text-white',
  },
  assist: {
    labelKey: 'approve.run.assist',
    hintKey: 'approve.run.hintAssist',
    button: 'bg-yellow-400 text-yellow-950',
  },
};

const BTN =
  'inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-md px-3 text-[13px] font-semibold';
const BTN_GHOST = `${BTN} border-base-content/20 border bg-base-100`;

const SCAN_ERROR_KEY = {
  surface: 'approve.err.surface',
  unreadable: 'approve.err.unreadable',
  busy: 'approve.err.busy',
} as const satisfies Record<string, MessageKey>;

const sameName = (left: string, right: string): boolean =>
  cleanPartnerName(left).toLowerCase() ===
  cleanPartnerName(right).toLowerCase();

export default function PartnerApproveScreen({
  lang,
  connection,
  mode,
  engineMode,
  banner,
  draft,
  scan,
  onExit,
  onRun,
}: PartnerApproveScreenProps): JSX.Element {
  const { partnerName, setPartnerName } = draft;
  const { used, limit } = useWriteBudget();
  const { value: pacing } = usePacingConfig();
  // Full chưa mở khoá (cổng ghi, PRD §8) nên không bao giờ chạy Full: coi như Dry-run.
  const effectiveMode: 'dry' | 'assist' = mode === 'assist' ? 'assist' : 'dry';
  const nameIssue = validatePartnerName(partnerName);
  const connected = connection.status === 'connected';
  const { state } = scan;
  const scanned = state.status === 'ok';
  const stale = scanned && !sameName(state.partnerName, partnerName);
  const found = scanned && !stale ? state.requests : [];
  const canScan =
    connected && engineMode && !nameIssue && state.status !== 'scanning';

  const runBlock = ((): MessageKey | undefined => {
    if (!connected) return 'pa.run.disconnected';
    if (effectiveMode === 'dry') return undefined;
    if (isCurfew(new Date(), pacing.curfew)) return 'pa.run.curfew';
    if (used >= limit) return 'pa.run.budget';
    return undefined;
  })();
  const canRun = engineMode && found.length > 0 && runBlock === undefined;

  const hint = ((): { text: string; error: boolean } => {
    if (!engineMode)
      return { text: translate(lang, 'approve.sim'), error: true };
    if (runBlock) return { text: translate(lang, runBlock), error: true };
    if (nameIssue === 'empty') {
      return { text: translate(lang, 'approve.name.empty'), error: true };
    }
    if (stale) return { text: translate(lang, 'approve.stale'), error: true };
    if (found.length === 0) {
      return { text: translate(lang, 'approve.scan.note'), error: false };
    }
    return {
      text: translate(lang, RUN_VIEW[effectiveMode].hintKey),
      error: false,
    };
  })();

  const view = RUN_VIEW[effectiveMode];
  const tierStyle = RISK_STYLES.sensitive;
  let scanLabel: MessageKey = 'approve.scan';
  if (state.status === 'scanning') scanLabel = 'approve.scanning';
  else if (scanned) scanLabel = 'approve.scanAgain';

  return (
    <>
      <main className='flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-4'>
        {banner}
        <div className='flex flex-col gap-1.5'>
          <button
            type='button'
            onClick={onExit}
            className='inline-flex h-9 items-center gap-0.5 self-start text-[13px] font-medium text-blue-600 dark:text-blue-400'
          >
            <Icon name='chevronLeft' />
            {translate(lang, 'pa.back')}
          </button>
          <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
            <h1 className='m-0 text-lg font-medium'>
              {translate(lang, 'approve.title')}
            </h1>
            <span
              className={`inline-flex h-[22px] items-center gap-1 rounded-md border px-[7px] text-xs font-medium ${tierStyle.chip}`}
            >
              <Icon name={tierStyle.icon} size={13} />
              {translate(lang, tierStyle.tierKey)}
            </span>
          </div>
          <p className='text-base-content/70 m-0 text-[13px]'>
            {translate(lang, 'approve.desc')}
          </p>
        </div>

        <section className='border-base-content/12 flex flex-col gap-3 rounded-md border bg-base-100 p-3'>
          <div className='flex flex-col gap-1.5'>
            <label htmlFor='approve-name' className='text-[13px] font-medium'>
              {translate(lang, 'approve.name.label')}
            </label>
            <input
              id='approve-name'
              type='text'
              autoComplete='off'
              value={partnerName}
              maxLength={MAX_PARTNER_NAME_LENGTH + 20}
              placeholder={translate(lang, 'approve.name.placeholder')}
              aria-invalid={nameIssue === 'tooLong'}
              aria-describedby='approve-name-help'
              onChange={(event) => setPartnerName(event.target.value)}
              className={`input h-10 w-full bg-base-100 text-sm ${
                nameIssue === 'tooLong' ? 'border-2 border-red-600' : ''
              }`}
            />
            <p
              id='approve-name-help'
              className={`m-0 text-xs ${
                nameIssue === 'tooLong'
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-base-content/70'
              }`}
            >
              {nameIssue === 'tooLong'
                ? translate(lang, 'approve.name.tooLong', {
                    n: MAX_PARTNER_NAME_LENGTH,
                  })
                : translate(lang, 'approve.name.help')}
            </p>
          </div>
          <button
            type='button'
            disabled={!canScan}
            onClick={() => scan.scan(cleanPartnerName(partnerName))}
            className={`${BTN_GHOST} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {translate(lang, scanLabel)}
          </button>
        </section>

        {state.status === 'error' && (
          <div
            role='alert'
            className='flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100'
          >
            <Icon name='alert' size={14} className='mt-px shrink-0' />
            <span>{translate(lang, SCAN_ERROR_KEY[state.error])}</span>
          </div>
        )}

        {scanned && !stale && (
          <section
            aria-live='polite'
            className='border-base-content/12 flex flex-col gap-2 rounded-md border bg-base-100 p-3'
          >
            {found.length === 0 ? (
              <>
                <h2 className='m-0 text-sm font-semibold'>
                  {translate(lang, 'approve.none')}
                </h2>
                <p className='text-base-content/70 m-0 text-xs'>
                  {translate(lang, 'approve.none.hint')}
                </p>
              </>
            ) : (
              <>
                <h2 className='m-0 text-sm font-semibold'>
                  {translate(lang, 'approve.found', { n: found.length })}
                </h2>
                <ul className='m-0 flex list-none flex-col gap-1 p-0'>
                  {found.map((request, index) => (
                    <li
                      // Request trùng hệt nhau là hợp lệ nên khoá cần kèm vị trí.
                      // eslint-disable-next-line react/no-array-index-key
                      key={`${request.requester}|${request.account}|${index}`}
                      className='break-words text-[13px]'
                    >
                      {translate(lang, 'approve.list.row', {
                        requester: request.requester,
                        account: request.account,
                      })}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        <div className='border-base-content/12 text-base-content/70 flex items-start gap-2 rounded-md border bg-base-100 p-3 text-xs'>
          <Icon name='shield' size={15} className='mt-px shrink-0' />
          <span>{translate(lang, 'approve.note')}</span>
        </div>
      </main>
      <div className='border-base-content/12 flex shrink-0 flex-col gap-2 border-t bg-base-100 px-4 py-2.5'>
        <div
          aria-live='polite'
          className={`min-h-4 text-xs ${
            hint.error
              ? 'text-red-700 dark:text-red-300'
              : 'text-base-content/70'
          }`}
        >
          {hint.text}
        </div>
        <div className='flex items-center justify-between gap-2'>
          <button type='button' onClick={onExit} className={BTN_GHOST}>
            {translate(lang, 'pa.cancel')}
          </button>
          <button
            type='button'
            disabled={!canRun}
            onClick={onRun}
            className={`${BTN} ${view.button} disabled:bg-base-content/15 disabled:text-base-content/50 disabled:cursor-not-allowed`}
          >
            <span className='truncate'>{translate(lang, view.labelKey)}</span>
          </button>
        </div>
      </div>
    </>
  );
}
