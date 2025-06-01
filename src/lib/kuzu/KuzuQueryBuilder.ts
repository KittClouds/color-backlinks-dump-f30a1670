
import { 
  KuzuNote, 
  KuzuEntity, 
  KuzuCluster, 
  AllKuzuNodes,
  KuzuQueryResult 
} from './types';

/**
 * KuzuQueryBuilder - Type-safe KuzuQL query construction
 * Provides fluent API for building queries with parameter safety
 */
export class KuzuQueryBuilder {
  private query = '';
  private parameters: Record<string, any> = {};
  private paramCounter = 0;

  /**
   * Start a new query
   */
  static create(): KuzuQueryBuilder {
    return new KuzuQueryBuilder();
  }

  /**
   * MATCH clause for nodes
   */
  matchNode(
    nodeType: string, 
    alias = 'n', 
    conditions: Record<string, any> = {}
  ): KuzuQueryBuilder {
    const conditionParts: string[] = [];
    
    Object.entries(conditions).forEach(([key, value]) => {
      const paramName = this.addParameter(value);
      conditionParts.push(`${alias}.${key} = $${paramName}`);
    });
    
    const conditionStr = conditionParts.length > 0 
      ? ` {${conditionParts.join(', ')}}` 
      : '';
    
    this.query += `MATCH (${alias}:${nodeType}${conditionStr})\n`;
    return this;
  }

  /**
   * MATCH clause for relationships
   */
  matchRelationship(
    sourceAlias: string,
    relType: string,
    targetAlias: string,
    relAlias = 'r',
    conditions: Record<string, any> = {}
  ): KuzuQueryBuilder {
    const conditionParts: string[] = [];
    
    Object.entries(conditions).forEach(([key, value]) => {
      const paramName = this.addParameter(value);
      conditionParts.push(`${relAlias}.${key} = $${paramName}`);
    });
    
    const conditionStr = conditionParts.length > 0 
      ? ` {${conditionParts.join(', ')}}` 
      : '';
    
    this.query += `MATCH (${sourceAlias})-[${relAlias}:${relType}${conditionStr}]->(${targetAlias})\n`;
    return this;
  }

  /**
   * WHERE clause
   */
  where(condition: string, params: Record<string, any> = {}): KuzuQueryBuilder {
    Object.entries(params).forEach(([key, value]) => {
      this.addParameter(value, key);
    });
    
    this.query += `WHERE ${condition}\n`;
    return this;
  }

  /**
   * CREATE node
   */
  createNode(
    nodeType: string, 
    alias = 'n', 
    properties: Record<string, any> = {}
  ): KuzuQueryBuilder {
    const propParts: string[] = [];
    
    Object.entries(properties).forEach(([key, value]) => {
      const paramName = this.addParameter(value);
      propParts.push(`${key}: $${paramName}`);
    });
    
    const propStr = propParts.length > 0 ? ` {${propParts.join(', ')}}` : '';
    
    this.query += `CREATE (${alias}:${nodeType}${propStr})\n`;
    return this;
  }

  /**
   * MERGE node (upsert)
   */
  mergeNode(
    nodeType: string, 
    alias = 'n', 
    matchProps: Record<string, any> = {},
    setProps: Record<string, any> = {}
  ): KuzuQueryBuilder {
    const matchParts: string[] = [];
    
    Object.entries(matchProps).forEach(([key, value]) => {
      const paramName = this.addParameter(value);
      matchParts.push(`${key}: $${paramName}`);
    });
    
    const matchStr = matchParts.length > 0 ? ` {${matchParts.join(', ')}}` : '';
    
    this.query += `MERGE (${alias}:${nodeType}${matchStr})\n`;
    
    if (Object.keys(setProps).length > 0) {
      const setParts: string[] = [];
      Object.entries(setProps).forEach(([key, value]) => {
        const paramName = this.addParameter(value);
        setParts.push(`${alias}.${key} = $${paramName}`);
      });
      
      this.query += `SET ${setParts.join(', ')}\n`;
    }
    
    return this;
  }

  /**
   * CREATE relationship
   */
  createRelationship(
    sourceAlias: string,
    relType: string,
    targetAlias: string,
    relAlias = 'r',
    properties: Record<string, any> = {}
  ): KuzuQueryBuilder {
    const propParts: string[] = [];
    
    Object.entries(properties).forEach(([key, value]) => {
      const paramName = this.addParameter(value);
      propParts.push(`${key}: $${paramName}`);
    });
    
    const propStr = propParts.length > 0 ? ` {${propParts.join(', ')}}` : '';
    
    this.query += `CREATE (${sourceAlias})-[${relAlias}:${relType}${propStr}]->(${targetAlias})\n`;
    return this;
  }

