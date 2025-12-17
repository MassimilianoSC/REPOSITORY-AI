/**
 * Definizione tipi documento per la gestione documentale
 * 
 * Struttura:
 * - ITP: Documenti Idoneità Tecnico-Professionale (obbligatori per ogni impresa)
 * - CANTIERE: Documenti specifici per cantiere (PSC, Accettazione, POS)
 * - PERSONALE: Documenti del personale (da definire)
 */

// ============================================
// DOCUMENTAZIONE ITP (Idoneità Tecnico-Professionale)
// Obbligatori per ogni impresa
// ============================================

export interface ITPDocumentType {
  key: string;
  label: string;
  shortLabel: string;
  description?: string;
  required: boolean;
  normativeRef?: string;
}

export const ITP_DOCUMENT_TYPES: ITPDocumentType[] = [
  {
    key: 'patente-crediti',
    label: 'Patente a crediti',
    shortLabel: 'Patente Crediti',
    description: 'Patente a punti per la sicurezza sul lavoro',
    required: true,
    normativeRef: 'D.L. 19/2024',
  },
  {
    key: 'attestati-soa',
    label: 'Attestati SOA',
    shortLabel: 'SOA',
    description: 'Attestazione di qualificazione per eseguire lavori pubblici',
    required: true,
    normativeRef: 'D.Lgs. 36/2023',
  },
  {
    key: 'dvr',
    label: 'Documento di Valutazione dei Rischi (DVR)',
    shortLabel: 'DVR',
    description: 'Valutazione di tutti i rischi per la sicurezza e la salute',
    required: true,
    normativeRef: 'D.Lgs. 81/2008 art. 28',
  },
  {
    key: 'ccia',
    label: 'Visura Camerale CCIA',
    shortLabel: 'CCIA',
    description: 'Certificato Camera di Commercio',
    required: true,
    normativeRef: 'D.P.R. 581/1995',
  },
  {
    key: 'durc',
    label: 'DURC - Documento Unico Regolarità Contributiva',
    shortLabel: 'DURC',
    description: 'Attestazione regolarità contributiva INPS/INAIL',
    required: true,
    normativeRef: 'D.Lgs. 50/2016 art. 80',
  },
  {
    key: 'doma',
    label: 'DOMA - Denuncia Opere in Manutenzione Amianto',
    shortLabel: 'DOMA',
    description: 'Denuncia per lavori con presenza di amianto',
    required: true,
    normativeRef: 'D.Lgs. 81/2008',
  },
  {
    key: 'autocert-itp-art26',
    label: 'Autocertificazione Idoneità Tecnico-Professionale (art. 26)',
    shortLabel: 'Autocert. ITP',
    description: 'Dichiarazione requisiti tecnico-professionali',
    required: true,
    normativeRef: 'D.Lgs. 81/2008 art. 26',
  },
  {
    key: 'antimafia-art14',
    label: 'Dichiarazione procedimenti interdittivi antimafia (art. 14)',
    shortLabel: 'Antimafia',
    description: 'Dichiarazione assenza procedimenti antimafia',
    required: true,
    normativeRef: 'D.Lgs. 81/2008 art. 14',
  },
  {
    key: 'nomina-medico',
    label: 'Nomina Medico Competente',
    shortLabel: 'Medico Comp.',
    description: 'Nomina del medico competente aziendale',
    required: true,
    normativeRef: 'D.Lgs. 81/2008 art. 18',
  },
  {
    key: 'nomina-rspp',
    label: 'Nomina RSPP',
    shortLabel: 'RSPP',
    description: 'Nomina Responsabile Servizio Prevenzione e Protezione',
    required: true,
    normativeRef: 'D.Lgs. 81/2008 art. 17',
  },
  {
    key: 'nomina-rls',
    label: 'Nomina RLS',
    shortLabel: 'RLS',
    description: 'Nomina Rappresentante Lavoratori per la Sicurezza',
    required: true,
    normativeRef: 'D.Lgs. 81/2008 art. 47',
  },
  {
    key: 'nomine-preposti',
    label: 'Nomine Preposti',
    shortLabel: 'Preposti',
    description: 'Nomina dei preposti alla sicurezza',
    required: true,
    normativeRef: 'D.Lgs. 81/2008 art. 19',
  },
  {
    key: 'nomine-primo-soccorso',
    label: 'Nomine Primo Soccorso',
    shortLabel: 'Primo Socc.',
    description: 'Nomina addetti primo soccorso',
    required: true,
    normativeRef: 'D.Lgs. 81/2008 art. 45',
  },
  {
    key: 'nomine-emergenze',
    label: 'Nomine Gestione Emergenze e Antincendio',
    shortLabel: 'Emergenze',
    description: 'Nomina addetti emergenze e antincendio',
    required: true,
    normativeRef: 'D.Lgs. 81/2008 art. 46',
  },
];

