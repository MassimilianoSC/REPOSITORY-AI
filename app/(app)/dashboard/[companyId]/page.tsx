"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot, collection, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import CompanyTrafficLight, { computeCompanyStatus } from "@/components/CompanyTrafficLight";
import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";

// Force client-side rendering only (no SSR)
export const dynamic = 'force-dynamic';

type DocItem = {
  id: string;
  docType: string;
  status: "green" | "yellow" | "red" | "na";
  issuedAt?: string | null;
  expiresAt?: string | null;
  reasons?: string[];
  companyRiskClass?: "basso" | "medio" | "alto" | null;
};

type RulebookDoc = {
  docType: string;
  displayName: string;
  riskClass: Array<"basso" | "medio" | "alto">;
};

interface PageProps {
  params: Promise<{ companyId: string }>;
}

export default function CompanyDashboardPage({ params }: PageProps) {
  const [companyId, setCompanyId] = useState<string>("");
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [rulebook, setRulebook] = useState<RulebookDoc[]>([]);

  // Resolve params (Next.js 13+ App Router)
  useEffect(() => {
    params.then(p => setCompanyId(p.companyId));
  }, [params]);

  // carica rulebook v1 già bundle-izzato (es. public/rulebook-v1.json)
  useEffect(() => {
    fetch("/rulebook-v1.json").then(r => r.json()).then(j => {
      // FIX: usa j.documents invece di j.rules
      setRulebook(j.documents.map((r: any) => ({
        docType: r.docType,
        displayName: r.displayName ?? r.docType,
        riskClass: r.riskClass ?? ["basso", "medio", "alto"]
      })));
    });
  }, []);

  // listener real-time sui documenti dell'azienda
  useEffect(() => {
    if (!companyId) return;
    
    // FIX: tenant-demo invece di demo
    const tenantId = 'tenant-demo';
    const col = collection(db, `tenants/${tenantId}/companies/${companyId}/documents`);
    const q = query(col, orderBy("docType"));
    const unsub = onSnapshot(q, (snap) => {
      const items: DocItem[] = [];
      snap.forEach(d => items.push({ id: d.id, ...(d.data() as any) }));
      setDocs(items);
    });
    return () => unsub();
  }, [companyId]);

  const companyRiskClass = useMemo<"basso"|"medio"|"alto"|"na">(() => {
    // prendi dalla prima occorrenza o "na"
    const found = docs.find(d => d.companyRiskClass);
    return (found?.companyRiskClass ?? "na") as any;
  }, [docs]);

  // quali documenti sono "obbligatori" per questa azienda → rulebook + riskClass
  const requiredDocTypes = useMemo(() => {
    if (companyRiskClass === "na") return rulebook.map(r => r.docType);
    return rulebook
      .filter(r => r.riskClass.includes(companyRiskClass as any))
      .map(r => r.docType);
  }, [rulebook, companyRiskClass]);

  // rollup stati
  const rollup = useMemo(() => {
    const now = new Date();
    const required = requiredDocTypes.length;

    let ok = 0, notOk = 0, expiring = 0;

    requiredDocTypes.forEach(dt => {
      const current = docs
        .filter(d => d.docType === dt)
        .sort((a, b) => (b.issuedAt ?? "").localeCompare(a.issuedAt ?? ""))[0]; // prendi la più recente

      if (!current) {
        notOk += 1; // assente = non idoneo
        return;
      }

      if (current.status === "red") {
        notOk += 1;
        return;
      }

      // calcolo "in scadenza"
      if (current.expiresAt) {
        const dd = differenceInCalendarDays(new Date(current.expiresAt), now);
        if (dd <= 10) expiring += 1;
      }

      if (current.status === "green" || current.status === "yellow" || current.status === "na") {
        ok += 1;
      }
    });

    return { totalRequired: required, ok, notOk, expiringSoon: expiring };
  }, [docs, requiredDocTypes]);

  const status = computeCompanyStatus(rollup);

  if (!companyId) {
    return <div className="p-8">Caricamento...</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Stato Azienda</h1>
          <p className="text-slate-600">Company ID: {companyId}</p>
        </div>
        <CompanyTrafficLight rollup={rollup} />
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-600 mb-1">Totali Richiesti</p>
          <p className="text-2xl font-bold text-slate-900">{rollup.totalRequired}</p>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <p className="text-sm text-green-700 mb-1">Idonei</p>
          <p className="text-2xl font-bold text-green-900">{rollup.ok}</p>
        </div>
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4">
          <p className="text-sm text-yellow-700 mb-1">In Scadenza (≤10gg)</p>
          <p className="text-2xl font-bold text-yellow-900">{rollup.expiringSoon}</p>
        </div>
        <div className="bg-red-50 rounded-lg border border-red-200 p-4">
          <p className="text-sm text-red-700 mb-1">Non Idonei</p>
          <p className="text-2xl font-bold text-red-900">{rollup.notOk}</p>
        </div>
      </div>

      <section className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-xl font-semibold text-slate-900 mb-4">
          Documenti richiesti {companyRiskClass !== "na" ? `(rischio ${companyRiskClass})` : "(tutti)"}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900">Documento</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900">Stato</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900">Scadenza</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-slate-900">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {requiredDocTypes.map(dt => {
                const current = docs
                  .filter(d => d.docType === dt)
                  .sort((a, b) => (b.issuedAt ?? "").localeCompare(a.issuedAt ?? ""))[0];
                const s = current?.status ?? "red";
                const exp = current?.expiresAt ? new Date(current.expiresAt).toLocaleDateString('it-IT') : "—";
                
                const displayName = rulebook.find(r => r.docType === dt)?.displayName ?? dt;
                
                return (
                  <tr key={dt} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-4 text-sm text-slate-900">{displayName}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span aria-label={s} style={{
                          display:"inline-block", width:10, height:10, borderRadius:5,
                          backgroundColor: s==="green" ? "#16a34a" : s==="yellow" ? "#f59e0b" : s==="red" ? "#dc2626" : "#9ca3af",
                        }}/>
                        <span className="text-sm text-slate-600">{
                          s === "green" ? "Idoneo" :
                          s === "yellow" ? "In scadenza" :
                          s === "red" ? "Non idoneo" : "N/D"
                        }</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">{exp}</td>
                    <td className="py-3 px-4">
                      {current ? (
                        <Link 
                          href={`/document/${current.id}`}
                          className="text-sm text-blue-600 hover:text-blue-800 underline"
                        >
                          Apri
                        </Link>
                      ) : (
                        <Link 
                          href={`/upload?companyId=${companyId}&docType=${dt}`}
                          className="text-sm text-blue-600 hover:text-blue-800 underline"
                        >
                          Carica
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 bg-slate-50 rounded-lg border border-slate-200 p-4">
        <details>
          <summary className="cursor-pointer text-sm font-medium text-slate-700 hover:text-slate-900">
            Note normative (tooltip utilizzati in checklist)
          </summary>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              • <strong>Contenuti minimi formazione</strong>: DM 16/01/1997 (lavoratori, RLS, datori di lavoro)
            </li>
            <li>
              • <strong>Preposti 12 ore</strong> (transitorio: 8h valide fino a 12/2025 — aggiornamento biennale): nuovo Accordo Stato-Regioni
            </li>
          </ul>
        </details>
      </section>
    </div>
  );
}

