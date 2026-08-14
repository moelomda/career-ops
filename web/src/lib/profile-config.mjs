import fs from "node:fs";
import * as yaml from "js-yaml";

/**
 * A profile-loading error that distinguishes user data conflicts (409) from
 * installation/read failures (500) without exposing filesystem details.
 */
export class ProfileConfigError extends Error {
  /**
   * @param {string} message
   * @param {"invalid-user-config" | "read-failed" | "invalid-template"} kind
   * @param {unknown} [cause]
   */
  constructor(message, kind, cause) {
    super(message, { cause });
    this.name = "ProfileConfigError";
    this.kind = kind;
  }
}

/** @param {unknown} value */
export function isMapping(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Load config/profile.yml, seeding only when the user-layer file is absent.
 * Valid YAML with a scalar/sequence root is still invalid for this config and
 * must never be treated as an empty mapping that a writer may overwrite.
 *
 * @param {string} file
 * @param {string} templateFile
 * @returns {{ doc: Record<string, unknown>, seeded: boolean }}
 */
export function loadProfileDocument(file, templateFile) {
  let source;
  let seeded = false;

  try {
    source = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ENOENT") {
      throw new ProfileConfigError("could not read config/profile.yml", "read-failed", error);
    }

    seeded = true;
    try {
      source = fs.readFileSync(templateFile, "utf8");
    } catch (templateError) {
      throw new ProfileConfigError("could not read profile template", "read-failed", templateError);
    }
  }

  let parsed;
  try {
    parsed = yaml.load(source);
  } catch (error) {
    throw new ProfileConfigError(
      seeded ? "profile template contains invalid YAML" : "config/profile.yml contains invalid YAML",
      seeded ? "invalid-template" : "invalid-user-config",
      error,
    );
  }

  if (!isMapping(parsed)) {
    throw new ProfileConfigError(
      seeded ? "profile template must contain a YAML mapping" : "config/profile.yml must contain a YAML mapping",
      seeded ? "invalid-template" : "invalid-user-config",
    );
  }

  return { doc: parsed, seeded };
}