// ============================================
// DOCUMENTAZIONE CANTIERE
// Documenti per ogni cantiere specifico
// ============================================

export interface CantiereDocumentType {
  key: string;
  label: string;
  shortLabel: string;
  description?: string;
  uploadedBy: 'hq' | 'impresa';
  required: boolean;
}

export const CANTIERE_DOCUMENT_TYPES: CantiereDocumentType[] = [
  {
    key: 'psc',
    label: 'PSC - Piano di Sicurezza e Coordinamento',
    shortLabel: 'PSC',
    description: 'Redatto dal Coordinatore per la Sicurezza in fase di Progettazione',
    uploadedBy: 'hq',
    required: true,
  },
  {
    key: 'accettazione-psc',
    label: 'Accettazione PSC',
    shortLabel: 'Accett. PSC',
    description: 'Dichiarazione di accettazione del PSC da parte dell\'impresa',
    uploadedBy: 'impresa',
    required: true,
  },
  {
    key: 'pos',
    label: 'POS - Piano Operativo di Sicurezza',
    shortLabel: 'POS',
    description: 'Documento con le misure di sicurezza specifiche dell\'impresa',
    uploadedBy: 'impresa',
    required: true,
  },
];

// ============================================
// DOCUMENTAZIONE PERSONALE
// Documenti per ogni dipendente
// ============================================

export interface PersonaleDocumentType {
  key: string;
  label: string;
  shortLabel: string;
  description?: string;
  required: boolean;
  normativeRef?: string;
  category?: 'amministrativo' | 'formazione' | 'nomina' | 'altro';
}

