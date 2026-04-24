import { describe, expect, it } from "vitest";

import {
  extractOsSummary,
  extractPm2Version,
  isPm2Missing,
  parseShellTranscript,
  stripEchoedShellLines,
  wrapCommandForLoginShell
} from "./ssh.service";

describe("ssh.service", () => {
  it("wraps remote commands through the user's login shell when possible", () => {
    const wrapped = wrapCommandForLoginShell("pm2 -v");

    expect(wrapped).toContain('"$SHELL" -lc');
    expect(wrapped).toContain("bash -lc");
    expect(wrapped).toContain("zsh -lc");
    expect(wrapped).not.toContain("\n");
  });

  it("does not treat normal pm2 stderr output as pm2 missing", () => {
    expect(
      isPm2Missing({
        exitCode: 0,
        stdout: "6.0.8",
        stderr: "[PM2] Spawning PM2 daemon with pm2_home=/home/app/.pm2",
        fingerprint: "fingerprint"
      })
    ).toBe(false);
  });

  it("detects command-not-found failures for pm2", () => {
    expect(
      isPm2Missing({
        exitCode: 127,
        stdout: "",
        stderr: "bash: pm2: command not found",
        fingerprint: "fingerprint"
      })
    ).toBe(true);
  });

  it("extracts the pm2 version from combined output", () => {
    expect(
      extractPm2Version({
        exitCode: 0,
        stdout: "",
        stderr: "[PM2] PM2 Successfully daemonized\n6.0.8",
        fingerprint: "fingerprint"
      })
    ).toBe("6.0.8");
  });

  it("extracts a clean os summary from prompt-polluted uname output", () => {
    expect(
      extractOsSummary({
        exitCode: 0,
        stdout:
          "root@Dev3:~# Linux Dev3 5.4.0-156-generic #173-Ubuntu SMP Tue Jul 11 07:25:22 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux root@Dev3:~#",
        stderr: "",
        fingerprint: "fingerprint"
      })
    ).toBe("Linux Dev3 5.4.0-156-generic #173-Ubuntu SMP Tue Jul 11 07:25:22 UTC 2023 x86_64 x86_64 x86_64 GNU/Linux");
  });

  it("parses marker lines even when the shell echoes the printf commands", () => {
    const beginMarker = "__PM2OP_BEGIN__abc123";
    const exitPrefix = "__PM2OP_EXIT__abc123:";
    const wrappedCommand = `if [ -n "$SHELL" ]; then "$SHELL" -lc 'pm2 jlist'; fi`;
    const echoedExit = `printf '${exitPrefix}%s\\n' "$?"`;
    const transcript = [
      `printf '${beginMarker}\\n'`,
      beginMarker,
      wrappedCommand,
      '[{"name":"api"}]',
      echoedExit,
      `${exitPrefix}0`,
      "$ "
    ].join("\n");

    const parsed = parseShellTranscript(transcript, beginMarker, exitPrefix);

    expect(parsed).toEqual({
      body: `${wrappedCommand}\n[{"name":"api"}]\n${echoedExit}`,
      exitCode: 0
    });

    expect(stripEchoedShellLines(parsed.body, [wrappedCommand, echoedExit])).toBe('[{"name":"api"}]');
  });

  it("parses marker lines even when the shell prefixes prompts before them", () => {
    const beginMarker = "__PM2OP_BEGIN__f35f8abd79ed4696b29bd0b84a1e230c";
    const exitPrefix = "__PM2OP_EXIT__f35f8abd79ed4696b29bd0b84a1e230c:";
    const transcript = [
      "Last login: Fri Apr 17 07:12:36 2026 from 87.241.156.219",
      `root@Dev3:~# ${beginMarker}`,
      "root@Dev3:~# > > > > > > > > > > > [{\"pid\":1673565,\"name\":\"pm2-logrotate\"}]",
      `root@Dev3:~# ${exitPrefix}0`
    ].join("\n");

    expect(parseShellTranscript(transcript, beginMarker, exitPrefix)).toEqual({
      body: "root@Dev3:~# > > > > > > > > > > > [{\"pid\":1673565,\"name\":\"pm2-logrotate\"}]\nroot@Dev3:~#",
      exitCode: 0
    });
  });

  it("keeps command output when the exit marker is appended on the same prompt line", () => {
    const beginMarker = "__PM2OP_BEGIN__e34745bec9884d5cbeb11659c0c21ef1";
    const exitPrefix = "__PM2OP_EXIT__e34745bec9884d5cbeb11659c0c21ef1:";
    const transcript = [
      "Last login: Fri Apr 17 12:50:57 2026 from 87.241.156.219",
      `root@Dev3:~# ${beginMarker}`,
      `root@Dev3:~# [{"name":"api","pm_id":1}]root@Dev3:~# ${exitPrefix}0`,
      "root@Dev3:~# logout"
    ].join("\n");

    expect(parseShellTranscript(transcript, beginMarker, exitPrefix)).toEqual({
      body: 'root@Dev3:~# [{"name":"api","pm_id":1}]root@Dev3:~#',
      exitCode: 0
    });
  });
});
