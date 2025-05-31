
import kuzuWasm from "@kuzu/kuzu-wasm";

/** Bootstraps – returns { kuzu, db, conn } ready for use */
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

    // 🔧  Place any one-time schema here – runs harmlessly if tables exist
    // await conn.execute(`CREATE NODE TABLE IF NOT EXISTS User(name STRING, PRIMARY KEY(name))`);

    // 5 · Flush pending writes whenever the tab is closed / refreshed
    const flush = () => kuzu.FS.syncfs(false, err => {
      if (err) console.error("Kùzu sync-error:", err);
    });
    window.addEventListener("beforeunload", flush);

    return { kuzu, db, conn };
  } catch (error) {
    console.error("Failed to initialize Kùzu:", error);
    throw error;
  }
}
