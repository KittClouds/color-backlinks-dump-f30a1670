import { KuzuConnection } from './KuzuTypes';
import { 
  VectorIndexConfig, 
  VectorIndexStatus, 
  HNSWParameters, 
  VectorSearchOptions,
  ManagedVectorSearchOptions,
  ManagedIndexInternalState,
  KuzuIndexInfo
} from './KuzuVectorManagerTypes';

/**
 * Manages vector indices and embeddings for Kuzu database
 * Updated to use schema functions for vector DDL operations
 */
export class KuzuVectorManager {
  private conn: KuzuConnection;
  private managedIndices: Map<string, ManagedIndexInternalState>;
  private readonly defaultHNSWParams: Required<HNSWParameters> = {
    M: 16,
    efConstruction: 200,
    metric: 'cosine',
    mu: 32,
    pu: 0.05,
  };
  
  private readonly vectorConfigs: VectorIndexConfig[] = [
    {
      tableName: 'Note',
      indexName: 'hnsw_note_embedding',
      columnName: 'embedding',
      parameters: { M: 16, efConstruction: 200, metric: 'cosine' }
    },
    {
      tableName: 'ThreadMessage', 
      indexName: 'hnsw_thread_message_embedding',
      columnName: 'embedding',
      parameters: { M: 16, efConstruction: 200, metric: 'cosine' }
    },
    {
      tableName: 'Entity',
      indexName: 'hnsw_entity_embedding', 
      columnName: 'embedding',
      parameters: { M: 16, efConstruction: 200, metric: 'cosine' }
    }
  ];

  constructor(connection: KuzuConnection) {
    this.conn = connection;
    this.managedIndices = new Map();
  }

  /**
   * Initializes or discovers the state of managed vector indices.
   * Should be called after KuzuVectorManager instantiation.
   */
  async initializeStates(): Promise<void> {
    console.log('KuzuVectorManager: Initializing managed index states...');
    const existingKuzuIndices = await this.fetchExistingKuzuIndices();

    for (const config of this.vectorConfigs) {
      const logicalName = config.indexName;
      let activePhysicalName = `${logicalName}_v1`; // Default if nothing found
      let highestVersion = 0;

      existingKuzuIndices
        .filter(idx => idx.tableName === config.tableName && idx.indexName.startsWith(logicalName + "_v"))
        .forEach(idx => {
          const versionMatch = idx.indexName.match(/_v(\d+)$/);
          if (versionMatch) {
            const version = parseInt(versionMatch[1], 10);
            if (version > highestVersion) {
              highestVersion = version;
              activePhysicalName = idx.indexName;
            }
          }
        });
      
      if (highestVersion === 0 && !existingKuzuIndices.some(idx => idx.indexName === activePhysicalName && idx.tableName === config.tableName)) {
        // If no versioned index found, and v1 doesn't exist, create v1
        console.log(`KuzuVectorManager: No existing index found for ${logicalName}. Creating ${activePhysicalName}.`);
        await this.createPhysicalIndex(config.tableName, config.columnName, activePhysicalName, config.parameters);
      } else if (highestVersion > 0) {
         console.log(`KuzuVectorManager: Discovered ${activePhysicalName} as active for ${logicalName}.`);
      } else {
         console.log(`KuzuVectorManager: Using ${activePhysicalName} (assumed or pre-existing unversioned) for ${logicalName}.`);
      }

      this.managedIndices.set(logicalName, {
        logicalName,
        tableName: config.tableName,
        columnName: config.columnName,
        currentParameters: config.parameters,
        activePhysicalName,
        isRebuilding: false,
      });
    }

    console.log(`KuzuVectorManager: Initialized ${this.managedIndices.size} managed indices.`);
  }

  private async fetchExistingKuzuIndices(): Promise<KuzuIndexInfo[]> {
    try {
      const result = await this.conn.query("CALL SHOW_INDEXES() RETURN name as indexName, table_name as tableName, property_names as propertyNames;");
      const allIndices = await result.getAllObjects() as KuzuIndexInfo[];
      await result.close();
      return allIndices.filter(idx => idx.propertyNames && idx.propertyNames.length > 0);
    } catch (error) {
      console.warn('KuzuVectorManager: Failed to fetch existing indices, assuming none exist:', error);
      return [];
    }
  }

