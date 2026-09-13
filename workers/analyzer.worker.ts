import { analyzeChange, type AnalysisOptions, type RepositoryFile } from "../lib/analyzer";

type AnalyzeMessage = {
  id: number;
  diff: string;
  files: RepositoryFile[];
  options: AnalysisOptions;
};

self.onmessage = (event: MessageEvent<AnalyzeMessage>) => {
  const { id, diff, files, options } = event.data;
  try {
    self.postMessage({ id, result: analyzeChange(diff, files, options) });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "The analysis worker failed.",
    });
  }
};

export {};
