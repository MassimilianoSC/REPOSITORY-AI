'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/data-table';
import { TrafficLight } from '@/components/traffic-light';
import { NotificationList } from '@/components/notification-list';
import { 
  Bell, Calendar, AlertTriangle, Loader2, Clock, CheckCircle2, XCircle, 
  Filter, ClipboardCheck, AlertCircle, Eye, ChevronDown, ChevronUp
} from 'lucide-react';
import { DownloadButton } from '@/components/DownloadButton';
import { ExpiryCalendar } from '@/components/expiry-calendar';
import { DocumentItem } from '@/lib/types';
import { useDocumentsCollectionGroup, useMultiCompanyDocuments } from '@/hooks/useFirestore';
import { getExpiresAt, getIssuedAt } from '@/lib/fields';
import { mapBackendToUI } from '@/lib/statusMapper';
import { useAuth } from '@/hooks/useAuth';

// ✅ Array vuoto stabile (evita re-render)
const EMPTY_ARRAY: string[] = [];

export const dynamic = 'force-dynamic';

type Tab = 'scadenze' | 'verifica' | 'notifiche';
type CategoryFilter = 'tutti' | 'itp' | 'cantieri' | 'personale';

export default function ScadenzePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('scadenze');
  
  // Filtri per tab "Scadenze"
  const [scadenzeCompanyFilter, setScadenzeCompanyFilter] = useState<string>('all');
  const [scadenzeCategoryFilter, setScadenzeCategoryFilter] = useState<CategoryFilter>('tutti');
  
  // Filtri per il tab "Da Verificare"
  const [verificaCompanyFilter, setVerificaCompanyFilter] = useState('');
  const [verificaDocTypeFilter, setVerificaDocTypeFilter] = useState('');
  const [verificaStatusFilter, setVerificaStatusFilter] = useState<'all' | 'yellow' | 'red'>('all');
  const [verificaCategoryFilter, setVerificaCategoryFilter] = useState<CategoryFilter>('tutti');

  // 🆕 Stato per calendario collassabile
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Auth
  const { tenantId, role, companyIds, loading: authLoading } = useAuth();
  const isManagerOrVerifier = role === 'manager' || role === 'verifier';
  const tid = tenantId || '';

  // Hook per manager/verifier
  const { documents: managerDocs, loading: managerLoading } = useDocumentsCollectionGroup(
    isManagerOrVerifier && !authLoading ? tid : '',
    undefined,
    { limit: 200 }
  );

  // Hook per uploader (query per-azienda)
  const { documents: uploaderDocs, loading: uploaderLoading } = useMultiCompanyDocuments(
    !isManagerOrVerifier && !authLoading ? tid : '',
    !isManagerOrVerifier && !authLoading ? companyIds : EMPTY_ARRAY,
    { limit: 200 }
  );

  const rawDocs = isManagerOrVerifier ? managerDocs : uploaderDocs;
  const docsLoading = isManagerOrVerifier ? managerLoading : uploaderLoading;
  const loading = authLoading || docsLoading;
  const accessibleDocs = rawDocs;

  // Elabora documenti
  const { scadenzeDocs, verificaDocs, calendarDocs, stats, uniqueCompanies, uniqueDocTypes } = useMemo(() => {
    const scadenze: DocumentItem[] = [];
    const daVerificare: DocumentItem[] = [];
    const calendar: DocumentItem[] = [];
    
    let scaduti = 0;
    let inScadenza = 0;
    let validi = 0;
    let totaleGialli = 0;
    let totaleRossi = 0;

    const companies = new Set<string>();
    const docTypes = new Set<string>();

    accessibleDocs.forEach((doc) => {
      const expiresAt = getExpiresAt(doc);
      const issuedAt = getIssuedAt(doc);
      const mappedStatus = mapBackendToUI(doc.overall?.status || doc.status);
      
      if (doc.companyId) companies.add(doc.companyId);
      if (doc.docType) docTypes.add(doc.docType);
      
      const item: DocumentItem = {
        id: doc.id,
        docType: doc.docType || 'Sconosciuto',
        company: doc.companyId || 'N/D',
        status: mappedStatus,
        issuedAt: issuedAt ? issuedAt.toLocaleDateString('it-IT') : 'N/D',
        expiresAt: expiresAt ? expiresAt.toLocaleDateString('it-IT') : 'N/D',
        confidence: doc.confidence || 0,
        reason: doc.reason || doc.overall?.reason || '',
        blobName: doc.blobName || undefined,
        source: doc.source || 'ai',
        docCategory: doc.docCategory || undefined,
      };

      if (expiresAt) {
        calendar.push(item);
        const msToExpiry = expiresAt.getTime() - Date.now();
        const daysToExpiry = Math.floor(msToExpiry / (1000 * 60 * 60 * 24));

        if (daysToExpiry < 0) {
          scaduti++;
          scadenze.push(item);
          return;
        } else if (daysToExpiry <= 10) {
          inScadenza++;
          scadenze.push(item);
          return;
        } else if (daysToExpiry <= 30) {
          validi++;
          scadenze.push(item);
          return;
        }
      }

      if (mappedStatus === 'red') {
        totaleRossi++;
        daVerificare.push(item);
      } else if (mappedStatus === 'yellow') {
        totaleGialli++;
        daVerificare.push(item);
      }
    });

    scadenze.sort((a, b) => {
      const dateA = a.expiresAt === 'N/D' ? Infinity : new Date(a.expiresAt.split('/').reverse().join('-')).getTime();
      const dateB = b.expiresAt === 'N/D' ? Infinity : new Date(b.expiresAt.split('/').reverse().join('-')).getTime();
      return dateA - dateB;
    });

    daVerificare.sort((a, b) => {
      if (a.status === 'red' && b.status !== 'red') return -1;
      if (a.status !== 'red' && b.status === 'red') return 1;
      return 0;
    });

    return {
      scadenzeDocs: scadenze,
      verificaDocs: daVerificare,
      calendarDocs: calendar,
      stats: { scaduti, inScadenza, validi, totaleGialli, totaleRossi, totaleVerifica: totaleGialli + totaleRossi },
      uniqueCompanies: Array.from(companies),
      uniqueDocTypes: Array.from(docTypes),
    };
  }, [accessibleDocs]);

  // Filtra documenti "Scadenze"
  const filteredScadenzeDocs = useMemo(() => {
    return scadenzeDocs.filter((doc) => {
      if (scadenzeCompanyFilter !== 'all' && doc.company !== scadenzeCompanyFilter) return false;
      if (scadenzeCategoryFilter !== 'tutti') {
        const docCat = doc.docCategory || '';
        if (scadenzeCategoryFilter === 'itp' && docCat !== 'itp') return false;
        if (scadenzeCategoryFilter === 'cantieri' && docCat !== 'cantiere') return false;
        if (scadenzeCategoryFilter === 'personale' && docCat !== 'personale') return false;
      }
      return true;
    });
  }, [scadenzeDocs, scadenzeCompanyFilter, scadenzeCategoryFilter]);

  // Conteggi per sub-tab Scadenze
  const scadenzeCategoryCounts = useMemo(() => {
    let filtered = scadenzeDocs;
    if (scadenzeCompanyFilter !== 'all') {
      filtered = filtered.filter(d => d.company === scadenzeCompanyFilter);
    }
    return {
      tutti: filtered.length,
      itp: filtered.filter(d => d.docCategory === 'itp').length,
      cantieri: filtered.filter(d => d.docCategory === 'cantiere').length,
      personale: filtered.filter(d => d.docCategory === 'personale').length,
    };
  }, [scadenzeDocs, scadenzeCompanyFilter]);

  // Filtra documenti "Da Verificare"
  const filteredVerificaDocs = useMemo(() => {
    return verificaDocs.filter((doc) => {
      if (verificaCompanyFilter && doc.company !== verificaCompanyFilter) return false;
      if (verificaDocTypeFilter && doc.docType !== verificaDocTypeFilter) return false;
      if (verificaStatusFilter !== 'all' && doc.status !== verificaStatusFilter) return false;
      if (verificaCategoryFilter !== 'tutti') {
        const docCat = doc.docCategory || '';
        if (verificaCategoryFilter === 'itp' && docCat !== 'itp') return false;
        if (verificaCategoryFilter === 'cantieri' && docCat !== 'cantiere') return false;
        if (verificaCategoryFilter === 'personale' && docCat !== 'personale') return false;
      }
      return true;
    });
  }, [verificaDocs, verificaCompanyFilter, verificaDocTypeFilter, verificaStatusFilter, verificaCategoryFilter]);

  // Conteggi per sub-tab Verifica
  const verificaCategoryCounts = useMemo(() => {
    let filtered = verificaDocs;
    if (verificaCompanyFilter) {
      filtered = filtered.filter(d => d.company === verificaCompanyFilter);
    }
    if (verificaStatusFilter !== 'all') {
      filtered = filtered.filter(d => d.status === verificaStatusFilter);
    }
    return {
      tutti: filtered.length,
      itp: filtered.filter(d => d.docCategory === 'itp').length,
      cantieri: filtered.filter(d => d.docCategory === 'cantiere').length,
      personale: filtered.filter(d => d.docCategory === 'personale').length,
    };
  }, [verificaDocs, verificaCompanyFilter, verificaStatusFilter]);

  // Colonne tabella scadenze
  const scadenzeColumns = [
    {
      key: 'status',
      header: 'Stato',
      render: (doc: DocumentItem) => <TrafficLight status={doc.status} />,
      className: 'w-16',
    },
    {
      key: 'docType',
      header: 'Tipo Documento',
    },
    {
      key: 'company',
      header: 'Impresa',
    },
    {
      key: 'expiresAt',
      header: 'Scadenza',
      render: (doc: DocumentItem) => {
        if (doc.expiresAt === 'N/D') return <span className="text-slate-400">N/D</span>;
        
        const parts = doc.expiresAt.split('/');
        const expDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        const daysLeft = Math.floor((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        let colorClass = 'text-slate-900';
        let badge = null;
        
        if (daysLeft < 0) {
          colorClass = 'text-red-600 font-semibold';
          badge = <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">SCADUTO</span>;
        } else if (daysLeft <= 10) {
          colorClass = 'text-orange-600 font-medium';
          badge = <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">{daysLeft}gg</span>;
        } else if (daysLeft <= 30) {
          colorClass = 'text-yellow-700';
          badge = <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">{daysLeft}gg</span>;
        }
        
        return (
          <span className={colorClass}>
            {doc.expiresAt}
            {badge}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Azioni',
      render: (doc: DocumentItem) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/document?id=${doc.id}&tid=${tenantId}`);
            }}
            className="p-2 rounded-lg transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 text-slate-500"
            title="Visualizza dettagli"
          >
            <Eye className="w-4 h-4" />
          </button>
          {doc.blobName && (
            <DownloadButton 
              blobName={doc.blobName} 
              variant="icon"
              fileName={`${doc.docType}_${doc.company}.pdf`}
            />
          )}
        </div>
      ),
      className: 'w-24',
    },
  ];

  // Colonne tabella verifica
  const verificaColumns = [
    {
      key: 'status',
      header: 'Stato',
      render: (doc: DocumentItem) => <TrafficLight status={doc.status} />,
      className: 'w-16',
    },
    {
      key: 'docType',
      header: 'Tipo Documento',
      render: (doc: DocumentItem) => (
        <span className="font-medium text-slate-800">{doc.docType}</span>
      ),
    },
    {
      key: 'company',
      header: 'Impresa',
      render: (doc: DocumentItem) => (
        <span className="text-sm text-slate-600">{doc.company}</span>
      ),
    },
    {
      key: 'reason',
      header: 'Motivo',
      render: (doc: DocumentItem) => {
        const colorClass = doc.status === 'red' ? 'text-red-700' : 'text-amber-700';
        return (
          <span className={`text-sm ${colorClass} line-clamp-2`} title={doc.reason}>
            {doc.reason || (doc.status === 'red' ? 'Documento non valido' : 'Richiede verifica manuale')}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Azioni',
      render: (doc: DocumentItem) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/document?id=${doc.id}&tid=${tenantId}`);
            }}
            className="p-2 rounded-lg transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 text-slate-500"
            title="Visualizza dettagli"
          >
            <Eye className="w-4 h-4" />
          </button>
          {doc.blobName && (
            <DownloadButton 
              blobName={doc.blobName} 
              variant="icon"
              fileName={`${doc.docType}_${doc.company}.pdf`}
            />
          )}
        </div>
      ),
      className: 'w-24',
    },
  ];

  // Loading
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

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* ========== HEADER ========== */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Calendar className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-extrabold text-gradient-warm">
                  Scadenze
                </h1>
                {role === 'uploader' && companyIds.length === 1 && (
                  <span className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full text-sm font-semibold shadow-sm">
                    {companyIds[0]}
                  </span>
                )}
              </div>
              <p className="text-slate-500 mt-1">Monitora scadenze e documenti da verificare</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-xl border border-amber-200">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700">Monitoraggio</span>
          </div>
        </div>
      </div>

      {/* ========== TAB PRINCIPALE GRANDE (stile Upload) ========== */}
      <div className="flex gap-3 mb-6 p-2 bg-slate-100 rounded-2xl">
        <button
          onClick={() => setActiveTab('scadenze')}
          className={`
            flex-1 px-8 py-4 font-bold text-lg transition-all flex items-center justify-center gap-3 rounded-xl
            ${activeTab === 'scadenze'
              ? 'bg-white text-amber-600 shadow-md'
              : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }
          `}
        >
          <Calendar className="w-6 h-6" />
          <span>Scadenze</span>
          {(stats.scaduti + stats.inScadenza) > 0 && (
            <span className={`text-sm px-3 py-1 rounded-full font-bold ${
              activeTab === 'scadenze'
                ? (stats.scaduti > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')
                : (stats.scaduti > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white')
            }`}>
              {stats.scaduti + stats.inScadenza}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('verifica')}
          className={`
            flex-1 px-8 py-4 font-bold text-lg transition-all flex items-center justify-center gap-3 rounded-xl
            ${activeTab === 'verifica'
              ? 'bg-white text-sky-600 shadow-md'
              : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }
          `}
        >
          <ClipboardCheck className="w-6 h-6" />
          <span>Da Verificare</span>
          {stats.totaleVerifica > 0 && (
            <span className={`text-sm px-3 py-1 rounded-full font-bold ${
              activeTab === 'verifica'
                ? (stats.totaleRossi > 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')
                : (stats.totaleRossi > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white')
            }`}>
              {stats.totaleVerifica}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('notifiche')}
          className={`
            flex-1 px-8 py-4 font-bold text-lg transition-all flex items-center justify-center gap-3 rounded-xl
            ${activeTab === 'notifiche'
              ? 'bg-white text-teal-600 shadow-md'
              : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }
          `}
        >
          <Bell className="w-6 h-6" />
          <span>Notifiche</span>
        </button>
      </div>

      {/* ==================== TAB SCADENZE ==================== */}
      {activeTab === 'scadenze' && (
        <>
          {/* Sub-tab Categoria */}
          <div className="flex gap-2 mb-6 p-1.5 bg-slate-100 rounded-2xl">
            {[
              { key: 'tutti' as CategoryFilter, label: 'Tutti', count: scadenzeCategoryCounts.tutti },
              { key: 'itp' as CategoryFilter, label: 'ITP', count: scadenzeCategoryCounts.itp },
              { key: 'cantieri' as CategoryFilter, label: 'Cantieri', count: scadenzeCategoryCounts.cantieri },
              { key: 'personale' as CategoryFilter, label: 'Personale', count: scadenzeCategoryCounts.personale },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setScadenzeCategoryFilter(tab.key)}
                className={`
                  flex-1 px-6 py-3.5 font-semibold transition-all flex items-center justify-center gap-2 rounded-xl
                  ${scadenzeCategoryFilter === tab.key
                    ? 'bg-white text-amber-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                  }
                `}
              >
                {tab.label}
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  scadenzeCategoryFilter === tab.key ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Barra statistiche compatta + filtro */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Stats compatte */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-sm text-slate-600">Scaduti:</span>
                  <span className="font-bold text-red-600">{loading ? '...' : stats.scaduti}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <span className="text-sm text-slate-600">≤10 giorni:</span>
                  <span className="font-bold text-amber-600">{loading ? '...' : stats.inScadenza}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-sm text-slate-600">≤30 giorni:</span>
                  <span className="font-bold text-green-600">{loading ? '...' : stats.validi}</span>
                </div>
              </div>

              {/* Filtro impresa (se necessario) */}
              {(isManagerOrVerifier || companyIds.length > 1) && (
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={scadenzeCompanyFilter}
                    onChange={(e) => setScadenzeCompanyFilter(e.target.value)}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  >
                    <option value="all">Tutte le imprese</option>
                    {uniqueCompanies.map((company) => (
                      <option key={company} value={company}>{company}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Tabella scadenze */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-500" />
                Documenti in Scadenza
                <span className="ml-2 text-xs font-medium px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
                  {filteredScadenzeDocs.length} documenti
                </span>
              </h2>
            </div>
            {loading ? (
              <div className="text-center py-12 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                Caricamento...
              </div>
            ) : filteredScadenzeDocs.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-400" />
                <p className="text-lg font-semibold text-slate-700">Nessuna scadenza imminente</p>
                <p className="text-sm text-slate-500 mt-1">Tutti i documenti sono in regola! 🎉</p>
              </div>
            ) : (
              <DataTable 
                data={filteredScadenzeDocs} 
                columns={scadenzeColumns} 
                emptyMessage="Nessun documento trovato" 
                onRowClick={(doc) => router.push(`/document?id=${doc.id}&tid=${tenantId}`)}
              />
            )}
          </div>

          {/* Calendario collassabile */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
            <button
              onClick={() => setCalendarOpen(!calendarOpen)}
              className="w-full px-6 py-4 flex items-center justify-between bg-gradient-to-r from-teal-50 to-emerald-50 hover:from-teal-100 hover:to-emerald-100 transition-colors"
            >
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-teal-500" />
                Calendario Scadenze
              </h2>
              {calendarOpen ? (
                <ChevronUp className="w-5 h-5 text-slate-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-500" />
              )}
            </button>
            {calendarOpen && (
              <div className="p-6 border-t border-slate-100">
                <ExpiryCalendar 
                  documents={calendarDocs}
                  onDayClick={(date, docs) => {
                    if (docs.length === 1) {
                      router.push(`/document?id=${docs[0].id}&tid=${tenantId}`);
                    }
                  }}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* ==================== TAB DA VERIFICARE ==================== */}
      {activeTab === 'verifica' && (
        <>
          {/* Sub-tab Categoria */}
          <div className="flex gap-2 mb-6 p-1.5 bg-slate-100 rounded-2xl">
            {[
              { key: 'tutti' as CategoryFilter, label: 'Tutti', count: verificaCategoryCounts.tutti },
              { key: 'itp' as CategoryFilter, label: 'ITP', count: verificaCategoryCounts.itp },
              { key: 'cantieri' as CategoryFilter, label: 'Cantieri', count: verificaCategoryCounts.cantieri },
              { key: 'personale' as CategoryFilter, label: 'Personale', count: verificaCategoryCounts.personale },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setVerificaCategoryFilter(tab.key)}
                className={`
                  flex-1 px-6 py-3.5 font-semibold transition-all flex items-center justify-center gap-2 rounded-xl
                  ${verificaCategoryFilter === tab.key
                    ? 'bg-white text-sky-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                  }
                `}
              >
                {tab.label}
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  verificaCategoryFilter === tab.key ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Barra statistiche compatta + filtri */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-4 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Stats compatte cliccabili */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setVerificaStatusFilter('all')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                    verificaStatusFilter === 'all' ? 'bg-sky-100 text-sky-700' : 'hover:bg-slate-100'
                  }`}
                >
                  <ClipboardCheck className="w-4 h-4" />
                  <span className="text-sm">Totale:</span>
                  <span className="font-bold">{stats.totaleVerifica}</span>
                </button>
                <button
                  onClick={() => setVerificaStatusFilter('yellow')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                    verificaStatusFilter === 'yellow' ? 'bg-amber-100 text-amber-700' : 'hover:bg-slate-100'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm">Da rivedere:</span>
                  <span className="font-bold text-amber-600">{stats.totaleGialli}</span>
                </button>
                <button
                  onClick={() => setVerificaStatusFilter('red')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                    verificaStatusFilter === 'red' ? 'bg-red-100 text-red-700' : 'hover:bg-slate-100'
                  }`}
                >
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm">Non idonei:</span>
                  <span className="font-bold text-red-600">{stats.totaleRossi}</span>
                </button>
              </div>

              {/* Filtri */}
              <div className="flex items-center gap-3">
                {(isManagerOrVerifier || companyIds.length > 1) && (
                  <select
                    value={verificaCompanyFilter}
                    onChange={(e) => setVerificaCompanyFilter(e.target.value)}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="">Tutte le imprese</option>
                    {uniqueCompanies.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
                <select
                  value={verificaDocTypeFilter}
                  onChange={(e) => setVerificaDocTypeFilter(e.target.value)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">Tutti i tipi</option>
                  {uniqueDocTypes.map((dt) => (
                    <option key={dt} value={dt}>{dt}</option>
                  ))}
                </select>
                {(verificaCompanyFilter || verificaDocTypeFilter || verificaStatusFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setVerificaCompanyFilter('');
                      setVerificaDocTypeFilter('');
                      setVerificaStatusFilter('all');
                    }}
                    className="text-sm text-sky-600 hover:text-sky-700 font-medium"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Tabella documenti da verificare */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-blue-50">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-sky-500" />
                Documenti da Verificare
                <span className="ml-2 text-xs font-medium px-2 py-1 bg-sky-100 text-sky-700 rounded-full">
                  {filteredVerificaDocs.length} documenti
                </span>
              </h2>
            </div>
            {loading ? (
              <div className="text-center py-12 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                Caricamento...
              </div>
            ) : filteredVerificaDocs.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-400" />
                <p className="text-lg font-semibold text-slate-700">Tutto a posto!</p>
                <p className="text-sm text-slate-500 mt-1">Non ci sono documenti da verificare 🎉</p>
              </div>
            ) : (
              <DataTable 
                data={filteredVerificaDocs} 
                columns={verificaColumns} 
                emptyMessage="Nessun documento trovato" 
                onRowClick={(doc) => router.push(`/document?id=${doc.id}&tid=${tenantId}`)}
              />
            )}
          </div>

          {/* Legenda */}
          {stats.totaleVerifica > 0 && (
            <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-6 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="text-amber-500">🟡</span>
                  <span><strong>Da rivedere</strong>: L&apos;AI non è sicura</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-red-500">🔴</span>
                  <span><strong>Non idonei</strong>: Documento non conforme</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ==================== TAB NOTIFICHE ==================== */}
      {activeTab === 'notifiche' && (
        <div className="max-w-4xl">
          <NotificationList />
        </div>
      )}
    </div>
  );
}