export const PERSONALE_DOCUMENT_TYPES: PersonaleDocumentType[] = [
  // === DOCUMENTI AMMINISTRATIVI ===
  {
    key: 'unilav',
    label: 'UniLav',
    shortLabel: 'UniLav',
    description: 'Comunicazione obbligatoria di assunzione',
    required: true,
    normativeRef: 'D.Lgs. 297/2002',
    category: 'amministrativo',
  },
  {
    key: 'lettera-distacco',
    label: 'Lettera di distacco',
    shortLabel: 'Distacco',
    description: 'Lettera di distacco del lavoratore',
    required: false,
    normativeRef: 'D.Lgs. 276/2003 art. 30',
    category: 'amministrativo',
  },
  {
    key: 'idoneita-sanitaria',
    label: 'Idoneità Sanitaria',
    shortLabel: 'Idoneità San.',
    description: 'Certificato di idoneità alla mansione specifica',
    required: true,
    normativeRef: 'D.Lgs. 81/2008 art. 41',
    category: 'amministrativo',
  },
  {
    key: 'verbale-consegna-dpi',
    label: 'Verbale consegna dei DPI',
    shortLabel: 'Consegna DPI',
    description: 'Verbale di consegna dispositivi di protezione individuale',
    required: true,
    normativeRef: 'D.Lgs. 81/2008 art. 77',
    category: 'amministrativo',
  },

  // === NOMINE ===
  {
    key: 'nomina-preposto',
    label: 'Nomina Preposto',
    shortLabel: 'Nom. Preposto',
    description: 'Nomina formale come preposto alla sicurezza',
    required: false,
    normativeRef: 'D.Lgs. 81/2008 art. 19',
    category: 'nomina',
  },
  {
    key: 'nomina-primo-soccorso',
    label: 'Nomina Primo Soccorso',
    shortLabel: 'Nom. P. Soccorso',
    description: 'Nomina come addetto al primo soccorso',
    required: false,
    normativeRef: 'D.Lgs. 81/2008 art. 45',
    category: 'nomina',
  },
  {
    key: 'nomina-emergenze-antincendio',
    label: 'Nomina Emergenze e Antincendio',
    shortLabel: 'Nom. Antincendio',
    description: 'Nomina come addetto emergenze e antincendio',
    required: false,
    normativeRef: 'D.Lgs. 81/2008 art. 46',
    category: 'nomina',
  },
  {
    key: 'nomina-pes-pav',
    label: 'Nomina PES PAV',
    shortLabel: 'Nom. PES/PAV',
    description: 'Nomina Persona Esperta/Avvertita lavori elettrici',
    required: false,
    normativeRef: 'CEI 11-27',
    category: 'nomina',
  },

  // === FORMAZIONE BASE ===
  {
    key: 'formazione-base-art37',
    label: 'Formazione Base art. 37',
    shortLabel: 'Form. Base',
    description: 'Formazione generale e specifica lavoratori',
    required: true,
    normativeRef: 'D.Lgs. 81/2008 art. 37',
    category: 'formazione',
  },
  {
    key: 'formazione-alto-rischio',
    label: 'Formazione Alto Rischio',
    shortLabel: 'Form. Alto Rischio',
    description: 'Formazione specifica per attività ad alto rischio (16h)',
    required: false,
    normativeRef: 'Accordo Stato-Regioni 21/12/2011',
    category: 'formazione',
  },
  {
    key: 'formazione-preposto',
    label: 'Formazione Preposto',
    shortLabel: 'Form. Preposto',
    description: 'Formazione particolare aggiuntiva per preposti (8-12h)',
    required: false,
    normativeRef: 'D.Lgs. 81/2008 art. 37 c.7',
    category: 'formazione',
  },

  // === FORMAZIONE SPECIFICA ===
  {
    key: 'formazione-lavori-quota-dpi3',
    label: 'Formazione Lavori in Quota e DPI III categoria',
    shortLabel: 'Form. Quota/DPI3',
    description: 'Formazione per lavori in quota e uso DPI anticaduta',
    required: false,
    normativeRef: 'D.Lgs. 81/2008 art. 77',
    category: 'formazione',
  },
  {
    key: 'formazione-primo-soccorso',
    label: 'Formazione Primo Soccorso',
    shortLabel: 'Form. P. Soccorso',
    description: 'Formazione addetti primo soccorso (12-16h)',
    required: false,
    normativeRef: 'DM 388/2003',
    category: 'formazione',
  },
  {
    key: 'formazione-soccorso-quota',
    label: 'Formazione Soccorso in quota',
    shortLabel: 'Form. Socc. Quota',
    description: 'Formazione per soccorso e recupero in quota',
    required: false,
    normativeRef: 'D.Lgs. 81/2008',
    category: 'formazione',
  },
  {
    key: 'formazione-antincendio',
    label: 'Formazione addetto Antincendio',
    shortLabel: 'Form. Antincendio',
    description: 'Formazione addetti antincendio (4-16h)',
    required: false,
    normativeRef: 'DM 02/09/2021',
    category: 'formazione',
  },
  {
    key: 'formazione-lavori-elettrici',
    label: 'Formazione Lavori Elettrici o PES PAV PEI',
    shortLabel: 'Form. Elettrici',
    description: 'Formazione per lavori su impianti elettrici',
    required: false,
    normativeRef: 'CEI 11-27',
    category: 'formazione',
  },
  {
    key: 'formazione-campi-elettromagnetici',
    label: 'Formazione Esposizione Campi Elettromagnetici',
    shortLabel: 'Form. CEM',
    description: 'Formazione rischio campi elettromagnetici',
    required: false,
    normativeRef: 'D.Lgs. 81/2008 Titolo VIII',
    category: 'formazione',
  },
  {
    key: 'formazione-alpinista',
    label: 'Formazione da Alpinista',
    shortLabel: 'Form. Alpinista',
    description: 'Formazione per lavori con tecniche alpinistiche',
    required: false,
    normativeRef: 'D.Lgs. 81/2008 art. 116',
    category: 'formazione',
  },

  // === FORMAZIONE ATTREZZATURE ===
  {
    key: 'formazione-ple',
    label: 'Formazione conduzione PLE',
    shortLabel: 'Form. PLE',
    description: 'Formazione piattaforme di lavoro elevabili',
    required: false,
    normativeRef: 'Accordo Stato-Regioni 22/02/2012',
    category: 'formazione',
  },
  {
    key: 'formazione-autogru',
    label: 'Formazione conduzione AUTOGRU',
    shortLabel: 'Form. Autogru',
    description: 'Formazione gru su autocarro',
    required: false,
    normativeRef: 'Accordo Stato-Regioni 22/02/2012',
    category: 'formazione',
  },
  {
    key: 'formazione-movimento-terre',
    label: 'Formazione conduzione macchine per movimento terre',
    shortLabel: 'Form. Mov. Terre',
    description: 'Formazione escavatori, pale, terne, ecc.',
    required: false,
    normativeRef: 'Accordo Stato-Regioni 22/02/2012',
    category: 'formazione',
  },
  {
    key: 'formazione-ambiente-confinato',
    label: 'Formazione lavori in ambiente confinato',
    shortLabel: 'Form. Amb. Confinato',
    description: 'Formazione per spazi confinati o sospetti inquinamento',
    required: false,
    normativeRef: 'DPR 177/2011',
    category: 'formazione',
  },
  {
    key: 'formazione-segnaletica-stradale',
    label: 'Formazione per apposizione segnaletica stradale',
    shortLabel: 'Form. Segnaletica',
    description: 'Formazione per installazione segnaletica stradale',
    required: false,
    normativeRef: 'DM 22/01/2019',
    category: 'formazione',
  },

  // === ALTRO ===
  {
    key: 'da-controllare',
    label: 'Da controllare',
    shortLabel: 'Da controllare',
    description: 'Documento da verificare/classificare',
    required: false,
    category: 'altro',
  },
  {
    key: 'altri',
    label: 'Altri',
    shortLabel: 'Altri',
    description: 'Altri documenti del personale',
    required: false,
    category: 'altro',
  },
];