  /**
   * Creates a specific physical HNSW index using schema functions
   */
  private async createPhysicalIndex(
    tableName: string,
    columnName: string,
    physicalIndexName: string,
    parameters: HNSWParameters
  ): Promise<void> {
    const params: Required<HNSWParameters> = { ...this.defaultHNSWParams, ...parameters };

    try {
      const result = await this.conn.query(`
        CALL CREATE_VECTOR_INDEX('${tableName}', '${physicalIndexName}', '${columnName}', 
          metric := '${params.metric}', 
          efc := ${params.efConstruction},
          M := ${params.M}
        )
      `);
      await result.close();
      console.log(`KuzuVectorManager: Physical index ${physicalIndexName} on ${tableName}(${columnName}) created using schema function.`);
    } catch (error) {
      console.error(`KuzuVectorManager: Failed to create physical index ${physicalIndexName}:`, error);
      throw error;
    }
  }

  /**
   * Drops a specific physical HNSW index using schema functions
   */
  private async dropPhysicalIndex(physicalIndexName: string): Promise<void> {
    if (!physicalIndexName) return;
    
    try {
      // Extract table name from managed indices for DROP_VECTOR_INDEX call
      let tableName = '';
      for (const state of this.managedIndices.values()) {
        if (state.activePhysicalName === physicalIndexName) {
          tableName = state.tableName;
          break;
        }
      }
      
      if (tableName) {
        const result = await this.conn.query(`
          CALL DROP_VECTOR_INDEX('${tableName}', '${physicalIndexName}')
        `);
        await result.close();
        console.log(`KuzuVectorManager: Physical index ${physicalIndexName} dropped using schema function.`);
      } else {
        console.warn(`KuzuVectorManager: Could not determine table for index ${physicalIndexName}, skipping drop.`);
      }
    } catch (error) {
      console.warn(`KuzuVectorManager: Failed to drop physical index ${physicalIndexName}:`, error);
    }
  }

  /**
   * Triggers an automated, shadow rebuild of a specified logical index.
   */
  async triggerAutomatedRebuild(logicalName: string, newParameters?: HNSWParameters): Promise<void> {
    const state = this.managedIndices.get(logicalName);
    if (!state) {
      console.error(`KuzuVectorManager: No managed index found for logical name: ${logicalName}. Cannot rebuild.`);
      return;
    }
    if (state.isRebuilding) {
      console.warn(`KuzuVectorManager: Rebuild already in progress for ${logicalName}.`);
      return;
    }

    console.log(`KuzuVectorManager: Starting automated shadow rebuild for ${logicalName}...`);
    state.isRebuilding = true;
    state.lastRebuildAttempt = new Date();

    const oldPhysicalName = state.activePhysicalName;
    const versionMatch = oldPhysicalName.match(/_v(\d+)$/);
    const nextVersion = versionMatch ? parseInt(versionMatch[1], 10) + 1 : 1;
    const newPhysicalName = `${state.logicalName}_v${nextVersion}`;
    const paramsForNewIndex = newParameters || state.currentParameters;

    try {
      await this.createPhysicalIndex(state.tableName, state.columnName, newPhysicalName, paramsForNewIndex);
      
      // Optional: Validation step for the new index can be added here
      // e.g., check item count or perform a sample query

      state.activePhysicalName = newPhysicalName; // Switch active index
      state.currentParameters = paramsForNewIndex;
      state.lastSuccessfulRebuild = new Date();
      this.managedIndices.set(logicalName, { ...state }); // Update map
      console.log(`KuzuVectorManager: Successfully switched active index for ${logicalName} to ${newPhysicalName}.`);

      // Schedule deletion of the old index
      if (oldPhysicalName && oldPhysicalName !== newPhysicalName) {
         await this.dropPhysicalIndex(oldPhysicalName);
      }
    } catch (error) {
      console.error(`KuzuVectorManager: Shadow rebuild failed for ${logicalName} (new: ${newPhysicalName}). Error:`, error);
      // Attempt to clean up the failed new index
      await this.dropPhysicalIndex(newPhysicalName).catch(e => console.error(`Cleanup failed for ${newPhysicalName}`, e));
    } finally {
      state.isRebuilding = false;
      this.managedIndices.set(logicalName, { ...state });
    }
  }

