
import { BlockNoteSchema, defaultInlineContentSpecs } from "@blocknote/core";
import { 
  TagInlineSpec, 
  MentionInlineSpec, 
  WikiLinkInlineSpec, 
  BacklinkInlineSpec, // NEW
  EntityInlineSpec, 
  TripleInlineSpec 
} from '../../components/editor/inline/EntityInlineSpecs';

// Create schema with custom inline content specs for entity highlighting
export const entityEditorSchema = BlockNoteSchema.create({
  inlineContentSpecs: {
    // Include default specs
    ...defaultInlineContentSpecs,
    // Add our custom specs
    tag: TagInlineSpec,
    mention: MentionInlineSpec,
    wikilink: WikiLinkInlineSpec,
    backlink: BacklinkInlineSpec, // NEW
    entity: EntityInlineSpec,
    triple: TripleInlineSpec
  }
});
