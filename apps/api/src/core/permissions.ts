import type { RiskLevel } from "@ai-agent/shared";
import type { AuthUser } from "../auth/service.js";

const ROLE_SCOPES: Record<string, RiskLevel[]> = {
  admin: ["safe", "write", "destructive"],
  user: ["safe", "write"],
};

export class PermissionManager {
  canUseTool(user: AuthUser, risk: RiskLevel): boolean {
    const allowed = ROLE_SCOPES[user.role] ?? ["safe"];
    return allowed.includes(risk);
  }

  requiresApproval(risk: RiskLevel): boolean {
    return risk === "write" || risk === "destructive";
  }
}
