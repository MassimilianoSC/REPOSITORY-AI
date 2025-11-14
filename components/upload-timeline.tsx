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

      // Upload completed
      if (documentData.id) {
        newSteps[0] = {
          ...newSteps[0],
          status: 'completed',
          details: `ID: ${documentData.id.substring(0, 8)}...`,
        };
      }

      // Probe (pdf.js)
      if (documentData.pipeline?.probeCompleted) {
        const probe = documentData.pipeline.probe;
        newSteps[1] = {
          ...newSteps[1],
          status: 'completed',
          details: `${probe?.pages || '?'} pagine, ${probe?.totalChars || '?'} caratteri (max/pagina: ${probe?.maxCharsPerPage || '?'})`,
        };
      }

      // OCR
      if (documentData.pipeline?.ocrCompleted !== undefined) {
        if (documentData.pipeline.ocrCompleted) {
          newSteps[2] = {
            ...newSteps[2],
            status: 'completed',
            details: `OCR eseguito (${documentData.pipeline.ocrPages || '?'} pagine)`,
          };
        } else {
          newSteps[2] = {
            ...newSteps[2],
            status: 'completed',
            details: 'Testo sufficiente → OCR saltato ✓',
          };
        }
      }

      // RAG
      if (documentData.audit?.rag) {
        const rag = documentData.audit.rag;
        newSteps[3] = {
          ...newSteps[3],
          status: 'completed',
          details: `Recuperati ${rag.hits || 0}/${rag.topK || 6} chunks (${rag.latencyMs || '?'}ms)`,
        };
      }

      // Vertex
      if (documentData.audit?.vertex) {
        const vertex = documentData.audit.vertex;
        newSteps[4] = {
          ...newSteps[4],
          status: 'completed',
          details: `${vertex.model || 'gemini-2.5-flash'} in ${vertex.region || 'europe-west1'} (${vertex.latencyMs || '?'}ms)`,
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
      if (documentData.overall?.status) {
        const statusLabels: Record<string, string> = {
          green: '✓ Idoneo',
          yellow: '⚠ In scadenza',
          red: '✗ Non idoneo',
          na: '— Non applicabile',
        };
        newSteps[6] = {
          ...newSteps[6],
          status: 'completed',
          details: statusLabels[documentData.overall.status] || 'Completato',
        };
      }

      // Check for errors
      if (documentData.status === 'error') {
        const errorStepIndex = newSteps.findIndex((s) => s.status === 'pending');
        if (errorStepIndex !== -1) {
          newSteps[errorStepIndex] = {
            ...newSteps[errorStepIndex],
            status: 'error',
            details: documentData.error || 'Errore durante l\'elaborazione',
          };
        }
      }

      // Mark in-progress step
      const firstPendingIndex = newSteps.findIndex((s) => s.status === 'pending');
      if (firstPendingIndex !== -1 && documentData.status === 'processing') {
        newSteps[firstPendingIndex] = {
          ...newSteps[firstPendingIndex],
          status: 'in_progress',
        };
      }

      return newSteps;
    });
  }, [documentData]);

  return steps;
}

