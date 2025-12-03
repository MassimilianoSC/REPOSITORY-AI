'use client';

/**
 * useAuth - Hook centralizzato per autenticazione e claims
 * Fornisce uid, tenantId, role, companyIds da Firebase Auth custom claims
 * 
 * ✅ FIX: Usa onIdTokenChanged invece di onAuthStateChanged per ricevere
 * aggiornamenti quando le custom claims cambiano (dopo acceptInvite)
 */

import { useEffect, useState, useRef, useMemo } from 'react';
import { onIdTokenChanged, getIdTokenResult, User } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebaseClient';
import { UserRole } from '@/lib/rbac';

export interface AuthState {
  user: User | null;
  uid: string | null;
  tenantId: string | null;
  role: UserRole | null;
  companyIds: string[];
  companyIdsKey: string; // ✅ Chiave stabile per confronti
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
// ✅ Array vuoto stabile per evitare re-render
const EMPTY_COMPANY_IDS: string[] = [];

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    uid: null,
    tenantId: null,
    role: null,
    companyIds: EMPTY_COMPANY_IDS,
    companyIdsKey: '',
    email: null,
    loading: true,
    error: null,
  });
  
  // ✅ Ref per mantenere companyIds stabile
  const companyIdsRef = useRef<string[]>(EMPTY_COMPANY_IDS);

  useEffect(() => {
    // Evita esecuzione lato server
    if (typeof window === 'undefined') {
      setState(prev => ({ ...prev, loading: false }));
      return;
    }

    let mounted = true;

    const auth = getFirebaseAuth();
    
    // ✅ FIX: Usa onIdTokenChanged per ricevere aggiornamenti quando il token cambia
    // Questo è fondamentale per ricevere le nuove claims dopo acceptInvite
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!mounted) return;

      if (!user) {
        // Utente non autenticato
        companyIdsRef.current = EMPTY_COMPANY_IDS;
        setState({
          user: null,
          uid: null,
          tenantId: null,
          role: null,
          companyIds: EMPTY_COMPANY_IDS,
          companyIdsKey: '',
          email: null,
          loading: false,
          error: null,
        });
        return;
      }

      try {
        // ✅ FIX: Forza refresh del token per ottenere claims aggiornate
        const tokenResult = await getIdTokenResult(user, true);
        const claims = tokenResult.claims;

        // ✅ Stabilizza companyIds: usa lo stesso array se i valori sono uguali
        const newCompanyIds = (claims.company_ids as string[]) || EMPTY_COMPANY_IDS;
        const newCompanyIdsKey = newCompanyIds.join(',');
        const oldCompanyIdsKey = companyIdsRef.current.join(',');
        
        // Aggiorna ref solo se i valori sono cambiati
        if (newCompanyIdsKey !== oldCompanyIdsKey) {
          companyIdsRef.current = newCompanyIds;
        }

        // Debug: logga le claims
        console.log('[useAuth] Claims loaded:', {
          tenant_id: claims.tenant_id,
          role: claims.role,
          company_ids: claims.company_ids,
        });

        if (!mounted) return;

        setState({
          user,
          uid: user.uid,
          tenantId: (claims.tenant_id as string) || null,
          role: (claims.role as UserRole) || null,
          companyIds: companyIdsRef.current, // ✅ Usa ref stabile
          companyIdsKey: newCompanyIdsKey,
          email: user.email || null,
          loading: false,
          error: null,
        });
      } catch (error) {
        console.error('[useAuth] Error getting user claims:', error);
        
        if (!mounted) return;

        companyIdsRef.current = EMPTY_COMPANY_IDS;
        setState({
          user,
          uid: user.uid,
          tenantId: null,
          role: null,
          companyIds: EMPTY_COMPANY_IDS,
          companyIdsKey: '',
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

