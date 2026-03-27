import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };

import {
  captureCommand,
  ensureSeaBuilderNode,
  repositoryRoot,
  runNodeScript,
  seaExecutablePath,
} from "./sea-common.mjs";

const buildSeaScriptPath = fileURLToPath(
  new URL("./build-sea.mjs", import.meta.url),
);
const smokeEnvironment = {
  FORCE_COLOR: "0",
  NODE_NO_WARNINGS: "1",
  NODE_OPTIONS: "",
  NO_COLOR: "1",
};

const assertCommandSucceeded = (label, result) => {
  if (result.exitCode === 0) {
    return;
  }

  const signalSuffix =
    result.signal === null ? "" : `, signal: ${result.signal}`;

  throw new Error(
    `${label} failed with exit code ${result.exitCode}${signalSuffix}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
};

const assertIncludes = (label, actual, expected) => {
  if (actual.includes(expected)) {
    return;
  }

  throw new Error(
    `${label} did not include ${JSON.stringify(expected)}.\nactual output:\n${actual}`,
  );
};

const assertEmpty = (label, actual) => {
  if (actual === "") {
    return;
  }

  throw new Error(
    `${label} was expected to be empty.\nactual output:\n${actual}`,
  );
};

const runSeaExecutable = (args) => {
  return captureCommand(seaExecutablePath, args, {
    cwd: repositoryRoot,
    env: smokeEnvironment,
  });
};

ensureSeaBuilderNode();

console.log("Building SEA executable for smoke test...");
await runNodeScript(buildSeaScriptPath, [], {
  cwd: repositoryRoot,
});

const versionResult = runSeaExecutable(["--version"]);
assertCommandSucceeded("SEA --version", versionResult);
assertIncludes(
  "SEA --version stdout",
  versionResult.stdout,
  `devtools/${packageJson.version}`,
);
assertEmpty("SEA --version stderr", versionResult.stderr);

const rootHelpResult = runSeaExecutable([]);
assertCommandSucceeded("SEA root help", rootHelpResult);
assertIncludes("SEA root help", rootHelpResult.stdout, "autocomplete");
assertIncludes("SEA root help", rootHelpResult.stdout, "install");
assertIncludes("SEA root help", rootHelpResult.stdout, "web");
assertEmpty("SEA root help stderr", rootHelpResult.stderr);

const fetchHelpResult = runSeaExecutable(["web", "fetch", "--help"]);
assertCommandSucceeded("SEA web fetch --help", fetchHelpResult);
assertIncludes("SEA web fetch --help", fetchHelpResult.stdout, "--format");
assertIncludes("SEA web fetch --help", fetchHelpResult.stdout, "--stdin");
assertEmpty("SEA web fetch --help stderr", fetchHelpResult.stderr);

const autocompleteHelpResult = runSeaExecutable([
  "autocomplete",
  "bash",
  "--help",
]);
assertCommandSucceeded("SEA autocomplete bash --help", autocompleteHelpResult);
assertIncludes(
  "SEA autocomplete bash --help",
  autocompleteHelpResult.stdout,
  'Emit a bash autocomplete script for use with `eval "$(devtools autocomplete bash)"`.',
);
assertEmpty(
  "SEA autocomplete bash --help stderr",
  autocompleteHelpResult.stderr,
);

const removedCommandResult = runSeaExecutable(["sync"]);

if (removedCommandResult.exitCode === 0) {
  throw new Error(
    `SEA removed command unexpectedly succeeded.\nstdout:\n${removedCommandResult.stdout}\nstderr:\n${removedCommandResult.stderr}`,
  );
}

assertIncludes(
  "SEA removed command stderr",
  removedCommandResult.stderr,
  'Command "sync" not found.',
);

console.log(`SEA smoke test passed with ${seaExecutablePath}`);
