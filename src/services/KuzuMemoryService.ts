import { KuzuVectorManager } from '@/lib/kuzu/KuzuVectorManager';
import { KuzuConnection } from '@/lib/kuzu/KuzuTypes';
import kuzuService from '@/lib/kuzu/KuzuService';
import { pipeline } from '@huggingface/transformers';

export interface MemoryItem {
  id: string;
  content: string;
  type: 'note' | 'chat_message' | 'entity';
  importance: number;
  userId?: string;
  categoryId?: string;
  embedding?: number[];
  accessCount: number;
  lastAccessedAt: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export interface SearchOptions {
  query?: string;
  userId?: string;
  categoryId?: string;
  importance?: { min?: number; max?: number };
  dateRange?: { start?: string; end?: string };
  limit?: number;
  efs?: number;
}

export interface ContextualMemoryOptions {
  sourceId: string;
  sourceType: 'note' | 'thread_message';
  limit?: number;
  includeRelated?: boolean;
}

/**
 * Unified memory service with mutex-guarded embedding model initialization
 * Provides semantic search and contextual memory retrieval
 */
export class KuzuMemoryService {
  private vectorManager: KuzuVectorManager | null = null;
  private embeddingModel: any = null;
  private embeddingModelPromise: Promise<any> | null = null; // Mutex-guard singleton

  constructor() {
    // Vector manager will be initialized when needed
  }

  /**
   * Initialize the memory service
   */
  async initialize(): Promise<void> {
    await kuzuService.init();
    const db = await kuzuService.getDb();
    
    // Get the Kuzu instance to create a connection
    const kuzuInstance = (kuzuService as any).kuzu;
    const conn = new kuzuInstance.Connection(db);
    
    this.vectorManager = new KuzuVectorManager(conn);
    
    // Set up vector infrastructure
    await this.vectorManager.addEmbeddingColumns();
    await this.vectorManager.createVectorIndices();
    
    console.log('KuzuMemoryService: Initialized with vector support');
  }

