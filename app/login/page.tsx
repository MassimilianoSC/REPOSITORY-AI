'use client';

import { useState, FormEvent, useEffect } from 'react';
import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { Mail, CheckCircle, Loader2, Shield, Sparkles, FileCheck, Lock } from 'lucide-react';

// Force client-side rendering only (no SSR)
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completingSignIn, setCompletingSignIn] = useState(false);

  // ⚠️ FIX CRITICO: Completa il login quando arrivi dal magic link
  useEffect(() => {
    const completeSignIn = async () => {
      const auth = getFirebaseAuth();
      
      // Verifica se l'URL contiene il magic link
      if (isSignInWithEmailLink(auth, window.location.href)) {
        setCompletingSignIn(true);
        
        // Recupera l'email salvata
        let emailForSignIn = window.localStorage.getItem('emailForSignIn');
        
        // Se non c'è, chiedi all'utente
        if (!emailForSignIn) {
          emailForSignIn = window.prompt('Conferma il tuo indirizzo email per completare l\'accesso');
        }

        if (!emailForSignIn) {
          setError('Email mancante. Impossibile completare l\'accesso.');
          setCompletingSignIn(false);
          return;
        }

        try {
          // Completa il login
          const result = await signInWithEmailLink(auth, emailForSignIn, window.location.href);
          console.log('✅ Login completato:', result.user.email);
          
          // Pulisci localStorage
          window.localStorage.removeItem('emailForSignIn');
          
          // Redirect alla dashboard
          router.push('/dashboard');
        } catch (err: any) {
          console.error('❌ Errore completamento login:', err);
          setError(err.message || 'Errore durante il completamento del login');
          setCompletingSignIn(false);
        }
      }
    };

    completeSignIn();
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const auth = getFirebaseAuth();
      const actionCodeSettings = {
        url: `${window.location.origin}/login`, // Reindirizza a /login per completare il sign-in
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossibile inviare il link via email');
    } finally {
      setLoading(false);
    }
  };

  // Mostra loader mentre completa il sign-in
  if (completingSignIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 p-4">
        <div className="max-w-md w-full bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-teal-500/30">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Completamento accesso...</h1>
          <p className="text-slate-600">
            Stiamo verificando il tuo link di accesso. Attendi qualche secondo.
          </p>
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 p-4">
        <div className="max-w-md w-full bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Controlla la tua email</h1>
          <p className="text-slate-600 mb-6">
            Abbiamo inviato un link di accesso a <strong className="text-teal-600">{email}</strong>
          </p>
          <div className="p-4 bg-teal-50 rounded-2xl border border-teal-100">
            <p className="text-sm text-teal-700">
              💡 Clicca sul link nell'email per completare l'accesso. Puoi chiudere questa finestra.
            </p>
          </div>
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
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shadow-xl shadow-teal-500/30">
              <Shield className="w-9 h-9 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white tracking-tight">SIKURO</h1>
              <p className="text-teal-300 font-medium">Document AI Platform</p>
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
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center shadow-lg">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">SIKURO</h1>
              <p className="text-xs text-slate-500">Document AI</p>
            </div>
          </div>

          <div className="mb-8 text-center lg:text-left">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Bentornato! 👋</h1>
            <p className="text-slate-500">Accedi per gestire i tuoi documenti</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
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
                  disabled={loading}
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
              disabled={loading || !email}
              className="w-full py-4 px-4 bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold rounded-2xl hover:from-teal-600 hover:to-emerald-600 focus:ring-4 focus:ring-teal-300 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed transition-all shadow-lg shadow-teal-500/25 hover:shadow-xl hover:shadow-teal-500/30"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Invio in corso...
                </span>
              ) : (
                'Invia link di accesso'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500 flex items-center justify-center gap-2">
              <Lock className="w-4 h-4" />
              Accesso sicuro senza password
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
