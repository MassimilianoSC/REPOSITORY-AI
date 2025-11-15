'use client';

import { useState } from 'react';
import { FileText, CheckCircle2, Clock, XCircle, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface ChecklistItem {
  docType: string;
  displayName: string;
  requiredForAll: boolean;
  checks: string[];
  normativeReferences: string[];
  status: 'missing' | 'in_review' | 'valid' | 'expired' | 'invalid';
  expiresInDays?: number;
}

interface DocumentChecklistProps {
  items: ChecklistItem[];
  onSelectDocType: (docType: string) => void;
}

export function DocumentChecklist({ items, onSelectDocType }: DocumentChecklistProps) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const getStatusIcon = (status: ChecklistItem['status']) => {
    switch (status) {
      case 'valid':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'in_review':
        return <Clock className="w-5 h-5 text-blue-600" />;
      case 'expired':
      case 'invalid':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'missing':
      default:
        return <HelpCircle className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusText = (status: ChecklistItem['status'], expiresInDays?: number) => {
    switch (status) {
      case 'valid':
        return expiresInDays !== undefined && expiresInDays <= 10
          ? <span className="text-orange-600 font-medium">In scadenza ({expiresInDays} giorni)</span>
          : <span className="text-green-600">Idoneo</span>;
      case 'in_review':
        return <span className="text-blue-600">In elaborazione</span>;
      case 'expired':
        return <span className="text-red-600">Scaduto</span>;
      case 'invalid':
        return <span className="text-red-600">Non idoneo</span>;
      case 'missing':
      default:
        return <span className="text-slate-500">Mancante</span>;
    }
  };

  return (
    <div className="space-y-3">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-700 mb-1">Documenti Richiesti</h3>
        <p className="text-xs text-slate-600">
          Clicca su un documento per caricarlo. I tooltip mostrano cosa verrà controllato.
        </p>
      </div>

      {items.map((item) => (
        <div
          key={item.docType}
          className="border border-slate-200 rounded-lg bg-white hover:shadow-sm transition-shadow"
        >
          <div className="flex items-start gap-3 p-4">
            {/* Icon */}
            <div className="mt-0.5">
              {getStatusIcon(item.status)}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-slate-900">
                    {item.displayName}
                    {item.requiredForAll && (
                      <span className="ml-2 text-xs text-red-600">*</span>
                    )}
                  </h4>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {getStatusText(item.status, item.expiresInDays)}
                  </div>
                </div>

                <button
                  onClick={() => setExpandedItem(expandedItem === item.docType ? null : item.docType)}
                  className="p-1 hover:bg-slate-100 rounded transition-colors"
                  title="Mostra dettagli"
                >
                  {expandedItem === item.docType ? (
                    <ChevronUp className="w-4 h-4 text-slate-600" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-600" />
                  )}
                </button>
              </div>

              {/* Expanded details */}
              {expandedItem === item.docType && (
                <div className="mt-3 p-3 bg-slate-50 rounded-lg text-xs space-y-2">
                  {/* Cosa controlliamo */}
                  {item.checks.length > 0 && (
                    <div>
                      <p className="font-medium text-slate-700 mb-1">📋 Cosa controlliamo:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                        {item.checks.slice(0, 3).map((check, idx) => (
                          <li key={idx}>{check}</li>
                        ))}
                        {item.checks.length > 3 && (
                          <li className="text-slate-500">+ altri {item.checks.length - 3} controlli</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {/* Riferimenti normativi */}
                  {item.normativeReferences.length > 0 && (
                    <div>
                      <p className="font-medium text-slate-700 mb-1">📚 Riferimenti normativi:</p>
                      <p className="text-slate-600">{item.normativeReferences.join(', ')}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action button */}
            <button
              onClick={() => onSelectDocType(item.docType)}
              disabled={item.status === 'in_review'}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                item.status === 'missing' || item.status === 'expired' || item.status === 'invalid'
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : item.status === 'in_review'
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              <FileText className="w-3 h-3 inline mr-1" />
              {item.status === 'missing' && 'Carica'}
              {item.status === 'in_review' && 'Elaborazione...'}
              {item.status === 'valid' && 'Aggiorna'}
              {(item.status === 'expired' || item.status === 'invalid') && 'Sostituisci'}
            </button>
          </div>
        </div>
      ))}

      <p className="text-xs text-slate-500 italic mt-4">
        * Documenti obbligatori per tutte le aziende
      </p>
    </div>
  );
}

