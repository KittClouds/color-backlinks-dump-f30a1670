
import { Block, InlineContent } from '@blocknote/core';
import { Note } from '../store'; // Use Note instead of NoteId

// Regex for tags (#alphanumeric), mentions (@alphanumeric), and links ([[any character except ]]])
const TAG_REGEX = /#([a-zA-Z0-9_]+)/g;
const MENTION_REGEX = /@([a-zA-Z0-9_]+)/g;
// Updated regex to handle potential spaces but capture the core title
const LINK_REGEX = /\[\[\s*([^\]\s|][^\]|]*?)\s*(?:\|[^\]]*)?\]\]/g; // Capture from `[[Title]]` or `[[Title|Alias]]`

// New regex patterns for entities and triples
// Updated to potentially capture attributes in JSON format after the label
const ENTITY_REGEX = /\[([A-Za-z0-9_]+)\|([^\]]+?)(?:\|({.*?}))?\]/g;
const TRIPLE_REGEX = /\[([A-Za-z0-9_]+)\|([^\]]+?)(?:\|({.*?}))?\]\s*\(([A-Za-z0-9_]+)\)\s*\[([A-Za-z0-9_]+)\|([^\]]+?)(?:\|({.*?}))?\]/g;

export interface Entity {
  kind: string;
  label: string;
  attributes?: Record<string, any>;
}

export interface Triple {
  id?: string;  // Add the optional id field to match with store.ts Triple interface
  subject: Entity;
  predicate: string;
  object: Entity;
}

export interface NoteLink {
  targetTitle: string;
  resolvedTargetId?: string;
}

export interface ParsedConnections {
  tags: string[];
  mentions: string[];
  links: string[]; // Stores link titles
  entities: Entity[];
  triples: Triple[];
  outgoingLinks: NoteLink[]; // NEW: For LiveStore integration
}

// Helper to extract text from InlineContent[]
function extractTextFromInlineContent(content: InlineContent<any, any>[]): string {
  return content.map(item => {
    if (item.type === 'text') {
      // For StyledText type
      return 'text' in item ? item.text : '';
    } else if (item.type === 'link') {
      // For Link type - extract text from link content if it exists
      return 'content' in item && Array.isArray(item.content) 
        ? extractTextFromInlineContent(item.content) 
        : '';
    }
    // Add other inline types if necessary
    return '';
  }).join('');
}

// Helper to extract text from a Block and its children recursively
function extractTextFromBlock(block: Block): string {
    let blockText = '';
    if (block.content) {
        if (Array.isArray(block.content)) {
            blockText += extractTextFromInlineContent(block.content);
        }
    }
    // Recursively process children blocks (like list items)
    if (block.children && block.children.length > 0) {
        for (const child of block.children) {
            blockText += '\n' + extractTextFromBlock(child);
        }
    }
    return blockText;
}

