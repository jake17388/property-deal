import { useCallback, useEffect, useState } from 'react';

const VERSION_URL = `${import.meta.env.BASE_URL}version.json`;

// Reloading with a fresh ?v= defeats any cached copy of index.html. It is
// stripped again on the way back in so it doesn't linger in the URL or get
// bookmarked — other params (?debug) are left alone.
export function updateReloadUrl(currentUrl, cacheBuster = Date.now()) {
  const url = new URL(currentUrl);
  url.searchParams.set('v', String(cacheBuster));
  return url.toString();
}

export function cleanUpdateUrl(currentUrl) {
  const url = new URL(currentUrl);
  if (!url.searchParams.has('v')) return currentUrl;
  url.searchParams.delete('v');
  return url.toString();
}

async function fetchVersion() {
  const res = await fetch(VERSION_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`version.json responded ${res.status}`);
  return res.json();
}

// Tracks the build this page loaded with, and compares later checks against it
// rather than against a hardcoded constant that would be easy to forget to
// bump. `status` drives the button label: idle | checking | current | error.
export function useAppVersion() {
  const [info, setInfo]       = useState(null);   // what this page booted with
  const [latest, setLatest]   = useState(null);   // what the server has now
  const [status, setStatus]   = useState('idle');

  useEffect(() => {
    let cancelled = false;
    fetchVersion()
      .then(data => { if (!cancelled) { setInfo(data); setLatest(data); } })
      .catch(() => { /* the badge just stays blank — not worth interrupting play */ });
    return () => { cancelled = true; };
  }, []);

  const check = useCallback(async () => {
    setStatus('checking');
    try {
      const data = await fetchVersion();
      setLatest(data);
      // First load may have failed; treat this as the boot version instead of
      // falsely reporting an update.
      setInfo(prev => prev ?? data);
      setStatus('current');
    } catch {
      setStatus('error');
    }
  }, []);

  // Let the outcome sit long enough to read, then return the button to normal.
  useEffect(() => {
    if (status !== 'current' && status !== 'error') return;
    const t = setTimeout(() => setStatus('idle'), 2500);
    return () => clearTimeout(t);
  }, [status]);

  const updateAvailable = !!(info && latest && latest.build !== info.build);

  const reload = useCallback(() => {
    window.location.href = updateReloadUrl(window.location.href);
  }, []);

  return {
    version: info?.version ?? null,
    build:   info?.build ?? null,
    updateAvailable,
    status,
    check,
    reload,
  };
}
