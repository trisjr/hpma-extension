import { afterEach, beforeEach, vi } from 'vitest';

import { resetBrowserMock } from './browserMock';
import installJsdomShims from './jsdomShims';

vi.mock('webextension-polyfill', async () => {
  const { browserMock } = await import('./browserMock');
  return { default: browserMock };
});

installJsdomShims();

beforeEach(() => {
  resetBrowserMock();
});

afterEach(() => {
  vi.useRealTimers();
});
