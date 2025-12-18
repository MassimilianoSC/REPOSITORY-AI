/**
 * RBAC - Role-Based Access Control
 * Gestisce i permessi degli utenti per azioni specifiche
 * NOTA: Usa Custom Claims di Firebase Auth (auth.token.role)
 */

import { User } from 'firebase/auth';

export type UserRole = 'uploader' | 'verifier' | 'manager';

export interface UserClaims {
  role: UserRole;
  tenantId: string;
  companyIds: string[];
  email?: string;
  uid?: string;
}

/**
 * Ottiene i custom claims di un utente Firebase
 * @param user - Firebase User object (da auth.currentUser)
 * @returns Custom claims con role, tenantId, companyIds
 */
export async function getUserClaims(user: User | null): Promise<UserClaims | null> {
  if (!user) return null;
  
  try {
    // ✅ FIX: Forza refresh del token per ottenere claims aggiornate
    const idTokenResult = await user.getIdTokenResult(true);
    const claims = idTokenResult.claims;
    
    // Debug: logga le claims per troubleshooting
    console.log('[getUserClaims] Claims loaded:', {
      tenant_id: claims.tenant_id,
      role: claims.role,
      company_ids: claims.company_ids,
    });
    
    return {
      role: (claims.role as UserRole) || 'uploader',
      tenantId: (claims.tenant_id as string) || '',
      companyIds: (claims.company_ids as string[]) || [],
      email: user.email || undefined,
      uid: user.uid,
    };
  } catch (error) {
    console.error('Error getting user claims:', error);
    return null;
  }
}

/**
 * Ottiene il ruolo di un utente dai custom claims
 * @param user - Firebase User object
 * @returns UserRole (default: 'uploader')
 */
export async function getUserRole(user: User | null): Promise<UserRole> {
  const claims = await getUserClaims(user);
  return claims?.role || 'uploader';
}

/**
 * Verifica se un utente può applicare override "Non Pertinente"
 * Solo verifier e manager possono farlo
 */
export async function canApplyNonPertinente(user: User | null): Promise<boolean> {
  const role = await getUserRole(user);
  return role === 'verifier' || role === 'manager';
}

/**
 * Verifica se un utente può accedere alla coda verifica
 */
export async function canAccessVerifica(user: User | null): Promise<boolean> {
  const role = await getUserRole(user);
  return role === 'verifier' || role === 'manager';
}

/**
 * Verifica se un utente può modificare un documento
 */
export async function canEditDocument(user: User | null): Promise<boolean> {
  const role = await getUserRole(user);
  return role === 'verifier' || role === 'manager';
}

/**
 * Ottiene il display name del ruolo
 */
export function getRoleDisplayName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    uploader: 'Caricatore',
    verifier: 'Verificatore',
    manager: 'Manager',
  };
  return names[role];
}

