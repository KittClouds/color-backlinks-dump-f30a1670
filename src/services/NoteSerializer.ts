
import { NoteDocument } from '../serializable/NoteDocument';
import { Note, NoteId } from '@/lib/store';

export class NoteSerializer {
  /**
   * Converts a store Note to a serializable NoteDocument
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
      id: doc.id as NoteId, // Cast to NoteId type
      title: doc.title,
      content: doc.blocks,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      parentId: null,   // These fields are not part of the document
      type: 'note',     // but required by the Note type
      clusterId: null
    };
  }
  
  /**
   * Directly serialize a Note to JSON
   */
  static toJSON(note: Note): Record<string, any> {
    return this.toDocument(note).toJSON();
  }
  
  /**
   * Directly deserialize JSON to a Note
   */
  static fromJSON(json: Record<string, any>): Note {
    // Use NoteDocument's fromJSON method directly instead of the base class
    const doc = NoteDocument.fromJSON(json);
    return this.fromDocument(doc);
  }
}
