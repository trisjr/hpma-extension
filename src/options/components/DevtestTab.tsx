import { JSX, useState } from 'react';
import type { Lang } from '@/shared/i18n';
import type { RunScenario } from '@/shared/run';
import type { DevtestSettings, LogDetail } from '@/shared/settings';

import useEmergencyLock from '@/shared/hooks/useEmergencyLock';
import { useDevtestSettings } from '@/shared/hooks/useSettings';
import { translate } from '@/shared/i18n';
import { RUN_SCENARIOS } from '@/shared/run';
import { LOG_DETAILS, withLogDetail } from '@/shared/settings';
import Icon from '@/sidepanel/components/Icon';

import FlagCard from './FlagCard';

type DevtestTabProps = { lang: Lang };

const SELECT =
  'border-base-content/20 h-10 w-44 rounded-md border bg-base-100 px-2.5 text-[15px]';

export default function DevtestTab({ lang }: DevtestTabProps): JSX.Element {
  const { ready, value, save } = useDevtestSettings();
  const [failed, setFailed] = useState(false);
  const [unlockFailed, setUnlockFailed] = useState(false);
  const emergency = useEmergencyLock();

  if (!ready) {
    return (
      <p role='status' className='text-base-content/70 m-0 text-[13px]'>
        {translate(lang, 'opt.loading')}
      </p>
    );
  }

  // Mỗi cờ lưu ngay khi đổi (artboard không có nút Lưu).
  const update = (next: DevtestSettings): void => {
    save(next).then(
      () => setFailed(false),
      () => setFailed(true)
    );
  };

  const onUnlock = (): void => {
    emergency.unlock().then(
      () => setUnlockFailed(false),
      () => setUnlockFailed(true)
    );
  };

  const onLogDetail = (raw: string): void => {
    const level = LOG_DETAILS.find((item) => item === raw);
    if (level) update(withLogDetail(value, level, Date.now()));
  };

  const onScenario = (raw: string): void => {
    const simScenario: RunScenario | undefined = RUN_SCENARIOS.find(
      (item) => item === raw
    );
    if (simScenario) update({ ...value, simScenario });
  };

  const detailLevel: LogDetail = value.logDetail;

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-1'>
        <h2 className='m-0 text-lg font-medium'>
          {translate(lang, 'opt.dev.title')}
        </h2>
        <p className='text-base-content/70 m-0 text-[13px]'>
          {translate(lang, 'opt.dev.sub')}
        </p>
      </div>
      {failed && (
        <div
          role='alert'
          className='rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
        >
          {translate(lang, 'opt.dev.saveFail')}
        </div>
      )}

      {emergency.locked && (
        <section
          role='alert'
          className='flex flex-wrap items-center gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3.5 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
        >
          <div className='flex min-w-0 flex-[1_1_320px] items-start gap-2'>
            <Icon name='alert' size={18} className='mt-0.5 shrink-0' />
            <div className='flex flex-col gap-0.5'>
              <span className='text-[15px] font-medium'>
                {translate(lang, 'opt.dev.unlockTitle')}
              </span>
              <span className='text-[13px]'>
                {translate(lang, 'opt.dev.unlockBody')}
              </span>
              {unlockFailed && (
                <span className='text-[13px] font-medium'>
                  {translate(lang, 'opt.dev.unlockFail')}
                </span>
              )}
            </div>
          </div>
          <button
            type='button'
            onClick={onUnlock}
            className='inline-flex h-10 items-center justify-center rounded-md border border-red-300 bg-base-100 px-3 text-[13px] font-semibold text-red-800 dark:border-red-700 dark:text-red-200'
          >
            {translate(lang, 'opt.dev.unlockBtn')}
          </button>
        </section>
      )}

      <FlagCard
        lang={lang}
        id='flag-devtest'
        label={translate(lang, 'opt.dev.devtest')}
        keyName='devtest'
        desc={translate(lang, 'opt.dev.devtestDesc')}
        checked={value.devtest}
        onChange={(devtest) => update({ ...value, devtest })}
      />
      <FlagCard
        lang={lang}
        id='flag-probe-tab'
        label={translate(lang, 'opt.dev.probeTab')}
        keyName='ui.probeTab'
        desc={translate(lang, 'opt.dev.probeTabDesc')}
        checked={value.probeTab}
        onChange={(probeTab) => update({ ...value, probeTab })}
      />
      <FlagCard
        lang={lang}
        id='flag-snapshot'
        label={translate(lang, 'opt.dev.snapshot')}
        keyName='probe.snapshotOnMiss'
        desc={translate(lang, 'opt.dev.snapshotDesc')}
        checked={value.snapshotOnMiss}
        onChange={(snapshotOnMiss) => update({ ...value, snapshotOnMiss })}
      />

      <section className='border-base-content/12 flex flex-col gap-3 rounded-md border bg-base-100 px-4 py-3.5'>
        <div className='flex flex-wrap items-center gap-3'>
          <div className='flex min-w-0 flex-[1_1_320px] flex-col gap-0.5'>
            <span className='flex flex-wrap items-center gap-2'>
              <label htmlFor='log-detail' className='text-[15px] font-medium'>
                {translate(lang, 'opt.dev.logDetail')}
              </label>
              <code className='text-base-content/70 font-mono text-xs'>
                logDetail
              </code>
            </span>
            <span className='text-base-content/70 text-[13px]'>
              {translate(lang, 'opt.dev.logDetailDesc')}
            </span>
          </div>
          <select
            id='log-detail'
            value={detailLevel}
            onChange={(event) => onLogDetail(event.target.value)}
            className={SELECT}
          >
            {LOG_DETAILS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </div>
        {detailLevel === 'verbose' && (
          <div
            role='alert'
            className='flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-[13px] text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200'
          >
            <Icon name='alert' size={16} className='mt-px' />
            {translate(lang, 'opt.dev.verboseWarn')}
          </div>
        )}
      </section>

      {value.devtest && (
        <FlagCard
          lang={lang}
          id='flag-use-simulator'
          label={translate(lang, 'opt.dev.useSim')}
          keyName='engine.useSimulator'
          desc={translate(lang, 'opt.dev.useSimDesc')}
          checked={value.useSimulator}
          onChange={(useSimulator) => update({ ...value, useSimulator })}
        />
      )}

      {value.devtest && (
        <section className='border-base-content/12 flex flex-wrap items-center gap-3 rounded-md border bg-base-100 px-4 py-3.5'>
          <div className='flex min-w-0 flex-[1_1_320px] flex-col gap-0.5'>
            <span className='flex flex-wrap items-center gap-2'>
              <label htmlFor='sim-scenario' className='text-[15px] font-medium'>
                {translate(lang, 'opt.dev.scenario')}
              </label>
              <code className='text-base-content/70 font-mono text-xs'>
                sim.scenario
              </code>
            </span>
            <span className='text-base-content/70 text-[13px]'>
              {translate(lang, 'opt.dev.scenarioDesc')}
            </span>
          </div>
          <select
            id='sim-scenario'
            value={value.simScenario}
            onChange={(event) => onScenario(event.target.value)}
            className={SELECT}
          >
            {RUN_SCENARIOS.map((scenario) => (
              <option key={scenario} value={scenario}>
                {scenario}
              </option>
            ))}
          </select>
        </section>
      )}

      <section className='border-base-content/12 flex items-start gap-3 rounded-md border bg-base-100 px-4 py-3.5'>
        <Icon name='lock' size={18} className='mt-0.5' />
        <div className='flex flex-col gap-0.5'>
          <span className='text-sm font-medium'>
            {translate(lang, 'opt.dev.alwaysTitle')}
          </span>
          <span className='text-base-content/70 text-[13px]'>
            {translate(lang, 'opt.dev.alwaysBody')}
          </span>
        </div>
      </section>
    </div>
  );
}
