import {
  findViewServiceImportViolations,
  formatViewServiceImportViolations,
} from "../../../scripts/check-view-service-imports";

const violations = findViewServiceImportViolations();

if (violations.length > 0) {
  throw new Error(
    `View files must not import services directly:\n${formatViewServiceImportViolations(violations)}`,
  );
}

console.log("Import boundary tests passed: 1/1");
