
import { KuzuGraphStore } from '@/lib/kuzu/KuzuGraphStore';
import { AllKuzuNodes, AllKuzuRels } from '@/lib/kuzu/types';

export interface KuzuChange {
  id: string;
  type: 'node' | 'relationship';
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  data?: AllKuzuNodes | AllKuzuRels;
  sourceId?: string;
  targetId?: string;
  relationType?: string;
  timestamp: number;
}

export interface ChangeDetectionState {
  lastCheck: number;
  knownNodeIds: Set<string>;
  knownRelationships: Set<string>;
  nodeChecksums: Map<string, string>;
}

/**
 * Detects changes in Kuzu database for bidirectional sync
 */
export class KuzuChangeDetector {
  private graphStore: KuzuGraphStore;
  private state: ChangeDetectionState;
  private isDetecting = false;
  
  constructor(graphStore: KuzuGraphStore) {
    this.graphStore = graphStore;
    this.state = {
      lastCheck: Date.now(),
      knownNodeIds: new Set(),
      knownRelationships: new Set(),
      nodeChecksums: new Map()
    };
  }
  
  /**
   * Initialize change detection by building current state
   */
  async initialize(): Promise<void> {
    console.log('KuzuChangeDetector: Initializing...');
    
    try {
      // Get all current nodes
      const nodesResult = await this.graphStore.query(`
        MATCH (n) 
        RETURN n.id as id, n.updatedAt as updatedAt, labels(n) as labels
      `);
      
      for (const row of nodesResult) {
        if (row.id) {
          this.state.knownNodeIds.add(row.id);
          this.state.nodeChecksums.set(row.id, this.calculateNodeChecksum(row));
        }
      }
      
      // Get all current relationships
      const relsResult = await this.graphStore.query(`
        MATCH (a)-[r]->(b) 
        RETURN a.id as sourceId, b.id as targetId, type(r) as relType
      `);
      
      for (const row of relsResult) {
        if (row.sourceId && row.targetId && row.relType) {
          const relId = `${row.sourceId}-${row.relType}-${row.targetId}`;
          this.state.knownRelationships.add(relId);
        }
      }
      
      this.state.lastCheck = Date.now();
      console.log(`KuzuChangeDetector: Initialized with ${this.state.knownNodeIds.size} nodes and ${this.state.knownRelationships.size} relationships`);
      
    } catch (error) {
      console.error('KuzuChangeDetector: Failed to initialize:', error);
      throw error;
    }
  }
  
  /**
   * Detect changes since last check
   */
  async detectChanges(): Promise<KuzuChange[]> {
    if (this.isDetecting) {
      console.log('KuzuChangeDetector: Detection already in progress, skipping');
      return [];
    }
    
    this.isDetecting = true;
    const changes: KuzuChange[] = [];
    
    try {
      // Detect node changes
      const nodeChanges = await this.detectNodeChanges();
      changes.push(...nodeChanges);
      
      // Detect relationship changes
      const relChanges = await this.detectRelationshipChanges();
      changes.push(...relChanges);
      
      this.state.lastCheck = Date.now();
      
      if (changes.length > 0) {
        console.log(`KuzuChangeDetector: Detected ${changes.length} changes`);
      }
      
      return changes;
      
    } catch (error) {
      console.error('KuzuChangeDetector: Failed to detect changes:', error);
      return [];
    } finally {
      this.isDetecting = false;
    }
  }
  
  /**
   * Reset detection state (useful after bulk operations)
   */
  async reset(): Promise<void> {
    console.log('KuzuChangeDetector: Resetting state...');
    this.state.knownNodeIds.clear();
    this.state.knownRelationships.clear();
    this.state.nodeChecksums.clear();
    await this.initialize();
  }
  
