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
