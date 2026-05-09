export type SourceLanguage = "ts" | "tsx" | "js" | "jsx";

export type SourceSession = {
  source: string;
  filePath?: string;
  filename?: string;
  language: SourceLanguage;
  version: number;
  hash: string;
};

export type SourceSessionInput = {
  source: string;
  filePath?: string;
  filename?: string;
  language?: SourceLanguage;
  version?: number;
};
