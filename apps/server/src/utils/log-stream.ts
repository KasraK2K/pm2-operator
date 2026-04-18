import { stripAnsiSequences } from "./pm2";

export function cleanLogLine(line: string) {
  const displayLine = stripAnsiSequences(line).replace(/\r/g, "").replace(/\u0007/g, "");

  return {
    displayLine: displayLine.trimEnd(),
    normalizedLine: displayLine.trim()
  };
}

export function consumeBeginMarkerLine(line: string, beginMarker: string) {
  const cleaned = cleanLogLine(line);
  const displayIndex = cleaned.displayLine.indexOf(beginMarker);
  const normalizedIndex = cleaned.normalizedLine.indexOf(beginMarker);

  if (displayIndex === -1 && normalizedIndex === -1) {
    return {
      matched: false,
      remainderDisplay: "",
      remainderNormalized: ""
    };
  }

  if (displayIndex === -1) {
    return {
      matched: true,
      remainderDisplay: "",
      remainderNormalized: ""
    };
  }

  const remainderDisplay = cleaned.displayLine.slice(displayIndex + beginMarker.length).trim();

  return {
    matched: true,
    remainderDisplay,
    remainderNormalized: remainderDisplay.trim()
  };
}

export function shouldIgnoreLogLine(normalizedLine: string) {
  if (!normalizedLine) {
    return true;
  }

  if (normalizedLine.startsWith("[TAILING] Tailing last")) {
    return true;
  }

  if (/\/\.pm2\/logs\/.+ last \d+ lines:$/.test(normalizedLine)) {
    return true;
  }

  return /^[^\s@]+@[^:\s]+(?::.*)?[#>$]$/.test(normalizedLine);
}
