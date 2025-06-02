
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
  uiState$,
  entityCoOccurrences$,
  globalTriples$
} from '@/livestore/queries';
import { tables } from '@/livestore/schema';
import { useCallback } from 'react';

// Basic store hooks that return arrays/objects
export const useNotes = () => {
  const result = useStore(notes$);
  return Array.isArray(result) ? result : [];
};

export const useThreads = () => {
  const result = useStore(threads$);
  return Array.isArray(result) ? result : [];
};

export const useThreadMessages = () => {
  const result = useStore(threadMessages$);
  return Array.isArray(result) ? result : [];
};

export const useClusters = () => {
  const result = useStore(clusters$);
  return Array.isArray(result) ? result : [];
};

export const useBlueprints = () => {
  const result = useStore(blueprints$);
  return Array.isArray(result) ? result : [];
};

export const useBlueprintsArray = () => {
  const result = useStore(blueprints$);
  return Array.isArray(result) ? result : [];
};

export const useEntityAttributes = () => {
  const result = useStore(entityAttributes$);
  return Array.isArray(result) ? result : [];
};

// Active state hooks that return single values with setters
export const useActiveNote = () => useStore(activeNote$);

export const useActiveNoteId = () => {
  const activeNoteId = useStore(activeNoteId$);
  const setActiveNoteId = useCallback((noteId: string) => {
    tables.uiState.upsert({ id: 'main', value: { activeNoteId: noteId } });
  }, []);
  return [activeNoteId, setActiveNoteId] as const;
};

export const useActiveClusterId = () => {
  const activeClusterId = useStore(activeClusterId$);
  const setActiveClusterId = useCallback((clusterId: string) => {
    tables.uiState.upsert({ id: 'main', value: { activeClusterId: clusterId } });
  }, []);
  return [activeClusterId, setActiveClusterId] as const;
};

export const useActiveThreadId = () => {
  const activeThreadId = useStore(activeThreadId$);
  const setActiveThreadId = useCallback((threadId: string | null) => {
    tables.uiState.upsert({ id: 'main', value: { activeThreadId: threadId } });
  }, []);
  return [activeThreadId, setActiveThreadId] as const;
};

// Filtered hooks that return arrays
export const useActiveClusterNotes = () => {
  const result = useStore(activeClusterNotes$);
  return Array.isArray(result) ? result : [];
};

export const useStandardNotes = () => {
  const result = useStore(standardNotes$);
  return Array.isArray(result) ? result : [];
};

// Connection hooks
export const useActiveNoteConnections = () => useStore(activeNoteConnections$);
export const useActiveThreadMessages = () => {
  const result = useStore(activeThreadMessages$);
  return Array.isArray(result) ? result : [];
};

// UI state
export const useUIState = () => useStore(uiState$);

// Entity relation hooks
export const useEntityCoOccurrences = () => useStore(entityCoOccurrences$);
export const useGlobalTriples = () => useStore(globalTriples$);

// Additional entity hooks for compatibility
export const useActiveNoteEntities = () => {
  const connections = useStore(activeNoteConnections$);
  return connections?.entities || [];
};

export const useClusterEntitiesMap = () => {
  // Return empty map for now - this would need proper implementation
  return new Map();
};

export const useFolderEntitiesMap = () => {
  // Return empty map for now - this would need proper implementation
  return new Map();
};

export const useAllEntitiesArray = () => {
  const entityAttributes = useStore(entityAttributes$);
  return Array.isArray(entityAttributes) ? entityAttributes : [];
};

// Action hooks
export const useNoteActions = () => {
  const createNote = useCallback((note: any) => {
    tables.notes.insert(note);
  }, []);

  const updateNote = useCallback((id: string, updates: any) => {
    tables.notes.update(id, updates);
  }, []);

  const deleteNote = useCallback((id: string) => {
    tables.notes.delete(id);
  }, []);

  const createCluster = useCallback((cluster: any) => {
    tables.clusters.insert(cluster);
  }, []);

  const updateCluster = useCallback((id: string, updates: any) => {
    tables.clusters.update(id, updates);
  }, []);

  const deleteCluster = useCallback((id: string) => {
    tables.clusters.delete(id);
  }, []);

  return {
    createNote,
    updateNote,
    deleteNote,
    createCluster,
    updateCluster,
    deleteCluster
  };
};
