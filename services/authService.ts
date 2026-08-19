import { UserSession } from '../types';
import { storageService } from './storageService';

// Google Identity Services (GIS) OAuth sign-in for a fully client-side app.
// Identity only — the Gemini API key remains a separate credential.

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const SESSION_KEY = 'userSession';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // Local session validity: 24h

// Minimal typings for the GIS client (loaded at runtime, not from npm)
interface GisIdConfiguration {
  client_id: string;
  callback: (response: { credential: string }) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
}

interface GisButtonConfiguration {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
}

interface GoogleAccountsId {
  initialize: (config: GisIdConfiguration) => void;
  renderButton: (parent: HTMLElement, options: GisButtonConfiguration) => void;
  disableAutoSelect: () => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

export const getGoogleClientId = (): string | null => {
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  return id && id.trim().length > 0 ? id.trim() : null;
};

export const isOAuthConfigured = (): boolean => getGoogleClientId() !== null;

let gisLoadPromise: Promise<GoogleAccountsId> | null = null;

const loadGisClient = (): Promise<GoogleAccountsId> => {
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<GoogleAccountsId>((resolve, reject) => {
    const existing = window.google?.accounts?.id;
    if (existing) return resolve(existing);

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const gis = window.google?.accounts?.id;
      if (gis) {
        resolve(gis);
      } else {
        reject(new Error('AUTH_MODULE_CORRUPT: GIS client loaded but unavailable'));
      }
    };
    script.onerror = () => {
      gisLoadPromise = null; // Allow retry on transient network failure
      reject(new Error('AUTH_LINK_FAILURE: Could not reach accounts.google.com'));
    };
    document.head.appendChild(script);
  });

  return gisLoadPromise;
};

// Decode the payload of a GIS ID token (JWT). No signature verification —
// there is no backend to protect; the token is used purely as client-side identity.
const decodeJwtPayload = (credential: string): Record<string, unknown> => {
  const payload = credential.split('.')[1];
  if (!payload) throw new Error('AUTH_TOKEN_MALFORMED');
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    atob(base64)
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(json);
};

const sessionFromCredential = (credential: string): UserSession => {
  const claims = decodeJwtPayload(credential);
  const now = Date.now();
  return {
    provider: 'google',
    sub: String(claims.sub ?? 'unknown'),
    name: String(claims.name ?? claims.email ?? 'SUBJECT'),
    email: typeof claims.email === 'string' ? claims.email : null,
    picture: typeof claims.picture === 'string' ? claims.picture : null,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
};

export const createGuestSession = (): UserSession => {
  const now = Date.now();
  return {
    provider: 'guest',
    sub: `guest-${now.toString(36)}`,
    name: 'UNIDENTIFIED SUBJECT',
    email: null,
    picture: null,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };
};

export const saveSession = async (session: UserSession) => {
  await storageService.saveSystemData(SESSION_KEY, session);
};

export const getStoredSession = async (): Promise<UserSession | null> => {
  const session = await storageService.getSystemData<UserSession>(SESSION_KEY);
  if (!session) return null;
  if (Date.now() >= session.expiresAt) return null;
  return session;
};

export const signOut = async () => {
  await storageService.saveSystemData(SESSION_KEY, null);
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    // GIS not loaded — nothing to disable
  }
};

// Initializes GIS and renders the official Google button into `container`.
// `onSignIn` fires with a persisted session once the user completes the flow.
export const renderGoogleSignIn = async (
  container: HTMLElement,
  onSignIn: (session: UserSession) => void,
  onError: (message: string) => void
) => {
  const clientId = getGoogleClientId();
  if (!clientId) {
    onError('AUTH_MODULE_OFFLINE: VITE_GOOGLE_CLIENT_ID is not configured');
    return;
  }

  const gis = await loadGisClient();

  gis.initialize({
    client_id: clientId,
    callback: async (response) => {
      try {
        const session = sessionFromCredential(response.credential);
        await saveSession(session);
        onSignIn(session);
      } catch (e) {
        console.error('Credential decode failed', e);
        onError('AUTH_TOKEN_REJECTED: Credential could not be verified');
      }
    },
    auto_select: false,
    cancel_on_tap_outside: true,
    use_fedcm_for_prompt: true,
  });

  container.innerHTML = '';
  gis.renderButton(container, {
    type: 'standard',
    theme: 'filled_black',
    size: 'large',
    text: 'signin_with',
    shape: 'rectangular',
    logo_alignment: 'center',
    width: 280,
  });
};
