
import { kuzuMemoryService } from './KuzuMemoryService';
import { graphRag } from '@/lib/graph/GraphRAG';
import type { RankedNode } from '@/lib/graph/GraphRAG';

export interface RAGQuery {
  query: string;
  options?: {
    initialLimit?: number;
    finalTopK?: number;
    randomWalkSteps?: number;
    restartProb?: number;
    userId?: string;
    categoryId?: string;
    importance?: { min?: number; max?: number };
  };
}

export interface RAGResult {
  nodes: RankedNode[];
  context: string;
  queryEmbedding: number[];
  processingStats: {
    initialCandidates: number;
    finalResults: number;
    kuzuSearchTime: number;
    graphRagTime: number;
    totalTime: number;
  };
}

/**
 * RAG Orchestration Layer
 * Coordinates KuzuMemoryService and GraphRAG for complete semantic retrieval
 */
export class RAGOrchestrator {
  private embeddingModel: any = null;

  constructor() {
    console.log('[RAGOrchestrator] Initialized');
  }

  /**
   * Generate embedding for query text using the same model as KuzuMemoryService
   */
  private async generateQueryEmbedding(text: string): Promise<number[]> {
    // TODO: Replace with actual embedding model when decided
    // This should use the same embedding generation as KuzuMemoryService
    // For now, return dummy embedding that matches the 1536 dimension
    return new Array(1536).fill(0).map(() => Math.random());
  }

  /**
   * Main RAG query processing pipeline
   */
  async processQuery(ragQuery: RAGQuery): Promise<RAGResult> {
    const startTime = Date.now();
    const { query, options = {} } = ragQuery;
    
    const {
      initialLimit = 30,
      finalTopK = 10,
      randomWalkSteps = 100,
      restartProb = 0.15,
      userId,
      categoryId,
      importance
    } = options;

    console.log(`[RAGOrchestrator] Processing query: "${query.substring(0, 50)}..."`);

    // Step 1: Generate query embedding
    const queryEmbedding = await this.generateQueryEmbedding(query);
    console.log(`[RAGOrchestrator] Generated query embedding (${queryEmbedding.length}D)`);

    // Step 2: Initial retrieval from Kuzu
    const kuzuStartTime = Date.now();
    const memoryItems = await kuzuMemoryService.searchMemories({
      query,
      limit: initialLimit,
      userId,
      categoryId,
      importance
    });
    const kuzuSearchTime = Date.now() - kuzuStartTime;

    console.log(`[RAGOrchestrator] Kuzu search found ${memoryItems.length} candidates in ${kuzuSearchTime}ms`);

    if (memoryItems.length === 0) {
      return {
        nodes: [],
        context: '',
        queryEmbedding,
        processingStats: {
          initialCandidates: 0,
          finalResults: 0,
          kuzuSearchTime,
          graphRagTime: 0,
          totalTime: Date.now() - startTime
        }
      };
    }

    // Step 3: Convert MemoryItems to KuzuMemoryItems format for GraphRAG
    const kuzuMemoryItems = memoryItems.map(item => ({
      id: item.id,
      content: item.content,
      embedding: item.embedding || [],
      metadata: {
        kuzuType: item.type,
        initialScore: item.metadata?.similarity || 0.5,
        importance: item.importance,
        userId: item.userId,
        categoryId: item.categoryId,
        accessCount: item.accessCount,
        lastAccessedAt: item.lastAccessedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        ...item.metadata
      }
    }));

    // Step 4: Populate GraphRAG with Kuzu results
    const graphRagStartTime = Date.now();
    graphRag.buildFromKuzuResults(kuzuMemoryItems);
    console.log(`[RAGOrchestrator] Built contextual graph from ${kuzuMemoryItems.length} items`);

    // Step 5: Re-rank and explore with GraphRAG
    const rankedNodes = graphRag.query({
      query: queryEmbedding,
      topK: finalTopK,
      randomWalkSteps,
      restartProb
    });
    const graphRagTime = Date.now() - graphRagStartTime;

    console.log(`[RAGOrchestrator] GraphRAG re-ranking completed in ${graphRagTime}ms, returning ${rankedNodes.length} nodes`);

    // Step 6: Assemble context for LLM
    const context = this.assembleContext(rankedNodes);

    const totalTime = Date.now() - startTime;

    return {
      nodes: rankedNodes,
      context,
      queryEmbedding,
      processingStats: {
        initialCandidates: memoryItems.length,
        finalResults: rankedNodes.length,
        kuzuSearchTime,
        graphRagTime,
        totalTime
      }
    };
  }

  /**
   * Assemble context string from ranked nodes for LLM consumption
   */
  private assembleContext(rankedNodes: RankedNode[]): string {
    if (rankedNodes.length === 0) {
      return '';
    }

    const contextParts = rankedNodes.map((node, index) => {
      const score = node.score.toFixed(4);
      const metadata = node.metadata || {};
      const nodeType = metadata.kuzuType || 'unknown';
      
      return `[${index + 1}] (${nodeType}, score: ${score})
${node.content}`;
    });

    return `Context from semantic search:

${contextParts.join('\n\n---\n\n')}

End of context.`;
  }

  /**
   * Simplified query method that returns just the context string
   */
  async getContext(query: string, options?: RAGQuery['options']): Promise<string> {
    const result = await this.processQuery({ query, options });
    return result.context;
  }

  /**
   * Get semantic search results without full context assembly
   */
  async searchSemantic(query: string, topK: number = 5, options?: Omit<RAGQuery['options'], 'finalTopK'>): Promise<RankedNode[]> {
    const result = await this.processQuery({ 
      query, 
      options: { ...options, finalTopK: topK } 
    });
    return result.nodes;
  }

  /**
   * Initialize the orchestrator and its dependencies
   */
  async initialize(): Promise<void> {
    console.log('[RAGOrchestrator] Initializing dependencies...');
    
    // Initialize KuzuMemoryService
    await kuzuMemoryService.initialize();
    
    console.log('[RAGOrchestrator] Dependencies initialized');
  }
}

// Export singleton instance
export const ragOrchestrator = new RAGOrchestrator();
