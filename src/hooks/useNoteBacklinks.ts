
import { useStore } from '@livestore/react';
import { notes$, activeNoteId$ } from '../livestore/queries';
import { computed } from '@livestore/livestore';

// ENHANCED: Helper function to extract both raw text and backlink inline specs from note content
function extractBacklinksFromNoteContent(content: any[], targetTitle: string): boolean {
  if (!Array.isArray(content)) return false;
  
  let foundBacklink = false;
  
  const walkBlock = (block: any) => {
    if (!block.content || !Array.isArray(block.content)) return;
    
    for (const item of block.content) {
      // Check for highlighted backlink inline specs
      if (item.type === 'backlink' && item.props?.text === targetTitle) {
        foundBacklink = true;
        return;
      }
      
      // Check for raw text containing backlink syntax
      if (item.type === 'text' && item.text) {
        const backlinkPattern = new RegExp(`<<\\s*${targetTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:\\|[^>]*)?>>`, 'g');
        if (backlinkPattern.test(item.text)) {
          foundBacklink = true;
          return;
        }
      }
    }
    
    // Recursively check nested blocks
    if (block.children && Array.isArray(block.children)) {
      block.children.forEach(walkBlock);
    }
  };
  
  content.forEach(walkBlock);
  return foundBacklink;
}

// ENHANCED: Hook to get backlinks for a specific note title
export function useNoteBacklinks(currentNoteTitle: string) {
  const { store } = useStore();
  
  // Create a computed query that reactively finds all notes containing <<currentNoteTitle>>
  const backlinksQuery = computed((get) => {
    const allNotes = get(notes$);
    
    if (!Array.isArray(allNotes) || !currentNoteTitle) {
      return [];
    }
    
    console.log(`useNoteBacklinks: Computing backlinks for "${currentNoteTitle}"`);
    
    const backlinks: Array<{ id: string; title: string }> = [];
    
    // ENHANCED: Search for both raw and highlighted backlinks
    allNotes.forEach(note => {
      // Skip the current note itself
      if (note.title === currentNoteTitle) return;
      
      // Check for backlinks using enhanced function
      if (extractBacklinksFromNoteContent(note.content || [], currentNoteTitle)) {
        backlinks.push({
          id: note.id,
          title: note.title
        });
        console.log(`useNoteBacklinks: Found backlink in "${note.title}" pointing to "${currentNoteTitle}"`);
      }
    });
    
    console.log(`useNoteBacklinks: Found ${backlinks.length} backlinks for "${currentNoteTitle}"`);
    return backlinks;
  }, { label: `backlinks_${currentNoteTitle}` });
  
  return store.useQuery(backlinksQuery);
}

// ENHANCED: Hook to get backlinks for the currently active note
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
    
    console.log(`useActiveNoteBacklinks: Computing backlinks for active note "${activeNote.title}"`);
    
    const backlinks: Array<{ id: string; title: string }> = [];
    
    // ENHANCED: Search for both raw and highlighted backlinks
    allNotes.forEach(note => {
      if (note.id === activeNoteId) return; // Skip self-references
      
      // Check for backlinks using enhanced function
      if (extractBacklinksFromNoteContent(note.content || [], activeNote.title)) {
        backlinks.push({
          id: note.id,
          title: note.title
        });
        console.log(`useActiveNoteBacklinks: Found backlink in "${note.title}" pointing to "${activeNote.title}"`);
      }
    });
    
    console.log(`useActiveNoteBacklinks: Found ${backlinks.length} backlinks for active note "${activeNote.title}"`);
    return backlinks;
  }, { label: 'active_note_backlinks' });
  
  return store.useQuery(backlinksQuery);
}
