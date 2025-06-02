
import { KuzuConnection } from './KuzuTypes';

export interface VectorIndexConfig {
  tableName: string;
  indexName: string;
  columnName: string;
  parameters: {
    M?: number;
    efConstruction?: number;
    metric?: 'cosine' | 'l2' | 'l2sq' | 'dotproduct';
  };
}

export interface VectorIndexStatus {
  indexName: string;
  tableName: string;
  isValid: boolean;
  lastRebuilt?: string;
  itemCount?: number;
}

/**
 * Manages vector indices and embeddings for Kuzu database
 * Handles the critical index immutability requirement
 */
export class KuzuVectorManager {
  private conn: KuzuConnection;
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
   * Create a single HNSW vector index
   */
  async createVectorIndex(config: VectorIndexConfig): Promise<void> {
    const { tableName, indexName, columnName, parameters } = config;
    const { M = 16, efConstruction = 200, metric = 'cosine' } = parameters;

    const createIndexQuery = `
      CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${columnName})
      USING HNSW PARAMETERS (M=${M}, efConstruction=${efConstruction}, metric='${metric}')
    `;

    try {
      const result = await this.conn.query(createIndexQuery);
      await result.close();
      console.log(`KuzuVectorManager: Created HNSW index ${indexName} for ${tableName}`);
    } catch (error) {
      console.error(`KuzuVectorManager: Failed to create index ${indexName}:`, error);
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
   * Perform vector similarity search using CALL QUERY_VECTOR_INDEX
   */
  async vectorSearch(options: {
    tableName: string;
    queryVector: number[];
    limit?: number;
    filters?: Record<string, any>;
    efs?: number;
  }): Promise<any[]> {
    const { tableName, queryVector, limit = 10, filters, efs = 200 } = options;
    
    const config = this.vectorConfigs.find(c => c.tableName === tableName);
    if (!config) {
      throw new Error(`No vector index configured for table ${tableName}`);
    }

    let searchTable = tableName;
    
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
        searchTable = `filtered_${tableName.toLowerCase()}_${Date.now()}`;
        
        const projectResult = await this.conn.query(`
          CALL PROJECT_GRAPH('${searchTable}', 
            {'${tableName}': {'filter': '${filterConditions}'}}, 
            []
          )
        `);
        await projectResult.close();
      }
    }

    // Perform vector search
    const searchQuery = `
      CALL QUERY_VECTOR_INDEX('${searchTable}', '${config.indexName}', $queryVector, $limit, efs := $efs)
      YIELD node AS found_node, distance AS similarity_distance
      RETURN found_node, similarity_distance
      ORDER BY similarity_distance ASC
    `;

    const result = await this.conn.query(searchQuery, {
      queryVector,
      limit,
      efs
    });

    const results = await result.getAllObjects();
    await result.close();

    return results;
  }
}
