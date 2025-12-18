import type { Timestamp } from 'firebase/firestore';
import { toSafeDate } from './dateUtils';

// Usa la funzione robusta da dateUtils
function toDate(val: any): Date | null {
  return toSafeDate(val);
}

export function getIssuedAt(d: any): Date | null {
  return toDate(d?.doc?.issuedAt ?? d?.extracted?.issuedAt ?? d?.issuedAt);
}

export function getExpiresAt(d: any): Date | null {
  return toDate(d?.doc?.expiresAt ?? d?.extracted?.expiresAt ?? d?.expiresAt);
}

export function fmtDate(dt: Date | null): string {
  return dt ? dt.toLocaleDateString('it-IT') : '—';
}

// Helper per altri campi comuni
export function getDocType(d: any): string {
  return d?.docType ?? d?.doc?.docType ?? 'Sconosciuto';
}

export function getCompanyName(d: any): string {
  return d?.companyName ?? d?.company?.name ?? d?.companyId ?? 'N/D';
}

export function getConfidence(d: any): number {
  return d?.confidence ?? d?.validation?.confidence ?? 0;
}

