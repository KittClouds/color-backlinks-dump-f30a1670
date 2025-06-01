import { ElementDefinition } from 'cytoscape';
import { GraphService } from './GraphService';
import { KuzuGraphStore } from '@/lib/kuzu/KuzuGraphStore';
import { KuzuSchemaManager } from '@/lib/kuzu/KuzuSchemaManager';
import { atomicJSONManager } from '@/json-manager/AtomicJSONManager';
import { jsonSafetyManager } from '@/json-manager/SafetyManager';
import { KuzuDataTransformer } from './sync/KuzuDataTransformer';
import { KuzuChangeDetector, KuzuChange } from './sync/KuzuChangeDetector';
import { KuzuConflictResolver, SyncConflict } from './sync/KuzuConflictResolver';
import { AllKuzuNodes, AllKuzuRels } from '@/lib/kuzu/types';

export interface SyncOperation {
  id: string;
  type: 'node' | 'edge';
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  direction: 'cytoscape_to_kuzu' | 'kuzu_to_cytoscape';
  elementId: string;
  timestamp: number;
  status: 'pending' | 'success' | 'failed' | 'conflict';
  error?: string;
  backupId?: string;
}

export interface SyncMetrics {
  totalOperations: number;
  successfulSyncs: number;
  failedSyncs: number;
  conflictsResolved: number;
  lastSyncTime: number;
  avgSyncDuration: number;
  isHealthy: boolean;
}

/**
 * KuzuSyncService - Bidirectional sync between GraphService/Cytoscape and Kuzu
 * Provides real-time synchronization with atomic safety and conflict resolution
 */
export class KuzuSyncService {
  private static instance: KuzuSyncService | null = null;
  
  private graphService: GraphService;
  private kuzuStore: KuzuGraphStore;
  private schemaManager: KuzuSchemaManager;
  private changeDetector: KuzuChangeDetector;
  
  private isInitialized = false;
  private isSyncing = false;
  private syncQueue: SyncOperation[] = [];
  private pendingOperations = new Map<string, SyncOperation>();
  private debounceTimer: NodeJS.Timeout | null = null;
  
  private metrics: SyncMetrics = {
    totalOperations: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    conflictsResolved: 0,
    lastSyncTime: 0,
    avgSyncDuration: 0,
    isHealthy: true
  };
  
  private readonly DEBOUNCE_DELAY = 500; // ms
  private readonly MAX_BATCH_SIZE = 10;
  
  constructor(
    graphService: GraphService,
    kuzuStore: KuzuGraphStore,
    schemaManager: KuzuSchemaManager
  ) {
    this.graphService = graphService;
    this.kuzuStore = kuzuStore;
    this.schemaManager = schemaManager;
    this.changeDetector = new KuzuChangeDetector(kuzuStore);
  }
  
  static getInstance(
    graphService?: GraphService,
    kuzuStore?: KuzuGraphStore,
    schemaManager?: KuzuSchemaManager
  ): KuzuSyncService {
    if (!this.instance && graphService && kuzuStore && schemaManager) {
      this.instance = new KuzuSyncService(graphService, kuzuStore, schemaManager);
    }
    return this.instance!;
  }
  
  /**
   * Initialize the sync service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('KuzuSyncService: Already initialized');
      return;
    }
    
    console.log('KuzuSyncService: Initializing bidirectional sync...');
    
    try {
      // Initialize Kuzu change detector
      await this.changeDetector.initialize();
      
      // Register GraphService change listener with correct signature
      this.graphService.addChangeListener((changes: { added: ElementDefinition[]; modified: ElementDefinition[]; removed: ElementDefinition[] }) => {
        this.handleGraphServiceChanges(changes);
      });
      
      // Start periodic Kuzu change detection
      this.startKuzuChangeDetection();
      
      this.isInitialized = true;
      console.log('KuzuSyncService: Bidirectional sync initialized successfully');
      
    } catch (error) {
      console.error('KuzuSyncService: Failed to initialize:', error);
      throw error;
    }
  }
  
  /**
   * Handle changes from GraphService (Cytoscape → Kuzu)
   */
  private handleGraphServiceChanges(changes: { added: ElementDefinition[]; modified: ElementDefinition[]; removed: ElementDefinition[] }): void {
    if (!this.isInitialized || this.isSyncing) return;
    
    console.log(`KuzuSyncService: Handling ${changes.added.length + changes.modified.length + changes.removed.length} GraphService changes`);
    
    // Queue operations for added elements
    for (const element of changes.added) {
      this.queueOperation({
        id: this.generateOperationId(),
        type: element.group === 'nodes' ? 'node' : 'edge',
        operation: 'CREATE',
        direction: 'cytoscape_to_kuzu',
        elementId: element.data.id,
        timestamp: Date.now(),
        status: 'pending'
      });
    }
    
    // Queue operations for modified elements
    for (const element of changes.modified) {
      this.queueOperation({
        id: this.generateOperationId(),
        type: element.group === 'nodes' ? 'node' : 'edge',
        operation: 'UPDATE',
        direction: 'cytoscape_to_kuzu',
        elementId: element.data.id,
        timestamp: Date.now(),
        status: 'pending'
      });
    }
    
    // Queue operations for removed elements
    for (const element of changes.removed) {
      this.queueOperation({
        id: this.generateOperationId(),
        type: element.group === 'nodes' ? 'node' : 'edge',
        operation: 'DELETE',
        direction: 'cytoscape_to_kuzu',
        elementId: element.data.id,
        timestamp: Date.now(),
        status: 'pending'
      });
    }
    
    // Debounced processing
    this.debouncedProcessQueue();
  }
  
