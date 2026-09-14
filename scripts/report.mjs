import fs from "node:fs";
import path from "node:path";

import { buildEvaluationArtifacts } from "./evaluation-report.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const evaluationRoot = path.join(projectRoot, "evaluation");
const examples = JSON.parse(fs.readFileSync(path.join(evaluationRoot, "examples.json"), "utf8"));
const result = buildEvaluationArtifacts(examples, evaluationRoot);
process.stdout.write(`Regenerated evaluation report from ${result.totalLabeledPullRequests} committed examples.\n`);
