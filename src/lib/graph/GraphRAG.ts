
/**
 * GraphRAG: Graph-based Retrieval Augmented Generation
 * 
 * Enhances retrieval by using a graph structure to connect related content
 * and improve information retrieval through semantic connections.
 * 
 * Phase 2: Optimized for Kuzu integration with HNSW-powered initial scoring
 */

type SupportedEdgeType = 'semantic';

// Types for graph nodes and edges
export interface GraphNode {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, any>;
}

interface RankedNode extends GraphNode {
  score: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: SupportedEdgeType;
}

export interface GraphChunk {
  text: string;
  metadata: Record<string, any>;
}

export interface GraphEmbedding {
  vector: number[];
}

// Kuzu integration types
export interface KuzuMemoryItem {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: {
    kuzuType?: string;
    initialScore?: number;
    similarity?: number;
    [key: string]: any;
  };
}

export class GraphRAG {
  private nodes: Map<string, GraphNode>;
  private edges: GraphEdge[];
  private dimension: number;
  private threshold: number;

  constructor(dimension: number = 1536, threshold: number = 0.7) {
    this.nodes = new Map();
    this.edges = [];
    this.dimension = dimension;
    this.threshold = threshold;
  }

  // Add a node to the graph
  addNode(node: GraphNode): void {
    if (!node.embedding) {
      throw new Error('Node must have an embedding');
    }
    if (node.embedding.length !== this.dimension) {
      throw new Error(`Embedding dimension must be ${this.dimension}`);
    }
    this.nodes.set(node.id, node);
  }

  // Add an edge between two nodes
  addEdge(edge: GraphEdge): void {
    if (!this.nodes.has(edge.source) || !this.nodes.has(edge.target)) {
      throw new Error('Both source and target nodes must exist');
    }
    this.edges.push(edge);
    // Add reverse edge
    this.edges.push({
      source: edge.target,
      target: edge.source,
      weight: edge.weight,
      type: edge.type,
    });
  }

  // Helper method to get all nodes
  getNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  // Helper method to get all edges
  getEdges(): GraphEdge[] {
    return this.edges;
  }

  getEdgesByType(type: string): GraphEdge[] {
    return this.edges.filter(edge => edge.type === type);
  }

  clear(): void {
    this.nodes.clear();
    this.edges = [];
  }

