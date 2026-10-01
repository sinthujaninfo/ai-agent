import { query } from "../db/pool.js";

/** V1 stub — plugins stored in DB; HTTP execution lands in V2. */
export class PluginManager {
  async list(projectId: string) {
    return query(
      `SELECT id, name, config_json, enabled, created_at FROM plugins WHERE project_id = :projectId`,
      { projectId },
    );
  }
}