// Helper to parse JSON attributes string safely
function parseAttributesJSON(jsonStr: string | undefined): Record<string, any> | undefined {
  if (!jsonStr) return undefined;
  
  try {
    // Replace single quotes with double quotes for valid JSON
    const normalizedJson = jsonStr.replace(/'/g, '"');
    return JSON.parse(normalizedJson);
  } catch (e) {
    console.warn(`Failed to parse entity attributes: ${jsonStr}`);
    return undefined;
  }
}

// Convert tags to CONCEPT entities for unified entity promotion
function promoteTagsToEntities(tags: string[]): Entity[] {
  return tags.map(tag => ({
    kind: 'CONCEPT',
    label: tag
  }));
}

// Convert mentions to MENTION entities for unified entity promotion
function promoteMentionsToEntities(mentions: string[]): Entity[] {
  return mentions.map(mention => ({
    kind: 'MENTION',
    label: mention
  }));
}

// NEW: Function to resolve link targets against a collection of notes
export function resolveLinks(outgoingLinks: NoteLink[], allNotes: Note[]): NoteLink[] {
  return outgoingLinks.map(link => {
    // Try to find a note with matching title
    const targetNote = allNotes.find(note => note.title === link.targetTitle);
    
    return {
      targetTitle: link.targetTitle,
      resolvedTargetId: targetNote ? targetNote.id : undefined
    };
  });
}

export function parseNoteConnections(blocks: Block[] | undefined): ParsedConnections {
  const connections: ParsedConnections = { 
    tags: [], 
    mentions: [], 
    links: [], 
    entities: [], 
    triples: [],
    outgoingLinks: [] // NEW
  };
  if (!blocks) return connections;

  let fullText = '';
  for (const block of blocks) {
    fullText += extractTextFromBlock(block) + '\n';
  }

  let match;
  const uniqueTags = new Set<string>();
  const uniqueMentions = new Set<string>();
  const uniqueLinks = new Set<string>();
  const uniqueOutgoingLinks = new Map<string, NoteLink>(); // NEW: Use Map to deduplicate by targetTitle
  const uniqueEntities = new Map<string, Entity>(); // Use Map to deduplicate by kind+label
  const triples: Triple[] = [];

  // Extract tags
  while ((match = TAG_REGEX.exec(fullText)) !== null) {
    uniqueTags.add(match[1]);
  }

  // Extract mentions
  while ((match = MENTION_REGEX.exec(fullText)) !== null) {
     uniqueMentions.add(match[1]);
  }

  // Extract links and create outgoingLinks
  while ((match = LINK_REGEX.exec(fullText)) !== null) {
    const linkTitle = match[1].trim(); // Capture group 1 is the title
    if (linkTitle) {
        uniqueLinks.add(linkTitle);
        // NEW: Create outgoing link entry
        uniqueOutgoingLinks.set(linkTitle, {
          targetTitle: linkTitle,
          resolvedTargetId: undefined // Will be resolved later when all notes are available
        });
    }
  }
  
  // First extract triples (to avoid double-matching the entities in triples)
  const processedTripleRanges: [number, number][] = [];
  
  // Process triples
  while ((match = TRIPLE_REGEX.exec(fullText)) !== null) {
    const [fullMatch, subjectKind, subjectLabel, subjectAttrs, predicate, objectKind, objectLabel, objectAttrs] = match;
    const matchStart = match.index;
    const matchEnd = matchStart + fullMatch.length;
    
    // Store this range as processed
    processedTripleRanges.push([matchStart, matchEnd]);
    
    const subject: Entity = { 
      kind: subjectKind, 
      label: subjectLabel,
      attributes: parseAttributesJSON(subjectAttrs)
    };
    
    const object: Entity = { 
      kind: objectKind, 
      label: objectLabel,
      attributes: parseAttributesJSON(objectAttrs)
    };
    
    // Add a full triple
    triples.push({
      subject,
      predicate,
      object
    });
    
    // Also add the entities from this triple
    const subjectKey = `${subjectKind}|${subjectLabel}`;
    const objectKey = `${objectKind}|${objectLabel}`;
    uniqueEntities.set(subjectKey, subject);
    uniqueEntities.set(objectKey, object);
  }
  
  // Now process standalone entities, checking they don't overlap with triples
  while ((match = ENTITY_REGEX.exec(fullText)) !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    
    // Check if this entity is already part of a triple
    const isPartOfTriple = processedTripleRanges.some(
      ([start, end]) => matchStart >= start && matchEnd <= end
    );
    
    if (!isPartOfTriple) {
      const [, kind, label, attrsJSON] = match;
      const entity: Entity = { 
        kind, 
        label,
        attributes: parseAttributesJSON(attrsJSON)
      };
      const entityKey = `${kind}|${label}`;
      uniqueEntities.set(entityKey, entity);
    }
  }

  connections.tags = Array.from(uniqueTags);
  connections.mentions = Array.from(uniqueMentions);
  connections.links = Array.from(uniqueLinks);
  connections.outgoingLinks = Array.from(uniqueOutgoingLinks.values()); // NEW
  
  // Unified entity promotion: combine explicit entities with promoted tags/mentions
  const allEntities = new Map<string, Entity>();
  
  // Add explicit entities
  Array.from(uniqueEntities.values()).forEach(entity => {
    const key = `${entity.kind}|${entity.label}`;
    allEntities.set(key, entity);
  });
  
  // Promote tags to CONCEPT entities
  promoteTagsToEntities(connections.tags).forEach(entity => {
    const key = `${entity.kind}|${entity.label}`;
    allEntities.set(key, entity);
  });
  
  // Promote mentions to MENTION entities
  promoteMentionsToEntities(connections.mentions).forEach(entity => {
    const key = `${entity.kind}|${entity.label}`;
    allEntities.set(key, entity);
  });
  
  connections.entities = Array.from(allEntities.values());
  connections.triples = triples;

  return connections;
}

// Function to parse all notes and return maps
export function parseAllNotes(notes: Note[]): {
  tagsMap: Map<string, string[]>;
  mentionsMap: Map<string, string[]>;
  linksMap: Map<string, string[]>; // Map note ID to link *titles*
  entitiesMap: Map<string, Entity[]>; // Map note ID to entities
  triplesMap: Map<string, Triple[]>; // Map note ID to triples
} {
  const tagsMap = new Map<string, string[]>();
  const mentionsMap = new Map<string, string[]>();
  const linksMap = new Map<string, string[]>();
  const entitiesMap = new Map<string, Entity[]>();
  const triplesMap = new Map<string, Triple[]>();

  notes.forEach(note => {
    // Only parse actual notes; folders/other types get empty arrays
    if (note.type === 'note') {
        const { tags, mentions, links, entities, triples } = parseNoteConnections(note.content);
        tagsMap.set(note.id, tags);
        mentionsMap.set(note.id, mentions);
        linksMap.set(note.id, links);
        entitiesMap.set(note.id, entities);
        triplesMap.set(note.id, triples);
    } else {
        tagsMap.set(note.id, []);
        mentionsMap.set(note.id, []);
        linksMap.set(note.id, []);
        entitiesMap.set(note.id, []);
        triplesMap.set(note.id, []);
    }
  });

  return { tagsMap, mentionsMap, linksMap, entitiesMap, triplesMap };
}

// NEW: Function specifically for extracting and resolving outgoing links from a note
export function parseAndResolveNoteLinks(note: Note, allNotes: Note[]): NoteLink[] {
  if (note.type !== 'note') return [];
  
  const { outgoingLinks } = parseNoteConnections(note.content);
  return resolveLinks(outgoingLinks, allNotes);
}
