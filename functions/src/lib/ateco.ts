import fs from "node:fs";
import path from "node:path";

type RiskClass = "basso" | "medio" | "alto";
type MapFile = { version: string; map: Record<string, RiskClass> };

let cache: MapFile | null = null;

function loadMap(): MapFile {
  if (cache) return cache;
  // FIX: path corretto → rulebook invece di assets
  const p = path.join(__dirname, "../rulebook/ateco_risk_map.json");
  const raw = fs.readFileSync(p, "utf-8");
  cache = JSON.parse(raw) as MapFile;
  return cache!;
}

export function getRiskClassByAteco(code?: string | null): RiskClass | null {
  if (!code) return null;
  const normalized = code.trim();
  const { map } = loadMap();

  // prova match esatto, poi prefissi più lunghi → più corti
  const parts = normalized.split(".");
  for (let len = parts.length; len > 0; len--) {
    const key = parts.slice(0, len).join(".");
    if (map[key]) return map[key];
  }
  return null;
}

