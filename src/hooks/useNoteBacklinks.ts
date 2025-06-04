
import { useStore } from '@livestore/react';
import { notes$, activeNoteId$ } from '../livestore/queries';
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
      // Method 1: Check outgoingLinks (from LiveStore)
      if (note.outgoingLinks && Array.isArray(note.outgoingLinks)) {
        const hasLinkToCurrentNote = note.outgoingLinks.some(link => 
          link.targetTitle === currentNoteTitle
        );
        
        if (hasLinkToCurrentNote) {
          backlinks.push({
            id: note.id,
            title: note.title
          });
          return; // Found via outgoingLinks, no need to check content
        }
      }
      
      // Method 2: Check raw content for [[title]] syntax (fallback)
      if (note.content && Array.isArray(note.content)) {
        const noteText = note.content.map(block => {
          if (!block.content || !Array.isArray(block.content)) return '';
          return block.content.map(item => {
            if (item.type === 'text' && 'text' in item) {
              return item.text;
            }
            return '';
          }).join('');
        }).join('\n');
        
        // Check for [[currentNoteTitle]] in the raw text
        const linkPattern = new RegExp(`\\[\\[\\s*${currentNoteTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:\\|[^\\]]*)?\\]\\]`, 'g');
        if (linkPattern.test(noteText)) {
          // Make sure we don't add duplicates
          const alreadyAdded = backlinks.some(bl => bl.id === note.id);
          if (!alreadyAdded) {
            backlinks.push({
              id: note.id,
              title: note.title
            });
          }
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
    const activeNoteId = get(activeNoteId$);
    
    if (!Array.isArray(allNotes) || !activeNoteId) {
      return [];
    }
    
    const activeNote = allNotes.find(note => note.id === activeNoteId);
    if (!activeNote) return [];
    
    console.log(`Computing backlinks for active note "${activeNote.title}"`);
    
    const backlinks: Array<{ id: string; title: string }> = [];
    
    // Iterate through all notes to find ones that link to the active note
    allNotes.forEach(note => {
      if (note.id === activeNoteId) return; // Skip self-references
      
      // Method 1: Check outgoingLinks (from LiveStore)
      if (note.outgoingLinks && Array.isArray(note.outgoingLinks)) {
        const hasLinkToActiveNote = note.outgoingLinks.some(link => 
          link.targetTitle === activeNote.title || link.resolvedTargetId === activeNoteId
        );
        
        if (hasLinkToActiveNote) {
          backlinks.push({
            id: note.id,
            title: note.title
          });
          return; // Found via outgoingLinks, no need to check content
        }
      }
      
      // Method 2: Check raw content for [[activeNote.title]] syntax (fallback)
      if (note.content && Array.isArray(note.content)) {
        const noteText = note.content.map(block => {
          if (!block.content || !Array.isArray(block.content)) return '';
          return block.content.map(item => {
            if (item.type === 'text' && 'text' in item) {
              return item.text;
            }
            return '';
          }).join('');
        }).join('\n');
        
        // Check for [[activeNote.title]] in the raw text
        const linkPattern = new RegExp(`\\[\\[\\s*${activeNote.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:\\|[^\\]]*)?\\]\\]`, 'g');
        if (linkPattern.test(noteText)) {
          // Make sure we don't add duplicates
          const alreadyAdded = backlinks.some(bl => bl.id === note.id);
          if (!alreadyAdded) {
            backlinks.push({
              id: note.id,
              title: note.title
            });
          }
        }
      }
    });
    
    console.log(`Found ${backlinks.length} backlinks for active note "${activeNote.title}"`);
    return backlinks;
  }, { label: 'active_note_backlinks' });
  
  return store.useQuery(backlinksQuery);
}
