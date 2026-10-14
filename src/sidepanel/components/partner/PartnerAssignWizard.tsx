import { JSX, ReactNode, useEffect, useRef } from 'react';
import type { AdAccountsState } from '@/shared/hooks/useAdAccounts';
import type { ConnectionState } from '@/shared/hooks/useConnection';
import type { PartnerDraftApi } from '@/shared/hooks/usePartnerDraft';
import type { Lang, MessageKey } from '@/shared/i18n';
import type { WizardStep } from '@/shared/partnerAssign';
import type { RunMode } from '../riskStyles';

import { usePacingConfig } from '@/shared/hooks/useSettings';
import useWriteBudget from '@/shared/hooks/useWriteBudget';
import { translate } from '@/shared/i18n';
import { isStaleSelection, isStepValid } from '@/shared/partnerAssign';
import { isCurfew } from '@/shared/settings';

import Icon from '../Icon';
import { RISK_STYLES } from '../riskStyles';
import StepAccounts from './StepAccounts';
import StepBm from './StepBm';
import Stepper from './Stepper';
import StepPerms from './StepPerms';
import StepReview from './StepReview';
import SummaryRow from './SummaryRow';

type PartnerAssignWizardProps = {
  lang: Lang;
  connection: ConnectionState;
  mode: RunMode;
  fullLocked: boolean;
  // true: TKQC nhập bằng dán tên/ID (engine thật); false: chọn từ danh sách mẫu.
  engineMode: boolean;
  // Thông báo mất kết nối do SidePanel dựng, đặt đầu vùng cuộn.
  banner: ReactNode;
  // State bản nháp và danh sách TKQC do SidePanel giữ để Diff/Run dùng chung.
  draft: PartnerDraftApi;
  source: AdAccountsState;
  onExit: () => void;
  onOpenDiff: () => void;
  onRun: () => void;
};

const NEXT_LABEL: Record<2 | 3 | 4, MessageKey> = {
  2: 'pa.next.2',
  3: 'pa.next.3',
  4: 'pa.next.4',
};

const RUN_VIEW: Record<
  RunMode,
  { labelKey: MessageKey; hintKey: MessageKey; button: string }
> = {
  dry: {
    labelKey: 'pa.run.dry',
    hintKey: 'pa.hint.runDry',
    button: 'bg-green-700 text-white',
  },
  assist: {
    labelKey: 'pa.run.assist',
    hintKey: 'pa.hint.runAssist',
    button: 'bg-yellow-400 text-yellow-950',
  },
  full: {
    labelKey: 'pa.run.full',
    hintKey: 'pa.hint.runFull',
    button: 'bg-orange-600 text-white',
  },
};

const BTN =
  'inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-md px-3 text-[13px] font-semibold';
const BTN_PRIMARY = `${BTN} bg-blue-600 text-white disabled:cursor-not-allowed disabled:bg-base-content/15 disabled:text-base-content/50`;
const BTN_GHOST = `${BTN} border-base-content/20 border bg-base-100`;

function summarizeNames(names: string[]): string {
  const shown = names.slice(0, 3).join(', ');
  return names.length > 3 ? `${shown} +${names.length - 3}` : shown;
}

