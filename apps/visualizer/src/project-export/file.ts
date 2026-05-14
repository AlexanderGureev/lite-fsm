import { parseProjectGraphExportDocumentText } from "./parser";
import type { ProjectGraphExportParseResult } from "./types";

export type ProjectGraphExportTextFile = Pick<File, "text">;

export const readProjectGraphExportFile = async (
  file: ProjectGraphExportTextFile,
): Promise<ProjectGraphExportParseResult> => parseProjectGraphExportDocumentText(await file.text());
