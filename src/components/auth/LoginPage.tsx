/**
 * LoginPage.tsx
 *
 * Sign-in / sign-up screen with email+password and Google OAuth.
 * Shown when the preparer is not yet authenticated.
 */

import { useState, FormEvent } from 'react';
import { Calculator, LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';

export function LoginPage() {
  const { signIn, signUp, signInWithGoogle, error } = useAuth();
  const [mode, setMode]         = useState<'signin' | 'signup'>('signin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [info, setInfo]         = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalErr(null);
    setInfo(null);
    if (!email.trim() || !password) {
      setLocalErr('Email and password are required.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setLocalErr('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
        setInfo('Account created. You are signed in.');
      }
    } catch {
      // surfaced via context error
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLocalErr(null);
    setInfo(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch {
      // surfaced via context error
    } finally {
      setLoading(false);
    }
  };

  const displayError = localErr ?? error;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 bg-primary rounded flex items-center justify-center">
            <Calculator className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Tax Forensics</h1>
            <p className="text-xs text-muted-foreground">Preparer Portal</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </CardTitle>
            <CardDescription>
              {mode === 'signin'
                ? 'Use your preparer credentials to continue.'
                : 'New here? Set up your preparer account.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => { setMode(v as 'signin' | 'signup'); setLocalErr(null); setInfo(null); }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value={mode} className="mt-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="preparer@example.com"
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={loading}
                    />
                  </div>

                  {displayError && (
                    <div className="flex items-start gap-2 p-3 bg-destructive/10 text-destructive rounded text-sm">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{displayError}</span>
                    </div>
                  )}
                  {info && !displayError && (
                    <div className="p-3 bg-muted text-foreground rounded text-sm">{info}</div>
                  )}

                  <Button type="submit" className="w-full" disabled={loading}>
                    {mode === 'signin'
                      ? <><LogIn className="w-4 h-4 mr-2" />{loading ? 'Signing in…' : 'Sign in'}</>
                      : <><UserPlus className="w-4 h-4 mr-2" />{loading ? 'Creating…' : 'Create account'}</>}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogle}
              disabled={loading}
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </Button>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to our terms and acknowledge that this is a preparer-only portal.
        </p>
      </div>
    </div>
  );
}
