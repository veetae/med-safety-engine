/**
 * ICD-10 CONDITION MAPPER
 * Function 07 - Maps ICD-10 codes to clinical conditions and contraindicated effects
 * 
 * Architecture: Hierarchical prefix matching (per Perplexity recommendation)
 * - ICD codes normalized (uppercase, no dots)
 * - Prefix scan for hierarchical matching (G30.1 matches G30)
 * - O(#diagnoses × ~5 prefixes) with hash-map lookup
 */

// ═══════════════════════════════════════════════════════════════
// 1. CONDITION_GROUPERS - ICD prefixes → condition keys
// ═══════════════════════════════════════════════════════════════
const CONDITION_GROUPERS = [
  {
    conditionKey: "dementia",
    icdPrefixes: ["F01", "F02", "F03", "G30", "G31"],
    reason: "Cognitive worsening, confusion, delirium",
    note: "Antipsychotics increase mortality in dementia"
  },
  {
    conditionKey: "falls_history_fracture_risk",
    icdPrefixes: ["W18", "W19", "R296", "Z8739", "M80", "M81"],
    reason: "High fall risk and injury risk; sedatives and hypotensive agents increase falls",
    note: "Consider fall-risk mitigation and deprescribing where feasible"
  },
  {
    conditionKey: "heart_failure",
    icdPrefixes: ["I50", "I110", "I130", "I132"],
    reason: "Fluid retention and renal perfusion vulnerability worsen heart failure outcomes",
    note: "Avoid agents that worsen edema/volume overload; monitor renal function closely"
  },
  {
    conditionKey: "syncope",
    icdPrefixes: ["R55"],
    reason: "Syncope risk increases with hypotension, bradycardia, and QT-prolonging agents",
    note: "Review BP/HR/QTc-lowering contributors and orthostasis risk"
  },
  {
    conditionKey: "parkinsons_disease",
    icdPrefixes: ["G20", "G21"],
    reason: "Dopamine blockade can worsen parkinsonism and precipitate severe rigidity",
    note: "Exclude quetiapine and clozapine from dopamine-blocking avoidance logic (handled in drug layer)"
  },
  {
    conditionKey: "seizure_disorder",
    icdPrefixes: ["G40", "G41", "R56"],
    reason: "Lowering seizure threshold increases seizure risk",
    note: "Prioritize alternatives with neutral seizure-threshold profile"
  },
  {
    conditionKey: "gi_bleed_peptic_ulcer_history",
    icdPrefixes: ["K25", "K26", "K27", "K920", "K921", "K922"],
    reason: "History of ulcer/bleeding increases recurrence risk with GI-toxic agents and platelet inhibition",
    note: "Consider gastroprotection where indicated and avoid unnecessary combinations"
  },
  {
    conditionKey: "ckd_stage_4_5",
    icdPrefixes: ["N184", "N185", "N186"],
    reason: "Advanced CKD increases toxicity risk from nephrotoxic agents and renally-cleared drugs",
    note: "Dose adjustments and avoidance decisions should be conservative"
  },
  {
    conditionKey: "urinary_retention_bph",
    icdPrefixes: ["R33", "N40"],
    reason: "Anticholinergic effects worsen urinary retention and obstructive symptoms",
    note: "Prefer non-anticholinergic alternatives when feasible"
  },
  {
    conditionKey: "chronic_constipation",
    icdPrefixes: ["K590"],
    reason: "Constipation worsens with anticholinergic and constipating agents",
    note: "Ensure bowel regimen if constipating therapy unavoidable"
  },
  {
    conditionKey: "narrow_angle_glaucoma",
    icdPrefixes: ["H402"],
    reason: "Anticholinergic effects can precipitate angle closure and vision-threatening events",
    note: "Avoid anticholinergics unless ophthalmology-cleared"
  },
  {
    conditionKey: "qt_prolongation",
    icdPrefixes: ["I4581", "R9431"],
    reason: "QT prolongation increases torsades risk with QT-prolonging agents",
    note: "Monitor ECG and electrolytes; avoid stacking QT-prolongers"
  },
  {
    conditionKey: "bradycardia",
    icdPrefixes: ["R001", "I495"],
    reason: "Bradycardia worsens with bradycardic agents and can contribute to syncope",
    note: "Assess conduction disease and medication contributors"
  },
  {
    conditionKey: "orthostatic_hypotension",
    icdPrefixes: ["I951"],
    reason: "Orthostasis worsens with hypotensive agents and increases falls/syncope risk",
    note: "Review volume status and BP-lowering burden"
  },
  {
    conditionKey: "delirium",
    icdPrefixes: ["F05", "R410"],
    reason: "Delirium worsens with anticholinergic burden, sedation, and dopamine blockade",
    note: "Prefer non-deliriogenic alternatives; minimize polypharmacy"
  },
  {
    conditionKey: "copd_respiratory_disease",
    icdPrefixes: ["J44", "J43", "J45"],
    reason: "Respiratory depression and sedation increase hypoventilation and exacerbation risk",
    note: "Avoid stacking respiratory depressants; consider naloxone education when opioids used"
  },
  {
    conditionKey: "cirrhosis_liver_disease",
    icdPrefixes: ["K70", "K74", "K76"],
    reason: "Hepatic impairment increases toxicity risk and sedation sensitivity; hepatotoxicity risk is higher",
    note: "Dose-adjust hepatically cleared meds and avoid hepatotoxic agents when possible"
  },
  {
    conditionKey: "osteoporosis",
    icdPrefixes: ["M80", "M81"],
    reason: "Fracture risk increases with falls; long-term PPI-associated effects may worsen bone health",
    note: "Minimize fall-risk agents; reassess long-term PPI necessity"
  },
  {
    conditionKey: "atrial_fibrillation",
    icdPrefixes: ["I48"],
    reason: "Atrial fibrillation impacts anticoagulation decisions and bleed/stroke risk modeling",
    note: "Used for anticoagulation pathway logic (not a direct avoid-effects driver by default)"
  },
  {
    conditionKey: "diabetes_hypoglycemia_risk",
    icdPrefixes: ["E1164", "E1165"],
    reason: "History of hypoglycemia increases risk with long-acting sulfonylureas",
    note: "Avoid glyburide/chlorpropamide; prefer shorter-acting agents"
  }
];


