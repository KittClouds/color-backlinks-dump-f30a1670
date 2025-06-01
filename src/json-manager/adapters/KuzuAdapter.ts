
import { SerializationAdapter } from '../JSONManager';
import { 
  AllKuzuNodes, 
  AllKuzuRels, 
  KuzuQueryResult,
  KuzuSyncElement,
  KuzuSyncOperation
} from '@/lib/kuzu/types';

/**
 * Kuzu JSON Adapter - Secure serialization for Kuzu data types
 * Follows the established CytoscapeAdapter pattern with Kuzu-specific features
 */
export const kuzuAdapter: SerializationAdapter<AllKuzuNodes | AllKuzuRels | KuzuQueryResult> = {
  name: 'KuzuAdapter',
  version: '1.0.0',
  
  serialize: (data: AllKuzuNodes | AllKuzuRels | KuzuQueryResult) => {
    // Handle different Kuzu data types
    if ('rows' in data && 'columns' in data) {
      // KuzuQueryResult
      return {
        dataType: 'kuzu_query_result',
        rows: data.rows,
        columns: data.columns,
        statistics: data.statistics || {},
        metadata: {
          resultType: 'query',
          rowCount: data.rows.length,
          columnCount: data.columns.length
        }
      };
    } else if ('id' in data) {
      // Node or Relationship data
      const baseData = {
        id: data.id,
        ...data
      };
      
      // Determine the type based on properties
      let dataType = 'kuzu_node';
      if ('title' in data && 'content' in data) {
        dataType = 'kuzu_note';
      } else if ('kind' in data && 'label' in data) {
        dataType = 'kuzu_entity';
      } else if ('predicate' in data) {
        dataType = 'kuzu_global_triple';
      } else if ('role' in data) {
        dataType = 'kuzu_thread_message';
      } else if ('count' in data && 'notes' in data) {
        dataType = 'kuzu_relationship';
      }
      
      return {
        dataType,
        ...baseData,
        metadata: {
          serializedAt: Date.now(),
          adapterVersion: '1.0.0'
        }
      };
    }
    
    // Fallback for unknown data
    return {
      dataType: 'kuzu_unknown',
      data,
      metadata: {
        serializedAt: Date.now(),
        warning: 'Unknown Kuzu data type'
      }
    };
  },
  
  deserialize: (json: Record<string, any>) => {
    const { dataType, metadata, ...data } = json;
    
    // Validate metadata
    if (metadata?.adapterVersion && metadata.adapterVersion !== '1.0.0') {
      console.warn(`KuzuAdapter: Version mismatch - expected 1.0.0, got ${metadata.adapterVersion}`);
    }
    
    // Handle query results
    if (dataType === 'kuzu_query_result') {
      return {
        rows: data.rows || [],
        columns: data.columns || [],
        statistics: data.statistics || {}
      } as KuzuQueryResult;
    }
    
    // Handle nodes and relationships
    if (dataType?.startsWith('kuzu_')) {
      // Remove our metadata and return the clean data
      const { metadata: _, dataType: __, ...cleanData } = data;
      return cleanData;
    }
    
    // Fallback - return the clean data without metadata
    const { metadata: _, dataType: __, ...cleanData } = data;
    return cleanData;
  },
  
  validate: (json: Record<string, any>) => {
    // Basic structure validation
    if (!json || typeof json !== 'object') {
      return false;
    }
    
    // Must have a dataType
    if (!json.dataType || typeof json.dataType !== 'string') {
      return false;
    }
    
    // Validate based on data type
    if (json.dataType === 'kuzu_query_result') {
      return Array.isArray(json.rows) && Array.isArray(json.columns);
    }
    
    if (json.dataType?.startsWith('kuzu_')) {
      // Must have an id for nodes/relationships
      return typeof json.id === 'string' && json.id.length > 0;
    }
    
    return true;
  },
  
  schema: {
    type: 'object',
    properties: {
      dataType: { type: 'string' },
      id: { type: 'string' },
      metadata: {
        type: 'object',
        properties: {
          serializedAt: { type: 'number' },
          adapterVersion: { type: 'string' }
        }
      }
    },
    required: ['dataType']
  }
};

/**
 * Specialized adapter for Kuzu sync operations
 */
export const kuzuSyncAdapter: SerializationAdapter<KuzuSyncElement | KuzuSyncOperation> = {
  name: 'KuzuSyncAdapter',
  version: '1.0.0',
  
  serialize: (data: KuzuSyncElement | KuzuSyncOperation) => {
    if ('operation' in data && 'kuzuQuery' in data) {
      // KuzuSyncOperation
      return {
        dataType: 'kuzu_sync_operation',
        id: data.id,
        operation: data.operation,
        elementType: data.elementType,
        kuzuQuery: data.kuzuQuery,
        parameters: data.parameters,
        timestamp: data.timestamp,
        metadata: {
          syncType: 'operation',
          serializedAt: Date.now()
        }
      };
    } else {
      // KuzuSyncElement
      return {
        dataType: 'kuzu_sync_element',
        id: data.id,
        type: data.type,
        kuzuType: data.kuzuType,
        data: data.data,
        lastSynced: data.lastSynced,
        metadata: {
          syncType: 'element',
          serializedAt: Date.now()
        }
      };
    }
  },
  
  deserialize: (json: Record<string, any>): KuzuSyncElement | KuzuSyncOperation => {
    const { dataType, metadata, ...data } = json;
    
    if (dataType === 'kuzu_sync_operation') {
      return {
        id: data.id,
        operation: data.operation,
        elementType: data.elementType,
        kuzuQuery: data.kuzuQuery,
        parameters: data.parameters,
        timestamp: data.timestamp
      } as KuzuSyncOperation;
    } else if (dataType === 'kuzu_sync_element') {
      return {
        id: data.id,
        type: data.type,
        kuzuType: data.kuzuType,
        data: data.data,
        lastSynced: data.lastSynced
      } as KuzuSyncElement;
    }
    
    // This should never happen if validate() passes, but we need a fallback
    throw new Error(`Invalid sync data type: ${dataType}`);
  },
  
  validate: (json: Record<string, any>) => {
    if (!json?.dataType?.startsWith('kuzu_sync_')) {
      return false;
    }
    
    if (!json.id || typeof json.id !== 'string') {
      return false;
    }
    
    if (json.dataType === 'kuzu_sync_operation') {
      return !!(json.operation && json.elementType && json.kuzuQuery);
    }
    
    if (json.dataType === 'kuzu_sync_element') {
      return !!(json.type && json.kuzuType && json.data);
    }
    
    return false;
  }
};
