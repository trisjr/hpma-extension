import { JSX, useState } from 'react';
import type { FlowDef } from '@/shared/flows';

import { FLOWS } from '@/shared/flows';
import useAdAccounts from '@/shared/hooks/useAdAccounts';
import useConnection from '@/shared/hooks/useConnection';
import useFlowSurface from '@/shared/hooks/useFlowSurface';
import useLanguage from '@/shared/hooks/useLanguage';
import usePartnerDraft from '@/shared/hooks/usePartnerDraft';
import useRunEngine from '@/shared/hooks/useRunEngine';
import useRunSimulator from '@/shared/hooks/useRunSimulator';
import { useDevtestSettings } from '@/shared/hooks/useSettings';
import useTheme from '@/shared/hooks/useTheme';
import useWriteBudget from '@/shared/hooks/useWriteBudget';
import { translate } from '@/shared/i18n';
import { buildDiff, isRunActive, isRunFinished } from '@/shared/run';
import type { PanelTab } from './components/TabNav';
import type { RunMode } from './components/riskStyles';

import ComingSoon from './components/ComingSoon';
import FlowsScreen from './components/FlowsScreen';
import PanelFooter from './components/PanelFooter';
import PanelHeader from './components/PanelHeader';
import PartnerAssignWizard from './components/partner/PartnerAssignWizard';
import DiffScreen from './components/run/DiffScreen';
import ResultScreen from './components/run/ResultScreen';
import RunEmpty from './components/run/RunEmpty';
import RunScreen from './components/run/RunScreen';

// Full chỉ mở sau cổng probe ≥ 95% + dry-run pass (PRD §4.1b, M3).
const FULL_LOCKED = true;
const PARTNER_FLOW_ID = 'partner-assign';

