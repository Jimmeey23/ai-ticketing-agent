import React, { useState } from 'react';
import { Bot } from 'lucide-react';
import { useBackendAuth } from '@/contexts/BackendAuthContext';

export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session, loading, signIn, signInWithGoogle, signUp } = useBackendAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="p57-app-bg flex h-screen w-screen items-center justify-center text-sm font-medium text-stone-500">
        Loading secure workspace...
      </div>
    );
  }

  if (session) return <>{children}</>;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'sign-in') await signIn(email, password);
      else await signUp(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitGoogle = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed');
      setSubmitting(false);
    }
  };

  return (
    <div className="p57-app-bg flex h-screen w-screen items-center justify-center px-4">
      <form onSubmit={submit} className="animate-p57-fade-up w-full max-w-sm rounded-3xl border border-slate-200 bg-white/92 p-6 shadow-[0_30px_90px_rgba(15,23,42,0.14)] backdrop-blur-xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-blue-200 bg-stone-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-stone-950">Physique 57 Support OS</h1>
            <p className="text-xs text-stone-500">Secure ticketing workspace</p>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              required
            />
          </label>
        </div>

        {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</div>}

        <button
          type="button"
          onClick={submitGoogle}
          disabled={submitting}
          className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GoogleMark />
          Continue with Google
        </button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="h-11 w-full rounded-xl bg-stone-950 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(15,23,42,0.18)] transition duration-200 hover:-translate-y-0.5 hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Please wait...' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          onClick={() => setMode((current) => current === 'sign-in' ? 'sign-up' : 'sign-in')}
          className="mt-3 w-full text-xs font-semibold text-blue-700 hover:text-stone-950"
        >
          {mode === 'sign-in' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
};

const GoogleMark: React.FC = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
  </svg>
);
