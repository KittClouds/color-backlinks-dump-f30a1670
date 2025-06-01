
import { useState, useEffect } from 'react';
import { initKuzu } from '@/lib/kuzu/initKuzu';
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
        
        const instance = await initKuzu();
        
        if (mounted) {
          setKuzuInstance(instance);
          console.log('Kuzu initialized successfully with schema');
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
