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
  
  return types;
}

