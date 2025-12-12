'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PipelineStep {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  details?: string;
  timestamp?: string;
}

interface UploadTimelineProps {
  steps: PipelineStep[];
  className?: string;
}

export function UploadTimeline({ steps, className }: UploadTimelineProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);

  useEffect(() => {
    const lastCompletedIndex = steps.findLastIndex(
      (s) => s.status === 'completed' || s.status === 'in_progress'
    );
    setCurrentStepIndex(lastCompletedIndex);
  }, [steps]);

  return (
    <div className={cn('space-y-4', className)}>
      {steps.map((step, index) => {
        const isActive = index === currentStepIndex;
        const isCompleted = step.status === 'completed';
        const isError = step.status === 'error';
        const isInProgress = step.status === 'in_progress';

        return (
          <div
            key={step.id}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg transition-all',
              isActive && 'bg-blue-50 border border-blue-200',
              isCompleted && !isActive && 'opacity-60'
            )}
          >
            <div className="flex-shrink-0 mt-0.5">
              {isInProgress && (
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              )}
              {isCompleted && (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              )}
              {isError && (
                <AlertCircle className="w-5 h-5 text-red-500" />
              )}
              {step.status === 'pending' && (
                <Circle className="w-5 h-5 text-gray-300" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p
                  className={cn(
                    'font-medium text-sm',
                    isCompleted && 'text-green-700',
                    isInProgress && 'text-blue-700',
                    isError && 'text-red-700',
                    step.status === 'pending' && 'text-gray-500'
                  )}
                >
                  {step.label}
                </p>
                {step.timestamp && (
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {step.timestamp}
                  </span>
                )}
              </div>

              {step.details && (
                <p className="text-xs text-gray-600 mt-1">{step.details}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Hook to track document processing pipeline
 * Label user-friendly per utenti non tecnici
 */
export function useDocumentPipeline(documentData: any) {
  const [steps, setSteps] = useState<PipelineStep[]>([
    { id: 'upload', label: '📄 Documento ricevuto', status: 'pending' },
    { id: 'probe', label: '🔍 Lettura del documento', status: 'pending' },
    { id: 'ocr', label: '📝 Riconoscimento testo', status: 'pending' },
    { id: 'rag', label: '📋 Ricerca requisiti applicabili', status: 'pending' },
    { id: 'vertex', label: '🤖 Verifica automatica con IA', status: 'pending' },
    { id: 'rules', label: '✅ Controlli di conformità', status: 'pending' },
    { id: 'write', label: '💾 Salvataggio esito', status: 'pending' },
  ]);

  useEffect(() => {
    if (!documentData) return;

    setSteps((prev) => {
      const newSteps = [...prev];

      // FIX TIMELINE: Usa pipelineStage invece di pipeline.* (nuovo formato backend)
      const stage = documentData.pipelineStage || 'gating';

      // Mappatura tipi documento per label user-friendly
      const docTypeLabels: Record<string, string> = {
        'DURC': 'DURC',
        'visura_camerale': 'Visura Camerale',
        'polizza_rc': 'Polizza RC',
        'certificazione_iso': 'Certificazione ISO',
        'documento_identita': 'Documento d\'identità',
        'patentino': 'Patentino/Abilitazione',
        'attestato_formazione': 'Attestato di Formazione',
        'idoneita_sanitaria': 'Idoneità Sanitaria',
      };

      // Upload completed (se esiste blobName il file è stato ricevuto)
      if (documentData.blobName || documentData.id) {
        const docTypeLabel = documentData.docType 
          ? (docTypeLabels[documentData.docType] || documentData.docType.replace(/_/g, ' '))
          : null;
        newSteps[0] = {
          ...newSteps[0],
          status: 'completed',
          details: docTypeLabel ? `Tipo rilevato: ${docTypeLabel}` : 'File caricato correttamente',
        };
      }

      // Probe (pdf.js) - completato se stage >= 'ocr' o 'rag'
      if (stage === 'ocr' || stage === 'rag' || stage === 'vertex' || stage === 'done') {
        newSteps[1] = {
          ...newSteps[1],
          status: 'completed',
          details: 'Contenuto del documento acquisito',
        };
      } else if (stage === 'gating') {
        newSteps[1] = {
          ...newSteps[1],
          status: 'in_progress',
          details: 'Analisi in corso...',
        };
      }

      // OCR
      if (documentData.ocrDone !== undefined) {
        if (documentData.ocrUsed || documentData.ocrDone) {
          newSteps[2] = {
            ...newSteps[2],
            status: 'completed',
            details: 'Testo estratto da scansione/immagine',
          };
        } else {
          newSteps[2] = {
            ...newSteps[2],
            status: 'completed',
            details: 'Documento già leggibile ✓',
          };
        }
      } else if (stage === 'ocr') {
        newSteps[2] = {
          ...newSteps[2],
          status: 'in_progress',
          details: 'Estrazione testo in corso...',
        };
      }

      // RAG
      if (documentData.ragHits !== undefined) {
        const hits = documentData.ragHits || 0;
        newSteps[3] = {
          ...newSteps[3],
          status: 'completed',
          details: hits > 0 
            ? `Trovate ${hits} regole da verificare` 
            : 'Nessun requisito specifico richiesto',
        };
      } else if (stage === 'rag') {
        newSteps[3] = {
          ...newSteps[3],
          status: 'in_progress',
          details: 'Ricerca requisiti in corso...',
        };
      }

      // Vertex (AI)
      if (documentData.validation || stage === 'done') {
        newSteps[4] = {
          ...newSteps[4],
          status: 'completed',
          details: 'Analisi intelligenza artificiale completata',
        };
      } else if (stage === 'vertex') {
        newSteps[4] = {
          ...newSteps[4],
          status: 'in_progress',
          details: 'Verifica contenuto in corso...',
        };
      }

      // Rules
      if (documentData.checks && documentData.checks.length > 0) {
        const passedChecks = documentData.checks.filter((c: any) => c.passed).length;
        const totalChecks = documentData.checks.length;
        const allPassed = passedChecks === totalChecks;
        newSteps[5] = {
          ...newSteps[5],
          status: 'completed',
          details: allPassed 
            ? `Tutti i ${totalChecks} controlli superati ✓`
            : `${passedChecks} su ${totalChecks} controlli superati`,
        };
      }

      // Write
      if (documentData.status || stage === 'done') {
        const statusLabels: Record<string, string> = {
          green: '✓ Documento idoneo',
          yellow: '⚠ Documento in scadenza',
          red: '✗ Documento non idoneo',
          gray: '— Verifica non applicabile',
          na: '— Verifica non applicabile',
          idoneo: '✓ Documento idoneo',
          non_idoneo: '✗ Documento non idoneo',
          needs_review: '⚠ Richiede verifica manuale',
        };
        const status = documentData.status || documentData.overall?.status || 'na';
        newSteps[6] = {
          ...newSteps[6],
          status: 'completed',
          details: statusLabels[status] || 'Elaborazione completata',
        };
      }

      // Check for errors - messaggi user-friendly
      if (documentData.status === 'error' || documentData.error) {
        const errorStepIndex = newSteps.findIndex((s) => s.status === 'pending' || s.status === 'in_progress');
        if (errorStepIndex !== -1) {
          // Traduci errori tecnici in messaggi comprensibili
          let errorMessage = documentData.error || 'Si è verificato un problema';
          if (errorMessage.includes('timeout')) {
            errorMessage = 'Il documento è troppo grande o complesso. Riprova.';
          } else if (errorMessage.includes('permission') || errorMessage.includes('auth')) {
            errorMessage = 'Errore di autorizzazione. Riprova o contatta il supporto.';
          } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
            errorMessage = 'Problema di connessione. Verifica la rete e riprova.';
          } else if (errorMessage.includes('invalid') || errorMessage.includes('corrupt')) {
            errorMessage = 'Il file potrebbe essere danneggiato. Prova con un altro file.';
          }
          
          newSteps[errorStepIndex] = {
            ...newSteps[errorStepIndex],
            status: 'error',
            details: errorMessage,
          };
        }
      }

      return newSteps;
    });
  }, [documentData]);

  return steps;
}

