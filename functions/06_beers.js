/**
 * BEERS CRITERIA CHECK - TOXICOLOGY-BASED APPROACH
 * Function 06 - Domain: BEERS
 * 
 * AGS 2023 Beers Criteria for Potentially Inappropriate Medications in Older Adults
 * Refactored to use pharmacological effect mapping instead of therapeutic class matching
 * 
 * This approach enables:
 * 1. More accurate drug-disease interaction detection
 * 2. Toxidrome identification for unknown ingestions
 * 3. Cumulative effect burden calculation (anticholinergic, sedating, etc.)
 */

const { ALERT_CODES } = require("../constants/alert_codes.js");
const { 
  deriveConditionsFromICD, 
  getContraindicatedEffects,
  CONDITION_AVOID_EFFECTS: ICD_CONDITION_EFFECTS 
} = require("./07_icd_condition_mapper.js");
const { logUnknownDrug } = require("../utils/unknown_drugs.js");

// ═══════════════════════════════════════════════════════════════
// TOXIDROMES - Clinical syndrome patterns
// ═══════════════════════════════════════════════════════════════
const TOXIDROMES = {
  anticholinergic: {
    symptoms: ["tachycardia", "dry_skin", "mydriasis", "urinary_retention", "altered_mental_status", "hyperthermia", "decreased_bowel_sounds"],
    mnemonic: "Hot as a hare, dry as a bone, red as a beet, blind as a bat, mad as a hatter"
  },
  cholinergic: {
    symptoms: ["bradycardia", "salivation", "lacrimation", "urination", "defecation", "miosis", "bronchospasm"],
    mnemonic: "SLUDGE + killer Bs (bradycardia, bronchospasm)"
  },
  serotonin: {
    symptoms: ["hyperthermia", "clonus", "hyperreflexia", "agitation", "diaphoresis", "tremor", "mydriasis"],
    criteria: "Hunter criteria"
  },
  opioid: {
    symptoms: ["miosis", "respiratory_depression", "decreased_LOC", "hypotension", "bradycardia"],
    antidote: "naloxone"
  },
  sympathomimetic: {
    symptoms: ["tachycardia", "hypertension", "hyperthermia", "mydriasis", "diaphoresis", "agitation"]
  },
  sedative_hypnotic: {
    symptoms: ["decreased_LOC", "respiratory_depression", "hypotension", "hypothermia", "ataxia"],
    antidote: "flumazenil (benzos only)"
  }
};