  /**
   * Handle changes from Kuzu (Kuzu → Cytoscape)
   */
  private async handleKuzuChanges(changes: KuzuChange[]): Promise<void> {
    if (!this.isInitialized || this.isSyncing) return;
    
    console.log(`KuzuSyncService: Handling ${changes.length} Kuzu changes`);
    
    for (const change of changes) {
      try {
        switch (change.operation) {
          case 'CREATE':
            await this.syncKuzuCreateToCytoscape(change);
            break;
          case 'UPDATE':
            await this.syncKuzuUpdateToCytoscape(change);
            break;
          case 'DELETE':
            await this.syncKuzuDeleteToCytoscape(change);
            break;
        }
      } catch (error) {
        console.error(`KuzuSyncService: Failed to sync Kuzu change ${change.id}:`, error);
      }
    }
  }
  
  /**
   * Process the sync queue with atomic operations
   */
  private async processQueue(): Promise<void> {
    if (this.isSyncing || this.syncQueue.length === 0) return;
    
    this.isSyncing = true;
    const startTime = Date.now();
    
    try {
      // Process queue in batches
      const batch = this.syncQueue.splice(0, this.MAX_BATCH_SIZE);
      console.log(`KuzuSyncService: Processing batch of ${batch.length} operations`);
      
      for (const operation of batch) {
        await this.processOperation(operation);
      }
      
      // Update metrics
      const duration = Date.now() - startTime;
      this.updateMetrics(batch.length, duration);
      
    } catch (error) {
      console.error('KuzuSyncService: Failed to process queue:', error);
      this.metrics.isHealthy = false;
    } finally {
      this.isSyncing = false;
      
      // Process remaining queue if any
      if (this.syncQueue.length > 0) {
        setTimeout(() => this.processQueue(), 100);
      }
    }
  }
  
  /**
   * Process individual sync operation
   */
  private async processOperation(operation: SyncOperation): Promise<void> {
    this.pendingOperations.set(operation.id, operation);
    
    try {
      // Create backup
      operation.backupId = jsonSafetyManager.createBackup('kuzu_sync', operation.operation, operation);
      
      if (operation.direction === 'cytoscape_to_kuzu') {
        await this.syncCytoscapeToKuzu(operation);
      } else {
        await this.syncKuzuCreateToCytoscape(operation as any); // Simplified for now
      }
      
      operation.status = 'success';
      this.metrics.successfulSyncs++;
      
    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      this.metrics.failedSyncs++;
      
      console.error(`KuzuSyncService: Operation ${operation.id} failed:`, error);
      
      // Attempt rollback
      if (operation.backupId) {
        jsonSafetyManager.restoreFromBackup(operation.backupId);
      }
    } finally {
      this.pendingOperations.delete(operation.id);
      this.metrics.totalOperations++;
    }
  }
  
  /**
   * Sync Cytoscape element to Kuzu
   */
  private async syncCytoscapeToKuzu(operation: SyncOperation): Promise<void> {
    const element = this.graphService.getElement(operation.elementId);
    if (!element && operation.operation !== 'DELETE') {
      throw new Error(`Element ${operation.elementId} not found in GraphService`);
    }
    
    const atomicResult = await atomicJSONManager.atomicSerialize('kuzu_sync_operation', {
      operation,
      element,
      timestamp: Date.now()
    });
    
    if (!atomicResult.success) {
      throw new Error(`Atomic operation failed: ${atomicResult.error}`);
    }
    
    switch (operation.operation) {
      case 'CREATE':
      case 'UPDATE':
        if (element) {
          if (operation.type === 'node') {
            await this.syncNodeToKuzu(element);
          } else {
            await this.syncEdgeToKuzu(element);
          }
        }
        break;
        
      case 'DELETE':
        await this.deleteFromKuzu(operation.elementId, operation.type);
        break;
    }
  }
  
  /**
   * Sync node to Kuzu
   */
  private async syncNodeToKuzu(element: ElementDefinition): Promise<void> {
    const nodeData = KuzuDataTransformer.cytoscapeToKuzuNode(element);
    if (!nodeData) {
      throw new Error('Failed to transform Cytoscape node to Kuzu format');
    }
    
    const { query, params } = KuzuDataTransformer.buildNodeUpsertQuery(nodeData);
    await this.kuzuStore.query(query, params);
    
    console.log(`KuzuSyncService: Synced node ${element.data.id} to Kuzu`);
  }
  
