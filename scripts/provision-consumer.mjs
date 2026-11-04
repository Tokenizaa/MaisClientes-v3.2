#!/usr/bin/env node
/**
 * Provisions a project-specific MapScrape API key and stores it directly in
 * the target provider. The key is never printed or written to a local file.
 *
 * Required common env:
 * MAPSCRAPE_BASE_URL, MAPSCRAPE_PROVISIONING_TOKEN, CONSUMER_NAME, CONSUMER_PROJECT
 * TARGET_PROVIDER=vercel | cloudflare
 *
 * Vercel:
 * VERCEL_TOKEN, VERCEL_PROJECT_ID, optional VERCEL_TEAM_ID
 *
 * Cloudflare Workers:
 * CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_WORKER_NAME
 */
import { spawnSync } from "node:child_process";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const baseUrl = required("MAPSCRAPE_BASE_URL").replace(/\/+$/, "");
const provisioningToken = required("MAPSCRAPE_PROVISIONING_TOKEN");
const consumerName = required("CONSUMER_NAME");
const consumerProject = required("CONSUMER_PROJECT");
const provider = (process.env.TARGET_PROVIDER || "vercel").toLowerCase();

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${new URL(url).pathname}: ${body?.error || response.statusText}`);
  }
  return body;
}

async function verifyTargetAccess() {
  if (provider === "vercel") {
    const token = required("VERCEL_TOKEN");
    const projectId = required("VERCEL_PROJECT_ID");
    const teamId = process.env.VERCEL_TEAM_ID?.trim();
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
    await jsonRequest(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}${query}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (consumerProject !== projectId && consumerProject !== `${teamId || "vercel"}/${projectId}`) {
      throw new Error("CONSUMER_PROJECT must match VERCEL_PROJECT_ID (or teamId/projectId) to bind the credential to the verified project.");
    }
    return;
  }

  const token = required("CLOUDFLARE_API_TOKEN");
  const accountId = required("CLOUDFLARE_ACCOUNT_ID");
  const workerName = required("CLOUDFLARE_WORKER_NAME");
  const expectedProject = `${accountId}/${workerName}`;
  if (consumerProject !== expectedProject) {
    throw new Error("For Cloudflare, CONSUMER_PROJECT must equal CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_WORKER_NAME.");
  }
  await jsonRequest(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function issueCredential() {
  const result = await jsonRequest(`${baseUrl}/api/v1/provisioning/credentials`, {
    method: "POST",
    headers: { "X-MapScrape-Provisioning-Token": provisioningToken },
    body: JSON.stringify({ consumerName, consumerProject }),
  });
  if (!result?.data?.apiKey || !result?.data?.credentialId) {
    throw new Error("MapScrape returned an invalid credential response.");
  }
  return result.data;
}

async function storeInVercel(secret) {
  const token = required("VERCEL_TOKEN");
  const projectId = required("VERCEL_PROJECT_ID");
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const headers = { Authorization: `Bearer ${token}` };
  const list = await jsonRequest(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env${query}`, { headers });
  const existing = (list.envs || []).find((env) => env.key === "MAPSCRAPE_API_KEY" && (env.target || []).includes("production"));
  const payload = { key: "MAPSCRAPE_API_KEY", value: secret, type: "sensitive", target: ["production"], comment: "MapScrape API key provisioned automatically; do not expose client-side." };
  if (existing?.id) {
    await jsonRequest(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(existing.id)}${query}`, {
      method: "PATCH", headers, body: JSON.stringify(payload),
    });
  } else {
    await jsonRequest(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env${query}`, {
      method: "POST", headers, body: JSON.stringify(payload),
    });
  }
}

function storeInCloudflare(secret) {
  const token = required("CLOUDFLARE_API_TOKEN");
  const accountId = required("CLOUDFLARE_ACCOUNT_ID");
  const workerName = required("CLOUDFLARE_WORKER_NAME");
  const result = spawnSync("npx", ["--yes", "wrangler", "secret", "put", "MAPSCRAPE_API_KEY", "--name", workerName, "--account-id", accountId], {
    input: secret,
    encoding: "utf8",
    env: { ...process.env, CLOUDFLARE_API_TOKEN: token },
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 120000,
  });
  if (result.error || result.status !== 0) {
    // Do not echo stdout/stderr: third-party CLI output must not accidentally disclose credentials.
    throw new Error("Cloudflare secret upload failed. Check token permissions, account, worker name, and Wrangler configuration.");
  }
}

async function revokeCredential(id) {
  try {
    await jsonRequest(`${baseUrl}/api/v1/provisioning/credentials/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "X-MapScrape-Provisioning-Token": provisioningToken },
    });
  } catch {
    // The caller receives a generic failure; never print the credential or token.
  }
}

let credential;
try {
  if (!["vercel", "cloudflare"].includes(provider)) throw new Error("TARGET_PROVIDER must be vercel or cloudflare.");
  // Prove that this agent can access the actual target project before issuing a credential.
  await verifyTargetAccess();
  credential = await issueCredential();
  if (provider === "vercel") await storeInVercel(credential.apiKey);
  else storeInCloudflare(credential.apiKey);

  // Verify the newly installed credential against a read-only endpoint.
  await jsonRequest(`${baseUrl}/api/v1/leads?limit=1&offset=0`, {
    headers: { Authorization: `Bearer ${credential.apiKey}` },
  });

  console.log(JSON.stringify({
    status: "configured",
    provider,
    consumerName,
    consumerProject,
    credentialId: credential.credentialId,
    secretName: "MAPSCRAPE_API_KEY",
    environment: provider === "vercel" ? "production" : "worker secret",
    verification: "passed",
    note: "The secret value was not printed. Redeploy/restart the consumer if its platform requires it to load new secrets.",
  }, null, 2));
} catch (error) {
  if (credential?.credentialId) await revokeCredential(credential.credentialId);
  console.error(JSON.stringify({
    status: "failed",
    reason: error instanceof Error ? error.message : "Unknown provisioning failure",
    credentialRevocationAttempted: Boolean(credential?.credentialId),
  }, null, 2));
  process.exitCode = 1;
}
