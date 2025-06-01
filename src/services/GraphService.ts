import cytoscape, { Core, NodeSingular, EdgeSingular, NodeCollection, ElementDefinition, ElementGroup, SingularElementArgument, Position } from 'cytoscape';
import automove from 'cytoscape-automove';
import undoRedo from 'cytoscape-undo-redo';
import { Note, Cluster } from '@/lib/store';
import { slug } from '@/lib/utils';
import { generateNodeId, generateClusterId, generateNoteId, generateTripleId } from '@/lib/utils/ids';
import { IGraphService, NodeType, EdgeType, GraphJSON, Thread, ThreadMessage } from './types';
import { ClusterHandler } from './handlers/ClusterHandler';
import { parseAllNotes, Entity, Triple } from '@/lib/utils/parsingUtils';
import { schema, generateEntityId } from '@/lib/schema';
import { ensureEntityNode, addEdgeIfMissing } from '@/lib/graphHelpers';
import { GraphSerializer } from './GraphSerializer';
import { GraphDocument } from '@/lib/langchain-lite';
import { graphSerializationMethods } from './graphSerializationMethods';
import { extendGraphService } from './GraphServiceExtension';
import { EventEmitter } from 'events';

cytoscape.use(automove);
cytoscape.use(undoRedo);

interface UndoRedoInstance {
  do: (actionName: string, args?: any) => any;
  undo: () => void;
  redo: () => void;
  action: (name: string, doFn: (args: any) => any, undoFn: (args: any) => void) => void;
  lastAction: () => { name: string; result: any } | undefined;
}

export class GraphService extends EventEmitter implements IGraphService {
  private cy: Core;
  private ur: UndoRedoInstance;
  private titleIndex = new Map<string, string>();
  private notifyScheduled = false;
  private pendingChanges: ElementDefinition[] = [];
  private changeListeners: Array<(elements: ElementDefinition[]) => void> = [];
  private clusterExists = new Set<string>();
  private clusterHandler: ClusterHandler;

  constructor() {
    this.cy = cytoscape({ headless: true });
    this.ur = this.cy.undoRedo() as unknown as UndoRedoInstance;
    this.clusterHandler = new ClusterHandler(this.cy, this.clusterExists);

    (this.cy as any).automove({
      nodesMatching: 'node[type = "note"]',
      reposition: 'drag',
      dragWith: 'node[type = "folder"]'
    });

    this.initializeGraph();
    
    // Initialize extensions for entity browser
    extendGraphService(this);
  }

