export interface DocumentItem {
  id: string;
  docType: string;
  status: 'green' | 'yellow' | 'red' | 'gray';
  issuedAt: string;
  expiresAt: string;
  confidence: number;
  reason: string;
  company?: string;
  tenant?: string;
  blobName?: string; // Path del file in Firebase Storage per download
  source?: 'ai' | 'direct'; // Origine: AI-verified o caricamento diretto
  docCategory?: 'itp' | 'cantiere' | 'personale' | 'mezzi'; // Categoria documento
  docTypeKey?: string; // Chiave tipo specifico (es. DURC, DVR, etc.)
  cantiereId?: string; // ID cantiere associato (per documenti cantiere)
}

export interface RequestItem {
  id: string;
  documentId: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt?: string;
}

export interface RuleResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export interface ExtractedField {
  label: string;
  value: string;
  confidence: number;
}

export interface ChatMessage {
  id: string;
  text: string;
  senderUid: string;
  senderEmail: string;
  senderRole: 'manager' | 'verifier' | 'uploader';
  createdAt: Date | any; // Firestore Timestamp
  companyId: string;
  tenantId: string;
}
