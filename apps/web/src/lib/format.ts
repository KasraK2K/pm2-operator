export function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 MB";
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

