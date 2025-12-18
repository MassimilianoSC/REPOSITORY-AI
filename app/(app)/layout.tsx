import { Navigation } from '@/components/navigation';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-white to-teal-50/30">
      <Navigation />
      <main className="flex-1 overflow-auto bg-pattern">
        {children}
      </main>
    </div>
  );
}
