
import { Block } from '@blocknote/core';
import { Entity, Triple } from './parsingUtils';

export interface DocumentConnections {
  tags: string[];
  mentions: string[];
  links: string[];
  backlinks: string[]; // Add backlinks to the interface
  entities: Entity[];
  triples: Triple[];
}

/**
 * Parse connections directly from BlockNote document structure
 * This eliminates the race condition by reading from canonical inline content specs
 */
export function parseNoteConnectionsFromDocument(blocks: Block[]): DocumentConnections {
  const connections: DocumentConnections = {
    tags: [],
    mentions: [],
    links: [],
    backlinks: [], // Initialize backlinks array
    entities: [],
    triples: []
  };

  const walkBlock = (block: Block) => {
    // Process block content
    if (block.content && Array.isArray(block.content)) {
      for (const item of block.content) {
        // Use type assertion to handle custom inline content
        const inlineItem = item as any;
        
        // Extract data from custom inline content specs
        switch (inlineItem.type) {
          case 'tag':
            if (inlineItem.props?.text) {
              connections.tags.push(inlineItem.props.text);
            }
            break;
            
          case 'mention':
            if (inlineItem.props?.text) {
              connections.mentions.push(inlineItem.props.text);
            }
            break;
            
          case 'wikilink':
            if (inlineItem.props?.text) {
              connections.links.push(inlineItem.props.text);
            }
            break;

          case 'backlink':
            if (inlineItem.props?.text) {
              connections.backlinks.push(inlineItem.props.text);
            }
            break;
            
          case 'entity':
            if (inlineItem.props?.kind && inlineItem.props?.label) {
              connections.entities.push({
                kind: inlineItem.props.kind,
                label: inlineItem.props.label,
                attributes: inlineItem.props.attributes ? JSON.parse(inlineItem.props.attributes) : undefined
              });
            }
            break;
            
          case 'triple':
            if (inlineItem.props?.subjectKind && inlineItem.props?.subjectLabel && 
                inlineItem.props?.predicate && inlineItem.props?.objectKind && inlineItem.props?.objectLabel) {
              connections.triples.push({
                subject: {
                  kind: inlineItem.props.subjectKind,
                  label: inlineItem.props.subjectLabel
                },
                predicate: inlineItem.props.predicate,
                object: {
                  kind: inlineItem.props.objectKind,
                  label: inlineItem.props.objectLabel
                }
              });
            }
            break;
            
          case 'text':
            // Fallback: still detect raw syntax in plain text for migration
            const text = inlineItem.text || '';
            
            // Extract raw tags
            const tagMatches = text.match(/#(\w+)/g);
            if (tagMatches) {
              tagMatches.forEach(match => {
                const tag = match.slice(1);
                if (!connections.tags.includes(tag)) {
                  connections.tags.push(tag);
                }
              });
            }
            
            // Extract raw mentions
            const mentionMatches = text.match(/@(\w+)/g);
            if (mentionMatches) {
              mentionMatches.forEach(match => {
                const mention = match.slice(1);
                if (!connections.mentions.includes(mention)) {
                  connections.mentions.push(mention);
                }
              });
            }
            
            // Extract raw wiki links
            const linkMatches = text.match(/\[\[\s*([^\]\s|][^\]|]*?)\s*(?:\|[^\]]*)?\]\]/g);
            if (linkMatches) {
              linkMatches.forEach(match => {
                const linkMatch = match.match(/\[\[\s*([^\]\s|][^\]|]*?)\s*(?:\|[^\]]*)?\]\]/);
                if (linkMatch) {
                  const link = linkMatch[1].trim();
                  if (!connections.links.includes(link)) {
                    connections.links.push(link);
                  }
                }
              });
            }

            // Extract raw backlinks
            const backlinkMatches = text.match(/<<\s*([^>\s|][^>|]*?)\s*(?:\|[^>]*)?>>/g);
            if (backlinkMatches) {
              backlinkMatches.forEach(match => {
                const backlinkMatch = match.match(/<<\s*([^>\s|][^>|]*?)\s*(?:\|[^>]*)?>>/);
                if (backlinkMatch) {
                  const backlink = backlinkMatch[1].trim();
                  if (!connections.backlinks.includes(backlink)) {
                    connections.backlinks.push(backlink);
                  }
                }
              });
            }
            break;
        }
      }
    }
    
    // Recursively process nested blocks
    if (block.children && Array.isArray(block.children)) {
      block.children.forEach(walkBlock);
    }
  };

  blocks.forEach(walkBlock);
  
  // Remove duplicates
  connections.tags = [...new Set(connections.tags)];
  connections.mentions = [...new Set(connections.mentions)];
  connections.links = [...new Set(connections.links)];
  connections.backlinks = [...new Set(connections.backlinks)];
  
  return connections;
}

/**
 * Check if a block contains any raw (unconverted) entity syntax
 */
export function hasRawEntitySyntax(block: Block): boolean {
  if (!block.content || !Array.isArray(block.content)) return false;
  
  for (const item of block.content) {
    const inlineItem = item as any;
    if (inlineItem.type === 'text' && inlineItem.text) {
      const text = inlineItem.text;
      // Check for any raw entity patterns
      if (
        /\[[\w]+\|[^\]]+\]/.test(text) ||           // Entity syntax
        /\[\[\s*[^\]]+\s*\]\]/.test(text) ||        // Wiki links
        /<<\s*[^>]+\s*>>/.test(text) ||             // Backlinks
        /#\w+/.test(text) ||                        // Tags
        /@\w+/.test(text) ||                        // Mentions
        /\[[\w]+\|[^\]]+\]\s*\([^)]+\)\s*\[[\w]+\|[^\]]+\]/.test(text) // Triples
      ) {
        return true;
      }
    }
  }
  
  return false;
}
