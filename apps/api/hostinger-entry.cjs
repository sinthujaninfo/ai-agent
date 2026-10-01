"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");

// Hostinger lsnode loads the entry with require(); our app is ESM.
const serverUrl = pathToFileURL(path.join(__dirname, "dist", "server.js")).href;
import(serverUrl).catch((err) => {
  console.error(err);
  process.exit(1);
});
