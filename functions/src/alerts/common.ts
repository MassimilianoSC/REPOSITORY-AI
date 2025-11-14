import { Timestamp } from "firebase-admin/firestore";

export type Bucket = 30 | 15 | 7 | 1;

export function parseBuckets(env: string | undefined): Bucket[] {
  const def: Bucket[] = [30, 15, 7, 1];
  if (!env) return def;
  const out = env.split(",").map(s => Number(s.trim())).filter(n => [30,15,7,1].includes(n)) as Bucket[];
  return out.length ? out : def;
}

export function startEndOfDayRome(date: Date): { start: Date; end: Date } {
  // "zeriamo" alle 00:00/23:59:59 in Europe/Rome (approssimato per semplicità)
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { start, end };
}

export function windowForBucket(days: number, now = new Date()) {
  const target = new Date(now);
  target.setDate(target.getDate() + days);
  const { start, end } = startEndOfDayRome(target);
  return {
    gte: Timestamp.fromDate(start),
    lt: Timestamp.fromDate(new Date(end.getTime() + 1)), // < next ms
    dateLabel: `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,"0")}-${String(target.getDate()).padStart(2,"0")}`,
  };
}

export function todayYMD(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}

export function makeSubject(title: string, days: number) {
  return `Promemoria scadenza: ${title} (in ${days} giorni)`;
}

export function makePlainText(doc: any, days: number) {
  const name = doc?.name || doc?.title || doc?.docType || "Documento";
  const expires = doc?.expiresAt?.toDate?.()?.toISOString?.()?.slice(0,10) || "N/D";
  return [
    `Gentile utente,`,
    ``,
    `il documento "${name}" risulta in scadenza tra ${days} giorni.`,
    `Data scadenza: ${expires}`,
    ``,
    `Questo è un promemoria automatico.`,
  ].join("\n");
}

