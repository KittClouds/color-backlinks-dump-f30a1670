import {
  Events,
  makeSchema,
  Schema,
  SessionIdSymbol,
  State
} from '@livestore/livestore';

// Define SQLite tables for our app state
export const tables = {
  clusters: State.SQLite.table({
    name: 'clusters',
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      title: State.SQLite.text(),
      createdAt: State.SQLite.text(),
      updatedAt: State.SQLite.text()
    }
  }),

  notes: State.SQLite.table({
    name: 'notes',
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      parentId: State.SQLite.text({ nullable: true }),
      clusterId: State.SQLite.text({ nullable: true }),
      title: State.SQLite.text(),
      content: State.SQLite.json({ schema: Schema.Array(Schema.Any) }),
      type: State.SQLite.text({ default: 'note' }),
      createdAt: State.SQLite.text(),
      updatedAt: State.SQLite.text(),
      path: State.SQLite.text({ nullable: true }),
      tags: State.SQLite.json({ schema: Schema.Array(Schema.String), nullable: true }),
      mentions: State.SQLite.json({ schema: Schema.Array(Schema.String), nullable: true }),
      outgoingLinks: State.SQLite.json({ 
        schema: Schema.Array(Schema.Struct({
          targetTitle: Schema.String,
          resolvedTargetId: Schema.NullOr(Schema.String)
        })), 
        nullable: true 
      })
    }
  }),

  threads: State.SQLite.table({
    name: 'threads',
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      title: State.SQLite.text(),
      createdAt: State.SQLite.text(),
      updatedAt: State.SQLite.text()
    }
  }),

  threadMessages: State.SQLite.table({
    name: 'threadMessages',
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      threadId: State.SQLite.text(),
      role: State.SQLite.text(),
      content: State.SQLite.text(),
      createdAt: State.SQLite.text(),
      parentId: State.SQLite.text({ nullable: true })
    }
  }),

  entityAttributes: State.SQLite.table({
    name: 'entityAttributes',
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      entityKind: State.SQLite.text(),
      entityLabel: State.SQLite.text(),
      attributes: State.SQLite.json({ schema: Schema.Any }),
      metadata: State.SQLite.json({ schema: Schema.Any })
    }
  }),

  blueprints: State.SQLite.table({
    name: 'blueprints',
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      entityKind: State.SQLite.text(),
      name: State.SQLite.text(),
      description: State.SQLite.text({ nullable: true }),
      templates: State.SQLite.json({ schema: Schema.Array(Schema.Any) }),
      isDefault: State.SQLite.boolean({ default: false }),
      createdAt: State.SQLite.text(),
      updatedAt: State.SQLite.text()
    }
  }),

  // Client-only UI state (like atoms, doesn't sync)
  uiState: State.SQLite.clientDocument({
    name: 'uiState',
    schema: Schema.Struct({
      activeNoteId: Schema.NullOr(Schema.String),
      activeClusterId: Schema.String,
      activeThreadId: Schema.NullOr(Schema.String),
      graphInitialized: Schema.Boolean,
      graphLayout: Schema.String
    }),
    default: { 
      id: SessionIdSymbol, 
      value: { 
        activeNoteId: null,
        activeClusterId: 'cluster-default',
        activeThreadId: null,
        graphInitialized: false,
        graphLayout: 'dagre'
      } 
    }
  })
};

