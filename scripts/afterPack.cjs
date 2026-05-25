const { execFileSync } = require("node:child_process");
const { existsSync, statSync } = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const unpackedRoot = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
    "Resources",
    "app.asar.unpacked",
  );

  const targets = [
    path.join(
      unpackedRoot,
      "node_modules",
      "better-sqlite3",
      "build",
      "Release",
      "better_sqlite3.node",
    ),
  ];

  for (const file of targets) {
    if (!existsSync(file)) continue;
    const before = statSync(file).size;
    execFileSync("strip", ["-x", file], { stdio: "inherit" });
    const after = statSync(file).size;
    console.log(
      `[afterPack] stripped ${path.basename(file)}: ${before} -> ${after} bytes (-${before - after})`,
    );
  }
};
