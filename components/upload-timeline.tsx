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
 */
export function useDocumentPipeline(documentData: any) {
  const [steps, setSteps] = useState<PipelineStep[]>([
    { id: 'upload', label: 'File ricevuto', status: 'pending' },
    { id: 'probe', label: 'Analisi testo (pdf.js)', status: 'pending' },
    { id: 'ocr', label: 'OCR Document AI', status: 'pending' },
    { id: 'rag', label: 'Recupero regole (RAG)', status: 'pending' },
    { id: 'vertex', label: 'Validazione Vertex AI', status: 'pending' },
    { id: 'rules', label: 'Regole deterministiche', status: 'pending' },
    { id: 'write', label: 'Salvataggio risultati', status: 'pending' },
  ]);

  useEffect(() => {
    if (!documentData) return;

    setSteps((prev) => {
      const newSteps = [...prev];

      // FIX TIMELINE: Usa pipelineStage invece di pipeline.* (nuovo formato backend)
      const stage = documentData.pipelineStage || 'gating';

      // Upload completed (se esiste blobName il file è stato ricevuto)
      if (documentData.blobName || documentData.id) {
        newSteps[0] = {
          ...newSteps[0],
          status: 'completed',
          details: documentData.docType ? `Tipo: ${documentData.docType}` : 'File ricevuto',
        };
      }

      // Probe (pdf.js) - completato se stage >= 'ocr' o 'rag'
      if (stage === 'ocr' || stage === 'rag' || stage === 'vertex' || stage === 'done') {
        newSteps[1] = {
          ...newSteps[1],
          status: 'completed',
          details: 'Testo analizzato',
        };
      } else if (stage === 'gating') {
        newSteps[1] = {
          ...newSteps[1],
          status: 'in_progress',
        };
      }

      // OCR
      if (documentData.ocrDone !== undefined) {
        if (documentData.ocrUsed || documentData.ocrDone) {
          newSteps[2] = {
            ...newSteps[2],
            status: 'completed',
            details: 'OCR eseguito',
          };
        } else {
          newSteps[2] = {
            ...newSteps[2],
            status: 'completed',
            details: 'Testo sufficiente → OCR saltato ✓',
          };
        }
      } else if (stage === 'ocr') {
        newSteps[2] = {
          ...newSteps[2],
          status: 'in_progress',
        };
      }

      // RAG
      if (documentData.ragHits !== undefined) {
        newSteps[3] = {
          ...newSteps[3],
          status: 'completed',
          details: `Recuperati ${documentData.ragHits || 0} chunks rilevanti`,
        };
      } else if (stage === 'rag') {
        newSteps[3] = {
          ...newSteps[3],
          status: 'in_progress',
        };
      }

      // Vertex
      if (documentData.validation || stage === 'done') {
        newSteps[4] = {
          ...newSteps[4],
          status: 'completed',
          details: `${documentData.provider || 'vertex-ai'} completato`,
        };
      } else if (stage === 'vertex') {
        newSteps[4] = {
          ...newSteps[4],
          status: 'in_progress',
        };
      }

      // Rules
      if (documentData.checks && documentData.checks.length > 0) {
        const passedChecks = documentData.checks.filter((c: any) => c.passed).length;
        newSteps[5] = {
          ...newSteps[5],
          status: 'completed',
          details: `${passedChecks}/${documentData.checks.length} regole passate`,
        };
      }

      // Write
      if (documentData.status || stage === 'done') {
        const statusLabels: Record<string, string> = {
          green: '✓ Idoneo',
          yellow: '⚠ In scadenza',
          red: '✗ Non idoneo',
          gray: '— Non applicabile',
          na: '— Non applicabile',
          idoneo: '✓ Idoneo',
          non_idoneo: '✗ Non idoneo',
          needs_review: '⚠ Revisione richiesta',
        };
        const status = documentData.status || documentData.overall?.status || 'na';
        newSteps[6] = {
          ...newSteps[6],
          status: 'completed',
          details: statusLabels[status] || 'Completato',
        };
      }

      // Check for errors
      if (documentData.status === 'error' || documentData.error) {
        const errorStepIndex = newSteps.findIndex((s) => s.status === 'pending' || s.status === 'in_progress');
        if (errorStepIndex !== -1) {
          newSteps[errorStepIndex] = {
            ...newSteps[errorStepIndex],
            status: 'error',
            details: documentData.error || 'Errore durante l\'elaborazione',
          };
        }
      }

      return newSteps;
    });
  }, [documentData]);

  return steps;
}

