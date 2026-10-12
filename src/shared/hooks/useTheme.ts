import { useEffect, useState } from 'react';

const DARK_QUERY = '(prefers-color-scheme: dark)';

// Theme theo hệ điều hành; DaisyUI đổi bảng màu qua `data-theme`.
export default function useTheme(): 'light' | 'dark' {
  const [dark, setDark] = useState(() => window.matchMedia(DARK_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent): void =>
      setDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return dark ? 'dark' : 'light';
}
