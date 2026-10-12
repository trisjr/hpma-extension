import { JSX, useEffect, useState } from 'react';
import browser from 'webextension-polyfill';

import useLanguage from '@/shared/hooks/useLanguage';
import useTheme from '@/shared/hooks/useTheme';

import AuditTab from './components/AuditTab';
import DevtestTab from './components/DevtestTab';
import OptionsShell from './components/OptionsShell';
import PacingTab from './components/PacingTab';
import { OPTIONS_TABS, OptionsTab } from './components/tabs';

// Tab nhớ trong URL hash (#pacing, #audit, #devtest) để reload không mất vị trí.
function readHash(): OptionsTab {
  const hash = window.location.hash.replace('#', '');
  return OPTIONS_TABS.find((item) => item.id === hash)?.id ?? 'pacing';
}

export default function Options(): JSX.Element {
  const theme = useTheme();
  const { lang, toggleLang } = useLanguage();
  const [tab, setTab] = useState<OptionsTab>(readHash);

  useEffect(() => {
    const onHashChange = (): void => setTab(readHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Cả ba panel luôn nằm trong DOM (panel không chọn thì `hidden`): giữ được form
  // Pacing chưa lưu khi đổi tab và mọi `aria-controls` đều trỏ tới phần tử có thật.
  const panel = (id: OptionsTab, content: JSX.Element): JSX.Element => (
    <section
      key={id}
      id={`options-panel-${id}`}
      role='tabpanel'
      aria-labelledby={`options-tab-${id}`}
      tabIndex={0}
      hidden={tab !== id}
      className='flex flex-col outline-none'
    >
      {content}
    </section>
  );

  return (
    // Root chỉ giữ id + data-theme: PostCSS prefix `#my-ext ` chỉ khớp phần tử con,
    // nên class layout nằm ở div con (xem OptionsShell).
    <div id='my-ext' data-theme={theme}>
      <OptionsShell
        lang={lang}
        version={browser.runtime.getManifest().version}
        tab={tab}
        onToggleLang={toggleLang}
        onTabChange={(next) => {
          window.location.hash = next;
        }}
      >
        {panel('pacing', <PacingTab lang={lang} />)}
        {panel('audit', <AuditTab lang={lang} />)}
        {panel('devtest', <DevtestTab lang={lang} />)}
      </OptionsShell>
    </div>
  );
}
