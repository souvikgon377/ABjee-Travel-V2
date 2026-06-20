"use client";

import { useEffect } from 'react';

const SCRIPT_SRC = 'https://widget.getyourguide.com/dist/pa.umd.production.min.js';
const PARTNER_ID = 'P2598GX';

/**
 * Loads GetYourGuide after hydration. Its client-loader performs an initial scan
 * and observes data-gyg-widget nodes added later during App Router navigation.
 */
export function GetYourGuideLoader() {
  useEffect(() => {
    const selector = `script[src="${SCRIPT_SRC}"]`;
    if (document.querySelector(selector)) return;

    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.dataset.gygPartnerId = PARTNER_ID;
    script.dataset.gygManaged = 'true';
    script.addEventListener('load', () => {
      document.documentElement.dataset.gygScriptStatus = 'loaded';
    }, { once: true });
    script.addEventListener('error', () => {
      document.documentElement.dataset.gygScriptStatus = 'error';
      console.error('[GetYourGuide] Widget script failed to load. Check content blockers and network policy.');
    }, { once: true });
    document.head.appendChild(script);
  }, []);

  return null;
}
