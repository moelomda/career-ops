import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  loadProfileDocument,
  ProfileConfigError,
} from "../../src/lib/profile-config.mjs";

const fixtureDirs = [];

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "career-ops-profile-"));
  fixtureDirs.push(dir);
  const file = path.join(dir, "profile.yml");
  const template = path.join(dir, "profile.example.yml");
  writeFileSync(template, "candidate:\n  full_name: Example\ntarget_roles:\n  primary: [Engineer]\n", "utf8");
  return { file, template };
}

after(() => {
  for (const dir of fixtureDirs) rmSync(dir, { recursive: true, force: true });
});

test("a missing profile seeds from the shipped template", () => {
  const { file, template } = fixture();
  const result = loadProfileDocument(file, template);

  assert.equal(result.seeded, true);
  assert.deepEqual(result.doc.candidate, { full_name: "Example" });
  assert.deepEqual(result.doc.target_roles, { primary: ["Engineer"] });
});

for (const [label, source] of [
  ["string scalar", "keep-this-value\n"],
  ["timestamp scalar", "2024-01-01\n"],
  ["sequence", "- keep\n- this\n"],
]) {
  test(`an existing ${label} is rejected and preserved`, () => {
    const { file, template } = fixture();
    writeFileSync(file, source, "utf8");

    assert.throws(
      () => loadProfileDocument(file, template),
      (error) => error instanceof ProfileConfigError && error.kind === "invalid-user-config",
    );
    assert.equal(readFileSync(file, "utf8"), source);
  });
}

test("malformed profile YAML is rejected and preserved", () => {
  const { file, template } = fixture();
  const source = "candidate: [unterminated\n";
  writeFileSync(file, source, "utf8");

  assert.throws(
    () => loadProfileDocument(file, template),
    (error) => error instanceof ProfileConfigError && error.kind === "invalid-user-config",
  );
  assert.equal(readFileSync(file, "utf8"), source);
});

test("an invalid seed template is an installation error", () => {
  const { file, template } = fixture();
  writeFileSync(template, "- not\n- a mapping\n", "utf8");

  assert.throws(
    () => loadProfileDocument(file, template),
    (error) => error instanceof ProfileConfigError && error.kind === "invalid-template",
  );
});

test("both profile writers use the shape-aware loader", () => {
  const profileRoute = readFileSync(new URL("../../src/app/api/profile/route.ts", import.meta.url), "utf8");
  const cadenceRoute = readFileSync(new URL("../../src/app/api/followups/cadence/route.ts", import.meta.url), "utf8");

  assert.match(profileRoute, /loadProfileDocument\s*\(/);
  assert.match(cadenceRoute, /loadProfileDocument\s*\(/);
});
