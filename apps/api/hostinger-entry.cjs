"use strict";

// Hostinger lsnode loads the entry with require(); our app is ESM.
// This .cjs shim bridges CJS → dynamic import of the real server.
import("./dist/server.js").catch((err) => {
  console.error(err);
  process.exit(1);
});
