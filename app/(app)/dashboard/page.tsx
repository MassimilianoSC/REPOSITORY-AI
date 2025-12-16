'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  collection, 
  collectionGroup, 
  query, 
  where, 
  getDocs,
  onSnapshot 
} from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { 
  Loader2, AlertTriangle, Building2, LayoutDashboard, 
  CheckCircle2, Clock, XCircle, FileText, Users, HardHat, Sparkles, ArrowRight
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// ✅ Array vuoto stabile (evita re-render)
const EMPTY_ARRAY: string[] = [];

interface DashboardStats {
  imprese: number;
  cantieri: number;
  personale: number;
  documenti: {
    total: number;
    green: number;
    yellow: number;
    red: number;
    gray: number;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const { tenantId, role, companyIds, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    imprese: 0,
    cantieri: 0,
    personale: 0,
    documenti: { total: 0, green: 0, yellow: 0, red: 0, gray: 0 }
  });
  const [loading, setLoading] = useState(true);

  const isManagerOrVerifier = role === 'manager' || role === 'verifier';
  const tid = tenantId || '';

  useEffect(() => {
    if (!tid || authLoading) return;

    const fetchStats = async () => {
      setLoading(true);
      try {
        let impreseCount = 0;
        let cantieriCount = 0;
        let personaleCount = 0;
        let docStats = { total: 0, green: 0, yellow: 0, red: 0, gray: 0 };

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

          // Conta documenti per stato
          const docsQuery = query(
            collectionGroup(db, 'documents'),
            where('tenantId', '==', tid),
            where('isDeleted', '==', false),
            where('isCurrent', '==', true)
          );
          const docsSnap = await getDocs(docsQuery);
          
          docsSnap.forEach((doc) => {
            const data = doc.data();
            const status = data.overall?.status || data.status || 'gray';
            docStats.total++;
            if (status === 'green' || status === 'valid') docStats.green++;
            else if (status === 'yellow' || status === 'expiring') docStats.yellow++;
            else if (status === 'red' || status === 'invalid' || status === 'expired') docStats.red++;
            else docStats.gray++;
          });

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

            // Documenti
            const docsRef = collection(db, `tenants/${tid}/companies/${companyId}/documents`);
            const docsQuery = query(
              docsRef,
              where('isDeleted', '==', false),
              where('isCurrent', '==', true)
            );
            const docsSnap = await getDocs(docsQuery);
            
            docsSnap.forEach((doc) => {
              const data = doc.data();
              const status = data.overall?.status || data.status || 'gray';
              docStats.total++;
              if (status === 'green' || status === 'valid') docStats.green++;
              else if (status === 'yellow' || status === 'expiring') docStats.yellow++;
              else if (status === 'red' || status === 'invalid' || status === 'expired') docStats.red++;
              else docStats.gray++;
            });
          }
        }

        setStats({
          imprese: impreseCount,
          cantieri: cantieriCount,
          personale: personaleCount,
          documenti: docStats
        });
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [tid, authLoading, isManagerOrVerifier, companyIds]);

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

  // Card cliccabile
  const KpiCard = ({ 
    title, 
    value, 
    icon: Icon, 
    gradient, 
    href, 
    subtitle 
  }: { 
    title: string; 
    value: number; 
    icon: React.ElementType; 
    gradient: string; 
    href: string; 
    subtitle: string;
  }) => (
    <button
      onClick={() => router.push(href)}
      className={`w-full text-left p-6 rounded-2xl ${gradient} text-white shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl group`}
    >
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
      <div className="mt-4 flex items-center gap-2 text-sm opacity-80 group-hover:opacity-100 transition-opacity">
        <span>{subtitle}</span>
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </div>
    </button>
  );

  // Card stato documenti (non cliccabile direttamente, ma mostra breakdown)
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

      {/* KPI Principali */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <KpiCard
          title="Imprese"
          value={stats.imprese}
          icon={Building2}
          gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
          href={isManagerOrVerifier ? '/admin/aziende' : '/azienda'}
          subtitle="Gestisci imprese"
        />
        <KpiCard
          title="Cantieri"
          value={stats.cantieri}
          icon={HardHat}
          gradient="bg-gradient-to-br from-orange-500 to-amber-600"
          href={isManagerOrVerifier ? '/admin/aziende' : '/upload?tab=cantieri'}
          subtitle="Visualizza cantieri"
        />
        <KpiCard
          title="Personale"
          value={stats.personale}
          icon={Users}
          gradient="bg-gradient-to-br from-violet-500 to-purple-600"
          href="/upload?tab=personale"
          subtitle="Archivio dipendenti"
        />
        <KpiCard
          title="Documenti"
          value={stats.documenti.total}
          icon={FileText}
          gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
          href="/upload"
          subtitle="Gestione documenti"
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
            value={stats.documenti.green}
            icon={CheckCircle2}
            colorClass="text-green-600"
            bgClass="bg-green-50 border-green-200"
            onClick={() => router.push('/scadenze')}
          />
          <DocStatusCard
            title="In Scadenza"
            value={stats.documenti.yellow}
            icon={Clock}
            colorClass="text-amber-600"
            bgClass="bg-amber-50 border-amber-200"
            onClick={() => router.push('/scadenze')}
          />
          <DocStatusCard
            title="Problemi"
            value={stats.documenti.red}
            icon={XCircle}
            colorClass="text-red-600"
            bgClass="bg-red-50 border-red-200"
            onClick={() => router.push('/scadenze?tab=verifica')}
          />
          <DocStatusCard
            title="Non Verificati"
            value={stats.documenti.gray}
            icon={AlertTriangle}
            colorClass="text-slate-500"
            bgClass="bg-slate-50 border-slate-200"
            onClick={() => router.push('/upload')}
          />
        </div>

        {/* Progress bar */}
        {!loading && stats.documenti.total > 0 && (
          <div className="mt-6">
            <div className="flex justify-between text-sm text-slate-600 mb-2">
              <span>Conformità documenti</span>
              <span className="font-semibold">
                {Math.round((stats.documenti.green / stats.documenti.total) * 100)}%
              </span>
            </div>
            <div className="h-3 bg-slate-200 rounded-full overflow-hidden flex">
              <div 
                className="bg-green-500 transition-all duration-500" 
                style={{ width: `${(stats.documenti.green / stats.documenti.total) * 100}%` }}
              />
              <div 
                className="bg-amber-500 transition-all duration-500" 
                style={{ width: `${(stats.documenti.yellow / stats.documenti.total) * 100}%` }}
              />
              <div 
                className="bg-red-500 transition-all duration-500" 
                style={{ width: `${(stats.documenti.red / stats.documenti.total) * 100}%` }}
              />
              <div 
                className="bg-slate-400 transition-all duration-500" 
                style={{ width: `${(stats.documenti.gray / stats.documenti.total) * 100}%` }}
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
    </div>
  );
}
