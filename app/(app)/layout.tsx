import { Navigation } from '@/components/navigation';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <Navigation />
      <main className="flex-1 overflow-auto bg-white">
        {children}
      </main>
    </div>
  );
}
