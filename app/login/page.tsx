'use client';

import { useState, FormEvent, useEffect } from 'react';
import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { Mail, CheckCircle, Loader2 } from 'lucide-react';

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <Loader2 className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="mb-6">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Controlla la tua casella di posta</h1>
          <p className="text-slate-600 mb-6">
            Abbiamo inviato un link di accesso a <strong>{email}</strong>
          </p>
          <p className="text-sm text-slate-500">
            Clicca sul link nell'email per completare l'accesso. Puoi chiudere questa finestra.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="mb-8 text-center">
          <Mail className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Bentornato</h1>
          <p className="text-slate-600">Accedi per gestire i tuoi documenti</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
              Indirizzo email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-shadow disabled:bg-slate-50 disabled:cursor-not-allowed"
              placeholder="tuoindirizzo@esempio.com"
            />
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full py-3 px-4 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 focus:ring-4 focus:ring-slate-300 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Invio in corso...' : 'Invia link di accesso'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Ti invieremo un link magico per accedere senza password
        </p>
      </div>
    </div>
  );
}
