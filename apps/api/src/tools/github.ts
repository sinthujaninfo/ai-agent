import { Octokit } from "@octokit/rest";
import { z } from "zod";
import { env } from "../config/env.js";
import type { ToolDefinition } from "./manager.js";

function client() {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not configured");
  return new Octokit({ auth: env.GITHUB_TOKEN });
}

export const githubGetFileTool: ToolDefinition = {
  name: "github.get_file",
  description: "Read a file from a GitHub repository",
  risk: "safe",
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    path: z.string(),
    ref: z.string().optional(),
  }),
  async execute(input) {
    const octokit = client();
    const { data } = await octokit.repos.getContent({
      owner: input.owner,
      repo: input.repo,
      path: input.path,
      ref: input.ref,
    });
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
      return { error: "Not a file" };
    }
    const content = Buffer.from(data.content, "base64").toString("utf8");
    return { path: input.path, content: content.slice(0, 100_000), sha: data.sha };
  },
};

export const githubListIssuesTool: ToolDefinition = {
  name: "github.list_issues",
  description: "List issues for a GitHub repository",
  risk: "safe",
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    state: z.enum(["open", "closed", "all"]).default("open"),
  }),
  async execute(input) {
    const octokit = client();
    const { data } = await octokit.issues.listForRepo({
      owner: input.owner,
      repo: input.repo,
      state: input.state,
      per_page: 20,
    });
    return data.map((i) => ({ number: i.number, title: i.title, state: i.state, html_url: i.html_url }));
  },
};

export const githubCreateIssueTool: ToolDefinition = {
  name: "github.create_issue",
  description: "Create a GitHub issue (requires approval)",
  risk: "write",
  inputSchema: z.object({
    owner: z.string(),
    repo: z.string(),
    title: z.string(),
    body: z.string().optional(),
  }),
  async execute(input) {
    const octokit = client();
    const { data } = await octokit.issues.create({
      owner: input.owner,
      repo: input.repo,
      title: input.title,
      body: input.body,
    });
    return { number: data.number, html_url: data.html_url };
  },
};
