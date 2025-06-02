import { KuzuConnection } from './KuzuTypes';
import { VectorIndexConfig, VectorIndexStatus, HNSWParameters, VectorSearchOptions } from './KuzuVectorManagerTypes';

/**
 * Manages vector indices and embeddings for Kuzu database
 * Handles the critical index immutability requirement with enhanced memory optimization
 */
export class KuzuVectorManager {
  private conn: KuzuConnection;
  private readonly defaultHNSWParams: Required<HNSWParameters> = {
    M: 16,
    efConstruction: 200,
    metric: 'cosine',
    mu: 32, // Example default, verify Kuzu support
    pu: 0.05,  // Example default, verify Kuzu support
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
  }

  /**
   * Add embedding columns to tables that support vector operations
   */
  async addEmbeddingColumns(): Promise<void> {
    const alterQueries = [
      `ALTER NODE TABLE Note ADD COLUMN IF NOT EXISTS embedding FLOAT[1536]`,
      `ALTER NODE TABLE ThreadMessage ADD COLUMN IF NOT EXISTS embedding FLOAT[1536]`,
      `ALTER NODE TABLE Entity ADD COLUMN IF NOT EXISTS embedding FLOAT[1536]`,
      
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
   * Create a single HNSW vector index with enhanced parameterization
   */
  async createVectorIndex(config: VectorIndexConfig): Promise<void> {
    const { tableName, indexName, columnName } = config;
    // Merge provided params with manager defaults
    const params: Required<HNSWParameters> = { ...this.defaultHNSWParams, ...config.parameters };

    const paramStrings: string[] = [];
    // Only include parameters that Kuzu's DDL supports
    if (params.M !== undefined) paramStrings.push(`M=${params.M}`);
    if (params.efConstruction !== undefined) paramStrings.push(`efConstruction=${params.efConstruction}`);
    if (params.metric !== undefined) paramStrings.push(`metric='${params.metric}'`);
    // Note: mu and pu parameters may not be supported by Kuzu yet
    // if (params.mu !== undefined) paramStrings.push(`mu=${params.mu}`);
    // if (params.pu !== undefined) paramStrings.push(`pu=${params.pu}`);

    const ddlParameters = paramStrings.length > 0 ? `PARAMETERS (${paramStrings.join(', ')})` : '';
    const createIndexQuery = `
      CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${columnName})
      USING HNSW ${ddlParameters}
    `;

    try {
      const result = await this.conn.query(createIndexQuery);
      await result.close();
      console.log(`KuzuVectorManager: Index ${indexName} on ${tableName} created/verified with params: ${paramStrings.join(', ') || 'Kuzu defaults'}.`);
    } catch (error) {
      console.error(`KuzuVectorManager: Failed to create index ${indexName} on ${tableName}. Query: [${createIndexQuery.trim()}]`, error);
      throw error;
    }
  }

  /**
   * Drop and recreate vector indices (handles immutability requirement)
   */
  async rebuildVectorIndexes(tableNames?: string[]): Promise<void> {
    const configsToRebuild = tableNames 
      ? this.vectorConfigs.filter(c => tableNames.includes(c.tableName))
      : this.vectorConfigs;

    console.log(`KuzuVectorManager: Rebuilding ${configsToRebuild.length} vector indices...`);

    for (const config of configsToRebuild) {
      try {
        // Drop existing index
        await this.dropVectorIndex(config.indexName);
        
        // Recreate index
        await this.createVectorIndex(config);
        
        console.log(`KuzuVectorManager: Rebuilt index ${config.indexName}`);
      } catch (error) {
        console.error(`KuzuVectorManager: Failed to rebuild index ${config.indexName}:`, error);
      }
    }
  }

  /**
   * Rebuilds specified (or all) vector indices asynchronously.
   * For each index, it drops and then recreates it.
   * The rebuilding process for different indices is attempted in parallel.
   */
  async rebuildVectorIndexesOptimized(tableNames?: string[]): Promise<void> {
    const configsToRebuild = tableNames
      ? this.vectorConfigs.filter(c => tableNames.includes(c.tableName))
      : this.vectorConfigs;

    console.log(`KuzuVectorManager: Rebuilding ${configsToRebuild.length} vector indices (optimized)...`);

    const rebuildPromises = configsToRebuild.map(config =>
      (async () => {
        try {
          await this.dropVectorIndex(config.indexName);
          await this.createVectorIndex(config);
          console.log(`KuzuVectorManager: Successfully rebuilt index ${config.indexName} via optimized path.`);
          return { success: true, config };
        } catch (error) {
          console.error(`KuzuVectorManager: Failed to rebuild index ${config.indexName} via optimized path:`, error.message);
          return { success: false, config, error: error.message };
        }
      })()
    );

    const results = await Promise.allSettled(rebuildPromises);
    const allSucceeded = results.every(r => 
      r.status === 'fulfilled' && r.value?.success !== false
    );
    
    if (!allSucceeded) {
      console.warn("KuzuVectorManager: One or more index rebuild tasks failed during optimized batch rebuild.");
    } else {
      console.log("KuzuVectorManager: All optimized index rebuild tasks completed.");
    }
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
}
