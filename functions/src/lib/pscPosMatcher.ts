/**
 * PSC/POS Cross-Document Matcher
 * 
 * Gestisce la logica di matching tra PSC (documento master) e POS (documento slave).
 * - Quando viene caricato un PSC: estrae e salva pscMaster nel cantiere
 * - Quando viene caricato un POS: recupera pscMaster e genera i boolean di match
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";

// ============================================================================
// TYPES
// ============================================================================

export interface CompanyInfo {
  name: string;
  piva?: string;
  cf?: string;
}

export interface PscMaster {
  siteName?: string;
  comune?: string;
  provincia?: string;
  indirizzo?: string;
  cantiereObject?: string;
  worksDescription?: string;
  committenteName?: string;
  companies?: {
    affidatarie?: CompanyInfo[];
    esecutrici?: CompanyInfo[];
    affidatariaEsecutrice?: CompanyInfo[];
    subappalto?: CompanyInfo[];
    nolo?: CompanyInfo[];
  };
  roles?: {
    rdlOrRlName?: string;
    dlName?: string;
    cspName?: string;
    cseName?: string;
  };
  savedAt?: any;
}

export interface PosFields {
  siteName?: string;
  comune?: string;
  provincia?: string;
  indirizzo?: string;
  cantiereObject?: string;
  worksDescription?: string;
  committenteName?: string;
  companies?: {
    affidatarie?: CompanyInfo[];
    esecutrici?: CompanyInfo[];
    subappalto?: CompanyInfo[];
    nolo?: CompanyInfo[];
  };
  roles?: {
    rdlOrRlName?: string;
    dlName?: string;
    cspName?: string;
    cseName?: string;
  };
  issuerCompanyName?: string;
  issuerCompanyPiva?: string;
}

export interface PosMatchResult {
  posSiteMatch: boolean;
  posLocationMatch: boolean;
  posObjectMatch: boolean;
  posWorksDescriptionConsistent: boolean;
  posCommittenteMatch: boolean;
  posAffidatariaMatchAny: boolean;
  posEsecutriceMatchAny: boolean;
  posSubappaltoMatchAny: boolean;
  posNoloHierarchyOk: boolean;
  posRolesMatch: boolean;
  pscMissing: boolean;
  matchDetails?: {
    mismatches: Array<{ field: string; psc: string; pos: string }>;
    notes: string[];
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalizza una stringa per il confronto
 */
function normalize(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // rimuove accenti
    .replace(/\s+/g, ' '); // normalizza spazi
}

/**
 * Confronta due stringhe con tolleranza
 */
function stringsMatch(a: string | undefined, b: string | undefined): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * Confronta due nomi di impresa (con match su P.IVA/CF se disponibili)
 */
function companiesMatch(a: CompanyInfo | undefined, b: CompanyInfo | undefined): boolean {
  if (!a || !b) return false;
  
  // Match esatto su P.IVA
  if (a.piva && b.piva && normalize(a.piva) === normalize(b.piva)) return true;
  
  // Match esatto su CF
  if (a.cf && b.cf && normalize(a.cf) === normalize(b.cf)) return true;
  
  // Match su nome (più fuzzy)
  if (a.name && b.name && stringsMatch(a.name, b.name)) return true;
  
  return false;
}

/**
 * Verifica se almeno un'impresa nella lista POS matcha con almeno una nella lista PSC
 */