  private async detectNodeChanges(): Promise<KuzuChange[]> {
    const changes: KuzuChange[] = [];
    
    try {
      // Get current nodes with their properties
      const currentNodes = await this.graphStore.query(`
        MATCH (n) 
        RETURN n.id as id, n.updatedAt as updatedAt, labels(n) as labels, n
      `);
      
      const currentNodeIds = new Set<string>();
      
      for (const row of currentNodes) {
        if (!row.id) continue;
        
        currentNodeIds.add(row.id);
        const currentChecksum = this.calculateNodeChecksum(row);
        const previousChecksum = this.state.nodeChecksums.get(row.id);
        
        if (!this.state.knownNodeIds.has(row.id)) {
          // New node
          changes.push({
            id: row.id,
            type: 'node',
            operation: 'CREATE',
            data: row.n,
            timestamp: Date.now()
          });
          this.state.knownNodeIds.add(row.id);
        } else if (previousChecksum !== currentChecksum) {
          // Updated node
          changes.push({
            id: row.id,
            type: 'node',
            operation: 'UPDATE',
            data: row.n,
            timestamp: Date.now()
          });
        }
        
        this.state.nodeChecksums.set(row.id, currentChecksum);
      }
      
      // Detect deleted nodes
      for (const knownId of this.state.knownNodeIds) {
        if (!currentNodeIds.has(knownId)) {
          changes.push({
            id: knownId,
            type: 'node',
            operation: 'DELETE',
            timestamp: Date.now()
          });
          this.state.knownNodeIds.delete(knownId);
          this.state.nodeChecksums.delete(knownId);
        }
      }
      
    } catch (error) {
      console.error('KuzuChangeDetector: Failed to detect node changes:', error);
    }
    
    return changes;
  }
  
  private async detectRelationshipChanges(): Promise<KuzuChange[]> {
    const changes: KuzuChange[] = [];
    
    try {
      // Get current relationships
      const currentRels = await this.graphStore.query(`
        MATCH (a)-[r]->(b) 
        RETURN a.id as sourceId, b.id as targetId, type(r) as relType, r
      `);
      
      const currentRelIds = new Set<string>();
      
      for (const row of currentRels) {
        if (!row.sourceId || !row.targetId || !row.relType) continue;
        
        const relId = `${row.sourceId}-${row.relType}-${row.targetId}`;
        currentRelIds.add(relId);
        
        if (!this.state.knownRelationships.has(relId)) {
          // New relationship
          changes.push({
            id: relId,
            type: 'relationship',
            operation: 'CREATE',
            sourceId: row.sourceId,
            targetId: row.targetId,
            relationType: row.relType,
            data: row.r,
            timestamp: Date.now()
          });
          this.state.knownRelationships.add(relId);
        }
      }
      
      // Detect deleted relationships
      for (const knownRelId of this.state.knownRelationships) {
        if (!currentRelIds.has(knownRelId)) {
          const [sourceId, relType, targetId] = knownRelId.split('-');
          changes.push({
            id: knownRelId,
            type: 'relationship',
            operation: 'DELETE',
            sourceId,
            targetId,
            relationType: relType,
            timestamp: Date.now()
          });
          this.state.knownRelationships.delete(knownRelId);
        }
      }
      
    } catch (error) {
      console.error('KuzuChangeDetector: Failed to detect relationship changes:', error);
    }
    
    return changes;
  }
  
  private calculateNodeChecksum(nodeData: any): string {
    // Simple checksum based on updatedAt and key properties
    const data = JSON.stringify({
      updatedAt: nodeData.updatedAt,
      title: nodeData.title,
      content: nodeData.content,
      kind: nodeData.kind,
      label: nodeData.label
    });
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
  
  /**
   * Get detection diagnostics
   */
  getDiagnostics() {
    return {
      lastCheck: this.state.lastCheck,
      knownNodes: this.state.knownNodeIds.size,
      knownRelationships: this.state.knownRelationships.size,
      isDetecting: this.isDetecting,
      timeSinceLastCheck: Date.now() - this.state.lastCheck
    };
  }
}
