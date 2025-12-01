'use client';

import { useEffect, useState } from 'react';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebaseClient';
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function AcceptInvitePage() {
  const params = useSearchParams();
  const router = useRouter();
  const inviteId = params.get('inviteId') ?? '';
  const tid = params.get('tid') ?? '';
  const [msg, setMsg] = useState('Preparazione…');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    (async () => {
      const auth = getFirebaseAuth();
      
      try {
        // 1) Se il link è un emailLink, completa la sign-in
        if (isSignInWithEmailLink(auth, window.location.href) && !auth.currentUser) {
          const cached = window.localStorage.getItem('emailForSignIn')
            ?? window.prompt('Inserisci la tua email per completare l\'accesso');
          
          if (!cached) {
            setStatus('error');
            setMsg('Email mancante. Impossibile completare l\'accesso.');
            return;
          }

          setMsg('Completamento accesso...');
          const result = await signInWithEmailLink(auth, String(cached), window.location.href);
          window.localStorage.removeItem('emailForSignIn');
          // Forza refresh token dopo sign-in
          await result.user.getIdToken(true);
        }

        const currentUser = auth.currentUser;
        if (!currentUser) {
          setStatus('error');
          setMsg('Accesso richiesto: torna alla pagina di login e usa il link ricevuto.');
          return;
        }

        // 2) Invoca acceptInvite (callable backend)
        const functions = getFirebaseFunctions();
        const fn = httpsCallable(functions, 'acceptInvite');
        
        setMsg('Validazione invito…');
        const res: any = await fn({ inviteId, tid });

        if (!res?.data?.ok) {
          setStatus('error');
          setMsg(`Invito non valido: ${res?.data?.error ?? 'errore'}`);
          return;
        }

        // 3) ✅ FIX: Forza refresh del token per ottenere le nuove claims
        // Aspetta un attimo per dare tempo al backend di propagare le claims
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Forza il refresh del token
        await currentUser.getIdToken(true);
        
        // Log per debug
        const tokenResult = await currentUser.getIdTokenResult(true);
        console.log('[acceptInvite] New claims:', tokenResult.claims);
        
        setStatus('success');
        setMsg('Invito accettato! Reindirizzamento alla dashboard…');
        
        setTimeout(() => {
          // Hard navigation per forzare reload completo con nuove claims
          window.location.assign('/dashboard/');
        }, 1500);
      } catch (e: any) {
        console.error(e);
        setStatus('error');
        setMsg(`Errore: ${e.message ?? e}`);
      }
    })();
  }, [inviteId, tid, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Accettazione Invito</h1>
          </>
        )}
        
        {status === 'success' && (
          <>
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-green-900 mb-2">Invito Accettato!</h1>
          </>
        )}
        
        {status === 'error' && (
          <>
            <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-red-900 mb-2">Errore</h1>
          </>
        )}
        
        <p className="text-slate-600">{msg}</p>
      </div>
    </div>
  );
}

