/**
 * AuthContext.tsx
 *
 * Auth state for the preparer app, backed by the official supabase-js client.
 *
 * Pattern: subscribe to onAuthStateChange FIRST, then call getSession() to
 * restore the existing session from localStorage. This avoids a race where
 * INITIAL_SESSION fires before our listener is attached.
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isSupabaseConfigured, SupabaseUser } from '@/lib/supabaseClient';

interface AuthContextValue {
  user: SupabaseUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabaseEnabled = isSupabaseConfigured();

  const [user,      setUser]      = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(supabaseEnabled);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseEnabled) { setIsLoading(false); return; }

    // 1. Subscribe FIRST so we don't miss INITIAL_SESSION
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email ?? '' } : null);
      setIsLoading(false);
    });

    // 2. Then bootstrap from storage
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email ?? '' } : null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabaseEnabled]);

  const signIn = async (email: string, password: string) => {
    setError(null);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); throw err; }
    if (data.user) setUser({ id: data.user.id, email: data.user.email ?? email });
  };

  const signUp = async (email: string, password: string) => {
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (err) { setError(err.message); throw err; }
    if (data.user && data.session) {
      setUser({ id: data.user.id, email: data.user.email ?? email });
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    const { lovable } = await import('@/integrations/lovable/index');
    const result = await lovable.auth.signInWithOAuth('google', {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      const msg = result.error instanceof Error ? result.error.message : 'Google sign-in failed.';
      setError(msg);
      throw result.error;
    }
    // If redirected, browser navigates away. If not, session is set already.
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const isAuthenticated = !supabaseEnabled || user !== null;

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated, isLoading,
      signIn, signUp, signInWithGoogle, signOut, error,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
