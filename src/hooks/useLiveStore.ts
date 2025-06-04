
import { useStore } from '@livestore/react';
import { 
  activeNoteId$, 
  activeClusterId$, 
  activeThreadId$,
  activeNote$,
  notes$,
  clusters$,
  activeClusterNotes$,
  standardNotes$,
  activeNoteConnections$,
  entityAttributes$,
  blueprints$,
  // New entity queries
  globalEntities$,
  clusterEntitiesMap$,
  folderEntitiesMap$,
  activeNoteEntities$,
  entitiesByType$,
  entityReferenceCounts$,
  recentEntities$,
  orphanedEntities$,
  allEntitiesArray$
} from '../livestore/queries';
// Import new cross-note relation queries
import { 
  entityCoOccurrences$, 
  globalTriples$, 
  createEntityGlobalRelationsQuery,
  topCoOccurrences$,
  topGlobalTriples$
} from '../livestore/queries/derived';
import { events } from '../livestore/schema';
import { parseAndResolveNoteLinks } from '../lib/utils/parsingUtils';

// Custom hooks that wrap LiveStore usage with proper typing
export function useActiveNoteId() {
  const { store } = useStore();
  const activeNoteId = store.useQuery(activeNoteId$);
  
  const setActiveNoteId = (id: string | null) => {
    store.commit(events.uiStateSet({ 
      activeNoteId: id,
      activeClusterId: store.query(activeClusterId$),
      activeThreadId: store.query(activeThreadId$),
      graphInitialized: false,
      graphLayout: 'dagre'
    }));
  };

  return [activeNoteId, setActiveNoteId] as const;
}

export function useActiveClusterId() {
  const { store } = useStore();
  const activeClusterId = store.useQuery(activeClusterId$);
  
  const setActiveClusterId = (id: string) => {
    store.commit(events.uiStateSet({ 
      activeNoteId: store.query(activeNoteId$),
      activeClusterId: id,
      activeThreadId: store.query(activeThreadId$),
      graphInitialized: false,
      graphLayout: 'dagre'
    }));
  };

  return [activeClusterId, setActiveClusterId] as const;
}

export function useActiveNote() {
  const { store } = useStore();
  return store.useQuery(activeNote$);
}

export function useNotes() {
  const { store } = useStore();
  const notes = store.useQuery(notes$);
  return Array.isArray(notes) ? notes : [];
}

export function useClusters() {
  const { store } = useStore();
  const clusters = store.useQuery(clusters$);
  return Array.isArray(clusters) ? clusters : [];
}

export function useActiveClusterNotes() {
  const { store } = useStore();
  const notes = store.useQuery(activeClusterNotes$);
  return Array.isArray(notes) ? notes : [];
}

export function useStandardNotes() {
  const { store } = useStore();
  const notes = store.useQuery(standardNotes$);
  return Array.isArray(notes) ? notes : [];
}

export function useActiveNoteConnections() {
  const { store } = useStore();
  return store.useQuery(activeNoteConnections$);
}

export function useEntityAttributes() {
  const { store } = useStore();
  const attrs = store.useQuery(entityAttributes$);
  return Array.isArray(attrs) ? attrs : [];
}

export function useBlueprintsArray() {
  const { store } = useStore();
  const blueprints = store.useQuery(blueprints$);
  return Array.isArray(blueprints) ? blueprints : [];
}

// New entity-specific hooks
export function useGlobalEntities() {
  const { store } = useStore();
  return store.useQuery(globalEntities$);
}

export function useAllEntitiesArray() {
  const { store } = useStore();
  return store.useQuery(allEntitiesArray$);
}

export function useClusterEntitiesMap() {
  const { store } = useStore();
  return store.useQuery(clusterEntitiesMap$);
}

export function useFolderEntitiesMap() {
  const { store } = useStore();
  return store.useQuery(folderEntitiesMap$);
}

export function useActiveNoteEntities() {
  const { store } = useStore();
  return store.useQuery(activeNoteEntities$);
}

export function useEntitiesByType() {
  const { store } = useStore();
  return store.useQuery(entitiesByType$);
}

export function useEntityReferenceCounts() {
  const { store } = useStore();
  return store.useQuery(entityReferenceCounts$);
}

export function useRecentEntities() {
  const { store } = useStore();
  return store.useQuery(recentEntities$);
}

export function useOrphanedEntities() {
  const { store } = useStore();
  return store.useQuery(orphanedEntities$);
}

// NEW: Cross-note relation hooks
export function useEntityCoOccurrences() {
  const { store } = useStore();
  return store.useQuery(entityCoOccurrences$);
}

export function useGlobalTriples() {
  const { store } = useStore();
  return store.useQuery(globalTriples$);
}

export function useEntityGlobalRelations(entityId: string) {
  const { store } = useStore();
  const query = createEntityGlobalRelationsQuery(entityId);
  return store.useQuery(query);
}

export function useTopCoOccurrences() {
  const { store } = useStore();
  return store.useQuery(topCoOccurrences$);
}

