
import { jsonSchemaRegistry } from '@/json-manager/schemas';

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
 * Kuzu Schema Manager - Handles DDL operations and schema evolution
 */
export class KuzuSchemaManager {
  private conn: any;
  private currentVersion = '1.0.0';
  private appliedVersions: Set<string> = new Set();

  constructor(connection: any) {
    this.conn = connection;
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
      
      // Finally create indices for performance
      await this.createIndices();
      
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
   * Add vector extension support (optional)
   */
  async enableVectorExtension(): Promise<void> {
    try {
      console.log('KuzuSchemaManager: Enabling vector extension...');
      
      // Add embedding column to Entity table
      await this.conn.execute(`
        ALTER NODE TABLE Entity ADD COLUMN IF NOT EXISTS embedding FLOAT[1536]
      `);

      // Create HNSW index for vector search
      await this.conn.execute(`
        CREATE INDEX IF NOT EXISTS hnsw_entity_embedding
        ON Entity(embedding)
        USING HNSW PARAMETERS (M=16, efConstruction=200)
      `);

      console.log('KuzuSchemaManager: Vector extension enabled');
    } catch (error) {
      console.warn('KuzuSchemaManager: Vector extension not available or failed:', error);
    }
  }

  /**
   * Get schema as string representation
   */
  get schema(): string {
    return `Kuzu Graph Database Schema v${this.currentVersion}
    
Node Tables: Note, Cluster, Tag, Mention, Entity, GlobalTriple, Thread, ThreadMessage
Relationship Tables: CONTAINS, IN_CLUSTER, LINKS_TO, MENTIONS, HAS_TAG, MENTIONED_IN, SUBJECT_OF, OBJECT_OF, GLOBAL_TRIPLE_MEMBER, CO_OCCURS, IN_THREAD, REPLIES_TO
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
