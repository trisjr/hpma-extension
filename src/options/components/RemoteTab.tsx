import { FormEvent, JSX, useState } from 'react';
import type { Lang, MessageKey } from '@/shared/i18n';
import type { Provision, RemoteProbeReply } from '@/shared/remoteMessages';

import useRemote from '@/shared/hooks/useRemote';
import { translate } from '@/shared/i18n';

type RemoteTabProps = { lang: Lang };

const INPUT =
  'border-base-content/20 h-10 w-full rounded-md border bg-base-100 px-2.5 text-[15px]';
const BUTTON =
  'border-base-content/20 h-10 rounded-md border bg-base-100 px-4 text-sm font-medium disabled:opacity-50';

const STATE_KEYS: Record<Provision, MessageKey> = {
  'signed-out': 'opt.remote.state.signed-out',
  unprovisioned: 'opt.remote.state.unprovisioned',
  'machine-mismatch': 'opt.remote.state.machine-mismatch',
  ok: 'opt.remote.state.ok',
};

export default function RemoteTab({ lang }: RemoteTabProps): JSX.Element {
  const remote = useRemote();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [probe, setProbe] = useState<RemoteProbeReply | 'failed' | undefined>();
  const t = (key: MessageKey, params?: Record<string, string>): string =>
    translate(lang, key, params);

  if (!remote.supported) {
    return (
      <p role='status' className='text-base-content/70 m-0 text-[13px]'>
        {t('opt.remote.unsupported')}
      </p>
    );
  }
  if (remote.loading) {
    return (
      <p role='status' className='text-base-content/70 m-0 text-[13px]'>
        {t('opt.loading')}
      </p>
    );
  }

  const { status } = remote;
  const signedIn = status !== undefined && status.provision !== 'signed-out';

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    remote.signIn(email.trim(), password).catch(() => undefined);
    // Không giữ mật khẩu trong state sau khi gửi.
    setPassword('');
  };

  const onProbe = (): void => {
    remote
      .probeTab()
      .then((reply) => setProbe(reply ?? 'failed'))
      .catch(() => setProbe('failed'));
  };

  const probeMessage = (result: RemoteProbeReply | 'failed'): string => {
    if (result === 'failed') return t('opt.remote.probeFail');
    if (!result.matched) return t('opt.remote.probeNone');
    return t('opt.remote.probeFound', { count: String(result.tabs.length) });
  };

  const row = (label: string, value: string | undefined): JSX.Element => (
    <div className='flex flex-wrap gap-x-3'>
      <dt className='text-base-content/70 w-40 shrink-0 text-[13px]'>
        {label}
      </dt>
      <dd className='m-0 min-w-0 break-all text-[15px]'>
        {value ?? t('opt.remote.none')}
      </dd>
    </div>
  );

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-col gap-1'>
        <h2 className='m-0 text-lg font-medium'>{t('opt.remote.title')}</h2>
        <p className='text-base-content/70 m-0 text-[13px]'>
          {t('opt.remote.sub')}
        </p>
      </div>

      {remote.unreachable && (
        <div
          role='alert'
          className='rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
        >
          {t('opt.remote.loadFail')}
        </div>
      )}

      {status && (
        <section className='border-base-content/12 flex flex-col gap-3 rounded-md border bg-base-100 px-4 py-3.5'>
          <dl className='m-0 flex flex-col gap-1.5'>
            <div className='flex flex-col gap-0.5'>
              <dt className='text-base-content/70 text-[13px]'>
                {t('opt.remote.machineId')}
              </dt>
              <dd className='m-0'>
                <code className='select-all font-mono text-[15px]'>
                  {status.machineId}
                </code>
              </dd>
              <dd className='text-base-content/70 m-0 text-[13px]'>
                {t('opt.remote.machineIdHint')}
              </dd>
            </div>
            {row(t('opt.remote.account'), status.email)}
            {row(t('opt.remote.flow'), status.flow)}
            {row(t('opt.remote.bm'), status.businessId)}
            {row(
              t('opt.remote.heartbeat'),
              status.lastHeartbeatAt
                ? new Date(status.lastHeartbeatAt).toLocaleString(lang)
                : t('opt.remote.never')
            )}
            {row(t('opt.remote.pending'), String(status.pendingJobs))}
            {status.lastError && row(t('opt.remote.error'), status.lastError)}
          </dl>
          <p
            role='status'
            className={`m-0 text-[13px] ${
              status.provision === 'ok'
                ? 'text-green-700 dark:text-green-300'
                : 'text-amber-700 dark:text-amber-300'
            }`}
          >
            {t(STATE_KEYS[status.provision])}
          </p>
        </section>
      )}

      {signedIn ? (
        <div className='flex flex-wrap items-center gap-3'>
          <button
            type='button'
            className={BUTTON}
            disabled={remote.busy}
            onClick={onProbe}
          >
            {remote.busy ? t('opt.remote.probing') : t('opt.remote.probe')}
          </button>
          <button
            type='button'
            className={BUTTON}
            disabled={remote.busy}
            onClick={() => {
              remote.signOut().catch(() => undefined);
              setProbe(undefined);
            }}
          >
            {t('opt.remote.signOut')}
          </button>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className='flex max-w-sm flex-col gap-3'
          autoComplete='off'
        >
          <div className='flex flex-col gap-1 text-[13px]'>
            <label htmlFor='remote-email'>{t('opt.remote.email')}</label>
            <input
              id='remote-email'
              type='email'
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={INPUT}
            />
          </div>
          <div className='flex flex-col gap-1 text-[13px]'>
            <label htmlFor='remote-password'>{t('opt.remote.password')}</label>
            <input
              id='remote-password'
              type='password'
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={INPUT}
              autoComplete='off'
            />
          </div>
          <button type='submit' className={BUTTON} disabled={remote.busy}>
            {remote.busy ? t('opt.remote.signingIn') : t('opt.remote.signIn')}
          </button>
        </form>
      )}

      {probe && (
        <p role='status' className='m-0 text-[13px]'>
          {probeMessage(probe)}
        </p>
      )}
    </div>
  );
}
