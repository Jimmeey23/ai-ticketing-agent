import React from 'react';
import { QUICK_TEMPLATES } from '@/lib/ticketing-data';
import {
  CalendarClock, ShieldAlert, MessageSquareHeart, Building2,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  CalendarClock, ShieldAlert, MessageSquareHeart, Building2,
};

interface Props {
  onSelect: (prompt: string, templateTitle: string) => void;
}

export const QuickTemplates: React.FC<Props> = ({ onSelect }) => {
  return (
    <div className="space-y-2.5">
      <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">
        Capture starter
      </div>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_TEMPLATES.map((t) => {
          const Icon = ICONS[t.icon] || MessageSquareHeart;
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.prompt, t.title)}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition duration-200 hover:border-blue-300 hover:bg-blue-50 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-blue-700 dark:hover:bg-stone-800"
            >
              <div className="relative">
                <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700 transition-colors group-hover:border-blue-200 group-hover:bg-white dark:border-blue-300/15 dark:bg-blue-950/30 dark:text-blue-200">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="text-xs font-semibold leading-tight text-stone-900 transition-colors dark:text-stone-100">
                  {t.title}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
