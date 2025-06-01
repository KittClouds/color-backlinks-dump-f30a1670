
import { SerializationAdapter } from '../JSONManager';
import { blockNoteAdapter } from './BlockNoteAdapter';
import { cytoscapeAdapter } from './CytoscapeAdapter';
import { entityAdapter } from './EntityAdapter';
import { noteAdapter } from './NoteAdapter';
import { serializationAdapterRegistry } from '../interfaces/UnifiedSerializable';

/**
 * LiveStore Serialization Adapter
 * Handles LiveStore event/state serialization
 */
export class LiveStoreAdapter implements SerializationAdapter<any> {
  name = 'LiveStoreAdapter';
  version = '1.0.0';
  
  serialize(data: any): Record<string, any> {
    return {
      eventType: data.eventType || 'unknown',
      payload: data.payload || {},
      timestamp: data.timestamp || Date.now(),
      storeId: data.storeId,
      sessionId: data.sessionId,
      serializedAt: new Date().toISOString()
    };
  }
  
  deserialize(json: Record<string, any>): any {
    if (!json.eventType) {
      throw new Error('Invalid LiveStore data: missing eventType');
    }
    
    return {
      eventType: json.eventType,
      payload: json.payload || {},
      timestamp: json.timestamp,
      storeId: json.storeId,
      sessionId: json.sessionId
    };
  }
  
  validate(json: Record<string, any>): boolean {
    return !!(json.eventType && typeof json.eventType === 'string');
  }
  
  schema = {
    type: 'object',
    properties: {
      eventType: { type: 'string' },
      payload: { type: 'object' },
      timestamp: { type: 'number' },
      storeId: { type: 'string' },
      sessionId: { type: 'string' }
    },
    required: ['eventType']
  };
}

/**
 * Backward Compatibility Adapter
 * Handles legacy JSON formats and migrates them to new format
 */
export class BackwardCompatibilityAdapter implements SerializationAdapter<any> {
  name = 'BackwardCompatibilityAdapter';
  version = '1.0.0';
  
  serialize(data: any): Record<string, any> {
    // Add compatibility metadata
    return {
      ...data,
      _compatibility: {
        originalFormat: data._originalFormat || 'unknown',
        migratedAt: new Date().toISOString(),
        version: this.version
      }
    };
  }
  
  deserialize(json: Record<string, any>): any {
    // Handle various legacy formats
    if (this.isLegacyBlockNoteFormat(json)) {
      return this.migrateLegacyBlockNote(json);
    }
    
    if (this.isLegacyEntityFormat(json)) {
      return this.migrateLegacyEntity(json);
    }
    
    if (this.isLegacyNoteFormat(json)) {
      return this.migrateLegacyNote(json);
    }
    
    return json;
  }
  
  validate(json: Record<string, any>): boolean {
    // Always return true for compatibility adapter
    return true;
  }
  
  private isLegacyBlockNoteFormat(json: any): boolean {
    return Array.isArray(json) || (json.content && Array.isArray(json.content));
  }
  
  private isLegacyEntityFormat(json: any): boolean {
    return json.kind && json.label && !json._json_meta;
  }
  
  private isLegacyNoteFormat(json: any): boolean {
    return json.id && json.title && json.content && !json._json_meta;
  }
  
  private migrateLegacyBlockNote(json: any): any {
    const blocks = Array.isArray(json) ? json : json.content;
    return {
      blocks,
      count: blocks.length,
      serializedAt: new Date().toISOString(),
      _json_meta: {
        dataType: 'blocknote',
        version: '1.0.0',
        migrated: true,
        originalFormat: 'legacy'
      }
    };
  }
  
  private migrateLegacyEntity(json: any): any {
    return {
      kind: json.kind,
      label: json.label,
      attributes: json.attributes || {},
      serializedAt: new Date().toISOString(),
      _json_meta: {
        dataType: 'entity',
        version: '1.0.0',
        migrated: true,
        originalFormat: 'legacy'
      }
    };
  }
  
  private migrateLegacyNote(json: any): any {
    return {
      id: json.id,
      title: json.title,
      content: {
        blocks: json.content || [],
        count: (json.content || []).length,
        serializedAt: new Date().toISOString()
      },
      createdAt: json.createdAt || new Date().toISOString(),
      updatedAt: json.updatedAt || new Date().toISOString(),
      parentId: json.parentId,
      type: json.type || 'note',
      clusterId: json.clusterId,
      _json_meta: {
        dataType: 'note',
        version: '1.0.0',
        migrated: true,
        originalFormat: 'legacy'
      }
    };
  }
  
  schema = {
    type: 'object',
    additionalProperties: true
  };
}

export const liveStoreAdapter = new LiveStoreAdapter();
export const backwardCompatibilityAdapter = new BackwardCompatibilityAdapter();

/**
 * Initialize all unified adapters and register namespace mappings
 */
export function initializeUnifiedAdapters(): void {
  console.log('UnifiedAdapters: Initializing namespace mappings');
  
  // Register namespace mappings
  serializationAdapterRegistry.registerNamespace(['blocknote'], 'blocknote', blockNoteAdapter);
  serializationAdapterRegistry.registerNamespace(['cytoscape'], 'cytoscape', cytoscapeAdapter);
  serializationAdapterRegistry.registerNamespace(['entity'], 'entity', entityAdapter);
  serializationAdapterRegistry.registerNamespace(['app', 'note'], 'note', noteAdapter);
  serializationAdapterRegistry.registerNamespace(['livestore'], 'livestore', liveStoreAdapter);
  
  // Register compatibility namespace patterns
  serializationAdapterRegistry.registerNamespace(['legacy'], 'compatibility', backwardCompatibilityAdapter);
  serializationAdapterRegistry.registerNamespace(['compat'], 'compatibility', backwardCompatibilityAdapter);
  
  console.log('UnifiedAdapters: All namespace mappings registered');
}