// Define events for state changes
export const events = {
  // Cluster events
  clusterCreated: Events.synced({
    name: 'v1.ClusterCreated',
    schema: Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      createdAt: Schema.String,
      updatedAt: Schema.String
    })
  }),

  clusterUpdated: Events.synced({
    name: 'v1.ClusterUpdated',
    schema: Schema.Struct({
      id: Schema.String,
      updates: Schema.Any,
      updatedAt: Schema.String
    })
  }),

  clusterDeleted: Events.synced({
    name: 'v1.ClusterDeleted',
    schema: Schema.Struct({
      id: Schema.String
    })
  }),

  // Note events
  noteCreated: Events.synced({
    name: 'v1.NoteCreated',
    schema: Schema.Struct({
      id: Schema.String,
      parentId: Schema.NullOr(Schema.String),
      clusterId: Schema.NullOr(Schema.String),
      title: Schema.String,
      content: Schema.Array(Schema.Any),
      type: Schema.String,
      createdAt: Schema.String,
      updatedAt: Schema.String,
      path: Schema.NullOr(Schema.String),
      tags: Schema.NullOr(Schema.Array(Schema.String)),
      mentions: Schema.NullOr(Schema.Array(Schema.String)),
      outgoingLinks: Schema.NullOr(Schema.Array(Schema.Struct({
        targetTitle: Schema.String,
        resolvedTargetId: Schema.NullOr(Schema.String)
      })))
    })
  }),

  noteUpdated: Events.synced({
    name: 'v1.NoteUpdated',
    schema: Schema.Struct({
      id: Schema.String,
      updates: Schema.Any,
      updatedAt: Schema.String
    })
  }),

  noteDeleted: Events.synced({
    name: 'v1.NoteDeleted',
    schema: Schema.Struct({
      id: Schema.String
    })
  }),

  // Thread events
  threadCreated: Events.synced({
    name: 'v1.ThreadCreated',
    schema: Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      createdAt: Schema.String,
      updatedAt: Schema.String
    })
  }),

  threadMessageCreated: Events.synced({
    name: 'v1.ThreadMessageCreated',
    schema: Schema.Struct({
      id: Schema.String,
      threadId: Schema.String,
      role: Schema.String,
      content: Schema.String,
      createdAt: Schema.String,
      parentId: Schema.NullOr(Schema.String)
    })
  }),

  threadMessageUpdated: Events.synced({
    name: 'v1.ThreadMessageUpdated',
    schema: Schema.Struct({
      id: Schema.String,
      updates: Schema.Any
    })
  }),

  threadMessageDeleted: Events.synced({
    name: 'v1.ThreadMessageDeleted',
    schema: Schema.Struct({
      id: Schema.String
    })
  }),

  // Entity attributes events
  entityAttributesUpdated: Events.synced({
    name: 'v1.EntityAttributesUpdated',
    schema: Schema.Struct({
      id: Schema.String,
      entityKind: Schema.String,
      entityLabel: Schema.String,
      attributes: Schema.Any,
      metadata: Schema.Any
    })
  }),

  // Blueprint events
  blueprintCreated: Events.synced({
    name: 'v1.BlueprintCreated',
    schema: Schema.Struct({
      id: Schema.String,
      entityKind: Schema.String,
      name: Schema.String,
      description: Schema.NullOr(Schema.String),
      templates: Schema.Array(Schema.Any),
      isDefault: Schema.Boolean,
      createdAt: Schema.String,
      updatedAt: Schema.String
    })
  }),

  blueprintUpdated: Events.synced({
    name: 'v1.BlueprintUpdated',
    schema: Schema.Struct({
      id: Schema.String,
      updates: Schema.Any,
      updatedAt: Schema.String
    })
  }),

  // UI state events (client-only)
  uiStateSet: tables.uiState.set
};

// Materializers transform events into SQL operations
const materializers = State.SQLite.materializers(events, {
  'v1.ClusterCreated': ({ id, title, createdAt, updatedAt }) =>
    tables.clusters.insert({ id, title, createdAt, updatedAt }),

  'v1.ClusterUpdated': ({ id, updates, updatedAt }) =>
    tables.clusters.update({ ...updates, updatedAt }).where({ id }),

  'v1.ClusterDeleted': ({ id }) =>
    tables.clusters.delete().where({ id }),

  'v1.NoteCreated': ({ id, parentId, clusterId, title, content, type, createdAt, updatedAt, path, tags, mentions, outgoingLinks }) =>
    tables.notes.insert({ id, parentId, clusterId, title, content, type, createdAt, updatedAt, path, tags, mentions, outgoingLinks }),

  'v1.NoteUpdated': ({ id, updates, updatedAt }) =>
    tables.notes.update({ ...updates, updatedAt }).where({ id }),

  'v1.NoteDeleted': ({ id }) =>
    tables.notes.delete().where({ id }),

  'v1.ThreadCreated': ({ id, title, createdAt, updatedAt }) =>
    tables.threads.insert({ id, title, createdAt, updatedAt }),

  'v1.ThreadMessageCreated': ({ id, threadId, role, content, createdAt, parentId }) =>
    tables.threadMessages.insert({ id, threadId, role, content, createdAt, parentId }),

  'v1.ThreadMessageUpdated': ({ id, updates }) =>
    tables.threadMessages.update(updates).where({ id }),

  'v1.ThreadMessageDeleted': ({ id }) =>
    tables.threadMessages.delete().where({ id }),

  'v1.EntityAttributesUpdated': ({ id, entityKind, entityLabel, attributes, metadata }) => [
    tables.entityAttributes.insert({ id, entityKind, entityLabel, attributes, metadata }),
    tables.entityAttributes.update({ attributes, metadata }).where({ id })
  ],

  'v1.BlueprintCreated': ({ id, entityKind, name, description, templates, isDefault, createdAt, updatedAt }) =>
    tables.blueprints.insert({ id, entityKind, name, description, templates, isDefault, createdAt, updatedAt }),

  'v1.BlueprintUpdated': ({ id, updates, updatedAt }) =>
    tables.blueprints.update({ ...updates, updatedAt }).where({ id })
});

// Create the state with tables and materializers
const state = State.SQLite.makeState({ tables, materializers });

// Export the complete schema
export const schema = makeSchema({ events, state });
