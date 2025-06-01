
import { ElementDefinition } from 'cytoscape';
import { AllKuzuNodes, AllKuzuRels } from '@/lib/kuzu/types';
import { jsonSafetyManager } from '@/json-manager/SafetyManager';

export interface ConflictResolution {
  strategy: 'kuzu_wins' | 'cytoscape_wins' | 'merge' | 'manual';
  resolvedData?: AllKuzuNodes | ElementDefinition;
  requiresManualIntervention: boolean;
  conflictDetails: string;
}

export interface SyncConflict {
  id: string;
  type: 'node' | 'relationship';
  cytoscapeData: ElementDefinition;
  kuzuData: AllKuzuNodes | AllKuzuRels;
  cytoscapeTimestamp?: number;
  kuzuTimestamp?: number;
  conflictReason: 'timestamp_mismatch' | 'data_divergence' | 'type_mismatch';
}

/**
 * Handles conflicts during bidirectional sync between Cytoscape and Kuzu
 */
export class KuzuConflictResolver {
  
  /**
   * Resolve a sync conflict using configured strategy
   */
  static resolveConflict(
    conflict: SyncConflict,
    strategy: 'last_write_wins' | 'kuzu_priority' | 'cytoscape_priority' | 'merge' = 'last_write_wins'
  ): ConflictResolution {
    
    console.log(`KuzuConflictResolver: Resolving ${conflict.type} conflict for ${conflict.id} using ${strategy}`);
    
    // Create backup before resolution
    const backupId = jsonSafetyManager.createBackup('conflict_resolution', 'resolve', {
      conflict,
      strategy,
      timestamp: Date.now()
    });
    
    try {
      switch (strategy) {
        case 'last_write_wins':
          return this.resolveByTimestamp(conflict);
        
        case 'kuzu_priority':
          return {
            strategy: 'kuzu_wins',
            resolvedData: conflict.kuzuData,
            requiresManualIntervention: false,
            conflictDetails: 'Kuzu data takes priority by configuration'
          };
        
        case 'cytoscape_priority':
          return {
            strategy: 'cytoscape_wins',
            resolvedData: conflict.cytoscapeData,
            requiresManualIntervention: false,
            conflictDetails: 'Cytoscape data takes priority by configuration'
          };
        
        case 'merge':
          return this.attemptMerge(conflict);
        
        default:
          return this.createManualResolution(conflict);
      }
    } catch (error) {
      console.error(`KuzuConflictResolver: Failed to resolve conflict ${conflict.id}:`, error);
      return this.createManualResolution(conflict, `Resolution failed: ${error}`);
    }
  }
  
  /**
   * Detect potential conflicts before they occur
   */
  static detectPotentialConflict(
    cytoscapeElement: ElementDefinition,
    kuzuData: AllKuzuNodes | AllKuzuRels
  ): SyncConflict | null {
    
    if (!cytoscapeElement.data?.id || !('id' in kuzuData)) {
      return null;
    }
    
    // Check for timestamp mismatches
    const cytoscapeTimestamp = this.extractTimestamp(cytoscapeElement);
    const kuzuTimestamp = this.extractKuzuTimestamp(kuzuData);
    
    if (cytoscapeTimestamp && kuzuTimestamp && Math.abs(cytoscapeTimestamp - kuzuTimestamp) > 1000) {
      return {
        id: cytoscapeElement.data.id,
        type: cytoscapeElement.group === 'nodes' ? 'node' : 'relationship',
        cytoscapeData: cytoscapeElement,
        kuzuData,
        cytoscapeTimestamp,
        kuzuTimestamp,
        conflictReason: 'timestamp_mismatch'
      };
    }
    
    // Check for data divergence
    if (this.hasDataDivergence(cytoscapeElement, kuzuData)) {
      return {
        id: cytoscapeElement.data.id,
        type: cytoscapeElement.group === 'nodes' ? 'node' : 'relationship',
        cytoscapeData: cytoscapeElement,
        kuzuData,
        cytoscapeTimestamp,
        kuzuTimestamp,
        conflictReason: 'data_divergence'
      };
    }
    
    return null;
  }
  
  private static resolveByTimestamp(conflict: SyncConflict): ConflictResolution {
    const cytoscapeTime = conflict.cytoscapeTimestamp || 0;
    const kuzuTime = conflict.kuzuTimestamp || 0;
    
    if (kuzuTime > cytoscapeTime) {
      return {
        strategy: 'kuzu_wins',
        resolvedData: conflict.kuzuData,
        requiresManualIntervention: false,
        conflictDetails: `Kuzu data is newer (${new Date(kuzuTime).toISOString()} > ${new Date(cytoscapeTime).toISOString()})`
      };
    } else if (cytoscapeTime > kuzuTime) {
      return {
        strategy: 'cytoscape_wins',
        resolvedData: conflict.cytoscapeData,
        requiresManualIntervention: false,
        conflictDetails: `Cytoscape data is newer (${new Date(cytoscapeTime).toISOString()} > ${new Date(kuzuTime).toISOString()})`
      };
    } else {
      // Timestamps are equal or missing, attempt merge
      return this.attemptMerge(conflict);
    }
  }
  
