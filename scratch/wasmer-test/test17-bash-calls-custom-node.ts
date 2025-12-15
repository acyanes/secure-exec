// Test 17: Bash calling custom node from combined package
// Can bash spawn our custom node command when both are in the same package?

import { init, Wasmer } from "@wasmer/sdk/node";
import * as fs from "fs/promises";

async function main(): Promise<void> {
  console.log("Test 17: Bash Calling Custom Node from Combined Package");
  console.log("=========================================================\n");

  await init();

  // Load our custom package that has bash + coreutils + node
  const webcPath = "custom-node-pkg/test-custom-shell-0.2.0.webc";
  console.log("Loading:", webcPath);

  const webcBytes = await fs.readFile(webcPath);
  console.log("Package size:", webcBytes.length, "bytes\n");

  const pkg = await Wasmer.fromFile(webcBytes);

  console.log("Commands available:", Object.keys(pkg.commands).length);
  console.log("Has bash?", "bash" in pkg.commands);
  console.log("Has node?", "node" in pkg.commands);
  console.log("Has ls?", "ls" in pkg.commands);
  console.log("");

  // Test 17a: Run our custom node directly
  console.log("--- Test 17a: Run node directly ---\n");
  try {
    const instance = await pkg.commands["node"].run({ args: [] });
    const result = await Promise.race([
      instance.wait(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout 5s")), 5000)
      ),
    ]);
    console.log("Exit code:", result.code);
    console.log("Stdout:", result.stdout);
  } catch (e: unknown) {
    console.log("Error:", (e as Error).message);
  }

  // Test 17b: Run bash and call node
  console.log("\n--- Test 17b: bash -c 'node' ---\n");
  try {
    const instance = await pkg.commands["bash"].run({
      args: ["-c", "echo 'About to call node...' && node && echo 'Done!'"],
    });
    const result = await Promise.race([
      instance.wait(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout 10s")), 10000)
      ),
    ]);
    console.log("Exit code:", result.code);
    console.log("Stdout:", result.stdout);
    console.log("Stderr:", result.stderr);
  } catch (e: unknown) {
    console.log("Error:", (e as Error).message);
  }

  // Test 17c: Bash script that uses node
  console.log("\n--- Test 17c: Bash script calling node ---\n");
  try {
    const manifest = {
      command: [
        {
          module: "sharrattj/bash:bash",
          name: "shell",
          runner: "https://webc.org/runner/wasi",
        },
      ],
      dependencies: {
        "sharrattj/bash": "*",
        "sharrattj/coreutils": "*",
      },
      fs: {
        "/app": {
          "test.sh": `#!/bin/bash
echo "=== Script starting ==="
echo "Checking for node..."
which node || echo "node not in PATH"
echo "Trying to run node..."
node || echo "node command failed"
echo "=== Script done ==="
`,
        },
      },
    };

    // Note: This won't have our custom node because createPackage
    // only references registry packages
    const testPkg = await Wasmer.createPackage(manifest as any);
    console.log("Test package has node?", "node" in testPkg.commands);

    const instance = await testPkg.commands["shell"].run({
      args: ["/app/test.sh"],
    });
    const result = await Promise.race([
      instance.wait(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout 10s")), 10000)
      ),
    ]);
    console.log("Exit code:", result.code);
    console.log("Stdout:", result.stdout);
    console.log("Stderr:", result.stderr);
  } catch (e: unknown) {
    console.log("Error:", (e as Error).message);
  }

  console.log("\n=== Summary ===\n");
  console.log("Can we combine bash + coreutils + custom node in one package?");
  console.log("Can bash spawn our custom node command?");
}

main().catch(console.error);
