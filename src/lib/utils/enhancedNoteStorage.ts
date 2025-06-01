
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
      // Use jsonManager directly instead of EnhancedNoteSerializer
      const result = jsonManager.serialize('note', note as any);
      if (result.success && result.data) {
        localStorage.setItem(`note-${note.id}`, JSON.stringify(result.data));
        console.log(`enhancedNoteStorage: Successfully saved note ${note.id}`);
        return true;
      } else {
        console.warn('enhancedNoteStorage: Note serialization failed, attempting to save anyway');
        localStorage.setItem(`note-${note.id}`, JSON.stringify(note));
        return true;
      }
    } catch (error) {
      console.error('enhancedNoteStorage: Failed to save note:', error);
      return false;
    }
  },

  /**
   * Load a note from local storage with validation
   */
  loadNote(noteId: string): Note | null {
    try {
      const jsonString = localStorage.getItem(`note-${noteId}`);
      if (!jsonString) return null;
      
      const json = JSON.parse(jsonString);
      
      // Try to deserialize using jsonManager
      const result = jsonManager.deserialize('note', json);
      if (result.success && result.data) {
        console.log(`enhancedNoteStorage: Successfully loaded note ${noteId}`);
        return result.data as Note;
      } else {
        console.warn(`enhancedNoteStorage: Deserialization failed for note ${noteId}, returning raw data`);
        return json as Note;
      }
    } catch (error) {
      console.error('enhancedNoteStorage: Failed to load note:', error);
      return null;
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
          const json = JSON.parse(jsonString);
          const result = jsonManager.validate('note', json);
          if (result.success) {
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
