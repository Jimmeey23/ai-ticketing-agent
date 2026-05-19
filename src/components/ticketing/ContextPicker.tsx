import React, { useEffect, useState } from 'react';
import { STUDIOS, TRAINERS, CLASS_TYPES, CATEGORIES, MEMBERSHIPS, INTAKE_ROUTES, PRIORITY_SLA } from '@/lib/ticketing-data';
import { MapPin, User, Calendar, Tag, ChevronDown, X, BadgeCheck, Search, Route, Siren, Paperclip } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  MomenceMemberOption,
  MomenceSessionOption,
  searchMomenceMembers,
  searchMomenceSessions,
} from '@/lib/momence-api';

export interface Context {
  intakeRoute?: string;
  memberId?: string;
  memberName?: string;
  memberContact?: string;
  sessionId?: string;
  studio?: string;
  trainer?: string;
  classType?: string;
  classDateTime?: string;
  membership?: string;
  category?: string;
  subCategory?: string;
  priority?: string;
  urgencyReason?: string;
  reportedBy?: string;
}

interface Props {
  context: Context;
  onChange: (ctx: Context) => void;
  attachmentCount?: number;
}

interface MomenceSearchOption {
  id: string;
  label: string;
  description: string;
}

function splitMulti(value?: string): string[] {
  return (value || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

function appendMultiUnique(current: string | undefined, next: string): string {
  const existing = splitMulti(current);
  if (!next.trim()) return existing.join(' | ');
  if (existing.some((item) => item.toLowerCase() === next.trim().toLowerCase())) return existing.join(' | ');
  return [...existing, next.trim()].join(' | ');
}

function multiDisplay(value?: string, fallback = ''): string {
  const items = splitMulti(value);
  if (items.length === 0) return fallback;
  if (items.length === 1) return items[0];
  return `${items[0]} +${items.length - 1}`;
}

export const ContextPicker: React.FC<Props> = ({ context, onChange, attachmentCount = 0 }) => {
  return (
    <div className="flex w-max flex-nowrap items-center gap-2">
      <button
        type="button"
        className={`inline-flex h-8 min-w-0 max-w-[180px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold shadow-sm transition duration-200 ${
          attachmentCount > 0
            ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-[0_10px_22px_rgba(190,24,93,0.14)]'
            : 'border-slate-200 bg-white/90 text-stone-600'
        }`}
        title={attachmentCount > 0 ? `${attachmentCount} attachment(s) queued` : 'No attachments queued'}
      >
        <Paperclip className="w-3 h-3" />
        <span className="truncate min-w-0">
          {attachmentCount > 0 ? `Documents (${attachmentCount})` : 'Documents'}
        </span>
      </button>
      <AsyncPicker
        icon={<User className="w-3 h-3" />}
        label="Member"
        value={multiDisplay(context.memberName)}
        loadOptions={searchMomenceMembers}
        onSelect={(member) =>
          onChange({
            ...context,
            memberId: appendMultiUnique(context.memberId, member.id),
            memberName: appendMultiUnique(context.memberName, member.name),
            memberContact: appendMultiUnique(context.memberContact, member.email || member.phoneNumber || ''),
          })
        }
        onClear={() =>
          onChange({
            ...context,
            memberId: undefined,
            memberName: undefined,
            memberContact: undefined,
          })
        }
      />
      <AsyncPicker
        icon={<Calendar className="w-3 h-3" />}
        label="Session"
        value={multiDisplay(context.classType)}
        loadOptions={searchMomenceSessions}
        onSelect={(session) =>
          onChange({
            ...context,
            sessionId: appendMultiUnique(context.sessionId, session.id),
            classType: appendMultiUnique(context.classType, session.classType),
            classDateTime: appendMultiUnique(context.classDateTime, session.startsAt || ''),
            trainer: appendMultiUnique(context.trainer, session.trainer || ''),
            studio: appendMultiUnique(context.studio, session.studio || ''),
          })
        }
        onClear={() =>
          onChange({
            ...context,
            sessionId: undefined,
            classType: undefined,
            classDateTime: undefined,
          })
        }
      />
      <Picker
        icon={<MapPin className="w-3 h-3" />}
        label="Studio"
        value={context.studio}
        options={STUDIOS}
        onSelect={(v) => onChange({ ...context, studio: v })}
        onClear={() => onChange({ ...context, studio: undefined })}
      />
      <Picker
        icon={<User className="w-3 h-3" />}
        label="Trainer"
        value={context.trainer}
        options={TRAINERS}
        onSelect={(v) => onChange({ ...context, trainer: v })}
        onClear={() => onChange({ ...context, trainer: undefined })}
      />
      <Picker
        icon={<Calendar className="w-3 h-3" />}
        label="Class"
        value={context.classType}
        options={CLASS_TYPES}
        onSelect={(v) => onChange({ ...context, classType: v })}
        onClear={() => onChange({ ...context, classType: undefined })}
      />
      <Picker
        icon={<BadgeCheck className="w-3 h-3" />}
        label="Membership"
        value={context.membership}
        options={MEMBERSHIPS}
        onSelect={(v) => onChange({ ...context, membership: v })}
        onClear={() => onChange({ ...context, membership: undefined })}
      />
      <Picker
        icon={<Route className="w-3 h-3" />}
        label="Route"
        value={context.intakeRoute}
        options={INTAKE_ROUTES}
        onSelect={(v) => onChange({ ...context, intakeRoute: v })}
        onClear={() => onChange({ ...context, intakeRoute: undefined })}
      />
      <Picker
        icon={<Tag className="w-3 h-3" />}
        label="Category"
        value={context.category}
        options={Object.keys(CATEGORIES)}
        onSelect={(v) => onChange({ ...context, category: v, subCategory: undefined })}
        onClear={() => onChange({ ...context, category: undefined, subCategory: undefined })}
      />
      {context.category && (
        <Picker
          icon={<Tag className="w-3 h-3" />}
          label="Sub-category"
          value={context.subCategory}
          options={CATEGORIES[context.category] || []}
          onSelect={(v) => onChange({ ...context, subCategory: v })}
          onClear={() => onChange({ ...context, subCategory: undefined })}
        />
      )}
      <Picker
        icon={<Siren className="w-3 h-3" />}
        label="Priority"
        value={context.priority}
        options={Object.keys(PRIORITY_SLA)}
        onSelect={(v) => onChange({ ...context, priority: v })}
        onClear={() => onChange({ ...context, priority: undefined })}
      />
      <input
        value={context.urgencyReason || ''}
        onChange={(event) => onChange({ ...context, urgencyReason: event.target.value })}
        placeholder="Urgency reason"
        className="h-8 min-w-[200px] rounded-full border border-slate-200 bg-white/90 px-3 text-xs font-semibold text-stone-700 shadow-sm outline-none transition duration-200 placeholder:text-stone-400 hover:border-rose-200 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/15"
      />
    </div>
  );
};

interface AsyncPickerProps<TOption extends MomenceSearchOption> {
  icon: React.ReactNode;
  label: string;
  value?: string;
  loadOptions: (query: string) => Promise<TOption[]>;
  onSelect: (option: TOption) => void;
  onClear: () => void;
}

const AsyncPicker = <TOption extends MomenceSearchOption,>({
  icon,
  label,
  value,
  loadOptions,
  onSelect,
  onClear,
}: AsyncPickerProps<TOption>) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<TOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await loadOptions(query);
        setOptions(results);
      } catch (e: unknown) {
        setOptions([]);
        setError(e instanceof Error ? e.message : 'Momence search failed');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(handle);
  }, [loadOptions, open, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-8 min-w-0 max-w-[210px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold shadow-sm transition duration-200 ${
            value
              ? 'border-stone-950 bg-stone-950 text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)]'
              : 'border-slate-200 bg-white/90 text-stone-600 hover:-translate-y-0.5 hover:border-rose-200 hover:bg-rose-50 hover:text-stone-950'
          }`}
        >
          <span className="flex-shrink-0">{icon}</span>
          <span className="truncate min-w-0">{value || `Search ${label}`}</span>
          {value ? (
            <X
              className="w-3 h-3 ml-0.5 flex-shrink-0 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClear();
              }}
            />
          ) : (
            <Search className="w-3 h-3 flex-shrink-0" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-slate-200 bg-white/96 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-xl"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={`Search Momence ${label.toLowerCase()}...`}
            className="text-xs"
          />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>
              {loading
                ? 'Searching Momence...'
                : error
                  ? error
                  : query.length < 2 && label === 'Member'
                    ? 'Enter at least 2 characters'
                    : 'No Momence matches'}
            </CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.id}
                value={`${option.label} ${option.description}`}
                onSelect={() => {
                  onSelect(option);
                  setOpen(false);
                  setQuery('');
                }}
                className="items-start whitespace-normal break-words text-xs leading-snug"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-stone-900">{option.label}</div>
                  {option.description && (
                    <div className="mt-0.5 text-[11px] text-stone-500">{option.description}</div>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const Picker: React.FC<{
  icon: React.ReactNode;
  label: string;
  value?: string;
  options: string[];
  onSelect: (v: string) => void;
  onClear: () => void;
}> = ({ icon, label, value, options, onSelect, onClear }) => {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-8 min-w-0 max-w-[180px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold shadow-sm transition duration-200 ${
            value
              ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-[0_10px_22px_rgba(190,24,93,0.14)]'
              : 'border-slate-200 bg-white/90 text-stone-600 hover:-translate-y-0.5 hover:border-rose-200 hover:bg-rose-50 hover:text-stone-950'
          }`}
        >
          <span className="flex-shrink-0">{icon}</span>
          <span className="truncate min-w-0">{value || label}</span>
          {value ? (
            <X
              className="w-3 h-3 ml-0.5 flex-shrink-0 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClear();
              }}
            />
          ) : (
            <ChevronDown className="w-3 h-3 flex-shrink-0" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-slate-200 bg-white/96 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-xl"
      >
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}...`} className="text-xs" />
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No matches</CommandEmpty>
            {options.map((opt) => (
              <CommandItem
                key={opt}
                value={opt}
                onSelect={() => {
                  onSelect(opt);
                  setOpen(false);
                }}
                className="items-start whitespace-normal break-words text-xs leading-snug"
              >
                {opt}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
