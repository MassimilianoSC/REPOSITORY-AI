/**
 * Cross-Document Matching
 * 
 * Verifica la coerenza tra documenti correlati:
 * - Per documenti personale: confronta holder/CF con anagrafica dipendente
 * - Per documenti mezzi: confronta targa con anagrafica mezzo
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";

export interface CrossMatchResult {
  hasWarnings: boolean;
  warnings: Array<{
    type: string;
    field: string;
    expected: string;
    found: string;
    message: string;
  }>;
}

/**
 * Normalizza una stringa per il confronto (uppercase, trim, rimuovi accenti)
 */
function normalizeString(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // rimuove accenti
    .replace(/\s+/g, ' '); // normalizza spazi multipli
}

/**
 * Confronta due nomi con tolleranza per ordine e varianti
 */
function namesMatch(name1: string, name2: string): boolean {
  const n1 = normalizeString(name1);
  const n2 = normalizeString(name2);
  
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;
  
  // Prova a confrontare invertendo l'ordine (nome cognome vs cognome nome)
  const parts1 = n1.split(' ').filter(p => p.length > 0);
  const parts2 = n2.split(' ').filter(p => p.length > 0);
  
  // Se uno dei due contiene tutte le parti dell'altro
  const allParts1InParts2 = parts1.every(p => parts2.includes(p));
  const allParts2InParts1 = parts2.every(p => parts1.includes(p));
  
  return allParts1InParts2 || allParts2InParts1;
}

/**
 * Confronta due codici fiscali
 */
function cfMatch(cf1: string, cf2: string): boolean {
  const c1 = normalizeString(cf1);
  const c2 = normalizeString(cf2);
  
  if (!c1 || !c2) return true; // Se uno manca, non possiamo confrontare
  
  return c1 === c2;
}

/**
 * Confronta due targhe
 */
function plateMatch(plate1: string, plate2: string): boolean {
  const p1 = normalizeString(plate1).replace(/[^A-Z0-9]/g, '');
  const p2 = normalizeString(plate2).replace(/[^A-Z0-9]/g, '');
  
  if (!p1 || !p2) return true; // Se una manca, non possiamo confrontare
  
  return p1 === p2;
}

/**
 * Verifica la coerenza di un documento personale con l'anagrafica
 */
export async function matchPersonaleDocument(
  tenantId: string,
  companyId: string,
  personaleId: string,
  extractedData: {
    holder?: string;
    identifiers?: {
      cf?: string;
      piva?: string;
    };
  }
): Promise<CrossMatchResult> {
  const db = getFirestore();
  const warnings: CrossMatchResult['warnings'] = [];

  try {
    // Carica anagrafica dipendente
    const personaleRef = db.doc(`tenants/${tenantId}/companies/${companyId}/personale/${personaleId}`);
    const personaleSnap = await personaleRef.get();
    
    if (!personaleSnap.exists) {
      console.log(`[CrossMatch] Personale ${personaleId} not found`);
      return { hasWarnings: false, warnings: [] };
    }

    const personaleData = personaleSnap.data() as any;
    const expectedName = `${personaleData.nome || ''} ${personaleData.cognome || ''}`.trim();
    const expectedCF = personaleData.codiceFiscale || personaleData.cf || '';

    // Confronta nome
    if (extractedData.holder && expectedName) {
      if (!namesMatch(extractedData.holder, expectedName)) {
        warnings.push({
          type: 'name_mismatch',
          field: 'holder',
          expected: expectedName,
          found: extractedData.holder,
          message: `Nome nel documento (${extractedData.holder}) diverso da anagrafica (${expectedName})`,
        });
        console.log(`[CrossMatch] ⚠️ Name mismatch: doc="${extractedData.holder}" vs anagrafica="${expectedName}"`);
      }
    }

    // Confronta codice fiscale
    if (extractedData.identifiers?.cf && expectedCF) {
      if (!cfMatch(extractedData.identifiers.cf, expectedCF)) {
        warnings.push({
          type: 'cf_mismatch',
          field: 'identifiers.cf',
          expected: expectedCF,
          found: extractedData.identifiers.cf,
          message: `Codice Fiscale nel documento (${extractedData.identifiers.cf}) diverso da anagrafica (${expectedCF})`,
        });
        console.log(`[CrossMatch] ⚠️ CF mismatch: doc="${extractedData.identifiers.cf}" vs anagrafica="${expectedCF}"`);
      }
    }

  } catch (err: any) {
    console.error(`[CrossMatch] Error matching personale: ${err.message}`);
  }

  return {
    hasWarnings: warnings.length > 0,
    warnings,
  };
}

