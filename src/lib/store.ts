// LiveStore-based state management
// This file now exports LiveStore queries and utilities instead of Jotai atoms

import { generateClusterId, generateNoteId, generateNodeId, TripleId, NoteId, ClusterId } from './utils/ids';
import { createParagraphBlock } from './utils/blockUtils';
import { Entity, Triple as ParsedTriple, NoteLink } from './utils/parsingUtils'; // NEW: Import NoteLink
import { Thread, ThreadMessage, ChatRole } from '../services/types';
import { SchemaDefinitions } from './schema';
import { EntityBlueprint, BlueprintStorage } from '@/types/blueprints';
import { Block } from '@blocknote/core';

// Re-export types and constants
export const STANDARD_ROOT_ID = 'standard_root';
export type NodeKind = 'NOTE' | 'FOLDER' | 'TAG' | 'MENTION' | 'CLUSTER' | 'CHARACTER' | 'LOCATION' | 'CONCEPT' | string;

export interface Cluster {
  id: ClusterId;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: NoteId;
  title: string;
  content: Block[];
  createdAt: string;
  updatedAt: string;
  parentId: NoteId | null;
  type: 'note' | 'folder';
  clusterId: ClusterId | null;
  path?: string;
  tags?: string[];
  mentions?: string[];
  concepts?: Array<{ type: string, name: string }>;
  entities?: Entity[];
  triples?: Triple[];
  outgoingLinks?: NoteLink[]; // NEW: Add outgoingLinks property
}

export interface Triple {
  id?: TripleId;
  subject: Entity;
  predicate: string;
  object: Entity;
}

export type { NoteId, ClusterId, TripleId, NoteLink }; // NEW: Export NoteLink type

// Re-export LiveStore queries and events
export { 
  clusters$,
  notes$,
  threads$,
  threadMessages$,
  blueprints$,
  uiState$,
  activeNoteId$,
  activeClusterId$,
  activeThreadId$,
  activeClusterNotes$,
  standardNotes$,
  activeNote$,
  activeThreadMessages$,
  noteConnections$,
  noteTagsMap$,
  noteMentionsMap$,
  noteLinksMap$,
  noteEntitiesMap$,
  noteTriplesMap$,
  activeNoteConnections$
} from '../livestore/queries';

export { events, tables, schema } from '../livestore/schema';

// Utility functions for backward compatibility
const getCurrentDate = () => new Date().toISOString();

export function createNote(parentId: string | null = null, clusterId: string | null = null) {
  const newId = generateNoteId();
  const now = getCurrentDate();
  
  const newNote: Note = {
    id: newId,
    title: 'Untitled Note',
    content: [],
    createdAt: now,
    updatedAt: now,
    parentId: parentId as NoteId | null,
    type: 'note',
    clusterId: clusterId as ClusterId | null,
    outgoingLinks: [] // NEW: Initialize with empty outgoingLinks
  };
  
  return { id: newId, note: newNote };
}

export function createFolder(parentId: string | null = null, clusterId: string | null = null) {
  const newId = generateNoteId();
  const now = getCurrentDate();
  
  const newFolder: Note = {
    id: newId,
    title: 'New Folder',
    content: [],
    createdAt: now,
    updatedAt: now,
    parentId: parentId as NoteId | null,
    type: 'folder',
    clusterId: clusterId as ClusterId | null,
    outgoingLinks: [] // NEW: Initialize with empty outgoingLinks
  };
  
  return { id: newId, note: newFolder };
}

export function createCluster(title: string) {
  const newId = generateClusterId();
  const now = getCurrentDate();
  
  const newCluster: Cluster = {
    id: newId,
    title,
    createdAt: now,
    updatedAt: now,
  };
  
  const folderId = generateNoteId();
  const rootFolder: Note = {
    id: folderId,
    title: 'Root Folder',
    content: [],
    createdAt: now,
    updatedAt: now,
    parentId: null,
    type: 'folder',
    clusterId: newId,
    outgoingLinks: [] // NEW: Initialize with empty outgoingLinks
  };
  
  return { 
    id: newId, 
    cluster: newCluster,
    rootFolder
  };
}

export function createThread(title: string = 'New Thread'): Thread {
  const now = getCurrentDate();
  return { id: generateNodeId(), title, createdAt: now, updatedAt: now };
}

export function createThreadMessage(
  threadId: string,
  role: ChatRole,
  content: string,
  parentId: string | null = null
): ThreadMessage {
  return { id: generateNodeId(), threadId, role, content, createdAt: getCurrentDate(), parentId };
}

export function deleteNote(notes: Note[], id: string): Note[] {
  const noteToDelete = notes.find(note => note.id === id);
  if (!noteToDelete) return notes;

  if (noteToDelete.type === 'folder') {
    const childrenIds = getAllChildrenIds(notes, id);
    return notes.filter(note => !childrenIds.includes(note.id) && note.id !== id);
  }

  return notes.filter(note => note.id !== id);
}

const getAllChildrenIds = (notes: Note[], folderId: string): string[] => {
  const children = notes.filter(note => note.parentId === folderId);
  const childrenIds = children.map(child => child.id);
  
  const folderChildren = children.filter(child => child.type === 'folder');
  const grandChildrenIds = folderChildren.flatMap(folder => getAllChildrenIds(notes, folder.id));
  
  return [...childrenIds, ...grandChildrenIds];
};

// Legacy atom references for backward compatibility
// These will be removed as components are updated to use LiveStore directly
export const notesAtom = null; // Replaced by notes$
export const activeNoteIdAtom = null; // Replaced by activeNoteId$
export const activeNoteAtom = null; // Replaced by activeNote$
export const clustersAtom = null; // Replaced by clusters$
export const activeClusterIdAtom = null; // Replaced by activeClusterId$
export const noteTagsMapAtom = null; // Replaced by noteTagsMap$
export const noteMentionsMapAtom = null; // Replaced by noteMentionsMap$
export const noteLinksMapAtom = null; // Replaced by noteLinksMap$
export const noteEntitiesMapAtom = null; // Replaced by noteEntitiesMap$
export const noteTriplesMapAtom = null; // Replaced by noteTriplesMap$
export const activeNoteConnectionsAtom = null; // Replaced by activeNoteConnections$
export const threadsAtom = null; // Replaced by threads$
export const activeThreadIdAtom = null; // Replaced by activeThreadId$
export const threadMessagesAtom = null; // Replaced by threadMessages$
export const activeThreadMessagesAtom = null; // Replaced by activeThreadMessages$
export const graphInitializedAtom = null; // Moved to uiState$
export const graphLayoutAtom = null; // Moved to uiState$
export const schemaAtom = null; // Will be handled differently
export const blueprintStorageAtom = null; // Replaced by blueprints$
export const blueprintsAtom = null; // Replaced by blueprints$

// Helper functions
export const getNotesByClusterId = (notes: Note[], clusterId: string | null): Note[] => {
  return notes.filter(note => note.clusterId === clusterId);
};

export const getRootNotesByClusterId = (notes: Note[], clusterId: string | null): Note[] => {
  return notes.filter(note => note.clusterId === clusterId && note.parentId === null);
};

export const getStandardNotes = (notes: Note[]): Note[] => {
  return notes.filter(note => note.clusterId === null);
};

export const getRootStandardNotes = (notes: Note[]): Note[] => {
  return notes.filter(note => note.clusterId === null && note.parentId === null);
};

export const setActiveNoteId = (id: string) => {
  return id;
};
