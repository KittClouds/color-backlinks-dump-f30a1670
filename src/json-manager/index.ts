export { JSONManager, jsonManager } from './JSONManager';
export { JSONRegistry } from './JSONRegistry';
export * from './adapters';
export * from './schemas';
export * from './interfaces/UnifiedSerializable';

// Phase 4: Safety & Monitoring exports
export { JSONSafetyManager, jsonSafetyManager } from './SafetyManager';
export { AtomicJSONManager, atomicJSONManager } from './AtomicJSONManager';

export type { 
  JSONOperation, 
  SerializationAdapter, 
  JSONManagerOptions 
} from './JSONManager';

export type {
  JSONSchemaDefinition
} from './schemas';

export type {
  UnifiedSerializable
} from './interfaces/UnifiedSerializable';

// Safety & Monitoring types - import from correct modules
export type {
  JSONCorruptionReport,
  JSONBackupEntry,
  SafetyMetrics
} from './SafetyManager';

export type {
  AtomicOperation,
  BatchOperation
} from './AtomicJSONManager';

// Phase 5: Performance & Optimization exports
export { JSONPerformanceManager, jsonPerformanceManager, LazyJSONProxy } from './PerformanceManager';
export { EnhancedJSONManager, enhancedJSONManager } from './EnhancedJSONManager';

export type {
  CacheEntry,
  CompressionOptions,
  StreamingOptions,
  LazyLoadOptions,
  PerformanceMetrics
} from './PerformanceManager';

export type {
  EnhancedJSONManagerOptions
} from './EnhancedJSONManager';

// Convenience re-exports
export { 
  blockNoteAdapter, 
  cytoscapeAdapter, 
  entityAdapter, 
  noteAdapter,
  liveStoreAdapter,
  backwardCompatibilityAdapter 
} from './adapters';

export {
  jsonSchemaRegistry,
  blockNoteSchemaV1,
  entitySchemaV1,
  noteSchemaV1,
  cytoscapeSchemaV1,
  liveStoreSchemaV1
} from './schemas';

// Unified serialization exports
export { UnifiedSerializableBase } from '../serializable/UnifiedSerializable';
export { UnifiedNoteDocument } from '../serializable/UnifiedNoteDocument';
export { serializationAdapterRegistry } from './interfaces/UnifiedSerializable';
