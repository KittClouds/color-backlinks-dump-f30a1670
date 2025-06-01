
import { jsonSchemaRegistry } from './JSONSchemaRegistry';
import { blockNoteSchemaV1 } from './BlockNoteSchema';
import { cytoscapeSchemaV1 } from './CytoscapeSchema';
import { entitySchemaV1 } from './EntitySchema';
import { noteSchemaV1 } from './NoteSchema';
import { liveStoreSchemaV1 } from './LiveStoreSchema';
import { kuzuSchemas } from './KuzuSchema';

/**
 * Initialize all schema registrations
 */
export function initializeSchemas(): void {
  console.log('Initializing schemas with Kuzu support...');
  
  // Register individual schemas and Kuzu schema collection
  const allSchemas = [
    blockNoteSchemaV1,
    cytoscapeSchemaV1,
    entitySchemaV1,
    noteSchemaV1,
    liveStoreSchemaV1,
    ...kuzuSchemas
  ];
  
  for (const schema of allSchemas) {
    jsonSchemaRegistry.registerSchema(schema.id, schema);
  }
  
  console.log(`Schemas initialized: ${allSchemas.length} schemas registered including Kuzu support`);
}

// Re-export everything
export * from './JSONSchemaRegistry';
export * from './BlockNoteSchema';
export * from './CytoscapeSchema';
export * from './EntitySchema';
export * from './NoteSchema';
export * from './LiveStoreSchema';
export * from './KuzuSchema';
