import React, { useEffect, useRef, useState } from 'react';
import { UserSession } from '../types';
import { renderGoogleSignIn, isOAuthConfigured, createGuestSession, saveSession } from '../services/authService';
import { Button } from './Button';

interface AuthScreenProps {
  onAuthenticated: (session: UserSession) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const buttonHostRef = useRef<HTMLDivElement>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const oauthReady = isOAuthConfigured();

  // Terminal-style status feed while the GIS module loads
  useEffect(() => {
    const feed = [
      'ESTABLISHING UPLINK...',
      'HANDSHAKE PROTOCOL: OAUTH 2.0',
      oauthReady ? 'IDENTITY PROVIDER: GOOGLE [ONLINE]' : 'IDENTITY PROVIDER: [OFFLINE]',
      'AWAITING SUBJECT CREDENTIALS_',
    ];
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    feed.forEach((line, i) => {
      timeouts.push(setTimeout(() => setStatusLines(prev => [...prev, line]), 350 * (i + 1)));
    });
    return () => timeouts.forEach(clearTimeout);
  }, [oauthReady]);

  useEffect(() => {
    if (!oauthReady || !buttonHostRef.current) return;
    let cancelled = false;

    renderGoogleSignIn(
      buttonHostRef.current,
      (session) => { if (!cancelled) onAuthenticated(session); },
      (message) => { if (!cancelled) setAuthError(message); }
    ).catch((e) => {
      if (!cancelled) setAuthError(e instanceof Error ? e.message : 'AUTH_LINK_FAILURE');
    });

    return () => { cancelled = true; };
  }, [oauthReady, onAuthenticated]);

  const handleGuestAccess = async () => {
    const session = createGuestSession();
    await saveSession(session);
    onAuthenticated(session);
  };

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0a0a0a] relative overflow-hidden z-10 p-4">
      <div className="retro-grid-container">
        <div className="retro-grid"></div>
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_20%,#000000_95%)] pointer-events-none z-0"></div>

      <div className="relative z-20 w-full max-w-lg border-2 border-primary bg-black p-6 md:p-10 shadow-[0_0_30px_rgba(13,242,13,0.2)]">
        <p className="text-white/30 font-mono text-[10px] tracking-[0.3em] uppercase mb-2">Tuckersoft Secure Gateway</p>
        <h1 className="text-2xl md:text-3xl text-primary font-mono tracking-widest text-glow mb-6">
          OPERATOR AUTHENTICATION
        </h1>

        <div className="font-mono text-xs md:text-sm text-primary/70 space-y-2 mb-8 min-h-[6rem]">
          {statusLines.map((line, i) => (
            <p key={i} className="flex items-center gap-2">
              <span className="w-1 h-1 bg-primary/50"></span> {line}
            </p>
          ))}
        </div>

        {oauthReady ? (
          <div className="flex flex-col items-center gap-4">
            {/* GIS renders its official button here */}
            <div ref={buttonHostRef} className="min-h-[44px]" />
            <p className="text-white/30 font-mono text-[10px] uppercase tracking-widest text-center">
              Identity is stored locally on this device only.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 border border-danger/30 bg-danger/5 text-danger font-mono text-xs">
              AUTH MODULE OFFLINE — set <span className="text-white">VITE_GOOGLE_CLIENT_ID</span> in
              your .env.local to enable Google sign-in. See README for setup.
            </div>
            <Button fullWidth variant="secondary" onClick={handleGuestAccess}>
              PROCEED AS UNIDENTIFIED SUBJECT
            </Button>
          </div>
        )}

        {authError && (
          <div className="mt-6 p-3 border border-danger/30 bg-danger/5 text-danger font-mono text-xs break-words">
            {authError}
          </div>
        )}
      </div>
    </div>
  );
};
