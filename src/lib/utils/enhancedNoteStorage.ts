
import { Note } from '@/lib/store';
import { jsonManager } from '@/json-manager';

/**
 * Enhanced note storage using Fort Knox JSON Management
 */
export const enhancedNoteStorage = {
  /**
   * Save a note to local storage with comprehensive protection
   */
  saveNote(note: Note): boolean {
    try {
      // Use jsonManager.serialize which returns a string directly
      const serializedData = jsonManager.serialize('note', note);
      localStorage.setItem(`note-${note.id}`, serializedData);
      console.log(`enhancedNoteStorage: Successfully saved note ${note.id}`);
      return true;
    } catch (error) {
      console.error('enhancedNoteStorage: Failed to save note:', error);
      // Fallback to direct JSON storage
      try {
        localStorage.setItem(`note-${note.id}`, JSON.stringify(note));
        console.warn('enhancedNoteStorage: Saved note with fallback method');
        return true;
      } catch (fallbackError) {
        console.error('enhancedNoteStorage: Fallback save also failed:', fallbackError);
        return false;
      }
    }
  },

  /**
   * Load a note from local storage with validation
   */
  loadNote(noteId: string): Note | null {
    try {
      const jsonString = localStorage.getItem(`note-${noteId}`);
      if (!jsonString) return null;
      
      // Try to deserialize using jsonManager (returns data directly)
      const data = jsonManager.deserialize('note', jsonString);
      console.log(`enhancedNoteStorage: Successfully loaded note ${noteId}`);
      return data as Note;
    } catch (error) {
      console.error('enhancedNoteStorage: Failed to load note:', error);
      // Fallback to direct JSON parsing
      try {
        const jsonString = localStorage.getItem(`note-${noteId}`);
        if (!jsonString) return null;
        const data = JSON.parse(jsonString);
        console.warn(`enhancedNoteStorage: Loaded note ${noteId} with fallback method`);
        return data as Note;
      } catch (fallbackError) {
        console.error('enhancedNoteStorage: Fallback load also failed:', fallbackError);
        return null;
      }
    }
  },

  /**
   * Delete a note from local storage
   */
  deleteNote(noteId: string): boolean {
    try {
      localStorage.removeItem(`note-${noteId}`);
      console.log(`enhancedNoteStorage: Successfully deleted note ${noteId}`);
      return true;
    } catch (error) {
      console.error('enhancedNoteStorage: Failed to delete note:', error);
      return false;
    }
  },
  
  /**
   * Get all note IDs from local storage
   */
  getAllNoteIds(): string[] {
    const ids: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('note-')) {
        ids.push(key.substring(5));
      }
    }
    return ids;
  },
  
  /**
   * Validate all stored notes
   */
  validateAllNotes(): { valid: string[], invalid: string[], stats: any } {
    const noteIds = this.getAllNoteIds();
    const valid: string[] = [];
    const invalid: string[] = [];
    
    for (const noteId of noteIds) {
      try {
        const jsonString = localStorage.getItem(`note-${noteId}`);
        if (jsonString) {
          // Use validateJSON method instead of validate
          const isValid = jsonManager.validateJSON('note', jsonString);
          if (isValid) {
            valid.push(noteId);
          } else {
            invalid.push(noteId);
          }
        }
      } catch (error) {
        invalid.push(noteId);
      }
    }
    
    return {
      valid,
      invalid,
      stats: jsonManager.getOperationStats()
    };
  }
};
