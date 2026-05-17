import React, { useEffect, useState } from 'react';
import { STUDIOS, TRAINERS, CLASS_TYPES, CATEGORIES, MEMBERSHIPS, INTAKE_ROUTES, PRIORITY_SLA } from '@/lib/ticketing-data';
import { MapPin, User, Calendar, Tag, ChevronDown, X, BadgeCheck, Search, Route, Siren } from 'lucide-react';
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
}

interface MomenceSearchOption {
  id: string;
  label: string;
  description: string;
}

export const ContextPicker: React.FC<Props> = ({ context, onChange }) => {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <AsyncPicker
        icon={<User className="w-3 h-3" />}
        label="Member"
        value={context.memberName}
        loadOptions={searchMomenceMembers}
        onSelect={(member) =>
          onChange({
            ...context,
            memberId: member.id,
            memberName: member.name,
            memberContact: member.email || member.phoneNumber,
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
        value={context.classType}
        loadOptions={searchMomenceSessions}
        onSelect={(session) =>
          onChange({
            ...context,
            sessionId: session.id,
            classType: session.classType,
            classDateTime: session.startsAt,
            trainer: session.trainer || context.trainer,
            studio: session.studio || context.studio,
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
        className="h-[26px] min-w-[190px] rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:focus:border-blue-700 dark:focus:ring-blue-900/40"
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
          className={`inline-flex min-w-0 max-w-[190px] items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition ${
            value
              ? 'bg-blue-100 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-blue-300'
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
        className="w-96 max-w-[calc(100vw-2rem)] p-0 overflow-hidden"
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
                  <div className="font-medium text-slate-900 dark:text-slate-100">{option.label}</div>
                  {option.description && (
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{option.description}</div>
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
          className={`inline-flex min-w-0 max-w-[160px] items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition ${
            value
              ? 'bg-violet-100 dark:bg-violet-950 border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-200'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-violet-300'
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
        className="w-80 max-w-[calc(100vw-2rem)] p-0 overflow-hidden"
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
