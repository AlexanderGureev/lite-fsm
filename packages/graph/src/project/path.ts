export const normalizeProjectPath = (fileName: string): string => {
  return fileName.replace(/\\/g, "/").replace(/\/+/g, "/");
};

export const dirname = (fileName: string): string => {
  const normalized = normalizeProjectPath(fileName);
  const index = normalized.lastIndexOf("/");

  if (index <= 0) return normalized.startsWith("/") ? "/" : ".";

  return normalized.slice(0, index);
};

export const exportedPath = (fileName: string, projectRoot: string): string => {
  const normalizedFileName = normalizeProjectPath(fileName);
  const normalizedRoot = normalizeProjectPath(projectRoot).replace(/\/$/, "");

  if (normalizedFileName === normalizedRoot) return ".";
  if (normalizedFileName.startsWith(`${normalizedRoot}/`)) {
    return normalizedFileName.slice(normalizedRoot.length + 1);
  }

  return normalizedFileName;
};

export const projectRootFromOptions = (entryFileName: string, projectRoot: string | undefined): string => {
  return normalizeProjectPath(projectRoot ?? dirname(entryFileName));
};
