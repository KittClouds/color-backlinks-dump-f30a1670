import cytoscape, { Core, NodeSingular, EdgeSingular, NodeCollection, EdgeCollection, ElementDefinition, SingularElementArgument, Position } from 'cytoscape';
import undoRedo from 'cytoscape-undo-redo';
import automove from 'cytoscape-automove';
import { NodeType, EdgeType, GraphJSON, GraphMeta, IGraphService, Thread, ThreadMessage, Triple } from './types';
import { Note, Cluster, STANDARD_ROOT_ID } from '@/lib/store';
import { Entity } from '@/lib/utils/parsingUtils';
import { GraphDocument } from '@/lib/langchain-lite';
import { EntityWithReferences } from "@/components/entity-browser/EntityBrowser";
import { TypedAttribute } from '@/types/attributes';
import { generateEntityId } from '@/lib/utils/ids';

// Register extensions
cytoscape.use(undoRedo);
cytoscape.use(automove);

// Define CLUSTERS_ROOT_ID locally since it's not exported from store
const CLUSTERS_ROOT_ID = 'clusters-root';

export class GraphService implements IGraphService {
  private graph: Core;
  private changeListeners: Array<(elements: ElementDefinition[]) => void> = [];
  private urInstance: any;
  private batchCount: number = 0;

