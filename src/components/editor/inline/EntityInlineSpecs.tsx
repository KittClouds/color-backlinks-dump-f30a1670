
import React from 'react';
import { createReactInlineContentSpec } from '@blocknote/react';
import { useAtomValue } from 'jotai';
import { getEntityColor, entityColorPreferencesAtom } from '@/lib/entityColors';

// Enhanced Tag inline component with full data
const TagInline = ({ inlineContent }: { inlineContent: any }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold border bg-blue-500/20 text-blue-400 border-blue-500/30 cursor-pointer hover:opacity-80 transition-opacity`}>
    #{inlineContent.props.text}
  </span>
);

// Enhanced Mention inline component with full data
const MentionInline = ({ inlineContent }: { inlineContent: any }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold border bg-green-500/20 text-green-400 border-green-500/30 cursor-pointer hover:opacity-80 transition-opacity`}>
    @{inlineContent.props.text}
  </span>
);

// Enhanced Wiki link inline component with full data
const WikiLinkInline = ({ inlineContent }: { inlineContent: any }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold border bg-purple-500/20 text-purple-400 border-purple-500/30 cursor-pointer hover:opacity-80 transition-opacity`}>
    {inlineContent.props.text}
  </span>
);

// NEW: Backlink inline component
const BacklinkInline = ({ inlineContent }: { inlineContent: any }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold border bg-orange-500/20 text-orange-400 border-orange-500/30 cursor-pointer hover:opacity-80 transition-opacity`}>
    &lt;&lt;{inlineContent.props.text}&gt;&gt;
  </span>
);

// Enhanced Entity inline component with kind-based coloring
const EntityInline = ({ inlineContent }: { inlineContent: any }) => {
  const userPreferences = useAtomValue(entityColorPreferencesAtom);
  const { kind, label, attributes, originalSyntax } = inlineContent.props;
  
  const colorClasses = getEntityColor(kind, userPreferences);
  
  return (
    <span 
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold border ${colorClasses} cursor-pointer hover:opacity-80 transition-opacity`}
      data-entity-kind={kind}
      data-entity-label={label}
      data-original-syntax={originalSyntax}
    >
      <span className="text-xs opacity-70">{kind}</span>
      {label}
    </span>
  );
};

// Enhanced Triple inline component with kind-based coloring for both entities
const TripleInline = ({ inlineContent }: { inlineContent: any }) => {
  const userPreferences = useAtomValue(entityColorPreferencesAtom);
  const { subjectKind, subjectLabel, predicate, objectKind, objectLabel, originalSyntax } = inlineContent.props;
  
  const subjectColorClasses = getEntityColor(subjectKind, userPreferences);
  const objectColorClasses = getEntityColor(objectKind, userPreferences);
  
  return (
    <span 
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold border bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-400 border-pink-500/30 cursor-pointer hover:opacity-80 transition-opacity`}
      data-triple-subject={`${subjectKind}:${subjectLabel}`}
      data-triple-predicate={predicate}
      data-triple-object={`${objectKind}:${objectLabel}`}
      data-original-syntax={originalSyntax}
    >
      <span className={`opacity-70 px-1 rounded ${subjectColorClasses.split(' ').slice(0, 1)}`}>{subjectKind}</span>
      <span className={subjectColorClasses.split(' ').slice(1, 2).join(' ')}>{subjectLabel}</span>
      <span className="opacity-60 mx-1">({predicate})</span>
      <span className={`opacity-70 px-1 rounded ${objectColorClasses.split(' ').slice(0, 1)}`}>{objectKind}</span>
      <span className={objectColorClasses.split(' ').slice(1, 2).join(' ')}>{objectLabel}</span>
    </span>
  );
};

// Create enhanced custom inline content specs with rich metadata
export const TagInlineSpec = createReactInlineContentSpec(
  {
    type: "tag",
    propSchema: {
      text: { default: "" },
      originalSyntax: { default: "" }
    },
    content: "none"
  },
  {
    render: TagInline
  }
);

export const MentionInlineSpec = createReactInlineContentSpec(
  {
    type: "mention", 
    propSchema: {
      text: { default: "" },
      originalSyntax: { default: "" }
    },
    content: "none"
  },
  {
    render: MentionInline
  }
);

export const WikiLinkInlineSpec = createReactInlineContentSpec(
  {
    type: "wikilink",
    propSchema: {
      text: { default: "" },
      originalSyntax: { default: "" }
    },
    content: "none"
  },
  {
    render: WikiLinkInline
  }
);

// NEW: Backlink inline spec
export const BacklinkInlineSpec = createReactInlineContentSpec(
  {
    type: "backlink",
    propSchema: {
      text: { default: "" },
      originalSyntax: { default: "" }
    },
    content: "none"
  },
  {
    render: BacklinkInline
  }
);

export const EntityInlineSpec = createReactInlineContentSpec(
  {
    type: "entity",
    propSchema: {
      kind: { default: "" },
      label: { default: "" },
      attributes: { default: "{}" },
      originalSyntax: { default: "" }
    },
    content: "none"
  },
  {
    render: EntityInline
  }
);

export const TripleInlineSpec = createReactInlineContentSpec(
  {
    type: "triple",
    propSchema: {
      subjectKind: { default: "" },
      subjectLabel: { default: "" },
      predicate: { default: "" },
      objectKind: { default: "" },
      objectLabel: { default: "" },
      originalSyntax: { default: "" }
    },
    content: "none"
  },
  {
    render: TripleInline
  }
);
