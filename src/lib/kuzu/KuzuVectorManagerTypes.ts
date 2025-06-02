
/**
 * Fine-grained HNSW index construction parameters.
 * Defaults should be applied by KuzuVectorManager if not specified.
 */
export interface HNSWParameters {
  M?: number;               // Max connections/node (lower layers). Default: e.g., 16
  efConstruction?: number;  // Construction-time neighborhood size. Default: e.g., 200
  metric?: 'cosine' | 'l2' | 'l2sq' | 'dotproduct'; // Default: 'cosine'
  // Optional: For Kuzu HNSW variants supporting multi-layer explicit params
  mu?: number;              // Max connections/node (upper layer(s)). Default: e.g., M * 2 or specific value
  pu?: number;              // Sampling probability for upper layers (0.0-1.0). Default: e.g., 0.05
}

export interface VectorIndexConfig {
  tableName: string;
  indexName: string;
  columnName: string; // FLOAT[] type in Kuzu
  parameters: HNSWParameters;
}

export interface VectorIndexStatus {
  indexName: string;
  tableName: string;
  isValid: boolean;
  lastRebuilt?: string;
  itemCount?: number;
}

export interface VectorSearchOptions {
  tableName: string;
  queryVector: number[];
  limit?: number;
  filters?: Record<string, any>;
  efs?: number;
}

/**
 * Enhanced search options using logical index names
 */
export interface ManagedVectorSearchOptions {
  logicalIndexName: string; // User provides the logical name
  queryVector: number[];
  limit?: number;
  filters?: Record<string, any>;
  efs?: number;
}

/**
 * Internal state management for each managed vector index
 */
export interface ManagedIndexInternalState {
  logicalName: string; // User-defined name, e.g., "notes_embeddings"
  tableName: string;
  columnName: string;
  currentParameters: HNSWParameters; // The HNSWParameters for the active index
  activePhysicalName: string; // Actual Kuzu index name, e.g., "notes_embeddings_v2"
  isRebuilding: boolean;
  lastRebuildAttempt?: Date;
  lastSuccessfulRebuild?: Date;
}

/**
 * Structure returned by Kuzu's SHOW_INDEXES command
 */
export interface KuzuIndexInfo {
  indexName: string;
  tableName: string;
  propertyNames: string[];
}
