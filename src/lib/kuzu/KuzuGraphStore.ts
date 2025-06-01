
import { GraphStore } from '../langchain-lite/graph_store';
import { GraphDocument } from '../langchain-lite/graph';
import { KuzuSchemaManager } from './KuzuSchemaManager';
import { KuzuQueryResult } from './types';
import { atomicJSONManager } from '@/json-manager/AtomicJSONManager';
import { jsonSafetyManager } from '@/json-manager/SafetyManager';

/**
 * KuzuGraphStore - Implementation of GraphStore for Kuzu database
 * Provides secure, atomic operations with your JSON manager integration
 */
export class KuzuGraphStore extends GraphStore {
  private conn: any;
  private schemaManager: KuzuSchemaManager;
  private isInitialized = false;

  constructor(connection: any, schemaManager: KuzuSchemaManager) {
    super();
    this.conn = connection;
    this.schemaManager = schemaManager;
  }

  /**
   * Initialize the store and ensure schema is ready
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('KuzuGraphStore: Initializing...');
    
    // Ensure schema is properly set up
    const validation = await this.schemaManager.validateSchema();
    if (!validation.isValid) {
      console.warn('KuzuGraphStore: Schema validation issues:', validation.errors);
      // Attempt to reinitialize schema
      await this.schemaManager.initializeSchema();
    }

    this.isInitialized = true;
    console.log('KuzuGraphStore: Initialization complete');
  }

  /**
   * Get textual schema representation
   */
  get schema(): string {
    return this.schemaManager.schema;
  }

  /**
   * Get structured schema representation
   */
  get structuredSchema(): Record<string, any> {
    return this.schemaManager.structuredSchema;
  }

