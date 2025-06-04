
import { graphService } from './GraphService';
import { parseNoteConnections } from '@/lib/utils/parsingUtils';
import { Note } from '@/lib/store';

/**
 * Service to sync parsed note connections with the graph
 */
export class NoteSyncService {
  /**
   * Update the graph when a note's content changes
   */
  public syncNoteToGraph(note: Note): void {
    if (note.type !== 'note' || !note.content) {
      return;
    }

    console.log(`[NoteSyncService] Syncing note ${note.id} (${note.title}) to graph`);

    // Parse all connections from note content
    const connections = parseNoteConnections(note.content);
    
    // Update graph with all parsed elements
    graphService.updateNoteConnections(
      note.id,
      connections.tags,
      connections.mentions,
      connections.links, // These are wiki links [[Title]]
      connections.entities,
      connections.triples
    );

    console.log(`[NoteSyncService] Synced note ${note.id}:`, {
      tags: connections.tags.length,
      mentions: connections.mentions.length,
      wikiLinks: connections.links.length,
      entities: connections.entities.length,
      triples: connections.triples.length
    });
  }

  /**
   * Sync multiple notes to the graph
   */
  public syncNotesToGraph(notes: Note[]): void {
    console.log(`[NoteSyncService] Syncing ${notes.length} notes to graph`);
    
    graphService.startBatchOperations();
    
    try {
      notes.forEach(note => this.syncNoteToGraph(note));
    } finally {
      graphService.endBatchOperations();
    }
    
    console.log(`[NoteSyncService] Finished syncing ${notes.length} notes`);
  }
}

// Export singleton instance
export const noteSyncService = new NoteSyncService();
