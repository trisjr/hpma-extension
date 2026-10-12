import { JSX, useEffect, useState } from 'react';
import openSidePanel from '@utils/openSidePanel';
import browser from 'webextension-polyfill';

export default function Popup(): JSX.Element {
  // Resolve windowId trước: open side panel đòi user gesture, không được await
  // trong onClick (docs/050-Research/21 §5.1).
  const [windowId, setWindowId] = useState<number>();
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    browser.windows.getCurrent().then((win) => setWindowId(win.id));
  }, []);

  return (
    <div id='my-ext' className='container p-4' data-theme='light'>
      <h1 className='text-lg font-bold'>HPMA Copilot</h1>
      <button
        type='button'
        className='btn btn-primary btn-sm mt-3'
        disabled={windowId === undefined}
        onClick={() => {
          if (windowId === undefined) return;
          openSidePanel(windowId).then(
            () => setOpenFailed(false),
            () => setOpenFailed(true)
          );
        }}
      >
        Mở copilot
      </button>
      {openFailed && (
        <div role='alert' className='alert alert-error mt-2 text-sm'>
          Không mở được side panel. Thử lại hoặc mở từ menu của trình duyệt.
        </div>
      )}
    </div>
  );
}
