
import { useStore } from '@livestore/react';
import { notes$ } from '../livestore/queries';
import { computed } from '@livestore/livestore';

// Hook to get backlinks for a specific note title
export function useNoteBacklinks(currentNoteTitle: string) {
  const { store } = useStore();
  
  // Create a computed query that reactively finds all notes linking to the current note
  const backlinksQuery = computed((get) => {
    const allNotes = get(notes$);
    
    if (!Array.isArray(allNotes) || !currentNoteTitle) {
      return [];
    }
    
    console.log(`Computing backlinks for "${currentNoteTitle}"`);
    
    const backlinks: Array<{ id: string; title: string }> = [];
    
    // Iterate through all notes to find ones that link to the current note
    allNotes.forEach(note => {
      if (note.outgoingLinks && Array.isArray(note.outgoingLinks)) {
        // Check if this note has any outgoing links to the current note
        const hasLinkToCurrentNote = note.outgoingLinks.some(link => 
          link.targetTitle === currentNoteTitle
        );
        
        if (hasLinkToCurrentNote) {
          backlinks.push({
            id: note.id,
            title: note.title
          });
        }
      }
    });
    
    console.log(`Found ${backlinks.length} backlinks for "${currentNoteTitle}"`);
    return backlinks;
  }, { label: `backlinks_${currentNoteTitle}` });
  
  return store.useQuery(backlinksQuery);
}

// Hook to get backlinks for the currently active note
export function useActiveNoteBacklinks() {
  const { store } = useStore();
  
  const backlinksQuery = computed((get) => {
    const allNotes = get(notes$);
    
    if (!Array.isArray(allNotes)) {
      return [];
    }
    
    // Get the active note from the notes collection
    const activeNoteId = get(computed((get) => {
      const uiStateResults = get(store.query(store.tables.uiState));
      return Array.isArray(uiStateResults) && uiStateResults.length > 0 
        ? uiStateResults[0].value?.activeNoteId 
        : null;
    }, { label: 'activeNoteId_for_backlinks' }));
    
    if (!activeNoteId) return [];
    
    const activeNote = allNotes.find(note => note.id === activeNoteId);
    if (!activeNote) return [];
    
    console.log(`Computing backlinks for active note "${activeNote.title}"`);
    
    const backlinks: Array<{ id: string; title: string }> = [];
    
    // Iterate through all notes to find ones that link to the active note
    allNotes.forEach(note => {
      if (note.id === activeNoteId) return; // Skip self-references
      
      if (note.outgoingLinks && Array.isArray(note.outgoingLinks)) {
        // Check if this note has any outgoing links to the active note
        const hasLinkToActiveNote = note.outgoingLinks.some(link => 
          link.targetTitle === activeNote.title || link.resolvedTargetId === activeNoteId
        );
        
        if (hasLinkToActiveNote) {
          backlinks.push({
            id: note.id,
            title: note.title
          });
        }
      }
    });
    
    console.log(`Found ${backlinks.length} backlinks for active note "${activeNote.title}"`);
    return backlinks;
  }, { label: 'active_note_backlinks' });
  
  return store.useQuery(backlinksQuery);
}
