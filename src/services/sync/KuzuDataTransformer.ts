
import { ElementDefinition } from 'cytoscape';
import { 
  AllKuzuNodes, 
  AllKuzuRels, 
  KuzuNote, 
  KuzuEntity, 
  KuzuCluster 
} from '@/lib/kuzu/types';

/**
 * Streamlined data transformation utilities for bidirectional sync between Cytoscape and Kuzu
 */
export class KuzuDataTransformer {
  
  /**
   * Transform Cytoscape ElementDefinition to Kuzu node data
   */
  static cytoscapeToKuzuNode(element: ElementDefinition): AllKuzuNodes | null {
    if (element.group !== 'nodes') return null;
    
    const data = element.data;
    const id = data.id as string;
    
    // Determine node type and create appropriate structure
    if (data.type === 'note' || data.title) {
      return {
        id,
        title: data.title || data.label,
        content: data.content || '',
        type: data.noteType || 'note',
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        path: data.path || '',
        clusterId: data.clusterId,
        parentId: data.parentId
      } as KuzuNote;
    }
    
    if (data.type === 'entity' || data.kind) {
      return {
        id,
        kind: data.kind || 'unknown',
        label: data.label || data.title,
        attributes: JSON.stringify(data.attributes || {}),
        embedding: data.embedding
      } as KuzuEntity;
    }
    
    if (data.type === 'cluster') {
      return {
        id,
        title: data.title || data.label,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as KuzuCluster;
    }
    
    // Default to Note type
    return {
      id,
      title: data.label || data.title || id,
      content: JSON.stringify(data),
      type: 'note',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as KuzuNote;
  }
  
  /**
   * Transform Kuzu node data to Cytoscape ElementDefinition
   */
  static kuzuNodeToCytoscape(kuzuNode: AllKuzuNodes): ElementDefinition {
    const baseElement: ElementDefinition = {
      group: 'nodes',
      data: { id: kuzuNode.id }
    };
    
    // Handle different node types
    if ('title' in kuzuNode && 'content' in kuzuNode) {
      const note = kuzuNode as KuzuNote;
      baseElement.data = {
        ...baseElement.data,
        label: note.title || note.id,
        title: note.title,
        content: note.content,
        type: 'note',
        noteType: note.type,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        path: note.path,
        clusterId: note.clusterId,
        parentId: note.parentId
      };
    } else if ('kind' in kuzuNode && 'label' in kuzuNode) {
      const entity = kuzuNode as KuzuEntity;
      baseElement.data = {
        ...baseElement.data,
        label: entity.label || entity.id,
        kind: entity.kind,
        type: 'entity',
        attributes: entity.attributes ? JSON.parse(entity.attributes) : {},
        embedding: entity.embedding
      };
    } else if ('title' in kuzuNode && !('content' in kuzuNode)) {
      const cluster = kuzuNode as KuzuCluster;
      baseElement.data = {
        ...baseElement.data,
        label: cluster.title || cluster.id,
        title: cluster.title,
        type: 'cluster',
        createdAt: cluster.createdAt,
        updatedAt: cluster.updatedAt
      };
    }
    
    return baseElement;
  }
  
  /**
   * Transform Kuzu relationship to Cytoscape edge
   */
  static kuzuRelToCytoscape(
    sourceId: string, 
    targetId: string, 
    relType: string, 
    relData?: AllKuzuRels
  ): ElementDefinition {
    return {
      group: 'edges',
      data: {
        id: `${sourceId}-${relType}-${targetId}`,
        source: sourceId,
        target: targetId,
        label: relType,
        type: relType.toLowerCase(),
        ...relData
      }
    };
  }
  
  /**
   * Extract relationship type from Cytoscape edge
   */
  static extractRelationType(element: ElementDefinition): string {
    if (element.group !== 'edges') return 'LINKS_TO';
    
    const data = element.data;
    
    // Map common edge types to Kuzu relationship types
    const typeMap: Record<string, string> = {
      'contains': 'CONTAINS',
      'mentions': 'MENTIONS', 
      'links_to': 'LINKS_TO',
      'has_tag': 'HAS_TAG',
      'in_cluster': 'IN_CLUSTER',
      'mentioned_in': 'MENTIONED_IN',
      'co_occurs': 'CO_OCCURS'
    };
    
    return typeMap[data.type] || typeMap[data.label?.toLowerCase()] || 'LINKS_TO';
  }
  
  /**
   * Build KuzuQL query for node creation/update
   */
  static buildNodeUpsertQuery(nodeData: AllKuzuNodes): { query: string; params: Record<string, any> } {
    const nodeType = this.inferKuzuNodeType(nodeData);
    const params: Record<string, any> = { id: nodeData.id };
    
    // Build SET clauses based on node type
    const setClauses: string[] = [];
    
    if ('title' in nodeData && nodeData.title) {
      setClauses.push('n.title = $title');
      params.title = nodeData.title;
    }
    
    if ('content' in nodeData && nodeData.content) {
      setClauses.push('n.content = $content');
      params.content = nodeData.content;
    }
    
    if ('kind' in nodeData && nodeData.kind) {
      setClauses.push('n.kind = $kind');
      params.kind = nodeData.kind;
    }
    
    if ('label' in nodeData && nodeData.label) {
      setClauses.push('n.label = $label');
      params.label = nodeData.label;
    }
    
    if ('attributes' in nodeData && nodeData.attributes) {
      setClauses.push('n.attributes = $attributes');
      params.attributes = nodeData.attributes;
    }
    
    // Always update timestamp
    setClauses.push('n.updatedAt = $updatedAt');
    params.updatedAt = new Date().toISOString();
    
    const query = `
      MERGE (n:${nodeType} {id: $id})
      SET ${setClauses.join(', ')}
      RETURN n
    `;
    
    return { query, params };
  }
  
  /**
   * Build KuzuQL query for relationship creation
   */
  static buildRelationshipUpsertQuery(
    sourceId: string, 
    targetId: string, 
    relType: string, 
    relData?: AllKuzuRels
  ): { query: string; params: Record<string, any> } {
    const params = {
      sourceId,
      targetId,
      createdAt: new Date().toISOString()
    };
    
    // Add relationship-specific properties
    if (relData && 'count' in relData) {
      Object.assign(params, { count: relData.count });
    }
    if (relData && 'notes' in relData) {
      Object.assign(params, { notes: relData.notes });
    }
    
    const query = `
      MATCH (source {id: $sourceId})
      MATCH (target {id: $targetId})
      MERGE (source)-[r:${relType}]->(target)
      SET r.createdAt = $createdAt
      ${Object.keys(params).filter(k => !['sourceId', 'targetId', 'createdAt'].includes(k))
        .map(k => `, r.${k} = $${k}`).join('')}
      RETURN r
    `;
    
    return { query, params };
  }
  
  private static inferKuzuNodeType(nodeData: AllKuzuNodes): string {
    if ('content' in nodeData) return 'Note';
    if ('kind' in nodeData) return 'Entity';
    if ('title' in nodeData && !('content' in nodeData)) return 'Cluster';
    if ('predicate' in nodeData) return 'GlobalTriple';
    if ('role' in nodeData) return 'ThreadMessage';
    return 'Note'; // Default
  }
}
