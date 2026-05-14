import { Project, type Node, type SourceFile, ts } from "ts-morph";
import type { CompileLiteFsmGraphOptions, GraphDiagnostic, GraphLanguage, SourceLocation } from "../types";

export type SourceAdapter = {
  sourceFile: SourceFile;
  filename: string;
  language: GraphLanguage;
  sourceText: string;
  diagnostics: GraphDiagnostic[];
  locFromNode(node: Node): SourceLocation;
  locFromOffsets(start: number, end: number): SourceLocation;
  textOf(node: Node): string;
};

const EXTENSION_BY_LANGUAGE = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
} as const;

const LANGUAGE_BY_EXTENSION: Record<string, Exclude<GraphLanguage, "unknown">> = {
  ".ts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".jsx": "jsx",
};

type CompilerSourceFileWithParseDiagnostics = ts.SourceFile & {
  parseDiagnostics: readonly ts.DiagnosticWithLocation[];
};

type SourceAdapterOptions = Pick<CompileLiteFsmGraphOptions, "filename" | "language"> & {
  locFileName?: string;
};

export const inferGraphLanguage = (
  filename: string | undefined,
  language: CompileLiteFsmGraphOptions["language"],
): GraphLanguage => {
  if (language) return language;
  if (!filename) return "unknown";

  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) return "unknown";

  return LANGUAGE_BY_EXTENSION[filename.slice(dotIndex)] ?? "unknown";
};

export const createVirtualFilename = (
  filename: string | undefined,
  language: GraphLanguage,
): string => {
  if (filename) return filename;
  const extension = language === "unknown" ? "ts" : EXTENSION_BY_LANGUAGE[language];

  return `lite-fsm-graph-input.${extension}`;
};

export const createSourceAdapter = (
  sourceText: string,
  options: SourceAdapterOptions = {},
): SourceAdapter => {
  const language = inferGraphLanguage(options.filename, options.language);
  const filename = createVirtualFilename(options.filename, language);
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noResolve: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const sourceFile = project.createSourceFile(filename, sourceText, { overwrite: true });

  const locFromOffsets = (start: number, end: number): SourceLocation => {
    const normalizedStart = Math.max(0, start);
    const normalizedEnd = Math.max(normalizedStart, end);
    const startPosition = sourceFile.getLineAndColumnAtPos(normalizedStart);
    const endPosition = sourceFile.getLineAndColumnAtPos(normalizedEnd);

    return {
      ...(options.locFileName ? { fileName: options.locFileName } : {}),
      start: {
        line: startPosition.line,
        column: startPosition.column,
        offset: normalizedStart,
      },
      end: {
        line: endPosition.line,
        column: endPosition.column,
        offset: normalizedEnd,
      },
    };
  };

  const compilerSourceFile = sourceFile.compilerNode as CompilerSourceFileWithParseDiagnostics;
  const diagnostics = compilerSourceFile.parseDiagnostics.map((diagnostic) => {
    const start = diagnostic.start;
    const end = start + diagnostic.length;

    return {
      code: "LFG_SOURCE_PARSE_ERROR",
      severity: "error",
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      loc: locFromOffsets(start, end),
    } satisfies GraphDiagnostic;
  });

  return {
    sourceFile,
    filename,
    language,
    sourceText,
    diagnostics,
    locFromNode(node) {
      return locFromOffsets(node.getStart(), node.getEnd());
    },
    locFromOffsets,
    textOf(node) {
      return node.getText();
    },
  };
};
