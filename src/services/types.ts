import { Core, NodeSingular, EdgeSingular, NodeCollection, EdgeCollection, ElementDefinition as CytoscapeElementDefinition, Position, SingularElementArgument } from 'cytoscape';
import { Note, Cluster } from '@/lib/store';
import { Entity } from '@/lib/utils/parsingUtils';
import { GraphDocument } from '@/lib/langchain-lite';
import { EntityWithReferences } from "@/components/entity-browser/EntityBrowser";
import { TypedAttribute } from '@/types/attributes';

export type ElementDefinition = CytoscapeElementDefinition;

export enum NodeType {
  NOTE = 'note',
  FOLDER = 'folder',
  TAG = 'tag',
  CONCEPT = 'concept',
  CLUSTER = 'cluster',
  STANDARD_ROOT = 'standard_root',
  CLUSTERS_ROOT = 'clusters_root',
  CLUSTER_DEFINITION = 'cluster_definition',
  CLUSTER_ROOT = 'cluster_root',
  THREAD = 'thread',
  THREAD_MESSAGE = 'thread_message',
  TRIPLE = 'TRIPLE',         // reified statement
  ENTITY = 'entity',         // Add this line for entity type
  GLOBAL_TRIPLE = 'GLOBAL_TRIPLE', // New: consolidated triple node
  // Story-specific entity types
  SCENE = 'SCENE',
  FACTION = 'FACTION',
  ITEM = 'ITEM',
  NPC = 'NPC',
  EVENT = 'EVENT'
}

export enum EdgeType {
  CONTAINS = 'contains',
  IN_CLUSTER = 'in_cluster',
  IN_THREAD = 'in_thread',
  REPLIES_TO = 'replies_to',
  HAS_TAG = 'has_tag',
  HAS_CONCEPT = 'has_concept',
  MENTIONS = 'mentions',
  NOTE_LINK = 'note_link',
  CO_OCCURS = 'co_occurs',
  GLOBAL_TRIPLE_MEMBER = 'global_triple_member',
  // New edge types for parsed elements
  CONTAINS_ENTITY = 'contains_entity',
  SEMANTIC_RELATION = 'semantic_relation',
  // Additional edge types for GraphServiceExtension
  MENTIONED_IN = 'mentioned_in',
  SUBJECT_OF = 'subject_of',
  OBJECT_OF = 'object_of'
}

export interface GraphMeta {
  app: string;
  version: number;
  exportedAt: string;
}

export interface GraphJSON {
  meta: GraphMeta;
  data?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  viewport?: { zoom: number; pan: Position };
  elements: ElementDefinition[];
}

export type GraphChangeEvent = {
  type: 'add' | 'update' | 'remove';
  elements: ElementDefinition[];
}

export type GraphChangeListener = (event: GraphChangeEvent) => void;

export interface Triple {
  id?: string;  // Add the optional id field
  subject: Entity;
  predicate: string;
  object: Entity;
}

export interface IGraphService {
  // Core operations
  getGraph(): Core;
  undo(): void;
  redo(): void;
  clearGraph(): void;
  
  // Change notifications
  addChangeListener(listener: (elements: ElementDefinition[]) => void): void;
  removeChangeListener(listener: (elements: ElementDefinition[]) => void): void;

  // Import/Export
  exportGraph(): GraphJSON;
  importGraph(data: GraphJSON): void;
  exportElement(ele: SingularElementArgument): ElementDefinition;
  importElement(json: ElementDefinition): void;
  
  // Serializable graph operations
  toSerializableGraph(sourceText?: string, metadata?: Record<string, any>): GraphDocument;
  fromSerializableGraph(graphDoc: GraphDocument): boolean;
  
  // Note operations
  addNote(params: { 
    id?: string;
    title: string;
    content?: any[];
    createdAt?: string;
    updatedAt?: string;
    path?: string;
  }, folderId?: string, clusterId?: string): NodeSingular;
  updateNote(id: string, updates: Partial<Note>): boolean;
  deleteNote(id: string): boolean;

  // Cluster operations
  addCluster(params: Partial<Cluster>): NodeSingular;
  updateCluster(id: string, updates: Partial<Cluster>): boolean;
  deleteCluster(id: string): boolean;
  moveNodeToCluster(nodeId: string, clusterId?: string): boolean;
  
  // Node operations
  moveNode(nodeId: string, newParentId?: string | null): boolean;
  getNodesByType(type: NodeType): NodeCollection;
  
  // Search and relations
  searchNodes(query: string, types: NodeType[]): NodeCollection;
  getRelatedNodes(nodeId: string): NodeCollection;
  getBacklinks(nodeId: string): any[];
  tagNote(noteId: string, tagName: string): boolean;
  getConnections(noteId: string): Record<'tag' | 'concept' | 'mention' | 'entity' | 'triple', any[]>;
  updateNoteConnections(noteId: string, tags: string[], mentions: string[], links: string[], entities?: Entity[], triples?: Triple[]): void;
  
  // Entity operations
  updateEntityAttributes(kind: string, label: string, attributes: Record<string, any>): boolean;
  getEntityAttributes(kind: string, label: string): Record<string, any> | null;
  saveEntityAttributes(entityId: string, attributes: TypedAttribute[]): Promise<void>;
  loadEntityAttributes(entityId: string): Promise<TypedAttribute[]>;
  
  // Store operations
  importFromStore(notes: Note[], clusters: Cluster[]): void;
  exportToStore(): { notes: Note[]; clusters: Cluster[]; };

  // Thread operations
  addThread(thread: Thread): NodeSingular;
  addThreadMessage(msg: ThreadMessage): NodeSingular;
  updateThreadMessage(id: string, updates: Partial<ThreadMessage>): boolean;
  deleteThreadMessage(id: string): boolean;
}

// Chat thread entities
export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface AttachmentMeta {
  id: string;
  type: 'image' | 'file' | 'text';
  name: string;
  url: string;
}

export interface ThreadMessage {
  id: string;
  threadId: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  parentId?: string | null;
  attachments?: AttachmentMeta[];
}

declare module './GraphService' {
  interface GraphService {
    getAllEntities(): EntityWithReferences[];
    createEntity(entity: Entity): boolean;
    getEntityReferences(kind: string, label: string): {id: string, title: string}[];
    getEntityRelationships(kind: string, label: string): any[];
    saveEntityAttributes(entityId: string, attributes: TypedAttribute[]): Promise<void>;
    loadEntityAttributes(entityId: string): Promise<TypedAttribute[]>;
  }
}
