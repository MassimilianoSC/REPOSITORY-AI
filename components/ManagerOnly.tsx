'use client';

import { ReactNode, useEffect, useState } from 'react';
import { getFirebaseAuth } from '@/lib/firebaseClient';

export function ManagerOnly({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const sub = auth.onIdTokenChanged(async (u) => {
      if (!u) return setOk(false);
      const r = await u.getIdTokenResult(true);
      setOk(r.claims?.role === 'manager');
    });
    return () => sub();
  }, []);

  if (ok === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-600">Verifica permessi…</div>
      </div>
    );
  }

  if (!ok) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Accesso Negato</h1>
          <p className="text-slate-600">Questa pagina è accessibile solo ai manager.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

