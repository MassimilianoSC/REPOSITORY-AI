'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Upload, Calendar, Archive, LayoutDashboard, LogOut, Users, ClipboardCheck, Building2 } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebaseClient';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/lib/rbac';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[]; // Se non specificato, visibile a tutti
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/upload', label: 'Upload', icon: Upload },
  { href: '/scadenze', label: 'Scadenze', icon: Calendar },
  // Repository: nascosto a uploader (è un placeholder, non utile per loro)
  { href: '/repository', label: 'Repository', icon: Archive, roles: ['manager', 'verifier'] },
  // Verifica: solo manager e verifier
  { href: '/verifica', label: 'Verifica', icon: ClipboardCheck, roles: ['manager', 'verifier'] },
  // Admin: solo manager
  { href: '/admin/aziende', label: 'Aziende', icon: Building2, roles: ['manager'] },
  { href: '/admin/inviti', label: 'Inviti', icon: Users, roles: ['manager'] },
];

export function Navigation() {
  const pathname = usePathname();
  const { role, email, loading } = useAuth();

  // Filtra le voci del menu in base al ruolo
  const visibleItems = navItems.filter((item) => {
    // Se non ci sono restrizioni di ruolo, mostra a tutti
    if (!item.roles) return true;
    // Se l'utente non ha ancora un ruolo (loading), mostra solo voci senza restrizioni
    if (!role) return false;
    // Verifica se il ruolo dell'utente è nella lista dei ruoli permessi
    return item.roles.includes(role);
  });

  return (
    <nav className="flex flex-col h-screen w-64 bg-slate-50 border-r border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <FileText className="w-8 h-8 text-slate-700" />
          <h1 className="text-xl font-semibold text-slate-900">DocCheck</h1>
        </div>
      </div>

      <div className="flex-1 py-6">
        <ul className="space-y-1 px-3">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Info utente e logout */}
      <div className="p-3 border-t border-slate-200">
        {/* Mostra ruolo e email */}
        {!loading && role && (
          <div className="px-3 py-2 mb-2 text-xs text-slate-500">
            <div className="font-medium text-slate-700 capitalize">{role}</div>
            <div className="truncate">{email}</div>
          </div>
        )}
        
        <button
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 w-full transition-colors"
          onClick={async () => {
            try {
              await signOut(auth);
              window.location.replace('/login/');
            } catch (error) {
              console.error('Logout error:', error);
              window.location.replace('/login/');
            }
          }}
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>
    </nav>
  );
}
