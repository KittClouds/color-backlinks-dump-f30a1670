
// Kuzu Node Types - Direct mapping to schema
export interface KuzuNote {
  id: string;
  title?: string;
  slugTitle?: string;
  content?: string;  // JSON string from LiveStore
  type?: 'note' | 'folder';
  createdAt?: string;  // Timestamp as string
  updatedAt?: string;
  path?: string;
  clusterId?: string;  // FK to Cluster.id
  parentId?: string;   // FK to Note.id for folder tree
}

export interface KuzuCluster {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface KuzuTag {
  id: string;    // slug
  label?: string;
}

export interface KuzuMention {
  id: string;    // slug
  label?: string;
}

export interface KuzuEntity {
  id: string;         // generateEntityId(kind,label)
  kind?: string;
  label?: string;
  attributes?: string; // JSON blob (EnhancedEntityAttributes)
  embedding?: number[]; // Vector for ANN search (optional)
}

export interface KuzuGlobalTriple {
  id: string;         // hash(subjectId,predicate,objectId)
  predicate?: string;
  notes?: string;     // JSON array of noteIds for provenance
}

export interface KuzuThread {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface KuzuThreadMessage {
  id: string;
  role?: string;
  content?: string;
  attachments?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Kuzu Relationship Types
export interface KuzuContainsRel {
  // Note TO Note hierarchy
}

export interface KuzuInClusterRel {
  // Note TO Cluster membership
}

export interface KuzuLinksToRel {
  // Note TO Note hyperlinks
}

export interface KuzuMentionsRel {
  // Note TO Note mentions
}

export interface KuzuHasTagRel {
  // Note TO Tag tagging
}

export interface KuzuMentionedInRel {
  // Entity TO Note provenance
}

export interface KuzuSubjectOfRel {
  role?: string;  // "subject"
}

export interface KuzuObjectOfRel {
  role?: string;  // "object"
}

export interface KuzuGlobalTripleMemberRel {
  // Entity TO GlobalTriple membership
}

export interface KuzuCoOccursRel {
  count?: number;    // # notes they co-appear in
  notes?: string;    // JSON array of noteIds
}

export interface KuzuInThreadRel {
  // Thread TO ThreadMessage containment
}

export interface KuzuRepliesToRel {
  // ThreadMessage TO ThreadMessage threading
}

// Query Result Types
export interface KuzuQueryResult {
  rows: Record<string, any>[];
  columns: string[];
  statistics?: {
    nodesCreated?: number;
    relationshipsCreated?: number;
    propertiesSet?: number;
    executionTime?: number;
  };
}

// Schema Evolution Types
export interface KuzuSchemaVersion {
  version: string;
  timestamp: number;
  migrations: KuzuMigration[];
}

export interface KuzuMigration {
  id: string;
  description: string;
  up: string[];    // KuzuQL statements to apply
  down: string[];  // KuzuQL statements to rollback
}

// Sync Types for 1-to-1 mapping
export interface KuzuSyncElement {
  id: string;
  type: 'node' | 'edge';
  kuzuType: string;  // Table name in Kuzu
  data: Record<string, any>;
  lastSynced: number;
}

export interface KuzuSyncOperation {
  id: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  elementType: 'node' | 'edge';
  kuzuQuery: string;
  parameters: Record<string, any>;
  timestamp: number;
}

// LiveStore to Kuzu Mapping
export type LiveStoreToKuzuNodeMap = {
  'notes': KuzuNote;
  'clusters': KuzuCluster;
  'entities': KuzuEntity;
  'threads': KuzuThread;
  'thread_messages': KuzuThreadMessage;
};

export type LiveStoreToKuzuRelMap = {
  'note_hierarchy': KuzuContainsRel;
  'note_clusters': KuzuInClusterRel;
  'note_links': KuzuLinksToRel;
  'entity_mentions': KuzuMentionedInRel;
  'entity_cooccurrence': KuzuCoOccursRel;
};

// Utility types for type-safe operations
export type KuzuNodeType = keyof LiveStoreToKuzuNodeMap;
export type KuzuRelationType = keyof LiveStoreToKuzuRelMap;

export type AllKuzuNodes = 
  | KuzuNote 
  | KuzuCluster 
  | KuzuTag 
  | KuzuMention 
  | KuzuEntity 
  | KuzuGlobalTriple 
  | KuzuThread 
  | KuzuThreadMessage;

export type AllKuzuRels = 
  | KuzuContainsRel 
  | KuzuInClusterRel 
  | KuzuLinksToRel 
  | KuzuMentionsRel 
  | KuzuHasTagRel 
  | KuzuMentionedInRel 
  | KuzuSubjectOfRel 
  | KuzuObjectOfRel 
  | KuzuGlobalTripleMemberRel 
  | KuzuCoOccursRel 
  | KuzuInThreadRel 
  | KuzuRepliesToRel;
