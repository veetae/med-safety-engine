/**
 * EFFECTS VOCABULARY
 * Canonical list of allowed drug effect tags
 * 
 * ═══════════════════════════════════════════════════════════════
 * CI ENFORCEMENT RULES:
 * 1. No effect string literals allowed outside this file
 * 2. All effect tags must be in ALLOWED_EFFECTS
 * 3. Use normEffectTag() at input boundaries for case safety
 * ═══════════════════════════════════════════════════════════════
 * 
 * NAMING CONVENTION:
 * - All tags use lowercase_snake_case
 * - Legacy uppercase tags (QT_prolonging, GI_bleeding, PPI_effects, SIADH)
 *   have lowercase aliases for forward compatibility
 * 
 * Categories:
 * - Cardiovascular
 * - CNS/Neurological  
 * - Renal/Metabolic
 * - GI/Hepatic
 * - Hematologic
 */

const EFFECTS_VOCABULARY = {
  // ═══════════════════════════════════════════════════════════════
  // CARDIOVASCULAR
  // ═══════════════════════════════════════════════════════════════
  hypotensive: {
    description: "Lowers blood pressure",
    examples: ["ACE inhibitors", "ARBs", "diuretics", "alpha blockers"]
  },
  bradycardic: {
    description: "Slows heart rate",
    examples: ["beta blockers", "diltiazem", "verapamil", "digoxin"]
  },
  qt_prolonging: {
    description: "Prolongs QT interval, torsades risk",
    examples: ["amiodarone", "sotalol", "fluoroquinolones", "antipsychotics"],
    aliases: ["QT_prolonging"]
  },
  fluid_retention: {
    description: "Causes edema/volume overload",
    examples: ["NSAIDs", "thiazolidinediones", "some CCBs"]
  },

  // ═══════════════════════════════════════════════════════════════
  // CNS / NEUROLOGICAL
  // ═══════════════════════════════════════════════════════════════
  sedating: {
    description: "Causes sedation, drowsiness",
    examples: ["benzodiazepines", "opioids", "antihistamines", "TCAs"]
  },
  anticholinergic: {
    description: "Anticholinergic burden - confusion, urinary retention, constipation",
    examples: ["diphenhydramine", "oxybutynin", "TCAs", "first-gen antihistamines"]
  },
  dopamine_blocking: {
    description: "Blocks dopamine receptors - EPS, worsens Parkinson's",
    examples: ["antipsychotics", "metoclopramide", "prochlorperazine"]
  },
  serotonergic: {
    description: "Increases serotonin activity - serotonin syndrome risk",
    examples: ["SSRIs", "SNRIs", "tramadol", "trazodone", "MAOIs"]
  },
  seizure_lowering: {
    description: "Lowers seizure threshold",
    examples: ["tramadol", "bupropion", "fluoroquinolones", "antipsychotics"]
  },
  fall_risk: {
    description: "Increases fall risk via multiple mechanisms",
    examples: ["sedatives", "antihypertensives", "anticholinergics"]
  },
  respiratory_depressant: {
    description: "Depresses respiratory drive",
    examples: ["opioids", "benzodiazepines", "barbiturates"]
  },

  // ═══════════════════════════════════════════════════════════════
  // OPIOID-SPECIFIC
  // ═══════════════════════════════════════════════════════════════
  opioid: {
    description: "Opioid agonist activity",
    examples: ["morphine", "oxycodone", "hydrocodone", "fentanyl"]
  },
  constipating: {
    description: "Causes constipation",
    examples: ["opioids", "anticholinergics", "calcium channel blockers"]
  },

  // ═══════════════════════════════════════════════════════════════
  // RENAL / METABOLIC
  // ═══════════════════════════════════════════════════════════════
  nephrotoxic: {
    description: "Causes kidney injury or worsens CKD",
    examples: ["NSAIDs", "aminoglycosides", "contrast dye", "lithium"]
  },
  hyperkalemia_risk: {
    description: "Raises potassium levels",
    examples: ["ACE inhibitors", "ARBs", "potassium-sparing diuretics", "TMP-SMX"]
  },
  hypokalemia_risk: {
    description: "Lowers potassium levels",
    examples: ["loop diuretics", "thiazides", "corticosteroids"]
  },
  lactic_acidosis_risk: {
    description: "Risk of lactic acidosis",
    examples: ["metformin (in renal impairment)"]
  },
  hypoglycemia: {
    description: "Risk of hypoglycemia (short-acting)",
    examples: ["glipizide", "glimepiride", "insulin"]
  },
  hypoglycemia_prolonged: {
    description: "Risk of prolonged/severe hypoglycemia",
    examples: ["glyburide", "chlorpropamide"],
    note: "Long-acting sulfonylureas - avoid in elderly/CKD"
  },

  // ═══════════════════════════════════════════════════════════════
  // GI / HEPATIC
  // ═══════════════════════════════════════════════════════════════
  gi_bleeding: {
    description: "Increases GI bleeding risk",
    examples: ["NSAIDs", "aspirin", "corticosteroids"],
    aliases: ["GI_bleeding"]
  },
  hepatotoxic: {
    description: "Causes liver injury",
    examples: ["acetaminophen (high dose)", "statins", "amiodarone"]
  },
  ppi_effects: {
    description: "Long-term PPI effects - fracture risk, hypomagnesemia, C.diff",
    examples: ["omeprazole", "pantoprazole", "esomeprazole"],
    aliases: ["PPI_effects"]
  },
  siadh: {
    description: "Causes SIADH / hyponatremia",
    examples: ["SSRIs", "carbamazepine", "chlorpropamide"],
    aliases: ["SIADH"]
  },

  // ═══════════════════════════════════════════════════════════════
  // HEMATOLOGIC
  // ═══════════════════════════════════════════════════════════════
  antiplatelet: {
    description: "Inhibits platelet function",
    examples: ["aspirin", "clopidogrel", "NSAIDs"]
  },
  anticoagulant: {
    description: "Anticoagulant effect",
    examples: ["warfarin", "apixaban", "rivaroxaban", "heparin"]
  },
  bleeding_risk: {
    description: "General bleeding risk",
    examples: ["anticoagulants", "antiplatelets", "SSRIs"]
  }
};