  /**
   * RETURN clause
   */
  return(expressions: string[]): KuzuQueryBuilder {
    this.query += `RETURN ${expressions.join(', ')}\n`;
    return this;
  }

  /**
   * ORDER BY clause
   */
  orderBy(expression: string, direction: 'ASC' | 'DESC' = 'ASC'): KuzuQueryBuilder {
    this.query += `ORDER BY ${expression} ${direction}\n`;
    return this;
  }

  /**
   * LIMIT clause
   */
  limit(count: number): KuzuQueryBuilder {
    const paramName = this.addParameter(count);
    this.query += `LIMIT $${paramName}\n`;
    return this;
  }

  /**
   * Build the final query and parameters
   */
  build(): { query: string; parameters: Record<string, any> } {
    return {
      query: this.query.trim(),
      parameters: this.parameters
    };
  }

  /**
   * Helper: Add parameter and return its name
   */
  private addParameter(value: any, customName?: string): string {
    const paramName = customName || `param${this.paramCounter++}`;
    this.parameters[paramName] = value;
    return paramName;
  }

  // Convenience methods for common operations

  /**
   * Find note by ID
   */
  static findNoteById(id: string): KuzuQueryBuilder {
    return KuzuQueryBuilder.create()
      .matchNode('Note', 'n', { id })
      .return(['n']);
  }

  /**
   * Find entities by kind
   */
  static findEntitiesByKind(kind: string): KuzuQueryBuilder {
    return KuzuQueryBuilder.create()
      .matchNode('Entity', 'e', { kind })
      .return(['e'])
      .orderBy('e.label', 'ASC');
  }

  /**
   * Find co-occurring entities
   */
  static findCoOccurringEntities(entityId: string, limit = 10): KuzuQueryBuilder {
    return KuzuQueryBuilder.create()
      .matchNode('Entity', 'e1', { id: entityId })
      .matchRelationship('e1', 'CO_OCCURS', 'e2', 'r')
      .return(['e2.label', 'e2.kind', 'r.count'])
      .orderBy('r.count', 'DESC')
      .limit(limit);
  }

  /**
   * Find notes containing entity
   */
  static findNotesWithEntity(entityId: string): KuzuQueryBuilder {
    return KuzuQueryBuilder.create()
      .matchNode('Entity', 'e', { id: entityId })
      .matchRelationship('e', 'MENTIONED_IN', 'n', 'r')
      .return(['n.id', 'n.title', 'n.updatedAt'])
      .orderBy('n.updatedAt', 'DESC');
  }

  /**
   * Create note with cluster relationship
   */
  static createNoteInCluster(
    noteData: Partial<KuzuNote>, 
    clusterId?: string
  ): KuzuQueryBuilder {
    const builder = KuzuQueryBuilder.create()
      .createNode('Note', 'n', noteData);
    
    if (clusterId) {
      builder
        .matchNode('Cluster', 'c', { id: clusterId })
        .createRelationship('n', 'IN_CLUSTER', 'c');
    }
    
    return builder.return(['n']);
  }

  /**
   * Update entity attributes
   */
  static updateEntityAttributes(
    entityId: string, 
    newAttributes: Record<string, any>
  ): KuzuQueryBuilder {
    return KuzuQueryBuilder.create()
      .mergeNode('Entity', 'e', { id: entityId }, {
        attributes: JSON.stringify(newAttributes),
        updatedAt: new Date().toISOString()
      })
      .return(['e']);
  }
}

// Export convenience functions
export const KuzuQuery = {
  findNoteById: KuzuQueryBuilder.findNoteById,
  findEntitiesByKind: KuzuQueryBuilder.findEntitiesByKind,
  findCoOccurringEntities: KuzuQueryBuilder.findCoOccurringEntities,
  findNotesWithEntity: KuzuQueryBuilder.findNotesWithEntity,
  createNoteInCluster: KuzuQueryBuilder.createNoteInCluster,
  updateEntityAttributes: KuzuQueryBuilder.updateEntityAttributes,
  create: KuzuQueryBuilder.create
};
