
import { jsonManager } from './JSONManager';
import { 
  blockNoteAdapter, 
  cytoscapeAdapter, 
  entityAdapter, 
  noteAdapter 
} from './adapters';
import { kuzuAdapter, kuzuSyncAdapter } from './adapters/KuzuAdapter';
import { initializeSchemas } from './schemas';

/**
 * JSON Registry - Central registration point for all adapters
 * Initializes the Fort Knox JSON Management System with backward compatibility
 */
export class JSONRegistry {
  private static initialized = false;
  
  /**
   * Initialize all JSON adapters and protection systems
   */
  static initialize(): void {
    if (this.initialized) {
      console.log('JSONRegistry: Already initialized');
      return;
    }
    
    console.log('JSONRegistry: Initializing Fort Knox JSON Management System with Kuzu Support');
    
    // Initialize schemas first (now includes Kuzu schemas)
    initializeSchemas();
    
    // Register all adapters including Kuzu ones and sync adapters
    jsonManager.registerAdapter('blocknote', blockNoteAdapter);
    jsonManager.registerAdapter('cytoscape', cytoscapeAdapter);
    jsonManager.registerAdapter('entity', entityAdapter);
    jsonManager.registerAdapter('note', noteAdapter);
    jsonManager.registerAdapter('kuzu', kuzuAdapter);
    jsonManager.registerAdapter('kuzu_sync', kuzuSyncAdapter);
    jsonManager.registerAdapter('kuzu_sync_operation', kuzuSyncAdapter); // Add sync operation adapter
    
    // Set up periodic cleanup
    setInterval(() => {
      jsonManager.cleanup();
    }, 300000); // Clean every 5 minutes
    
    this.initialized = true;
    console.log('JSONRegistry: Fort Knox JSON Management System with Kuzu Support ready');
    
    // Log comprehensive report
    const report = jsonManager.getSchemaReport();
    console.log('JSONRegistry: Schema validation ready for types:', report.registeredTypes);
    console.log('JSONRegistry: Kuzu adapters and schemas registered');
  }
  
  /**
   * Get initialization status
   */
  static isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Force re-initialization (use with caution)
   */
  static forceReinitialize(): void {
    this.initialized = false;
    this.initialize();
  }
}

// Auto-initialize when module is imported
JSONRegistry.initialize();

export { jsonManager } from './JSONManager';
export * from './adapters';
export * from './schemas';
