
import { atomWithStorage } from 'jotai/utils';

// Default color mappings for each entity kind
export const DEFAULT_ENTITY_COLORS = {
  CHARACTER: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  FACTION: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  LOCATION: 'bg-green-500/20 text-green-400 border-green-500/30',
  ITEM: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  EVENT: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  SCENE: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  NPC: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  POWER: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  // Add backlinks as a special type
  BACKLINK: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  // Fallback for unknown kinds
  DEFAULT: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
} as const;

// Atom for storing user-customizable color preferences
export const entityColorPreferencesAtom = atomWithStorage<Record<string, string>>(
  'entityColorPreferences',
  {}
);

// Helper function to get color for a specific entity kind
export function getEntityColor(kind: string, userPreferences: Record<string, string> = {}): string {
  // Check user preferences first
  if (userPreferences[kind]) {
    return userPreferences[kind];
  }
  
  // Check default colors
  if (kind in DEFAULT_ENTITY_COLORS) {
    return DEFAULT_ENTITY_COLORS[kind as keyof typeof DEFAULT_ENTITY_COLORS];
  }
  
  // Fallback to default
  return DEFAULT_ENTITY_COLORS.DEFAULT;
}

// Get all known entity kinds including backlinks
export function getKnownEntityKinds(): string[] {
  return Object.keys(DEFAULT_ENTITY_COLORS).filter(kind => kind !== 'DEFAULT');
}

// Color preset options for the UI
export const COLOR_PRESETS = {
  'Purple': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Blue': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Green': 'bg-green-500/20 text-green-400 border-green-500/30',
  'Red': 'bg-red-500/20 text-red-400 border-red-500/30',
  'Orange': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'Pink': 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  'Indigo': 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  'Emerald': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'Rose': 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'Sky': 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  'Amber': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'Violet': 'bg-violet-500/20 text-violet-400 border-violet-500/30'
} as const;
