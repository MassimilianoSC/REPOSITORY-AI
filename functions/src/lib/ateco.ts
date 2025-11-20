/**
 * ATECO Risk Mapping Loader
 * Cloud Storage JSON + in-memory cache + TTL + version bump
 */

import { Storage } from '@google-cloud/storage';

// Types
export type RiskLevel = 'basso' | 'medio' | 'alto';

export interface AtecoEntry {
  risk_level: RiskLevel;
  description: string;
}

export interface AtecoMapping {
  [atecoCode: string]: AtecoEntry;
}

// Cache state (module-scope, persiste durante vita istanza Functions)
let cachedMapping: AtecoMapping | null = null;
let lastLoadedAt: number = 0;
let lastLoadedVersion: string | null = null;

// Config from env
const ATECO_MAPPING_GCS_PATH = process.env.ATECO_MAPPING_GCS_PATH || '';
const ATECO_MAPPING_TTL_SEC = parseInt(process.env.ATECO_MAPPING_TTL_SEC || '3600', 10);
const ATECO_MAPPING_VERSION = process.env.ATECO_MAPPING_VERSION || 'v1';

// Storage client (lazy init)
let storageClient: Storage | null = null;

/**
 * Carica mapping ATECO da Cloud Storage con cache + TTL
 */
async function loadAtecoMapping(): Promise<AtecoMapping> {
  const now = Date.now();
  
  // Check cache TTL + version
  const isCacheValid = 
    cachedMapping !== null &&
    (now - lastLoadedAt) < (ATECO_MAPPING_TTL_SEC * 1000) &&
    lastLoadedVersion === ATECO_MAPPING_VERSION;
  
  if (isCacheValid) {
    console.log(`[ATECO] Cache hit (age: ${Math.floor((now - lastLoadedAt) / 1000)}s, version: ${ATECO_MAPPING_VERSION})`);
    return cachedMapping!;
  }
  
  console.log(`[ATECO] Cache miss (reason: ${!cachedMapping ? 'cold-start' : lastLoadedVersion !== ATECO_MAPPING_VERSION ? 'version-bump' : 'TTL-expired'})`);
  
  // Parse GCS path
  if (!ATECO_MAPPING_GCS_PATH) {
    console.warn('[ATECO] ATECO_MAPPING_GCS_PATH not set, returning empty mapping');
    cachedMapping = {};
    lastLoadedAt = now;
    lastLoadedVersion = ATECO_MAPPING_VERSION;
    return cachedMapping;
  }
  
  const match = ATECO_MAPPING_GCS_PATH.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    console.error(`[ATECO] Invalid GCS path format: ${ATECO_MAPPING_GCS_PATH}`);
    throw new Error(`Invalid ATECO_MAPPING_GCS_PATH format: ${ATECO_MAPPING_GCS_PATH}`);
  }
  
  const [, bucketName, filePath] = match;
  
  try {
    // Lazy init Storage client
    if (!storageClient) {
      storageClient = new Storage();
    }
    
    console.log(`[ATECO] Downloading from gs://${bucketName}/${filePath}`);
    const bucket = storageClient.bucket(bucketName);
    const file = bucket.file(filePath);
    
    const [contents] = await file.download();
    const mapping: AtecoMapping = JSON.parse(contents.toString('utf-8'));
    
    // Validate structure
    const entries = Object.keys(mapping);
    if (entries.length === 0) {
      console.warn('[ATECO] Downloaded mapping is empty');
    } else {
      console.log(`[ATECO] Cache warmed: ${entries.length} ATECO codes loaded (version: ${ATECO_MAPPING_VERSION})`);
    }
    
    // Update cache
    cachedMapping = mapping;
    lastLoadedAt = now;
    lastLoadedVersion = ATECO_MAPPING_VERSION;
    
    return cachedMapping;
    
  } catch (error: any) {
    console.error(`[ATECO] Failed to load mapping from GCS:`, error);
    
    // Fallback: keep old cache if available
    if (cachedMapping) {
      console.warn('[ATECO] Using stale cache as fallback');
      return cachedMapping;
    }
    
    throw new Error(`Failed to load ATECO mapping: ${error.message}`);
  }
}

/**
 * Get risk level by ATECO code (with hierarchical fallback)
 * 
 * Examples:
 * - "01.11.10" → exact match
 * - "01.11.10" not found → try "01.11"
 * - "01.11" not found → try "01"
 * 
 * @param atecoCode - ATECO code (e.g., "01.11.10", "61.10.00")
 * @returns Risk level or null if not found
 */
export async function getRiskClassByAteco(atecoCode: string | null | undefined): Promise<RiskLevel | null> {
  if (!atecoCode) {
    console.log('[ATECO] No ATECO code provided');
    return null;
  }
  
  const mapping = await loadAtecoMapping();
  
  // Normalize: trim, remove spaces
  const normalized = atecoCode.trim().replace(/\s+/g, '');
  
  // Try exact match
  if (mapping[normalized]) {
    console.log(`[ATECO] Exact match: ${normalized} → ${mapping[normalized].risk_level}`);
    return mapping[normalized].risk_level;
  }
  
  // Try hierarchical fallback
  // "01.11.10" → ["01.11", "01"]
  const parts = normalized.split('.');
  for (let i = parts.length - 1; i > 0; i--) {
    const prefix = parts.slice(0, i).join('.');
    if (mapping[prefix]) {
      console.log(`[ATECO] Hierarchical match: ${normalized} → ${prefix} → ${mapping[prefix].risk_level}`);
      return mapping[prefix].risk_level;
    }
  }
  
  console.log(`[ATECO] No match found for ${normalized} (fallback to null)`);
  return null;
}

/**
 * Get ATECO entry (risk + description) by code
 */
export async function getAtecoEntry(atecoCode: string | null | undefined): Promise<AtecoEntry | null> {
  if (!atecoCode) return null;
  
  const mapping = await loadAtecoMapping();
  const normalized = atecoCode.trim().replace(/\s+/g, '');
  
  // Try exact match
  if (mapping[normalized]) {
    return mapping[normalized];
  }
  
  // Try hierarchical fallback
  const parts = normalized.split('.');
  for (let i = parts.length - 1; i > 0; i--) {
    const prefix = parts.slice(0, i).join('.');
    if (mapping[prefix]) {
      return mapping[prefix];
    }
  }
  
  return null;
}

/**
 * Preload ATECO mapping (call on cold-start to warm cache)
 */
export async function preloadAtecoMapping(): Promise<void> {
  try {
    await loadAtecoMapping();
    console.log('[ATECO] Preload successful');
  } catch (error) {
    console.error('[ATECO] Preload failed (will retry on first usage):', error);
  }
}
