'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Filter, Clock, AlertCircle, Loader2, ClipboardCheck, 
  CheckCircle2, XCircle, FileSearch, Sparkles, Eye, Building2,
  AlertTriangle, Send
} from 'lucide-react';
import { TrafficLight } from '@/components/traffic-light';
import { useDocumentsCollectionGroup } from '@/hooks/useFirestore';
import { DataTable } from '@/components/data-table';
import { useAuth } from '@/hooks/useAuth';

export default function VerificaPage() {
  const router = useRouter();
  
  const { tenantId, role, loading: authLoading } = useAuth();
  
  // Filtri - di default mostra solo documenti che richiedono attenzione
  const [companyFilter, setCompanyFilter] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('needs_attention'); // Default: solo gialli/rossi
  const [onlyExpiring, setOnlyExpiring] = useState(false);

  // ✅ Manager/Verifier usano collectionGroup per vedere TUTTI i documenti del tenant
  const { documents, loading, error } = useDocumentsCollectionGroup(
    !authLoading && tenantId ? tenantId : '',
    undefined,
    { limit: 500 }
  );

  // Stats calcolate prima dei filtri
  const stats = useMemo(() => ({
    total: documents.length,
    pending: documents.filter(d => d.overall?.status === 'gray' || !d.overall?.status).length,
    toReview: documents.filter(d => d.overall?.status === 'yellow').length,
    invalid: documents.filter(d => d.overall?.status === 'red').length,
    valid: documents.filter(d => d.overall?.status === 'green').length,
  }), [documents]);

  // Filtra documenti per coda verifica
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      // Escludi documenti "non pertinente"
      if (doc.overall?.nonPertinente === true) return false;

      // Filtro azienda
      if (companyFilter && doc.companyId !== companyFilter) return false;

      // Filtro docType
      if (docTypeFilter && doc.docType !== docTypeFilter) return false;

      // Filtro status
      if (statusFilter) {
        const docStatus = doc.overall?.status || 'gray';
        if (statusFilter === 'needs_attention') {
          // Mostra solo gialli e rossi
          if (docStatus !== 'yellow' && docStatus !== 'red') return false;
        } else if (statusFilter === 'pending' && docStatus !== 'gray') {
          return false;
        } else if (statusFilter === 'to_review' && docStatus !== 'yellow') {
          return false;
        } else if (statusFilter === 'non_idoneo' && docStatus !== 'red') {
          return false;
        } else if (statusFilter === 'valid' && docStatus !== 'green') {
          return false;
        }
      }

      // Filtro "in scadenza ≤10 giorni"
      if (onlyExpiring) {
        const expiresAt = doc.extracted?.expiresAt || doc.expiresAt;
        if (!expiresAt) return false;
        const expDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
        const today = new Date();
        const diffDays = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 10 || diffDays < 0) return false;
      }

      return true;
    });
  }, [documents, companyFilter, docTypeFilter, statusFilter, onlyExpiring]);

  const uniqueCompanies = useMemo(() => 
    Array.from(new Set(documents.map((d) => d.companyId).filter(Boolean))),
    [documents]
  );
  
  const uniqueDocTypes = useMemo(() => 
    Array.from(new Set(documents.map((d) => d.docType).filter(Boolean))),
    [documents]
  );

  const columns = [
    {
      key: 'status',
      header: 'Stato',
      render: (doc: any) => <TrafficLight status={doc.overall?.status || 'gray'} />,
      className: 'w-20',
    },
    {
      key: 'docType',
      header: 'Tipo Documento',
      render: (doc: any) => (
        <span className="font-medium text-slate-800">{doc.docType || 'Sconosciuto'}</span>
      ),
    },
    {
      key: 'company',
      header: 'Azienda',
      render: (doc: any) => (
        <span className="text-sm text-slate-600">{doc.companyId || '-'}</span>
      ),
    },
    {
      key: 'reason',
      header: 'Motivo',
      render: (doc: any) => {
        const reason = doc.overall?.reason || doc.reason;
        if (!reason) return <span className="text-slate-400">-</span>;
        return (
          <span className="text-sm text-slate-600 line-clamp-2" title={reason}>
            {reason.length > 50 ? reason.substring(0, 50) + '...' : reason}
          </span>
        );
      },
    },
    {
      key: 'expiresAt',
      header: 'Scadenza',
      render: (doc: any) => {
        const expiresAt = doc.extracted?.expiresAt || doc.expiresAt;
        if (!expiresAt) return <span className="text-slate-400">-</span>;
        
        const expDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
        const today = new Date();
        const diffDays = Math.floor((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        let colorClass = 'text-slate-600';
        let badge = null;
        
        if (diffDays <= 10 && diffDays > 0) {
          colorClass = 'text-amber-600 font-medium';
          badge = (
            <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
              {diffDays}gg
            </span>
          );
        }
        if (diffDays <= 0) {
          colorClass = 'text-red-600 font-semibold';
          badge = (
            <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
              SCADUTO
            </span>
          );
        }

        return (
          <span className={colorClass}>
            {expDate.toLocaleDateString('it-IT')}
            {badge}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Azioni',
      render: (doc: any) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/document?id=${doc.id}&tid=${tenantId}`);
            }}
            className="px-3 py-1.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white text-xs rounded-lg hover:from-sky-600 hover:to-blue-700 transition-all shadow-sm font-medium flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            Dettaglio
          </button>
        </div>
      ),
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

  // Controllo accesso - solo Manager/Verifier
  if (role !== 'manager' && role !== 'verifier') {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-slate-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-400" />
          <p className="font-medium">Accesso non autorizzato</p>
          <p className="text-sm mt-1">Solo Manager e Verificatori possono accedere a questa pagina.</p>
        </div>
      </div>
    );
  }

  // Utente non autenticato
  if (!tenantId) {
    return (
      <div className="p-8">
        <div className="text-center py-12 text-slate-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-yellow-400" />
          <p>Sessione non valida. Effettua nuovamente il login.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-center text-slate-500">
          <Loader2 className="w-12 h-12 mx-auto mb-3 animate-spin text-sky-400" />
          <p>Caricamento coda verifica...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-red-100 flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Errore</h1>
          <p className="text-slate-600 mb-6">{String(error)}</p>
        </div>
      </div>
    );
  }

  const needsAttention = stats.toReview + stats.invalid;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/30">
              <ClipboardCheck className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-sky-500 to-blue-600">
                Coda Verifica
              </h1>
              <p className="text-slate-500 mt-1">
                Revisione manuale documenti • {needsAttention} richiedono attenzione
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-sky-50 rounded-xl border border-sky-200">
            <Sparkles className="w-4 h-4 text-sky-600" />
            <span className="text-sm font-medium text-sky-700">Coda HQ</span>
          </div>
        </div>
      </div>

      {/* Alert se ci sono documenti che richiedono attenzione */}
      {needsAttention > 0 && (
        <div className="mb-6 p-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border border-amber-200/50 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-semibold text-slate-800">
              {needsAttention} {needsAttention === 1 ? 'documento richiede' : 'documenti richiedono'} la tua attenzione
            </p>
            <p className="text-sm text-slate-600">
              {stats.toReview > 0 && <span className="text-amber-600">{stats.toReview} da rivedere</span>}
              {stats.toReview > 0 && stats.invalid > 0 && ' • '}
              {stats.invalid > 0 && <span className="text-red-600">{stats.invalid} non idonei</span>}
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <button 
          onClick={() => setStatusFilter('')}
          className={`stat-card stat-card-blue cursor-pointer transition-all ${statusFilter === '' ? 'ring-2 ring-blue-400 ring-offset-2' : 'opacity-80 hover:opacity-100'}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-blue-100">Totale</p>
              <p className="text-3xl font-extrabold mt-1">{stats.total}</p>
            </div>
            <FileSearch className="w-8 h-8 text-white/80" />
          </div>
        </button>

        <button 
          onClick={() => setStatusFilter('to_review')}
          className={`stat-card stat-card-amber cursor-pointer transition-all ${statusFilter === 'to_review' ? 'ring-2 ring-amber-400 ring-offset-2' : 'opacity-80 hover:opacity-100'}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-amber-100">Da Rivedere</p>
              <p className="text-3xl font-extrabold mt-1">{stats.toReview}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-white/80" />
          </div>
        </button>

        <button 
          onClick={() => setStatusFilter('non_idoneo')}
          className={`stat-card stat-card-red cursor-pointer transition-all ${statusFilter === 'non_idoneo' ? 'ring-2 ring-red-400 ring-offset-2' : 'opacity-80 hover:opacity-100'}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-red-100">Non Idonei</p>
              <p className="text-3xl font-extrabold mt-1">{stats.invalid}</p>
            </div>
            <XCircle className="w-8 h-8 text-white/80" />
          </div>
        </button>

        <button 
          onClick={() => setStatusFilter('valid')}
          className={`stat-card stat-card-green cursor-pointer transition-all ${statusFilter === 'valid' ? 'ring-2 ring-emerald-400 ring-offset-2' : 'opacity-80 hover:opacity-100'}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-green-100">Validi</p>
              <p className="text-3xl font-extrabold mt-1">{stats.valid}</p>
            </div>
            <CheckCircle2 className="w-8 h-8 text-white/80" />
          </div>
        </button>
      </div>

      {/* Filtri */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
              <Filter className="w-4 h-4 text-slate-600" />
            </div>
            <h3 className="font-semibold text-slate-800">Filtri</h3>
          </div>
          {(companyFilter || docTypeFilter || statusFilter !== 'needs_attention' || onlyExpiring) && (
            <button
              onClick={() => {
                setCompanyFilter('');
                setDocTypeFilter('');
                setStatusFilter('needs_attention');
                setOnlyExpiring(false);
              }}
              className="text-sm text-sky-600 hover:text-sky-700 font-medium"
            >
              Reset filtri
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Filtro Azienda */}
          <div>
            <label htmlFor="company-filter" className="block text-sm font-medium text-slate-600 mb-2">
              <Building2 className="w-4 h-4 inline mr-1" />
              Azienda
            </label>
            <select
              id="company-filter"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="input-modern"
            >
              <option value="">Tutte le aziende</option>
              {uniqueCompanies.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro DocType */}
          <div>
            <label htmlFor="doctype-filter" className="block text-sm font-medium text-slate-600 mb-2">
              <FileSearch className="w-4 h-4 inline mr-1" />
              Tipo Documento
            </label>
            <select
              id="doctype-filter"
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value)}
              className="input-modern"
            >
              <option value="">Tutti i tipi</option>
              {uniqueDocTypes.map((docType) => (
                <option key={docType} value={docType}>
                  {docType}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Status */}
          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-slate-600 mb-2">
              <CheckCircle2 className="w-4 h-4 inline mr-1" />
              Stato
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-modern"
            >
              <option value="needs_attention">⚠️ Richiedono attenzione</option>
              <option value="">📋 Tutti</option>
              <option value="pending">⏳ In elaborazione</option>
              <option value="to_review">🟡 Da rivedere</option>
              <option value="non_idoneo">🔴 Non idonei</option>
              <option value="valid">🟢 Validi</option>
            </select>
          </div>

          {/* Filtro Scadenza */}
          <div>
            <label htmlFor="expiring-filter" className="block text-sm font-medium text-slate-600 mb-2">
              <Clock className="w-4 h-4 inline mr-1" />
              Scadenze
            </label>
            <button
              onClick={() => setOnlyExpiring(!onlyExpiring)}
              className={`w-full px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                onlyExpiring
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25'
                  : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {onlyExpiring ? '✓ Solo ≤10 giorni' : 'Tutte le scadenze'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabella Documenti */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-blue-50">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-sky-500" />
            {statusFilter === 'needs_attention' ? 'Documenti che Richiedono Attenzione' : 'Documenti'}
            <span className="ml-2 text-xs font-medium px-2 py-1 bg-sky-100 text-sky-700 rounded-full">
              {filteredDocuments.length} risultati
            </span>
          </h2>
        </div>
        
        {filteredDocuments.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
            <p className="text-slate-600 font-semibold text-lg">
              {statusFilter === 'needs_attention' 
                ? 'Nessun documento richiede attenzione' 
                : 'Nessun documento trovato'}
            </p>
            <p className="text-sm text-slate-400 mt-2">
              {statusFilter === 'needs_attention' 
                ? 'Ottimo lavoro! Tutti i documenti sono in ordine 🎉' 
                : 'Prova a modificare i filtri'}
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredDocuments}
            emptyMessage="Nessun documento trovato"
            onRowClick={(doc) => router.push(`/document?id=${doc.id}&tid=${tenantId}`)}
          />
        )}
      </div>

      {/* Info Box */}
      <div className="mt-8 p-5 bg-gradient-to-r from-sky-500/10 via-blue-500/10 to-indigo-500/10 border border-sky-200/50 rounded-2xl backdrop-blur-sm">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
          <span className="text-xl">🔍</span>
          Come funziona la coda verifica
        </h3>
        <ul className="text-sm text-slate-700 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-sky-500 mt-0.5">•</span>
            Questa pagina mostra i documenti che richiedono <strong>revisione manuale</strong>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-sky-500 mt-0.5">•</span>
            I documenti <strong className="text-amber-600">gialli</strong> hanno bisogno di verifica (l&apos;AI non è sicura)
          </li>
          <li className="flex items-start gap-2">
            <span className="text-sky-500 mt-0.5">•</span>
            I documenti <strong className="text-red-600">rossi</strong> sono non conformi - l&apos;azienda deve caricare una nuova versione
          </li>
          <li className="flex items-start gap-2">
            <span className="text-sky-500 mt-0.5">•</span>
            Clicca su <strong>&quot;Dettaglio&quot;</strong> per vedere le motivazioni e applicare override se necessario
          </li>
        </ul>
      </div>
    </div>
  );
}
