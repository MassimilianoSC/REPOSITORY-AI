'use client';

import { useState, FormEvent, useEffect } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { Mail, Loader2, Shield, Sparkles, FileCheck, Lock, LogIn, ArrowLeft, CheckCircle } from 'lucide-react';

// Force client-side rendering only (no SSR)
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Controlla se l'utente è già loggato
  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        router.push('/dashboard');
      } else {
        setCheckingAuth(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // onAuthStateChanged gestirà il redirect
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Popup chiuso. Riprova.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        // Ignora, l'utente ha aperto più popup
      } else {
        setError(err.message || 'Errore durante l\'accesso con Google');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged gestirà il redirect
    } catch (err: any) {
      console.error('Email Sign-In error:', err);
      if (err.code === 'auth/user-not-found') {
        setError('Utente non trovato. Verifica l\'email o contatta l\'amministratore.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Password errata. Riprova.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Email non valida.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Troppi tentativi. Riprova più tardi.');
      } else if (err.code === 'auth/invalid-credential') {
        setError('Credenziali non valide. Verifica email e password.');
      } else {
        setError(err.message || 'Errore durante l\'accesso');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err: any) {
      console.error('Password Reset error:', err);
      if (err.code === 'auth/user-not-found') {
        setError('Nessun account trovato con questa email.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Email non valida.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Troppi tentativi. Riprova più tardi.');
      } else {
        setError(err.message || 'Errore durante l\'invio dell\'email');
      }
    } finally {
      setResetLoading(false);
    }
  };

  const backToLogin = () => {
    setResetMode(false);
    setResetSent(false);
    setError(null);
  };

  // Mostra loader mentre controlla autenticazione
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 p-4">
        <div className="max-w-md w-full bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-teal-500/30">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Caricamento...</h1>
          <p className="text-slate-600">Verifica autenticazione in corso</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-teal-400 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-emerald-400 rounded-full blur-3xl" />
        </div>
        
        <div className="relative z-10 max-w-lg">
          <div className="flex items-center gap-4 mb-8">
            <h1 className="text-7xl font-black tracking-tight text-indigo-500">HQ</h1>
            <div className="h-12 w-px bg-slate-600" />
            <div>
              <p className="text-xl text-slate-300 font-medium">Document AI</p>
              <p className="text-sm text-slate-500">Platform</p>
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-white mb-6">
            Gestione documentale <br />
            <span className="text-teal-400">intelligente e sicura</span>
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-slate-300">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <FileCheck className="w-5 h-5 text-teal-400" />
              </div>
              <span>Verifica automatica con AI</span>
            </div>
            <div className="flex items-center gap-4 text-slate-300">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-teal-400" />
              </div>
              <span>Conformità normativa garantita</span>
            </div>
            <div className="flex items-center gap-4 text-slate-300">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-amber-400" />
              </div>
              <span>Notifiche scadenze proattive</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <h1 className="text-5xl font-black tracking-tight text-indigo-600">HQ</h1>
            <div className="h-10 w-px bg-slate-300" />
            <div>
              <p className="text-sm text-slate-600 font-medium">Document AI</p>
            </div>
          </div>

          {/* Contenuto dinamico basato sulla modalità */}
          {resetMode ? (
            // MODALITÀ RESET PASSWORD
            resetSent ? (
              // Email inviata con successo
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <CheckCircle className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Email inviata!</h1>
                <p className="text-slate-600 mb-6">
                  Abbiamo inviato un link per reimpostare la password a <strong className="text-teal-600">{email}</strong>
                </p>
                <div className="p-4 bg-teal-50 rounded-2xl border border-teal-100 mb-6">
                  <p className="text-sm text-teal-700">
                    💡 Controlla la tua casella di posta (anche lo spam) e clicca sul link per creare una nuova password.
                  </p>
                </div>
                <button
                  onClick={backToLogin}
                  className="w-full py-4 px-4 bg-slate-100 text-slate-700 font-semibold rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Torna al login
                </button>
              </div>
            ) : (
              // Form per richiedere reset password
              <>
                <button
                  onClick={backToLogin}
                  className="flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors mb-6"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Torna al login
                </button>

                <div className="mb-8 text-center lg:text-left">
                  <h1 className="text-3xl font-bold text-slate-900 mb-2">Password dimenticata?</h1>
                  <p className="text-slate-500">Inserisci la tua email per ricevere il link di reset</p>
                </div>

                <form onSubmit={handlePasswordReset} className="space-y-4">
                  <div>
                    <label htmlFor="reset-email" className="block text-sm font-semibold text-slate-700 mb-2">
                      Indirizzo email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        id="reset-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={resetLoading}
                        className="w-full pl-12 pr-4 py-4 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all disabled:bg-slate-50 disabled:cursor-not-allowed bg-slate-50"
                        placeholder="tuoindirizzo@esempio.com"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={resetLoading || !email}
                    className="w-full py-4 px-4 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold rounded-2xl hover:from-teal-600 hover:to-emerald-600 focus:ring-4 focus:ring-teal-300 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed transition-all shadow-lg shadow-teal-500/25 hover:shadow-xl hover:shadow-teal-500/30 flex items-center justify-center gap-2"
                  >
                    {resetLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Invio in corso...
                      </>
                    ) : (
                      <>
                        <Mail className="w-5 h-5" />
                        Invia link di reset
                      </>
                    )}
                  </button>
                </form>
              </>
            )
          ) : (
            // MODALITÀ LOGIN NORMALE
            <>
              <div className="mb-8 text-center lg:text-left">
                <h1 className="text-3xl font-bold text-slate-900 mb-2">Bentornato! 👋</h1>
                <p className="text-slate-500">Accedi per gestire i tuoi documenti</p>
              </div>

              {/* Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || loading}
                className="w-full py-4 px-4 bg-white border-2 border-slate-200 text-slate-700 font-semibold rounded-2xl hover:bg-slate-50 hover:border-slate-300 focus:ring-4 focus:ring-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-3 mb-6 shadow-sm"
              >
                {googleLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                Continua con Google
              </button>

              {/* Divider */}
              <div className="relative flex items-center justify-center my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <span className="relative bg-white px-4 text-sm text-slate-400">oppure</span>
              </div>

              {/* Email/Password Form */}
              <form onSubmit={handleEmailSignIn} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-2">
                    Indirizzo email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={loading || googleLoading}
                      className="w-full pl-12 pr-4 py-4 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all disabled:bg-slate-50 disabled:cursor-not-allowed bg-slate-50"
                      placeholder="tuoindirizzo@esempio.com"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => { setResetMode(true); setError(null); }}
                      className="text-sm text-teal-600 hover:text-teal-700 font-medium transition-colors"
                    >
                      Password dimenticata?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading || googleLoading}
                      className="w-full pl-12 pr-4 py-4 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all disabled:bg-slate-50 disabled:cursor-not-allowed bg-slate-50"
                      placeholder="La tua password"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || googleLoading || !email || !password}
                  className="w-full py-4 px-4 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold rounded-2xl hover:from-teal-600 hover:to-emerald-600 focus:ring-4 focus:ring-teal-300 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed transition-all shadow-lg shadow-teal-500/25 hover:shadow-xl hover:shadow-teal-500/30 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Accesso in corso...
                    </>
                  ) : (
                    <>
                      <LogIn className="w-5 h-5" />
                      Accedi
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-slate-500 flex items-center justify-center gap-2">
                  <Shield className="w-4 h-4" />
                  Accesso sicuro e protetto
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
