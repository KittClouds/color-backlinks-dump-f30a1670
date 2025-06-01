
import kuzuWasm from "kuzu-wasm";
import { KuzuSchemaManager } from './KuzuSchemaManager';
import { atomicJSONManager } from '@/json-manager/AtomicJSONManager';
import { jsonSafetyManager } from '@/json-manager/SafetyManager';
import { Kuzu, KuzuDatabase, KuzuConnection, KuzuQueryResult } from './KuzuTypes';

/**
 * Improved KuzuService with proper typing and optimized schema management
 * Singleton service that manages database initialization, connections, and operations
 */
class KuzuService {
  private kuzu!: Kuzu;
  private db!: KuzuDatabase;
  private schemaManager!: KuzuSchemaManager;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  // Cached "fingerprint" of the schema (e.g. array of table names)
  private schemaFingerprint: string[] = [];

  constructor() {
    // Set worker path similar to official example
    if (typeof window !== 'undefined') {
      // Type assertion to avoid TypeScript error
      (window as any).kuzu = this; // For debugging, like official example
    }
  }

  /**
   * Initialize Kuzu with lazy loading pattern
   */
  async init(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    if (this.isInitialized) return;

    this.initializationPromise = this._performInit();
    try {
      await this.initializationPromise;
    } catch (e) {
      // If something goes wrong, reset so next init can try again
      this.initializationPromise = null;
      throw e;
    }
    this.initializationPromise = null;
  }

  private async _performInit(): Promise<void> {
    try {
      console.time("Kuzu init");
      
      // 1 · Load WASM & point to worker
      kuzuWasm.setWorkerPath("/js/kuzu_wasm_worker.js");
      this.kuzu = await kuzuWasm() as Kuzu;

      // 2 · Mount an IDB-backed folder so /kuzu persists
      if (!this.kuzu.FS.analyzePath("/kuzu").exists) {
        this.kuzu.FS.mkdir("/kuzu");
      }
      this.kuzu.FS.mount(this.kuzu.IDBFS, {}, "/kuzu");

      // 3 · Pull any existing DB file from IndexedDB
      await new Promise<void>((res, rej) =>
        this.kuzu.FS.syncfs(true, err => (err ? rej(err) : res()))
      );

      // 4 · Create database
      this.db = new this.kuzu.Database("/kuzu/main.kuzu");

      // 5 · Test connection and get version
      const testConn = new this.kuzu.Connection(this.db);
      try {
        const versionResult = await testConn.query(`CALL db_version() RETURN *;`);
        const version = (await versionResult.getAllRows())[0][0];
        console.log("Kùzu WebAssembly module version:", version);
        await versionResult.close();
      } finally {
        await testConn.close();
      }

      // 6 · Create / validate schema ONCE
      await this._bootstrapSchema();

      // 7 · Set up persistence flush
      const flush = () => this.kuzu.FS.syncfs(false, err => {
        if (err) console.error("Kùzu sync-error:", err);
      });
      if (typeof window !== 'undefined') {
        window.addEventListener("beforeunload", flush);
      }

      // 8 · Cache initial schema fingerprint
      this.schemaFingerprint = await this._getSchemaFingerprint();
      this.isInitialized = true;
      console.timeEnd("Kuzu init");
      console.log('KuzuService: Complete graph database with schema ready');
      
    } catch (error) {
      console.error("Failed to initialize Kùzu:", error);
      this.initializationPromise = null;
      throw error;
    }
  }

  private async _bootstrapSchema(): Promise<void> {
    const conn = new this.kuzu.Connection(this.db);
    try {
      this.schemaManager = new KuzuSchemaManager(conn);
      await this.schemaManager.initializeSchema();
      
      const validation = await this.schemaManager.validateSchema();
      if (!validation.isValid) {
        throw new Error(
          `Schema validation failed: ${JSON.stringify(validation.errors)}`
        );
      }
      
      try {
        await this.schemaManager.enableVectorExtension();
      } catch {
        console.warn("Vector extension unavailable");
      }
    } finally {
      await conn.close();
    }
  }

  /** 
   * Returns an array of table names (sorted). 
   * We'll compare this to the last fingerprint.
   */
  private async _getSchemaFingerprint(): Promise<string[]> {
    const conn = new this.kuzu.Connection(this.db);
    try {
      const result = await conn.query("CALL show_tables() RETURN *;");
      const tables = await result.getAllObjects(); 
      await result.close();
      return tables
        .map((tbl: any) => tbl.name as string)
        .sort((a, b) => a.localeCompare(b));
    } finally {
      await conn.close();
    }
  }

  /**
   * Get database instance with lazy initialization
   */
  async getDb(): Promise<KuzuDatabase> {
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
    return this.schemaManager;
  }

