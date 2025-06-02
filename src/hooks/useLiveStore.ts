
import { useStore } from '@livestore/react';
import { 
  notes$, 
  threads$, 
  threadMessages$, 
  clusters$, 
  blueprints$,
  entityAttributes$,
  activeNote$, 
  activeNoteId$, 
  activeClusterId$, 
  activeThreadId$,
  activeClusterNotes$, 
  standardNotes$, 
  activeNoteConnections$, 
  activeThreadMessages$,
  uiState$
} from '@/livestore/queries';

// Basic store hooks
export const useNotes = () => useStore(notes$);
export const useThreads = () => useStore(threads$);
export const useThreadMessages = () => useStore(threadMessages$);
export const useClusters = () => useStore(clusters$);
export const useBlueprints = () => useStore(blueprints$);
export const useEntityAttributes = () => useStore(entityAttributes$);

// Active state hooks
export const useActiveNote = () => useStore(activeNote$);
export const useActiveNoteId = () => useStore(activeNoteId$);
export const useActiveClusterId = () => useStore(activeClusterId$);
export const useActiveThreadId = () => useStore(activeThreadId$);

// Filtered hooks
export const useActiveClusterNotes = () => useStore(activeClusterNotes$);
export const useStandardNotes = () => useStore(standardNotes$);

// Connection hooks
export const useActiveNoteConnections = () => useStore(activeNoteConnections$);
export const useActiveThreadMessages = () => useStore(activeThreadMessages$);

// UI state
export const useUIState = () => useStore(uiState$);