function anyCompanyMatches(
  posCompanies: CompanyInfo[] | undefined,
  pscCompanies: CompanyInfo[] | undefined,
  issuerCompany?: CompanyInfo
): boolean {
  const posWithIssuer = [...(posCompanies || [])];
  
  // Aggiungi issuer come fallback se la lista è vuota
  if (posWithIssuer.length === 0 && issuerCompany?.name) {
    posWithIssuer.push(issuerCompany);
  }
  
  if (posWithIssuer.length === 0 || !pscCompanies || pscCompanies.length === 0) {
    return true; // Se una delle due liste è vuota, consideriamo match (non verificabile)
  }
  
  return posWithIssuer.some(posC => 
    pscCompanies.some(pscC => companiesMatch(posC, pscC))
  );
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Salva pscMaster nel cantiere dopo la validazione di un PSC
 */
export async function savePscMasterToCantiere(
  tenantId: string,
  companyId: string,
  cantiereId: string,
  pscMaster: PscMaster
): Promise<void> {
  const db = getFirestore();
  
  try {
    const cantiereRef = db.doc(`tenants/${tenantId}/companies/${companyId}/cantieri/${cantiereId}`);
    
    await cantiereRef.update({
      pscMaster: {
        ...pscMaster,
        savedAt: FieldValue.serverTimestamp(),
      },
      pscMasterUpdatedAt: FieldValue.serverTimestamp(),
    });
    
    console.log(`[PSC] Saved pscMaster to cantiere ${cantiereId}`);
  } catch (err: any) {
    console.error(`[PSC] Error saving pscMaster to cantiere:`, err.message);
    throw err;
  }
}

/**
 * Recupera pscMaster dal cantiere
 */
export async function getPscMasterFromCantiere(
  tenantId: string,
  companyId: string,
  cantiereId: string
): Promise<PscMaster | null> {
  const db = getFirestore();
  
  try {
    const cantiereRef = db.doc(`tenants/${tenantId}/companies/${companyId}/cantieri/${cantiereId}`);
    const cantiereSnap = await cantiereRef.get();
    
    if (!cantiereSnap.exists) {
      console.log(`[PSC] Cantiere ${cantiereId} not found`);
      return null;
    }
    
    const data = cantiereSnap.data();
    const pscMaster = data?.pscMaster as PscMaster | undefined;
    
    if (!pscMaster) {
      console.log(`[PSC] No pscMaster found in cantiere ${cantiereId}`);
      return null;
    }
    
    console.log(`[PSC] Retrieved pscMaster from cantiere ${cantiereId}`);
    return pscMaster;
  } catch (err: any) {
    console.error(`[PSC] Error retrieving pscMaster:`, err.message);
    return null;
  }
}

/**
 * Recupera i dati dell'impresa (issuer) per il POS
 */
export async function getIssuerCompany(
  tenantId: string,
  companyId: string
): Promise<CompanyInfo | null> {
  const db = getFirestore();
  
  try {
    const companyRef = db.doc(`tenants/${tenantId}/companies/${companyId}`);
    const companySnap = await companyRef.get();
    
    if (!companySnap.exists) {
      return null;
    }
    
    const data = companySnap.data();
    return {
      name: data?.name || data?.ragioneSociale || '',
      piva: data?.piva || data?.partitaIva || '',
      cf: data?.cf || data?.codiceFiscale || '',
    };
  } catch (err: any) {
    console.error(`[PSC] Error getting issuer company:`, err.message);
    return null;
  }
}

/**
 * Esegue il matching tra POS e PSC
 */
export function matchPosWithPsc(
  posFields: PosFields,
  pscMaster: PscMaster | null,
  issuerCompany?: CompanyInfo | null
): PosMatchResult {
  // Se PSC manca, tutti i match sono true (non verificabile) ma pscMissing = true
  if (!pscMaster) {
    return {
      posSiteMatch: true,
      posLocationMatch: true,
      posObjectMatch: true,
      posWorksDescriptionConsistent: true,
      posCommittenteMatch: true,
      posAffidatariaMatchAny: true,
      posEsecutriceMatchAny: true,
      posSubappaltoMatchAny: true,
      posNoloHierarchyOk: true,
      posRolesMatch: true,
      pscMissing: true,
      matchDetails: {
        mismatches: [],
        notes: ['PSC non disponibile - match non verificabile'],
      },
    };
  }
  
  const mismatches: Array<{ field: string; psc: string; pos: string }> = [];
  const notes: string[] = [];
  
  const issuer: CompanyInfo | undefined = issuerCompany ? {
    name: issuerCompany.name || posFields.issuerCompanyName || '',
    piva: issuerCompany.piva || posFields.issuerCompanyPiva || '',
    cf: issuerCompany.cf || '',
  } : posFields.issuerCompanyName ? {
    name: posFields.issuerCompanyName,
    piva: posFields.issuerCompanyPiva || '',
  } : undefined;
  
  // Match sito
  const posSiteMatch = stringsMatch(posFields.siteName, pscMaster.siteName);
  if (!posSiteMatch && posFields.siteName && pscMaster.siteName) {
    mismatches.push({ field: 'siteName', psc: pscMaster.siteName, pos: posFields.siteName });
  }
  
  // Match location (comune/provincia/indirizzo)
  const comuneMatch = stringsMatch(posFields.comune, pscMaster.comune);
  const provinciaMatch = stringsMatch(posFields.provincia, pscMaster.provincia);
  const indirizzoMatch = stringsMatch(posFields.indirizzo, pscMaster.indirizzo);
  const posLocationMatch = comuneMatch && provinciaMatch && indirizzoMatch;
  if (!posLocationMatch) {
    if (!comuneMatch && posFields.comune && pscMaster.comune) {
      mismatches.push({ field: 'comune', psc: pscMaster.comune, pos: posFields.comune });
    }
    if (!provinciaMatch && posFields.provincia && pscMaster.provincia) {
      mismatches.push({ field: 'provincia', psc: pscMaster.provincia, pos: posFields.provincia });
    }
    if (!indirizzoMatch && posFields.indirizzo && pscMaster.indirizzo) {
      mismatches.push({ field: 'indirizzo', psc: pscMaster.indirizzo, pos: posFields.indirizzo });
    }
  }
  
  // Match oggetto cantiere
  const posObjectMatch = stringsMatch(posFields.cantiereObject, pscMaster.cantiereObject);
  if (!posObjectMatch && posFields.cantiereObject && pscMaster.cantiereObject) {
    mismatches.push({ field: 'cantiereObject', psc: pscMaster.cantiereObject, pos: posFields.cantiereObject });
  }
  
  // Match descrizione lavori (match parziale ammesso)
  const posWorksDescriptionConsistent = !posFields.worksDescription || 
    !pscMaster.worksDescription || 
    stringsMatch(posFields.worksDescription, pscMaster.worksDescription);
  
  // Match committente
  const posCommittenteMatch = stringsMatch(posFields.committenteName, pscMaster.committenteName);
  if (!posCommittenteMatch && posFields.committenteName && pscMaster.committenteName) {
    mismatches.push({ field: 'committenteName', psc: pscMaster.committenteName, pos: posFields.committenteName });
  }
  
  // Match imprese affidatarie (almeno una deve corrispondere)
  const pscAffidatarie = [
    ...(pscMaster.companies?.affidatarie || []),
    ...(pscMaster.companies?.affidatariaEsecutrice || []),
  ];
  const posAffidatariaMatchAny = anyCompanyMatches(
    posFields.companies?.affidatarie,
    pscAffidatarie,
    issuer
  );
  
  // Match imprese esecutrici (almeno una deve corrispondere)
  const pscEsecutrici = [
    ...(pscMaster.companies?.esecutrici || []),
    ...(pscMaster.companies?.affidatariaEsecutrice || []),
  ];
  const posEsecutriceMatchAny = anyCompanyMatches(
    posFields.companies?.esecutrici,
    pscEsecutrici,
    issuer
  );
  
  // Match subappalto (se PSC non ha lista subappalto, match contro esecutrici)
  const pscSubappalto = pscMaster.companies?.subappalto?.length 
    ? pscMaster.companies.subappalto 
    : pscEsecutrici;
  const posSubappaltoMatchAny = anyCompanyMatches(
    posFields.companies?.subappalto,
    pscSubappalto,
    issuer
  );
  
  // Nolo hierarchy: se nolo presente, deve esistere almeno una affidataria e una esecutrice
  const hasNolo = posFields.companies?.nolo && posFields.companies.nolo.length > 0;
  const posNoloHierarchyOk = !hasNolo || (posAffidatariaMatchAny && posEsecutriceMatchAny);
  if (hasNolo && !posNoloHierarchyOk) {
    notes.push('Nolo presente ma manca corrispondenza con affidataria o esecutrice');
  }
  
  // Match ruoli (RDL/RL, DL, CSP, CSE)
  const rdlMatch = stringsMatch(posFields.roles?.rdlOrRlName, pscMaster.roles?.rdlOrRlName);
  const dlMatch = stringsMatch(posFields.roles?.dlName, pscMaster.roles?.dlName);
  const cspMatch = stringsMatch(posFields.roles?.cspName, pscMaster.roles?.cspName);
  const cseMatch = stringsMatch(posFields.roles?.cseName, pscMaster.roles?.cseName);
  const posRolesMatch = rdlMatch && dlMatch && cspMatch && cseMatch;
  if (!posRolesMatch) {
    if (!rdlMatch && posFields.roles?.rdlOrRlName && pscMaster.roles?.rdlOrRlName) {
      mismatches.push({ field: 'rdlOrRlName', psc: pscMaster.roles.rdlOrRlName, pos: posFields.roles.rdlOrRlName });
    }
    if (!dlMatch && posFields.roles?.dlName && pscMaster.roles?.dlName) {
      mismatches.push({ field: 'dlName', psc: pscMaster.roles.dlName, pos: posFields.roles.dlName });
    }
  }
  
  return {
    posSiteMatch,
    posLocationMatch,
    posObjectMatch,
    posWorksDescriptionConsistent,
    posCommittenteMatch,
    posAffidatariaMatchAny,
    posEsecutriceMatchAny,
    posSubappaltoMatchAny,
    posNoloHierarchyOk,
    posRolesMatch,
    pscMissing: false,
    matchDetails: {
      mismatches,
      notes,
    },
  };
}

/**
 * Salva i risultati del match POS↔PSC nel documento POS
 */
export async function savePosMatchResults(
  tenantId: string,
  companyId: string,
  docId: string,
  matchResult: PosMatchResult
): Promise<void> {
  const db = getFirestore();
  
  try {
    const docRef = db.doc(`tenants/${tenantId}/companies/${companyId}/documents/${docId}`);
    
    await docRef.update({
      // Boolean fields (top-level per regole deterministiche)
      posSiteMatch: matchResult.posSiteMatch,
      posLocationMatch: matchResult.posLocationMatch,
      posObjectMatch: matchResult.posObjectMatch,
      posWorksDescriptionConsistent: matchResult.posWorksDescriptionConsistent,
      posCommittenteMatch: matchResult.posCommittenteMatch,
      posAffidatariaMatchAny: matchResult.posAffidatariaMatchAny,
      posEsecutriceMatchAny: matchResult.posEsecutriceMatchAny,
      posSubappaltoMatchAny: matchResult.posSubappaltoMatchAny,
      posNoloHierarchyOk: matchResult.posNoloHierarchyOk,
      posRolesMatch: matchResult.posRolesMatch,
      // Meta
      pscMissing: matchResult.pscMissing,
      posMatchDetails: matchResult.matchDetails,
      posMatchCheckedAt: FieldValue.serverTimestamp(),
    });
    
    console.log(`[PSC/POS] Saved match results for doc ${docId}`);
  } catch (err: any) {
    console.error(`[PSC/POS] Error saving match results:`, err.message);
    throw err;
  }
}
