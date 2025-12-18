/**
 * Email Queue Helper
 * 
 * Scrive documenti nella collezione 'mail' per l'invio tramite Firebase Extension.
 * In modalità dry-run (MAIL_ENABLED=false), logga solo i messaggi senza scrivere.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const MAIL_ENABLED = (process.env.MAIL_ENABLED ?? 'false') === 'true';

export interface EmailOptions {
  to: string[];
  subject: string;
  html: string;
  text?: string;
}

/**
 * Accoda un'email per l'invio
 * @param to Array di indirizzi destinatari
 * @param subject Oggetto email
 * @param html Corpo HTML
 * @param text Corpo testo (opzionale, fallback)
 */
export async function queueEmail(
  to: string[],
  subject: string,
  html: string,
  text = ''
): Promise<void> {
  if (!MAIL_ENABLED) {
    console.log('[Email] DRY_RUN (MAIL_ENABLED=false)', {
      to,
      subject,
      html: html.substring(0, 100) + '...',
    });
    return;
  }

  const db = getFirestore();
  
  try {
    await db.collection('mail').add({
      to,
      message: {
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML se non fornito
      },
      createdAt: FieldValue.serverTimestamp(),
    });
    
    console.log('[Email] Queued successfully', { to, subject });
  } catch (error) {
    console.error('[Email] Failed to queue', { error, to, subject });
    throw error;
  }
}

/**
 * Ottiene gli indirizzi email dei verificatori per un'azienda
 * MVP: usa variabile d'ambiente, in futuro da Firestore
 * @param tid Tenant ID
 * @param cid Company ID
 * @returns Array di email
 */
export function getVerifierEmailsForCompany(tid: string, cid: string): string[] {
  // MVP: lista hardcoded da .env
  const emails = (process.env.VERIFIER_EMAILS ?? '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);
  
  if (emails.length === 0) {
    console.warn('[Email] No verifier emails configured (VERIFIER_EMAILS empty)');
  }
  
  return emails;
}

/**
 * Ottiene l'email del caricatore di un documento
 * @param documentData Dati del documento da Firestore
 * @returns Email o null
 */
export function getUploaderEmail(documentData: any): string | null {
  return documentData?.uploadedByEmail || documentData?.metadata?.uploadedByEmail || null;
}

