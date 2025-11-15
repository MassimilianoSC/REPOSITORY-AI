/**
 * RBAC - Role-Based Access Control
 * Gestisce i permessi degli utenti per azioni specifiche
 */

export type UserRole = 'uploader' | 'verifier' | 'manager';

export interface UserClaims {
  role: UserRole;
  tenantId: string;
  companyIds: string[];
  email?: string;
  uid?: string;
}

/**
 * Whitelist temporanea per MVP (sarà sostituita da Custom Claims)
 * Lunedì aggiorneremo con email reali del committente
 */
const ROLE_WHITELIST: Record<string, UserRole> = {
  // Email di test (weekend MVP)
  'm.scardovellicrac@gmail.com': 'manager',
  
  // Placeholder per committente (da aggiornare lunedì)
  'ottavio@committente.it': 'manager',
  'pisanu@committente.it': 'verifier',
  'verificatore@committente.it': 'verifier',
};

/**
 * Ottiene il ruolo di un utente dalla whitelist
 * In produzione, questo verrà sostituito da Custom Claims Firebase Auth
 */
export function getUserRole(email: string | null | undefined): UserRole {
  if (!email) return 'uploader';
  
  const role = ROLE_WHITELIST[email.toLowerCase()];
  return role || 'uploader';
}

/**
 * Verifica se un utente può applicare override "Non Pertinente"
 * Solo verifier e manager possono farlo
 */
export function canApplyNonPertinente(email: string | null | undefined): boolean {
  const role = getUserRole(email);
  return role === 'verifier' || role === 'manager';
}

/**
 * Verifica se un utente può accedere alla coda verifica
 */
export function canAccessVerifica(email: string | null | undefined): boolean {
  const role = getUserRole(email);
  return role === 'verifier' || role === 'manager';
}

/**
 * Verifica se un utente può modificare un documento
 */
export function canEditDocument(email: string | null | undefined): boolean {
  const role = getUserRole(email);
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

