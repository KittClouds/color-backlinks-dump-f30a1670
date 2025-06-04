
import { BlockNoteSchema } from "@blocknote/core";
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
    tag: TagInlineSpec,
    mention: MentionInlineSpec,
    wikilink: WikiLinkInlineSpec,
    backlink: BacklinkInlineSpec, // NEW
    entity: EntityInlineSpec,
    triple: TripleInlineSpec
  }
});
