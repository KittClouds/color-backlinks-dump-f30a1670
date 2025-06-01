
import { NoteDocument } from '@/serializable/NoteDocument';
import { Note, NoteId } from '@/lib/store';
import { jsonManager } from '@/json-manager';

/**
 * Enhanced Note Serializer that uses Fort Knox JSON Management
 */
export class EnhancedNoteSerializer {
  /**
   * Converts a store Note to a serializable NoteDocument using JSON Manager
   */
  static toDocument(note: Note): NoteDocument {
    return new NoteDocument(
      note.id,
      note.title || '',
      note.content || [],
      note.createdAt,
      note.updatedAt
    );
  }

  /**
   * Converts a NoteDocument back to a store Note
   */
  static fromDocument(doc: NoteDocument): Note {
    return {
      id: doc.id as NoteId,
      title: doc.title,
      content: doc.blocks,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      parentId: null,
      type: 'note',
      clusterId: null
    };
  }
  
  /**
   * Serialize a Note to JSON using Fort Knox JSON Management
   */
  static toJSON(note: Note): Record<string, any> {
    try {
      const jsonString = jsonManager.serialize('note', note);
      return JSON.parse(jsonString);
    } catch (error) {
      console.warn('EnhancedNoteSerializer: JSON Manager serialization failed, using fallback');
      return this.toDocument(note).toJSON();
    }
  }
  
  /**
   * Deserialize JSON to a Note using Fort Knox JSON Management
   */
  static fromJSON(json: Record<string, any>): Note {
    try {
      return jsonManager.deserialize('note', JSON.stringify(json));
    } catch (error) {
      console.warn('EnhancedNoteSerializer: JSON Manager deserialization failed, using fallback');
      const doc = NoteDocument.fromJSON(json);
      return this.fromDocument(doc);
    }
  }
  
  /**
   * Validate Note JSON using Fort Knox JSON Management
   */
  static validateJSON(json: Record<string, any>): boolean {
    try {
      return jsonManager.validateJSON('note', JSON.stringify(json));
    } catch (error) {
      console.warn('EnhancedNoteSerializer: JSON validation failed:', error);
      return false;
    }
  }
  
  /**
   * Get serialization statistics
   */
  static getStats() {
    return jsonManager.getOperationStats();
  }
}
