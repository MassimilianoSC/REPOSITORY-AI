'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  collection, 
  collectionGroup, 
  query, 
  where, 
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useDocumentsCollectionGroup, useMultiCompanyDocuments } from '@/hooks/useFirestore';
import { 
  Loader2, AlertTriangle, Building2, LayoutDashboard, 
  CheckCircle2, Clock, XCircle, FileText, Users, HardHat, Sparkles, ArrowRight,
  Compass, Command
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { NavigationSheet } from '@/components/navigation-sheet';

// ✅ Array vuoto stabile (evita re-render)
const EMPTY_ARRAY: string[] = [];

interface DashboardStats {
  imprese: number;
  cantieri: number;
  personale: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const { tenantId, role, companyIds, loading: authLoading } = useAuth();
  const [otherStats, setOtherStats] = useState<DashboardStats>({
    imprese: 0,
    cantieri: 0,
    personale: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  
  // 🆕 Navigation Sheet state
  const [navSheetOpen, setNavSheetOpen] = useState(false);

  const isManagerOrVerifier = role === 'manager' || role === 'verifier';
  const tid = tenantId || '';

  // 🆕 Usa gli STESSI hook della pagina Scadenze per i documenti
  const { documents: managerDocs, loading: managerLoading } = useDocumentsCollectionGroup(
    isManagerOrVerifier && !authLoading ? tid : '',
    undefined,
    { limit: 500 }
  );

  const { documents: uploaderDocs, loading: uploaderLoading } = useMultiCompanyDocuments(
    !isManagerOrVerifier && !authLoading ? tid : '',
    !isManagerOrVerifier && !authLoading ? companyIds : EMPTY_ARRAY,
    { limit: 500 }
  );

  // Seleziona i documenti in base al ruolo
  const rawDocs = isManagerOrVerifier ? managerDocs : uploaderDocs;
  const docsLoading = isManagerOrVerifier ? managerLoading : uploaderLoading;

  // Calcola statistiche documenti dai documenti caricati
  const docStats = useMemo(() => {
    const stats = { total: 0, green: 0, yellow: 0, red: 0, gray: 0 };
    
    rawDocs.forEach((doc) => {
      const status = doc.overall?.status || doc.status || 'gray';
      stats.total++;
      if (status === 'green' || status === 'valid') stats.green++;
      else if (status === 'yellow' || status === 'expiring') stats.yellow++;
      else if (status === 'red' || status === 'invalid' || status === 'expired') stats.red++;
      else stats.gray++;
    });
    
    return stats;
  }, [rawDocs]);

  // Carica solo imprese, cantieri, personale (non documenti)
  useEffect(() => {
    if (!tid || authLoading) return;

    const fetchOtherStats = async () => {
      setStatsLoading(true);
      try {
        let impreseCount = 0;
        let cantieriCount = 0;
        let personaleCount = 0;

        if (isManagerOrVerifier) {
          // HQ vede tutto
          
          // Conta imprese
          const companiesRef = collection(db, `tenants/${tid}/companies`);
          const companiesSnap = await getDocs(companiesRef);
          impreseCount = companiesSnap.size;

          // Conta cantieri (collectionGroup)
          const cantieriQuery = query(
            collectionGroup(db, 'cantieri'),
            where('tenantId', '==', tid)
          );
          const cantieriSnap = await getDocs(cantieriQuery);
          cantieriCount = cantieriSnap.size;

          // Conta personale (collectionGroup)
          const personaleQuery = query(
            collectionGroup(db, 'personale'),
            where('tenantId', '==', tid)
          );
          const personaleSnap = await getDocs(personaleQuery);
          personaleCount = personaleSnap.size;

        } else {
          // Uploader vede solo le sue imprese
          impreseCount = companyIds?.length || 0;

          // Conta cantieri e personale per ogni companyId
          for (const companyId of (companyIds || [])) {
            // Cantieri
            const cantieriRef = collection(db, `tenants/${tid}/companies/${companyId}/cantieri`);
            const cantieriSnap = await getDocs(cantieriRef);
            cantieriCount += cantieriSnap.size;

            // Personale
            const personaleRef = collection(db, `tenants/${tid}/companies/${companyId}/personale`);
            const personaleSnap = await getDocs(personaleRef);
            personaleCount += personaleSnap.size;
          }
        }

        setOtherStats({
          imprese: impreseCount,
          cantieri: cantieriCount,
          personale: personaleCount,
        });
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchOtherStats();
  }, [tid, authLoading, isManagerOrVerifier, companyIds]);

  const loading = authLoading || docsLoading || statsLoading;

  // ✅ Return condizionali DOPO tutti gli hook
  if (authLoading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center text-slate-500">
          <Loader2 className="w-12 h-12 mx-auto mb-3 animate-spin text-slate-400" />
          <p>Caricamento...</p>
        </div>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-slate-500">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-yellow-400" />
          <p>Sessione non valida. Effettua nuovamente il login.</p>
        </div>
      </div>
    );
  }

  // Card KPI (solo visualizzazione, non più cliccabili per navigare)
  const KpiCard = ({ 
    title, 
    value, 
    icon: Icon, 
    gradient, 
  }: { 
    title: string; 
    value: number; 
    icon: React.ElementType; 
    gradient: string; 
  }) => (
    <div className={`p-6 rounded-2xl ${gradient} text-white shadow-xl`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-90">{title}</p>
          {loading ? (
            <Loader2 className="w-8 h-8 mt-2 animate-spin opacity-70" />
          ) : (
            <p className="text-5xl font-extrabold mt-2">{value}</p>
          )}
        </div>
        <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
          <Icon className="w-8 h-8 text-white" />
        </div>
      </div>
    </div>
  );

  // Card stato documenti
  const DocStatusCard = ({ 
    title, 
    value, 
    icon: Icon, 
    colorClass,
    bgClass,
    onClick
  }: { 
    title: string; 
    value: number; 
    icon: React.ElementType; 
    colorClass: string;
    bgClass: string;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className={`w-full text-left p-5 rounded-xl ${bgClass} border border-opacity-20 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg group`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl ${colorClass} bg-opacity-20 flex items-center justify-center`}>
          <Icon className={`w-6 h-6 ${colorClass}`} />
        </div>
        <div>
          <p className="text-sm text-slate-600 font-medium">{title}</p>
          {loading ? (
            <Loader2 className="w-6 h-6 mt-1 animate-spin text-slate-400" />
          ) : (
            <p className={`text-3xl font-bold ${colorClass}`}>{value}</p>
          )}
        </div>
        <ArrowRight className="w-5 h-5 ml-auto text-slate-400 group-hover:text-slate-600 group-hover:translate-x-1 transition-all" />
      </div>
    </button>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header con gradiente */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/30">
              <LayoutDashboard className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-gradient">
                Dashboard
              </h1>
              <p className="text-slate-500 mt-1">Panoramica generale del sistema</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-teal-50 rounded-xl border border-teal-200">
            <Sparkles className="w-4 h-4 text-teal-600" />
            <span className="text-sm font-medium text-teal-700">AI-Powered</span>
          </div>
        </div>
      </div>

      {/* 🆕 Navigation Card - Navigazione Guidata */}
      <div className="mb-8">
        <button
          onClick={() => setNavSheetOpen(true)}
          className="w-full p-6 bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 group border border-slate-700"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-500 flex items-center justify-center shadow-lg">
                <Compass className="w-7 h-7 text-white" />
              </div>
              <div className="text-left">
                <h2 className="text-xl font-bold text-white">Naviga</h2>
                <p className="text-slate-400 text-sm mt-0.5">
                  Seleziona impresa e cantiere per accedere rapidamente
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 rounded-lg border border-slate-600">
                <Command className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-400 font-medium">Click</span>
              </div>
              <ArrowRight className="w-6 h-6 text-slate-500 group-hover:text-teal-400 group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        </button>
      </div>

      {/* KPI Principali (solo visualizzazione) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <KpiCard
          title="Imprese"
          value={otherStats.imprese}
          icon={Building2}
          gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
        />
        <KpiCard
          title="Cantieri"
          value={otherStats.cantieri}
          icon={HardHat}
          gradient="bg-gradient-to-br from-orange-500 to-amber-600"
        />
        <KpiCard
          title="Personale"
          value={otherStats.personale}
          icon={Users}
          gradient="bg-gradient-to-br from-violet-500 to-purple-600"
        />
        <KpiCard
          title="Documenti"
          value={docStats.total}
          icon={FileText}
          gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
        />
      </div>

      {/* Stato Documenti */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-5 flex items-center gap-2">
          <FileText className="w-5 h-5 text-teal-500" />
          Stato Documenti
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <DocStatusCard
            title="Validi"
            value={docStats.green}
            icon={CheckCircle2}
            colorClass="text-green-600"
            bgClass="bg-green-50 border-green-200"
            onClick={() => router.push('/upload?tab=visualizza')}
          />
          <DocStatusCard
            title="In Scadenza"
            value={docStats.yellow}
            icon={Clock}
            colorClass="text-amber-600"
            bgClass="bg-amber-50 border-amber-200"
            onClick={() => router.push('/scadenze')}
          />
          <DocStatusCard
            title="Problemi"
            value={docStats.red}
            icon={XCircle}
            colorClass="text-red-600"
            bgClass="bg-red-50 border-red-200"
            onClick={() => router.push('/scadenze?tab=verifica')}
          />
          <DocStatusCard
            title="Non Verificati"
            value={docStats.gray}
            icon={AlertTriangle}
            colorClass="text-slate-500"
            bgClass="bg-slate-50 border-slate-200"
            onClick={() => router.push('/upload?tab=visualizza')}
          />
        </div>

        {/* Progress bar */}
        {!loading && docStats.total > 0 && (
          <div className="mt-6">
            <div className="flex justify-between text-sm text-slate-600 mb-2">
              <span>Conformità documenti</span>
              <span className="font-semibold">
                {Math.round((docStats.green / docStats.total) * 100)}%
              </span>
            </div>
            <div className="h-3 bg-slate-200 rounded-full overflow-hidden flex">
              <div 
                className="bg-green-500 transition-all duration-500" 
                style={{ width: `${(docStats.green / docStats.total) * 100}%` }}
              />
              <div 
                className="bg-amber-500 transition-all duration-500" 
                style={{ width: `${(docStats.yellow / docStats.total) * 100}%` }}
              />
              <div 
                className="bg-red-500 transition-all duration-500" 
                style={{ width: `${(docStats.red / docStats.total) * 100}%` }}
              />
              <div 
                className="bg-slate-400 transition-all duration-500" 
                style={{ width: `${(docStats.gray / docStats.total) * 100}%` }}
              />
            </div>
            <div className="flex gap-4 mt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-green-500" /> Validi
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-amber-500" /> In scadenza
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-red-500" /> Problemi
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-slate-400" /> Non verificati
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Banner per uploader */}
      {role === 'uploader' && companyIds && companyIds.length > 0 && (
        <div className="mt-6 p-5 bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-cyan-500/10 border border-teal-200/50 rounded-2xl flex items-start gap-4 backdrop-blur-sm">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-teal-500/25">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-semibold text-slate-800">
              Imprese assegnate: <span className="text-teal-600">{companyIds.join(', ')}</span>
            </p>
            <p className="text-sm text-slate-600 mt-1">
              Visualizzi solo i dati delle tue imprese. Contatta l&apos;amministratore per accedere ad altre.
            </p>
          </div>
        </div>
      )}

      {/* 🆕 Navigation Sheet Modal */}
      <NavigationSheet
        isOpen={navSheetOpen}
        onClose={() => setNavSheetOpen(false)}
        tenantId={tid}
        isHQ={isManagerOrVerifier}
        companyIds={companyIds}
      />
    </div>
  );
}
