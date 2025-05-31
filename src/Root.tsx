
import React from 'react';
import { makePersistedAdapter } from '@livestore/adapter-web';
import LiveStoreSharedWorker from '@livestore/adapter-web/shared-worker?sharedworker';
import { LiveStoreProvider } from '@livestore/react';
import { batchUpdates, getBatchingInfo } from './utils/reactCompat';
import App from './App';
import LiveStoreWorker from './livestore/livestore.worker?worker';
import { schema } from './livestore/schema';

const storeId = 'galaxy-notes-store';

const adapter = makePersistedAdapter({
  storage: { type: 'opfs' },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

// Log batching info for debugging
console.log('[Root] Batching configuration:', getBatchingInfo());

export const Root: React.FC = () => (
  <LiveStoreProvider
    schema={schema}
    adapter={adapter}
    renderLoading={(stage) => (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <div>Loading LiveStore ({stage.stage})...</div>
        </div>
      </div>
    )}
    batchUpdates={batchUpdates}
    storeId={storeId}
  >
    <App />
  </LiveStoreProvider>
);
