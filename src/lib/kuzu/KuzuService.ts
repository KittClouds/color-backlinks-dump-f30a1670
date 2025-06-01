import kuzuWasm from "kuzu-wasm";
import { KuzuSchemaManager } from './KuzuSchemaManager';
import { KuzuQueryResult } from './types';
import { atomicJSONManager } from '@/json-manager/AtomicJSONManager';
import { jsonSafetyManager } from '@/json-manager/SafetyManager';

/**
 * Unified KuzuService - Adopts official Kuzu patterns while preserving all existing functionality
 * Singleton service that manages database initialization, connections, and operations
 */
class KuzuService {
  private kuzu: any = null;
  private db: any = null;
  private schemaManager: KuzuSchemaManager | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private _schema: any = null;

  constructor() {
    // Set worker path similar to official example
    if (typeof window !== 'undefined') {
      // Type assertion to avoid TypeScript error
      (window as any).kuzu = this; // For debugging, like official example
    }
  }

  /**
   * Initialize Kuzu with lazy loading pattern from official example
   */
  async init(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    if (this.isInitialized) {
      return;
    }

    this.initializationPromise = this._performInit();
    await this.initializationPromise;
    this.initializationPromise = null;
  }

  private async _performInit(): Promise<void> {
    try {
      console.time("Kùzu init");
      
      // 1 · Load WASM & point to worker (from your existing pattern)
      kuzuWasm.setWorkerPath("/js/kuzu_wasm_worker.js");
      this.kuzu = await kuzuWasm();

      // 2 · Mount an IDB-backed folder so /kuzu persists (from your existing pattern)
      if (!this.kuzu.FS.analyzePath("/kuzu").exists) {
        this.kuzu.FS.mkdir("/kuzu");
      }
      this.kuzu.FS.mount(this.kuzu.IDBFS, {}, "/kuzu");

      // 3 · Pull any existing DB file from IndexedDB (from your existing pattern)
      await new Promise<void>((res, rej) =>
        this.kuzu.FS.syncfs(true, err => (err ? rej(err) : res()))
      );

      // 4 · Create database - using official example's approach with persistence path
      this.db = new this.kuzu.Database("/kuzu/main.kuzu");

      // 5 · Test connection and get version (from official example)
      const testConn = new this.kuzu.Connection(this.db);
      try {
        const versionResult = await testConn.query(`CALL db_version() RETURN *;`);
        const version = (await versionResult.getAllRows())[0][0];
        console.log("Kùzu WebAssembly module version:", version);
        await versionResult.close();
      } finally {
        await testConn.close();
      }

      // 6 · Initialize schema manager (from your existing pattern)
      const conn = new this.kuzu.Connection(this.db);
      try {
        this.schemaManager = new KuzuSchemaManager(conn);
        await this.schemaManager.initializeSchema();
        
        // Validate schema was created properly
        const validation = await this.schemaManager.validateSchema();
        if (!validation.isValid) {
          console.warn('KuzuService: Schema validation warnings:', validation.errors);
        } else {
          console.log('KuzuService: Schema validation passed');
        }

        // Optional: Enable vector extension if available
        try {
          await this.schemaManager.enableVectorExtension();
        } catch (error) {
          console.log('KuzuService: Vector extension not available, continuing without it');
        }
      } finally {
        await conn.close();
      }

      // 7 · Get initial schema (from official example pattern)
      this._schema = await this.getSchema();

      // 8 · Set up persistence flush (from your existing pattern)
      const flush = () => this.kuzu.FS.syncfs(false, err => {
        if (err) console.error("Kùzu sync-error:", err);
      });
      if (typeof window !== 'undefined') {
        window.addEventListener("beforeunload", flush);
      }

      this.isInitialized = true;
      console.timeEnd("Kùzu init");
      console.log('KuzuService: Complete graph database with schema ready');
      
    } catch (error) {
      console.error("Failed to initialize Kùzu:", error);
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Get database instance with lazy initialization (from official example)
   */
  async getDb(): Promise<any> {
    if (!this.db) {
      await this.init();
    }
    return this.db;
  }

  /**
   * Get schema manager instance
   */
  async getSchemaManager(): Promise<KuzuSchemaManager> {
    if (!this.schemaManager) {
      await this.init();
    }
    return this.schemaManager!;
  }

  /**
   * Get schema using official example's pattern with your enhancements
   */
  async getSchema(): Promise<any> {
    const db = await this.getDb();
    const conn = new this.kuzu.Connection(db);
    
    try {
      let result = await conn.query("CALL show_tables() RETURN *;");
      const tables = await result.getAllObjects();
      await result.close();
      
      const nodeTables: any[] = [];
      const relTables: any[] = [];
      
      for (const table of tables) {
        result = await conn.query(`CALL TABLE_INFO('${table.name}') RETURN *;`);
        const properties = (await result.getAllObjects())
          .map((property: any) => ({
            name: property.name,
            type: property.type,
            isPrimaryKey: property["primary key"],
          }));
        await result.close();
        
        if (table.type === 'NODE') {
          delete table["type"];
          table.properties = properties;
          nodeTables.push(table);
        } else if (table.type === 'REL') {
          delete table["type"];
          properties.forEach((property: any) => {
            delete property.isPrimaryKey;
          });
          table.properties = properties;
          
          result = await conn.query(`CALL SHOW_CONNECTION('${table.name}') RETURN *;`);
          const connectivity = await result.getAllObjects();
          await result.close();
          
          table.connectivity = [];
          connectivity.forEach((c: any) => {
            table.connectivity.push({
              src: c["source table name"],
              dst: c["destination table name"],
            });
          });
          relTables.push(table);
        }
      }
      
      nodeTables.sort((a, b) => a.name.localeCompare(b.name));
      relTables.sort((a, b) => a.name.localeCompare(b.name));
      
      return { nodeTables, relTables };
    } finally {
      await conn.close();
    }
  }

  /**
   * Process single result using official example's pattern
   */
  async processSingleResult(result: any): Promise<any> {
    const rows = await result.getAllObjects();
    const columnTypes = await result.getColumnTypes();
    const columnNames = await result.getColumnNames();
    const dataTypes: Record<string, any> = {};
    
    columnNames.forEach((name: string, i: number) => {
      dataTypes[name] = columnTypes[i];
    });
    
    return { rows, dataTypes };
  }

  /**
   * Enhanced query method combining official example's patterns with your safety features
   */
  async query(
    statement: string, 
    params: Record<string, any> = {}
  ): Promise<Array<Record<string, any>>> {
    // Input validation from official example
    if (!statement || typeof statement !== "string") {
      throw new Error("The statement must be a string with length > 0");
    }
    if (params && typeof params !== "object") {
      throw new Error("Params must be an object");
    }

    await this.init(); // Ensure initialization
    const db = await this.getDb();
    const conn = new this.kuzu.Connection(db);
    
    const operationId = `kuzu-query-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    try {
      // Create safety backup (your existing pattern)
      const backupId = jsonSafetyManager.createBackup('kuzu_query', 'execute', {
        statement,
        params,
        timestamp: Date.now()
      });

      console.log(`KuzuService: Executing query with backup ${backupId}`);
      
      // Execute atomic query operation (your existing pattern)
      const atomicResult = await atomicJSONManager.atomicSerialize('kuzu_query_execution', {
        query: statement,
        params,
        operationId
      });

      if (!atomicResult.success) {
        throw new Error(`Query preparation failed: ${atomicResult.error}`);
      }

      // Execute query using official example's pattern
      let result;
      if (!params || Object.keys(params).length === 0) {
        result = await conn.query(statement);
      } else {
        const preparedStatement = await conn.prepare(statement);
        result = await conn.execute(preparedStatement, params);
        await preparedStatement.close();
      }

      // Check for schema changes (from official example)
      let isSchemaChanged = false;
      const currentSchema = await this.getSchema();
      isSchemaChanged = JSON.stringify(this._schema) !== JSON.stringify(currentSchema);
      
      if (isSchemaChanged) {
        this._schema = currentSchema;
      }

      // Process results using official example's pattern
      let responseBody;
      if (!result.hasNextQueryResult()) {
        responseBody = await this.processSingleResult(result);
        await result.close();
        responseBody.isSchemaChanged = isSchemaChanged;
        responseBody.isMultiStatement = false;
      } else {
        responseBody = {
          isSchemaChanged,
          isMultiStatement: true,
          results: [],
        };
        let currentResult = result;
        while (currentResult) {
          const singleResultBody = await this.processSingleResult(currentResult);
          responseBody.results.push(singleResultBody);
          if (!currentResult.hasNextQueryResult()) {
            break;
          }
          currentResult = await currentResult.getNextQueryResult();
        }
        await result.close();
      }

      // Return rows in your expected format
      const rows = responseBody.isMultiStatement ? 
        responseBody.results.flatMap((r: any) => r.rows) : 
        responseBody.rows;

      console.log(`KuzuService: Query executed successfully, ${rows.length} rows returned`);
      return rows;

    } catch (error) {
      console.error(`KuzuService: Query execution failed for operation ${operationId}:`, error);
      
      // Attempt corruption detection and recovery (your existing pattern)
      const corruption = jsonSafetyManager.detectCorruption('kuzu_query', statement, operationId);
      if (corruption) {
        console.warn(`KuzuService: Query corruption detected: ${corruption.details}`);
      }
      
      throw error;
    } finally {
      await conn.close();
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.isInitialized = false;
      this.schemaManager = null;
    }
  }

  /**
   * Get filesystem access (for debugging/utilities)
   */
  getFS(): any {
    return this.kuzu?.FS;
  }

  /**
   * Get diagnostics information
   */
  async getDiagnostics(): Promise<{
    schema: any;
    tableCount: number;
    indexCount: number;
    isInitialized: boolean;
    version?: string;
  }> {
    try {
      await this.init();
      const schema = await this.getSchema();
      
      // Get version info
      const conn = new this.kuzu.Connection(this.db);
      let version;
      try {
        const versionResult = await conn.query(`CALL db_version() RETURN *;`);
        version = (await versionResult.getAllRows())[0][0];
        await versionResult.close();
      } finally {
        await conn.close();
      }
      
      return {
        schema,
        tableCount: (schema.nodeTables?.length || 0) + (schema.relTables?.length || 0),
        indexCount: 4, // Known indices from schema
        isInitialized: this.isInitialized,
        version
      };
    } catch (error) {
      console.error('KuzuService: Failed to get diagnostics:', error);
      return {
        schema: {},
        tableCount: 0,
        indexCount: 0,
        isInitialized: this.isInitialized
      };
    }
  }
}

// Singleton instance (following official example pattern)
const kuzuService = new KuzuService();
export default kuzuService;

// Named export for compatibility
export { kuzuService };