  /**
   * Enhanced query method with proper typing and optimized schema detection
   */
  async query(
    statement: string,
    params: Record<string, any> = {}
  ): Promise<Record<string, any>[]> {
    if (!statement || typeof statement !== "string") {
      throw new Error("KuzuService.query: statement must be a non-empty string");
    }
    if (params && typeof params !== "object") {
      throw new Error("Params must be an object");
    }

    // If uninitialized, bootstrap everything
    await this.init();

    // Simple heuristic: only re‑compute schema fingerprint on DDL
    const isDDL = /^\s*(CREATE|ALTER|DROP)\b/i.test(statement);
    let newFingerprint: string[] | null = null;

    // Serialize JSON input for safety
    const opId = `kuzu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    jsonSafetyManager.createBackup("kuzu_query", "execute", {
      statement,
      params,
      opId,
    });
    
    const atomicResult = await atomicJSONManager.atomicSerialize("kuzu_query_execution", {
      query: statement,
      params,
      opId,
    });

    if (!atomicResult.success) {
      throw new Error(`Query preparation failed: ${atomicResult.error}`);
    }

    // Execute query
    const conn = new this.kuzu.Connection(this.db);
    let result: KuzuQueryResult;
    
    try {
      if (Object.keys(params).length === 0) {
        result = await conn.query(statement);
      } else {
        const ps = await conn.prepare(statement);
        result = await conn.execute(ps, params);
        await ps.close();
      }

      // Only re‑compute fingerprint if DDL
      if (isDDL) {
        newFingerprint = await this._getSchemaFingerprint();
      }

      // Process all result sets
      const allRows: Record<string, any>[] = [];
      let cursor: KuzuQueryResult | null = result;
      while (cursor) {
        const rows = await cursor.getAllObjects();
        allRows.push(...rows);
        if (cursor.hasNextQueryResult()) {
          cursor = await cursor.getNextQueryResult();
        } else {
          break;
        }
      }
      await result.close();

      // If fingerprint changed, update class‑level cache
      if (newFingerprint) {
        const changed =
          newFingerprint.length !== this.schemaFingerprint.length ||
          newFingerprint.some((t, i) => t !== this.schemaFingerprint[i]);
        if (changed) {
          this.schemaFingerprint = newFingerprint;
          console.info("KuzuService: Detected schema change, new tables:", newFingerprint);
        }
      }

      console.info(`KuzuService: ${allRows.length} rows returned`);
      return allRows;
      
    } catch (err) {
      console.error(`KuzuService: query failed: ${err}`);
      const corruption = jsonSafetyManager.detectCorruption("kuzu_query", statement, opId);
      if (corruption) {
        console.warn("Possible data corruption detected:", corruption);
      }
      throw err;
    } finally {
      await conn.close();
    }
  }

  /**
   * Get schema using optimized fingerprint approach
   */
  async getSchema(): Promise<any> {
    await this.init();
    const conn = new this.kuzu.Connection(this.db);
    
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
  async processSingleResult(result: KuzuQueryResult): Promise<any> {
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
   * Close database connection
   */
  async close(): Promise<void> {
    if (!this.db) return;
    
    // Remove FS listener if needed
    if (typeof window !== 'undefined') {
      window.removeEventListener("beforeunload", () => this.kuzu.FS.syncfs(false, () => {}));
    }

    await this.db.close();
    this.db = undefined!;
    this.isInitialized = false;
    this.schemaManager = undefined!;
    this.schemaFingerprint = [];
  }

  /**
   * Get filesystem access (for debugging/utilities)
   */
  getFS(): any {
    return this.kuzu?.FS;
  }

  /**
   * Get current schema fingerprint
   */
  getSchemaFingerprint(): string[] {
    return [...this.schemaFingerprint];
  }

  /**
   * Check if schema has changed since last check
   */
  async hasSchemaChanged(): Promise<boolean> {
    const currentFingerprint = await this._getSchemaFingerprint();
    const changed = 
      currentFingerprint.length !== this.schemaFingerprint.length ||
      currentFingerprint.some((t, i) => t !== this.schemaFingerprint[i]);
    
    if (changed) {
      this.schemaFingerprint = currentFingerprint;
    }
    
    return changed;
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
    schemaFingerprint: string[];
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
        version,
        schemaFingerprint: this.getSchemaFingerprint()
      };
    } catch (error) {
      console.error('KuzuService: Failed to get diagnostics:', error);
      return {
        schema: {},
        tableCount: 0,
        indexCount: 0,
        isInitialized: this.isInitialized,
        schemaFingerprint: []
      };
    }
  }
}

// Singleton instance
const kuzuService = new KuzuService();
export default kuzuService;

// Named export for compatibility
export { kuzuService };
