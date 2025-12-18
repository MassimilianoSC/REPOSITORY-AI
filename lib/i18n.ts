/**
 * Traduzioni UI - Italiano
 */

export const translations = {
  // Dashboard
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Gestisci e controlla i tuoi documenti',
    filterByCompany: 'Filtra per Azienda',
    filterByStatus: 'Filtra per Stato',
    allCompanies: 'Tutte le Aziende',
    allStatuses: 'Tutti gli Stati',
  },

  // Status
  status: {
    green: 'Verde',
    yellow: 'Giallo',
    red: 'Rosso',
    gray: 'Grigio',
    idoneo: 'Idoneo',
    nonIdoneo: 'Non Idoneo',
    inScadenza: 'In Scadenza',
    nonApplicabile: 'Non Applicabile',
  },

  // Table Headers
  table: {
    stato: 'Stato',
    tipoDocumento: 'Tipo Documento',
    azienda: 'Azienda',
    emesso: 'Emesso',
    scadenza: 'Scadenza',
    affidabilita: 'Affidabilità',
    motivazione: 'Motivazione',
  },

  // Upload Page
  upload: {
    title: 'Carica Documento',
    subtitle: 'Carica un nuovo documento per l\'elaborazione',
    selectCompany: 'Seleziona Azienda',
    chooseCompany: 'Scegli un\'azienda...',
    selectFirst: 'Seleziona prima un\'azienda',
    uploadInfo: 'Informazioni Caricamento',
    documentsWillBeUploaded: 'I documenti verranno caricati su Firebase Storage',
    path: 'Percorso',
    onlyPdf: 'Solo file PDF fino a 10MB sono accettati',
    processing: 'Elaborazione documento',
    openDetail: 'Apri dettaglio',
    validationOutcome: 'Esito validazione',
    processingComplete: 'Elaborazione completata',
  },

  // Pipeline Steps
  pipeline: {
    fileReceived: 'File ricevuto',
    textAnalysis: 'Analisi testo (pdf.js)',
    ocrDocumentAI: 'OCR Document AI',
    ragRetrieval: 'Recupero regole (RAG)',
    vertexValidation: 'Validazione Vertex AI',
    deterministicRules: 'Regole deterministiche',
    savingResults: 'Salvataggio risultati',
    pages: 'pagine',
    chars: 'caratteri',
    maxPerPage: 'max/pagina',
    sufficientText: 'Testo sufficiente → OCR saltato ✓',
    ocrExecuted: 'OCR eseguito',
    retrieved: 'Recuperati',
    chunks: 'chunks',
    in: 'in',
    rulesPassed: 'regole passate',
  },

  // Outcomes
  outcomes: {
    idoneo: '✓ Idoneo',
    inScadenza: '⚠ In scadenza',
    nonIdoneo: '✗ Non idoneo',
    nonApplicabile: '— Non applicabile',
    confidence: 'fiducia',
  },

  // Common
  common: {
    back: 'Indietro',
    loading: 'Caricamento...',
    error: 'Errore',
    success: 'Successo',
    cancel: 'Annulla',
    confirm: 'Conferma',
    save: 'Salva',
  },
};

export type Translations = typeof translations;

