const procs: { name: string; proc: Bun.Subprocess }[] = [];

function spawn(name: string, cmd: string[], cwd?: string) {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  procs.push({ name, proc });
}

spawn("web-server", ["bun", "run", "--filter", "@esproc/web-server", "dev"]);
spawn("web-ide", ["bun", "run", "--filter", "@esproc/web-ide", "dev"]);

const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
signals.forEach((sig) => {
  process.on(sig, () => {
    procs.forEach(({ proc }) => {
      try {
        proc.kill();
      } catch {
        // ignore
      }
    });
    process.exit(0);
  });
});
