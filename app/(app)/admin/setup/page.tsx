'use client';

import { useState, useEffect } from 'react';
import { getFirebaseAuth, getFirebaseFunctions } from '@/lib/firebaseClient';
import { httpsCallable } from 'firebase/functions';
import { CheckCircle2, AlertCircle, Loader2, LogOut, User } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function AdminSetupPage() {
  const [user, setUser] = useState<any>(null);
  const [claims, setClaims] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [configuring, setConfiguring] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const tokenResult = await currentUser.getIdTokenResult();
        setClaims(tokenResult.claims);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const configureClaims = async () => {
    if (!user) return;

    setConfiguring(true);
    setError(null);
    setSuccess(false);

    try {
      const functions = getFirebaseFunctions();
      const devSetClaims = httpsCallable(functions, 'devSetClaims');

      const result = await devSetClaims({
        email: user.email,
        claims: {
          tenant_id: 'tenant-demo',
          company_ids: ['Acme Corp', 'Beta Inc', 'Gamma LLC'],
          role: 'manager'
        }
      });

      console.log('✅ Claims configurati:', result.data);
      setSuccess(true);
      setError(null);

      // Forza refresh del token per vedere i nuovi claims
      setTimeout(async () => {
        await user.getIdToken(true);
        const tokenResult = await user.getIdTokenResult();
        setClaims(tokenResult.claims);
      }, 1000);

    } catch (err: any) {
      console.error('❌ Errore:', err);
      setError(err.message || 'Errore durante la configurazione');
      setSuccess(false);
    } finally {
      setConfiguring(false);
    }
  };

  const logout = async () => {
    const auth = getFirebaseAuth();
    await auth.signOut();
    window.location.href = '/login';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Non autenticato</h1>
          <p className="text-slate-600 mb-6">Devi fare login per accedere a questa pagina.</p>
          <a
            href="/login"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Vai al Login
          </a>
        </div>
      </div>
    );
  }

  const hasClaims = claims?.tenant_id && claims?.role;

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-slate-900">Setup Iniziale Admin</h1>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>

          {/* User Info */}
          <div className="bg-slate-50 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <User className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-semibold text-slate-900">Utente Corrente</h2>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Email:</span>
                <span className="font-mono text-slate-900">{user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">UID:</span>
                <span className="font-mono text-slate-900 text-xs">{user.uid}</span>
              </div>
            </div>
          </div>

          {/* Claims Status */}
          <div className={`rounded-lg p-6 mb-6 ${hasClaims ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
            <div className="flex items-center gap-3 mb-4">
              {hasClaims ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              )}
              <h2 className="text-lg font-semibold text-slate-900">
                {hasClaims ? 'Custom Claims Configurati' : 'Custom Claims Mancanti'}
              </h2>
            </div>

            {hasClaims ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Tenant ID:</span>
                  <span className="font-mono text-slate-900">{claims.tenant_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Ruolo:</span>
                  <span className="font-mono text-slate-900">{claims.role}</span>
                </div>
                {claims.company_ids && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Aziende:</span>
                    <span className="font-mono text-slate-900 text-xs">
                      {Array.isArray(claims.company_ids) ? claims.company_ids.join(', ') : claims.company_ids}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-700">
                I custom claims sono necessari per accedere ai documenti e alle funzionalità dell'app.
                Clicca sul pulsante sotto per configurarli automaticamente.
              </p>
            )}
          </div>

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-green-900 mb-2">Claims Configurati con Successo!</h3>
                  <p className="text-sm text-green-700 mb-3">
                    I tuoi permessi sono stati impostati. Per applicare le modifiche:
                  </p>
                  <ol className="text-sm text-green-700 space-y-1 list-decimal list-inside">
                    <li>Fai <strong>LOGOUT</strong> (pulsante in alto a destra)</li>
                    <li>Fai <strong>LOGIN</strong> di nuovo</li>
                    <li>Vai sulla <strong>Dashboard</strong> → i documenti saranno visibili! 🎉</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-red-900 mb-1">Errore</h3>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Action Button */}
          {!hasClaims && (
            <button
              onClick={configureClaims}
              disabled={configuring}
              className={`w-full py-4 rounded-lg font-semibold text-white transition-all ${
                configuring
                  ? 'bg-blue-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
              }`}
            >
              {configuring ? (
                <span className="flex items-center justify-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Configurazione in corso...
                </span>
              ) : (
                'Configura i miei Claims'
              )}
            </button>
          )}

          {hasClaims && !success && (
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-4">
                I tuoi claims sono già configurati. Puoi tornare alla dashboard.
              </p>
              <a
                href="/dashboard"
                className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Vai alla Dashboard
              </a>
            </div>
          )}

          {/* Instructions */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">Cosa fanno i Custom Claims?</h3>
            <ul className="text-sm text-slate-600 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-blue-600 flex-shrink-0">•</span>
                <span><strong>tenant_id:</strong> Identifica a quale tenant (organizzazione) appartieni</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 flex-shrink-0">•</span>
                <span><strong>role:</strong> Definisce i tuoi permessi (manager, verifier, uploader)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-600 flex-shrink-0">•</span>
                <span><strong>company_ids:</strong> Lista delle aziende a cui hai accesso</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

