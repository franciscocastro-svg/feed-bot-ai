import { formatFinding, scanRepository } from "./secret-scanner.mjs";

const { findings, scannedFiles } = scanRepository();

if (findings.length > 0) {
  console.error(`Secret scan failed with ${findings.length} potential finding(s).`);
  console.error("Values are hidden. Review only the file, line and rule identifiers below.");
  findings.forEach((finding) => console.error(`- ${formatFinding(finding)}`));
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed (${scannedFiles} text files checked; values never printed).`);
}