  /**
   * The main method called by KuzuMemoryService to check and potentially rebuild indices.
   */
  async checkAndRebuildAllManagedIndices(forceRebuild: boolean = false): Promise<void> {
    console.log(`KuzuVectorManager: Checking ${this.managedIndices.size} managed indices for rebuild...`);
    for (const logicalName of this.managedIndices.keys()) {
        if (forceRebuild) {
            await this.triggerAutomatedRebuild(logicalName);
        }
        // TODO: Implement needsRebuildHeuristic for automatic detection
    }
  }

  /**
   * Performs vector search using the currently active physical index.
   */
  async vectorSearchManaged(options: ManagedVectorSearchOptions): Promise<any[]> {
    const { logicalIndexName, queryVector, limit = 10, filters, efs = 100 } = options;
    const state = this.managedIndices.get(logicalIndexName);

    if (!state || !state.activePhysicalName) {
      throw new Error(`KuzuVectorManager: Index ${logicalIndexName} is not managed or not active.`);
    }
    
    const physicalIndexToQuery = state.activePhysicalName;
    const targetTableName = state.tableName;
    let searchTable = targetTableName;
    let temporaryProjectedGraphName: string | null = null;

    // Filtered search logic using PROJECT_GRAPH
    if (filters && Object.keys(filters).length > 0) {
      const filterConditions = Object.entries(filters)
        .map(([key, value]) => {
          if (typeof value === 'string') {
            return `n.${key} = '${value}'`;
          } else if (typeof value === 'number') {
            return `n.${key} = ${value}`;
          } else if (typeof value === 'object' && value.operator && value.value) {
            return `n.${key} ${value.operator} ${typeof value.value === 'string' ? `'${value.value}'` : value.value}`;
          }
          return null;
        })
        .filter(Boolean)
        .join(' AND ');

      if (filterConditions) {
        searchTable = `temp_proj_${targetTableName}_${Date.now()}`;
        temporaryProjectedGraphName = searchTable;
        
        const projectResult = await this.conn.query(`
          CALL PROJECT_GRAPH('${searchTable}', 
            {'${targetTableName}': {'filter': '${filterConditions}'}}, 
            []
          )
        `);
        await projectResult.close();
      }
    }
    
    try {
      const queryVectorString = `[${queryVector.join(', ')}]`;
      const searchQuery = `
        CALL QUERY_VECTOR_INDEX('${searchTable}', '${physicalIndexToQuery}', ${queryVectorString}, ${limit}, efs := ${efs})
        YIELD node AS found_node, distance AS similarity_distance
        RETURN found_node, similarity_distance
        ORDER BY similarity_distance ASC
      `;

      const result = await this.conn.query(searchQuery);
      const results = await result.getAllObjects();
      await result.close();

      return results;
    } finally {
      // Cleanup temporary projected graph if created
      if (temporaryProjectedGraphName) {
        try {
          // Note: This cleanup might not be necessary if Kuzu auto-manages session graphs
          // Uncomment if explicit cleanup is needed:
          // await this.conn.query(`DROP PROJECTED GRAPH IF EXISTS ${temporaryProjectedGraphName}`);
          // console.log(`KuzuVectorManager: Cleaned up temp projected graph ${temporaryProjectedGraphName}`);
        } catch (cleanupError) {
          console.warn(`KuzuVectorManager: Failed to cleanup temp projected graph ${temporaryProjectedGraphName}`, cleanupError);
        }
      }
    }
  }

  /**
   * Add embedding columns to tables that support vector operations
   */
  async addEmbeddingColumns(): Promise<void> {
    const alterQueries = [
      `ALTER NODE TABLE Note ADD COLUMN IF NOT EXISTS embedding FLOAT[768]`,
      `ALTER NODE TABLE ThreadMessage ADD COLUMN IF NOT EXISTS embedding FLOAT[768]`,
      `ALTER NODE TABLE Entity ADD COLUMN IF NOT EXISTS embedding FLOAT[768]`,
      
      // Memory-specific fields for Note
      `ALTER NODE TABLE Note ADD COLUMN IF NOT EXISTS importance FLOAT DEFAULT 0.5`,
      `ALTER NODE TABLE Note ADD COLUMN IF NOT EXISTS userId STRING`,
      `ALTER NODE TABLE Note ADD COLUMN IF NOT EXISTS categoryId STRING`,
      `ALTER NODE TABLE Note ADD COLUMN IF NOT EXISTS accessCount INT DEFAULT 0`,
      `ALTER NODE TABLE Note ADD COLUMN IF NOT EXISTS lastAccessedAt TIMESTAMP`,
      
      // Memory-specific fields for ThreadMessage  
      `ALTER NODE TABLE ThreadMessage ADD COLUMN IF NOT EXISTS importance FLOAT DEFAULT 0.5`,
      `ALTER NODE TABLE ThreadMessage ADD COLUMN IF NOT EXISTS accessCount INT DEFAULT 0`,
      `ALTER NODE TABLE ThreadMessage ADD COLUMN IF NOT EXISTS lastAccessedAt TIMESTAMP`
    ];

    for (const query of alterQueries) {
      try {
        const result = await this.conn.query(query);
        await result.close();
        console.log('KuzuVectorManager: Added column successfully');
      } catch (error) {
        console.warn('KuzuVectorManager: Column may already exist:', error);
      }
    }
  }