export default function SidePanel(): JSX.Element {
  const theme = useTheme();
  const { lang, toggleLang } = useLanguage();
  const { connection, tabId, refresh } = useConnection();
  const { used, limit } = useWriteBudget();
  const draft = usePartnerDraft();
  const devtest = useDevtestSettings();
  // Simulator chỉ khi devtest bật và cờ useSimulator bật; còn lại là engine thật.
  const useSim =
    devtest.ready && devtest.value.devtest && devtest.value.useSimulator;
  const engineMode = !useSim;
  // Gọi cả hai hook (đúng thứ tự hook), bên không được chọn nằm im.
  const engine = useRunEngine(tabId, devtest.ready && !useSim);
  const sim = useRunSimulator(useSim);
  const controller = useSim ? sim : engine;
  const [mode, setMode] = useState<RunMode>('dry');
  const [tab, setTab] = useState<PanelTab>('flows');
  const [openFlow, setOpenFlow] = useState<FlowDef | undefined>();
  const [diffOpen, setDiffOpen] = useState(false);
  const wizardOpen = tab === 'flows' && openFlow?.id === PARTNER_FLOW_ID;
  // Mở flow có `surface` thì tự đưa tab BM tới trang đó (engine thật mới cần).
  const { state: surfaceState, retry: retrySurface } = useFlowSurface(
    tabId,
    wizardOpen ? openFlow?.surface : undefined,
    devtest.ready && engineMode
  );
  const surfaceReady = !openFlow?.surface || surfaceState.status === 'ready';
  const source = useAdAccounts(
    tabId,
    devtest.ready &&
      engineMode &&
      wizardOpen &&
      surfaceReady &&
      draft.step === 2,
    useSim
  );

  const { run } = controller;
  // Full chưa mở khoá thì không bao giờ chạy Full (engine sẽ kiểm lại).
  const runnableMode = mode === 'assist' ? 'assist' : 'dry';

  const goToFlows = (): void => {
    setOpenFlow(undefined);
    setDiffOpen(false);
    setTab('flows');
  };

  const changeTab = (next: PanelTab): void => {
    setDiffOpen(false);
    if (next === 'flows') setOpenFlow(undefined);
    setTab(next);
  };

  const openDiff = (): void => {
    setDiffOpen(true);
    setTab('run');
  };

  // Từ wizard thì Diff quay về wizard; từ một run thì quay về run.
  const closeDiff = (): void => {
    setDiffOpen(false);
    if (!run) setTab('flows');
  };

  const startRun = (): void => {
    controller.start({
      mode: runnableMode,
      config: draft.config,
      diff: buildDiff(draft.config, source.accounts, engineMode),
      surface: openFlow?.surface,
    });
    setDiffOpen(false);
    setTab('run');
  };

  const finishRun = (): void => {
    controller.clear();
    draft.clearDraft();
    goToFlows();
  };

  const reconfigure = (accountIds: string[]): void => {
    controller.clear();
    draft.setConfig({ ...draft.config, accountIds });
    draft.setStep(2);
    setOpenFlow(FLOWS.find((flow) => flow.id === PARTNER_FLOW_ID));
    setDiffOpen(false);
    setTab('flows');
  };

  const renderRunTab = (): JSX.Element => {
    if (diffOpen) {
      return (
        <DiffScreen
          lang={lang}
          rows={buildDiff(draft.config, source.accounts, engineMode)}
          partnerBmId={draft.config.partnerBmId}
          budgetLeft={Math.max(0, limit - used)}
          fullLocked={FULL_LOCKED}
          onBack={closeDiff}
        />
      );
    }
    if (run && isRunActive(run)) {
      return (
        <RunScreen
          lang={lang}
          run={run}
          onStop={controller.stop}
          onConfirmAssign={controller.confirmAssist}
          onResync={controller.resync}
          onOpenDiff={openDiff}
        />
      );
    }
    if (run && isRunFinished(run)) {
      return (
        <ResultScreen
          lang={lang}
          run={run}
          onDone={finishRun}
          onReconfigure={reconfigure}
        />
      );
    }
    return <RunEmpty lang={lang} onGoToFlows={goToFlows} />;
  };

  const renderScreen = (): JSX.Element => {
    if (tab === 'run') return renderRunTab();
    if (openFlow) {
      return (
        <ComingSoon
          lang={lang}
          title={openFlow.name[lang]}
          onBack={goToFlows}
        />
      );
    }
    if (tab === 'flows') {
      return <FlowsScreen lang={lang} onOpenFlow={setOpenFlow} />;
    }
    const tabTitle = `${tab.charAt(0).toUpperCase()}${tab.slice(1)}`;
    return <ComingSoon lang={lang} title={tabTitle} onBack={goToFlows} />;
  };

  const connectionNotice =
    connection.status === 'unreachable' ? (
      <div role='status' className='alert alert-warning text-[13px]'>
        <span>{translate(lang, 'notice.unreachable')}</span>
        <button
          type='button'
          className='btn btn-outline btn-sm shrink-0 whitespace-nowrap'
          onClick={refresh}
        >
          {translate(lang, 'notice.retry')}
        </button>
      </div>
    ) : null;

  let surfaceNotice: JSX.Element | null = null;
  if (wizardOpen && surfaceState.status === 'moving') {
    surfaceNotice = (
      <div role='status' className='alert alert-info text-[13px]'>
        <span>{translate(lang, 'surface.moving')}</span>
      </div>
    );
  } else if (wizardOpen && surfaceState.status === 'error') {
    surfaceNotice = (
      <div role='status' className='alert alert-warning text-[13px]'>
        <span>{translate(lang, `err.${surfaceState.code}`)}</span>
        <button
          type='button'
          className='btn btn-outline btn-sm shrink-0 whitespace-nowrap'
          onClick={retrySurface}
        >
          {translate(lang, 'notice.retry')}
        </button>
      </div>
    );
  }

  const notice = (
    <>
      {connectionNotice}
      {surfaceNotice}
    </>
  );

  const showWizard = wizardOpen;

  return (
    // PostCSS prefix `#my-ext ` chỉ khớp phần tử con, không khớp chính root →
    // class layout phải nằm ở div con, không đặt trên root.
    <div id='my-ext' data-theme={theme}>
      <div className='fixed inset-0 flex flex-col overflow-hidden bg-base-200 text-sm text-base-content'>
        <PanelHeader
          lang={lang}
          connection={connection}
          mode={mode}
          fullLocked={FULL_LOCKED}
          modeLocked={isRunActive(run)}
          tab={tab}
          onToggleLang={toggleLang}
          onModeChange={setMode}
          onTabChange={changeTab}
        />
        {showWizard ? (
          <PartnerAssignWizard
            lang={lang}
            connection={connection}
            mode={mode}
            fullLocked={FULL_LOCKED}
            engineMode={engineMode}
            banner={notice}
            draft={draft}
            source={source}
            onExit={goToFlows}
            onOpenDiff={openDiff}
            onRun={startRun}
          />
        ) : (
          <main className='flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-4'>
            {notice}
            {renderScreen()}
          </main>
        )}
        <PanelFooter lang={lang} />
      </div>
    </div>
  );
}
