const AUTH_RETURN_KEY = 'abjee:auth-return-path';

const isSafeReturnPath = (value: string | null | undefined) => {
  if (!value) return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  if (value.startsWith('/auth')) return false;
  if (value.startsWith('/api')) return false;
  return true;
};

export const getCurrentReturnPath = (pathname?: string | null, search = '') => {
  if (typeof window !== 'undefined') {
    const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return isSafeReturnPath(path) ? path : '/community';
  }

  const path = `${pathname || '/'}${search ? `?${search}` : ''}`;
  return isSafeReturnPath(path) ? path : '/community';
};

export const getAuthRedirectHref = (pathname?: string | null, search = '') => {
  const returnPath = getCurrentReturnPath(pathname, search);
  return `/auth?from=${encodeURIComponent(returnPath)}`;
};

export const saveAuthReturnPath = (path: string | null | undefined) => {
  if (typeof window === 'undefined' || !isSafeReturnPath(path)) return;
  sessionStorage.setItem(AUTH_RETURN_KEY, path as string);
};

export const getSavedAuthReturnPath = () => {
  if (typeof window === 'undefined') return null;
  const value = sessionStorage.getItem(AUTH_RETURN_KEY);
  return isSafeReturnPath(value) ? value : null;
};

export const clearSavedAuthReturnPath = () => {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(AUTH_RETURN_KEY);
};

export const resolveAuthReturnPath = (value: string | null | undefined, fallback = '/community') => {
  if (isSafeReturnPath(value)) return value as string;
  return isSafeReturnPath(fallback) ? fallback : '/community';
};
