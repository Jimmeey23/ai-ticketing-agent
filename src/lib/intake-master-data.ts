import { STUDIOS } from './ticketing-data';

interface NamedLocation {
  name?: string;
  active?: boolean;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

export function buildMasterDataLocationNames(locations: NamedLocation[]): string[] {
  const routingLocationNames = locations
    .filter((location) => location.active !== false)
    .map((location) => location.name || '');

  return unique([...routingLocationNames, ...STUDIOS]);
}
