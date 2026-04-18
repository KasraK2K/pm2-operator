export function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 MB";
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function formatLoadAverage(loadAverage: number[]) {
  if (loadAverage.length === 0) {
    return "n/a";
  }

  return loadAverage.slice(0, 3).map((value) => value.toFixed(2)).join(" / ");
}

export function formatHostOs(value: string | null) {
  if (!value) {
    return "n/a";
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  const linuxMatch = normalized.match(
    /^Linux\s+\S+\s+(\S+)\s+(.+?)\s+(x86_64|aarch64|arm64|armv7l|i686|ppc64le|s390x)\s+(?:x86_64|aarch64|arm64|armv7l|i686|ppc64le|s390x)\s+(?:x86_64|aarch64|arm64|armv7l|i686|ppc64le|s390x)\s+GNU\/Linux$/i
  );

  if (linuxMatch) {
    const kernel = linuxMatch[1];
    const details = linuxMatch[2];
    const architecture = linuxMatch[3];
    const distroMatch = details.match(/#\S+-([A-Za-z][A-Za-z0-9._-]*)\b/);
    const label = distroMatch?.[1] ?? "Linux";
    return `${label} • Kernel ${kernel} • ${architecture}`;
  }

  const darwinMatch = normalized.match(/^Darwin\s+\S+\s+(\S+)\s+(\S+)/i);

  if (darwinMatch) {
    return `macOS • Kernel ${darwinMatch[1]} • ${darwinMatch[2]}`;
  }

  return normalized;
}

export function formatLastTested(timestamp: string | null) {
  if (!timestamp) {
    return "Not tested";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

export function formatUptime(pmUptime: number | null) {
  if (!pmUptime) {
    return "n/a";
  }

  const diff = Math.max(0, Date.now() - pmUptime);
  const minutes = Math.floor(diff / 60000);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(timestamp));
}
