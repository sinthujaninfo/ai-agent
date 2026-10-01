import { filesListTool, filesReadTool, filesWriteTool } from "./files.js";
import { githubCreateIssueTool, githubGetFileTool, githubListIssuesTool } from "./github.js";
import { ToolManager } from "./manager.js";
import { databaseQueryTool, serverHealthTool } from "./server.js";

export function createToolManager(): ToolManager {
  const mgr = new ToolManager();
  for (const tool of [
    filesListTool,
    filesReadTool,
    filesWriteTool,
    githubGetFileTool,
    githubListIssuesTool,
    githubCreateIssueTool,
    serverHealthTool,
    databaseQueryTool,
  ]) {
    mgr.register(tool);
  }
  return mgr;
}

export { ToolManager } from "./manager.js";