// ═══════════════════════════════════════════════════════════════
// DRUG EFFECTS - Pharmacological effect mapping
// Each drug maps to its clinically relevant effects
// ═══════════════════════════════════════════════════════════════
const DRUG_EFFECTS = {
  // === FIRST-GEN ANTIHISTAMINES ===
  "diphenhydramine": ["anticholinergic", "sedating"],
  "hydroxyzine": ["anticholinergic", "sedating"],
  "chlorpheniramine": ["anticholinergic", "sedating"],
  "promethazine": ["anticholinergic", "sedating", "dopamine_blocking"],
  "meclizine": ["anticholinergic", "sedating"],
  "dimenhydrinate": ["anticholinergic", "sedating"],
  "brompheniramine": ["anticholinergic", "sedating"],
  "doxylamine": ["anticholinergic", "sedating"],
  "cyproheptadine": ["anticholinergic", "sedating"],

  // === TRICYCLIC ANTIDEPRESSANTS ===
  "amitriptyline": ["anticholinergic", "sedating", "QT_prolonging"],
  "imipramine": ["anticholinergic", "sedating", "QT_prolonging"],
  "doxepin": ["anticholinergic", "sedating"],
  "nortriptyline": ["anticholinergic", "sedating", "QT_prolonging"],
  "desipramine": ["anticholinergic", "QT_prolonging"],
  "clomipramine": ["anticholinergic", "sedating", "serotonergic", "QT_prolonging"],
  "trimipramine": ["anticholinergic", "sedating"],
  "protriptyline": ["anticholinergic"],

  // === ANTICHOLINERGIC BLADDER AGENTS ===
  "oxybutynin": ["anticholinergic"],
  "tolterodine": ["anticholinergic"],
  "solifenacin": ["anticholinergic"],
  "darifenacin": ["anticholinergic"],
  "fesoterodine": ["anticholinergic"],
  "trospium": ["anticholinergic"],

  // === ANTISPASMODICS ===
  "dicyclomine": ["anticholinergic"],
  "hyoscyamine": ["anticholinergic"],
  "belladonna": ["anticholinergic"],
  "propantheline": ["anticholinergic"],
  "glycopyrrolate": ["anticholinergic"],
  "scopolamine": ["anticholinergic", "sedating"],

  // === BENZODIAZEPINES ===
  "diazepam": ["sedating", "muscle_relaxant_effect", "fall_risk"],
  "lorazepam": ["sedating", "fall_risk"],
  "alprazolam": ["sedating", "fall_risk"],
  "clonazepam": ["sedating", "fall_risk"],
  "temazepam": ["sedating", "fall_risk"],
  "triazolam": ["sedating", "fall_risk"],
  "chlordiazepoxide": ["sedating", "fall_risk"],
  "clorazepate": ["sedating", "fall_risk"],
  "flurazepam": ["sedating", "fall_risk"],
  "midazolam": ["sedating", "fall_risk"],

  // === Z-DRUGS ===
  "zolpidem": ["sedating", "fall_risk"],
  "eszopiclone": ["sedating", "fall_risk"],
  "zaleplon": ["sedating", "fall_risk"],

  // === MUSCLE RELAXANTS ===
  "cyclobenzaprine": ["anticholinergic", "sedating"],
  "methocarbamol": ["sedating"],
  "carisoprodol": ["sedating"],
  "metaxalone": ["sedating"],
  "orphenadrine": ["anticholinergic", "sedating"],
  "tizanidine": ["sedating", "hypotensive"],
  "baclofen": ["sedating"],

  // === ANTIPSYCHOTICS ===
  "haloperidol": ["dopamine_blocking", "QT_prolonging", "fall_risk"],
  "chlorpromazine": ["dopamine_blocking", "anticholinergic", "sedating", "QT_prolonging", "seizure_lowering"],
  "thioridazine": ["dopamine_blocking", "anticholinergic", "QT_prolonging", "seizure_lowering"],
  "quetiapine": ["sedating", "dopamine_blocking", "hypotensive"],
  "olanzapine": ["sedating", "dopamine_blocking", "anticholinergic"],
  "risperidone": ["dopamine_blocking", "hypotensive"],
  "aripiprazole": ["dopamine_blocking"],
  "ziprasidone": ["dopamine_blocking", "QT_prolonging"],
  "clozapine": ["sedating", "anticholinergic", "seizure_lowering"],
  "prochlorperazine": ["dopamine_blocking"],
  "metoclopramide": ["dopamine_blocking"],

  // === OPIOIDS ===
  "morphine": ["opioid", "sedating", "respiratory_depressant"],
  "hydrocodone": ["opioid", "sedating"],
  "oxycodone": ["opioid", "sedating"],
  "hydromorphone": ["opioid", "sedating", "respiratory_depressant"],
  "fentanyl": ["opioid", "sedating", "respiratory_depressant"],
  "codeine": ["opioid", "sedating"],
  "tramadol": ["opioid", "serotonergic", "seizure_lowering"],
  "meperidine": ["opioid", "sedating", "seizure_lowering", "neurotoxic"],
  "methadone": ["opioid", "sedating", "QT_prolonging"],
  "buprenorphine": ["opioid", "sedating"],
  "tapentadol": ["opioid", "serotonergic"],

  // === NSAIDs ===
  "ibuprofen": ["nephrotoxic", "GI_bleeding", "fluid_retention"],
  "naproxen": ["nephrotoxic", "GI_bleeding", "fluid_retention"],
  "diclofenac": ["nephrotoxic", "GI_bleeding", "fluid_retention"],
  "meloxicam": ["nephrotoxic", "GI_bleeding", "fluid_retention"],
  "indomethacin": ["nephrotoxic", "GI_bleeding", "fluid_retention", "CNS_effects"],
  "ketorolac": ["nephrotoxic", "GI_bleeding", "fluid_retention"],
  "piroxicam": ["nephrotoxic", "GI_bleeding", "fluid_retention"],
  "celecoxib": ["nephrotoxic", "fluid_retention"],
  "aspirin": ["GI_bleeding", "antiplatelet"],

  // === CARDIOVASCULAR ===
  "digoxin": ["arrhythmogenic", "narrow_therapeutic_index"],
  "amiodarone": ["QT_prolonging", "thyroid_effects", "pulmonary_toxicity"],
  "sotalol": ["QT_prolonging"],
  "dofetilide": ["QT_prolonging"],
  "dronedarone": ["fluid_retention"],
  "nifedipine": ["hypotensive", "reflex_tachycardia"],
  "diltiazem": ["bradycardic", "hypotensive"],
  "verapamil": ["bradycardic", "hypotensive", "constipating"],
  "doxazosin": ["hypotensive", "fall_risk"],
  "prazosin": ["hypotensive", "fall_risk"],
  "terazosin": ["hypotensive", "fall_risk"],
  "clonidine": ["sedating", "hypotensive", "bradycardic", "rebound_hypertension"],
  "methyldopa": ["sedating", "hypotensive"],

  // === DIABETES ===
  "glyburide": ["hypoglycemia_prolonged"],
  "glipizide": ["hypoglycemia"],
  "glimepiride": ["hypoglycemia"],
  "chlorpropamide": ["hypoglycemia_prolonged", "SIADH"],
  "insulin": ["hypoglycemia"],

  // === ANTICONVULSANTS ===
  "phenytoin": ["sedating", "fall_risk", "narrow_therapeutic_index"],
  "phenobarbital": ["sedating", "fall_risk"],
  "carbamazepine": ["sedating", "SIADH", "narrow_therapeutic_index"],
  "valproate": ["sedating"],
  "gabapentin": ["sedating", "fall_risk"],
  "pregabalin": ["sedating", "fall_risk"],
  "topiramate": ["sedating", "cognitive_effects"],
  "levetiracetam": ["sedating"],

  // === SSRIs/SNRIs ===
  "fluoxetine": ["serotonergic", "fall_risk"],
  "sertraline": ["serotonergic", "fall_risk"],
  "paroxetine": ["serotonergic", "anticholinergic", "fall_risk"],
  "citalopram": ["serotonergic", "QT_prolonging", "fall_risk"],
  "escitalopram": ["serotonergic", "QT_prolonging", "fall_risk"],
  "venlafaxine": ["serotonergic", "hypertensive"],
  "duloxetine": ["serotonergic"],
  "mirtazapine": ["sedating", "fall_risk"],
  "trazodone": ["sedating", "hypotensive", "fall_risk"],
  "bupropion": ["seizure_lowering"],

  // === GI ===
  "omeprazole": ["PPI_effects"],
  "pantoprazole": ["PPI_effects"],
  "esomeprazole": ["PPI_effects"],
  "lansoprazole": ["PPI_effects"],
  "rabeprazole": ["PPI_effects"],
  "dexlansoprazole": ["PPI_effects"],
  "cimetidine": ["anticholinergic", "drug_interactions"],
  "ranitidine": ["CNS_effects"],
  "famotidine": [],

  // === ANTIBIOTICS ===
  "nitrofurantoin": ["nephrotoxic", "pulmonary_toxicity"],
  "fluoroquinolones": ["QT_prolonging", "tendon_rupture", "CNS_effects"],
  "ciprofloxacin": ["QT_prolonging", "tendon_rupture", "CNS_effects"],
  "levofloxacin": ["QT_prolonging", "tendon_rupture", "CNS_effects"],
  "moxifloxacin": ["QT_prolonging", "tendon_rupture"],

  // === OTHER ===
  "theophylline": ["arrhythmogenic", "seizure_lowering", "narrow_therapeutic_index"],
  "lithium": ["narrow_therapeutic_index", "nephrotoxic"],
  "warfarin": ["bleeding_risk", "narrow_therapeutic_index"],
  "cilostazol": ["fluid_retention"]
};

