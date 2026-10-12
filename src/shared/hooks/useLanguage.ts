import { useCallback, useEffect, useState } from 'react';
import type { Lang } from '@/shared/i18n';
import browser from 'webextension-polyfill';

import { DEFAULT_LANG, isLang } from '@/shared/i18n';

const STORAGE_KEY = 'lang';

export default function useLanguage(): {
  lang: Lang;
  toggleLang: () => void;
} {
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    browser.storage.local.get(STORAGE_KEY).then((stored) => {
      const value: unknown = stored[STORAGE_KEY];
      if (isLang(value)) setLang(value);
    });
    const onChanged = (
      changes: Record<string, browser.Storage.StorageChange>,
      area: string
    ): void => {
      const next: unknown = changes[STORAGE_KEY]?.newValue;
      if (area === 'local' && isLang(next)) setLang(next);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  const toggleLang = useCallback(() => {
    const next: Lang = lang === 'vi' ? 'en' : 'vi';
    setLang(next);
    browser.storage.local.set({ [STORAGE_KEY]: next });
  }, [lang]);

  return { lang, toggleLang };
}