/**
 * Verifica la coerenza di un documento mezzo con l'anagrafica
 */
export async function matchMezzoDocument(
  tenantId: string,
  companyId: string,
  mezzoId: string,
  extractedData: {
    targa?: string;
    plate?: string;
    vehiclePlate?: string;
  }
): Promise<CrossMatchResult> {
  const db = getFirestore();
  const warnings: CrossMatchResult['warnings'] = [];

  try {
    // Carica anagrafica mezzo
    const mezzoRef = db.doc(`tenants/${tenantId}/companies/${companyId}/mezzi/${mezzoId}`);
    const mezzoSnap = await mezzoRef.get();
    
    if (!mezzoSnap.exists) {
      console.log(`[CrossMatch] Mezzo ${mezzoId} not found`);
      return { hasWarnings: false, warnings: [] };
    }

    const mezzoData = mezzoSnap.data() as any;
    const expectedPlate = mezzoData.targa || '';

    // Trova la targa estratta dal documento
    const extractedPlate = extractedData.targa || extractedData.plate || extractedData.vehiclePlate || '';

    // Confronta targa
    if (extractedPlate && expectedPlate) {
      if (!plateMatch(extractedPlate, expectedPlate)) {
        warnings.push({
          type: 'plate_mismatch',
          field: 'targa',
          expected: expectedPlate,
          found: extractedPlate,
          message: `Targa nel documento (${extractedPlate}) diversa da anagrafica (${expectedPlate})`,
        });
        console.log(`[CrossMatch] ⚠️ Plate mismatch: doc="${extractedPlate}" vs anagrafica="${expectedPlate}"`);
      }
    }

  } catch (err: any) {
    console.error(`[CrossMatch] Error matching mezzo: ${err.message}`);
  }

  return {
    hasWarnings: warnings.length > 0,
    warnings,
  };
}

/**
 * Esegue il cross-document matching e aggiorna il documento con eventuali warning
 */
export async function performCrossDocumentMatching(
  tenantId: string,
  companyId: string,
  docId: string,
  docCategory: string | null,
  personaleId: string | null,
  mezzoId: string | null,
  extractedData: {
    holder?: string;
    identifiers?: {
      cf?: string;
      piva?: string;
    };
    targa?: string;
    plate?: string;
    vehiclePlate?: string;
  }
): Promise<CrossMatchResult> {
  const db = getFirestore();
  let result: CrossMatchResult = { hasWarnings: false, warnings: [] };

  try {
    // Cross-match per documenti personale
    if (docCategory === 'personale' && personaleId) {
      result = await matchPersonaleDocument(tenantId, companyId, personaleId, extractedData);
    }

    // Cross-match per documenti mezzi
    if (docCategory === 'mezzi' && mezzoId) {
      result = await matchMezzoDocument(tenantId, companyId, mezzoId, extractedData);
    }

    // Salva eventuali warning nel documento
    if (result.hasWarnings) {
      const docRef = db.doc(`tenants/${tenantId}/companies/${companyId}/documents/${docId}`);
      await docRef.update({
        crossMatchWarnings: result.warnings,
        crossMatchCheckedAt: FieldValue.serverTimestamp(),
      });
      console.log(`[CrossMatch] Saved ${result.warnings.length} warnings for doc ${docId}`);
    }

  } catch (err: any) {
    console.error(`[CrossMatch] Error performing cross-match: ${err.message}`);
  }

  return result;
}