// ═══════════════════════════════════════════════════════════════
// DERIVED LOOKUPS
// ═══════════════════════════════════════════════════════════════

// Primary canonical tags (lowercase)
const ALLOWED_EFFECTS = Object.keys(EFFECTS_VOCABULARY);

// Build alias map for legacy uppercase support
const ALIAS_TO_CANONICAL = {};
for (const [canonical, def] of Object.entries(EFFECTS_VOCABULARY)) {
  if (def.aliases) {
    for (const alias of def.aliases) {
      ALIAS_TO_CANONICAL[alias] = canonical;
      ALIAS_TO_CANONICAL[alias.toLowerCase()] = canonical;
    }
  }
  // Also map the canonical to itself for normalization
  ALIAS_TO_CANONICAL[canonical] = canonical;
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION & NORMALIZATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════

// Track alias usage for deprecation warnings (one-time per tag)
const _aliasWarningsLogged = new Set();

/**
 * Normalize an effect tag to canonical lowercase form
 * Handles legacy uppercase tags (QT_prolonging -> qt_prolonging)
 * Logs deprecation warning on first use of legacy alias
 * @param {string} tag 
 * @returns {string} Canonical lowercase tag
 */
function normEffectTag(tag) {
  if (!tag || typeof tag !== 'string') return '';
  const trimmed = tag.trim();
  
  // Check alias map first (handles QT_prolonging -> qt_prolonging)
  if (ALIAS_TO_CANONICAL[trimmed]) {
    const canonical = ALIAS_TO_CANONICAL[trimmed];
    
    // Warn on legacy alias usage (once per tag)
    if (trimmed !== canonical && !_aliasWarningsLogged.has(trimmed)) {
      _aliasWarningsLogged.add(trimmed);
      console.warn(`[DEPRECATED] Effect alias "${trimmed}" -> use "${canonical}" instead`);
    }
    
    return canonical;
  }
  
  // Fallback: lowercase
  return trimmed.toLowerCase();
}

/**
 * Validate that an effect tag is in the vocabulary
 * Accepts both canonical and aliased forms
 * @param {string} effect 
 * @returns {boolean}
 */
function isValidEffect(effect) {
  if (!effect || typeof effect !== 'string') return false;
  const normalized = normEffectTag(effect);
  return ALLOWED_EFFECTS.includes(normalized);
}

/**
 * Validate all effects in an array
 * Handles null/undefined input safely
 * @param {string[]|null|undefined} effects 
 * @returns {{ valid: boolean, invalid: string[], normalized: string[] }}
 */
function validateEffects(effects) {
  // Coerce to array safely
  const arr = Array.isArray(effects) ? effects : [];
  
  const normalizedSet = new Set(); // Dedupe
  const invalid = [];
  
  for (const e of arr) {
    if (!e || typeof e !== 'string') continue;
    const norm = normEffectTag(e);
    if (ALLOWED_EFFECTS.includes(norm)) {
      normalizedSet.add(norm);
    } else {
      invalid.push(e);
    }
  }
  
  const normalized = Array.from(normalizedSet);
  
  return {
    valid: invalid.length === 0,
    invalid,
    normalized // Always returned, deduped
  };
}

/**
 * Normalize an array of effects to canonical form
 * Filters out invalid effects silently
 * @param {string[]|null|undefined} effects 
 * @returns {string[]} Array of canonical effect tags
 */
function normalizeEffects(effects) {
  return validateEffects(effects).normalized;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  EFFECTS_VOCABULARY,
  ALLOWED_EFFECTS,
  ALIAS_TO_CANONICAL,
  normEffectTag,
  isValidEffect,
  validateEffects,
  normalizeEffects
};