// ═══════════════════════════════════════════════════════════════
// 2. CONDITION_AVOID_EFFECTS - condition key → effects to avoid
// ═══════════════════════════════════════════════════════════════
const CONDITION_AVOID_EFFECTS = {
  dementia: {
    effects: ["anticholinergic", "sedating"],
    reason: "Cognitive worsening, confusion, delirium",
    note: "Antipsychotics increase mortality in dementia"
  },

  falls_history_fracture_risk: {
    effects: ["sedating", "hypotensive", "fall_risk"],
    reason: "High fall risk and injury risk; sedatives and hypotensive agents increase falls",
    note: "Consider fall-risk mitigation and deprescribing where feasible"
  },

  heart_failure: {
    effects: ["fluid_retention", "nephrotoxic"],
    reason: "Fluid retention and renal perfusion vulnerability worsen heart failure outcomes",
    note: "Avoid agents that worsen edema/volume overload; monitor renal function closely"
  },

  syncope: {
    effects: ["hypotensive", "bradycardic", "QT_prolonging"],
    reason: "Syncope risk increases with hypotension, bradycardia, and QT-prolonging agents",
    note: "Review BP/HR/QTc-lowering contributors and orthostasis risk"
  },

  parkinsons_disease: {
    effects: ["dopamine_blocking"],
    reason: "Dopamine blockade can worsen parkinsonism and precipitate severe rigidity",
    note: "Exclude quetiapine and clozapine from dopamine-blocking avoidance logic (handled in drug layer)",
    exclude_drugs: ["quetiapine", "clozapine"]
  },

  seizure_disorder: {
    effects: ["seizure_lowering"],
    reason: "Lowering seizure threshold increases seizure risk",
    note: "Prioritize alternatives with neutral seizure-threshold profile"
  },

  gi_bleed_peptic_ulcer_history: {
    effects: ["GI_bleeding", "antiplatelet"],
    reason: "History of ulcer/bleeding increases recurrence risk with GI-toxic agents and platelet inhibition",
    note: "Consider gastroprotection where indicated and avoid unnecessary combinations"
  },

  ckd_stage_4_5: {
    effects: ["nephrotoxic"],
    reason: "Advanced CKD increases toxicity risk from nephrotoxic agents and renally-cleared drugs",
    note: "Dose adjustments and avoidance decisions should be conservative"
  },

  urinary_retention_bph: {
    effects: ["anticholinergic"],
    reason: "Anticholinergic effects worsen urinary retention and obstructive symptoms",
    note: "Prefer non-anticholinergic alternatives when feasible"
  },

  chronic_constipation: {
    effects: ["anticholinergic", "constipating"],
    reason: "Constipation worsens with anticholinergic and constipating agents",
    note: "Ensure bowel regimen if constipating therapy unavoidable"
  },

  narrow_angle_glaucoma: {
    effects: ["anticholinergic"],
    reason: "Anticholinergic effects can precipitate angle closure and vision-threatening events",
    note: "Avoid anticholinergics unless ophthalmology-cleared"
  },

  qt_prolongation: {
    effects: ["QT_prolonging"],
    reason: "QT prolongation increases torsades risk with QT-prolonging agents",
    note: "Monitor ECG and electrolytes; avoid stacking QT-prolongers"
  },

  bradycardia: {
    effects: ["bradycardic"],
    reason: "Bradycardia worsens with bradycardic agents and can contribute to syncope",
    note: "Assess conduction disease and medication contributors"
  },

  orthostatic_hypotension: {
    effects: ["hypotensive"],
    reason: "Orthostasis worsens with hypotensive agents and increases falls/syncope risk",
    note: "Review volume status and BP-lowering burden"
  },

  delirium: {
    effects: ["anticholinergic", "sedating", "dopamine_blocking"],
    reason: "Delirium worsens with anticholinergic burden, sedation, and dopamine blockade",
    note: "Prefer non-deliriogenic alternatives; minimize polypharmacy"
  },

  copd_respiratory_disease: {
    effects: ["respiratory_depressant", "sedating"],
    reason: "Respiratory depression and sedation increase hypoventilation and exacerbation risk",
    note: "Avoid stacking respiratory depressants; consider naloxone education when opioids used"
  },

  cirrhosis_liver_disease: {
    effects: ["hepatotoxic", "sedating"],
    reason: "Hepatic impairment increases toxicity risk and sedation sensitivity; hepatotoxicity risk is higher",
    note: "Dose-adjust hepatically cleared meds and avoid hepatotoxic agents when possible"
  },

  osteoporosis: {
    effects: ["fall_risk", "PPI_effects"],
    reason: "Fracture risk increases with falls; long-term PPI-associated effects may worsen bone health",
    note: "Minimize fall-risk agents; reassess long-term PPI necessity"
  },

  atrial_fibrillation: {
    effects: [],
    reason: "Atrial fibrillation impacts anticoagulation decisions and bleed/stroke risk modeling",
    note: "Used for anticoagulation pathway logic (not a direct avoid-effects driver by default)"
  },

  diabetes_hypoglycemia_risk: {
    effects: ["hypoglycemia_prolonged"],
    reason: "History of hypoglycemia increases risk with long-acting sulfonylureas",
    note: "Avoid glyburide/chlorpropamide; prefer shorter-acting agents"
  }
};


