
/**
 * TypeScript interfaces for Kuzu WASM types
 */

export interface KuzuFS {
  analyzePath(path: string): { exists: boolean };
  mkdir(path: string): void;
  mount(type: any, options: any, path: string): void;
  syncfs(populate: boolean, callback: (err: any) => void): void;
}

export interface Kuzu {
  FS: KuzuFS;
  IDBFS: any;
  Database: new (path: string) => KuzuDatabase;
  Connection: new (db: KuzuDatabase) => KuzuConnection;
}

export interface KuzuDatabase {
  close(): Promise<void>;
}

export interface KuzuConnection {
  query(statement: string): Promise<KuzuQueryResult>;
  prepare(statement: string): Promise<KuzuPreparedStatement>;
  execute(prepared: KuzuPreparedStatement, params: Record<string, any>): Promise<KuzuQueryResult>;
  close(): Promise<void>;
}

export interface KuzuPreparedStatement {
  close(): Promise<void>;
}

export interface KuzuQueryResult {
  getAllRows(): Promise<any[][]>;
  getAllObjects(): Promise<Record<string, any>[]>;
  getColumnTypes(): Promise<string[]>;
  getColumnNames(): Promise<string[]>;
  hasNextQueryResult(): boolean;
  getNextQueryResult(): Promise<KuzuQueryResult>;
  close(): Promise<void>;
}

export interface KuzuTableInfo {
  name: string;
  type: 'NODE' | 'REL';
}
