
import { useStore } from '@livestore/react';
import { notes$, activeNoteId$ } from '../livestore/queries';
import { computed } from '@livestore/livestore';

// FIXED: Helper function to extract raw text from note content for backlink search
function extractTextFromNoteContent(content: any[]): string {
  if (!Array.isArray(content)) return '';
  
  return content.map(block => {
    if (!block.content || !Array.isArray(block.content)) return '';
    return block.content.map((item: any) => {
      if (item.type === 'text' && 'text' in item) {
        return item.text;
      }
      return '';
    }).join('');
  }).join('\n');
}

// FIXED: Hook to get backlinks for a specific note title
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
    
    // FIXED: Search for <<currentNoteTitle>> syntax directly in note content
    allNotes.forEach(note => {
      // Skip the current note itself
      if (note.title === currentNoteTitle) return;
      
      // Extract raw text from note content
      const noteText = extractTextFromNoteContent(note.content || []);
      
      // FIXED: Look for <<currentNoteTitle>> syntax (backlinks)
      const backlinkPattern = new RegExp(`<<\\s*${currentNoteTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:\\|[^>]*)?>>`, 'g');
      
      if (backlinkPattern.test(noteText)) {
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

// FIXED: Hook to get backlinks for the currently active note
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
    
    // FIXED: Search for <<activeNote.title>> syntax directly in note content
    allNotes.forEach(note => {
      if (note.id === activeNoteId) return; // Skip self-references
      
      // Extract raw text from note content
      const noteText = extractTextFromNoteContent(note.content || []);
      
      // FIXED: Look for <<activeNote.title>> syntax (backlinks)
      const backlinkPattern = new RegExp(`<<\\s*${activeNote.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:\\|[^>]*)?>>`, 'g');
      
      if (backlinkPattern.test(noteText)) {
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
