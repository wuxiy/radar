import { spawnSync } from "node:child_process";

for (const industry of ["ai", "medical"]) {
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build", "-w", "@aihot/web"], {
    env: { ...process.env, RADAR_INDUSTRY: industry }, stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
