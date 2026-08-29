export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

export function dockerMountPath(hostPath: string): string {
  const posix = toPosix(hostPath);
  const drive = /^([A-Za-z]):\/(.*)$/.exec(posix);
  if (!drive) return posix;
  return `/${drive[1].toLowerCase()}/${drive[2]}`;
}
