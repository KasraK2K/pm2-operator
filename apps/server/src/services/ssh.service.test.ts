import { describe, expect, it } from "vitest";

import {
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

  it("parses marker lines even when the shell echoes the printf commands", () => {
    const beginMarker = "__PM2LV_BEGIN__abc123";
    const exitPrefix = "__PM2LV_EXIT__abc123:";
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
});
