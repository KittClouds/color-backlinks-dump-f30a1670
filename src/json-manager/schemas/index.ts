
import { jsonSchemaRegistry } from './JSONSchemaRegistry';
import { blockNoteSchemas } from './BlockNoteSchema';
import { cytoscapeSchemas } from './CytoscapeSchema';
import { entitySchemas } from './EntitySchema';
import { noteSchemas } from './NoteSchema';
import { liveStoreSchemas } from './LiveStoreSchema';
import { kuzuSchemas } from './KuzuSchema';

/**
 * Initialize all schema registrations
 */
export function initializeSchemas(): void {
  console.log('Initializing schemas with Kuzu support...');
  
  // Register all schema collections
  const allSchemas = [
    ...blockNoteSchemas,
    ...cytoscapeSchemas,
    ...entitySchemas,
    ...noteSchemas,
    ...liveStoreSchemas,
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
