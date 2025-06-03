
import { signal } from '@livestore/livestore';

// Available tags/categories for selection
export const availableTagsData$ = signal([
  { id: "character", name: "Character", color: "#8b5cf6" },
  { id: "location", name: "Location", color: "#06b6d4" },
  { id: "item", name: "Item", color: "#10b981" },
  { id: "faction", name: "Faction", color: "#f59e0b" },
  { id: "event", name: "Event", color: "#ef4444" },
  { id: "concept", name: "Concept", color: "#6366f1" },
  { id: "important", name: "Important", color: "#ec4899" },
  { id: "todo", name: "To Do", color: "#84cc16" },
  { id: "research", name: "Research", color: "#a855f7" },
  { id: "worldbuilding", name: "Worldbuilding", color: "#14b8a6" }
], { label: 'availableTagsData$' });

// Currently selected tags for the active note or global filter
export const selectedTagsForNote$ = signal<string[]>([], { label: 'selectedTagsForNote$' });

// Global selected tags for filtering across the app
export const globalSelectedTags$ = signal<string[]>([], { label: 'globalSelectedTags$' });
