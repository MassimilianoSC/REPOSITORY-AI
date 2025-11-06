'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Upload, Calendar, Archive, LayoutDashboard, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebaseClient';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/upload', label: 'Upload', icon: Upload },
  { href: '/scadenze', label: 'Scadenze', icon: Calendar },
  { href: '/repository', label: 'Repository', icon: Archive },
];

export function Navigation() {
  const pathname = usePathname();

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
          {navItems.map((item) => {
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

      <div className="p-3 border-t border-slate-200">
        <button
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 w-full transition-colors"
          onClick={async () => {
            try {
              await signOut(auth);
              window.location.href = '/login.html';
            } catch (error) {
              console.error('Logout error:', error);
              // Anche in caso di errore, redirect a login
              window.location.href = '/login.html';
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
