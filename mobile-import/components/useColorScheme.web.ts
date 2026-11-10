// NOTE: The default React Native styling doesn't support server rendering.
// Server rendered styles should not change between the first render of the HTML
// and the first render on the client. Typically, web developers will use CSS media queries
// to render different styles on the client and server, these aren't directly supported in React Native
// but can be achieved using a styling library like Nativewind.
import { useEffect, useState } from 'react';

type WebColorScheme = 'light' | 'dark';

export function useColorScheme(): WebColorScheme {
  const [colorScheme, setColorScheme] = useState<WebColorScheme>('light');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateColorScheme = () => {
      const nextScheme = mediaQuery.matches ? 'dark' : 'light';
      setColorScheme(nextScheme);
      document.documentElement.classList.toggle('dark', nextScheme === 'dark');
    };

    updateColorScheme();
    mediaQuery.addEventListener('change', updateColorScheme);
    return () => mediaQuery.removeEventListener('change', updateColorScheme);
  }, []);

  return colorScheme;
}
