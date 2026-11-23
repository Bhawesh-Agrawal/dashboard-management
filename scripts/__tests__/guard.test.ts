import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  parseDatabaseHostname,
  isProdDbHost,
  isLocalDbHost,
  validateDatabaseTarget,
} from "../guard";

describe("Database Target Host Guard (scripts/guard.ts)", () => {
  const originalEnv = { ...process.env };
  const originalArgv = [...process.argv];

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.argv = [...originalArgv];
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
  });

  describe("parseDatabaseHostname", () => {
    it("extracts hostname from a standard postgres URL", () => {
      const url = "postgresql://user:pass@db.example.com:5432/mydb";
      expect(parseDatabaseHostname(url)).toBe("db.example.com");
    });

    it("extracts hostname from localhost URL with custom port", () => {
      const url = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
      expect(parseDatabaseHostname(url)).toBe("127.0.0.1");
    });

    it("returns null when url is undefined", () => {
      expect(parseDatabaseHostname(undefined)).toBeNull();
    });
  });

  describe("isProdDbHost", () => {
    it("returns true for matching hostnames (case-insensitive)", () => {
      expect(isProdDbHost("db.production.supabase.co", "db.production.supabase.co")).toBe(true);
      expect(isProdDbHost("DB.PRODUCTION.SUPABASE.CO:6543", "db.production.supabase.co")).toBe(true);
    });

    it("returns false for different hostnames", () => {
      expect(isProdDbHost("localhost", "db.production.supabase.co")).toBe(false);
      expect(isProdDbHost("db.dev.supabase.co", "db.production.supabase.co")).toBe(false);
    });
  });

  describe("isLocalDbHost", () => {
    it("identifies standard local hostnames", () => {
      expect(isLocalDbHost("localhost")).toBe(true);
      expect(isLocalDbHost("127.0.0.1")).toBe(true);
      expect(isLocalDbHost("::1")).toBe(true);
      expect(isLocalDbHost("localhost:5432")).toBe(true);
      expect(isLocalDbHost("host.docker.internal")).toBe(true);
    });

    it("identifies matching dev project host when DEV_DB_HOST is provided", () => {
      expect(isLocalDbHost("db.dev-project.supabase.co", "db.dev-project.supabase.co")).toBe(true);
      expect(isLocalDbHost("db.dev-project.supabase.co:5432", "db.dev-project.supabase.co")).toBe(true);
    });

    it("returns false for remote hosts that do not match DEV_DB_HOST", () => {
      expect(isLocalDbHost("db.other-project.supabase.co", "db.dev-project.supabase.co")).toBe(false);
      expect(isLocalDbHost("db.production.supabase.co")).toBe(false);
    });
  });

  describe("validateDatabaseTarget", () => {
    it("refuses to run when target host equals PROD_DB_HOST and DEPLOY_ENV is not 'production'", () => {
      process.env.PROD_DB_HOST = "db.production.supabase.co";
      process.env.DATABASE_URL = "postgresql://user:pass@db.production.supabase.co:6543/postgres";
      process.env.DEPLOY_ENV = "local";

      expect(() => validateDatabaseTarget({ isAppStartup: true })).toThrow(
        /Connected to production database host "db.production.supabase.co" while DEPLOY_ENV is "local"/
      );

      process.env.DEPLOY_ENV = "staging";
      expect(() => validateDatabaseTarget({ isAppStartup: true })).toThrow(
        /Connected to production database host "db.production.supabase.co" while DEPLOY_ENV is "staging"/
      );
    });

    it("allows execution when target host equals PROD_DB_HOST and DEPLOY_ENV is 'production'", () => {
      process.env.PROD_DB_HOST = "db.production.supabase.co";
      process.env.DATABASE_URL = "postgresql://user:pass@db.production.supabase.co:6543/postgres";
      process.env.DEPLOY_ENV = "production";

      const result = validateDatabaseTarget({ isAppStartup: true });
      expect(result.deployEnv).toBe("production");
      expect(result.host).toBe("db.production.supabase.co");
    });

    it("requires confirmation when DEPLOY_ENV is 'local' and target host is a non-local remote database", () => {
      process.env.DATABASE_URL = "postgresql://user:pass@db.remote.supabase.co:6543/postgres";
      process.env.DEPLOY_ENV = "local";
      delete process.env.DEV_DB_HOST;
      delete process.env.CONFIRM_REMOTE_DB;

      expect(() => validateDatabaseTarget({ isAppStartup: true })).toThrow(
        /DEPLOY_ENV is "local", but database host is a remote host \("db.remote.supabase.co"\)/
      );
    });

    it("permits remote database in 'local' environment when CONFIRM_REMOTE_DB is true", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      process.env.DATABASE_URL = "postgresql://user:pass@db.remote.supabase.co:6543/postgres";
      process.env.DEPLOY_ENV = "local";
      process.env.CONFIRM_REMOTE_DB = "true";

      const result = validateDatabaseTarget({ isAppStartup: true });
      expect(result.deployEnv).toBe("local");
      expect(result.host).toBe("db.remote.supabase.co");
      expect(warnSpy).toHaveBeenCalled();
    });

    it("permits remote database in 'local' environment when DEV_DB_HOST matches", () => {
      process.env.DATABASE_URL = "postgresql://user:pass@db.my-dev-project.supabase.co:6543/postgres";
      process.env.DEV_DB_HOST = "db.my-dev-project.supabase.co";
      process.env.DEPLOY_ENV = "local";

      const result = validateDatabaseTarget({ isAppStartup: true });
      expect(result.deployEnv).toBe("local");
      expect(result.host).toBe("db.my-dev-project.supabase.co");
    });

    it("permits local connections (localhost / 127.0.0.1) without warning or confirmation in 'local' environment", () => {
      process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
      process.env.DEPLOY_ENV = "local";

      const result = validateDatabaseTarget({ isAppStartup: true });
      expect(result.deployEnv).toBe("local");
      expect(result.host).toBe("127.0.0.1");
    });
  });
});