// ═══════════════════════════════════════════════════════════════
// CONDITION → EFFECTS TO AVOID
// Maps clinical conditions to pharmacological effects that worsen them
// ═══════════════════════════════════════════════════════════════
const CONDITION_AVOID_EFFECTS = {
  "dementia": {
    effects: ["anticholinergic", "sedating"],
    reason: "Cognitive worsening, confusion, delirium",
    note: "Antipsychotics increase mortality in dementia"
  },
  "cognitive_impairment": {
    effects: ["anticholinergic", "sedating"],
    reason: "Further cognitive decline"
  },
  "delirium": {
    effects: ["anticholinergic", "sedating", "dopamine_blocking"],
    reason: "May worsen or prolong delirium"
  },
  "falls_history": {
    effects: ["sedating", "hypotensive", "fall_risk"],
    reason: "Increased fall and fracture risk"
  },
  "fracture_history": {
    effects: ["sedating", "hypotensive", "fall_risk"],
    reason: "Increased fall and subsequent fracture risk"
  },
  "heart_failure": {
    effects: ["fluid_retention", "nephrotoxic"],
    reason: "Fluid retention worsens HF; NSAIDs reduce renal perfusion"
  },
  "syncope": {
    effects: ["hypotensive", "bradycardic", "QT_prolonging"],
    reason: "May precipitate syncope"
  },
  "parkinson": {
    effects: ["dopamine_blocking"],
    exclude_drugs: ["quetiapine", "clozapine"],
    reason: "Dopamine antagonism worsens motor symptoms"
  },
  "seizure_disorder": {
    effects: ["seizure_lowering"],
    reason: "Lowers seizure threshold"
  },
  "gi_bleed_history": {
    effects: ["GI_bleeding", "antiplatelet"],
    reason: "Increased bleeding risk"
  },
  "peptic_ulcer": {
    effects: ["GI_bleeding"],
    reason: "May cause or worsen ulceration"
  },
  "ckd_stage_4": {
    effects: ["nephrotoxic"],
    reason: "Further renal damage"
  },
  "ckd_stage_5": {
    effects: ["nephrotoxic"],
    reason: "Further renal damage; drug accumulation"
  },
  "urinary_retention": {
    effects: ["anticholinergic"],
    reason: "Worsens urinary retention"
  },
  "bph": {
    effects: ["anticholinergic"],
    reason: "May precipitate urinary retention"
  },
  "chronic_constipation": {
    effects: ["anticholinergic", "constipating"],
    reason: "Worsens constipation; risk of fecal impaction"
  },
  "narrow_angle_glaucoma": {
    effects: ["anticholinergic"],
    reason: "May precipitate acute glaucoma"
  },
  "QT_prolongation": {
    effects: ["QT_prolonging"],
    reason: "Risk of torsades de pointes"
  },
  "bradycardia": {
    effects: ["bradycardic"],
    reason: "May worsen bradycardia"
  },
  "orthostatic_hypotension": {
    effects: ["hypotensive"],
    reason: "Worsens orthostatic symptoms; fall risk"
  },
  "insomnia": {
    effects: [],  // No direct contraindications
    reason: "Consider sleep hygiene first"
  }
};

