// One deployment role supervises two independent industry processes using the same application code.
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { industryEnvironments } from "./config.ts";
import { createGateway } from "./gateway.ts";

const role = process.argv[2];
if (!["setup", "api", "worker", "web"].includes(role)) throw new Error("Usage: node deploy/radar/run.ts setup|api|worker|web");
const industries = industryEnvironments();
const children = new Set<ChildProcess>();
const timers = new Set<ReturnType<typeof setTimeout>>();
let stopping = false;
const nodeArgs = process.execArgv.filter(arg => !arg.startsWith("--conditions=") && !arg.startsWith("--env-file"));

function child(industry: typeof industries[number], file: string): ChildProcess {
  const processChild = spawn(process.execPath, [...nodeArgs, `--conditions=${industry.condition}`, file], {
    env: { ...industry.env, ...(role === "web" ? { TRUST_PROXY: "true" } : {}) }, stdio: "inherit",
  });
  children.add(processChild);
  processChild.once("exit", () => children.delete(processChild));
  processChild.once("error", () => console.error(JSON.stringify({ msg: "industry process could not start", industry: industry.id, role })));
  return processChild;
}

if (role === "setup") {
  for (const industry of industries) for (const file of ["scripts/migrate.ts", "scripts/seed.ts"]) {
    const started = child(industry, file);
    const [code] = await once(started, "exit");
    if (code !== 0) process.exit(Number(code) || 1);
  }
} else {
  const file = role === "web" ? "apps/web/server.ts" : `apps/${role}/src/main.ts`;
  function supervise(industry: typeof industries[number]) {
    const started = child(industry, file);
    started.once("exit", code => {
      if (stopping) return;
      console.error(JSON.stringify({ msg: "industry process exited; restarting", industry: industry.id, role, code }));
      const timer = setTimeout(() => { timers.delete(timer); if (!stopping) supervise(industry); }, 2000);
      timers.add(timer);
    });
  }
  industries.forEach(supervise);
  const gateway = role === "web" ? createGateway({ ai: industries[0].webPort, medical: industries[1].webPort }, process.env.TRUST_PROXY === "true", new URL(industries[0].env.SITE_URL!).origin) : null;
  gateway?.listen(Number(process.env.WEB_PORT || process.env.PORT || 3000), process.env.WEB_HOST || "127.0.0.1", () => console.log(JSON.stringify({ msg: "Radar started", industries: ["ai", "medical"] })));
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    for (const timer of timers) clearTimeout(timer);
    gateway?.close();
    const exited = [...children].map(processChild => {
      const exit = once(processChild, "exit").catch(() => {});
      processChild.kill("SIGTERM");
      return exit;
    });
    const force = setTimeout(() => { for (const processChild of children) processChild.kill("SIGKILL"); }, 210_000);
    await Promise.all(exited);
    clearTimeout(force);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
