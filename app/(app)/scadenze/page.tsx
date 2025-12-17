'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/data-table';
import { TrafficLight } from '@/components/traffic-light';
import { NotificationList } from '@/components/notification-list';
import { Bell, Calendar, AlertTriangle, Loader2, Building2, Clock, CheckCircle2, XCircle, FileWarning, Filter, ClipboardCheck, AlertCircle, Eye } from 'lucide-react';
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
  
  // 🆕 Filtri per tab "Scadenze"
  const [scadenzeCompanyFilter, setScadenzeCompanyFilter] = useState<string>('all');
  const [scadenzeCategoryFilter, setScadenzeCategoryFilter] = useState<CategoryFilter>('tutti');
  
  // Filtri per il tab "Da Verificare"
  const [verificaCompanyFilter, setVerificaCompanyFilter] = useState('');
  const [verificaDocTypeFilter, setVerificaDocTypeFilter] = useState('');
  const [verificaStatusFilter, setVerificaStatusFilter] = useState<'all' | 'yellow' | 'red'>('all');
  const [verificaCategoryFilter, setVerificaCategoryFilter] = useState<CategoryFilter>('tutti');

  // ✅ FIX: Ottieni tenantId, role e companyIds da auth hook (già stabile)
  const { tenantId, role, companyIds, loading: authLoading } = useAuth();

  // Determina il tipo di utente
  const isManagerOrVerifier = role === 'manager' || role === 'verifier';
  const tid = tenantId || '';

  // ✅ FIX QUERY: Usa hook diversi in base al ruolo
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

  // Seleziona i documenti in base al ruolo
  const rawDocs = isManagerOrVerifier ? managerDocs : uploaderDocs;
  const docsLoading = isManagerOrVerifier ? managerLoading : uploaderLoading;

  const loading = authLoading || docsLoading;

  // I documenti sono già filtrati dall'hook corretto
  const accessibleDocs = rawDocs;

  // Elabora i documenti separando SCADENZE da DA VERIFICARE (gialli + rossi)
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
      
      // Raccogli valori unici per filtri
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
        docCategory: doc.docCategory || undefined, // 🆕 Categoria documento
      };

      // ✅ Prima controlla le SCADENZE (anche se il documento è rosso per scadenza)
      // I documenti scaduti devono apparire nel tab Scadenze
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

      // DA VERIFICARE: documenti GIALLI e ROSSI (non gestiti come scadenze)
      if (mappedStatus === 'red') {
        totaleRossi++;
        daVerificare.push(item);
      } else if (mappedStatus === 'yellow') {
        totaleGialli++;
        daVerificare.push(item);
      }
    });

    // Ordina scadenze per data (prima i più urgenti)
    scadenze.sort((a, b) => {
      const dateA = a.expiresAt === 'N/D' ? Infinity : new Date(a.expiresAt.split('/').reverse().join('-')).getTime();
      const dateB = b.expiresAt === 'N/D' ? Infinity : new Date(b.expiresAt.split('/').reverse().join('-')).getTime();
      return dateA - dateB;
    });

    // Ordina da verificare: prima rossi, poi gialli
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

  // 🆕 Filtra documenti "Scadenze" in base ai filtri attivi
  const filteredScadenzeDocs = useMemo(() => {
    return scadenzeDocs.filter((doc) => {
      // Filtro impresa
      if (scadenzeCompanyFilter !== 'all' && doc.company !== scadenzeCompanyFilter) return false;
      // Filtro categoria
      if (scadenzeCategoryFilter !== 'tutti') {
        const docCat = doc.docCategory || '';
        if (scadenzeCategoryFilter === 'itp' && docCat !== 'itp') return false;
        if (scadenzeCategoryFilter === 'cantieri' && docCat !== 'cantiere') return false;
        if (scadenzeCategoryFilter === 'personale' && docCat !== 'personale') return false;
      }
      return true;
    });
  }, [scadenzeDocs, scadenzeCompanyFilter, scadenzeCategoryFilter]);

  // 🆕 Conteggi per sub-tab Scadenze
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

  // Filtra documenti "Da Verificare" in base ai filtri attivi
  const filteredVerificaDocs = useMemo(() => {
    return verificaDocs.filter((doc) => {
      if (verificaCompanyFilter && doc.company !== verificaCompanyFilter) return false;
      if (verificaDocTypeFilter && doc.docType !== verificaDocTypeFilter) return false;
      if (verificaStatusFilter !== 'all' && doc.status !== verificaStatusFilter) return false;
      // 🆕 Filtro categoria
      if (verificaCategoryFilter !== 'tutti') {
        const docCat = doc.docCategory || '';
        if (verificaCategoryFilter === 'itp' && docCat !== 'itp') return false;
        if (verificaCategoryFilter === 'cantieri' && docCat !== 'cantiere') return false;
        if (verificaCategoryFilter === 'personale' && docCat !== 'personale') return false;
      }
      return true;
    });
  }, [verificaDocs, verificaCompanyFilter, verificaDocTypeFilter, verificaStatusFilter, verificaCategoryFilter]);

  // 🆕 Conteggi per sub-tab Verifica
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
      key: 'source',
      header: 'Fonte',
      render: (doc: DocumentItem) => (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
          doc.source === 'direct' 
            ? 'bg-slate-100 text-slate-600' 
            : 'bg-purple-100 text-purple-700'
        }`}>
          {doc.source === 'direct' ? '📁' : '🤖'}
        </span>
      ),
      className: 'w-16',
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

  const verificaColumns = [
    {
      key: 'status',
      header: 'Stato',
      render: (doc: DocumentItem) => <TrafficLight status={doc.status} />,
      className: 'w-20',
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
      key: 'confidence',
      header: 'Affidabilità',
      render: (doc: DocumentItem) => {
        const pct = Math.round(doc.confidence * 100);
        const colorClass = pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600';
        return <span className={`text-sm font-medium ${colorClass}`}>{pct}%</span>;
      },
    },
    {
      key: 'source',
      header: 'Fonte',
      render: (doc: DocumentItem) => (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
          doc.source === 'direct' 
            ? 'bg-slate-100 text-slate-600' 
            : 'bg-purple-100 text-purple-700'
        }`}>
          {doc.source === 'direct' ? '📁' : '🤖'}
        </span>
      ),
      className: 'w-16',
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

  // Loading state durante autenticazione
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

  // Utente non autenticato
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
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
              <Calendar className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-extrabold text-gradient-warm">
                  Scadenze e Notifiche
                </h1>
                {/* ✅ Badge azienda per Uploader con singola impresa */}
                {role === 'uploader' && companyIds.length === 1 && (
                  <span className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full text-sm font-semibold shadow-sm">
                    {companyIds[0]}
                  </span>
                )}
              </div>
              <p className="text-slate-500 mt-1">Documenti in scadenza nei prossimi 30 giorni e problemi da risolvere</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-xl border border-amber-200">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-700">Monitoraggio</span>
          </div>
        </div>
      </div>

      {/* TAB NAVIGATION - Modern design */}
      <div className="flex gap-2 mb-8 p-1.5 bg-slate-100 rounded-2xl w-fit">
        {/* Tab Scadenze */}
        <button
          onClick={() => setActiveTab('scadenze')}
          className={`
            px-6 py-3 font-semibold transition-all flex items-center gap-2 rounded-xl
            ${activeTab === 'scadenze'
              ? 'bg-white text-amber-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <Calendar className="w-4 h-4" />
          Scadenze
          {(stats.scaduti + stats.inScadenza) > 0 && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
              stats.scaduti > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
            }`}>
              {stats.scaduti + stats.inScadenza}
            </span>
          )}
        </button>

        {/* Tab Da Verificare (ex Problemi) */}
        <button
          onClick={() => setActiveTab('verifica')}
          className={`
            px-6 py-3 font-semibold transition-all flex items-center gap-2 rounded-xl
            ${activeTab === 'verifica'
              ? 'bg-white text-sky-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <ClipboardCheck className="w-4 h-4" />
          Da Verificare
          {stats.totaleVerifica > 0 && (
            <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
              stats.totaleRossi > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
            }`}>
              {stats.totaleVerifica}
            </span>
          )}
        </button>

        {/* Tab Notifiche */}
        <button
          onClick={() => setActiveTab('notifiche')}
          className={`
            px-6 py-3 font-semibold transition-all flex items-center gap-2 rounded-xl
            ${activeTab === 'notifiche'
              ? 'bg-white text-teal-600 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
            }
          `}
        >
          <Bell className="w-4 h-4" />
          Notifiche
        </button>
      </div>

      {/* ==================== TAB SCADENZE ==================== */}
      {activeTab === 'scadenze' && (
        <div className="space-y-8">
          {/* 🆕 Filtri: Impresa + Categoria */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Filtro Impresa - ✅ FIX: Nascosto se Uploader ha una sola azienda */}
              {(isManagerOrVerifier || companyIds.length > 1) && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Filter className="w-4 h-4" />
                    <span className="text-sm font-medium">Impresa:</span>
                  </div>
                  <select
                    value={scadenzeCompanyFilter}
                    onChange={(e) => setScadenzeCompanyFilter(e.target.value)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent min-w-[180px]"
                  >
                    <option value="all">Tutte le imprese</option>
                    {uniqueCompanies.map((company) => (
                      <option key={company} value={company}>{company}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Info box compatto */}
              <div className="flex items-center gap-2 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg text-xs">
                <Calendar className="w-4 h-4" />
                Documenti con scadenza nei prossimi 30 giorni
              </div>
            </div>

            {/* 🆕 Sub-tab Categoria */}
            <div className="flex gap-2 mt-4 p-1 bg-slate-100 rounded-xl">
              {[
                { key: 'tutti' as CategoryFilter, label: 'Tutti', count: scadenzeCategoryCounts.tutti },
                { key: 'itp' as CategoryFilter, label: 'ITP', count: scadenzeCategoryCounts.itp },
                { key: 'cantieri' as CategoryFilter, label: 'Cantieri', count: scadenzeCategoryCounts.cantieri },
                { key: 'personale' as CategoryFilter, label: 'Personale', count: scadenzeCategoryCounts.personale },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setScadenzeCategoryFilter(tab.key)}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                    scadenzeCategoryFilter === tab.key
                      ? 'bg-white text-amber-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    scadenzeCategoryFilter === tab.key ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Card statistiche scadenze - Modern gradient cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="stat-card stat-card-red">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-100">Scaduti</p>
                  <p className="text-4xl font-extrabold mt-2">{loading ? '...' : stats.scaduti}</p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                  <XCircle className="w-7 h-7 text-white" />
                </div>
              </div>
              <p className="text-sm text-red-100 mt-4">Richiedono azione immediata</p>
            </div>

            <div className="stat-card stat-card-amber">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-100">In Scadenza</p>
                  <p className="text-4xl font-extrabold mt-2">{loading ? '...' : stats.inScadenza}</p>
                </div>
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                  <Clock className="w-7 h-7 text-white" />
                </div>
              </div>
              <p className="text-sm text-amber-100 mt-4">Entro 10 giorni</p>
            </div>

            <div className="stat-card stat-card-green">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-100">In Regola</p>
                  <p className="text-4xl font-extrabold mt-2">{loading ? '...' : stats.validi}</p>
              </div>
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-white" />
            </div>
              </div>
              <p className="text-sm text-green-100 mt-4">Documenti validi</p>
            </div>
          </div>

          {/* Tabella scadenze */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-500" />
                Prossime Scadenze
              </h2>
            </div>
            {loading ? (
              <div className="text-center py-8 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                Caricamento...
              </div>
            ) : (
              <DataTable 
                data={filteredScadenzeDocs} 
                columns={scadenzeColumns} 
                emptyMessage="🎉 Nessuna scadenza imminente per questa selezione" 
                onRowClick={(doc) => router.push(`/document?id=${doc.id}&tid=${tenantId}`)}
              />
            )}
          </div>

          {/* Calendario scadenze */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 to-emerald-50">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-teal-500" />
                Calendario Scadenze
              </h2>
            </div>
            <div className="p-6">
            <ExpiryCalendar 
              documents={calendarDocs}
              onDayClick={(date, docs) => {
                if (docs.length === 1) {
                  router.push(`/document?id=${docs[0].id}&tid=${tenantId}`);
                }
              }}
            />
          </div>
          </div>
        </div>
      )}

      {/* ==================== TAB DA VERIFICARE ==================== */}
      {activeTab === 'verifica' && (
        <div className="space-y-6">
          {/* Statistiche cliccabili */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => setVerificaStatusFilter('all')}
              className={`stat-card stat-card-blue cursor-pointer transition-all ${
                verificaStatusFilter === 'all' ? 'ring-2 ring-blue-400 ring-offset-2' : 'opacity-80 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-100">Totale</p>
                  <p className="text-3xl font-extrabold mt-1">{stats.totaleVerifica}</p>
                </div>
                <ClipboardCheck className="w-8 h-8 text-white/80" />
              </div>
            </button>

            <button
              onClick={() => setVerificaStatusFilter('yellow')}
              className={`stat-card stat-card-amber cursor-pointer transition-all ${
                verificaStatusFilter === 'yellow' ? 'ring-2 ring-amber-400 ring-offset-2' : 'opacity-80 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-100">Da Rivedere</p>
                  <p className="text-3xl font-extrabold mt-1">{stats.totaleGialli}</p>
                </div>
                <AlertCircle className="w-8 h-8 text-white/80" />
              </div>
              <p className="text-xs text-amber-100 mt-2">L'AI non è sicura</p>
            </button>

            <button
              onClick={() => setVerificaStatusFilter('red')}
              className={`stat-card stat-card-red cursor-pointer transition-all ${
                verificaStatusFilter === 'red' ? 'ring-2 ring-red-400 ring-offset-2' : 'opacity-80 hover:opacity-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-100">Non Idonei</p>
                  <p className="text-3xl font-extrabold mt-1">{stats.totaleRossi}</p>
                </div>
                <XCircle className="w-8 h-8 text-white/80" />
              </div>
              <p className="text-xs text-red-100 mt-2">Richiedono nuova versione</p>
            </button>
          </div>

          {/* Filtri */}
          {stats.totaleVerifica > 0 && (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-600" />
                  <h3 className="font-semibold text-slate-800">Filtri</h3>
                </div>
                {(verificaCompanyFilter || verificaDocTypeFilter || verificaStatusFilter !== 'all' || verificaCategoryFilter !== 'tutti') && (
                  <button
                    onClick={() => {
                      setVerificaCompanyFilter('');
                      setVerificaDocTypeFilter('');
                      setVerificaStatusFilter('all');
                      setVerificaCategoryFilter('tutti');
                    }}
                    className="text-sm text-sky-600 hover:text-sky-700 font-medium"
                  >
                    Reset filtri
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* ✅ FIX: Nasconde filtro impresa se Uploader ha una sola azienda */}
                {(isManagerOrVerifier || companyIds.length > 1) && (
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-2">Impresa</label>
                    <select
                      value={verificaCompanyFilter}
                      onChange={(e) => setVerificaCompanyFilter(e.target.value)}
                      className="input-modern"
                    >
                      <option value="">Tutte le imprese</option>
                      {uniqueCompanies.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">Tipo Documento</label>
                  <select
                    value={verificaDocTypeFilter}
                    onChange={(e) => setVerificaDocTypeFilter(e.target.value)}
                    className="input-modern"
                  >
                    <option value="">Tutti i tipi</option>
                    {uniqueDocTypes.map((dt) => (
                      <option key={dt} value={dt}>{dt}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">Stato</label>
                  <select
                    value={verificaStatusFilter}
                    onChange={(e) => setVerificaStatusFilter(e.target.value as 'all' | 'yellow' | 'red')}
                    className="input-modern"
                  >
                    <option value="all">Tutti</option>
                    <option value="yellow">🟡 Da rivedere</option>
                    <option value="red">🔴 Non idonei</option>
                  </select>
                </div>
              </div>

              {/* 🆕 Sub-tab Categoria */}
              <div className="flex gap-2 mt-5 p-1 bg-slate-100 rounded-xl">
                {[
                  { key: 'tutti' as CategoryFilter, label: 'Tutti', count: verificaCategoryCounts.tutti },
                  { key: 'itp' as CategoryFilter, label: 'ITP', count: verificaCategoryCounts.itp },
                  { key: 'cantieri' as CategoryFilter, label: 'Cantieri', count: verificaCategoryCounts.cantieri },
                  { key: 'personale' as CategoryFilter, label: 'Personale', count: verificaCategoryCounts.personale },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setVerificaCategoryFilter(tab.key)}
                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${
                      verificaCategoryFilter === tab.key
                        ? 'bg-white text-sky-600 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      verificaCategoryFilter === tab.key ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-500'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tabella documenti da verificare */}
          {stats.totaleVerifica > 0 ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-blue-50">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-sky-500" />
                  Documenti da Verificare
                  <span className="ml-2 text-xs font-medium px-2 py-1 bg-sky-100 text-sky-700 rounded-full">
                    {filteredVerificaDocs.length} risultati
                  </span>
                </h2>
              </div>
              <DataTable 
                data={filteredVerificaDocs} 
                columns={verificaColumns} 
                emptyMessage="Nessun documento corrisponde ai filtri selezionati" 
                onRowClick={(doc) => router.push(`/document?id=${doc.id}&tid=${tenantId}`)}
              />
            </div>
          ) : (
            <div className="stat-card stat-card-green text-center py-10">
              <CheckCircle2 className="w-16 h-16 mx-auto mb-4 opacity-80" />
              <h3 className="text-2xl font-bold">Tutto a posto!</h3>
              <p className="text-green-100 mt-2">
                Non ci sono documenti da verificare al momento.
              </p>
            </div>
          )}

          {/* Guida */}
          {stats.totaleVerifica > 0 && (
            <div className="bg-gradient-to-r from-sky-500/10 via-blue-500/10 to-indigo-500/10 border border-sky-200/50 rounded-2xl p-6 backdrop-blur-sm">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <span className="text-xl">💡</span>
                Come funziona
              </h3>
              <ul className="text-sm text-slate-700 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">🟡</span>
                  <span><strong>Da rivedere</strong>: L'AI non è sicura della validità. Clicca per verificare manualmente.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">🔴</span>
                  <span><strong>Non idonei</strong>: Il documento non è conforme. L'impresa deve caricare una nuova versione.</span>
                </li>
              </ul>
            </div>
          )}
        </div>
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