export default function PartnerAssignWizard({
  lang,
  connection,
  mode,
  fullLocked,
  engineMode,
  banner,
  draft,
  source,
  onExit,
  onOpenDiff,
  onRun,
}: PartnerAssignWizardProps): JSX.Element {
  const { ready, config, step, setConfig, setStep } = draft;
  const { used, limit } = useWriteBudget();
  const { value: pacing } = usePacingConfig();
  const mainRef = useRef<HTMLElement>(null);
  const mounted = useRef(false);

  // Đổi bước: về đầu vùng cuộn và đưa focus vào tiêu đề bước (a11y §11).
  useEffect(() => {
    if (!ready) return;
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const main = mainRef.current;
    main?.scrollTo({ top: 0 });
    main?.querySelector<HTMLElement>('[data-step-heading]')?.focus();
  }, [step, ready]);

  // Full chưa mở khoá thì không bao giờ chạy Full, kể cả khi state cũ là full.
  const effectiveMode: RunMode = mode === 'full' && fullLocked ? 'dry' : mode;
  const accountCount = config.accountIds.length;
  const selectedNames = config.accountIds.map(
    (id) => source.accounts.find((account) => account.id === id)?.name ?? id
  );
  const accountNames = summarizeNames(selectedNames);
  const valid = isStepValid(step, config);

  const goNext = (): void => {
    if (valid && step < 4) setStep((step + 1) as WizardStep);
  };

  const goBack = (): void => {
    if (step > 1) setStep((step - 1) as WizardStep);
  };

  const runBlock = ((): MessageKey | undefined => {
    if (connection.status !== 'connected') return 'pa.run.disconnected';
    if (effectiveMode === 'dry') return undefined;
    if (isCurfew(new Date(), pacing.curfew)) return 'pa.run.curfew';
    if (used >= limit) return 'pa.run.budget';
    return undefined;
  })();

  const hintFor = (): { text: string; error: boolean } => {
    if (step === 1) {
      return valid
        ? { text: translate(lang, 'pa.hint.bmOk'), error: false }
        : { text: translate(lang, 'pa.hint.bmBad'), error: true };
    }
    if (step === 2) {
      return valid
        ? {
            text: translate(lang, 'pa.hint.accOk', { n: accountCount }),
            error: false,
          }
        : { text: translate(lang, 'pa.hint.accBad'), error: true };
    }
    if (step === 3) {
      if (!valid) {
        return { text: translate(lang, 'pa.hint.permsBad'), error: true };
      }
      const key: MessageKey = config.tasks.includes('MANAGE')
        ? 'pa.hint.permsHigh'
        : 'pa.hint.perms';
      return {
        text: translate(lang, key, { n: config.tasks.length }),
        error: false,
      };
    }
    if (runBlock) return { text: translate(lang, runBlock), error: true };
    return {
      text: translate(lang, RUN_VIEW[effectiveMode].hintKey),
      error: false,
    };
  };

  const hint = hintFor();
  const tierStyle = RISK_STYLES.sensitive;

  const renderStep = (): JSX.Element => {
    if (step === 1) {
      return (
        <StepBm
          lang={lang}
          bmId={config.partnerBmId}
          onChange={(partnerBmId) => setConfig({ ...config, partnerBmId })}
        />
      );
    }
    if (step === 2) {
      return (
        <StepAccounts
          lang={lang}
          source={source}
          engineMode={engineMode}
          selectedIds={config.accountIds}
          onChange={(accountIds) => {
            // Lựa chọn cũ thuộc BM khác với danh sách đang hiện: bỏ, chỉ giữ phần vừa thêm ở BM này.
            const stale = isStaleSelection(
              config.accountIds.length,
              draft.businessId,
              source.businessId
            );
            setConfig({
              ...config,
              accountIds: stale
                ? accountIds.filter((id) => !config.accountIds.includes(id))
                : accountIds,
            });
            // Ghi BM của danh sách đang chọn: run chỉ chạy trên đúng BM này.
            draft.setBusinessId(source.businessId);
          }}
        />
      );
    }
    if (step === 3) {
      return (
        <StepPerms
          lang={lang}
          accountCount={accountCount}
          tasks={config.tasks}
          onChange={(tasks) => setConfig({ ...config, tasks })}
        />
      );
    }
    return (
      <StepReview
        lang={lang}
        config={config}
        accountNames={accountNames}
        mode={effectiveMode}
        fullLocked={fullLocked}
        onGoTo={setStep}
        onOpenDiff={onOpenDiff}
      />
    );
  };

  const renderSummaries = (): JSX.Element | null => {
    if (step !== 2 && step !== 3) return null;
    return (
      <div className='border-base-content/12 divide-base-content/8 flex flex-col divide-y rounded-md border bg-base-100'>
        <SummaryRow
          lang={lang}
          label={translate(lang, 'pa.bm.summary')}
          editLabel={translate(lang, 'pa.editBm')}
          onEdit={() => setStep(1)}
        >
          {config.partnerBmId}
        </SummaryRow>
        {step === 3 && (
          <SummaryRow
            lang={lang}
            label={`${translate(lang, 'pa.acc.summary')} · ${accountCount}`}
            editLabel={translate(lang, 'pa.editAccounts')}
            onEdit={() => setStep(2)}
          >
            {accountNames}
          </SummaryRow>
        )}
      </div>
    );
  };

  const renderPrimary = (): JSX.Element => {
    if (step < 4) {
      return (
        <button
          type='button'
          disabled={!valid}
          onClick={goNext}
          className={BTN_PRIMARY}
        >
          <span className='truncate'>
            {translate(lang, NEXT_LABEL[(step + 1) as 2 | 3 | 4])}
          </span>
          <Icon name='chevronRight' size={15} />
        </button>
      );
    }
    const view = RUN_VIEW[effectiveMode];
    return (
      <button
        type='button'
        disabled={runBlock !== undefined}
        onClick={onRun}
        className={`${BTN} ${view.button} disabled:bg-base-content/15 disabled:text-base-content/50 disabled:cursor-not-allowed`}
      >
        <span className='truncate'>
          {translate(lang, view.labelKey, { n: accountCount })}
        </span>
      </button>
    );
  };

  return (
    <>
      <main
        ref={mainRef}
        className='flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-4'
      >
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
              {translate(lang, 'pa.title')}
            </h1>
            <span
              className={`inline-flex h-[22px] items-center gap-1 rounded-md border px-[7px] text-xs font-medium ${tierStyle.chip}`}
            >
              <Icon name={tierStyle.icon} size={13} />
              {translate(lang, tierStyle.tierKey)}
            </span>
          </div>
          {step === 1 && (
            <p className='text-base-content/70 m-0 text-[13px]'>
              {translate(lang, 'pa.desc')}
            </p>
          )}
        </div>
        <Stepper lang={lang} current={step} onGoTo={setStep} />
        {renderSummaries()}
        {ready && renderStep()}
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
          <button
            type='button'
            onClick={step === 1 ? onExit : goBack}
            className={BTN_GHOST}
          >
            {step > 1 && <Icon name='chevronLeft' size={15} />}
            {translate(lang, step === 1 ? 'pa.cancel' : 'pa.prev')}
          </button>
          {renderPrimary()}
        </div>
      </div>
    </>
  );
}