// ═══════════════════════════════════════════════════════════════
// ANTICHOLINERGIC BURDEN SCORES
// ACB scale: 1 = possible, 2 = definite low, 3 = definite high
// ═══════════════════════════════════════════════════════════════
const ACB_SCORES = {
  // Score 3 - Definite high anticholinergic
  "amitriptyline": 3,
  "atropine": 3,
  "benztropine": 3,
  "chlorpheniramine": 3,
  "chlorpromazine": 3,
  "clomipramine": 3,
  "clozapine": 3,
  "cyproheptadine": 3,
  "desipramine": 3,
  "dicyclomine": 3,
  "diphenhydramine": 3,
  "doxepin": 3,
  "doxylamine": 3,
  "fesoterodine": 3,
  "hydroxyzine": 3,
  "hyoscyamine": 3,
  "imipramine": 3,
  "meclizine": 3,
  "nortriptyline": 3,
  "olanzapine": 3,
  "orphenadrine": 3,
  "oxybutynin": 3,
  "paroxetine": 3,
  "perphenazine": 3,
  "promethazine": 3,
  "scopolamine": 3,
  "thioridazine": 3,
  "tolterodine": 3,
  "trifluoperazine": 3,
  "trihexyphenidyl": 3,
  "trimipramine": 3,

  // Score 2 - Definite moderate anticholinergic
  "amantadine": 2,
  "baclofen": 2,
  "carbamazepine": 2,
  "cetirizine": 2,
  "cimetidine": 2,
  "clozapine": 2,
  "cyclobenzaprine": 2,
  "darifenacin": 2,
  "loperamide": 2,
  "loratadine": 2,
  "meperidine": 2,
  "nifedipine": 2,
  "oxcarbazepine": 2,
  "pimozide": 2,
  "solifenacin": 2,
  "trospium": 2,

  // Score 1 - Possible anticholinergic
  "alprazolam": 1,
  "aripiprazole": 1,
  "atenolol": 1,
  "bupropion": 1,
  "captopril": 1,
  "citalopram": 1,
  "codeine": 1,
  "diazepam": 1,
  "digoxin": 1,
  "duloxetine": 1,
  "escitalopram": 1,
  "fentanyl": 1,
  "fluoxetine": 1,
  "fluvoxamine": 1,
  "furosemide": 1,
  "haloperidol": 1,
  "hydralazine": 1,
  "hydrocortisone": 1,
  "isosorbide": 1,
  "levocetirizine": 1,
  "lithium": 1,
  "metformin": 1,
  "metoprolol": 1,
  "morphine": 1,
  "oxycodone": 1,
  "prednisone": 1,
  "quetiapine": 1,
  "ranitidine": 1,
  "risperidone": 1,
  "sertraline": 1,
  "theophylline": 1,
  "trazodone": 1,
  "venlafaxine": 1,
  "warfarin": 1
};

