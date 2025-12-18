'use client';

import { useEffect, useState } from 'react';
import { getFirebaseAuth, getFirebaseFunctions, getFirebaseDb } from '@/lib/firebaseClient';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, XCircle, Mail, Lock, User as UserIcon, AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

type InviteData = {
  email: string;
  role: string;
  company_ids: string[];
  status: string;
};

export default function AcceptInvitePage() {
  const params = useSearchParams();
  const router = useRouter();
  const inviteId = params.get('inviteId') ?? '';
  const tid = params.get('tid') ?? '';
  
  // Stati
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  // Form email/password
  const [isRegistering, setIsRegistering] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  
  // Stato verifica email
  const [waitingEmailVerification, setWaitingEmailVerification] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Carica dettagli invito
  useEffect(() => {
    async function loadInvite() {
      if (!inviteId || !tid) {
        setError('Link invito non valido (parametri mancanti)');
        setLoading(false);
        return;
      }

      try {
        const db = getFirebaseDb();
        const inviteRef = doc(db, `tenants/${tid}/invites/${inviteId}`);
        const snap = await getDoc(inviteRef);

        if (!snap.exists()) {
          setError('Invito non trovato');
          setLoading(false);
          return;
        }

        const data = snap.data() as InviteData;
        
        if (data.status === 'accepted') {
          setError('Questo invito è già stato accettato');
          setLoading(false);
          return;
        }
        
        if (data.status === 'cancelled') {
          setError('Questo invito è stato revocato');
          setLoading(false);
          return;
        }

        setInvite(data);
        setEmail(data.email); // Pre-compila email
        setLoading(false);
      } catch (e: any) {
        console.error('Error loading invite:', e);
        setError(`Errore nel caricamento dell'invito: ${e.message}`);
        setLoading(false);
      }
    }

    loadInvite();
  }, [inviteId, tid]);

  // Monitora stato autenticazione per verifica email
  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      
      // Se l'utente è loggato e stiamo aspettando la verifica email
      if (user && waitingEmailVerification) {
        // Controlla periodicamente se l'email è stata verificata
        const checkVerification = setInterval(async () => {
          await user.reload();
          if (user.emailVerified) {
            clearInterval(checkVerification);
            setWaitingEmailVerification(false);
            completeAcceptInvite(user);
          }
        }, 3000);

        return () => clearInterval(checkVerification);
      }
    });

    return () => unsubscribe();
  }, [waitingEmailVerification]);

  // Funzione per completare l'accettazione dell'invito
  async function completeAcceptInvite(user: User) {
    setProcessing(true);
    setFormError(null);

    try {
      const functions = getFirebaseFunctions();
      const fn = httpsCallable(functions, 'acceptInvite');
      
      const res: any = await fn({ inviteId, tid });

      if (!res?.data?.ok) {
        throw new Error(res?.data?.error ?? 'Errore nell\'accettazione dell\'invito');
      }

      // Forza refresh del token per ottenere le nuove claims
      await new Promise(resolve => setTimeout(resolve, 500));
      await user.getIdToken(true);
      
      const tokenResult = await user.getIdTokenResult(true);
      console.log('[acceptInvite] New claims:', tokenResult.claims);

      setSuccess(true);
      setTimeout(() => {
        window.location.assign('/dashboard/');
      }, 1500);
    } catch (e: any) {
      console.error('Error accepting invite:', e);
      setFormError(e.message);
      setProcessing(false);
    }
  }

  // Google Sign-In
  async function handleGoogleSignIn() {
    setProcessing(true);
    setFormError(null);

    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      
      const result = await signInWithPopup(auth, provider);
      
      // Verifica che l'email corrisponda all'invito
      if (invite && result.user.email?.toLowerCase() !== invite.email.toLowerCase()) {
        setFormError(`L'email dell'account Google (${result.user.email}) non corrisponde all'email dell'invito (${invite.email})`);
        await auth.signOut();
        setProcessing(false);
        return;
      }

      // Google verifica automaticamente l'email, procedi
      await completeAcceptInvite(result.user);
    } catch (e: any) {
      console.error('Google sign-in error:', e);
      if (e.code === 'auth/popup-closed-by-user') {
        setFormError('Accesso annullato');
      } else {
        setFormError(e.message);
      }
      setProcessing(false);
    }
  }

  // Email/Password Sign-In o Registrazione
  async function handleEmailPassword(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Validazioni
    if (!email || !password) {
      setFormError('Compila tutti i campi');
      return;
    }

    if (isRegistering && password !== confirmPassword) {
      setFormError('Le password non corrispondono');
      return;
    }

    if (password.length < 6) {
      setFormError('La password deve essere di almeno 6 caratteri');
      return;
    }

    // Verifica email corrisponda all'invito
    if (invite && email.toLowerCase() !== invite.email.toLowerCase()) {
      setFormError(`L'email deve corrispondere all'invito (${invite.email})`);
      return;
    }

    setProcessing(true);

    try {
      const auth = getFirebaseAuth();
      let user: User;

      if (isRegistering) {
        // Registrazione
        const result = await createUserWithEmailAndPassword(auth, email, password);
        user = result.user;

        // Invia email di verifica
        await sendEmailVerification(user);
        setWaitingEmailVerification(true);
        setProcessing(false);
        return; // Aspetta la verifica
      } else {
        // Login
        const result = await signInWithEmailAndPassword(auth, email, password);
        user = result.user;

        // Verifica se l'email è verificata
        if (!user.emailVerified) {
          await sendEmailVerification(user);
          setWaitingEmailVerification(true);
          setProcessing(false);
          return; // Aspetta la verifica
        }

        // Email già verificata, procedi
        await completeAcceptInvite(user);
      }
    } catch (e: any) {
      console.error('Email/password error:', e);
      
      if (e.code === 'auth/email-already-in-use') {
        setFormError('Email già registrata. Prova ad accedere invece di registrarti.');
        setIsRegistering(false);
      } else if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        setFormError('Password non corretta');
      } else if (e.code === 'auth/user-not-found') {
        setFormError('Utente non trovato. Prova a registrarti.');
        setIsRegistering(true);
      } else {
        setFormError(e.message);
      }
      setProcessing(false);
    }
  }

  // Reinvia email di verifica
  async function handleResendVerification() {
    if (currentUser) {
      await sendEmailVerification(currentUser);
      alert('Email di verifica inviata!');
    }
  }

  // ============ RENDER ============

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <Loader2 className="w-16 h-16 text-teal-500 mx-auto mb-4 animate-spin" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Caricamento invito...</h1>
        </div>
      </div>
    );
  }

  // Errore caricamento invito
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-red-900 mb-2">Invito non valido</h1>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  // Successo
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-green-900 mb-2">Invito Accettato!</h1>
          <p className="text-slate-600">Reindirizzamento alla dashboard...</p>
        </div>
      </div>
    );
  }

  // Attesa verifica email
  if (waitingEmailVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <Mail className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Verifica la tua email</h1>
          <p className="text-slate-600 mb-4">
            Abbiamo inviato un'email di verifica a <strong>{email}</strong>.
            <br />Clicca sul link nell'email per continuare.
          </p>
          <p className="text-sm text-slate-500 mb-4">
            Questa pagina si aggiornerà automaticamente dopo la verifica.
          </p>
          <button
            onClick={handleResendVerification}
            className="text-teal-600 hover:text-teal-700 text-sm font-medium"
          >
            Reinvia email di verifica
          </button>
        </div>
      </div>
    );
  }

  // Pagina principale con form
  const roleLabels: Record<string, string> = {
    manager: 'Amministratore',
    verifier: 'Verificatore',
    uploader: 'Operatore',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-500 to-emerald-600 p-6 text-white text-center">
          <h1 className="text-2xl font-bold mb-1">HQ Document AI</h1>
          <p className="text-teal-100 text-sm">Sei stato invitato!</p>
        </div>

        {/* Dettagli invito */}
        <div className="p-6 bg-slate-50 border-b">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Email invitato</p>
              <p className="font-medium text-slate-900">{invite?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Ruolo assegnato</p>
              <p className="font-medium text-slate-900">{roleLabels[invite?.role ?? ''] || invite?.role}</p>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-6">
          {formError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{formError}</p>
            </div>
          )}

          {/* Google Sign-In */}
          <button
            onClick={handleGoogleSignIn}
            disabled={processing}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border-2 border-slate-200 rounded-xl hover:bg-slate-50 transition-colors mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="font-medium text-slate-700">
              {processing ? 'Accesso in corso...' : 'Continua con Google'}
            </span>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-slate-200"></div>
            <span className="text-sm text-slate-500">oppure</span>
            <div className="flex-1 h-px bg-slate-200"></div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailPassword}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder="La tua email"
                    disabled={processing}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    placeholder={isRegistering ? 'Crea una password' : 'La tua password'}
                    disabled={processing}
                  />
                </div>
              </div>

              {isRegistering && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Conferma Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      placeholder="Ripeti la password"
                      disabled={processing}
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={processing}
                className="w-full py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Elaborazione...
                  </>
                ) : isRegistering ? (
                  'Registrati e Accetta Invito'
                ) : (
                  'Accedi e Accetta Invito'
                )}
              </button>
            </div>
          </form>

          {/* Toggle Registrazione/Login */}
          <p className="text-center text-sm text-slate-600 mt-4">
            {isRegistering ? (
              <>
                Hai già un account?{' '}
                <button
                  onClick={() => setIsRegistering(false)}
                  className="text-teal-600 hover:text-teal-700 font-medium"
                >
                  Accedi
                </button>
              </>
            ) : (
              <>
                Non hai un account?{' '}
                <button
                  onClick={() => setIsRegistering(true)}
                  className="text-teal-600 hover:text-teal-700 font-medium"
                >
                  Registrati
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
