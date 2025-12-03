'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Filter, Clock, AlertCircle, Loader2, ClipboardCheck, 
  CheckCircle2, XCircle, FileSearch, Sparkles, Eye, Building2
} from 'lucide-react';
import { TrafficLight } from '@/components/traffic-light';
import { useMultiCompanyDocuments } from '@/hooks/useFirestore';
import { DataTable } from '@/components/data-table';
import { useAuth } from '@/hooks/useAuth';

export default function VerificaPage() {
  const router = useRouter();
  
  // ✅ FIX: Usa hook useAuth per ottenere tenant e aziende dall'utente autenticato
  const { tenantId: tenant, companyIds, loading: authLoading } = useAuth();
  
  // Le aziende vengono dai claims dell'utente (o fallback per retrocompatibilità)
  const companies = companyIds.length > 0 ? companyIds : ['acme', 'beta', 'gamma'];

  // Filtri
  const [companyFilter, setCompanyFilter] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [onlyExpiring, setOnlyExpiring] = useState(false);

  // Carica tutti i documenti
  const { documents, loading, error } = useMultiCompanyDocuments(tenant || '', companies);

  // Filtra documenti per coda verifica
  const filteredDocuments = documents.filter((doc) => {
    // Escludi documenti "non pertinente"
    if (doc.overall?.nonPertinente === true) return false;

    // Filtro azienda
    if (companyFilter && doc.company !== companyFilter) return false;

    // Filtro docType
    if (docTypeFilter && doc.docType !== docTypeFilter) return false;

    // Filtro status
    if (statusFilter) {
      if (statusFilter === 'pending' && doc.overall?.status !== 'gray') return false;
      if (statusFilter === 'to_review' && doc.overall?.status !== 'yellow') return false;
      if (statusFilter === 'non_idoneo' && doc.overall?.status !== 'red') return false;
    }

    // Filtro "in scadenza ≤10 giorni"
    if (onlyExpiring) {
      if (!doc.extracted?.expiresAt) return false;
      const expiresAt = new Date(doc.extracted.expiresAt);
      const today = new Date();
      const diffDays = Math.floor((expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 10 || diffDays < 0) return false;
    }

    return true;
  });

  const uniqueCompanies = Array.from(new Set(documents.map((d) => d.company)));
  const uniqueDocTypes = Array.from(new Set(documents.map((d) => d.docType)));

  // Stats
  const stats = {
    total: documents.length,
    pending: documents.filter(d => d.overall?.status === 'gray').length,
    toReview: documents.filter(d => d.overall?.status === 'yellow').length,
    invalid: documents.filter(d => d.overall?.status === 'red').length,
  };

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
        <span className="font-medium text-slate-800">{doc.docType}</span>
      ),
    },
    {
      key: 'company',
      header: 'Azienda',
      render: (doc: any) => (
        <span className="text-sm text-slate-600">{doc.company}</span>
      ),
    },
    {
      key: 'uploadedAt',
      header: 'Caricato il',
      render: (doc: any) => {
        if (!doc.metadata?.uploadedAt) return <span className="text-slate-400">-</span>;
        const date = new Date(doc.metadata.uploadedAt);
        return <span className="text-sm text-slate-600">{date.toLocaleDateString('it-IT')}</span>;
      },
    },
    {
      key: 'expiresAt',
      header: 'Scadenza',
      render: (doc: any) => {
        if (!doc.extracted?.expiresAt) return <span className="text-slate-400">-</span>;
        const expiresAt = new Date(doc.extracted.expiresAt);
        const today = new Date();
        const diffDays = Math.floor((expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        let colorClass = 'text-slate-600';
        let badge = null;
        
        if (diffDays <= 10 && diffDays > 0) {
          colorClass = 'text-amber-600 font-medium';
          badge = (
            <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
              <Clock className="w-3 h-3 inline mr-1" />{diffDays}gg
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
            {expiresAt.toLocaleDateString('it-IT')}
            {badge}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Azioni',
      render: (doc: any) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/document/${doc.id}`);
          }}
          className="px-4 py-2 bg-gradient-to-r from-sky-500 to-blue-600 text-white text-sm rounded-xl hover:from-sky-600 hover:to-blue-700 transition-all shadow-sm shadow-sky-500/25 font-medium flex items-center gap-2"
        >
          <Eye className="w-4 h-4" />
          Verifica
        </button>
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

  // Utente non autenticato
  if (!tenant) {
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
                {filteredDocuments.length} documenti da verificare
                {onlyExpiring && ' (in scadenza ≤10 giorni)'}
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-sky-50 rounded-xl border border-sky-200">
            <Sparkles className="w-4 h-4 text-sky-600" />
            <span className="text-sm font-medium text-sky-700">Controllo QA</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="stat-card stat-card-blue">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-100">Totale</p>
              <p className="text-4xl font-extrabold mt-2">{stats.total}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <FileSearch className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>

        <div className="stat-card" style={{background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)', color: 'white'}}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-80">In Attesa</p>
              <p className="text-4xl font-extrabold mt-2">{stats.pending}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <Clock className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>

        <div className="stat-card stat-card-amber">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-100">Da Rivedere</p>
              <p className="text-4xl font-extrabold mt-2">{stats.toReview}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>

        <div className="stat-card stat-card-red">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-100">Non Idonei</p>
              <p className="text-4xl font-extrabold mt-2">{stats.invalid}</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <XCircle className="w-7 h-7 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Filtri */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-200/50 p-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
            <Filter className="w-4 h-4 text-slate-600" />
          </div>
          <h3 className="font-semibold text-slate-800">Filtri</h3>
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
              <option value="">Tutte</option>
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
              <option value="">Tutti</option>
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
              <option value="">Tutti</option>
              <option value="pending">⏳ In attesa (grigio)</option>
              <option value="to_review">⚠️ Da rivedere (giallo)</option>
              <option value="non_idoneo">❌ Non idoneo (rosso)</option>
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
            Documenti da Verificare
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
            <p className="text-slate-600 font-semibold text-lg">Nessun documento in coda</p>
            <p className="text-sm text-slate-400 mt-2">
              Tutti i documenti sono stati verificati! 🎉
            </p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredDocuments}
            emptyMessage="Nessun documento in coda"
            onRowClick={(doc) => router.push(`/document/${doc.id}`)}
          />
        )}
      </div>

      {/* Info Box */}
      <div className="mt-8 p-5 bg-gradient-to-r from-sky-500/10 via-blue-500/10 to-indigo-500/10 border border-sky-200/50 rounded-2xl backdrop-blur-sm">
        <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
          <span className="text-xl">🔍</span>
          Come funziona la verifica
        </h3>
        <ul className="text-sm text-slate-700 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-sky-500 mt-0.5">•</span>
            I documenti <strong className="text-slate-500">grigi</strong> sono in attesa di elaborazione AI
          </li>
          <li className="flex items-start gap-2">
            <span className="text-sky-500 mt-0.5">•</span>
            I documenti <strong className="text-amber-600">gialli</strong> richiedono una revisione manuale
          </li>
          <li className="flex items-start gap-2">
            <span className="text-sky-500 mt-0.5">•</span>
            I documenti <strong className="text-red-600">rossi</strong> non sono conformi e necessitano sostituzione
          </li>
          <li className="flex items-start gap-2">
            <span className="text-sky-500 mt-0.5">•</span>
            Clicca su &quot;Verifica&quot; per vedere i dettagli e le motivazioni
          </li>
        </ul>
      </div>
    </div>
  );
}
