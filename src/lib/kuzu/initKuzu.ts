
import kuzuWasm from "kuzu-wasm";
import { KuzuSchemaManager } from './KuzuSchemaManager';

/** Bootstraps – returns { kuzu, db, conn, schemaManager } ready for use */
export async function initKuzu() {
  try {
    // 1 · Load WASM & point to worker
    kuzuWasm.setWorkerPath("/js/kuzu_wasm_worker.js");      // adjust path as needed
    const kuzu = await kuzuWasm();                          // spins up WASM + FS

    // 2 · Mount an IDB-backed folder so /kuzu persists
    if (!kuzu.FS.analyzePath("/kuzu").exists) {
      kuzu.FS.mkdir("/kuzu");                               // first run only
    }
    kuzu.FS.mount(kuzu.IDBFS, {}, "/kuzu");

    // 3 · Pull any existing DB file from IndexedDB
    await new Promise<void>((res, rej) =>
      kuzu.FS.syncfs(true, err => (err ? rej(err) : res()))
    );

    // 4 · Create (or open) the on-disk database
    //     You now have a *persistent* graph that survives reloads
    const db   = new kuzu.Database("/kuzu/main.kuzu");
    const conn = new kuzu.Connection(db);

    // 5 · Initialize schema with the complete DDL scaffold
    console.log('initKuzu: Initializing schema...');
    const schemaManager = new KuzuSchemaManager(conn);
    await schemaManager.initializeSchema();
    
    // Validate schema was created properly
    const validation = await schemaManager.validateSchema();
    if (!validation.isValid) {
      console.warn('initKuzu: Schema validation warnings:', validation.errors);
    } else {
      console.log('initKuzu: Schema validation passed');
    }

    // Optional: Enable vector extension if available
    try {
      await schemaManager.enableVectorExtension();
    } catch (error) {
      console.log('initKuzu: Vector extension not available, continuing without it');
    }

    // 6 · Flush pending writes whenever the tab is closed / refreshed
    const flush = () => kuzu.FS.syncfs(false, err => {
      if (err) console.error("Kùzu sync-error:", err);
    });
    window.addEventListener("beforeunload", flush);

    console.log('initKuzu: Complete graph database with schema ready');
    
    return { kuzu, db, conn, schemaManager };
  } catch (error) {
    console.error("Failed to initialize Kùzu:", error);
    throw error;
  }
}
