"use client";

type CompanyRollup = {
  totalRequired: number;
  ok: number;
  notOk: number;
  expiringSoon: number; // ≤ 10 giorni
};

export function computeCompanyStatus(r: CompanyRollup) {
  if (r.notOk > 0) return "red";
  if (r.expiringSoon > 0) return "yellow";
  if (r.totalRequired > 0 && r.ok === r.totalRequired) return "green";
  return "na";
}

export default function CompanyTrafficLight({ rollup }: { rollup: CompanyRollup }) {
  const status = computeCompanyStatus(rollup);
  const label =
    status === "green" ? "Idoneo" :
    status === "yellow" ? "Idoneo con prescrizioni" :
    status === "red" ? "Non idoneo" : "N/D";

  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <span aria-label={status} style={{
        width:12, height:12, borderRadius:6,
        backgroundColor: status==="green" ? "#16a34a" :
                         status==="yellow" ? "#f59e0b" :
                         status==="red" ? "#dc2626" : "#9ca3af"
      }}/>
      <strong>{label}</strong>
    </div>
  );
}

