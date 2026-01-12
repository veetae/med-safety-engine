/**
 * CI VALIDATOR: Effects Vocabulary Enforcement
 * 
 * Scans codebase for effect arrays and validates all tags are in ALLOWED_EFFECTS
 * 
 * Run: node scripts/validate_effects.mjs
 * Exit code 0 = pass, 1 = fail
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load vocabulary
const vocabPath = path.join(ROOT, 'constants', 'effects_vocabulary.js');
const vocabModule = await import(`file://${vocabPath}`);
const { ALLOWED_EFFECTS, ALIAS_TO_CANONICAL } = vocabModule;

// Files to scan (exclude vocabulary itself)
const SCAN_PATTERNS = [
  'functions/*.js',
  'orchestrator.js',
  'tests/*.js'
];

// Regex to find effects arrays: effects: ["tag1", "tag2"]
const EFFECTS_REGEX = /effects:\s*\[([^\]]*)\]/g;
const STRING_LITERAL_REGEX = /["']([^"']+)["']/g;

let hasErrors = false;
let totalEffects = 0;
let aliasWarnings = [];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(ROOT, filePath);
  
  let match;
  while ((match = EFFECTS_REGEX.exec(content)) !== null) {
    const arrayContent = match[1];
    let stringMatch;
    
    while ((stringMatch = STRING_LITERAL_REGEX.exec(arrayContent)) !== null) {
      const effectTag = stringMatch[1];
      totalEffects++;
      
      // Check if it's a legacy alias
      if (ALIAS_TO_CANONICAL[effectTag] && ALIAS_TO_CANONICAL[effectTag] !== effectTag) {
        aliasWarnings.push({
          file: relativePath,
          tag: effectTag,
          canonical: ALIAS_TO_CANONICAL[effectTag]
        });
      }
      
      // Check if valid (either canonical or alias)
      const isValid = ALLOWED_EFFECTS.includes(effectTag) || 
                      (ALIAS_TO_CANONICAL[effectTag] && ALLOWED_EFFECTS.includes(ALIAS_TO_CANONICAL[effectTag]));
      
      if (!isValid) {
        console.error(`❌ INVALID EFFECT: "${effectTag}" in ${relativePath}`);
        hasErrors = true;
      }
    }
  }
}

function globFiles(pattern) {
  const dir = path.dirname(pattern);
  const glob = path.basename(pattern);
  const fullDir = path.join(ROOT, dir);
  
  if (!fs.existsSync(fullDir)) return [];
  
  const files = fs.readdirSync(fullDir);
  const regex = new RegExp('^' + glob.replace('*', '.*') + '$');
  
  return files
    .filter(f => regex.test(f))
    .map(f => path.join(fullDir, f));
}

// Run scan
console.log('═══════════════════════════════════════════════════════════════');
console.log('EFFECTS VOCABULARY CI VALIDATOR');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log(`Vocabulary size: ${ALLOWED_EFFECTS.length} canonical effects\n`);
console.log('Scanning files...\n');

for (const pattern of SCAN_PATTERNS) {
  const files = globFiles(pattern);
  for (const file of files) {
    // Skip vocabulary file itself
    if (file.includes('effects_vocabulary.js')) continue;
    scanFile(file);
  }
}

// Report
console.log(`\nScanned ${totalEffects} effect tags\n`);

if (aliasWarnings.length > 0) {
  console.log('⚠️  LEGACY ALIAS WARNINGS (should migrate to canonical):');
  for (const w of aliasWarnings) {
    console.log(`   ${w.file}: "${w.tag}" → "${w.canonical}"`);
  }
  console.log('');
}

if (hasErrors) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('❌ VALIDATION FAILED - Fix invalid effects before commit');
  console.log('═══════════════════════════════════════════════════════════════');
  process.exit(1);
} else {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ VALIDATION PASSED - All effects are in vocabulary');
  console.log('═══════════════════════════════════════════════════════════════');
  process.exit(0);
}