  updateNodeContent(id: string, newContent: string): void {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`Node ${id} not found`);
    }
    node.content = newContent;
  }

  /**
   * NEW: Build graph from Kuzu memory service results
   * Primary data ingestion method for Phase 2
   */
  buildFromKuzuResults(kuzuItems: KuzuMemoryItem[]): void {
    console.log(`[GraphRAG] Building graph from ${kuzuItems.length} Kuzu memory items`);
    
    // Clear existing graph
    this.clear();
    
    // Create nodes from Kuzu results
    for (const item of kuzuItems) {
      if (!item.embedding || item.embedding.length !== this.dimension) {
        console.warn(`[GraphRAG] Skipping item ${item.id} - invalid embedding`);
        continue;
      }
      
      const node: GraphNode = {
        id: item.id,
        content: item.content,
        embedding: item.embedding,
        metadata: {
          kuzuType: item.metadata?.kuzuType,
          initialScore: item.metadata?.initialScore || item.metadata?.similarity,
          ...item.metadata
        }
      };
      
      this.addNode(node);
    }
    
    // Create semantic edges based on cosine similarity
    const nodeArray = Array.from(this.nodes.values());
    console.log(`[GraphRAG] Creating semantic edges for ${nodeArray.length} nodes with threshold ${this.threshold}`);
    
    let edgeCount = 0;
    for (let i = 0; i < nodeArray.length; i++) {
      const node1 = nodeArray[i];
      for (let j = i + 1; j < nodeArray.length; j++) {
        const node2 = nodeArray[j];
        
        const similarity = this.cosineSimilarity(node1.embedding!, node2.embedding!);
        
        if (similarity > this.threshold) {
          this.addEdge({
            source: node1.id,
            target: node2.id,
            weight: similarity,
            type: 'semantic',
          });
          edgeCount++;
        }
      }
    }
    
    console.log(`[GraphRAG] Created ${edgeCount} semantic edges`);
  }

  /**
   * Alternative method name for clarity
   */
  buildContextualGraph(kuzuItems: KuzuMemoryItem[]): void {
    this.buildFromKuzuResults(kuzuItems);
  }

  // Get neighbors of a node
  private getNeighbors(nodeId: string, edgeType?: string): { id: string; weight: number }[] {
    return this.edges
      .filter(edge => edge.source === nodeId && (!edgeType || edge.type === edgeType))
      .map(edge => ({
        id: edge.target,
        weight: edge.weight,
      }))
      .filter(node => node !== undefined);
  }

  // Calculate cosine similarity between two vectors
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (!vec1 || !vec2) {
      throw new Error('Vectors must not be null or undefined');
    }
    const vectorLength = vec1.length;

    if (vectorLength !== vec2.length) {
      throw new Error(`Vector dimensions must match: vec1(${vec1.length}) !== vec2(${vec2.length})`);
    }

    let dotProduct = 0;
    let normVec1 = 0;
    let normVec2 = 0;

    for (let i = 0; i < vectorLength; i++) {
      const a = vec1[i]!;
      const b = vec2[i]!;

      dotProduct += a * b;
      normVec1 += a * a;
      normVec2 += b * b;
    }
    const magnitudeProduct = Math.sqrt(normVec1 * normVec2);

    if (magnitudeProduct === 0) {
      return 0;
    }

    const similarity = dotProduct / magnitudeProduct;
    return Math.max(-1, Math.min(1, similarity));
  }

  // Legacy method for backward compatibility
  createGraph(chunks: GraphChunk[], embeddings: GraphEmbedding[]) {
    if (!chunks?.length || !embeddings?.length) {
      throw new Error('Chunks and embeddings arrays must not be empty');
    }
    if (chunks.length !== embeddings.length) {
      throw new Error('Chunks and embeddings must have the same length');
    }
    
    // Clear existing graph
    this.clear();
    
    // Create nodes from chunks
    chunks.forEach((chunk, index) => {
      const node: GraphNode = {
        id: index.toString(),
        content: chunk.text,
        embedding: embeddings[index]?.vector,
        metadata: { ...chunk.metadata },
      };
      this.addNode(node);
    });

    // Create edges based on cosine similarity
    for (let i = 0; i < chunks.length; i++) {
      const firstEmbedding = embeddings[i]?.vector as number[];
      for (let j = i + 1; j < chunks.length; j++) {
        const secondEmbedding = embeddings[j]?.vector as number[];
        const similarity = this.cosineSimilarity(firstEmbedding, secondEmbedding);

        if (similarity > this.threshold) {
          this.addEdge({
            source: i.toString(),
            target: j.toString(),
            weight: similarity,
            type: 'semantic',
          });
        }
      }
    }
  }

  private selectWeightedNeighbor(neighbors: Array<{ id: string; weight: number }>): string {
    const totalWeight = neighbors.reduce((sum, n) => sum + n.weight, 0);
    let remainingWeight = Math.random() * totalWeight;

    for (const neighbor of neighbors) {
      remainingWeight -= neighbor.weight;
      if (remainingWeight <= 0) {
        return neighbor.id;
      }
    }

    return neighbors[neighbors.length - 1]?.id as string;
  }

  // Perform random walk with restart
  private randomWalkWithRestart(startNodeId: string, steps: number, restartProb: number): Map<string, number> {
    const visits = new Map<string, number>();
    let currentNodeId = startNodeId;

    for (let step = 0; step < steps; step++) {
      visits.set(currentNodeId, (visits.get(currentNodeId) || 0) + 1);

      if (Math.random() < restartProb) {
        currentNodeId = startNodeId;
        continue;
      }

      const neighbors = this.getNeighbors(currentNodeId);
      if (neighbors.length === 0) {
        currentNodeId = startNodeId;
        continue;
      }

      currentNodeId = this.selectWeightedNeighbor(neighbors);
    }

    // Normalize visits
    const totalVisits = Array.from(visits.values()).reduce((a, b) => a + b, 0);
    const normalizedVisits = new Map<string, number>();
    for (const [nodeId, count] of visits) {
      normalizedVisits.set(nodeId, count / totalVisits);
    }

    return normalizedVisits;
  }

  /**
   * OPTIMIZED: Retrieve relevant nodes using hybrid approach with Kuzu scores
   * Phase 2: Leverages initialScore from Kuzu's HNSW search
   */
  query({
    query,
    topK = 10,
    randomWalkSteps = 100,
    restartProb = 0.15,
  }: {
    query: number[];
    topK?: number;
    randomWalkSteps?: number;
    restartProb?: number;
  }): RankedNode[] {
    if (!query || query.length !== this.dimension) {
      throw new Error(`Query embedding must have dimension ${this.dimension}`);
    }
    if (topK < 1) {
      throw new Error('TopK must be greater than 0');
    }
    if (randomWalkSteps < 1) {
      throw new Error('Random walk steps must be greater than 0');
    }
    if (restartProb <= 0 || restartProb >= 1) {
      throw new Error('Restart probability must be between 0 and 1');
    }

    console.log(`[GraphRAG] Querying graph with ${this.nodes.size} nodes`);

    // PHASE 2 OPTIMIZATION: Use Kuzu's HNSW scores when available
    const nodeArray = Array.from(this.nodes.values());
    const topNodesInitialPass = nodeArray.map(node => {
      let similarity: number;
      
      // Prefer Kuzu's initialScore if available
      if (node.metadata?.initialScore !== undefined) {
        similarity = node.metadata.initialScore;
        console.log(`[GraphRAG] Using Kuzu score ${similarity} for node ${node.id}`);
      } else {
        // Fallback to computing cosine similarity
        similarity = this.cosineSimilarity(query, node.embedding!);
        console.log(`[GraphRAG] Computing fallback similarity ${similarity} for node ${node.id}`);
      }
      
      return { node, similarity };
    }).sort((a, b) => b.similarity - a.similarity) // Higher scores are better
      .slice(0, Math.max(topK, 20)); // Use at least 20 for random walk, or topK if larger

    console.log(`[GraphRAG] Selected ${topNodesInitialPass.length} nodes for random walk reranking`);

    // Re-rank nodes using random walk with restart
    const rerankedNodes = new Map<string, { node: GraphNode; score: number }>();

    for (const { node, similarity: initialNodeSimilarityToQuery } of topNodesInitialPass) {
      const walkScores = this.randomWalkWithRestart(node.id, randomWalkSteps, restartProb);

      // Combine Kuzu's initial score with graph walk score
      for (const [nodeId, walkScore] of walkScores) {
        const rerankedNode = this.nodes.get(nodeId)!;
        const existingScore = rerankedNodes.get(nodeId)?.score || 0;
        rerankedNodes.set(nodeId, {
          node: rerankedNode,
          score: existingScore + (initialNodeSimilarityToQuery * walkScore)
        });
      }
    }

    // Sort by final score and return top K nodes
    const finalResults = Array.from(rerankedNodes.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(item => ({
        id: item.node.id,
        content: item.node.content,
        embedding: item.node.embedding,
        metadata: item.node.metadata,
        score: item.score,
      }));

    console.log(`[GraphRAG] Returning ${finalResults.length} reranked results`);
    return finalResults;
  }
}

// Export a singleton instance for easy imports
export const graphRag = new GraphRAG(1536, 0.7);
export default graphRag;
