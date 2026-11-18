import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  browserPopupRedirectResolver,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  User as FirebaseUser,
} from 'firebase/auth';
import { io, Socket } from 'socket.io-client';
import { auth, googleAuthProvider } from '../lib/firebase';
import { OrganizationSummary, UserAccount, UserProfile } from '../types';

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  user: UserAccount | null;
  profile: UserProfile | null;
  organizations: OrganizationSummary[];
  unreadNotifications: number;
  mfaVerified: boolean;
  loading: boolean;
  authError: string | null;
  socket: Socket | null;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleRedirect: () => Promise<void>;
  retryAuth: () => Promise<void>;
  clearAuthError: () => void;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  apiFetch: <T = unknown>(path: string, options?: RequestInit) => Promise<T>;
  setUnreadNotifications: React.Dispatch<React.SetStateAction<number>>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function formatAuthError(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : '';
  if (code === 'auth/popup-blocked') {
    return 'Sign-in popup was blocked by your browser. Allow popups for this site, open in a new tab, or use redirect sign-in.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Google sign-in popup was closed before completing sign-in. If your browser blocks embedded popups, open ResuMind in a new tab or use redirect sign-in.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'This preview domain is not yet authorized in Firebase Authentication settings.';
  }
  if (code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/web-storage-unsupported') {
    return 'Browser storage or embedded popups are restricted in this view. Open ResuMind in a new tab to sign in.';
  }
  if (code === 'auth/user-disabled') {
    return 'This Google account has been disabled in Firebase Authentication.';
  }
  if (code === 'auth/internal-error') {
    return 'Google sign-in encountered a temporary browser/network restriction. Try opening ResuMind in a new tab or using redirect sign-in.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error while connecting to authentication services. Please check your connection and try again.';
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'Unable to complete sign-in. Please try again.';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserAccount | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [mfaVerified, setMfaVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Store ID token & sessionKey strictly in memory (never localStorage)
  const tokenRef = useRef<string | null>(null);
  const sessionKeyRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const syncInFlightRef = useRef<{ uid: string; promise: Promise<void> } | null>(null);

  const getFreshToken = useCallback(
    async (fbUser: FirebaseUser | null, forceRefresh = false): Promise<string | null> => {
      if (!fbUser) return null;
      const token = await fbUser.getIdToken(forceRefresh);
      tokenRef.current = token;
      return token;
    },
    []
  );

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setSocket(null);
  }, []);

  const connectSocket = useCallback(() => {
    if (socketRef.current?.connected) return;
    disconnectSocket();

    const activeSocket = io({
      auth: (cb) => {
        const fbUser = auth.currentUser;
        if (fbUser) {
          fbUser
            .getIdToken()
            .then((t) => {
              tokenRef.current = t;
              cb({ token: t });
            })
            .catch(() => cb({ token: tokenRef.current }));
        } else {
          cb({ token: tokenRef.current });
        }
      },
      transports: ['websocket', 'polling'],
    });

    activeSocket.on('notification:new', () => {
      setUnreadNotifications((c) => c + 1);
    });

    socketRef.current = activeSocket;
    setSocket(activeSocket);
  }, [disconnectSocket]);

  const apiFetch = useCallback(
    async <T = unknown,>(path: string, options: RequestInit = {}): Promise<T> => {
      const executeRequest = async (forceRefreshToken: boolean): Promise<Response> => {
        const fbUser = auth.currentUser;
        const token = fbUser ? await getFreshToken(fbUser, forceRefreshToken) : tokenRef.current;

        const headers = new Headers(options.headers || {});
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        if (sessionKeyRef.current) {
          headers.set('x-session-key', sessionKeyRef.current);
        }
        if (!(options.body instanceof FormData) && !headers.has('Content-Type') && options.body) {
          headers.set('Content-Type', 'application/json');
        }
        return fetch(path, { ...options, headers });
      };

      let res = await executeRequest(false);

      // On 401 from an expired cached Firebase token, force-refresh once and retry
      if (res.status === 401 && auth.currentUser) {
        const errPreview = await res.clone().json().catch(() => ({}));
        if (errPreview.code === 'SESSION_REVOKED') {
          sessionKeyRef.current = null;
          setUser(null);
          setProfile(null);
          setOrganizations([]);
          disconnectSocket();
          setAuthError('Your session was signed out or expired. Please sign in again.');
          await signOut(auth).catch(() => {});
        } else {
          res = await executeRequest(true);
        }
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || `Request failed (${res.status})`) as Error & {
          status?: number;
          code?: string;
        };
        err.status = res.status;
        err.code = data.code;
        throw err;
      }
      return data as T;
    },
    [disconnectSocket, getFreshToken]
  );

  const syncBackendSession = useCallback(
    async (fbUser: FirebaseUser, forceTokenRefresh = false) => {
      if (syncInFlightRef.current && syncInFlightRef.current.uid === fbUser.uid) {
        return syncInFlightRef.current.promise;
      }

      const run = (async () => {
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const token = await getFreshToken(fbUser, forceTokenRefresh || attempt > 0);
            if (!token) throw new Error('Unable to retrieve authentication token');

            const headers = new Headers({
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            });
            if (sessionKeyRef.current) {
              headers.set('x-session-key', sessionKeyRef.current);
            }

            const res = await fetch('/api/auth/session', { method: 'POST', headers });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
              const err = new Error(data.error || `Session sync failed (${res.status})`) as Error & {
                status?: number;
              };
              err.status = res.status;
              if (res.status === 403 || (res.status === 401 && attempt > 0)) {
                throw err;
              }
              lastError = err;
            } else {
              sessionKeyRef.current = data.sessionKey;
              setUser(data.user);
              setProfile(data.profile);
              setOrganizations(data.organizations || []);
              setUnreadNotifications(data.unreadNotifications || 0);
              setMfaVerified(Boolean(data.mfaVerified));
              setAuthError(null);
              connectSocket();
              return;
            }
          } catch (err) {
            lastError = err;
          }
          await new Promise((r) => window.setTimeout(r, 450 * (attempt + 1)));
        }
        throw lastError ?? new Error('Unable to connect to authentication server');
      })();

      syncInFlightRef.current = { uid: fbUser.uid, promise: run };
      try {
        await run;
      } finally {
        if (syncInFlightRef.current?.promise === run) {
          syncInFlightRef.current = null;
        }
      }
    },
    [connectSocket, getFreshToken]
  );

  useEffect(() => {
    let active = true;
    const safeguardTimer = window.setTimeout(() => {
      if (active) setLoading(false);
    }, 8000);

    getRedirectResult(auth, browserPopupRedirectResolver)
      .then(async (result) => {
        if (!active || !result?.user) return;
        setFirebaseUser(result.user);
        try {
          await syncBackendSession(result.user, true);
        } catch (err) {
          if (active) setAuthError(formatAuthError(err));
        } finally {
          if (active) setLoading(false);
        }
      })
      .catch((err) => {
        if (!active) return;
        const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : '';
        if (code) {
          setAuthError(formatAuthError(err));
        }
      });

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      window.clearTimeout(safeguardTimer);
      if (!active) return;
      setFirebaseUser(fbUser);
      if (!fbUser) {
        tokenRef.current = null;
        sessionKeyRef.current = null;
        setUser(null);
        setProfile(null);
        setOrganizations([]);
        setUnreadNotifications(0);
        setMfaVerified(false);
        disconnectSocket();
        setLoading(false);
        return;
      }

      try {
        await syncBackendSession(fbUser);
      } catch (err) {
        console.error('Failed to sync backend session:', err);
        if (active) {
          setUser(null);
          setAuthError(formatAuthError(err));
        }
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      window.clearTimeout(safeguardTimer);
      unsub();
      disconnectSocket();
    };
  }, [disconnectSocket, syncBackendSession]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider, browserPopupRedirectResolver);
      await syncBackendSession(cred.user, true);
    } catch (err) {
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const signInWithGoogleRedirect = async () => {
    setAuthError(null);
    try {
      await signInWithRedirect(auth, googleAuthProvider, browserPopupRedirectResolver);
    } catch (err) {
      const msg = formatAuthError(err);
      setAuthError(msg);
      throw new Error(msg);
    }
  };

  const retryAuth = useCallback(async () => {
    setAuthError(null);
    if (!auth.currentUser) {
      await signInWithGoogle();
      return;
    }
    setLoading(true);
    try {
      await syncBackendSession(auth.currentUser, true);
    } catch (err) {
      setAuthError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }, [syncBackendSession]);

  const logout = async () => {
    const token = tokenRef.current;
    const sessionKey = sessionKeyRef.current;
    sessionKeyRef.current = null;
    tokenRef.current = null;
    setAuthError(null);
    disconnectSocket();

    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(sessionKey ? { 'x-session-key': sessionKey } : {}),
        },
      }).catch(() => {});
    }
    await signOut(auth);
  };

  const refreshSession = useCallback(async () => {
    if (auth.currentUser) {
      await syncBackendSession(auth.currentUser);
    }
  }, [syncBackendSession]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        user,
        profile,
        organizations,
        unreadNotifications,
        mfaVerified,
        loading,
        authError,
        socket,
        signInWithGoogle,
        signInWithGoogleRedirect,
        retryAuth,
        clearAuthError: () => setAuthError(null),
        logout,
        refreshSession,
        apiFetch,
        setUnreadNotifications,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
