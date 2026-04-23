import assert from "node:assert/strict";
import test from "node:test";
import { createSingleFlightRegistry } from "./single-flight.ts";

test("createSingleFlightRegistry ignores duplicate runs for the same key", async () => {
  const registry = createSingleFlightRegistry<string>();
  let callCount = 0;
  let resolveAction: ((value: string) => void) | null = null;

  const action = () => {
    callCount += 1;
    return new Promise<string>((resolve) => {
      resolveAction = resolve;
    });
  };

  const firstRun = registry.run("save", action);
  const secondRun = registry.run("save", action);

  await Promise.resolve();

  assert.equal(callCount, 1);
  assert.equal(registry.isRunning("save"), true);

  resolveAction?.("done");

  const [firstResult, secondResult] = await Promise.all([firstRun, secondRun]);
  assert.equal(firstResult, "done");
  assert.equal(secondResult, "done");
  assert.equal(registry.isRunning("save"), false);
});

test("createSingleFlightRegistry keeps keys independent", async () => {
  const registry = createSingleFlightRegistry<string>();
  const calls: string[] = [];

  await Promise.all([
    registry.run("preview", async () => {
      calls.push("preview");
    }),
    registry.run("apply", async () => {
      calls.push("apply");
    }),
  ]);

  assert.deepEqual(calls.sort(), ["apply", "preview"]);
});

test("createSingleFlightRegistry allows rerun after the prior action settles", async () => {
  const registry = createSingleFlightRegistry<string>();
  let callCount = 0;

  await registry.run("capture", async () => {
    callCount += 1;
  });

  await registry.run("capture", async () => {
    callCount += 1;
  });

  assert.equal(callCount, 2);
});
