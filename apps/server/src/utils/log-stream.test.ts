import { describe, expect, it } from "vitest";

import { cleanLogLine, consumeBeginMarkerLine, shouldIgnoreLogLine } from "./log-stream";

describe("log-stream utilities", () => {
  it("marks prompt-prefixed begin marker lines as ready", () => {
    expect(
      consumeBeginMarkerLine(
        "root@Dev3:~# __PM2OP_STREAM_BEGIN__abc123",
        "__PM2OP_STREAM_BEGIN__abc123"
      )
    ).toEqual({
      matched: true,
      remainderDisplay: "",
      remainderNormalized: ""
    });
  });

  it("keeps same-line payload after the begin marker", () => {
    expect(
      consumeBeginMarkerLine(
        "root@Dev3:~# __PM2OP_STREAM_BEGIN__abc123 [api] service started",
        "__PM2OP_STREAM_BEGIN__abc123"
      )
    ).toEqual({
      matched: true,
      remainderDisplay: "[api] service started",
      remainderNormalized: "[api] service started"
    });
  });

  it("normalizes terminal control noise", () => {
    expect(cleanLogLine("\u001b[32mhello world\u001b[0m\r")).toEqual({
      displayLine: "hello world",
      normalizedLine: "hello world"
    });
  });

  it("ignores bare shell prompts", () => {
    expect(shouldIgnoreLogLine("root@Dev3:~#")).toBe(true);
    expect(shouldIgnoreLogLine("[app] booted")).toBe(false);
  });
});