// ═══════════════════════════════════════════════════════════════
// 3. HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize ICD-10 code: uppercase, remove dots, trim
 * @param {string} code 
 * @returns {string}
 */
function normICD(code) {
  return String(code || "").toUpperCase().replace(/\./g, "").trim();
}

/**
 * Build prefix index from CONDITION_GROUPERS
 * Called once at module load
 * @returns {Object} Map of prefix → conditionKey[]
 */
function buildPrefixIndex() {
  const index = {};
  for (const group of CONDITION_GROUPERS) {
    for (const rawPrefix of group.icdPrefixes) {
      const prefix = normICD(rawPrefix);
      if (!index[prefix]) index[prefix] = [];
      index[prefix].push(group.conditionKey);
    }
  }
  return index;
}

// Build index at module load
const ICD_PREFIX_TO_CONDITIONS = buildPrefixIndex();

/**
 * Derive condition keys from patient's ICD-10 codes
 * Uses hierarchical prefix matching (G30.1 matches G30)
 * @param {string[]} icdCodes - Array of ICD-10 codes
 * @returns {string[]} Array of matched condition keys
 */
function deriveConditionsFromICD(icdCodes) {
  const conditions = new Set();

  for (const rawCode of (icdCodes || [])) {
    const code = normICD(rawCode);
    if (code.length < 3) continue;

    // Generate prefixes from longest to shortest (min length 3)
    // "G301" → ["G301", "G30", "G3"] but we only check ≥3
    for (let len = code.length; len >= 3; len--) {
      const prefix = code.slice(0, len);
      const mapped = ICD_PREFIX_TO_CONDITIONS[prefix];
      if (mapped) {
        mapped.forEach(c => conditions.add(c));
      }
    }
  }

  return Array.from(conditions);
}

/**
 * Get all contraindicated effects for a patient's ICD codes
 * @param {string[]} icdCodes - Array of ICD-10 codes
 * @returns {Object} { conditionKeys, avoidEffects, byCondition }
 */
function getContraindicatedEffects(icdCodes) {
  const conditionKeys = deriveConditionsFromICD(icdCodes);
  const avoidEffects = new Set();
  const byCondition = {};

  for (const c of conditionKeys) {
    const entry = CONDITION_AVOID_EFFECTS[c];
    if (!entry) continue;

    byCondition[c] = {
      effects: Array.isArray(entry.effects) ? entry.effects.slice() : [],
      reason: entry.reason || null,
      note: entry.note || null,
      exclude_drugs: entry.exclude_drugs || null
    };

    for (const eff of (entry.effects || [])) {
      avoidEffects.add(eff);
    }
  }

  return {
    conditionKeys,
    avoidEffects: Array.from(avoidEffects),
    byCondition
  };
}


// ═══════════════════════════════════════════════════════════════
// 4. EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  CONDITION_GROUPERS,
  CONDITION_AVOID_EFFECTS,
  ICD_PREFIX_TO_CONDITIONS,
  normICD,
  deriveConditionsFromICD,
  getContraindicatedEffects
};