  private static attemptMerge(conflict: SyncConflict): ConflictResolution {
    if (conflict.type === 'node') {
      try {
        const mergedData = this.mergeNodeData(conflict.cytoscapeData, conflict.kuzuData as AllKuzuNodes);
        return {
          strategy: 'merge',
          resolvedData: mergedData,
          requiresManualIntervention: false,
          conflictDetails: 'Successfully merged data from both sources'
        };
      } catch (error) {
        return this.createManualResolution(conflict, `Merge failed: ${error}`);
      }
    }
    
    // For relationships, merging is more complex, so default to manual resolution
    return this.createManualResolution(conflict, 'Relationship conflicts require manual resolution');
  }
  
  private static mergeNodeData(cytoscapeElement: ElementDefinition, kuzuNode: AllKuzuNodes): AllKuzuNodes {
    const cytoscapeData = cytoscapeElement.data;
    
    // Start with Kuzu data as base
    const merged = { ...kuzuNode };
    
    // Merge non-conflicting properties from Cytoscape
    if (cytoscapeData.title && !merged.title) {
      (merged as any).title = cytoscapeData.title;
    }
    
    if (cytoscapeData.label && 'label' in merged && !merged.label) {
      (merged as any).label = cytoscapeData.label;
    }
    
    if (cytoscapeData.content && 'content' in merged && !merged.content) {
      (merged as any).content = cytoscapeData.content;
    }
    
    // Always use the latest timestamp
    const cytoscapeTime = this.extractTimestamp(cytoscapeElement);
    const kuzuTime = this.extractKuzuTimestamp(kuzuNode);
    
    if (cytoscapeTime && kuzuTime) {
      (merged as any).updatedAt = new Date(Math.max(cytoscapeTime, kuzuTime)).toISOString();
    } else if (cytoscapeTime) {
      (merged as any).updatedAt = new Date(cytoscapeTime).toISOString();
    } else if (kuzuTime) {
      (merged as any).updatedAt = new Date(kuzuTime).toISOString();
    } else {
      (merged as any).updatedAt = new Date().toISOString();
    }
    
    return merged;
  }
  
  private static createManualResolution(conflict: SyncConflict, details?: string): ConflictResolution {
    return {
      strategy: 'manual',
      requiresManualIntervention: true,
      conflictDetails: details || `Manual resolution required for ${conflict.conflictReason} in ${conflict.type} ${conflict.id}`
    };
  }
  
  private static extractTimestamp(element: ElementDefinition): number | null {
    const data = element.data;
    
    // Try various timestamp fields
    if (data.updatedAt) {
      return new Date(data.updatedAt).getTime();
    }
    if (data.timestamp) {
      return typeof data.timestamp === 'number' ? data.timestamp : new Date(data.timestamp).getTime();
    }
    if (data.lastModified) {
      return new Date(data.lastModified).getTime();
    }
    
    return null;
  }
  
  private static extractKuzuTimestamp(kuzuData: AllKuzuNodes | AllKuzuRels): number | null {
    if ('updatedAt' in kuzuData && kuzuData.updatedAt) {
      return new Date(kuzuData.updatedAt).getTime();
    }
    if ('createdAt' in kuzuData && kuzuData.createdAt) {
      return new Date(kuzuData.createdAt).getTime();
    }
    
    return null;
  }
  
  private static hasDataDivergence(cytoscapeElement: ElementDefinition, kuzuData: AllKuzuNodes | AllKuzuRels): boolean {
    const cytoscapeData = cytoscapeElement.data;
    
    // Compare key fields that should match
    if (cytoscapeData.title && 'title' in kuzuData && kuzuData.title !== cytoscapeData.title) {
      return true;
    }
    
    if (cytoscapeData.label && 'label' in kuzuData && kuzuData.label !== cytoscapeData.label) {
      return true;
    }
    
    if (cytoscapeData.content && 'content' in kuzuData && kuzuData.content !== cytoscapeData.content) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Get conflict resolution statistics
   */
  static getResolutionStats() {
    // This could be enhanced to track resolution statistics
    return {
      totalConflicts: 0,
      autoResolved: 0,
      manualResolutions: 0,
      lastConflict: null
    };
  }
}