// ============================================
// CATEGORIE DOCUMENTO
// ============================================

export type DocumentCategory = 'itp' | 'personale' | 'cantiere';

export const DOCUMENT_CATEGORIES: { key: DocumentCategory; label: string; description: string }[] = [
  {
    key: 'itp',
    label: 'Documentazione ITP',
    description: 'Documenti Idoneità Tecnico-Professionale dell\'impresa',
  },
  {
    key: 'personale',
    label: 'Documentazione Personale',
    description: 'Documenti dei dipendenti dell\'impresa',
  },
  {
    key: 'cantiere',
    label: 'Documentazione Cantieri',
    description: 'Documenti specifici per ogni cantiere',
  },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Trova un tipo documento ITP per chiave
 */
export function getITPDocumentType(key: string): ITPDocumentType | undefined {
  return ITP_DOCUMENT_TYPES.find(d => d.key === key);
}

/**
 * Trova un tipo documento Cantiere per chiave
 */
export function getCantiereDocumentType(key: string): CantiereDocumentType | undefined {
  return CANTIERE_DOCUMENT_TYPES.find(d => d.key === key);
}

/**
 * Trova un tipo documento Personale per chiave
 */
export function getPersonaleDocumentType(key: string): PersonaleDocumentType | undefined {
  return PERSONALE_DOCUMENT_TYPES.find(d => d.key === key);
}

/**
 * Ottieni documenti personale per categoria
 */
export function getPersonaleDocumentsByCategory(category: PersonaleDocumentType['category']): PersonaleDocumentType[] {
  return PERSONALE_DOCUMENT_TYPES.filter(d => d.category === category);
}

/**
 * Ottieni tutti i tipi documento (per dropdown legacy)
 */
export function getAllDocumentTypes(): { key: string; label: string; category: DocumentCategory }[] {
  const types: { key: string; label: string; category: DocumentCategory }[] = [];
  
  ITP_DOCUMENT_TYPES.forEach(d => {
    types.push({ key: d.key, label: d.label, category: 'itp' });
  });
  
  CANTIERE_DOCUMENT_TYPES.forEach(d => {
    types.push({ key: d.key, label: d.label, category: 'cantiere' });
  });

  PERSONALE_DOCUMENT_TYPES.forEach(d => {
    types.push({ key: d.key, label: d.label, category: 'personale' });
  });
  
  return types;
}

