'use client';

/**
 * useAuth - Hook centralizzato per autenticazione e claims
 * Fornisce uid, tenantId, role, companyIds da Firebase Auth custom claims
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { getUserClaims, UserClaims, UserRole } from '@/lib/rbac';

export interface AuthState {
  user: User | null;
  uid: string | null;
  tenantId: string | null;
  role: UserRole | null;
  companyIds: string[];
  email: string | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook per ottenere lo stato di autenticazione e i custom claims
 * 
 * @example
 * const { uid, tenantId, role, loading } = useAuth();
 * 
 * if (loading) return <Spinner />;
 * if (!tenantId) return <Redirect to="/login" />;
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    uid: null,
    tenantId: null,
    role: null,
    companyIds: [],
    email: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Evita esecuzione lato server
    if (typeof window === 'undefined') {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    let mounted = true;

    const auth = getFirebaseAuth();
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!mounted) return;

      if (!user) {
        // Utente non autenticato
        setState({
          user: null,
          uid: null,
          tenantId: null,
          role: null,
          companyIds: [],
          email: null,
          loading: false,
          error: null,
        });
        return;
      }

      try {
        // Utente autenticato, ottieni i custom claims
        const claims = await getUserClaims(user);

        if (!mounted) return;

        setState({
          user,
          uid: user.uid,
          tenantId: claims?.tenantId || null,
          role: claims?.role || null,
          companyIds: claims?.companyIds || [],
          email: user.email || null,
          loading: false,
          error: null,
        });
      } catch (error) {
        console.error('[useAuth] Error getting user claims:', error);
        
        if (!mounted) return;

        setState({
          user,
          uid: user.uid,
          tenantId: null,
          role: null,
          companyIds: [],
          email: user.email || null,
          loading: false,
          error: error as Error,
        });
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return state;
}

/**
 * Hook per verificare se l'utente è autenticato
 */
export function useIsAuthenticated(): boolean {
  const { uid, loading } = useAuth();
  return !loading && !!uid;
}

/**
 * Hook per verificare se l'utente ha un ruolo specifico
 */
export function useHasRole(requiredRole: UserRole): boolean {
  const { role, loading } = useAuth();
  
  if (loading || !role) return false;
  
  // Gerarchia ruoli: manager > verifier > uploader
  const roleHierarchy: Record<UserRole, number> = {
    uploader: 1,
    verifier: 2,
    manager: 3,
  };
  
  return roleHierarchy[role] >= roleHierarchy[requiredRole];
}

/**
 * Hook per verificare se l'utente può accedere a una specifica azienda
 */
export function useCanAccessCompany(companyId: string): boolean {
  const { companyIds, role, loading } = useAuth();
  
  if (loading) return false;
  
  // Manager vede tutto
  if (role === 'manager') return true;
  
  // Altri ruoli: solo le aziende assegnate
  return companyIds.includes(companyId);
}