// ═══════════════════════════════════════════════════════════════
// PIMs - Potentially Inappropriate Medications (Table 1)
// These are drugs to avoid regardless of condition
// ═══════════════════════════════════════════════════════════════
const PIM_DATABASE = {
  // First-gen antihistamines
  "diphenhydramine": { severity: "AVOID", reason: "Highly anticholinergic; confusion, urinary retention, constipation", alternatives: ["loratadine", "cetirizine", "fexofenadine"] },
  "hydroxyzine": { severity: "AVOID", reason: "Highly anticholinergic", alternatives: ["loratadine", "cetirizine"] },
  "chlorpheniramine": { severity: "AVOID", reason: "Highly anticholinergic", alternatives: ["loratadine", "cetirizine"] },
  "promethazine": { severity: "AVOID", reason: "Highly anticholinergic; EPS risk", alternatives: ["ondansetron"] },
  "meclizine": { severity: "AVOID", reason: "Anticholinergic", alternatives: ["repositioning maneuvers"] },

  // Benzodiazepines
  "diazepam": { severity: "AVOID", reason: "Long half-life; falls, cognitive impairment, delirium", alternatives: ["non-benzo sleep hygiene", "melatonin"] },
  "lorazepam": { severity: "AVOID", reason: "Falls, cognitive impairment, delirium", alternatives: ["non-benzo sleep hygiene"] },
  "alprazolam": { severity: "AVOID", reason: "Falls, cognitive impairment, delirium", alternatives: ["buspirone for anxiety"] },
  "clonazepam": { severity: "AVOID", reason: "Falls, cognitive impairment", alternatives: ["non-benzo options"] },
  "temazepam": { severity: "AVOID", reason: "Falls, fractures", alternatives: ["sleep hygiene", "melatonin"] },
  "triazolam": { severity: "AVOID", reason: "Falls, cognitive impairment", alternatives: ["melatonin"] },
  "flurazepam": { severity: "AVOID", reason: "Very long half-life; prolonged sedation", alternatives: ["sleep hygiene"] },
  "chlordiazepoxide": { severity: "AVOID", reason: "Long half-life", alternatives: ["short-acting if needed"] },

  // Z-drugs
  "zolpidem": { severity: "AVOID", reason: "Similar risks to benzos; ER visits, falls, fractures", alternatives: ["sleep hygiene", "melatonin"] },
  "eszopiclone": { severity: "AVOID", reason: "Falls, fractures", alternatives: ["sleep hygiene"] },
  "zaleplon": { severity: "AVOID", reason: "Falls", alternatives: ["sleep hygiene"] },

  // Muscle relaxants
  "cyclobenzaprine": { severity: "AVOID", reason: "Anticholinergic, sedation, fracture risk", alternatives: ["physical therapy", "topical agents"] },
  "methocarbamol": { severity: "AVOID", reason: "Sedation, anticholinergic effects", alternatives: ["physical therapy"] },
  "carisoprodol": { severity: "AVOID", reason: "Sedation, abuse potential", alternatives: ["physical therapy"] },
  "metaxalone": { severity: "AVOID", reason: "Sedation", alternatives: ["physical therapy"] },
  "orphenadrine": { severity: "AVOID", reason: "Anticholinergic", alternatives: ["physical therapy"] },

  // Antispasmodics
  "dicyclomine": { severity: "AVOID", reason: "Highly anticholinergic", alternatives: ["peppermint oil"] },
  "hyoscyamine": { severity: "AVOID", reason: "Highly anticholinergic", alternatives: ["peppermint oil"] },
  "oxybutynin": { severity: "AVOID", reason: "Highly anticholinergic; cognitive impairment", alternatives: ["mirabegron", "behavioral therapy"] },
  "tolterodine": { severity: "CAUTION", reason: "Anticholinergic", alternatives: ["mirabegron"] },
  "solifenacin": { severity: "CAUTION", reason: "Anticholinergic", alternatives: ["mirabegron"] },

  // TCAs
  "amitriptyline": { severity: "AVOID", reason: "Highly anticholinergic; cognitive impairment, constipation", alternatives: ["nortriptyline", "SSRI"] },
  "imipramine": { severity: "AVOID", reason: "Highly anticholinergic", alternatives: ["SSRI"] },
  "doxepin": { severity: "AVOID", reason: "Highly anticholinergic (doses >6mg)", alternatives: ["trazodone", "mirtazapine"] },

  // Diabetes
  "glyburide": { severity: "AVOID", reason: "Prolonged hypoglycemia risk", alternatives: ["glipizide", "glimepiride"] },
  "chlorpropamide": { severity: "AVOID", reason: "Prolonged hypoglycemia, SIADH", alternatives: ["glipizide"] },

  // GI
  "metoclopramide": { severity: "AVOID", reason: "EPS, tardive dyskinesia", alternatives: ["domperidone if available", "erythromycin"] },

  // Pain
  "meperidine": { severity: "AVOID", reason: "Neurotoxic metabolite, seizure risk", alternatives: ["morphine", "hydromorphone"] },
  "indomethacin": { severity: "AVOID", reason: "Highest GI and CNS adverse effects", alternatives: ["acetaminophen", "topical NSAIDs"] },
  "ketorolac": { severity: "AVOID", reason: "High GI bleed risk", alternatives: ["acetaminophen"] },

  // Cardiovascular
  "nifedipine": { severity: "AVOID", reason: "Hypotension, MI risk (immediate-release)", alternatives: ["amlodipine"] },
  "doxazosin": { severity: "AVOID_HTN", reason: "Orthostatic hypotension; OK for BPH", alternatives: ["other antihypertensives"] },
  "prazosin": { severity: "AVOID_HTN", reason: "Orthostatic hypotension", alternatives: ["other antihypertensives"] },
  "terazosin": { severity: "AVOID_HTN", reason: "Orthostatic hypotension; OK for BPH", alternatives: ["tamsulosin"] },
  "clonidine": { severity: "AVOID", reason: "CNS effects, bradycardia, rebound HTN", alternatives: ["other antihypertensives"] },
  "methyldopa": { severity: "AVOID", reason: "CNS effects, bradycardia", alternatives: ["other antihypertensives"] }
};

