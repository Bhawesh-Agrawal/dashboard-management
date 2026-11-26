import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("cloudbuild.yaml cron OIDC configuration", () => {
  const rootDir = process.cwd();
  const cloudbuildPath = path.join(rootDir, "cloudbuild.yaml");
  const cronAuthPath = path.join(rootDir, "src/lib/cron-auth.ts");

  it("matches CRON_OIDC_AUDIENCE and CRON_OIDC_SERVICE_ACCOUNT_EMAIL with cron-auth.ts and scheduler jobs", () => {
    const cloudbuild = fs.readFileSync(cloudbuildPath, "utf8");
    const cronAuth = fs.readFileSync(cronAuthPath, "utf8");

    // 1. Verify cron-auth.ts reads CRON_OIDC_AUDIENCE and CRON_OIDC_SERVICE_ACCOUNT_EMAIL
    expect(cronAuth).toContain("process.env.CRON_OIDC_AUDIENCE");
    expect(cronAuth).toContain("process.env.CRON_OIDC_SERVICE_ACCOUNT_EMAIL");

    // 2. Verify _CRON_AUDIENCE and _SCHEDULER_SA substitutions exist
    const cronAudienceMatch = cloudbuild.match(/^\s*_CRON_AUDIENCE:\s*(\S+)/m);
    const schedulerSaMatch = cloudbuild.match(/^\s*_SCHEDULER_SA:\s*(\S+)/m);
    expect(cronAudienceMatch?.[1]).toBe("dashboard-management-cron");
    expect(schedulerSaMatch?.[1]).toBeTruthy();

    // 3. Verify --set-env-vars passes CRON_OIDC_AUDIENCE=$_CRON_AUDIENCE and CRON_OIDC_SERVICE_ACCOUNT_EMAIL=$_SCHEDULER_SA
    const envVarsMatch = cloudbuild.match(/--set-env-vars=([^\s]+)/);
    expect(envVarsMatch).toBeTruthy();
    const envVars = envVarsMatch![1].split(",");
    expect(envVars).toContain("CRON_OIDC_AUDIENCE=$_CRON_AUDIENCE");
    expect(envVars).toContain("CRON_OIDC_SERVICE_ACCOUNT_EMAIL=$_SCHEDULER_SA");

    // 4. Verify all --oidc-token-audience flags use $_CRON_AUDIENCE (4 occurrences: update + create for both jobs)
    const audienceFlags = [...cloudbuild.matchAll(/--oidc-token-audience="([^"]+)"/g)].map(
      (m) => m[1]
    );
    expect(audienceFlags.length).toBe(4);
    for (const aud of audienceFlags) {
      expect(aud).toBe("$_CRON_AUDIENCE");
    }

    // 5. Verify all --oidc-service-account-email flags use $_SCHEDULER_SA
    const saFlags = [...cloudbuild.matchAll(/--oidc-service-account-email=(\S+)/g)].map(
      (m) => m[1]
    );
    expect(saFlags.length).toBe(4);
    for (const sa of saFlags) {
      expect(sa).toBe("$_SCHEDULER_SA");
    }
  });
});
