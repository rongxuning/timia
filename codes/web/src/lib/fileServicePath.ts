export function isFileServicePath(path: string): boolean {
  const pathname = path.split("?", 1)[0] ?? path;
  return (
    pathname === "/files" ||
    pathname.startsWith("/files/") ||
    pathname === "/views/file-browser" ||
    pathname.startsWith("/views/file-browser/")
  );
}
