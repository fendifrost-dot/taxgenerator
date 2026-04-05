/**
 * AuthContext.tsx
 *
 * Provides authentication state for the preparer app.
 *
 * - If Supabase is NOT configured → isAuthenticated is always true (local mode).
 * - If Supabase IS configured → shows LoginPage until signed in.
 *
 * This means the app works out of the box with zero config, and gains
 * secure multi-client persistence once Supabase is wired up.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  isSupabaseConfigured,
  getSession,
  signIn as sbSignIn,
  signOut as sbSignOut,
  SupabaseUser,
} from '@/lib/supabaseClient';

interface AuthContextValue {
  user: SupabaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabaseEnabled = isSupabaseConfigured();

  const [user,      setUser]      = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(supabaseEnabled); // only loading when Supabase is configured
  const [error,     setError]     = useState<string | null>(null);

  // Restore session from sessionStorage on mount
  useEffect(() => {
    if (!supabaseEnabled) { setIsLoading(false); return; }
    const session = getSession();
    if (session) setUser(session.user);
    setIsLoading(false);
  }, [supabaseEnabled]);

  const signIn = async (email: string, password: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const u = await sbSignIn(email, password);
      setUser(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
      throw e;
    } finally {
      setIsLoading(false);
    }
  };

  const signOut = async () => {
    await sbSignOut();
    setUser(null);
  };

  // Local mode: always authenticated, no user object needed
  const isAuthenticated = !supabaseEnabled || user !== null;

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, isLoading, signIn, signOut, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
