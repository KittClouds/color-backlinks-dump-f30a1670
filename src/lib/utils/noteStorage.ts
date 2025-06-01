
import { NoteSerializer } from '@/services/NoteSerializer';
import { Note } from '@/lib/store';

/**
 * Example utility showing how to persist notes using the serialization system
 */
export const noteStorage = {
  /**
   * Save a note to local storage
   */
  saveNote(note: Note): void {
    try {
      const json = NoteSerializer.toJSON(note);
      localStorage.setItem(`note-${note.id}`, JSON.stringify(json));
    } catch (error) {
      console.error('Failed to save note to storage:', error);
    }
  },

  /**
   * Load a note from local storage
   */
  loadNote(noteId: string): Note | null {
    try {
      const jsonString = localStorage.getItem(`note-${noteId}`);
      if (!jsonString) return null;
      
      const json = JSON.parse(jsonString);
      return NoteSerializer.fromJSON(json);
    } catch (error) {
      console.error('Failed to load note from storage:', error);
      return null;
    }
  },

  /**
   * Delete a note from local storage
   */
  deleteNote(noteId: string): void {
    try {
      localStorage.removeItem(`note-${noteId}`);
    } catch (error) {
      console.error('Failed to delete note from storage:', error);
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
  }
};
