'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Upload, Calendar, LayoutDashboard, LogOut, Users, ClipboardCheck, Building2 } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebaseClient';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/lib/rbac';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
  color?: string;
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-teal-400' },
  { href: '/upload', label: 'Carica Documento', icon: Upload, color: 'text-amber-400' },
  { href: '/scadenze', label: 'Scadenze', icon: Calendar, color: 'text-rose-400' },
  { href: '/verifica', label: 'Verifica', icon: ClipboardCheck, roles: ['manager', 'verifier'], color: 'text-sky-400' },
  { href: '/admin/aziende', label: 'Aziende', icon: Building2, roles: ['manager'], color: 'text-emerald-400' },
  { href: '/admin/inviti', label: 'Inviti', icon: Users, roles: ['manager'], color: 'text-orange-400' },
];

const roleConfig: Record<UserRole, { label: string; color: string; bg: string }> = {
  manager: { label: 'Amministratore', color: 'text-amber-300', bg: 'bg-amber-500/20' },
  verifier: { label: 'Verificatore', color: 'text-sky-300', bg: 'bg-sky-500/20' },
  uploader: { label: 'Operatore', color: 'text-emerald-300', bg: 'bg-emerald-500/20' },
};

export function Navigation() {
  const pathname = usePathname();
  const { role, email, loading } = useAuth();

  const visibleItems = navItems.filter((item) => {
    if (!item.roles) return true;
    if (!role) return false;
    return item.roles.includes(role);
  });

  const currentRole = role ? roleConfig[role] : null;

  return (
    <nav className="flex flex-col h-screen w-72 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl">
      {/* Logo Header */}
      <div className="p-6">
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-black tracking-tight text-indigo-500">HQ</h1>
          <div className="h-8 w-px bg-slate-700" />
          <p className="text-xs text-slate-400 font-medium leading-tight">Document<br />AI</p>
        </div>
      </div>

      {/* Navigation Items */}
      <div className="flex-1 py-4 px-3 overflow-y-auto">
        <div className="mb-3 px-3">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Menu</p>
        </div>
        <ul className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'group flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-gradient-to-r from-teal-500/20 to-emerald-500/20 text-white shadow-lg shadow-teal-500/10 border border-teal-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <div className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200',
                    isActive 
                      ? 'bg-gradient-to-br from-teal-400 to-emerald-500 shadow-md shadow-teal-500/30' 
                      : 'bg-slate-800 group-hover:bg-slate-700'
                  )}>
                    <Icon className={cn('w-5 h-5', isActive ? 'text-white' : item.color)} />
                  </div>
                  <span>{item.label}</span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* User Info & Logout */}
      <div className="p-4 border-t border-slate-700/50">
        {!loading && role && currentRole && (
          <div className="mb-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-emerald-500 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                {email?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className={cn('text-xs font-semibold px-2 py-0.5 rounded-full inline-block mb-1', currentRole.bg, currentRole.color)}>
                  {currentRole.label}
                </div>
                <div className="text-xs text-slate-400 truncate">{email}</div>
              </div>
            </div>
          </div>
        )}
        
        <button
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 w-full transition-all duration-200 group"
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
          <div className="w-9 h-9 rounded-lg bg-slate-800 group-hover:bg-rose-500/20 flex items-center justify-center transition-colors">
          <LogOut className="w-5 h-5" />
          </div>
          Esci
        </button>
      </div>
    </nav>
  );
}