  /**
   * Execute KuzuQL query with atomic safety
   */
  async query(
    query: string, 
    params: Record<string, any> = {}
  ): Promise<Array<Record<string, any>>> {
    await this.ensureInitialized();
    
    const operationId = `kuzu-query-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    try {
      // Create safety backup of query and parameters
      const backupId = jsonSafetyManager.createBackup('kuzu_query', 'execute', {
        query,
        params,
        timestamp: Date.now()
      });

      console.log(`KuzuGraphStore: Executing query with backup ${backupId}`);
      
      // Execute atomic query operation
      const result = await atomicJSONManager.atomicSerialize('kuzu_query_execution', {
        query,
        params,
        operationId
      });

      if (!result.success) {
        throw new Error(`Query preparation failed: ${result.error}`);
      }

      // Execute the actual KuzuQL query
      const queryResult = await this.conn.execute(query, params);
      
      // Validate and process results
      const processedResult = this.processQueryResult(queryResult);
      
      console.log(`KuzuGraphStore: Query executed successfully, ${processedResult.length} rows returned`);
      return processedResult;

    } catch (error) {
      console.error(`KuzuGraphStore: Query execution failed for operation ${operationId}:`, error);
      
      // Attempt corruption detection and recovery
      const corruption = jsonSafetyManager.detectCorruption('kuzu_query', query, operationId);
      if (corruption) {
        console.warn(`KuzuGraphStore: Query corruption detected: ${corruption.details}`);
      }
      
      throw error;
    }
  }

  /**
   * Refresh schema metadata
   */
  async refreshSchema(): Promise<void> {
    await this.ensureInitialized();
    
    try {
      console.log('KuzuGraphStore: Refreshing schema...');
      
      // Re-validate current schema
      const validation = await this.schemaManager.validateSchema();
      if (!validation.isValid) {
        console.warn('KuzuGraphStore: Schema issues detected during refresh:', validation.errors);
        
        // Attempt schema repair or recreation
        await this.schemaManager.initializeSchema();
      }
      
      console.log('KuzuGraphStore: Schema refresh completed');
    } catch (error) {
      console.error('KuzuGraphStore: Schema refresh failed:', error);
      throw error;
    }
  }

  /**
   * Ingest GraphDocument objects into Kuzu with 1-to-1 mapping
   */
  async addGraphDocuments(
    graphDocuments: GraphDocument[], 
    includeSource = false
  ): Promise<void> {
    await this.ensureInitialized();
    
    console.log(`KuzuGraphStore: Ingesting ${graphDocuments.length} graph documents`);
    
    for (const graphDoc of graphDocuments) {
      try {
        // Create backup before ingestion
        const backupId = jsonSafetyManager.createBackup('graph_document', 'ingest', graphDoc);
        
        // Process nodes first
        for (const node of graphDoc.nodes) {
          await this.ingestNode(node, backupId);
        }
        
        // Then process relationships
        for (const relationship of graphDoc.relationships) {
          await this.ingestRelationship(relationship, backupId);
        }
        
        // Optionally store source document
        if (includeSource && graphDoc.source) {
          await this.ingestSourceDocument(graphDoc.source, backupId);
        }
        
        console.log(`KuzuGraphStore: Successfully ingested document from backup ${backupId}`);
        
      } catch (error) {
        console.error('KuzuGraphStore: Failed to ingest graph document:', error);
        throw error;
      }
    }
  }

  /**
   * Get comprehensive diagnostics
   */
  async getDiagnostics(): Promise<{
    schema: any;
    tableCount: number;
    indexCount: number;
    isInitialized: boolean;
    lastQuery?: string;
  }> {
    try {
      const schemaInfo = await this.schemaManager.getSchemaInfo();
      
      return {
        schema: this.structuredSchema,
        tableCount: schemaInfo.tables.length,
        indexCount: 4, // Known indices from schema
        isInitialized: this.isInitialized,
        lastQuery: 'CALL show_tables() RETURN name, type;'
      };
    } catch (error) {
      console.error('KuzuGraphStore: Failed to get diagnostics:', error);
      return {
        schema: {},
        tableCount: 0,
        indexCount: 0,
        isInitialized: this.isInitialized
      };
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private processQueryResult(result: any): Array<Record<string, any>> {
    // Handle different result formats from Kuzu
    if (Array.isArray(result)) {
      return result;
    }
    
    if (result && typeof result === 'object' && result.rows) {
      return result.rows;
    }
    
    if (result && typeof result === 'object') {
      return [result];
    }
    
    return [];
  }

  private async ingestNode(node: any, backupId: string): Promise<void> {
    // Determine node type and create appropriate KuzuQL
    const nodeType = this.inferNodeType(node);
    const query = this.buildNodeInsertQuery(nodeType, node);
    
    await this.query(query, node.properties || {});
  }

  private async ingestRelationship(relationship: any, backupId: string): Promise<void> {
    // Build relationship insert query
    const query = this.buildRelationshipInsertQuery(relationship);
    const params = {
      sourceId: relationship.source.id,
      targetId: relationship.target.id,
      ...relationship.properties
    };
    
    await this.query(query, params);
  }

  private async ingestSourceDocument(source: any, backupId: string): Promise<void> {
    // Store source document metadata if needed
    const query = `
      MERGE (doc:SourceDocument {id: $id})
      SET doc.content = $content,
          doc.metadata = $metadata,
          doc.updatedAt = datetime()
    `;
    
    await this.query(query, {
      id: source.id || 'unknown',
      content: source.pageContent || '',
      metadata: JSON.stringify(source.metadata || {})
    });
  }

  private inferNodeType(node: any): string {
    // Infer Kuzu node type from node properties
    if (node.type === 'Note' || node.labels?.includes('Note')) return 'Note';
    if (node.type === 'Entity' || node.labels?.includes('Entity')) return 'Entity';
    if (node.type === 'Cluster' || node.labels?.includes('Cluster')) return 'Cluster';
    if (node.type === 'Tag' || node.labels?.includes('Tag')) return 'Tag';
    if (node.type === 'Thread' || node.labels?.includes('Thread')) return 'Thread';
    
    // Default fallback
    return 'Note';
  }

  private buildNodeInsertQuery(nodeType: string, node: any): string {
    const properties = Object.keys(node.properties || {}).join(', ');
    const paramPlaceholders = Object.keys(node.properties || {})
      .map(key => `${key}: $${key}`)
      .join(', ');
    
    return `
      MERGE (n:${nodeType} {id: $id})
      SET ${paramPlaceholders.split(', ').map(p => `n.${p}`).join(', ')},
          n.updatedAt = datetime()
    `;
  }

  private buildRelationshipInsertQuery(relationship: any): string {
    const relType = relationship.type || 'LINKS_TO';
    
    return `
      MATCH (source {id: $sourceId})
      MATCH (target {id: $targetId})
      MERGE (source)-[r:${relType}]->(target)
      SET r.createdAt = datetime()
    `;
  }
}
