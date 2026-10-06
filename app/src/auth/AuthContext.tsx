import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { resetDb } from '../db/db';

interface Session { lenderId: string; email: string }
interface Ctx {
  session: Session | null;
  loading: boolean;
  cloud: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

const LOCAL_KEY = 'local_session';
const localId = (email: string) => 'local-' + email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        const u = data.session?.user;
        if (u) setSession({ lenderId: u.id, email: u.email ?? '' });
        supabase.auth.onAuthStateChange((_e, s) => {
          setSession(s?.user ? { lenderId: s.user.id, email: s.user.email ?? '' } : null);
        });
      } else {
        const raw = await AsyncStorage.getItem(LOCAL_KEY);
        if (raw) setSession(JSON.parse(raw));
      }
      setLoading(false);
    })();
  }, []);

  const signIn = async (email: string, password: string) => {
    const cleanEmail = email.trim();
    if (!cleanEmail || password.length < 6) throw new Error('Email y contraseña (mín. 6 caracteres) requeridos');
    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) throw new Error(error.message);
    } else {
      const s = { lenderId: localId(cleanEmail), email: cleanEmail };
      await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(s));
      resetDb();
      setSession(s);
    }
  };

  const signUp = async (email: string, password: string) => {
    if (!email || password.length < 6) throw new Error('Email y contraseña (mín. 6 caracteres) requeridos');
    if (supabase) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw new Error(error.message);
    } else {
      await signIn(email, password);
    }
  };

  const signInLocal = async (email: string) => {
    const s = { lenderId: localId(email), email };
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(s));
    resetDb();
    setSession(s);
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    await AsyncStorage.removeItem(LOCAL_KEY);
    resetDb();
    setSession(null);
  };

  return (
    <AuthCtx.Provider value={{ session, loading, cloud: !!supabase, signIn, signUp, signOut, signInLocal } as any}>
      {children}
    </AuthCtx.Provider>
  );
}
