'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ExpiryItem {
  id: string;
  docType: string;
  company?: string;
  expiresAt: string; // formato "dd/mm/yyyy" o "N/D"
}

interface ExpiryCalendarProps {
  documents: ExpiryItem[];
  onDayClick?: (date: Date, docs: ExpiryItem[]) => void;
}

const DAYS_IT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MONTHS_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

export function ExpiryCalendar({ documents, onDayClick }: ExpiryCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // Mappa scadenze per giorno del mese corrente
  const expiryMap = useMemo(() => {
    const map: Record<string, ExpiryItem[]> = {};
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    documents.forEach((doc) => {
      if (doc.expiresAt === 'N/D') return;
      
      // Parse "dd/mm/yyyy"
      const parts = doc.expiresAt.split('/');
      if (parts.length !== 3) return;
      
      const day = parseInt(parts[0], 10);
      const docMonth = parseInt(parts[1], 10) - 1; // 0-indexed
      const docYear = parseInt(parts[2], 10);

      if (docYear === year && docMonth === month) {
        const key = `${day}`;
        if (!map[key]) map[key] = [];
        map[key].push(doc);
      }
    });

    return map;
  }, [documents, currentDate]);

  // Genera giorni del mese
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Giorno della settimana del primo giorno (0=Dom, 1=Lun, ...)
    // Convertiamo per iniziare da Lunedì
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;
    
    const daysInMonth = lastDay.getDate();
    const days: (number | null)[] = [];
    
    // Giorni vuoti prima del primo giorno
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }
    
    // Giorni del mese
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    
    return days;
  }, [currentDate]);

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    setSelectedDay(null);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    setSelectedDay(null);
  };

  const today = new Date();
  const isToday = (day: number) => {
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  const handleDayClick = (day: number) => {
    setSelectedDay(day === selectedDay ? null : day);
    if (onDayClick) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      onDayClick(date, expiryMap[`${day}`] || []);
    }
  };

  const selectedDocs = selectedDay ? expiryMap[`${selectedDay}`] || [] : [];

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      {/* Header con navigazione */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Mese precedente"
        >
          <ChevronLeft className="w-5 h-5 text-slate-600" />
        </button>
        <h3 className="text-lg font-semibold text-slate-900">
          {MONTHS_IT[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h3>
        <button
          onClick={nextMonth}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          aria-label="Mese successivo"
        >
          <ChevronRight className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      {/* Intestazione giorni */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {DAYS_IT.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-slate-500 py-2"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Griglia giorni */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} className="h-12" />;
          }

          const expiries = expiryMap[`${day}`] || [];
          const hasExpiries = expiries.length > 0;
          const isSelected = day === selectedDay;

          return (
            <button
              key={day}
              onClick={() => handleDayClick(day)}
              className={`
                h-12 rounded-lg relative flex flex-col items-center justify-center
                transition-all duration-200
                ${isToday(day) ? 'bg-blue-100 font-bold' : ''}
                ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''}
                ${hasExpiries ? 'hover:bg-orange-50' : 'hover:bg-slate-50'}
              `}
            >
              <span className={`text-sm ${isToday(day) ? 'text-blue-700' : 'text-slate-700'}`}>
                {day}
              </span>
              {hasExpiries && (
                <span className="absolute bottom-1 flex items-center justify-center">
                  <span className="w-5 h-5 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {expiries.length}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Dettaglio scadenze giorno selezionato */}
      {selectedDay && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">
            Scadenze del {selectedDay} {MONTHS_IT[currentDate.getMonth()]}:
          </h4>
          {selectedDocs.length === 0 ? (
            <p className="text-sm text-slate-500">Nessuna scadenza</p>
          ) : (
            <ul className="space-y-1">
              {selectedDocs.map((doc) => (
                <li
                  key={doc.id}
                  className="text-sm text-slate-600 flex items-center gap-2"
                >
                  <span className="w-2 h-2 bg-orange-500 rounded-full" />
                  <span className="font-medium">{doc.docType}</span>
                  <span className="text-slate-400">—</span>
                  <span>{doc.company}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Legenda */}
      <div className="mt-4 pt-4 border-t border-slate-200 flex items-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 bg-blue-100 rounded" />
          <span>Oggi</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center text-white text-[10px]">2</span>
          <span>Scadenze</span>
        </div>
      </div>
    </div>
  );
}

