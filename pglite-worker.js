import { PGlite } from "https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.4/dist/index.js";
import { worker } from "https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.5.4/dist/worker/index.js";

worker({
  /**
   * Starts the leader-tab PGlite instance with the options from PGliteWorker.
   * @param {{ dataDir?: string; loadDataDir?: Blob | File }} options
   */
  async init(options) {
    return new PGlite({
      dataDir: options.dataDir,
      loadDataDir: options.loadDataDir,
    });
  },
});
