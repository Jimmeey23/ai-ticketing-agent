import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ticketing/ChatInterface.tsx', import.meta.url), 'utf8');
const contextPickerSource = readFileSync(new URL('../src/components/ticketing/ContextPicker.tsx', import.meta.url), 'utf8');
const intakeRulesSource = readFileSync(new URL('../src/lib/intake-rules.ts', import.meta.url), 'utf8');
const sourceWithoutComments = `${source}\n${contextPickerSource}`
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');
const intakeRulesWithoutComments = intakeRulesSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');

const requirePattern = (pattern, message) => {
  if (!pattern.test(sourceWithoutComments)) throw new Error(message);
};

const rejectPattern = (pattern, message) => {
  if (pattern.test(sourceWithoutComments)) throw new Error(message);
};

const forbiddenEarlyDraftPattern =
  /data\?\.needsMoreInfo\s*&&\s*contextReadyForDraft\s*\?\s*buildClientDraft/s;

if (forbiddenEarlyDraftPattern.test(source)) {
  throw new Error(
    'Intake regression: the UI can render a fallback ticket draft while the backend still says needsMoreInfo.'
  );
}

if (!/function\s+detailFormForContext\b/.test(sourceWithoutComments)) {
  throw new Error('Intake regression: missing local required-field fallback form for incomplete intake context.');
}

requirePattern(
  /import\s*\{[\s\S]*captureMemberVoiceFromText[\s\S]*getMissingIntakeFields[\s\S]*isMissingIntakeValue[\s\S]*IntakeContext[\s\S]*\}\s*from\s*['"]@\/lib\/intake-rules['"]/,
  'Intake regression: ChatInterface must import all shared intake-rule helpers.'
);

rejectPattern(
  /\b(?:function|const|let|var)\s+shouldCaptureAsMemberVoice\b/,
  'Intake regression: ChatInterface must not define local member voice capture rules.'
);

rejectPattern(
  /\bconst\s+PLACEHOLDER_VALUE_PATTERN\s*=/,
  'Intake regression: ChatInterface must not define a local placeholder-value pattern.'
);

rejectPattern(
  /fastGateForm\(activeContext\)/,
  'Intake regression: ChatInterface must not require route/category selection before Athena inference.'
);

rejectPattern(
  /Start with|Choose the intake route|Select intake route|Start by choosing the intake route/,
  'Intake regression: the intake UI must not present a route-first starting flow.'
);

rejectPattern(
  /<QuickTemplates|QuickTemplates\s+onSelect/,
  'Intake regression: route/template starter cards must not be shown on first load.'
);

rejectPattern(
  /label=["']Reported by["']|label=\{["']Reported by["']\}/,
  'Intake regression: reportedBy must be supplied from auth, not selected manually in the intake flow.'
);

requirePattern(
  /useBackendAuth\(\)[\s\S]*reportedBy:\s*reporterName/,
  'Intake regression: ChatInterface must seed reportedBy from the signed-in user.'
);

rejectPattern(
  /description:\s*ctx\.description\s*\|\|\s*draft\.description/,
  'Intake regression: AI draft descriptions must not mask missing captured member voice.'
);

rejectPattern(
  /field\.id\s*===\s*['"](?:memberName|memberContact|classType|membership)['"]\)\s*return\s+Boolean\(/,
  'Intake regression: special field pruning must use isMissingIntakeValue semantics, not plain Boolean checks.'
);

requirePattern(
  /function\s+requiredFieldsForIssue[\s\S]*return\s+getMissingIntakeFields\(mergedContext\)/,
  'Intake regression: ChatInterface must delegate missing intake fields to getMissingIntakeFields.'
);

requirePattern(
  /const\s+capturedVoice\s*=[\s\S]*captureMemberVoiceFromText\(text,\s*activeContext\)[\s\S]*applyDetailValue\(activeContext,\s*['"]description['"],\s*capturedVoice\)/,
  'Intake regression: ChatInterface must capture free-form member voice through captureMemberVoiceFromText.'
);

if (!/export\s+function\s+getMissingIntakeFields\b/.test(intakeRulesWithoutComments)) {
  throw new Error('Intake regression: extracted intake publishability rules are missing getMissingIntakeFields.');
}

console.log('Intake flow regression checks passed.');
