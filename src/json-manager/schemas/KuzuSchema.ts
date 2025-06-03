import { JSONSchemaDefinition } from './JSONSchemaRegistry';

/**
 * Kuzu Node Schema Definitions
 */
export const kuzuNoteSchema: JSONSchemaDefinition = {
  id: 'kuzu_note',
  version: '1.0.0',
  schema: {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      title: { type: 'string' },
      slugTitle: { type: 'string' },
      content: { type: 'string' }, // JSON string
      type: { type: 'string', enum: ['note', 'folder'] },
      createdAt: { type: 'string' }, // ISO timestamp
      updatedAt: { type: 'string' },
      path: { type: 'string' },
      clusterId: { type: 'string' },
      parentId: { type: 'string' }
    },
    required: ['id']
  },
  validate: (data: any) => {
    const errors: string[] = [];
    
    if (!data.id || typeof data.id !== 'string') {
      errors.push('Note must have a valid string id');
    }
    
    if (data.type && !['note', 'folder'].includes(data.type)) {
      errors.push('Note type must be "note" or "folder"');
    }
    
    if (data.createdAt && isNaN(Date.parse(data.createdAt))) {
      errors.push('createdAt must be a valid timestamp');
    }
    
    if (data.updatedAt && isNaN(Date.parse(data.updatedAt))) {
      errors.push('updatedAt must be a valid timestamp');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

export const kuzuEntitySchema: JSONSchemaDefinition = {
  id: 'kuzu_entity',
  version: '1.0.0',
  schema: {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      kind: { type: 'string' },
      label: { type: 'string' },
      attributes: { type: 'string' }, // JSON blob
      embedding: { 
        type: 'array',
        items: { type: 'number' },
        maxItems: 768
      }
    },
    required: ['id']
  },
  validate: (data: any) => {
    const errors: string[] = [];
    
    if (!data.id || typeof data.id !== 'string') {
      errors.push('Entity must have a valid string id');
    }
    
    if (data.attributes && typeof data.attributes === 'string') {
      try {
        JSON.parse(data.attributes);
      } catch {
        errors.push('Entity attributes must be valid JSON string');
      }
    }
    
    if (data.embedding && (!Array.isArray(data.embedding) || data.embedding.length > 768)) {
      errors.push('Entity embedding must be array with max 768 dimensions');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

export const kuzuClusterSchema: JSONSchemaDefinition = {
  id: 'kuzu_cluster',
  version: '1.0.0',
  schema: {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      title: { type: 'string' },
      createdAt: { type: 'string' },
      updatedAt: { type: 'string' }
    },
    required: ['id']
  },
  validate: (data: any) => {
    const errors: string[] = [];
    
    if (!data.id || typeof data.id !== 'string') {
      errors.push('Cluster must have a valid string id');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

export const kuzuGlobalTripleSchema: JSONSchemaDefinition = {
  id: 'kuzu_global_triple',
  version: '1.0.0',
  schema: {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      predicate: { type: 'string' },
      notes: { type: 'string' } // JSON array
    },
    required: ['id']
  },
  validate: (data: any) => {
    const errors: string[] = [];
    
    if (!data.id || typeof data.id !== 'string') {
      errors.push('GlobalTriple must have a valid string id');
    }
    
    if (data.notes && typeof data.notes === 'string') {
      try {
        const parsed = JSON.parse(data.notes);
        if (!Array.isArray(parsed)) {
          errors.push('GlobalTriple notes must be JSON array');
        }
      } catch {
        errors.push('GlobalTriple notes must be valid JSON array string');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

export const kuzuQueryResultSchema: JSONSchemaDefinition = {
  id: 'kuzu_query_result',
  version: '1.0.0',
  schema: {
    type: 'object',
    properties: {
      rows: { 
        type: 'array',
        items: { type: 'object' }
      },
      columns: {
        type: 'array',
        items: { type: 'string' }
      },
      statistics: {
        type: 'object',
        properties: {
          nodesCreated: { type: 'number' },
          relationshipsCreated: { type: 'number' },
          propertiesSet: { type: 'number' },
          executionTime: { type: 'number' }
        }
      }
    },
    required: ['rows', 'columns']
  },
  validate: (data: any) => {
    const errors: string[] = [];
    
    if (!Array.isArray(data.rows)) {
      errors.push('Query result must have rows array');
    }
    
    if (!Array.isArray(data.columns)) {
      errors.push('Query result must have columns array');
    }
    
    if (data.statistics && typeof data.statistics !== 'object') {
      errors.push('Query result statistics must be object');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

export const kuzuSyncElementSchema: JSONSchemaDefinition = {
  id: 'kuzu_sync_element',
  version: '1.0.0',
  schema: {
    type: 'object',
    properties: {
      id: { type: 'string', minLength: 1 },
      type: { type: 'string', enum: ['node', 'edge'] },
      kuzuType: { type: 'string' },
      data: { type: 'object' },
      lastSynced: { type: 'number' }
    },
    required: ['id', 'type', 'kuzuType', 'data']
  },
  validate: (data: any) => {
    const errors: string[] = [];
    
    if (!data.id || typeof data.id !== 'string') {
      errors.push('Sync element must have valid id');
    }
    
    if (!['node', 'edge'].includes(data.type)) {
      errors.push('Sync element type must be "node" or "edge"');
    }
    
    if (!data.kuzuType || typeof data.kuzuType !== 'string') {
      errors.push('Sync element must have valid kuzuType');
    }
    
    if (!data.data || typeof data.data !== 'object') {
      errors.push('Sync element must have data object');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

// Export all Kuzu schemas
export const kuzuSchemas = [
  kuzuNoteSchema,
  kuzuEntitySchema,
  kuzuClusterSchema,
  kuzuGlobalTripleSchema,
  kuzuQueryResultSchema,
  kuzuSyncElementSchema
];