  /**
   * Create HNSW vector indices for all configured tables
   */
  async createVectorIndices(): Promise<void> {
    for (const config of this.vectorConfigs) {
      await this.createVectorIndex(config);
    }
  }

  /**
   * Creates all configured vector indices asynchronously.
   * This method attempts to run index creation operations in parallel from the client-side.
   */
  async createVectorIndicesOptimized(): Promise<void> {
    const createPromises = this.vectorConfigs.map(config =>
      this.createVectorIndex(config)
        .then(() => ({ success: true, config }))
        .catch(err => {
          console.error(`KuzuVectorManager: Failed to create index ${config.indexName} for ${config.tableName}:`, err.message);
          return { success: false, config, error: err.message };
        })
    );

    const results = await Promise.allSettled(createPromises);
    const allSucceeded = results.every(r => 
      r.status === 'fulfilled' && r.value?.success !== false
    );
    
    if (!allSucceeded) {
      console.warn("KuzuVectorManager: One or more index creation tasks failed during optimized batch creation.");
    } else {
      console.log("KuzuVectorManager: All optimized index creation tasks completed.");
    }
  }

  /**
   * Create a single HNSW vector index using schema functions
   */
  async createVectorIndex(config: VectorIndexConfig): Promise<void> {
    const { tableName, indexName, columnName } = config;
    const params: Required<HNSWParameters> = { ...this.defaultHNSWParams, ...config.parameters };

    try {
      const result = await this.conn.query(`
        CALL CREATE_VECTOR_INDEX('${tableName}', '${indexName}', '${columnName}', 
          metric := '${params.metric}', 
          efc := ${params.efConstruction},
          M := ${params.M}
        )
      `);
      await result.close();
      console.log(`KuzuVectorManager: Index ${indexName} on ${tableName} created using schema function.`);
    } catch (error) {
      console.error(`KuzuVectorManager: Failed to create index ${indexName} on ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Drop and recreate vector indices using schema functions
   */
  async rebuildVectorIndexes(tableNames?: string[]): Promise<void> {
    const configsToRebuild = tableNames 
      ? this.vectorConfigs.filter(config => tableNames.includes(config.tableName))
      : this.vectorConfigs;

    for (const config of configsToRebuild) {
      try {
        // Drop existing index using schema function
        await this.conn.query(`
          CALL DROP_VECTOR_INDEX('${config.tableName}', '${config.indexName}')
        `);
        console.log(`KuzuVectorManager: Dropped index ${config.indexName} on ${config.tableName}`);
      } catch (error) {
        console.warn(`KuzuVectorManager: Index ${config.indexName} may not exist, continuing with creation:`, error);
      }

      // Recreate index using schema function
      await this.createVectorIndex(config);
    }

    console.log(`KuzuVectorManager: Rebuilt ${configsToRebuild.length} vector indices using schema functions`);
  }

  /**
   * Drop a vector index
   */
  async dropVectorIndex(indexName: string): Promise<void> {
    try {
      const result = await this.conn.query(`DROP INDEX IF EXISTS ${indexName}`);
      await result.close();
      console.log(`KuzuVectorManager: Dropped index ${indexName}`);
    } catch (error) {
      console.warn(`KuzuVectorManager: Could not drop index ${indexName}:`, error);
    }
  }

  /**
   * Check if vector indices need rebuilding
   */
  async hasVectorIndexChanged(tableName: string): Promise<boolean> {
    try {
      // Get count of items with embeddings vs total items
      const result = await this.conn.query(`
        MATCH (n:${tableName}) 
        RETURN 
          count(n) as total,
          count(n.embedding) as withEmbeddings
      `);

      const rows = await result.getAllObjects();
      await result.close();

      if (rows.length > 0) {
        const { total, withEmbeddings } = rows[0];
        // If more than 10% of items lack embeddings in the index, consider it stale
        return (total - withEmbeddings) / total > 0.1;
      }
      return false;
    } catch (error) {
      console.error('KuzuVectorManager: Error checking index staleness:', error);
      return true; // Assume needs rebuild on error
    }
  }

  /**
   * Get status of all vector indices
   */
  async getVectorIndexStatus(): Promise<VectorIndexStatus[]> {
    const statuses: VectorIndexStatus[] = [];

    for (const config of this.vectorConfigs) {
      try {
        const result = await this.conn.query(`
          MATCH (n:${config.tableName}) 
          WHERE n.embedding IS NOT NULL
          RETURN count(n) as itemCount
        `);

        const rows = await result.getAllObjects();
        await result.close();

        statuses.push({
          indexName: config.indexName,
          tableName: config.tableName,
          isValid: true,
          itemCount: rows[0]?.itemCount || 0,
          lastRebuilt: new Date().toISOString()
        });
      } catch (error) {
        statuses.push({
          indexName: config.indexName,
          tableName: config.tableName,
          isValid: false
        });
      }
    }

    return statuses;
  }

  /**
   * Perform vector similarity search with enhanced memory optimization
   */
  async vectorSearch(options: VectorSearchOptions): Promise<any[]> {
    const { tableName, queryVector, limit = 10, filters, efs = 100 } = options;
    
    const config = this.vectorConfigs.find(c => c.tableName === tableName);
    if (!config) {
      throw new Error(`No vector index configured for table ${tableName}`);
    }

    let searchTable = tableName;
    let temporaryProjectedGraphName: string | null = null;
    
    // Create filtered view if filters provided
    if (filters && Object.keys(filters).length > 0) {
      const filterConditions = Object.entries(filters)
        .map(([key, value]) => {
          if (typeof value === 'string') {
            return `n.${key} = '${value}'`;
          } else if (typeof value === 'number') {
            return `n.${key} = ${value}`;
          } else if (typeof value === 'object' && value.operator && value.value) {
            return `n.${key} ${value.operator} ${typeof value.value === 'string' ? `'${value.value}'` : value.value}`;
          }
          return null;
        })
        .filter(Boolean)
        .join(' AND ');

      if (filterConditions) {
        searchTable = `temp_proj_${tableName}_${Date.now()}`;
        temporaryProjectedGraphName = searchTable;
        
        const projectResult = await this.conn.query(`
          CALL PROJECT_GRAPH('${searchTable}', 
            {'${tableName}': {'filter': '${filterConditions}'}}, 
            []
          )
        `);
        await projectResult.close();
      }
    }

    try {
      // Perform vector search with configurable efs parameter
      const queryVectorString = `[${queryVector.join(', ')}]`;
      const searchQuery = `
        CALL QUERY_VECTOR_INDEX('${searchTable}', '${config.indexName}', ${queryVectorString}, ${limit}, efs := ${efs})
        YIELD node AS found_node, distance AS similarity_distance
        RETURN found_node, similarity_distance
        ORDER BY similarity_distance ASC
      `;

      const result = await this.conn.query(searchQuery);
      const results = await result.getAllObjects();
      await result.close();

      return results;
    } finally {
      // Cleanup temporary projected graph if created
      if (temporaryProjectedGraphName) {
        try {
          // Note: This cleanup might not be necessary if Kuzu auto-manages session graphs
          // Uncomment if explicit cleanup is needed:
          // await this.conn.query(`DROP PROJECTED GRAPH IF EXISTS ${temporaryProjectedGraphName}`);
          // console.log(`KuzuVectorManager: Cleaned up temp projected graph ${temporaryProjectedGraphName}`);
        } catch (cleanupError) {
          console.warn(`KuzuVectorManager: Failed to cleanup temp projected graph ${temporaryProjectedGraphName}`, cleanupError);
        }
      }
    }
  }

  /**
   * Get managed indices state for debugging/monitoring
   */
  getManagedIndicesState(): Record<string, ManagedIndexInternalState> {
    const state: Record<string, ManagedIndexInternalState> = {};
    for (const [key, value] of this.managedIndices.entries()) {
      state[key] = { ...value };
    }
    return state;
  }
}