  /**
   * Sync edge to Kuzu
   */
  private async syncEdgeToKuzu(element: ElementDefinition): Promise<void> {
    if (!element.data.source || !element.data.target) {
      throw new Error('Edge missing source or target');
    }
    
    const relType = KuzuDataTransformer.extractRelationType(element);
    const relData = KuzuDataTransformer.cytoscapeToKuzuRel(element);
    
    const { query, params } = KuzuDataTransformer.buildRelationshipUpsertQuery(
      element.data.source,
      element.data.target,
      relType,
      relData || undefined
    );
    
    await this.kuzuStore.query(query, params);
    
    console.log(`KuzuSyncService: Synced edge ${element.data.id} to Kuzu`);
  }
  
  /**
   * Delete from Kuzu
   */
  private async deleteFromKuzu(elementId: string, type: 'node' | 'edge'): Promise<void> {
    if (type === 'node') {
      await this.kuzuStore.query('MATCH (n {id: $id}) DETACH DELETE n', { id: elementId });
    } else {
      // For edges, we need to find by source, target, and type
      // This is more complex and might need additional metadata
      console.warn(`KuzuSyncService: Edge deletion from Kuzu not fully implemented for ${elementId}`);
    }
  }
  
  /**
   * Sync Kuzu changes to Cytoscape
   */
  private async syncKuzuCreateToCytoscape(change: KuzuChange): Promise<void> {
    if (change.type === 'node' && change.data) {
      const element = KuzuDataTransformer.kuzuNodeToCytoscape(change.data as AllKuzuNodes);
      this.graphService.importElement(element);
    } else if (change.type === 'relationship' && change.sourceId && change.targetId && change.relationType) {
      const element = KuzuDataTransformer.kuzuRelToCytoscape(
        change.sourceId,
        change.targetId,
        change.relationType,
        change.data as AllKuzuRels
      );
      this.graphService.importElement(element);
    }
  }
  
  private async syncKuzuUpdateToCytoscape(change: KuzuChange): Promise<void> {
    // Similar to create but check for conflicts first
    const existingElement = this.graphService.getElement(change.id);
    if (existingElement && change.data) {
      const conflict = KuzuConflictResolver.detectPotentialConflict(existingElement, change.data);
      if (conflict) {
        const resolution = KuzuConflictResolver.resolveConflict(conflict);
        if (!resolution.requiresManualIntervention) {
          // Apply resolution
          if (resolution.strategy === 'kuzu_wins') {
            await this.syncKuzuCreateToCytoscape(change);
          }
        }
      } else {
        await this.syncKuzuCreateToCytoscape(change);
      }
    }
  }
  
  private async syncKuzuDeleteToCytoscape(change: KuzuChange): Promise<void> {
    this.graphService.removeElement(change.id);
  }
  
  private queueOperation(operation: SyncOperation): void {
    this.syncQueue.push(operation);
  }
  
  private debouncedProcessQueue(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      this.processQueue();
    }, this.DEBOUNCE_DELAY);
  }
  
  private startKuzuChangeDetection(): void {
    const detectChanges = async () => {
      try {
        const changes = await this.changeDetector.detectChanges();
        if (changes.length > 0) {
          await this.handleKuzuChanges(changes);
        }
      } catch (error) {
        console.error('KuzuSyncService: Change detection failed:', error);
      }
      
      // Schedule next detection
      setTimeout(detectChanges, 2000); // Check every 2 seconds
    };
    
    // Start change detection
    setTimeout(detectChanges, 1000);
  }
  
  private generateOperationId(): string {
    return `sync-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }
  
  private updateMetrics(operationCount: number, duration: number): void {
    this.metrics.lastSyncTime = Date.now();
    
    // Update average sync duration
    const totalOps = this.metrics.totalOperations + operationCount;
    this.metrics.avgSyncDuration = (
      (this.metrics.avgSyncDuration * this.metrics.totalOperations + duration) / totalOps
    );
    
    // Update health status
    const successRate = this.metrics.successfulSyncs / Math.max(this.metrics.totalOperations, 1);
    this.metrics.isHealthy = successRate > 0.95; // 95% success rate threshold
  }
  
  /**
   * Get sync diagnostics
   */
  getDiagnostics() {
    return {
      metrics: { ...this.metrics },
      isInitialized: this.isInitialized,
      isSyncing: this.isSyncing,
      queueLength: this.syncQueue.length,
      pendingOperations: this.pendingOperations.size,
      changeDetector: this.changeDetector.getDiagnostics()
    };
  }
  
  /**
   * Force sync reset (use with caution)
   */
  async forceReset(): Promise<void> {
    console.warn('KuzuSyncService: Force reset triggered');
    
    this.isSyncing = false;
    this.syncQueue.length = 0;
    this.pendingOperations.clear();
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    await this.changeDetector.reset();
    
    console.log('KuzuSyncService: Reset completed');
  }
}
