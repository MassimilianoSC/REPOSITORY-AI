import { DocumentDetail } from './document-detail';

// Generate static params for static export
export function generateStaticParams() {
  // Generate pages for mock document IDs (matching dashboard data)
  return [
    { id: '1' },
    { id: '2' },
    { id: '3' },
  ];
}

export default function DocumentPage({ params }: { params: { id: string } }) {
  return <DocumentDetail documentId={params.id} />;
}
