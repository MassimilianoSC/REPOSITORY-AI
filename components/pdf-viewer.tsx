interface PdfViewerProps {
  url: string;
  className?: string;
}

export function PdfViewer({ url, className }: PdfViewerProps) {
  return (
    <div className={className}>
      <embed
        src={url}
        type="application/pdf"
        width="100%"
        height="100%"
        className="border border-slate-200 rounded-lg"
      />
      <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
        <p>
          If the PDF does not display, you can{' '}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            open it in a new tab
          </a>
          .
        </p>
      </div>
    </div>
  );
}
