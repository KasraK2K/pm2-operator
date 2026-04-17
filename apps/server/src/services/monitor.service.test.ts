import { describe, expect, it } from "vitest";

import type { Pm2RuntimeProcess } from "../utils/pm2";
import { buildDashboardSnapshot } from "./monitor.service";

describe("buildDashboardSnapshot", () => {
  const processes: Pm2RuntimeProcess[] = [
    {
      name: "api",
      pmId: 4,
      status: "online",
      pid: 1234,
      cpu: 7.5,
      memory: 104857600,
      uptime: 1710000000000,
      restartCount: 5,
      cwd: "/srv/api",
      execPath: "/srv/api/server.js",
      execMode: "fork_mode",
      version: "1.0.0",
      nodeVersion: "22.0.0",
      gitBranch: "main",
      gitRevision: "abc123",
      repoPath: "/srv/api",
      unstableRestarts: 0,
      outputLogPath: "/tmp/api-out.log",
      errorLogPath: "/tmp/api-error.log"
    },
    {
      name: "worker",
      pmId: 9,
      status: "errored",
      pid: null,
      cpu: 1.5,
      memory: 52428800,
      uptime: null,
      restartCount: 3,
      cwd: "/srv/worker",
      execPath: "/srv/worker/index.js",
      execMode: "cluster_mode",
      version: "2.0.0",
      nodeVersion: "22.0.0",
      gitBranch: "develop",
      gitRevision: "def456",
      repoPath: "/srv/worker",
      unstableRestarts: 2,
      outputLogPath: "/tmp/worker-out.log",
      errorLogPath: "/tmp/worker-error.log"
    }
  ];

  it("filters the selected PM2 processes and computes aggregate metrics", () => {
    const snapshot = buildDashboardSnapshot({
      hostId: "host-1",
      fingerprint: "fingerprint",
      host: null,
      processes,
      targets: [
        { pmId: 9, label: "Worker queue" },
        { pmId: 4, label: "API server" }
      ],
      restartBaseline: new Map([
        [4, 2],
        [9, 1]
      ]),
      timestamp: "2026-04-17T12:00:00.000Z"
    });

    expect(snapshot.processes.map((process) => process.pmId)).toEqual([9, 4]);
    expect(snapshot.aggregate).toEqual({
      totalCpu: 9,
      totalMemory: 157286400,
      processCount: 2,
      onlineCount: 1,
      stoppedCount: 0,
      erroredCount: 1,
      restartDelta: 5
    });
    expect(snapshot.selection.missingTargetPmIds).toEqual([]);
  });

  it("tracks missing targets when selected PM2 processes are no longer present", () => {
    const snapshot = buildDashboardSnapshot({
      hostId: "host-1",
      fingerprint: "fingerprint",
      host: null,
      processes,
      targets: [
        { pmId: 4, label: "API server" },
        { pmId: 77, label: "Removed app" }
      ],
      restartBaseline: new Map([[4, 5]])
    });

    expect(snapshot.processes).toHaveLength(1);
    expect(snapshot.selection.missingTargetPmIds).toEqual([77]);
    expect(snapshot.aggregate.restartDelta).toBe(0);
  });
});
