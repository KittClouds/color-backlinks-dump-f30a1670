
import { useState, useEffect } from 'react';
import kuzuService from '@/lib/kuzu/KuzuService';
import { KuzuSchemaManager } from '@/lib/kuzu/KuzuSchemaManager';

interface KuzuInstance {
  kuzu: any;
  db: any;
  conn: any;
  schemaManager: KuzuSchemaManager;
}

export function useKuzu() {
  const [kuzuInstance, setKuzuInstance] = useState<KuzuInstance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Initialize via unified service
        await kuzuService.init();
        
        if (mounted) {
          // Get components for compatibility
          const db = await kuzuService.getDb();
          const schemaManager = await kuzuService.getSchemaManager();
          const kuzu = (kuzuService as any).kuzu;
          const conn = new kuzu.Connection(db);
          
          setKuzuInstance({
            kuzu,
            db,
            conn,
            schemaManager
          });
          console.log('Kuzu initialized successfully with schema via KuzuService');
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
          console.error('Failed to initialize Kuzu:', err);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    kuzu: kuzuInstance?.kuzu,
    db: kuzuInstance?.db,
    conn: kuzuInstance?.conn,
    schemaManager: kuzuInstance?.schemaManager,
    isLoading,
    error,
    isReady: !!kuzuInstance && !isLoading && !error
  };
}