  constructor() {
    // Initialize the graph
    this.graph = cytoscape({
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#4287f5',
            'label': 'data(title)',
            'font-size': 12,
            'text-valign': 'center',
            'text-halign': 'center',
            'color': '#fff',
            'width': 80,
            'height': 80,
            'overlay-opacity': 0,
            'transition-property': 'overlay-opacity',
            'transition-duration': 0.2
          }
        },
        {
          selector: 'node:hover',
          style: {
            'overlay-opacity': 0.2
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#ccc',
            'target-arrow-color': '#ccc',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier'
          }
        },
        {
          selector: `node[type = "${NodeType.STANDARD_ROOT}"]`,
          style: {
            'background-color': '#eee',
            'shape': 'roundrectangle',
            'label': 'data(title)',
            'color': '#333',
            'width': 80,
            'height': 80
          }
        },
        {
          selector: `node[type = "${NodeType.CLUSTERS_ROOT}"]`,
          style: {
            'background-color': '#eee',
            'shape': 'roundrectangle',
            'label': 'data(title)',
            'color': '#333',
            'width': 80,
            'height': 80
          }
        },
        {
          selector: `node[type = "${NodeType.CLUSTER_ROOT}"]`,
          style: {
            'background-color': '#eee',
            'shape': 'roundrectangle',
            'label': 'data(title)',
            'color': '#333',
            'width': 80,
            'height': 80
          }
        },
        {
          selector: `node[type = "${NodeType.CLUSTER}"]`,
          style: {
            'background-color': '#4CAF50',
            'shape': 'ellipse',
            'label': 'data(title)',
            'color': '#fff',
            'width': 80,
            'height': 80
          }
        },
        {
          selector: `edge[type = "${EdgeType.CONTAINS}"]`,
          style: {
            'line-color': '#666',
            'target-arrow-color': '#666',
            'target-arrow-shape': 'none',
            'curve-style': 'bezier'
          }
        },
        {
          selector: `edge[type = "${EdgeType.IN_CLUSTER}"]`,
          style: {
            'line-color': '#8BC34A',
            'target-arrow-color': '#8BC34A',
            'target-arrow-shape': 'none',
            'curve-style': 'bezier'
          }
        },
        {
          selector: `node[type = "${NodeType.THREAD}"]`,
          style: {
            'background-color': '#FF9800',
            'shape': 'roundrectangle',
            'label': 'data(title)',
            'color': '#fff',
            'width': 80,
            'height': 80
          }
        },
        {
          selector: `node[type = "${NodeType.THREAD_MESSAGE}"]`,
          style: {
            'background-color': '#FFC107',
            'shape': 'roundrectangle',
            'label': 'data(content)',
            'color': '#333',
            'width': 60,
            'height': 60
          }
        },
        {
          selector: `edge[type = "${EdgeType.IN_THREAD}"]`,
          style: {
            'line-color': '#FFB74D',
            'target-arrow-color': '#FFB74D',
            'target-arrow-shape': 'none',
            'curve-style': 'bezier'
          }
        },
        {
          selector: `edge[type = "${EdgeType.REPLIES_TO}"]`,
          style: {
            'line-color': '#FFB74D',
            'target-arrow-color': '#FFB74D',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier'
          }
        },
        {
          selector: `node[type = "${NodeType.ENTITY}"]`,
          style: {
            'background-color': '#9C27B0',
            'shape': 'ellipse',
            'label': 'data(label)',
            'color': '#fff',
            'width': 60,
            'height': 60
          }
        },
        {
          selector: `node[type = "${NodeType.ENTITY}"][kind = "CHARACTER"]`,
          style: {
            'background-color': '#8E24AA'
          }
        },
        {
          selector: `node[type = "${NodeType.ENTITY}"][kind = "LOCATION"]`,
          style: {
            'background-color': '#4CAF50'
          }
        },
        {
          selector: `node[type = "${NodeType.ENTITY}"][kind = "CONCEPT"]`,
          style: {
            'background-color': '#2196F3'
          }
        },
        {
          selector: `node[type = "${NodeType.ENTITY}"][kind = "MENTION"]`,
          style: {
            'background-color': '#FF9800'
          }
        },
        {
          selector: `edge[type = "${EdgeType.CONTAINS_ENTITY}"]`,
          style: {
            'line-color': '#9C27B0',
            'target-arrow-color': '#9C27B0',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'width': 1
          }
        },
        {
          selector: `edge[type = "${EdgeType.NOTE_LINK}"]`,
          style: {
            'line-color': '#3F51B5',
            'target-arrow-color': '#3F51B5',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'width': 3
          }
        },
        {
          selector: `edge[type = "${EdgeType.MENTIONS}"]`,
          style: {
            'line-color': '#E040FB',
            'target-arrow-color': '#E040FB',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier'
          }
        },
        {
          selector: `edge[type = "${EdgeType.CO_OCCURS}"]`,
          style: {
            'line-color': '#F06292',
            'target-arrow-color': '#F06292',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier'
          }
        },
        {
          selector: `node[type = "${NodeType.GLOBAL_TRIPLE}"]`,
          style: {
            'background-color': '#795548',
            'shape': 'roundrectangle',
            'label': 'data(predicate)',
            'color': '#fff',
            'width': 60,
            'height': 60
          }
        },
        {
          selector: `edge[type = "${EdgeType.GLOBAL_TRIPLE_MEMBER}"]`,
          style: {
            'line-color': '#A1887F',
            'target-arrow-color': '#A1887F',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier'
          }
        }
      ],
      layout: { name: 'preset' },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: true
    });

    // Initialize undo/redo
    this.urInstance = this.graph.undoRedo();
    
    // Set up change detection
    this.setupChangeDetection();
  }

  /**
   * Get the Cytoscape graph instance
   */
  getGraph(): Core {
    return this.graph;
  }

  /**
   * Perform undo operation
   */
  undo(): void {
    this.urInstance.undo();
  }

  /**
   * Perform redo operation
   */
  redo(): void {
    this.urInstance.redo();
  }

  /**
   * Clear the entire graph
   */
  clearGraph(): void {
    this.graph.elements().remove();
  }

  /**
   * Export the current graph as a JSON object
   */
  exportGraph(): GraphJSON {
    const meta: GraphMeta = {
      app: 'graph-app',
      version: 1,
      exportedAt: new Date().toISOString()
    };

    const elements: ElementDefinition[] = this.graph.elements().map(ele => this.exportElement(ele));

    const layout = {}; // Implement layout export if needed
    const viewport = {
      zoom: this.graph.zoom(),
      pan: this.graph.pan()
    };

    return { meta, elements, layout, viewport };
  }

  /**
   * Import a graph from a JSON object
   */
  importGraph(data: GraphJSON): void {
    this.clearGraph();
    this.graph.json({ elements: data.elements });
  }

  /**
   * Export a single element to JSON
   */
  exportElement(ele: SingularElementArgument): ElementDefinition {
    return ele.json() as ElementDefinition;
  }

  /**
   * Import a single element from JSON
   */
  importElement(json: ElementDefinition): void {
    this.graph.add(json);
  }

  /**
   * Convert the graph to a serializable document format
   */
  toSerializableGraph(sourceText?: string, metadata?: Record<string, any>): GraphDocument {
    const graphJson = this.exportGraph();
    
    // Use the serialization methods to properly create a GraphDocument
    return {
      gn_namespace: 'graph-app',
      gn_id: `graph-${Date.now()}`,
      vertices: new Map(),
      edges: new Map(),
      metadata: {
        ...metadata,
        graph: graphJson,
        content: sourceText || ''
      },
      toJSON: () => ({}),
      fromJSON: () => {},
      addVertex: () => {},
      addEdge: () => {},
      getVertex: () => undefined,
      getEdge: () => undefined,
      hasVertex: () => false,
      hasEdge: () => false,
      renameProperties: () => {},
      validate: () => true,
      copy: function() { return this; }
    } as unknown as GraphDocument;
  }

  /**
   * Load the graph from a serializable document format
   */
  fromSerializableGraph(graphDoc: GraphDocument): boolean {
    if (!graphDoc.metadata || !graphDoc.metadata.graph) return false;

    const graphData = graphDoc.metadata.graph as GraphJSON;
    this.importGraph(graphData);
    return true;
  }

  /**
   * Add a new note to the graph
   */
  addNote(params: { 
    id?: string;
    title: string;
    content?: any[];
    createdAt?: string;
    updatedAt?: string;
    path?: string;
  }, folderId?: string, clusterId?: string): NodeSingular {
    const id = params.id || 'note-' + Date.now();
    const node = this.graph.add({
      group: 'nodes',
      data: {
        id,
        title: params.title,
        content: params.content,
        type: NodeType.NOTE,
        createdAt: params.createdAt || new Date().toISOString(),
        updatedAt: params.updatedAt || new Date().toISOString(),
        path: params.path || '',
        clusterId: clusterId,
        parentId: folderId
      }
    }) as NodeSingular;

    if (folderId) {
      this.graph.add({
        group: 'edges',
        data: {
          id: `${id}-contains-${folderId}`,
          source: id,
          target: folderId,
          type: EdgeType.CONTAINS
        }
      });
    }

    if (clusterId) {
      this.graph.add({
        group: 'edges',
        data: {
          id: `${id}-in_cluster-${clusterId}`,
          source: id,
          target: clusterId,
          type: EdgeType.IN_CLUSTER
        }
      });
    }

    return node;
  }

  /**
   * Update an existing note in the graph
   */
  updateNote(id: string, updates: Partial<Note>): boolean {
    const node = this.graph.getElementById(id);
    if (node.empty()) return false;

    node.data(updates);
    return true;
  }

  /**
   * Delete a note from the graph
   */
  deleteNote(id: string): boolean {
    const node = this.graph.getElementById(id);
    if (node.empty()) return false;

    node.remove();
    return true;
  }

  /**
   * Add a new cluster to the graph
   */
  addCluster(params: Partial<Cluster>): NodeSingular {
    const id = params.id || 'cluster-' + Date.now();
    const cluster = this.graph.add({
      group: 'nodes',
      data: {
        id,
        title: params.title || 'Untitled Cluster',
        type: NodeType.CLUSTER,
        createdAt: params.createdAt || new Date().toISOString(),
        updatedAt: params.updatedAt || new Date().toISOString()
      }
    }) as NodeSingular;

    return cluster;
  }

  /**
   * Update an existing cluster in the graph
   */
  updateCluster(id: string, updates: Partial<Cluster>): boolean {
    const cluster = this.graph.getElementById(id);
    if (cluster.empty()) return false;

    cluster.data(updates);
    return true;
  }

  /**
   * Delete a cluster from the graph
   */
  deleteCluster(id: string): boolean {
    const cluster = this.graph.getElementById(id);
    if (cluster.empty()) return false;

    cluster.remove();
    return true;
  }

  /**
   * Move a node to a cluster
   */
  moveNodeToCluster(nodeId: string, clusterId?: string): boolean {
    const node = this.graph.getElementById(nodeId);
    if (node.empty()) return false;

    // Remove existing cluster connections
    this.graph.edges(`[source = "${nodeId}"][type = "${EdgeType.IN_CLUSTER}"]`).remove();

    // Add new cluster connection
    if (clusterId) {
      this.graph.add({
        group: 'edges',
        data: {
          id: `${nodeId}-in_cluster-${clusterId}`,
          source: nodeId,
          target: clusterId,
          type: EdgeType.IN_CLUSTER
        }
      });
    }

    return true;
  }

  /**
   * Move a node to a new parent node
   */
  moveNode(nodeId: string, newParentId?: string | null): boolean {
    const node = this.graph.getElementById(nodeId);
    if (node.empty()) return false;

    // Remove existing parent connections
    this.graph.edges(`[source = "${nodeId}"][type = "${EdgeType.CONTAINS}"]`).remove();

    // Add new parent connection
    if (newParentId) {
      this.graph.add({
        group: 'edges',
        data: {
          id: `${nodeId}-contains-${newParentId}`,
          source: nodeId,
          target: newParentId,
          type: EdgeType.CONTAINS
        }
      });
    }

    return true;
  }

  /**
   * Get all nodes of a specific type
   */
  getNodesByType(type: NodeType): NodeCollection {
    return this.graph.nodes(`[type = "${type}"]`);
  }

  /**
   * Search for nodes matching a query
   */
  searchNodes(query: string, types: NodeType[]): NodeCollection {
    const selector = types.map(type => `[type = "${type}"]`).join(', ');
    return this.graph.nodes(selector).filter(node => {
      const title = node.data('title') || '';
      const content = node.data('content') || '';
      return title.toLowerCase().includes(query.toLowerCase()) || content.toLowerCase().includes(query.toLowerCase());
    });
  }

  /**
   * Get nodes related to a specific node
   */
  getRelatedNodes(nodeId: string): NodeCollection {
    const node = this.graph.getElementById(nodeId);
    return node.neighborhood().nodes();
  }

  /**
   * Get backlinks to a specific node
   */
  getBacklinks(nodeId: string): any[] {
    const node = this.graph.getElementById(nodeId);
    return node.incomers().map(inc => ({
      id: inc.id(),
      type: inc.isNode() ? 'node' : 'edge',
      data: inc.data()
    }));
  }

  /**
   * Tag a note with a tag
   */
  tagNote(noteId: string, tagName: string): boolean {
    const note = this.graph.getElementById(noteId);
    if (note.empty()) return false;

    const tag = this.graph.nodes(`[title = "${tagName}"][type = "${NodeType.TAG}"]`);
    if (tag.empty()) return false;

    const tagNode = tag.first();
    this.graph.add({
      group: 'edges',
      data: {
        id: `${noteId}-has_tag-${tagNode.id()}`,
        source: noteId,
        target: tagNode.id(),
        type: EdgeType.HAS_TAG
      }
    });

    return true;
  }

  /**
   * Get connections for a note
   */
  getConnections(noteId: string): Record<'tag' | 'concept' | 'mention' | 'entity' | 'triple', any[]> {
    return {
      tag: this.getConnectionsByType(noteId, EdgeType.HAS_TAG),
      concept: this.getConnectionsByType(noteId, EdgeType.HAS_CONCEPT),
      mention: this.getConnectionsByType(noteId, EdgeType.MENTIONS),
      entity: this.getConnectionsByType(noteId, EdgeType.CONTAINS_ENTITY),
      triple: this.getConnectionsByType(noteId, EdgeType.SEMANTIC_RELATION)
    };
  }

  /**
   * Get connections by edge type
   */
  private getConnectionsByType(noteId: string, edgeType: EdgeType): any[] {
    const edges = this.graph.edges(`[source = "${noteId}"][type = "${edgeType}"]`);
    return edges.targets().map(target => ({
      id: target.id(),
      title: target.data('title'),
      type: target.data('type')
    }));
  }

  /**
   * Update note connections
   */
  updateNoteConnections(
    noteId: string, 
    tags: string[], 
    mentions: string[], 
    links: string[], 
    entities: Entity[] = [], 
    triples: Triple[] = []
  ): void {
    const note = this.graph.getElementById(noteId);
    if (note.empty()) {
      console.warn(`Note ${noteId} not found in graph`);
      return;
    }

    console.log(`Updating connections for note ${noteId}:`, {
      tags: tags.length,
      mentions: mentions.length,
      links: links.length,
      entities: entities.length,
      triples: triples.length
    });

    // Remove all existing connections for this note
    this.graph.edges(`[source = "${noteId}"][type = "${EdgeType.HAS_TAG}"]`).remove();
    this.graph.edges(`[source = "${noteId}"][type = "${EdgeType.MENTIONS}"]`).remove();
    this.graph.edges(`[source = "${noteId}"][type = "${EdgeType.NOTE_LINK}"]`).remove();
    this.graph.edges(`[source = "${noteId}"][type = "${EdgeType.CONTAINS_ENTITY}"]`).remove();

    // 1. Handle tags (existing logic)
    tags.forEach(tagName => {
      const tag = this.graph.nodes(`[title = "${tagName}"][type = "${NodeType.TAG}"]`);
      if (!tag.empty()) {
        const tagNode = tag.first();
        this.graph.add({
          group: 'edges',
          data: {
            id: `${noteId}-has_tag-${tagNode.id()}`,
            source: noteId,
            target: tagNode.id(),
            type: EdgeType.HAS_TAG
          }
        });
      }
    });

    // 2. Handle mentions (existing logic)
    mentions.forEach(mentionId => {
      if (noteId === mentionId) return;
      const mention = this.graph.nodes(`[id = "${mentionId}"]`);
      if (!mention.empty()) {
        this.graph.add({
          group: 'edges',
          data: {
            id: `${noteId}-mentions-${mentionId}`,
            source: noteId,
            target: mentionId,
            type: EdgeType.MENTIONS
          }
        });
      }
    });

    // 3. NEW: Handle wiki links [[Note Title]] -> resolve to note IDs
    const resolvedLinkIds = this.resolveWikiLinksToNoteIds(links);
    resolvedLinkIds.forEach(linkId => {
      if (noteId === linkId) return; // Skip self-links
      
      this.graph.add({
        group: 'edges',
        data: {
          id: `${noteId}-note_link-${linkId}`,
          source: noteId,
          target: linkId,
          type: EdgeType.NOTE_LINK,
          linkType: 'wiki_link'
        }
      });
      console.log(`Created wiki link: ${noteId} -> ${linkId}`);
    });

    // 4. NEW: Handle entities - create entity nodes and connect to note
    entities.forEach(entity => {
      const entityNode = this.ensureEntityNode(entity);
      
      // Create edge from note to entity
      const edgeId = `${noteId}-contains_entity-${entityNode.id()}`;
      if (this.graph.getElementById(edgeId).empty()) {
        this.graph.add({
          group: 'edges',
          data: {
            id: edgeId,
            source: noteId,
            target: entityNode.id(),
            type: EdgeType.CONTAINS_ENTITY,
            entityKind: entity.kind
          }
        });
        console.log(`Connected note to entity: ${noteId} -> ${entity.kind}|${entity.label}`);
      }
    });

    // 5. NEW: Handle triples - create relationships between subject and object entities
    triples.forEach((triple, index) => {
      const subjectNode = this.ensureEntityNode(triple.subject);
      const objectNode = this.ensureEntityNode(triple.object);
      
      // Create edge between subject and object with predicate as edge type/label
      const edgeId = `${subjectNode.id()}-${triple.predicate}-${objectNode.id()}-${noteId}-${index}`;
      
      this.graph.add({
        group: 'edges',
        data: {
          id: edgeId,
          source: subjectNode.id(),
          target: objectNode.id(),
          type: EdgeType.SEMANTIC_RELATION,
          predicate: triple.predicate,
          sourceNoteId: noteId, // Track which note contains this triple
          label: triple.predicate
        }
      });
      console.log(`Created triple relationship: ${triple.subject.label} -[${triple.predicate}]-> ${triple.object.label}`);
    });

    console.log(`Finished updating connections for note ${noteId}`);
  }

  /**
   * Helper method to resolve wiki link titles to note IDs
   */
  private resolveWikiLinksToNoteIds(linkTitles: string[]): string[] {
    const resolvedIds: string[] = [];
    
    linkTitles.forEach(title => {
      // Find note with matching title
      const matchingNote = this.graph.nodes(`[type = "${NodeType.NOTE}"]`).filter(node => {
        const nodeTitle = node.data('title');
        return nodeTitle && nodeTitle.toLowerCase() === title.toLowerCase();
      });
      
      if (!matchingNote.empty()) {
        resolvedIds.push(matchingNote.first().id());
      } else {
        console.warn(`Wiki link target not found: "${title}"`);
      }
    });
    
    return resolvedIds;
  }

  /**
   * Helper method to ensure entity node exists in graph
   */
  private ensureEntityNode(entity: Entity): NodeSingular {
    const entityId = generateEntityId(entity.kind, entity.label);
    let entityNode = this.graph.getElementById(entityId);
    
    if (entityNode.empty()) {
      entityNode = this.graph.add({
        group: 'nodes',
        data: {
          id: entityId,
          type: NodeType.ENTITY,
          kind: entity.kind,
          label: entity.label,
          title: entity.label, // For consistent labeling
          attributes: entity.attributes || {},
          createdAt: new Date().toISOString()
        }
      }) as NodeSingular;
      console.log(`Created entity node: ${entity.kind}|${entity.label}`);
    } else {
      // Update attributes if provided
      if (entity.attributes) {
        const currentAttributes = entityNode.data('attributes') || {};
        entityNode.data('attributes', { ...currentAttributes, ...entity.attributes });
      }
    }
    
    return entityNode;
  }

  /**
   * Update entity attributes
   */
  updateEntityAttributes(kind: string, label: string, attributes: Record<string, any>): boolean {
    const entityNode = this.graph.nodes(`[kind = "${kind}"][label = "${label}"][type = "${NodeType.ENTITY}"]`);
    if (entityNode.empty()) return false;

    entityNode.data('attributes', attributes);
    return true;
  }

  /**
   * Get entity attributes
   */
  getEntityAttributes(kind: string, label: string): Record<string, any> | null {
    const entityNode = this.graph.nodes(`[kind = "${kind}"][label = "${label}"][type = "${NodeType.ENTITY}"]`);
    if (entityNode.empty()) return null;

    return entityNode.data('attributes') || {};
  }

  /**
   * Save entity attributes
   */
  async saveEntityAttributes(entityId: string, attributes: TypedAttribute[]): Promise<void> {
    // Implementation for saving entity attributes
  }

  /**
   * Load entity attributes
   */
  async loadEntityAttributes(entityId: string): Promise<TypedAttribute[]> {
    return [];
  }

  /**
   * Import graph data from store
   */
  importFromStore(notes: Note[], clusters: Cluster[]): void {
    this.clearGraph();

    // Add standard root
    this.addNote({
      id: STANDARD_ROOT_ID,
      title: 'Notes'
    });

    // Add clusters root
    this.addNote({
      id: CLUSTERS_ROOT_ID,
      title: 'Clusters'
    });

    // Add clusters
    clusters.forEach(cluster => {
      this.addCluster(cluster);
    });

    // Add notes
    notes.forEach(note => {
      this.addNote(note, note.parentId || STANDARD_ROOT_ID, note.clusterId);
    });
  }

  /**
   * Export graph data to store
   */
  exportToStore(): { notes: Note[]; clusters: Cluster[]; } {
    const notes: Note[] = this.graph.nodes(`[type = "${NodeType.NOTE}"]`).map(node => ({
      id: node.id(),
      title: node.data('title'),
      content: node.data('content'),
      type: 'note' as const,
      createdAt: node.data('createdAt'),
      updatedAt: node.data('updatedAt'),
      path: node.data('path'),
      clusterId: node.data('clusterId'),
      parentId: node.data('parentId')
    }));

    const clusters: Cluster[] = this.graph.nodes(`[type = "${NodeType.CLUSTER}"]`).map(node => ({
      id: node.id(),
      title: node.data('title'),
      createdAt: node.data('createdAt'),
      updatedAt: node.data('updatedAt')
    }));

    return { notes, clusters };
  }

  /**
   * Add a new thread to the graph
   */
  addThread(thread: Thread): NodeSingular {
    const node = this.graph.add({
      group: 'nodes',
      data: {
        id: thread.id,
        title: thread.title,
        type: NodeType.THREAD,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt
      }
    }) as NodeSingular;

    return node;
  }

  /**
   * Add a new thread message to the graph
   */
  addThreadMessage(msg: ThreadMessage): NodeSingular {
    const node = this.graph.add({
      group: 'nodes',
      data: {
        id: msg.id,
        threadId: msg.threadId,
        role: msg.role,
        content: msg.content,
        type: NodeType.THREAD_MESSAGE,
        createdAt: msg.createdAt,
        parentId: msg.parentId,
        attachments: msg.attachments
      }
    }) as NodeSingular;

    if (msg.parentId) {
      this.graph.add({
        group: 'edges',
        data: {
          id: `${msg.id}-replies_to-${msg.parentId}`,
          source: msg.id,
          target: msg.parentId,
          type: EdgeType.REPLIES_TO
        }
      });
    } else {
      this.graph.add({
        group: 'edges',
        data: {
          id: `${msg.id}-in_thread-${msg.threadId}`,
          source: msg.id,
          target: msg.threadId,
          type: EdgeType.IN_THREAD
        }
      });
    }

    return node;
  }

  /**
   * Update an existing thread message in the graph
   */
  updateThreadMessage(id: string, updates: Partial<ThreadMessage>): boolean {
    const node = this.graph.getElementById(id);
    if (node.empty()) return false;

    node.data(updates);
    return true;
  }

  /**
   * Delete a thread message from the graph
   */
  deleteThreadMessage(id: string): boolean {
    const node = this.graph.getElementById(id);
    if (node.empty()) return false;

    node.remove();
    return true;
  }

  /**
   * Start batch operations (for GraphStructureSynthesizer compatibility)
   */
  startBatchOperations(): void {
    if (this.batchCount === 0) {
      this.graph.startBatch();
    }
    this.batchCount++;
  }

  /**
   * End batch operations (for GraphStructureSynthesizer compatibility)
   */
  endBatchOperations(): void {
    this.batchCount = Math.max(0, this.batchCount - 1);
    if (this.batchCount === 0) {
      this.graph.endBatch();
    }
  }

  /**
   * Upsert co-occurrence edge (for GraphStructureSynthesizer compatibility)
   */
  upsertCoOccurrenceEdge(entity1Id: string, entity2Id: string, data: { count: number; noteIds: Set<string> }): void {
    const edgeId = `${entity1Id}-co_occurs-${entity2Id}`;
    
    // Remove existing edge if it exists
    this.graph.getElementById(edgeId).remove();
    
    // Add new edge
    this.graph.add({
      group: 'edges',
      data: {
        id: edgeId,
        source: entity1Id,
        target: entity2Id,
        type: EdgeType.CO_OCCURS,
        count: data.count,
        noteIds: Array.from(data.noteIds)
      }
    });
  }

  /**
   * Upsert global triple node (for GraphStructureSynthesizer compatibility)
   */
  upsertGlobalTripleNode(canonicalKey: string, data: { subject: any; predicate: string; object: any; noteIds: Set<string> }): void {
    // Remove existing node if it exists
    this.graph.getElementById(canonicalKey).remove();
    
    // Add new node
    this.graph.add({
      group: 'nodes',
      data: {
        id: canonicalKey,
        type: NodeType.GLOBAL_TRIPLE,
        predicate: data.predicate,
        subject: data.subject,
        object: data.object,
        noteIds: Array.from(data.noteIds)
      }
    });
  }

  /**
   * Remove element (for KuzuSyncService compatibility)
   */
  removeElement(elementId: string): void {
    const element = this.graph.getElementById(elementId);
    if (!element.empty()) {
      element.remove();
    }
  }

  /**
   * Set up change detection for sync purposes
   */
  private setupChangeDetection(): void {
    this.graph.on('add remove data', () => {
      this.notifyChangeListeners();
    });
  }

  /**
   * Notify all registered change listeners
   */
  private notifyChangeListeners(): void {
    const elements = this.graph.elements().map(ele => this.exportElement(ele));
    
    this.changeListeners.forEach(listener => {
      try {
        listener(elements);
      } catch (error) {
        console.error('Change listener error:', error);
      }
    });
  }

  /**
   * Add a change listener for sync purposes
   */
  addChangeListener(listener: (elements: ElementDefinition[]) => void): void {
    this.changeListeners.push(listener);
  }

  /**
   * Remove a change listener
   */
  removeChangeListener(listener: (elements: ElementDefinition[]) => void): void {
    const index = this.changeListeners.indexOf(listener);
    if (index > -1) {
      this.changeListeners.splice(index, 1);
    }
  }

  /**
   * Get an element by ID
   */
  getElement(elementId: string): ElementDefinition | null {
    const element = this.graph.getElementById(elementId);
    if (element.empty()) return null;
    return this.exportElement(element);
  }
}

// Create and export singleton instance
export const graphService = new GraphService();
