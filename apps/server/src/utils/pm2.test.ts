import { describe, expect, it } from "vitest";

import { extractJsonArray, parsePm2List, stripAnsiSequences } from "./pm2";

describe("parsePm2List", () => {
  it("maps pm2 jlist output into the UI model", () => {
    const output = JSON.stringify([
      {
        name: "api",
        pm_id: 4,
        pid: 1234,
        monit: { cpu: 3, memory: 1048576 },
        pm2_env: { status: "online", pm_uptime: 1710000000000, restart_time: 2 }
      }
    ]);

    expect(parsePm2List(output)).toEqual([
      {
        name: "api",
        pmId: 4,
        status: "online",
        pid: 1234,
        cpu: 3,
        memory: 1048576,
        uptime: 1710000000000,
        restartCount: 2
      }
    ]);
  });

  it("strips ansi escape sequences before parsing pm2 output", () => {
    expect(stripAnsiSequences("\u001b[?2004hroot@host:~# \u001b[?2004l")).toBe("root@host:~# ");
  });

  it("extracts the json array from noisy shell output", () => {
    const noisyOutput = [
      "\u001b[?2004hroot@host:~# \u001b[?2004l",
      '[{"name":"api","pm_id":1,"pm2_env":{"status":"online"}}]',
      "root@host:~# "
    ].join("\n");

    expect(extractJsonArray(noisyOutput)).toBe(
      '[{"name":"api","pm_id":1,"pm2_env":{"status":"online"}}]'
    );
  });
});
