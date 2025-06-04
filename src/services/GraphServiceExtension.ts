
import { EntityWithReferences } from '@/livestore/queries/entities';
import { GraphService } from './GraphService';
import { generateEntityId } from '@/lib/utils/ids';
import { Entity } from '@/lib/utils/parsingUtils';
import { NodeType, EdgeType } from './types';
import { schema } from '@/lib/schema';

/**
 * Extension methods for GraphService to support entity browser functionality
 * Updated to use LiveStore queries instead of Cytoscape scanning
 */
export function extendGraphService(service: GraphService): void {
  // Register new cross-note relation types in the schema
  schema.registerNode('GLOBAL_TRIPLE', {
    kind: 'GLOBAL_TRIPLE',
    labelProp: 'predicate',
    defaultStyle: { shape: 'diamond', 'background-color': '#9B59B6', width: 20, height: 20 }
  });
  
  schema.registerEdge('CO_OCCURS', {
    from: '*',
    to: '*',
    directed: false,
    defaultStyle: { 'line-style': 'dashed', 'line-color': '#95A5A6', 'width': 2 }
  });
  
  schema.registerEdge('GLOBAL_TRIPLE_MEMBER', {
    from: '*',
    to: 'GLOBAL_TRIPLE',
    directed: true,
    defaultStyle: { 'line-color': '#9B59B6', 'width': 2 }
  });

  // Note: This method is now deprecated in favor of LiveStore queries
  // It's kept for backwards compatibility but should be replaced with useAllEntitiesArray()
  service.getAllEntities = function(): EntityWithReferences[] {
    console.warn('[GraphServiceExtension] getAllEntities() is deprecated. Use LiveStore queries instead.');
    
    const entities: EntityWithReferences[] = [];
    const entityNodes = this.getGraph().nodes(`[type = "${NodeType.ENTITY}"]`);
    
    entityNodes.forEach(node => {
      const kind = node.data('kind');
      const label = node.data('label');
      
      if (kind && label) {
        // Count references (nodes that mention this entity)
        const references = node.connectedEdges(`[type = "${EdgeType.CONTAINS_ENTITY}"]`).length;
        
        entities.push({
          kind,
          label,
          id: generateEntityId(kind, label),
          referenceCount: references,
          referencingNotes: [],
          lastModified: node.data('lastModified') || new Date().toISOString(),
          createdAt: node.data('createdAt') || new Date().toISOString(),
          relationships: {
            asSubject: [],
            asObject: []
          }
        });
      }
    });
    
    return entities;
  };
  
  // Create entity using canonical ID generation
  service.createEntity = function(entity: Entity): boolean {
    const { kind, label } = entity;
    const entityId = generateEntityId(kind, label);
    
    // Check if entity already exists
    if (this.getGraph().getElementById(entityId).nonempty()) {
      return false;
    }
    
    // Add entity node with proper type
    this.getGraph().add({
      group: 'nodes',
      data: {
        id: entityId,
        type: NodeType.ENTITY,
        kind,
        label,
        createdAt: new Date().toISOString(),
        attributes: entity.attributes || {}
      }
    });
    
    return true;
  };
  
  // Get entity references - simplified to use direct edge queries
  service.getEntityReferences = function(kind: string, label: string): {id: string, title: string}[] {
    const entityId = generateEntityId(kind, label);
    const entityNode = this.getGraph().getElementById(entityId);
    
    if (entityNode.empty()) {
      return [];
    }
    
    const references: {id: string, title: string}[] = [];
    
    // Get all nodes where this entity is mentioned using CONTAINS_ENTITY edge
    const mentionEdges = entityNode.connectedEdges(`[type = "${EdgeType.CONTAINS_ENTITY}"]`);
    
    mentionEdges.forEach(edge => {
      const sourceNode = edge.source();
      if (sourceNode.data('type') === NodeType.NOTE) {
        references.push({
          id: sourceNode.id(),
          title: sourceNode.data('title') || 'Untitled Note'
        });
      }
    });
    
    return references;
  };
  
  // Get entity relationships using canonical IDs
  service.getEntityRelationships = function(kind: string, label: string): any[] {
    const entityId = generateEntityId(kind, label);
    const entityNode = this.getGraph().getElementById(entityId);
    
    if (entityNode.empty()) {
      return [];
    }
    
    const relationships: any[] = [];
    
    // Get all semantic relation edges where this entity is subject
    const outgoingEdges = entityNode.connectedEdges(`[type = "${EdgeType.SEMANTIC_RELATION}"]`).filter(edge => 
      edge.source().id() === entityId
    );
    
    outgoingEdges.forEach(edge => {
      const targetNode = edge.target();
      const predicate = edge.data('predicate');
      
      relationships.push({
        predicate,
        direction: 'outgoing',
        target: {
          kind: targetNode.data('kind'),
          label: targetNode.data('label')
        }
      });
    });
    
    // Get all semantic relation edges where this entity is object
    const incomingEdges = entityNode.connectedEdges(`[type = "${EdgeType.SEMANTIC_RELATION}"]`).filter(edge => 
      edge.target().id() === entityId
    );
    
    incomingEdges.forEach(edge => {
      const sourceNode = edge.source();
      const predicate = edge.data('predicate');
      
      relationships.push({
        predicate,
        direction: 'incoming',
        target: {
          kind: sourceNode.data('kind'),
          label: sourceNode.data('label')
        }
      });
    });
    
    return relationships;
  };
}
