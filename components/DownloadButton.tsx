'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { getFirebaseStorage } from '@/lib/firebaseClient';
import { cn } from '@/lib/utils';

interface DownloadButtonProps {
  blobName: string;
  fileName?: string;
  variant?: 'button' | 'icon';
  className?: string;
}

export function DownloadButton({ 
  blobName, 
  fileName,
  variant = 'button',
  className 
}: DownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Previene il click sulla riga della tabella
    
    if (!blobName || downloading) return;
    
    setDownloading(true);
    
    try {
      const storage = getFirebaseStorage();
      const fileRef = ref(storage, blobName);
      const url = await getDownloadURL(fileRef);
      
      // Crea un link temporaneo per il download
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      
      // Estrai il nome del file dal blobName se non fornito
      const downloadFileName = fileName || blobName.split('/').pop() || 'documento.pdf';
      link.download = downloadFileName;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (error) {
      console.error('Errore durante il download:', error);
      alert('Errore durante il download del documento. Riprova.');
    } finally {
      setDownloading(false);
    }
  };

  if (variant === 'icon') {
    return (
      <button
        onClick={handleDownload}
        disabled={downloading || !blobName}
        className={cn(
          "p-2 rounded-lg transition-all duration-200",
          "hover:bg-teal-50 hover:text-teal-600",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "text-slate-500",
          className
        )}
        title="Scarica documento"
      >
        {downloading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
      </button>
    );
  }

  return (
    <button
      onClick={handleDownload}
      disabled={downloading || !blobName}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200",
        "bg-gradient-to-r from-teal-500 to-emerald-600 text-white",
        "hover:from-teal-600 hover:to-emerald-700 hover:shadow-lg hover:shadow-teal-500/25",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none",
        className
      )}
    >
      {downloading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Download...</span>
        </>
      ) : (
        <>
          <Download className="w-4 h-4" />
          <span>Scarica Documento</span>
        </>
      )}
    </button>
  );
}

