import test from "node:test"
import assert from "node:assert/strict"
import { createEasPreflightCommands } from "./runner.js"

test("creates EAS authentication and project access preflight commands", () => {
  assert.deepEqual(createEasPreflightCommands(), [
    ["eas", ["whoami"]],
    ["eas", ["project:info"]]
  ])
})
