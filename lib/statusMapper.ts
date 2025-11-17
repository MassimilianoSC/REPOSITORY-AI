export type UIStatus = 'green' | 'yellow' | 'red' | 'gray';

const MAP_DOC: Record<string, UIStatus> = {
  idoneo: 'green',
  non_idoneo: 'red',
  needs_review: 'yellow',
  na: 'gray',
  green: 'green',
  yellow: 'yellow',
  red: 'red',
  gray: 'gray',
  unknown: 'gray',
};

export function mapBackendToUI(s?: string | null): UIStatus {
  if (!s) return 'gray';
  const key = String(s).toLowerCase();
  return MAP_DOC[key] ?? 'gray';
}

// Inverso del mapper per i filtri
export function mapUIToBackendStatus(ui?: string | null): string | null {
  if (!ui || ui === 'all') return null;
  const rev: Record<string, string> = {
    green: 'idoneo',
    red: 'non_idoneo',
    yellow: 'needs_review',
    gray: 'na',
  };
  return rev[ui] ?? null;
}