  private initializeGraph() {
    this.cy.elements().remove();
    this.titleIndex.clear();
    this.clusterExists.clear();

    if (this.cy.$(`node#standard_root`).empty()) {
      this.cy.add({
        group: 'nodes' as ElementGroup,
        data: {
          id: 'standard_root',
          type: NodeType.STANDARD_ROOT,
          title: 'Root',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
    }

    if (this.cy.$(`node#clusters_root`).empty()) {
      this.cy.add({
        group: 'nodes' as ElementGroup,
        data: {
          id: 'clusters_root',
          type: NodeType.CLUSTERS_ROOT,
          title: 'Clusters',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });
    }
  }

  private queueNotify(defs: ElementDefinition[]): void {
    this.pendingChanges.push(...defs);

    const MAX_BUFFER = 200;
    if (this.pendingChanges.length >= MAX_BUFFER) {
      this.flushNotify();
      return;
    }

    if (this.notifyScheduled) return;
    this.notifyScheduled = true;

    requestAnimationFrame(() => {
      this.notifyScheduled = false;
      this.flushNotify();
    });
  }

  private flushNotify(): void {
    if (this.pendingChanges.length > 0) {
        const changes = [...this.pendingChanges];
        this.pendingChanges = [];
        this.changeListeners.forEach(l => l(changes));
    }
  }

  private edgeExists(srcId: string, tgtId: string, label: EdgeType): boolean {
    const src = this.cy.getElementById(srcId);
    if (src.empty()) return false;

    return !src
      .connectedEdges(`[label = "${label}"][target = "${tgtId}"]`)
      .empty();
  }

  public getGraph(): Core {
    return this.cy;
  }

  public undo() { this.ur.undo(); }
  public redo() { this.ur.redo(); }

  public addChangeListener(listener: (elements: ElementDefinition[]) => void): void {
    this.changeListeners.push(listener);
  }

  public removeChangeListener(listener: (elements: ElementDefinition[]) => void): void {
    this.changeListeners = this.changeListeners.filter((l) => l !== listener);
  }

  public exportGraph(): GraphJSON {
    const cyJson = this.cy.json();
    const layoutData = ((cyJson as any).layout || {}) as Record<string, unknown>;
    
    return {
      meta: { 
        app: 'BlockNote Graph', 
        version: 2, 
        exportedAt: new Date().toISOString() 
      },
      data: this.cy.data(),
      layout: layoutData,
      viewport: { zoom: this.cy.zoom(), pan: this.cy.pan() },
      elements: this.cy.elements().jsons() as unknown as ElementDefinition[]
    };
  }

  public importGraph(g: GraphJSON): void {
    if (!g || !g.elements || !Array.isArray(g.elements)) {
      console.error("Invalid graph data format", g);
      return;
    }

    this.cy.startBatch();
    try {
      const elements = g.elements
        .map((e: ElementDefinition) => {
          if (e && e.data) {
            if (!e.data.id || String(e.data.id).length < 15) {
              console.warn(`Element missing valid ID, generating new one:`, e.data);
              e.data.id = generateNodeId();
            }
            return e;
          } else {
            console.warn(`Encountered invalid element definition in import.`);
            return null;
          }
        })
        .filter((e): e is ElementDefinition => e !== null);

      this.cy.json({ elements: elements } as any);

      if (g.layout) this.cy.json({ layout: g.layout } as any);
      if (g.data) this.cy.data(g.data);
      if (g.viewport) {
        this.cy.zoom(g.viewport.zoom);
        this.cy.pan(g.viewport.pan);
      }

      this.titleIndex.clear();
      this.clusterExists.clear();

      this.cy.nodes().forEach(node => {
        const type = node.data('type');
        const title = node.data('title');
        const id = node.id();

        if (type === NodeType.NOTE && title && id) {
           this.titleIndex.set(slug(title), id);
        } else if (type === NodeType.CLUSTER && id) {
           this.clusterExists.add(id);
        }
      });

    } catch (error) {
        console.error("Error during graph import:", error);
    }
    finally {
      this.cy.endBatch();
    }

    const elementDefs = this.cy.elements().jsons() as unknown as ElementDefinition[];
    this.queueNotify(elementDefs);
  }

  public exportElement(ele: SingularElementArgument): ElementDefinition {
    return ele.json() as ElementDefinition;
  }

  public importElement(json: ElementDefinition): void {
    if (!json || !json.data || !json.data.id) {
        console.error("Invalid element JSON for import:", json);
        return;
    }
    const elementId = json.data.id;
    const exists = this.cy.getElementById(elementId);

    if (exists.nonempty()) {
      exists.data(json.data);
      
      if (json.position && exists.isNode()) {
        (exists[0] as NodeSingular).position(json.position);
      }
      
    } else {
      this.cy.add(json);

      if (json.data.type === NodeType.NOTE && json.data.title) {
        this.titleIndex.set(slug(json.data.title), elementId);
      }

      if (json.data.type === NodeType.CLUSTER) {
        this.clusterExists.add(elementId);
      }
    }

    this.queueNotify([json]);
  }

  public clearGraph(): void {
    const removed = this.cy.elements().jsons() as unknown as ElementDefinition[];
    this.cy.elements().remove();
    this.titleIndex.clear();
    this.clusterExists.clear();
    if (removed.length > 0) {
      this.queueNotify(removed);
    }
    this.initializeGraph();
  }

  public getNodesByType(type: NodeType): NodeCollection {
    return this.cy.$(`node[type = "${type}"]`);
  }

  public addNote({ id, title, content = [], createdAt, updatedAt, path }: {
    id?: string;
    title: string;
    content?: any[];
    createdAt?: string;
    updatedAt?: string;
    path?: string;
  }, folderId?: string, clusterId?: string): NodeSingular {
    const nodeId = id && String(id).length >= 15 ? id : generateNoteId();
    const existingNode = this.cy.getElementById(nodeId);
    if (existingNode.nonempty()) {
      console.warn(`Note with ID ${nodeId} already exists. Returning existing node.`);
      return existingNode as NodeSingular;
    }

    const now = new Date().toISOString();
    const slugTitle = slug(title);

    const el: ElementDefinition = {
      group: 'nodes' as ElementGroup,
      data: {
        id: nodeId,
        type: NodeType.NOTE,
        title,
        slugTitle,
        content,
        path: path || '/',
        createdAt: createdAt || now,
        updatedAt: updatedAt || now,
        parent: folderId,
        folderId: folderId,
        clusterId: undefined
      }
    };

    const addedElements = this.ur.do('add', [el]);
    this.titleIndex.set(slugTitle, nodeId);

    const newNode = this.cy.getElementById(nodeId) as NodeSingular;

    if (clusterId) {
        if (this.clusterExists.has(clusterId)) {
             this.moveNodeToCluster(nodeId, clusterId);
        } else {
            console.warn(`Attempted to add note ${nodeId} to non-existent cluster ${clusterId}. Storing ID in data.`);
            newNode.data('clusterId', clusterId);
            this.queueNotify([newNode.json() as ElementDefinition]);
        }
    } else {
        newNode.data('clusterId', undefined);
        this.queueNotify([newNode.json() as ElementDefinition]);
    }

    return newNode;
  }

  public moveNodeToCluster(nodeId: string, clusterId?: string): boolean {
    return this.clusterHandler.moveNodeToCluster(nodeId, clusterId);
  }

  public importFromStore(notes: Note[], clusters: Cluster[]) {
    this.cy.startBatch();
    try {
      this.initializeGraph();

      const elements: ElementDefinition[] = [];

      clusters.forEach(cluster => {
        if (!cluster.id) {
            console.warn("Cluster missing ID during import from store:", cluster);
            cluster.id = generateClusterId();
        }
        this.clusterExists.add(cluster.id);
        elements.push({
          group: 'nodes' as ElementGroup,
          data: {
            ...cluster,
            type: NodeType.CLUSTER,
            createdAt: cluster.createdAt || new Date().toISOString(),
            updatedAt: cluster.updatedAt || new Date().toISOString(),
          }
        });
      });

      notes.forEach(note => {
        if (!note.id) {
             console.warn("Note missing ID during import from store:", note);
             note.id = generateNoteId();
        }
        const slugTitle = slug(note.title || '');
        elements.push({
          group: 'nodes' as ElementGroup,
          data: {
            ...note,
            type: NodeType.NOTE,
            slugTitle: slugTitle,
            createdAt: note.createdAt || new Date().toISOString(),
            updatedAt: note.updatedAt || new Date().toISOString(),
            parent: note.parentId,
            clusterId: note.clusterId,
          }
        });
        if (note.title) {
             this.titleIndex.set(slugTitle, note.id);
        }
      });

      const edgeElements: ElementDefinition[] = [];
      notes.forEach(note => {
        if (note.parentId && this.cy.getElementById(note.parentId).nonempty()) {
          edgeElements.push({
            group: 'edges' as ElementGroup,
            data: {
              id: `contains_${note.parentId}_${note.id}`,
              source: note.parentId,
              target: note.id,
              label: EdgeType.CONTAINS
            }
          });
        } else if (note.parentId) {
            console.warn(`Parent node ${note.parentId} not found for note ${note.id}`);
        }

        if (note.clusterId && this.clusterExists.has(note.clusterId)) {
           edgeElements.push({
            group: 'edges' as ElementGroup,
            data: {
              id: `${EdgeType.IN_CLUSTER}_${note.id}_${note.clusterId}`,
              source: note.id,
              target: note.clusterId,
              label: EdgeType.IN_CLUSTER
            }
          });
        } else if (note.clusterId) {
             console.warn(`Cluster node ${note.clusterId} not found for note ${note.id}`);
        }
      });

      if (edgeElements.length > 0) {
         this.cy.add(edgeElements);
      }

      // Parse connections from the initial notes
      const initialConnections = parseAllNotes(notes);
      initialConnections.tagsMap.forEach((tags, noteId) => {
        const mentions = initialConnections.mentionsMap.get(noteId) ?? [];
        const links = initialConnections.linksMap.get(noteId) ?? [];
        this.updateNoteConnections(noteId, tags, mentions, links);
      });

    } catch(error) {
        console.error("Error during importFromStore:", error);
    }
    finally {
      this.cy.endBatch();
    }

    const elementDefs = this.cy.elements().jsons() as unknown as ElementDefinition[];
    this.queueNotify(elementDefs);
  }

  public exportToStore() {
    const nodes = this.cy.nodes().map(node => node.data());
    const notes = nodes.filter(nodeData => nodeData.type === NodeType.NOTE) as Note[];
    const clusters = nodes.filter(nodeData => nodeData.type === NodeType.CLUSTER) as Cluster[];

    return {
      notes: notes,
      clusters: clusters
    };
  }

  public updateNote(id: string, updates: Partial<Note>): boolean {
    const node = this.cy.getElementById(id);
    if (node.empty() || node.data('type') !== NodeType.NOTE) {
        console.warn(`Node ${id} not found or not a Note for update.`);
        return false;
    }

    const oldTitle = node.data('title');
    const newTitle = updates.hasOwnProperty('title') ? updates.title : oldTitle;
    const slugTitle = slug(newTitle || '');

    const newData: Partial<Note> & { slugTitle?: string; updatedAt: string } = {
        updatedAt: new Date().toISOString()
    };

    for (const key in updates) {
        if (Object.prototype.hasOwnProperty.call(updates, key) && key !== 'id' && key !== 'createdAt') {
             (newData as any)[key] = (updates as any)[key];
        }
    }

     if (updates.hasOwnProperty('title')) {
         newData.slugTitle = slugTitle;
     }

    const changeOps: { ele: NodeSingular; name: string; oldValue: any; newValue: any }[] = [];
    for (const key in newData) {
        if (key !== 'updatedAt' && Object.prototype.hasOwnProperty.call(newData, key)) {
            changeOps.push({
                ele: node as NodeSingular,
                name: key,
                oldValue: node.data(key),
                newValue: (newData as any)[key]
            });
        }
    }
    node.data('updatedAt', newData.updatedAt);

    if (changeOps.length > 0) {
        this.ur.action(
            'updateNoteData',
            (args: { changes: typeof changeOps }) => {
                args.changes.forEach(op => op.ele.data(op.name, op.newValue));
                return args;
            },
            (undoArgs: { changes: typeof changeOps }) => {
                undoArgs.changes.forEach(op => op.ele.data(op.name, op.oldValue));
            }
        );
    } else if (Object.keys(newData).length === 1 && newData.updatedAt) {
        node.data('updatedAt', newData.updatedAt);
    }

    if (updates.hasOwnProperty('title') && oldTitle !== newTitle) {
        if (oldTitle) this.titleIndex.delete(slug(oldTitle));
        if (newTitle) this.titleIndex.set(slugTitle, id);
    }

    this.queueNotify([node.json() as ElementDefinition]);
    return true;
  }

  public deleteNote(id: string): boolean {
    const node = this.cy.getElementById(id);
    if (node.empty() || node.data('type') !== NodeType.NOTE) {
         console.warn(`Node ${id} not found or is not a Note.`);
         return false;
    }

    const removedJson = node.json() as ElementDefinition;
    const slugTitle = node.data('slugTitle');

    const removedCollection = this.ur.do('remove', node);

    if (slugTitle) {
        this.titleIndex.delete(slugTitle);
    }

    const actualRemovedJsons = removedCollection?.jsons() as unknown as ElementDefinition[] || [];
    if (actualRemovedJsons.length > 0) {
       this.queueNotify(actualRemovedJsons);
    } else {
       this.queueNotify([removedJson]);
    }

    return true;
  }

  public addCluster(params: Partial<Cluster> = {}): NodeSingular {
    return this.clusterHandler.addCluster(params);
  }

  public updateCluster(id: string, updates: Partial<Cluster>): boolean {
    return this.clusterHandler.updateCluster(id, updates);
  }

  public deleteCluster(id: string): boolean {
    return this.clusterHandler.deleteCluster(id);
  }

  public moveNode(nodeId: string, newParentId?: string | null): boolean {
    const node = this.cy.getElementById(nodeId);
    if (node.empty()) {
        console.warn(`Node ${nodeId} not found for moving.`);
        return false;
    }

    const parent = node.parent().first();
    const oldParentId = parent.id();

    this.ur.action(
        'moveNodeCompound',
        (args: { nodeId: string, oldParentId: string, newParentId: string | null }) => {
            const nodeToMove = this.cy.getElementById(args.nodeId);
            if (nodeToMove.nonempty()) {
                nodeToMove.move({ parent: args.newParentId });
            }
            return args;
        },
        (undoArgs: { nodeId: string, oldParentId: string, newParentId: string | null }) => {
            const nodeToMove = this.cy.getElementById(undoArgs.nodeId);
             if (nodeToMove.nonempty()) {
                 nodeToMove.move({ parent: undoArgs.oldParentId });
             }
        }
    );

    this.queueNotify([node.json() as ElementDefinition]);

    return true;
  }

  public searchNodes(query: string, types: NodeType[]): NodeCollection {
    if (!query || query.trim() === '') {
        return this.cy.collection() as NodeCollection;
    }
    if (!types || types.length === 0) {
        return this.cy.collection() as NodeCollection;
    }

    const sanitizedQuery = query.replace(/["\\]/g, '\\$&/');

    const selectors = types.map(type => `node[type = "${type}"][title @*= "${sanitizedQuery}"]`);
    const finalSelector = selectors.join(', ');

    try {
        return this.cy.$(finalSelector);
    } catch (e) {
        console.error(`Error executing search selector: "${finalSelector}"`, e);
        return this.cy.collection() as NodeCollection;
    }
  }

  public getRelatedNodes(nodeId: string): NodeCollection {
    const node = this.cy.getElementById(nodeId);
    if (node.empty()) return this.cy.collection() as NodeCollection;

    return node.neighborhood().nodes();
  }

  public tagNote(noteId: string, tagName: string): boolean {
    const note = this.cy.getElementById(noteId);
    if (note.empty() || note.data('type') !== NodeType.NOTE) {
        console.warn(`Node ${noteId} not found or not a Note, cannot add tag.`);
        return false;
    }

    const tagId = slug(tagName.trim());
    if (!tagId) {
        console.warn(`Invalid tag name "${tagName}" resulted in empty slug.`);
        return false;
    }

    let tagNode = this.cy.getElementById(tagId);

    this.ur.action(
        'tagNote',
        (args: { noteId: string, tagId: string, tagName: string }) => {
            let currentTagNode = this.cy.getElementById(args.tagId);
            let addedElementDefs: ElementDefinition[] = [];
            let createdTagNode = false;

            if (currentTagNode.empty()) {
                const tagEl: ElementDefinition = {
                    group: 'nodes' as ElementGroup,
                    data: {
                    id: args.tagId,
                    type: NodeType.TAG,
                    title: args.tagName
                    }
                };
                this.cy.add(tagEl);
                addedElementDefs.push(tagEl);
                createdTagNode = true;
            }

            if (!this.edgeExists(args.noteId, args.tagId, EdgeType.HAS_TAG)) {
                const edgeDef: ElementDefinition = {
                    group: 'edges' as ElementGroup,
                    data: {
                        id: `has_tag_${args.noteId}_${args.tagId}`,
                        source: args.noteId,
                        target: args.tagId,
                        label: EdgeType.HAS_TAG
                    }
                };
                this.cy.add(edgeDef);
                addedElementDefs.push(edgeDef);
            }

            return { ...args, addedElements: addedElementDefs, createdTagNode };
        },
        (undoArgs: { addedElements?: ElementDefinition[], noteId: string, tagId: string, tagName: string }) => {
            if (undoArgs.addedElements && undoArgs.addedElements.length > 0) {
                const idsToRemove = undoArgs.addedElements.map(def => def.data.id);
                this.cy.remove(this.cy.elements().filter(el => idsToRemove.includes(el.id())));
            }
        }
    );

    const actionResult = this.ur.lastAction()?.result;
    const removedJsons = actionResult?.addedElements || [];
    if (removedJsons.length > 0) {
       this.queueNotify(removedJsons);
    }
    
    return true;
  }

  /**
   * Updates the connections (tags, mentions, links, entities, triples) for a specific note in the graph
   * Updated to use unified entity promotion and canonical IDs
   * @param noteId ID of the note to update connections for
   * @param tags Array of tag strings
   * @param mentions Array of mention strings (usernames without @)
   * @param links Array of link title strings (without [[]])
   * @param entities Array of entities found in the note
   * @param triples Array of triples (subject-predicate-object) found in the note
   */
  public updateNoteConnections(
    noteId: string, 
    tags: string[], 
    mentions: string[], 
    links: string[],
    entities: Entity[] = [],
    triples: Triple[] = []
  ): void {
    const noteNode = this.cy.getElementById(noteId);
    if (noteNode.empty() || noteNode.data('type') !== NodeType.NOTE) {
      console.warn(`[GraphService] Note ${noteId} not found or not a note type.`);
      return;
    }

    this.cy.startBatch();
    
    try {
      // Remove existing connections for this note
      this.cy.edges(`[label = "${EdgeType.HAS_TAG}"][source = "${noteId}"]`).remove();
      this.cy.edges(`[label = "${EdgeType.MENTIONS}"][source = "${noteId}"]`).remove();
      this.cy.edges(`[label = "${EdgeType.LINKS_TO}"][source = "${noteId}"]`).remove();
      this.cy.edges(`[label = "${EdgeType.MENTIONED_IN}"][target = "${noteId}"]`).remove();
      
      // Unified entity promotion: process all entities (including promoted tags/mentions)
      entities.forEach(entity => {
        const entityId = generateEntityId(entity.kind, entity.label);
        
        // Ensure entity node exists with canonical ID
        ensureEntityNode(entityId, entity, this.cy);
        
        // Create provenance edge (Entity → Note)
        addEdgeIfMissing(entityId, noteId, EdgeType.MENTIONED_IN, this.cy);
        
        // For backwards compatibility, also create type-specific edges
        if (entity.kind === 'CONCEPT' && tags.includes(entity.label)) {
          // Create HAS_TAG edge for promoted tag entities
          addEdgeIfMissing(noteId, entityId, EdgeType.HAS_TAG, this.cy);
        } else if (entity.kind === 'MENTION' && mentions.includes(entity.label)) {
          // Try to find target note for mention
          const targetNoteId = this.findNoteIdByTitle(entity.label);
          if (targetNoteId && targetNoteId !== noteId) {
            addEdgeIfMissing(noteId, targetNoteId, EdgeType.MENTIONS, this.cy);
          }
        }
      });
      
      // Handle links (find target notes)
      links.forEach(linkTitle => {
        const targetNoteId = this.findNoteIdByTitle(linkTitle);
        if (targetNoteId && targetNoteId !== noteId) {
          addEdgeIfMissing(noteId, targetNoteId, EdgeType.LINKS_TO, this.cy);
        }
      });
      
      // Handle triples with canonical entity IDs
      triples.forEach(triple => {
        const subjId = generateEntityId(triple.subject.kind, triple.subject.label);
        const objId = generateEntityId(triple.object.kind, triple.object.label);

        // Ensure participants exist with canonical IDs
        ensureEntityNode(subjId, triple.subject, this.cy);
        ensureEntityNode(objId, triple.object, this.cy);

        // Create TRIPLE node
        const tripleId = triple.id || generateTripleId();
        if (this.cy.getElementById(tripleId).empty()) {
          this.cy.add({
            group: 'nodes',
            data: {
              id: tripleId,
              type: NodeType.TRIPLE,
              predicate: triple.predicate,
              createdIn: noteId
            },
            style: schema.getNodeDef('TRIPLE')?.defaultStyle
          });
          
          // Write back ID for caller reference
          if (!triple.id) {
            triple.id = tripleId;
          }
        }

        // Link subject & object to triple
        addEdgeIfMissing(subjId, tripleId, EdgeType.SUBJECT_OF, this.cy, triple.predicate);
        addEdgeIfMissing(objId, tripleId, EdgeType.OBJECT_OF, this.cy, triple.predicate);

        // Provenance edge (Triple is mentioned in this note)
        addEdgeIfMissing(tripleId, noteId, EdgeType.MENTIONED_IN, this.cy);
      });
      
    } catch (error) {
      console.error('[GraphService] Error updating note connections:', error);
    }
    
    this.cy.endBatch();
    console.log(`[GraphService] Updated connections for note ${noteId} using unified entity promotion`);
  }
  
  // Helper method to find note by title
  private findNoteIdByTitle(title: string): string | null {
    const sluggedTitle = slug(title);
    return this.titleIndex.get(sluggedTitle) || null;
  }
  
  /**
   * Gets connections for a note
   */
  public getConnections(noteId: string): Record<'tag' | 'concept' | 'mention' | 'entity' | 'triple', any[]> {
    const connections = {
      tag: [] as { id: string; title: string }[],
      concept: [] as { id: string; title: string }[],
      mention: [] as { id: string; title: string }[],
      entity: [] as { kind: string; label: string }[],
      triple: [] as { subject: { kind: string; label: string }; predicate: string; object: { kind: string; label: string }; id?: string }[]
    };
    
    try {
      // Get tags
      this.cy.edges(`[label = "${EdgeType.HAS_TAG}"][source = "${noteId}"]`).forEach(edge => {
        const targetId = edge.target().id();
        const targetTitle = edge.target().data('title');
        connections.tag.push({ id: targetId, title: targetTitle });
      });
      
      // Get links (concepts)
      this.cy.edges(`[label = "${EdgeType.LINKS_TO}"][source = "${noteId}"]`).forEach(edge => {
        const targetId = edge.target().id();
        const targetTitle = edge.target().data('title');
        connections.concept.push({ id: targetId, title: targetTitle });
      });
      
      // Get mentions
      this.cy.edges(`[label = "${EdgeType.MENTIONS}"][source = "${noteId}"]`).forEach(edge => {
        const targetId = edge.target().id();
        const targetTitle = edge.target().data('title');
        connections.mention.push({ id: targetId, title: targetTitle });
      });
      
      // Get entities mentioned in this note
      this.cy.edges(`[label = "${EdgeType.MENTIONED_IN}"][target = "${noteId}"]`).forEach(edge => {
        const sourceNode = edge.source();
        if (sourceNode.data('type') !== NodeType.TRIPLE) {
          const kind = sourceNode.data('kind');
          const label = sourceNode.data('label');
          connections.entity.push({ kind, label });
        }
      });
      
      // Get triples mentioned in this note
      this.cy.edges(`[label = "${EdgeType.MENTIONED_IN}"][target = "${noteId}"]`).forEach(edge => {
        const tripleNode = edge.source();
        if (tripleNode.data('type') === NodeType.TRIPLE) {
          const predicate = tripleNode.data('predicate');
          
          // Find subject
          const subjectEdge = tripleNode.connectedEdges(`[label = "${EdgeType.SUBJECT_OF}"]`).first();
          if (subjectEdge.empty()) return;
          const subjectNode = subjectEdge.source();
          
          // Find object
          const objectEdge = tripleNode.connectedEdges(`[label = "${EdgeType.OBJECT_OF}"]`).first();
          if (objectEdge.empty()) return;
          const objectNode = objectEdge.source();
          
          connections.triple.push({
            subject: {
              kind: subjectNode.data('kind'),
              label: subjectNode.data('label')
            },
            predicate,
            object: {
              kind: objectNode.data('kind'),
              label: objectNode.data('label')
            }
          });
        }
      });
      
    } catch (error) {
      console.error('[GraphService] Error getting connections:', error);
    }
    
    return connections;
  }
  
  /**
   * Gets backlinks to a note
   */
  public getBacklinks(noteId: string): { id: string; title: string }[] {
    const backlinks: { id: string; title: string }[] = [];
    
    try {
      // Get notes that link to this note
      this.cy.edges(`[label = "${EdgeType.LINKS_TO}"][target = "${noteId}"]`).forEach(edge => {
        const sourceId = edge.source().id();
        const sourceTitle = edge.source().data('title');
        backlinks.push({ id: sourceId, title: sourceTitle });
      });
      
      // Get notes that mention this note
      this.cy.edges(`[label = "${EdgeType.MENTIONS}"][target = "${noteId}"]`).forEach(edge => {
        const sourceId = edge.source().id();
        const sourceTitle = edge.source().data('title');
        if (!backlinks.some(link => link.id === sourceId)) {
          backlinks.push({ id: sourceId, title: sourceTitle });
        }
      });
      
    } catch (error) {
      console.error('[GraphService] Error getting backlinks:', error);
    }
    
    return backlinks;
  }

  // Thread operations
  public addThread(thread: Thread): NodeSingular {
    const node = this.cy.add({ 
      group: 'nodes', 
      data: { 
        id: thread.id, 
        type: NodeType.THREAD, 
        title: thread.title, 
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt
      } 
    });
    this.queueNotify([this.exportElement(node)]);
    return node;
  }

  public addThreadMessage(msg: ThreadMessage): NodeSingular {
    const node = this.cy.add({ 
      group: 'nodes', 
      data: { 
        id: msg.id, 
        type: NodeType.THREAD_MESSAGE, 
        role: msg.role, 
        createdAt: msg.createdAt, 
        content: msg.content,
        attachments: msg.attachments
      } 
    });
    
    // link to thread
    this.cy.add({ 
      group: 'edges', 
      data: { 
        id: `${msg.id}-in-thread`, 
        source: msg.threadId, 
        target: msg.id, 
        label: EdgeType.IN_THREAD 
      } 
    });
    
    // optional reply edge
    if (msg.parentId) {
      this.cy.add({ 
        group: 'edges', 
        data: { 
          id: `${msg.id}-reply-${msg.parentId}`, 
          source: msg.id, 
          target: msg.parentId, 
          label: EdgeType.REPLIES_TO 
        } 
      });
    }
    
    this.queueNotify([this.exportElement(node)]);
    return node;
  }

  public updateThreadMessage(id: string, updates: Partial<ThreadMessage>): boolean {
    const node = this.cy.getElementById(id);
    if (node.empty()) return false;
    
    node.data({ 
      ...node.data(), 
      ...updates,
      updatedAt: new Date().toISOString()
    });
    
    this.queueNotify([this.exportElement(node)]);
    return true;
  }

  public deleteThreadMessage(id: string): boolean {
    const node = this.cy.getElementById(id);
    if (node.empty()) return false;
    
    // Get all edges to remove too
    const edges = node.connectedEdges();
    
    this.cy.remove(node);
    this.cy.remove(edges);
    
    this.queueNotify([{ group: 'nodes', data: { id } }]);
    return true;
  }

  /**
   * Converts the current graph to a serializable GraphDocument
   * @param sourceText Optional text content for the source document
   * @param metadata Optional metadata for the source document
   * @returns A GraphDocument containing the serialized graph
   */
  public toSerializableGraph(sourceText: string = "", metadata: Record<string, any> = {}): GraphDocument {
    return graphSerializationMethods.toSerializableGraph(this.cy, sourceText, metadata);
  }
  
  /**
   * Imports a GraphDocument into the graph
   * @param graphDoc The GraphDocument to import
   * @returns True if import was successful
   */
  public fromSerializableGraph(graphDoc: GraphDocument): boolean {
    const result = graphSerializationMethods.fromSerializableGraph(this.cy, graphDoc);
    if (result) {
      // Re-index node titles and cluster IDs
      this.titleIndex.clear();
      this.clusterExists.clear();
      
      this.cy.nodes().forEach(node => {
        const type = node.data('type');
        const title = node.data('title');
        const id = node.id();
        
        if (type === NodeType.NOTE && title && id) {
          this.titleIndex.set(slug(title), id);
        } else if (type === NodeType.CLUSTER && id) {
          this.clusterExists.add(id);
        }
      });
      
      const elementDefs = this.cy.elements().jsons() as unknown as ElementDefinition[];
      this.queueNotify(elementDefs);
    }
    return result;
  }

  // New methods to handle entity attributes
  public updateEntityAttributes(kind: string, label: string, attributes: Record<string, any>): boolean {
    const entityId = generateEntityId(kind, label);
    const entity = this.cy.getElementById(entityId);
    
    if (entity.empty()) {
      console.warn(`Entity ${entityId} not found.`);
      return false;
    }
    
    const currentAttributes = entity.data('attributes') || {};
    
    // Handle both old format (simple key-value) and new format (EnhancedEntityAttributes)
    let newAttributes;
    if (attributes.attributes && Array.isArray(attributes.attributes)) {
      // New enhanced format
      newAttributes = attributes;
    } else {
      // Old format or simple attributes - wrap in enhanced format
      newAttributes = {
        attributes: attributes,
        metadata: {
          version: 1,
          lastUpdated: new Date().toISOString()
        }
      };
    }
    
    entity.data('attributes', { ...currentAttributes, ...newAttributes });
    
    this.queueNotify([entity.json() as ElementDefinition]);
    return true;
  }
  
  public getEntityAttributes(kind: string, label: string): Record<string, any> | null {
    const entityId = generateEntityId(kind, label);
    const entity = this.cy.getElementById(entityId);
    
    if (entity.empty()) {
      console.warn(`Entity ${entityId} not found.`);
      return null;
    }
    
    return entity.data('attributes') || {};
  }

  /**
   * Upserts a CO_OCCURS edge between two entities
   * @param entityId1 First entity ID
   * @param entityId2 Second entity ID  
   * @param coOccurrenceData Co-occurrence data with count and noteIds
   */
  public upsertCoOccurrenceEdge(entityId1: string, entityId2: string, coOccurrenceData: { count: number; noteIds: Set<string> }): void {
    const entity1Node = this.cy.getElementById(entityId1);
    const entity2Node = this.cy.getElementById(entityId2);
    
    if (entity1Node.empty() || entity2Node.empty()) {
      console.warn(`[GraphService] Cannot create co-occurrence edge: entity nodes not found (${entityId1}, ${entityId2})`);
      return;
    }

    // Create canonical edge ID (always order by ID to ensure consistency)
    const [sourceId, targetId] = entityId1 < entityId2 ? [entityId1, entityId2] : [entityId2, entityId1];
    const edgeId = `co_occurs_${sourceId}_${targetId}`;
    
    const existingEdge = this.cy.getElementById(edgeId);
    const noteIds = Array.from(coOccurrenceData.noteIds);
    
    this.ur.action(
      'upsertCoOccurrenceEdge',
      (args: { edgeId: string; sourceId: string; targetId: string; count: number; noteIds: string[]; isUpdate: boolean }) => {
        let edge;
        if (args.isUpdate) {
          edge = this.cy.getElementById(args.edgeId);
          edge.data({
            count: args.count,
            notes: args.noteIds
          });
        } else {
          const edgeDef: ElementDefinition = {
            group: 'edges' as ElementGroup,
            data: {
              id: args.edgeId,
              source: args.sourceId,
              target: args.targetId,
              label: EdgeType.CO_OCCURS,
              count: args.count,
              notes: args.noteIds
            }
          };
          edge = this.cy.add(edgeDef);
        }
        return { edge: edge.json() as ElementDefinition };
      },
      (undoArgs: { edge: ElementDefinition }) => {
        const edgeToRemove = this.cy.getElementById(undoArgs.edge.data.id);
        if (edgeToRemove.nonempty()) {
          edgeToRemove.remove();
        }
      }
    );

    const actionResult = this.ur.lastAction()?.result;
    if (actionResult?.edge) {
      this.queueNotify([actionResult.edge]);
    }
  }

  /**
   * Upserts a GLOBAL_TRIPLE node and its member edges
   * @param canonicalTripleKey Unique key for the triple
   * @param tripleDetails Triple details with entities and noteIds
   */
  public upsertGlobalTripleNode(canonicalTripleKey: string, tripleDetails: { subject: Entity; predicate: string; object: Entity; noteIds: Set<string> }): void {
    const subjectId = generateEntityId(tripleDetails.subject.kind, tripleDetails.subject.label);
    const objectId = generateEntityId(tripleDetails.object.kind, tripleDetails.object.label);
    
    const subjectNode = this.cy.getElementById(subjectId);
    const objectNode = this.cy.getElementById(objectId);
    
    if (subjectNode.empty() || objectNode.empty()) {
      console.warn(`[GraphService] Cannot create global triple: entity nodes not found (${subjectId}, ${objectId})`);
      return;
    }

    const existingTripleNode = this.cy.getElementById(canonicalTripleKey);
    const noteIds = Array.from(tripleDetails.noteIds);
    const isUpdate = existingTripleNode.nonempty();
    
    this.ur.action(
      'upsertGlobalTriple',
      (args: { 
        tripleId: string; 
        subjectId: string; 
        objectId: string; 
        predicate: string; 
        noteIds: string[]; 
        isUpdate: boolean 
      }) => {
        const addedElements: ElementDefinition[] = [];
        
        // Create or update the global triple node
        let tripleNode;
        if (args.isUpdate) {
          tripleNode = this.cy.getElementById(args.tripleId);
          tripleNode.data({
            notes: args.noteIds,
            subjectId: args.subjectId,
            objectId: args.objectId
          });
          addedElements.push(tripleNode.json() as ElementDefinition);
        } else {
          const tripleNodeDef: ElementDefinition = {
            group: 'nodes' as ElementGroup,
            data: {
              id: args.tripleId,
              type: NodeType.GLOBAL_TRIPLE,
              predicate: args.predicate,
              notes: args.noteIds,
              subjectId: args.subjectId,
              objectId: args.objectId,
              createdAt: new Date().toISOString()
            }
          };
          tripleNode = this.cy.add(tripleNodeDef);
          addedElements.push(tripleNodeDef);
        }

        // Create GLOBAL_TRIPLE_MEMBER edges if they don't exist
        const subjectEdgeId = `global_triple_member_${args.subjectId}_${args.tripleId}_subject`;
        const objectEdgeId = `global_triple_member_${args.objectId}_${args.tripleId}_object`;
        
        if (this.cy.getElementById(subjectEdgeId).empty()) {
          const subjectEdgeDef: ElementDefinition = {
            group: 'edges' as ElementGroup,
            data: {
              id: subjectEdgeId,
              source: args.subjectId,
              target: args.tripleId,
              label: EdgeType.GLOBAL_TRIPLE_MEMBER,
              role: 'subject'
            }
          };
          this.cy.add(subjectEdgeDef);
          addedElements.push(subjectEdgeDef);
        }
        
        if (this.cy.getElementById(objectEdgeId).empty()) {
          const objectEdgeDef: ElementDefinition = {
            group: 'edges' as ElementGroup,
            data: {
              id: objectEdgeId,
              source: args.objectId,
              target: args.tripleId,
              label: EdgeType.GLOBAL_TRIPLE_MEMBER,
              role: 'object'
            }
          };
          this.cy.add(objectEdgeDef);
          addedElements.push(objectEdgeDef);
        }
        
        return { addedElements };
      },
      (undoArgs: { addedElements: ElementDefinition[] }) => {
        undoArgs.addedElements.forEach(elementDef => {
          const element = this.cy.getElementById(elementDef.data.id);
          if (element.nonempty()) {
            element.remove();
          }
        });
      }
    );

    const actionResult = this.ur.lastAction()?.result;
    if (actionResult?.addedElements) {
      this.queueNotify(actionResult.addedElements);
    }
  }

  /**
   * Starts a batch operation for performance
   */
  public startBatchOperations(): void {
    this.cy.startBatch();
  }

  /**
   * Ends a batch operation
   */
  public endBatchOperations(): void {
    this.cy.endBatch();
  }

  /**
   * Get a specific element by ID
   */
  getElement(id: string): ElementDefinition | null {
    if (!this.cy) return null;
    
    const element = this.cy.getElementById(id);
    if (element.length === 0) return null;
    
    return {
      group: element.isNode() ? 'nodes' : 'edges',
      data: element.data(),
      position: element.isNode() ? element.position() : undefined,
      style: element.style()
    } as ElementDefinition;
  }

  /**
   * Remove element by ID
   */
  removeElement(id: string): void {
    if (!this.cy) return;
    
    const element = this.cy.getElementById(id);
    if (element.length > 0) {
      element.remove();
      console.log(`GraphService: Removed element ${id}`);
    }
  }

  /**
   * Import a single element into the graph
   */
  importElement(element: ElementDefinition): void {
    if (!this.cy) return;
    
    try {
      // Check if element already exists
      const existing = this.cy.getElementById(element.data.id);
      
      if (existing.length > 0) {
        // Update existing element
        existing.data(element.data);
        if (element.position && existing.isNode()) {
          existing.position(element.position);
        }
      } else {
        // Add new element
        this.cy.add(element);
      }
      
      console.log(`GraphService: Imported element ${element.data.id}`);
    } catch (error) {
      console.error(`GraphService: Failed to import element ${element.data.id}:`, error);
    }
  }
}

export const graphService = new GraphService();
export default graphService;