export function useTopGlobalTriples() {
  const { store } = useStore();
  return store.useQuery(topGlobalTriples$);
}

// Helper to commit note updates with enhanced link handling
export function useNoteActions() {
  const { store } = useStore();
  
  const updateNote = (id: string, updates: any) => {
    console.log(`[useNoteActions] updateNote called for ${id}:`, updates);
    
    // If content is being updated, also update outgoing links
    if (updates.content) {
      const allNotes = store.query(notes$);
      const currentNote = Array.isArray(allNotes) ? allNotes.find(note => note.id === id) : null;
      
      if (currentNote) {
        // Create a temporary note object with updated content for parsing
        const updatedNote = { ...currentNote, content: updates.content };
        const outgoingLinks = parseAndResolveNoteLinks(updatedNote, Array.isArray(allNotes) ? allNotes : []);
        
        console.log(`[useNoteActions] Parsed outgoing links for note ${id}:`, outgoingLinks);
        updates.outgoingLinks = outgoingLinks;
      } else {
        console.warn(`[useNoteActions] Could not find note ${id} for link parsing`);
      }
    }
    
    console.log(`[useNoteActions] Committing note update for ${id} with outgoingLinks:`, updates.outgoingLinks);
    store.commit(events.noteUpdated({
      id,
      updates,
      updatedAt: new Date().toISOString()
    }));
  };

  const createNote = (note: any) => {
    // Ensure outgoing links are parsed and resolved for new notes
    if (note.content) {
      const allNotes = store.query(notes$);
      const outgoingLinks = parseAndResolveNoteLinks(note, Array.isArray(allNotes) ? allNotes : []);
      note.outgoingLinks = outgoingLinks;
      
      console.log(`Creating note with outgoing links:`, outgoingLinks);
    }
    
    store.commit(events.noteCreated(note));
  };

  const deleteNote = (id: string) => {
    store.commit(events.noteDeleted({ id }));
  };

  const createCluster = (cluster: any) => {
    store.commit(events.clusterCreated(cluster));
  };

  const updateCluster = (id: string, updates: any) => {
    store.commit(events.clusterUpdated({
      id,
      updates,
      updatedAt: new Date().toISOString()
    }));
  };

  const deleteCluster = (id: string) => {
    store.commit(events.clusterDeleted({ id }));
  };

  // NEW: Function to handle note title changes and update all affected links
  const updateNoteTitle = (id: string, newTitle: string) => {
    const allNotes = store.query(notes$);
    if (!Array.isArray(allNotes)) return;
    
    const targetNote = allNotes.find(note => note.id === id);
    if (!targetNote) return;
    
    const oldTitle = targetNote.title;
    console.log(`Updating note title from "${oldTitle}" to "${newTitle}"`);
    
    // First update the note's title
    store.commit(events.noteUpdated({
      id,
      updates: { title: newTitle },
      updatedAt: new Date().toISOString()
    }));
    
    // Then update all notes that link to this note
    allNotes.forEach(note => {
      if (note.id === id) return; // Skip the note being renamed
      
      if (note.outgoingLinks && Array.isArray(note.outgoingLinks)) {
        let linksUpdated = false;
        const updatedLinks = note.outgoingLinks.map(link => {
          if (link.targetTitle === oldTitle || link.resolvedTargetId === id) {
            linksUpdated = true;
            return {
              targetTitle: newTitle,
              resolvedTargetId: id
            };
          }
          return link;
        });
        
        if (linksUpdated) {
          console.log(`Updating links in note ${note.id} due to title change`);
          store.commit(events.noteUpdated({
            id: note.id,
            updates: { outgoingLinks: updatedLinks },
            updatedAt: new Date().toISOString()
          }));
        }
      }
    });
  };

  // NEW: Function to force re-parse outgoing links for all notes (debug/repair utility)
  const repairAllOutgoingLinks = () => {
    const allNotes = store.query(notes$);
    if (!Array.isArray(allNotes)) return;
    
    console.log('[useNoteActions] Repairing outgoing links for all notes...');
    
    allNotes.forEach(note => {
      if (note.type === 'note' && note.content) {
        const outgoingLinks = parseAndResolveNoteLinks(note, allNotes);
        
        // Only update if outgoingLinks are different or missing
        const currentLinks = note.outgoingLinks || [];
        const linksChanged = JSON.stringify(currentLinks) !== JSON.stringify(outgoingLinks);
        
        if (linksChanged) {
          console.log(`[useNoteActions] Repairing links for note ${note.id}:`, outgoingLinks);
          store.commit(events.noteUpdated({
            id: note.id,
            updates: { outgoingLinks },
            updatedAt: new Date().toISOString()
          }));
        }
      }
    });
  };

  return { 
    updateNote, 
    createNote, 
    deleteNote,
    createCluster,
    updateCluster,
    deleteCluster,
    updateNoteTitle,
    repairAllOutgoingLinks // NEW: Export the repair function
  };
}

// Import SelectPills hooks
export { useSelectPills } from './useSelectPills';
