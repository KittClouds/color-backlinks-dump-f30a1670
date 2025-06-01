
import kuzuService from './KuzuService';

/** 
 * Legacy initialization function - now delegates to unified KuzuService
 * Maintains backward compatibility while using new patterns
 */
export async function initKuzu() {
  try {
    // Initialize the service
    await kuzuService.init();
    
    // Get the required components
    const db = await kuzuService.getDb();
    const schemaManager = await kuzuService.getSchemaManager();
    
    // Create a connection for compatibility
    const kuzu = (kuzuService as any).kuzu;
    const conn = new kuzu.Connection(db);
    
    console.log('initKuzu: Complete graph database with schema ready (via KuzuService)');
    
    return { kuzu, db, conn, schemaManager };
  } catch (error) {
    console.error("Failed to initialize Kùzu:", error);
    throw error;
  }
}
