import { GraphStore } from '../langchain-lite/graph_store';
import { GraphDocument } from '../langchain-lite/graph';
import { KuzuSchemaManager } from './KuzuSchemaManager';
import { KuzuQueryResult } from './types';
import { atomicJSONManager } from '@/json-manager/AtomicJSONManager';
import { jsonSafetyManager } from '@/json-manager/SafetyManager';
import kuzuService from './KuzuService';

/**
 * KuzuGraphStore - Implementation of GraphStore using unified KuzuService
 * Now uses official Kuzu patterns via KuzuService while maintaining all functionality
 */
export class KuzuGraphStore extends GraphStore {
  private schemaManager: KuzuSchemaManager | null = null;

  constructor() {
    super();
  }

  /**
   * Initialize the store using KuzuService
   */
  async initialize(): Promise<void> {
    console.log('KuzuGraphStore: Initializing via KuzuService...');
    
    // Initialize via unified service
    await kuzuService.init();
    this.schemaManager = await kuzuService.getSchemaManager();
    
    // Ensure schema is properly set up
    const validation = await this.schemaManager.validateSchema();
    if (!validation.isValid) {
      console.warn('KuzuGraphStore: Schema validation issues:', validation.errors);
      // Attempt to reinitialize schema
      await this.schemaManager.initializeSchema();
    }

    console.log('KuzuGraphStore: Initialization complete via KuzuService');
  }

  /**
   * Get textual schema representation
   */
  get schema(): string {
    return this.schemaManager?.schema || '';
  }

  /**
   * Get structured schema representation
   */
  get structuredSchema(): Record<string, any> {
    return this.schemaManager?.structuredSchema || {};
  }

  /**
   * Execute KuzuQL query using unified service with atomic safety
   */
  async query(
    query: string, 
    params: Record<string, any> = {}
  ): Promise<Array<Record<string, any>>> {
    await this.ensureInitialized();
    
    // Delegate to unified service which handles all the safety and official patterns
    return await kuzuService.query(query, params);
  }

  /**
   * Refresh schema metadata using unified service
   */
  async refreshSchema(): Promise<void> {
    await this.ensureInitialized();
    
    try {
      console.log('KuzuGraphStore: Refreshing schema via KuzuService...');
      
      // Re-validate current schema
      const validation = await this.schemaManager!.validateSchema();
      if (!validation.isValid) {
        console.warn('KuzuGraphStore: Schema issues detected during refresh:', validation.errors);
        
        // Attempt schema repair or recreation
        await this.schemaManager!.initializeSchema();
      }
      
      console.log('KuzuGraphStore: Schema refresh completed');
    } catch (error) {
      console.error('KuzuGraphStore: Schema refresh failed:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive diagnostics using unified service
   */
  async getDiagnostics(): Promise<{
    schema: any;
    tableCount: number;
    indexCount: number;
    isInitialized: boolean;
    lastQuery?: string;
  }> {
    try {
      const serviceDiagnostics = await kuzuService.getDiagnostics();
      
      return {
        schema: serviceDiagnostics.schema,
        tableCount: serviceDiagnostics.tableCount,
        indexCount: serviceDiagnostics.indexCount,
        isInitialized: serviceDiagnostics.isInitialized,
        lastQuery: 'CALL show_tables() RETURN name, type;'
      };
    } catch (error) {
      console.error('KuzuGraphStore: Failed to get diagnostics:', error);
      return {
        schema: {},
        tableCount: 0,
        indexCount: 0,
        isInitialized: false
      };
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.schemaManager) {
      await this.initialize();
    }
  }

  private async ingestVertex(vertex: any, backupId: string): Promise<void> {
    // Determine vertex type and create appropriate KuzuQL
    const vertexType = this.inferVertexType(vertex);
    const query = this.buildVertexInsertQuery(vertexType, vertex);
    
    await this.query(query, vertex.properties || {});
  }

  private async ingestEdge(edge: any, backupId: string): Promise<void> {
    // Build edge insert query
    const query = this.buildEdgeInsertQuery(edge);
    const params = {
      sourceId: edge.source,
      targetId: edge.target,
      ...edge.properties
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

  private inferVertexType(vertex: any): string {
    // Infer Kuzu vertex type from vertex properties
    if (vertex.type === 'Note' || vertex.labels?.includes('Note')) return 'Note';
    if (vertex.type === 'Entity' || vertex.labels?.includes('Entity')) return 'Entity';
    if (vertex.type === 'Cluster' || vertex.labels?.includes('Cluster')) return 'Cluster';
    if (vertex.type === 'Tag' || vertex.labels?.includes('Tag')) return 'Tag';
    if (vertex.type === 'Thread' || vertex.labels?.includes('Thread')) return 'Thread';
    
    // Default fallback
    return 'Note';
  }

  private buildVertexInsertQuery(vertexType: string, vertex: any): string {
    const properties = Object.keys(vertex.properties || {}).join(', ');
    const paramPlaceholders = Object.keys(vertex.properties || {})
      .map(key => `${key}: $${key}`)
      .join(', ');
    
    return `
      MERGE (n:${vertexType} {id: $id})
      SET ${paramPlaceholders.split(', ').map(p => `n.${p}`).join(', ')},
          n.updatedAt = datetime()
    `;
  }

  private buildEdgeInsertQuery(edge: any): string {
    const relType = edge.type || 'LINKS_TO';
    
    return `
      MATCH (source {id: $sourceId})
      MATCH (target {id: $targetId})
      MERGE (source)-[r:${relType}]->(target)
      SET r.createdAt = datetime()
    `;
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
        
        // Process vertices first (GraphDocument uses vertices, not nodes)
        for (const vertex of graphDoc.vertices) {
          await this.ingestVertex(vertex, backupId);
        }
        
        // Then process edges (GraphDocument uses edges, not relationships)
        for (const edge of graphDoc.edges) {
          await this.ingestEdge(edge, backupId);
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
}
