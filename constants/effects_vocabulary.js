/**
 * EFFECTS VOCABULARY
 * Canonical list of allowed drug effect tags
 * 
 * Future CI should enforce: no effect string used unless listed here
 * 
 * Categories:
 * - Cardiovascular
 * - CNS/Neurological
 * - Renal/Metabolic
 * - GI/Hepatic
 * - Hematologic
 * - Other
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
  QT_prolonging: {
    description: "Prolongs QT interval, torsades risk",
    examples: ["amiodarone", "sotalol", "fluoroquinolones", "antipsychotics"]
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
  GI_bleeding: {
    description: "Increases GI bleeding risk",
    examples: ["NSAIDs", "aspirin", "corticosteroids"]
  },
  hepatotoxic: {
    description: "Causes liver injury",
    examples: ["acetaminophen (high dose)", "statins", "amiodarone"]
  },
  PPI_effects: {
    description: "Long-term PPI effects - fracture risk, hypomagnesemia, C.diff",
    examples: ["omeprazole", "pantoprazole", "esomeprazole"]
  },
  SIADH: {
    description: "Causes SIADH / hyponatremia",
    examples: ["SSRIs", "carbamazepine", "chlorpropamide"]
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

// Extract just the tag names for validation
const ALLOWED_EFFECTS = Object.keys(EFFECTS_VOCABULARY);

/**
 * Validate that an effect tag is in the vocabulary
 * @param {string} effect 
 * @returns {boolean}
 */
function isValidEffect(effect) {
  return ALLOWED_EFFECTS.includes(effect);
}

/**
 * Validate all effects in an array
 * @param {string[]} effects 
 * @returns {{ valid: boolean, invalid: string[] }}
 */
function validateEffects(effects) {
  const invalid = effects.filter(e => !isValidEffect(e));
  return {
    valid: invalid.length === 0,
    invalid
  };
}

module.exports = {
  EFFECTS_VOCABULARY,
  ALLOWED_EFFECTS,
  isValidEffect,
  validateEffects
};
