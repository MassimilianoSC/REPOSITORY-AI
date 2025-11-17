/**
 * Company Aggregate Status Calculator
 * 
 * Calcola lo stato aggregato di un'azienda basandosi sui documenti correnti.
 * 
 * Logica semaforo (da requisiti Ottavio):
 * - RED: almeno 1 documento mancante O almeno 1 non idoneo
 * - YELLOW: nessun rosso, ma almeno 1 in scadenza ≤10 giorni
 * - GREEN: tutti i required presenti e idonei, nessuno in scadenza
 * - NA: nessun documento richiesto (caso limite)
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

const EXPIRY_SOON_DAYS = parseInt(process.env.EXPIRY_SOON_DAYS ?? '10', 10);

export interface AggregateStatus {
  status: 'green' | 'yellow' | 'red' | 'na';
  totalRequired: number;
  totalOk: number;
  totalNotOk: number;
  totalExpiringSoon: number;
  nextExpiryAt: Timestamp | null;
  breakdown: Record<string, {
    status: string;
    isCurrent: boolean;
    expiresAt: Timestamp | null;
  }>;
  lastComputedAt: FirebaseFirestore.FieldValue;
}

/**
 * Ricalcola lo stato aggregato di un'azienda
 * @param tid Tenant ID
 * @param cid Company ID
 * @param requiredDocTypes Array di docType richiesti (da rulebook)
 * @returns Status calcolato ('green' | 'yellow' | 'red' | 'na')
 */
export async function recomputeCompanyAggregate(
  tid: string,
  cid: string,
  requiredDocTypes: string[]
): Promise<string> {
  const db = getFirestore();
  const now = Timestamp.now();
  const soonMs = EXPIRY_SOON_DAYS * 24 * 60 * 60 * 1000;

  console.log(`[Aggregate] Computing for tenant=${tid}, company=${cid}, required=${requiredDocTypes.length}`);

  // Leggi solo versioni correnti della company
  const snap = await db
    .collection(`tenants/${tid}/companies/${cid}/documents`)
    .where('isCurrent', '==', true)
    .get();

  let totalRequired = requiredDocTypes.length;
  let totalOk = 0;
  let totalNotOk = 0;
  let totalExpiringSoon = 0;
  let nextExpiryAt: Timestamp | null = null;

  const breakdown: Record<string, any> = {};

  // Mappa docType -> documento corrente
  const byType = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  snap.forEach(d => {
    const docType = d.get('docType');
    if (docType) {
      byType.set(docType, d);
    }
  });

  // Controlla ogni documento richiesto
  for (const dt of requiredDocTypes) {
    const d = byType.get(dt);
    
    if (!d) {
      // Documento mancante
      breakdown[dt] = { status: 'missing', isCurrent: false, expiresAt: null };
      totalNotOk++;
      continue;
    }

    const status = (d.get('status') ?? 'na') as string; // green|yellow|red|na
    const expiresAtRaw = d.get('expiresAt');
    
    // ⚠️ FIX: expiresAt può essere Timestamp o Date, convertiamo sempre a Timestamp
    let expiresAt: Timestamp | null = null;
    if (expiresAtRaw) {
      if (typeof (expiresAtRaw as any).toMillis === 'function') {
        expiresAt = expiresAtRaw as Timestamp;
      } else if (expiresAtRaw instanceof Date) {
        expiresAt = Timestamp.fromDate(expiresAtRaw);
      } else if (typeof expiresAtRaw === 'number') {
        expiresAt = Timestamp.fromMillis(expiresAtRaw);
      }
    }

    breakdown[dt] = { status, isCurrent: true, expiresAt: expiresAt ?? null };

    // Conta status
    if (status === 'green') {
      totalOk++;
    } else if (status === 'red') {
      totalNotOk++;
    }

    // Controlla scadenze
    if (expiresAt) {
      if (!nextExpiryAt || expiresAt.toMillis() < nextExpiryAt.toMillis()) {
        nextExpiryAt = expiresAt;
      }
      
      const msLeft = expiresAt.toMillis() - now.toMillis();
      if (msLeft <= soonMs && msLeft > 0 && status === 'green') {
        totalExpiringSoon++;
      }
    }
  }

  // Calcola status aggregato
  let aggregateStatus: 'green' | 'yellow' | 'red' | 'na' = 'na';
  
  if (totalRequired === 0) {
    aggregateStatus = 'na';
  } else if (totalNotOk > 0) {
    aggregateStatus = 'red'; // Almeno 1 mancante o non idoneo
  } else if (totalExpiringSoon > 0) {
    aggregateStatus = 'yellow'; // Nessun problema, ma qualcosa in scadenza
  } else if (totalOk === totalRequired) {
    aggregateStatus = 'green'; // Tutto OK
  } else {
    aggregateStatus = 'red'; // Default prudente
  }

  console.log(`[Aggregate] Result: ${aggregateStatus} (ok=${totalOk}, notOk=${totalNotOk}, expiring=${totalExpiringSoon})`);

  // Salva in Firestore
  await db.doc(`tenants/${tid}/companies/${cid}`).set({
    aggregateStatus: {
      status: aggregateStatus,
      totalRequired,
      totalOk,
      totalNotOk,
      totalExpiringSoon,
      nextExpiryAt: nextExpiryAt ?? null,
      breakdown,
      lastComputedAt: FieldValue.serverTimestamp(),
    }
  }, { merge: true });

  return aggregateStatus;
}

