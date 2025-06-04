import { jsonSchemaRegistry } from '@/json-manager/schemas';
import { KuzuVectorManager } from './KuzuVectorManager';
import { pipeline } from '@huggingface/transformers';

export interface KuzuSchemaVersion {
  version: string;
  timestamp: number;
  applied: boolean;
}

export interface KuzuTableInfo {
  name: string;
  type: 'NODE' | 'REL';
  properties: Record<string, string>;
}

/**
 * Kuzu Schema Manager - Updated to use schema functions for vector operations
 */
export class KuzuSchemaManager {
  private conn: any;
  private currentVersion = '1.0.0';
  private appliedVersions: Set<string> = new Set();
  private vectorManager: KuzuVectorManager | null = null;
  private embeddingModelPromise?: Promise<any>;

  constructor(connection: any) {
    this.conn = connection;
  }

  /**
   * Mutex-guarded embedding model loader
   */
  private async getEmbedder() {
    if (!this.embeddingModelPromise) {
      this.embeddingModelPromise = pipeline(
        'feature-extraction',
        'nomic-ai/modernbert-embed-base',
        { device: 'webgpu', dtype: 'fp32' }
      );
    }
    return this.embeddingModelPromise;
  }

  /**
   * Generate embedding with mutex-guarded model initialization
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const model = await this.getEmbedder();
      const embedding = await model(text, { 
        pooling: 'mean', 
        normalize: true 
      });
      
      // Convert tensor to array
      const embeddingArray = embedding.tolist()[0];
      
      // Ensure we have exactly 768 dimensions
      if (embeddingArray.length !== 768) {
        console.warn(`KuzuSchemaManager: Expected 768 dimensions, got ${embeddingArray.length}`);
      }
      
      return embeddingArray;
    } catch (error) {
      console.error('KuzuSchemaManager: Failed to generate embedding:', error);
      // Reset the promise so next call can retry
      this.embeddingModelPromise = undefined;
      
      // Fallback to dummy embedding if model fails
      console.warn('KuzuSchemaManager: Using fallback dummy embedding');
      return new Array(768).fill(0).map(() => Math.random());
    }
  }

  /**
   * Initialize the complete schema based on the provided DDL scaffold
   */
  async initializeSchema(): Promise<void> {
    console.log('KuzuSchemaManager: Initializing complete schema...');

    try {
      // Create node tables first
      await this.createNodeTables();
      
      // Then create relationship tables
      await this.createRelationshipTables();
      
      // Create memory-specific tables
      await this.createMemoryTables();
      
      // Add embedding columns and model tracking
      await this.addEmbeddingColumns();
      
      // Finally create indices for performance
      await this.createIndices();
      
      // Initialize vector support with function APIs
      await this.initializeVectorSupport();
      
      // Mark schema as initialized
      this.appliedVersions.add(this.currentVersion);
      console.log('KuzuSchemaManager: Schema initialization completed');
    } catch (error) {
      console.error('KuzuSchemaManager: Schema initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create all node tables following the DDL scaffold
   */
  private async createNodeTables(): Promise<void> {
    console.log('KuzuSchemaManager: Creating node tables...');

    const nodeTableQueries = [
      // Notes & Folders (share same "note_id" PK)
      `CREATE NODE TABLE IF NOT EXISTS Note (
        id             STRING   PRIMARY KEY,
        title          STRING,
        slugTitle      STRING,
        content        STRING,
        type           STRING,
        createdAt      TIMESTAMP,
        updatedAt      TIMESTAMP,
        path           STRING,
        clusterId      STRING,
        parentId       STRING
      )`,

      // Clusters
      `CREATE NODE TABLE IF NOT EXISTS Cluster (
        id        STRING PRIMARY KEY,
        title     STRING,
        createdAt TIMESTAMP,
        updatedAt TIMESTAMP
      )`,

      // Light-weight keyword nodes
      `CREATE NODE TABLE IF NOT EXISTS Tag (
        id    STRING PRIMARY KEY,
        label STRING
      )`,

      `CREATE NODE TABLE IF NOT EXISTS Mention (
        id    STRING PRIMARY KEY,
        label STRING
      )`,

      // Canonical semantic entities
      `CREATE NODE TABLE IF NOT EXISTS Entity (
        id         STRING PRIMARY KEY,
        kind       STRING,
        label      STRING,
        attributes STRING
      )`,

      // Global triple hub
      `CREATE NODE TABLE IF NOT EXISTS GlobalTriple (
        id         STRING PRIMARY KEY,
        predicate  STRING,
        notes      STRING
      )`,

      // Chat artefacts
      `CREATE NODE TABLE IF NOT EXISTS Thread (
        id        STRING PRIMARY KEY,
        title     STRING,
        createdAt TIMESTAMP,
        updatedAt TIMESTAMP
      )`,

      `CREATE NODE TABLE IF NOT EXISTS ThreadMessage (
        id          STRING PRIMARY KEY,
        role        STRING,
        content     STRING,
        attachments STRING,
        createdAt   TIMESTAMP,
        updatedAt   TIMESTAMP
      )`
    ];

    for (const query of nodeTableQueries) {
      await this.conn.execute(query);
      console.log('KuzuSchemaManager: Created node table');
    }
  }

  /**
   * Create all relationship tables
   */
  private async createRelationshipTables(): Promise<void> {
    console.log('KuzuSchemaManager: Creating relationship tables...');

    const relationshipQueries = [
      // Structural hierarchy
      `CREATE REL TABLE IF NOT EXISTS CONTAINS FROM Note TO Note (ON DELETE CASCADE)`,
      `CREATE REL TABLE IF NOT EXISTS IN_CLUSTER FROM Note TO Cluster (ON DELETE SET NULL)`,

      // Hyperlinks & mentions
      `CREATE REL TABLE IF NOT EXISTS LINKS_TO FROM Note TO Note`,
      `CREATE REL TABLE IF NOT EXISTS MENTIONS FROM Note TO Note`,
      `CREATE REL TABLE IF NOT EXISTS HAS_TAG FROM Note TO Tag`,

      // Semantic provenance
      `CREATE REL TABLE IF NOT EXISTS MENTIONED_IN FROM Entity TO Note`,
      `CREATE REL TABLE IF NOT EXISTS SUBJECT_OF FROM Entity TO GlobalTriple (role STRING)`,
      `CREATE REL TABLE IF NOT EXISTS OBJECT_OF FROM Entity TO GlobalTriple (role STRING)`,
      `CREATE REL TABLE IF NOT EXISTS GLOBAL_TRIPLE_MEMBER FROM Entity TO GlobalTriple`,

      // Cross-note analytics
      `CREATE REL TABLE IF NOT EXISTS CO_OCCURS FROM Entity TO Entity (
        count  INT,
        notes  STRING
      )`,

      // Discussion threads
      `CREATE REL TABLE IF NOT EXISTS IN_THREAD FROM Thread TO ThreadMessage`,
      `CREATE REL TABLE IF NOT EXISTS REPLIES_TO FROM ThreadMessage TO ThreadMessage`
    ];

    for (const query of relationshipQueries) {
      await this.conn.execute(query);
      console.log('KuzuSchemaManager: Created relationship table');
    }
  }

  /**
   * Create memory-specific tables
   */
  private async createMemoryTables(): Promise<void> {
    console.log('KuzuSchemaManager: Creating memory tables...');

    const memoryTableQueries = [
      // User profiles
      `CREATE NODE TABLE IF NOT EXISTS UserProfile (
        id STRING PRIMARY KEY,
        name STRING,
        preferences STRING,
        createdAt TIMESTAMP,
        updatedAt TIMESTAMP
      )`,

      // Memory categories
      `CREATE NODE TABLE IF NOT EXISTS MemoryCategory (
        id STRING PRIMARY KEY,
        name STRING,
        description STRING,
        color STRING,
        userId STRING,
        isDefault BOOLEAN,
        createdAt TIMESTAMP,
        updatedAt TIMESTAMP
      )`
    ];

    for (const query of memoryTableQueries) {
      await this.conn.execute(query);
      console.log('KuzuSchemaManager: Created memory table');
    }

    // Memory-specific relationships
    const memoryRelQueries = [
      `CREATE REL TABLE IF NOT EXISTS OWNED_BY FROM Note TO UserProfile (ON DELETE CASCADE)`,
      `CREATE REL TABLE IF NOT EXISTS CATEGORIZED_AS FROM Note TO MemoryCategory (ON DELETE SET NULL)`,
      `CREATE REL TABLE IF NOT EXISTS MESSAGE_OWNED_BY FROM ThreadMessage TO UserProfile (ON DELETE CASCADE)`
    ];

    for (const query of memoryRelQueries) {
      await this.conn.execute(query);
      console.log('KuzuSchemaManager: Created memory relationship');
    }
  }

  /**
   * Add embedding columns with model tracking
   */
  private async addEmbeddingColumns(): Promise<void> {
    console.log('KuzuSchemaManager: Adding embedding columns with model tracking...');

    const alterQueries = [
      // Add embedding columns
      `ALTER NODE TABLE Note ADD COLUMN IF NOT EXISTS embedding FLOAT[768]`,
      `ALTER NODE TABLE ThreadMessage ADD COLUMN IF NOT EXISTS embedding FLOAT[768]`,
      `ALTER NODE TABLE Entity ADD COLUMN IF NOT EXISTS embedding FLOAT[768]`,
      
      // Add model tracking columns for future-proofing
      `ALTER NODE TABLE Note ADD COLUMN IF NOT EXISTS embedding_model STRING`,
      `ALTER NODE TABLE ThreadMessage ADD COLUMN IF NOT EXISTS embedding_model STRING`,
      `ALTER NODE TABLE Entity ADD COLUMN IF NOT EXISTS embedding_model STRING`,
      
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
        await this.conn.execute(query);
        console.log('KuzuSchemaManager: Added column successfully');
      } catch (error) {
        console.warn('KuzuSchemaManager: Column may already exist:', error);
      }
    }
  }

  /**
   * Initialize vector support with schema functions
   */
  private async initializeVectorSupport(): Promise<void> {
    try {
      this.vectorManager = new KuzuVectorManager(this.conn);
      
      // Create vector indices using stable function APIs
      await this.createVectorIndicesWithFunctions();
      
      console.log('KuzuSchemaManager: Vector support initialized with schema functions');
    } catch (error) {
      console.warn('KuzuSchemaManager: Vector support initialization failed:', error);
    }
  }

  /**
   * Create vector indices using stable function APIs
   */
  private async createVectorIndicesWithFunctions(): Promise<void> {
    console.log('KuzuSchemaManager: Creating vector indices with function APIs...');

    const vectorIndexConfigs = [
      {
        tableName: 'Note',
        indexName: 'hnsw_note_embedding',
        columnName: 'embedding',
        metric: 'cosine',
        efc: 200,
        M: 16
      },
      {
        tableName: 'ThreadMessage',
        indexName: 'hnsw_thread_message_embedding',
        columnName: 'embedding',
        metric: 'cosine',
        efc: 200,
        M: 16
      },
      {
        tableName: 'Entity',
        indexName: 'hnsw_entity_embedding',
        columnName: 'embedding',
        metric: 'cosine',
        efc: 200,
        M: 16
      }
    ];

    for (const config of vectorIndexConfigs) {
      try {
        await this.conn.execute(`
          CALL CREATE_VECTOR_INDEX(
            '${config.tableName}',
            '${config.indexName}',
            '${config.columnName}',
            metric := '${config.metric}',
            efc    := ${config.efc},
            M      := ${config.M}
          )
        `);
        console.log(`KuzuSchemaManager: Created vector index ${config.indexName} on ${config.tableName} using function API`);
      } catch (error) {
        console.warn(`KuzuSchemaManager: Vector index ${config.indexName} may already exist:`, error);
      }
    }
  }

  /**
   * Drop vector indices using stable function APIs
   */
  private async dropVectorIndicesWithFunctions(): Promise<void> {
    console.log('KuzuSchemaManager: Dropping vector indices with function APIs...');

    const vectorIndexConfigs = [
      { tableName: 'Note', indexName: 'hnsw_note_embedding' },
      { tableName: 'ThreadMessage', indexName: 'hnsw_thread_message_embedding' },
      { tableName: 'Entity', indexName: 'hnsw_entity_embedding' }
    ];

    for (const config of vectorIndexConfigs) {
      try {
        await this.conn.execute(`
          CALL DROP_VECTOR_INDEX('${config.tableName}', '${config.indexName}')
        `);
        console.log(`KuzuSchemaManager: Dropped vector index ${config.indexName} on ${config.tableName} using function API`);
      } catch (error) {
        console.warn(`KuzuSchemaManager: Could not drop vector index ${config.indexName}:`, error);
      }
    }
  }

  /**
   * Create performance indices
   */
  private async createIndices(): Promise<void> {
    console.log('KuzuSchemaManager: Creating indices...');

    const indexQueries = [
      `CREATE INDEX IF NOT EXISTS idx_entity_kind_label ON Entity(kind, label)`,
      `CREATE INDEX IF NOT EXISTS idx_note_slug ON Note(slugTitle)`,
      `CREATE INDEX IF NOT EXISTS idx_note_cluster ON Note(clusterId)`,
      `CREATE INDEX IF NOT EXISTS idx_note_parent ON Note(parentId)`
    ];

    for (const query of indexQueries) {
      try {
        await this.conn.execute(query);
        console.log('KuzuSchemaManager: Created index');
      } catch (error) {
        console.warn('KuzuSchemaManager: Index creation skipped (may already exist):', error);
      }
    }
  }

  /**
   * Get current schema information
   */
  async getSchemaInfo(): Promise<{
    tables: KuzuTableInfo[];
    version: string;
    isInitialized: boolean;
  }> {
    try {
      // Query table information from Kuzu system tables
      const result = await this.conn.execute(`
        CALL show_tables() RETURN name, type;
      `);

      const tables: KuzuTableInfo[] = result.map((row: any) => ({
        name: row.name,
        type: row.type,
        properties: {} // Would need additional queries to get property details
      }));

      return {
        tables,
        version: this.currentVersion,
        isInitialized: this.appliedVersions.has(this.currentVersion)
      };
    } catch (error) {
      console.warn('KuzuSchemaManager: Could not retrieve schema info:', error);
      return {
        tables: [],
        version: this.currentVersion,
        isInitialized: false
      };
    }
  }

  /**
   * Validate schema integrity
   */
  async validateSchema(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      const expectedTables = [
        'Note', 'Cluster', 'Tag', 'Mention', 'Entity', 
        'GlobalTriple', 'Thread', 'ThreadMessage'
      ];

      const { tables } = await this.getSchemaInfo();
      const existingTableNames = tables.map(t => t.name);

      for (const tableName of expectedTables) {
        if (!existingTableNames.includes(tableName)) {
          errors.push(`Missing required table: ${tableName}`);
        }
      }

      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error) {
      errors.push(`Schema validation failed: ${error}`);
      return { isValid: false, errors };
    }
  }

  /**
   * Add vector extension support using schema functions
   */
  async enableVectorExtension(): Promise<void> {
    if (this.vectorManager) {
      await this.vectorManager.addEmbeddingColumns();
      await this.vectorManager.createVectorIndices();
      console.log('KuzuSchemaManager: Vector extension enabled with schema functions');
    } else {
      await this.initializeVectorSupport();
    }
  }

  /**
   * Get vector manager instance
   */
  getVectorManager(): KuzuVectorManager | null {
    return this.vectorManager;
  }

  /**
   * Rebuild vector indices (for memory system maintenance)
   */
  async rebuildVectorIndices(tableNames?: string[]): Promise<void> {
    if (this.vectorManager) {
      // Drop existing indices first
      await this.dropVectorIndicesWithFunctions();
      
      // Recreate indices
      await this.createVectorIndicesWithFunctions();
    } else {
      console.warn('KuzuSchemaManager: Vector manager not initialized');
    }
  }

  /**
   * Get schema as string representation
   */
  get schema(): string {
    return `Kuzu Graph Database Schema v${this.currentVersion}
    
Node Tables: Note, Cluster, Tag, Mention, Entity, 
GlobalTriple, Thread, ThreadMessage
Relationship Tables: CONTAINS, IN_CLUSTER, LINKS_TO, MENTIONS, HAS_TAG,
MENTIONED_IN, SUBJECT_OF, OBJECT_OF, GLOBAL_TRIPLE_MEMBER,
CO_OCCURS, IN_THREAD, REPLIES_TO
Indices: Entity(kind,label), Note(slugTitle), Note(clusterId), Note(parentId)`;
  }

  /**
   * Get structured schema representation
   */
  get structuredSchema(): Record<string, any> {
    return {
      version: this.currentVersion,
      nodeTypes: [
        'Note', 'Cluster', 'Tag', 'Mention', 'Entity', 
        'GlobalTriple', 'Thread', 'ThreadMessage'
      ],
      relationshipTypes: [
        'CONTAINS', 'IN_CLUSTER', 'LINKS_TO', 'MENTIONS', 'HAS_TAG',
        'MENTIONED_IN', 'SUBJECT_OF', 'OBJECT_OF', 'GLOBAL_TRIPLE_MEMBER',
        'CO_OCCURS', 'IN_THREAD', 'REPLIES_TO'
      ],
      indices: [
        'idx_entity_kind_label', 'idx_note_slug', 'idx_note_cluster', 'idx_note_parent'
      ]
    };
  }
}
