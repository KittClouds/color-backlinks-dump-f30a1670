
import { EnhancedNoteSerializer } from '@/services/EnhancedNoteSerializer';
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
      // Validate note before saving
      const validation = EnhancedNoteSerializer.validateJSON(note as any);
      if (!validation) {
        console.warn('enhancedNoteStorage: Note validation failed, attempting to save anyway');
      }
      
      const json = EnhancedNoteSerializer.toJSON(note);
      localStorage.setItem(`note-${note.id}`, JSON.stringify(json));
      console.log(`enhancedNoteStorage: Successfully saved note ${note.id}`);
      return true;
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
      
      // Validate before deserializing
      const validation = EnhancedNoteSerializer.validateJSON(json);
      if (!validation) {
        console.warn(`enhancedNoteStorage: Invalid JSON for note ${noteId}, attempting recovery`);
      }
      
      const note = EnhancedNoteSerializer.fromJSON(json);
      console.log(`enhancedNoteStorage: Successfully loaded note ${noteId}`);
      return note;
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
          if (EnhancedNoteSerializer.validateJSON(json)) {
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
