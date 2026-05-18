import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { backendSupabase } from '@/lib/backend-supabase';

export type AccessRole = 'admin' | 'support';

interface BackendProfile {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
  team?: string | null;
}

interface BackendAuthContextValue {
  session: Session | null;
  user: User | null;
  profile: BackendProfile | null;
  accessRole: AccessRole;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const BackendAuthContext = createContext<BackendAuthContextValue | null>(null);

export const BackendAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<BackendProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (nextSession: Session | null) => {
    if (!nextSession?.user) {
      setProfile(null);
      return;
    }
    const { data } = await backendSupabase
      .from('profiles')
      .select('id,email,full_name,role,team')
      .eq('id', nextSession.user.id)
      .maybeSingle();
    setProfile((data as BackendProfile | null) || {
      id: nextSession.user.id,
      email: nextSession.user.email,
      full_name: typeof nextSession.user.user_metadata?.full_name === 'string'
        ? nextSession.user.user_metadata.full_name
        : null,
      role: 'support',
    });
  };

  useEffect(() => {
    let mounted = true;
    backendSupabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (!mounted) return;
      setLoading(false);
    });

    const { data: listener } = backendSupabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession).finally(() => setLoading(false));
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const accessRole: AccessRole = profile?.role === 'admin' ? 'admin' : 'support';

  const value = useMemo<BackendAuthContextValue>(() => ({
    session,
    user: session?.user || null,
    profile,
    accessRole,
    loading,
    signIn: async (email, password) => {
      const { error } = await backendSupabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signInWithGoogle: async () => {
      const { error } = await backendSupabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });
      if (error) throw error;
    },
    signUp: async (email, password) => {
      const { error } = await backendSupabase.auth.signUp({ email, password });
      if (error) throw error;
    },
    signOut: async () => {
      const { error } = await backendSupabase.auth.signOut();
      if (error) throw error;
    },
  }), [accessRole, loading, profile, session]);

  return <BackendAuthContext.Provider value={value}>{children}</BackendAuthContext.Provider>;
};

export const useBackendAuth = () => {
  const context = useContext(BackendAuthContext);
  if (!context) throw new Error('useBackendAuth must be used within BackendAuthProvider');
  return context;
};
