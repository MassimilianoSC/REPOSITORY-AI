/**
 * Utility per convertire in modo sicuro timestamp Firestore in Date JavaScript
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Converte in modo sicuro un valore in Date JavaScript
 * Gestisce: Timestamp Firestore, Date, stringa ISO, null/undefined, oggetti serializzati
 */
export function toSafeDate(value: any): Date | null {
  // Caso 1: null o undefined
  if (!value) {
    return null;
  }

  // Caso 2: Già una Date JavaScript
  if (value instanceof Date) {
    return value;
  }

  // Caso 3: Timestamp Firestore (ha il metodo .toDate)
  if (value && typeof value.toDate === 'function') {
    try {
      return value.toDate();
    } catch (e) {
      console.warn('[dateUtils] Errore toDate():', e);
      return null;
    }
  }

  // Caso 4: Oggetto serializzato Firestore {seconds, nanoseconds}
  if (value && typeof value === 'object' && 'seconds' in value) {
    try {
      return new Timestamp(value.seconds, value.nanoseconds || 0).toDate();
    } catch (e) {
      console.warn('[dateUtils] Errore conversione Timestamp serializzato:', e);
      return null;
    }
  }

  // Caso 5: Stringa ISO 8601
  if (typeof value === 'string') {
    try {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    } catch (e) {
      console.warn('[dateUtils] Errore parsing stringa data:', e);
      return null;
    }
  }

  // Caso 6: Numero (timestamp Unix in millisecondi)
  if (typeof value === 'number') {
    try {
      return new Date(value);
    } catch (e) {
      console.warn('[dateUtils] Errore conversione timestamp numerico:', e);
      return null;
    }
  }

  // Tipo non riconosciuto
  console.warn('[dateUtils] Tipo non supportato:', typeof value, value);
  return null;
}

/**
 * Formatta una data in formato italiano (gg/mm/aaaa)
 */
export function formatDateIT(value: any): string {
  const date = toSafeDate(value);
  if (!date) return 'N/D';
  
  try {
    return date.toLocaleDateString('it-IT');
  } catch (e) {
    return 'N/D';
  }
}

/**
 * Formatta una data con ora in formato italiano (gg/mm/aaaa hh:mm)
 */
export function formatDateTimeIT(value: any): string {
  const date = toSafeDate(value);
  if (!date) return 'N/D';
  
  try {
    return date.toLocaleString('it-IT');
  } catch (e) {
    return 'N/D';
  }
}

/**
 * Formatta una data in formato relativo (es. "2 giorni fa")
 */
export function formatRelativeDate(value: any): string {
  const date = toSafeDate(value);
  if (!date) return 'N/D';
  
  try {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Oggi';
    if (diffDays === 1) return 'Ieri';
    if (diffDays < 7) return `${diffDays} giorni fa`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} settimane fa`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} mesi fa`;
    return `${Math.floor(diffDays / 365)} anni fa`;
  } catch (e) {
    return 'N/D';
  }
}

