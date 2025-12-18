'use client';

import { NotificationList } from '@/components/notification-list';

export function ScadenzeContent() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Scadenze e Notifiche</h1>
        <p className="text-slate-600">
          Monitora i documenti in scadenza e gestisci le notifiche del tuo team.
        </p>
      </div>

      <NotificationList />
    </div>
  );
}

