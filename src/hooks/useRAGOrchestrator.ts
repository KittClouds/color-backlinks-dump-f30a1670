
import { useState, useCallback } from 'react';
import { ragOrchestrator, type RAGQuery, type RAGResult } from '@/services/RAGOrchestrator';
import type { RankedNode } from '@/lib/graph/GraphRAG';

export interface UseRAGOrchestratorOptions {
  autoInitialize?: boolean;
}

export function useRAGOrchestrator(options: UseRAGOrchestratorOptions = {}) {
  const { autoInitialize = true } = options;
  
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialize the orchestrator
  const initialize = useCallback(async () => {
    if (isInitialized) return;
    
    try {
      setIsLoading(true);
      setError(null);
      await ragOrchestrator.initialize();
      setIsInitialized(true);
      console.log('[useRAGOrchestrator] Initialized successfully');
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('[useRAGOrchestrator] Initialization failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized]);

  // Process a full RAG query
  const processQuery = useCallback(async (ragQuery: RAGQuery): Promise<RAGResult | null> => {
    if (!isInitialized && autoInitialize) {
      await initialize();
    }

    if (!isInitialized) {
      throw new Error('RAG Orchestrator not initialized');
    }

    try {
      setIsLoading(true);
      setError(null);
      const result = await ragOrchestrator.processQuery(ragQuery);
      console.log(`[useRAGOrchestrator] Query processed: ${result.nodes.length} results`);
      return result;
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('[useRAGOrchestrator] Query failed:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, autoInitialize, initialize]);

  // Get just the context string
  const getContext = useCallback(async (query: string, options?: RAGQuery['options']): Promise<string> => {
    if (!isInitialized && autoInitialize) {
      await initialize();
    }

    if (!isInitialized) {
      throw new Error('RAG Orchestrator not initialized');
    }

    try {
      setIsLoading(true);
      setError(null);
      const context = await ragOrchestrator.getContext(query, options);
      return context;
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('[useRAGOrchestrator] Context retrieval failed:', error);
      return '';
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, autoInitialize, initialize]);

  // Semantic search without full context assembly
  const searchSemantic = useCallback(async (
    query: string, 
    topK: number = 5, 
    options?: Omit<RAGQuery['options'], 'finalTopK'>
  ): Promise<RankedNode[]> => {
    if (!isInitialized && autoInitialize) {
      await initialize();
    }

    if (!isInitialized) {
      throw new Error('RAG Orchestrator not initialized');
    }

    try {
      setIsLoading(true);
      setError(null);
      const results = await ragOrchestrator.searchSemantic(query, topK, options);
      return results;
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('[useRAGOrchestrator] Semantic search failed:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized, autoInitialize, initialize]);

  return {
    processQuery,
    getContext,
    searchSemantic,
    initialize,
    isLoading,
    isInitialized,
    error,
    isReady: isInitialized && !isLoading && !error
  };
}