// CNS-active drug effects for polypharmacy detection
const CNS_ACTIVE_EFFECTS = ["opioid", "sedating", "fall_risk"];

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Get pharmacological effects for a drug
 * @param {string} drugName 
 * @returns {string[]} Array of effects
 */
function getDrugEffects(drugName) {
  const name_lower = (drugName || "").toLowerCase().trim();
  
  // Exact match
  if (DRUG_EFFECTS[name_lower]) {
    return DRUG_EFFECTS[name_lower];
  }
  
  // Partial match (e.g., "oxycodone 10mg" matches "oxycodone")
  for (const [drug, effects] of Object.entries(DRUG_EFFECTS)) {
    if (name_lower.includes(drug) || drug.includes(name_lower)) {
      return effects;
    }
  }
  
  // Not found - log for future expansion
  if (name_lower.length > 2) {
    logUnknownDrug(drugName, "BEERS_DRUG_EFFECTS");
  }
  
  return [];
}

/**
 * Get ACB score for a drug
 * @param {string} drugName 
 * @returns {number} ACB score (0-3)
 */
function getACBScore(drugName) {
  const name_lower = (drugName || "").toLowerCase().trim();
  
  // Exact match
  if (ACB_SCORES[name_lower] !== undefined) {
    return ACB_SCORES[name_lower];
  }
  
  // Partial match
  for (const [drug, score] of Object.entries(ACB_SCORES)) {
    if (name_lower.includes(drug) || drug.includes(name_lower)) {
      return score;
    }
  }
  
  return 0;
}

/**
 * Check if drug is a PIM (Table 1)
 * @param {string} drugName 
 * @returns {Object|null} PIM info or null
 */
function getPIMInfo(drugName) {
  const name_lower = (drugName || "").toLowerCase().trim();
  
  for (const [drug, info] of Object.entries(PIM_DATABASE)) {
    if (name_lower.includes(drug) || drug.includes(name_lower)) {
      return { drug, ...info };
    }
  }
  
  return null;
}

/**
 * Identify toxidrome from symptoms
 * @param {string[]} symptoms 
 * @returns {Object[]} Matching toxidromes with confidence
 */
function identifyToxidrome(symptoms) {
  const matches = [];
  const symptom_set = new Set(symptoms.map(s => s.toLowerCase()));
  
  for (const [name, toxidrome] of Object.entries(TOXIDROMES)) {
    const matching = toxidrome.symptoms.filter(s => symptom_set.has(s));
    if (matching.length >= 2) {
      matches.push({
        toxidrome: name,
        confidence: matching.length / toxidrome.symptoms.length,
        matched_symptoms: matching,
        mnemonic: toxidrome.mnemonic || null,
        antidote: toxidrome.antidote || null
      });
    }
  }
  
  return matches.sort((a, b) => b.confidence - a.confidence);
}


// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * @param {Object} input
 * @param {number} input.patient_age
 * @param {Array} input.medications - [{name, dose}]
 * @param {Array} input.conditions - ["dementia", "falls_history", etc] (legacy string-based)
 * @param {Array} input.icd_codes - ["F03.90", "G30.1", etc] (preferred ICD-10 based)
 * @param {number|null} input.egfr
 * @param {number|null} input.ppi_duration_weeks
 * @param {string[]} input.symptoms - For toxidrome identification (optional)
 * @returns {{ alerts: Array, metadata: Object }}
 */
function BEERS_CRITERIA_CHECK(input) {
  const { patient_age, medications, conditions = [], icd_codes = [], egfr, ppi_duration_weeks, symptoms } = input;
  const alerts = [];

  // Beers only applies to age ≥65
  if (patient_age < 65) {
    return { alerts: [], metadata: { beers_applies: false, reason: "Age < 65" } };
  }

  // ═══════════════════════════════════════════════════════════════
  // DERIVE CONDITIONS FROM ICD CODES (if provided)
  // Merges with legacy string conditions for backwards compatibility
  // ═══════════════════════════════════════════════════════════════
  let derived_conditions = [];
  let icd_avoid_effects = new Set();
  let icd_condition_details = {};

  if (icd_codes && icd_codes.length > 0) {
    const icd_result = getContraindicatedEffects(icd_codes);
    derived_conditions = icd_result.conditionKeys;
    icd_avoid_effects = new Set(icd_result.avoidEffects);
    icd_condition_details = icd_result.byCondition;
  }

  // Merge legacy string conditions with ICD-derived conditions
  const all_conditions = [...new Set([...conditions, ...derived_conditions])];

  // Beers only applies to age ≥65
  if (patient_age < 65) {
    return { alerts: [], metadata: { beers_applies: false, reason: "Age < 65" } };
  }

  let acb_total = 0;
  let cns_count = 0;
  const pim_found = [];
  const condition_interactions = [];
  const drug_effects_map = new Map(); // Track effects per drug for reporting

  // ═══════════════════════════════════════════════════════════════
  // ANALYZE EACH MEDICATION
  // ═══════════════════════════════════════════════════════════════
  for (const med of medications) {
    const drugName = med.name || "";
    const effects = getDrugEffects(drugName);
    const acb = getACBScore(drugName);
    const pim = getPIMInfo(drugName);

    drug_effects_map.set(drugName, effects);
    acb_total += acb;

    // Count CNS-active drugs
    if (effects.some(e => CNS_ACTIVE_EFFECTS.includes(e))) {
      cns_count++;
    }

    // Check if it's a PIM (Table 1)
    if (pim) {
      pim_found.push({ ...pim, drugName });
    }

    // ═══════════════════════════════════════════════════════════════
    // TABLE 2: Check drug effects against condition contraindications
    // Uses both legacy CONDITION_AVOID_EFFECTS and ICD-derived effects
    // ═══════════════════════════════════════════════════════════════
    
    // First check: ICD-derived avoid effects (if ICD codes provided)
    if (icd_avoid_effects.size > 0) {
      const bad_effects = effects.filter(e => icd_avoid_effects.has(e));
      if (bad_effects.length > 0) {
        // Find which conditions triggered this
        const triggering_conditions = derived_conditions.filter(c => {
          const cond_info = icd_condition_details[c];
          return cond_info && bad_effects.some(e => cond_info.effects.includes(e));
        });
        
        // Check drug exclusions (e.g., quetiapine OK in Parkinson's)
        const excluded = triggering_conditions.some(c => {
          const cond_info = icd_condition_details[c];
          return cond_info?.exclude_drugs?.some(ex => drugName.toLowerCase().includes(ex));
        });
        
        if (!excluded) {
          condition_interactions.push({
            drug: drugName,
            condition: triggering_conditions.join(", "),
            harmful_effects: bad_effects,
            reason: triggering_conditions.map(c => icd_condition_details[c]?.reason).filter(Boolean).join("; "),
            source: "ICD"
          });
        }
      }
    }
    
    // Second check: Legacy string-based conditions
    for (const condition of conditions) {
      const condition_info = CONDITION_AVOID_EFFECTS[condition];
      if (!condition_info) continue;

      // Check if any drug effect matches condition's avoid list
      const bad_effects = effects.filter(e => condition_info.effects.includes(e));
      
      if (bad_effects.length > 0) {
        // Check exclusions (e.g., quetiapine OK in Parkinson's)
        if (condition_info.exclude_drugs?.some(ex => drugName.toLowerCase().includes(ex))) {
          continue;
        }
        
        condition_interactions.push({
          drug: drugName,
          condition,
          harmful_effects: bad_effects,
          reason: condition_info.reason
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // GENERATE ALERTS
  // ═══════════════════════════════════════════════════════════════

  // Table 1 PIM alerts
  for (const pim of pim_found) {
    alerts.push({
      alert_code: ALERT_CODES.BEERS_PIM_TABLE1,
      drug: pim.drugName,
      severity: pim.severity === "AVOID" ? "HIGH" : "MODERATE",
      message: `Beers Criteria PIM: ${pim.drugName}`,
      reason: pim.reason,
      action: pim.severity === "AVOID" ? "Avoid; consider alternative" : "Use with caution",
      alternatives: pim.alternatives?.join(", ") || "Non-pharmacologic approaches"
    });
  }

  // Table 2 Drug-Disease interaction alerts
  for (const interaction of condition_interactions) {
    alerts.push({
      alert_code: ALERT_CODES.BEERS_DISEASE_INTERACTION,
      drug: interaction.drug,
      condition: interaction.condition,
      harmful_effects: interaction.harmful_effects,
      severity: "HIGH",
      message: `Beers: ${interaction.drug} has ${interaction.harmful_effects.join(", ")} effects - inappropriate with ${interaction.condition}`,
      reason: interaction.reason,
      action: "Avoid in this patient; consider alternative"
    });
  }

  // Anticholinergic Burden alert
  if (acb_total >= 3) {
    alerts.push({
      alert_code: ALERT_CODES.BEERS_ACB_HIGH,
      severity: "HIGH",
      message: `High Anticholinergic Burden (ACB Score: ${acb_total})`,
      reason: "ACB ≥3 associated with cognitive impairment, delirium, falls",
      action: "Review all anticholinergic medications; reduce where possible",
      monitoring: "Assess cognition; monitor for confusion, dry mouth, constipation, urinary retention"
    });
  }

  // CNS Polypharmacy alert
  if (cns_count >= 3) {
    const cns_drugs = medications.filter(m => {
      const effects = getDrugEffects(m.name);
      return effects.some(e => CNS_ACTIVE_EFFECTS.includes(e));
    });
    
    alerts.push({
      alert_code: ALERT_CODES.BEERS_CNS_POLYPHARMACY,
      drugs_involved: cns_drugs.map(m => m.name),
      severity: "HIGH",
      message: `CNS Polypharmacy: ${cns_count} CNS-active medications`,
      reason: "≥3 CNS-active drugs increases falls, fractures, and delirium risk",
      action: "Minimize CNS-active medications; review necessity of each"
    });
  }

  // PPI Long-term use alert
  if (ppi_duration_weeks && ppi_duration_weeks > 8) {
    const has_ppi = medications.some(m => {
      const effects = getDrugEffects(m.name);
      return effects.includes("PPI_effects");
    });
    
    if (has_ppi) {
      alerts.push({
        alert_code: ALERT_CODES.BEERS_PPI_LONG_TERM,
        severity: "MODERATE",
        message: `PPI use >8 weeks without clear indication`,
        reason: "Long-term PPI associated with C. diff, bone loss, hypomagnesemia, B12 deficiency",
        action: "Reassess indication; attempt step-down or discontinuation if appropriate"
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TOXIDROME IDENTIFICATION (if symptoms provided)
  // ═══════════════════════════════════════════════════════════════
  let toxidrome_matches = [];
  if (symptoms && symptoms.length > 0) {
    toxidrome_matches = identifyToxidrome(symptoms);
  }

  return {
    alerts,
    metadata: {
      beers_applies: true,
      patient_age,
      pim_count: pim_found.length,
      condition_interaction_count: condition_interactions.length,
      acb_score: acb_total,
      cns_active_count: cns_count,
      drug_effects: Object.fromEntries(drug_effects_map),
      // ICD-derived info
      icd_derived_conditions: derived_conditions.length > 0 ? derived_conditions : undefined,
      icd_avoid_effects: icd_avoid_effects.size > 0 ? Array.from(icd_avoid_effects) : undefined,
      // Combined conditions (legacy + ICD)
      all_conditions: all_conditions.length > 0 ? all_conditions : undefined,
      toxidrome_matches: toxidrome_matches.length > 0 ? toxidrome_matches : undefined
    }
  };
}

module.exports = { 
  BEERS_CRITERIA_CHECK,
  // Export for external use/testing
  DRUG_EFFECTS,
  CONDITION_AVOID_EFFECTS,
  ACB_SCORES,
  TOXIDROMES,
  getDrugEffects,
  getACBScore,
  identifyToxidrome
};