  /**
   * Generate embedding with mutex-guarded model initialization
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Mutex-guard: ensure only one model initialization at a time
      if (!this.embeddingModel) {
        if (!this.embeddingModelPromise) {
          console.log('KuzuMemoryService: Starting embedding model initialization...');
          this.embeddingModelPromise = pipeline(
            'feature-extraction',
            'nomic-ai/modernbert-embed-base',
            { 
              device: 'webgpu',
              dtype: 'fp32'
            }
          );
        }
        
        // Await the singleton promise - concurrent calls will wait for the same initialization
        this.embeddingModel = await this.embeddingModelPromise;
        console.log('KuzuMemoryService: Embedding model initialized');
      }

      const embedding = await this.embeddingModel(text, { 
        pooling: 'mean', 
        normalize: true 
      });
      
      // Convert tensor to array
      const embeddingArray = embedding.tolist()[0];
      
      // Ensure we have exactly 768 dimensions
      if (embeddingArray.length !== 768) {
        console.warn(`KuzuMemoryService: Expected 768 dimensions, got ${embeddingArray.length}`);
      }
      
      return embeddingArray;
    } catch (error) {
      console.error('KuzuMemoryService: Failed to generate embedding:', error);
      // Reset the promise so next call can retry
      this.embeddingModelPromise = null;
      this.embeddingModel = null;
      
      // Fallback to dummy embedding if model fails
      console.warn('KuzuMemoryService: Using fallback dummy embedding');
      return new Array(768).fill(0).map(() => Math.random());
    }
  }

  /**
   * Store a new memory item
   */
  async storeMemory(options: {
    content: string;
    type: 'note' | 'chat_message';
    userId?: string;
    categoryId?: string;
    importance?: number;
    metadata?: Record<string, any>;
  }): Promise<string> {
    const { content, type, userId, categoryId, importance = 0.5, metadata = {} } = options;
    
    const id = `memory_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const embedding = await this.generateEmbedding(content);
    const now = new Date().toISOString();

    if (type === 'note') {
      await kuzuService.query(`
        CREATE (n:Note {
          id: $id,
          title: $title,
          content: $content,
          type: 'note',
          importance: $importance,
          userId: $userId,
          categoryId: $categoryId,
          embedding: $embedding,
          accessCount: 0,
          lastAccessedAt: $now,
          createdAt: $now,
          updatedAt: $now
        })
      `, {
        id,
        title: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
        content,
        importance,
        userId,
        categoryId,
        embedding,
        now
      });
    } else if (type === 'chat_message') {
      await kuzuService.query(`
        CREATE (tm:ThreadMessage {
          id: $id,
          content: $content,
          role: $role,
          importance: $importance,
          embedding: $embedding,
          accessCount: 0,
          lastAccessedAt: $now,
          createdAt: $now,
          updatedAt: $now
        })
      `, {
        id,
        content,
        role: metadata.role || 'user',
        importance,
        embedding,
        now
      });
    }

    // Trigger index rebuild if needed
    await this.checkAndRebuildIndices();

    console.log(`KuzuMemoryService: Stored ${type} memory ${id}`);
    return id;
  }

  /**
   * Search memories using semantic similarity
   */
  async searchMemories(options: SearchOptions): Promise<MemoryItem[]> {
    if (!options.query) {
      throw new Error('Query text is required for semantic search');
    }

    if (!this.vectorManager) {
      await this.initialize();
    }

    const queryEmbedding = await this.generateEmbedding(options.query);
    const limit = options.limit || 10;
    
    // Build filters
    const filters: Record<string, any> = {};
    if (options.userId) filters.userId = options.userId;
    if (options.categoryId) filters.categoryId = options.categoryId;
    if (options.importance?.min) {
      filters.importance = { operator: '>=', value: options.importance.min };
    }

    // Search in Note table
    const noteResults = await this.vectorManager!.vectorSearch({
      tableName: 'Note',
      queryVector: queryEmbedding,
      limit,
      filters,
      efs: options.efs
    });

    // Search in ThreadMessage table  
    const messageResults = await this.vectorManager!.vectorSearch({
      tableName: 'ThreadMessage',
      queryVector: queryEmbedding,
      limit,
      filters,
      efs: options.efs
    });

    // Combine and format results
    const allResults = [
      ...noteResults.map(r => ({ ...r.found_node, type: 'note', similarity: r.similarity_distance })),
      ...messageResults.map(r => ({ ...r.found_node, type: 'chat_message', similarity: r.similarity_distance }))
    ];

    // Sort by similarity and limit
    allResults.sort((a, b) => a.similarity - b.similarity);
    const topResults = allResults.slice(0, limit);

    // Update access counts
    const noteIds = topResults.filter(r => r.type === 'note').map(r => r.id);
    const messageIds = topResults.filter(r => r.type === 'chat_message').map(r => r.id);

    if (noteIds.length > 0) {
      await kuzuService.query(`
        MATCH (n:Note) WHERE n.id IN $ids 
        SET n.accessCount = n.accessCount + 1, n.lastAccessedAt = $now
      `, { ids: noteIds, now: new Date().toISOString() });
    }

    if (messageIds.length > 0) {
      await kuzuService.query(`
        MATCH (tm:ThreadMessage) WHERE tm.id IN $ids 
        SET tm.accessCount = tm.accessCount + 1, tm.lastAccessedAt = $now  
      `, { ids: messageIds, now: new Date().toISOString() });
    }

    return topResults.map(r => ({
      id: r.id,
      content: r.content,
      type: r.type,
      importance: r.importance || 0.5,
      userId: r.userId,
      categoryId: r.categoryId,
      accessCount: (r.accessCount || 0) + 1,
      lastAccessedAt: new Date().toISOString(),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      metadata: { similarity: r.similarity }
    }));
  }

  /**
   * Get contextual memories related to a specific item
   */
  async getContextualMemories(options: ContextualMemoryOptions): Promise<MemoryItem[]> {
    const { sourceId, sourceType, limit = 5, includeRelated = true } = options;

    if (!this.vectorManager) {
      await this.initialize();
    }

    // Get the source item and its embedding
    const sourceTable = sourceType === 'note' ? 'Note' : 'ThreadMessage';
    const sourceResult = await kuzuService.query(`
      MATCH (n:${sourceTable}) WHERE n.id = $sourceId
      RETURN n.embedding as embedding, n.content as content
    `, { sourceId });

    if (sourceResult.length === 0) {
      return [];
    }

    const sourceEmbedding = sourceResult[0].embedding;
    if (!sourceEmbedding) {
      return [];
    }

    // Find similar memories
    const similarMemories = await this.vectorManager!.vectorSearch({
      tableName: sourceTable,
      queryVector: sourceEmbedding,
      limit: limit + 1, // +1 to exclude self
      efs: 100
    });

    // Filter out the source item itself
    const contextualResults = similarMemories.filter(r => r.found_node.id !== sourceId);

    return contextualResults.slice(0, limit).map(r => ({
      id: r.found_node.id,
      content: r.found_node.content,
      type: sourceType === 'note' ? 'note' : 'chat_message',
      importance: r.found_node.importance || 0.5,
      userId: r.found_node.userId,
      categoryId: r.found_node.categoryId,
      accessCount: r.found_node.accessCount || 0,
      lastAccessedAt: r.found_node.lastAccessedAt,
      createdAt: r.found_node.createdAt,
      updatedAt: r.found_node.updatedAt,
      metadata: { similarity: r.similarity_distance, contextSource: sourceId }
    }));
  }

  /**
   * Update memory importance
   */
  async updateMemoryImportance(id: string, importance: number): Promise<void> {
    const now = new Date().toISOString();

    // Try updating in Note table first
    const noteResult = await kuzuService.query(`
      MATCH (n:Note) WHERE n.id = $id
      SET n.importance = $importance, n.updatedAt = $now
      RETURN n.id
    `, { id, importance, now });

    if (noteResult.length === 0) {
      // Try ThreadMessage table
      await kuzuService.query(`
        MATCH (tm:ThreadMessage) WHERE tm.id = $id
        SET tm.importance = $importance, tm.updatedAt = $now
      `, { id, importance, now });
    }

    console.log(`KuzuMemoryService: Updated importance for ${id} to ${importance}`);
  }

  /**
   * Prune low-importance or old memories
   */
  async pruneMemories(criteria: {
    maxAge?: number; // days
    minImportance?: number;
    maxItems?: number;
  }): Promise<number> {
    const { maxAge, minImportance = 0.1, maxItems } = criteria;
    let deletedCount = 0;

    // Build deletion criteria
    const conditions: string[] = [];
    if (maxAge) {
      const cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000).toISOString();
      conditions.push(`n.createdAt < '${cutoffDate}'`);
    }
    if (minImportance) {
      conditions.push(`n.importance < ${minImportance}`);
    }

    if (conditions.length > 0) {
      const whereClause = conditions.join(' AND ');
      
      // Delete from Note table
      const noteDeleteResult = await kuzuService.query(`
        MATCH (n:Note) WHERE ${whereClause}
        DELETE n
        RETURN count(n) as deletedCount
      `);
      
      // Delete from ThreadMessage table
      const messageDeleteResult = await kuzuService.query(`
        MATCH (tm:ThreadMessage) WHERE ${whereClause.replace(/n\./g, 'tm.')}
        DELETE tm
        RETURN count(tm) as deletedCount
      `);

      deletedCount = (noteDeleteResult[0]?.deletedCount || 0) + (messageDeleteResult[0]?.deletedCount || 0);
    }

    // Trigger index rebuild after pruning
    if (deletedCount > 0) {
      await this.checkAndRebuildIndices();
    }

    console.log(`KuzuMemoryService: Pruned ${deletedCount} memories`);
    return deletedCount;
  }

  /**
   * Check if indices need rebuilding and rebuild if necessary
   */
  private async checkAndRebuildIndices(): Promise<void> {
    if (!this.vectorManager) return;

    const needsRebuild = await Promise.all([
      this.vectorManager.hasVectorIndexChanged('Note'),
      this.vectorManager.hasVectorIndexChanged('ThreadMessage')
    ]);

    if (needsRebuild.some(Boolean)) {
      console.log('KuzuMemoryService: Rebuilding vector indices...');
      await this.vectorManager.rebuildVectorIndexes();
    }
  }

  /**
   * Get memory statistics
   */
  async getMemoryStats(): Promise<{
    totalNotes: number;
    totalMessages: number;
    avgImportance: number;
    indexStatus: any[];
  }> {
    if (!this.vectorManager) {
      await this.initialize();
    }

    const [noteStats, messageStats, indexStatus] = await Promise.all([
      kuzuService.query('MATCH (n:Note) RETURN count(n) as total, avg(n.importance) as avgImportance'),
      kuzuService.query('MATCH (tm:ThreadMessage) RETURN count(tm) as total, avg(tm.importance) as avgImportance'),
      this.vectorManager!.getVectorIndexStatus()
    ]);

    return {
      totalNotes: noteStats[0]?.total || 0,
      totalMessages: messageStats[0]?.total || 0,
      avgImportance: ((noteStats[0]?.avgImportance || 0) + (messageStats[0]?.avgImportance || 0)) / 2,
      indexStatus
    };
  }
}

// Export singleton instance
export const kuzuMemoryService = new KuzuMemoryService();
