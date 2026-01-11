/**
 * BEERS CRITERIA CHECK
 * Function 06 - Domain: BEERS
 * 
 * AGS 2023 Beers Criteria for Potentially Inappropriate Medications in Older Adults
 * Applies to patients age ≥65
 */

const { ALERT_CODES } = require("../constants/alert_codes.js");

// TABLE 1: PIMs to Avoid in Most Older Adults
const PIM_DATABASE = {
  // First-gen antihistamines
  "diphenhydramine": { category: "first_gen_antihistamine", severity: "AVOID", reason: "Highly anticholinergic; confusion, urinary retention, constipation", alternatives: ["loratadine", "cetirizine", "fexofenadine"], acb: 3 },
  "hydroxyzine": { category: "first_gen_antihistamine", severity: "AVOID", reason: "Highly anticholinergic", alternatives: ["loratadine", "cetirizine"], acb: 3 },
  "chlorpheniramine": { category: "first_gen_antihistamine", severity: "AVOID", reason: "Highly anticholinergic", alternatives: ["loratadine", "cetirizine"], acb: 2 },
  "promethazine": { category: "first_gen_antihistamine", severity: "AVOID", reason: "Highly anticholinergic; EPS risk", alternatives: ["ondansetron"], acb: 3 },
  "meclizine": { category: "first_gen_antihistamine", severity: "AVOID", reason: "Anticholinergic", alternatives: ["repositioning maneuvers"], acb: 2 },
  
  // Benzodiazepines
  "diazepam": { category: "benzodiazepine", severity: "AVOID", reason: "Long half-life; falls, cognitive impairment, delirium", alternatives: ["non-benzo sleep hygiene", "melatonin"], acb: 0 },
  "lorazepam": { category: "benzodiazepine", severity: "AVOID", reason: "Falls, cognitive impairment, delirium", alternatives: ["non-benzo sleep hygiene"], acb: 0 },
  "alprazolam": { category: "benzodiazepine", severity: "AVOID", reason: "Falls, cognitive impairment, delirium", alternatives: ["buspirone for anxiety"], acb: 0 },
  "clonazepam": { category: "benzodiazepine", severity: "AVOID", reason: "Falls, cognitive impairment", alternatives: ["non-benzo options"], acb: 0 },
  "temazepam": { category: "benzodiazepine", severity: "AVOID", reason: "Falls, fractures", alternatives: ["sleep hygiene", "melatonin"], acb: 0 },
  "triazolam": { category: "benzodiazepine", severity: "AVOID", reason: "Falls, cognitive impairment", alternatives: ["melatonin"], acb: 0 },
  
  // Non-benzo hypnotics (Z-drugs)
  "zolpidem": { category: "Z_drug", severity: "AVOID", reason: "Similar risks to benzos; ER visits, falls, fractures", alternatives: ["sleep hygiene", "melatonin"], acb: 0 },
  "eszopiclone": { category: "Z_drug", severity: "AVOID", reason: "Falls, fractures", alternatives: ["sleep hygiene"], acb: 0 },
  "zaleplon": { category: "Z_drug", severity: "AVOID", reason: "Falls", alternatives: ["sleep hygiene"], acb: 0 },

  // Muscle relaxants
  "cyclobenzaprine": { category: "muscle_relaxant", severity: "AVOID", reason: "Anticholinergic, sedation, fracture risk", alternatives: ["physical therapy", "topical agents"], acb: 1 },
  "methocarbamol": { category: "muscle_relaxant", severity: "AVOID", reason: "Sedation, anticholinergic effects", alternatives: ["physical therapy"], acb: 0 },
  "carisoprodol": { category: "muscle_relaxant", severity: "AVOID", reason: "Sedation, abuse potential", alternatives: ["physical therapy"], acb: 0 },
  "metaxalone": { category: "muscle_relaxant", severity: "AVOID", reason: "Sedation", alternatives: ["physical therapy"], acb: 0 },
  "orphenadrine": { category: "muscle_relaxant", severity: "AVOID", reason: "Anticholinergic", alternatives: ["physical therapy"], acb: 3 },
  
  // Antispasmodics
  "dicyclomine": { category: "antispasmodic", severity: "AVOID", reason: "Highly anticholinergic", alternatives: ["peppermint oil"], acb: 3 },
  "hyoscyamine": { category: "antispasmodic", severity: "AVOID", reason: "Highly anticholinergic", alternatives: ["peppermint oil"], acb: 3 },
  "oxybutynin": { category: "anticholinergic_bladder", severity: "AVOID", reason: "Highly anticholinergic; cognitive impairment", alternatives: ["mirabegron", "behavioral therapy"], acb: 3 },
  "tolterodine": { category: "anticholinergic_bladder", severity: "CAUTION", reason: "Anticholinergic", alternatives: ["mirabegron"], acb: 2 },
  "solifenacin": { category: "anticholinergic_bladder", severity: "CAUTION", reason: "Anticholinergic", alternatives: ["mirabegron"], acb: 1 },
  
  // Diabetes
  "glyburide": { category: "sulfonylurea_long", severity: "AVOID", reason: "Prolonged hypoglycemia risk", alternatives: ["glipizide", "glimepiride"], acb: 0 },
  "chlorpropamide": { category: "sulfonylurea_long", severity: "AVOID", reason: "Prolonged hypoglycemia, SIADH", alternatives: ["glipizide"], acb: 0 },
  
  // GI
  "metoclopramide": { category: "GI", severity: "AVOID", reason: "EPS, tardive dyskinesia", alternatives: ["domperidone if available", "erythromycin"], acb: 0 },
  
  // Pain
  "meperidine": { category: "opioid", severity: "AVOID", reason: "Neurotoxic metabolite, seizure risk", alternatives: ["morphine", "hydromorphone"], acb: 0 },
  "indomethacin": { category: "NSAID", severity: "AVOID", reason: "Highest GI and CNS adverse effects", alternatives: ["acetaminophen", "topical NSAIDs"], acb: 0 },
  "ketorolac": { category: "NSAID", severity: "AVOID", reason: "High GI bleed risk", alternatives: ["acetaminophen"], acb: 0 },
  
  // Cardiovascular
  "nifedipine_ir": { category: "CCB", severity: "AVOID", reason: "Hypotension, MI risk", alternatives: ["amlodipine"], acb: 0 },
  "doxazosin": { category: "alpha_blocker", severity: "AVOID_HTN", reason: "Orthostatic hypotension; OK for BPH", alternatives: ["other antihypertensives"], acb: 0 },
  "prazosin": { category: "alpha_blocker", severity: "AVOID_HTN", reason: "Orthostatic hypotension", alternatives: ["other antihypertensives"], acb: 0 },
  "terazosin": { category: "alpha_blocker", severity: "AVOID_HTN", reason: "Orthostatic hypotension; OK for BPH", alternatives: ["tamsulosin"], acb: 0 },
  "clonidine": { category: "central_alpha", severity: "AVOID", reason: "CNS effects, bradycardia, rebound HTN", alternatives: ["other antihypertensives"], acb: 0 },
  "methyldopa": { category: "central_alpha", severity: "AVOID", reason: "CNS effects, bradycardia", alternatives: ["other antihypertensives"], acb: 0 },
  
  // TCAs with high anticholinergic
  "amitriptyline": { category: "TCA", severity: "AVOID", reason: "Highly anticholinergic; cognitive impairment, constipation", alternatives: ["nortriptyline", "SSRI"], acb: 3 },
  "imipramine": { category: "TCA", severity: "AVOID", reason: "Highly anticholinergic", alternatives: ["SSRI"], acb: 3 },
  "doxepin_high": { category: "TCA", severity: "AVOID", reason: "Highly anticholinergic (doses >6mg)", alternatives: ["trazodone", "mirtazapine"], acb: 3 },
};


// TABLE 2: Drug-Disease Interactions
const CONDITION_PIM_MATRIX = {
  "heart_failure": {
    avoid_classes: ["NSAID", "COX2_inhibitor", "CCB_nonDHP", "TZD", "cilostazol", "dronedarone"],
    reason: "Fluid retention, worsening HF"
  },
  "syncope": {
    avoid_classes: ["acetylcholinesterase_inhibitor", "alpha_blocker", "TCA", "antipsychotic"],
    reason: "May exacerbate syncope"
  },
  "delirium": {
    avoid_classes: ["anticholinergic", "benzodiazepine", "H2_blocker", "meperidine", "Z_drug", "antipsychotic"],
    reason: "May worsen delirium"
  },
  "dementia": {
    avoid_classes: ["anticholinergic", "benzodiazepine", "H2_blocker", "antipsychotic"],
    reason: "Cognitive worsening; antipsychotics increase mortality"
  },
  "falls_history": {
    avoid_classes: ["antipsychotic", "benzodiazepine", "SSRI", "TCA", "opioid", "anticonvulsant", "Z_drug"],
    reason: "Increased fall risk"
  },
  "parkinson": {
    avoid_classes: ["antipsychotic", "metoclopramide", "prochlorperazine"],
    exclude: ["quetiapine", "clozapine"],
    reason: "Dopamine antagonism worsens PD"
  },
  "gi_bleed_history": {
    avoid_classes: ["NSAID", "aspirin_high", "anticoagulant"],
    note: "Requires PPI if any used",
    reason: "Recurrent bleeding risk"
  },
  "ckd_stage_4_5": {
    avoid_classes: ["NSAID", "nitrofurantoin"],
    reason: "Nephrotoxicity, ineffective"
  },
  "urinary_incontinence_stress": {
    avoid_classes: ["alpha_blocker", "estrogen_oral"],
    reason: "Worsens stress incontinence"
  },
  "bph_retention": {
    avoid_classes: ["anticholinergic", "inhaled_antimuscarinic"],
    reason: "Urinary retention"
  },
  "chronic_constipation": {
    avoid_classes: ["anticholinergic", "CCB_nonDHP", "first_gen_antihistamine"],
    reason: "Worsens constipation"
  },
  "seizure_disorder": {
    avoid_classes: ["bupropion", "tramadol", "chlorpromazine", "thioridazine"],
    reason: "Lowers seizure threshold"
  }
};


// CNS-active drug classes for polypharmacy detection
const CNS_ACTIVE_CLASSES = [
  "opioid", "opioid_long_acting", "benzodiazepine", "Z_drug", "gabapentinoid",
  "antipsychotic", "TCA", "SSRI", "SNRI", "mirtazapine", "trazodone",
  "anticonvulsant", "muscle_relaxant"
];

/**
 * @param {Object} input
 * @param {number} input.patient_age
 * @param {Array} input.medications - [{name, class, dose}]
 * @param {Array} input.conditions - ["heart_failure", "dementia", etc]
 * @param {number|null} input.egfr
 * @param {number|null} input.ppi_duration_weeks - For PPI long-term check
 * @returns {{ alerts: Array, metadata: Object }}
 */
function BEERS_CRITERIA_CHECK(input) {
  const { patient_age, medications, conditions = [], egfr, ppi_duration_weeks } = input;
  const alerts = [];

  // Beers only applies to age ≥65
  if (patient_age < 65) {
    return { alerts: [], metadata: { beers_applies: false, reason: "Age < 65" } };
  }

  let acb_total = 0;
  let cns_count = 0;
  const pim_found = [];
  const condition_pim_found = [];

  // ═══════════════════════════════════════════════════════════════
  // TABLE 1: PIMs to Avoid in Most Older Adults
  // ═══════════════════════════════════════════════════════════════
  for (const med of medications) {
    const name_lower = (med.name || "").toLowerCase();
    const medClass = med.class || "";

    // Check exact drug name match
    for (const [drug, info] of Object.entries(PIM_DATABASE)) {
      if (name_lower.includes(drug) || drug.includes(name_lower)) {
        pim_found.push({ drug: med.name, ...info });
        acb_total += info.acb || 0;
        break;
      }
    }

    // Check class-based match
    if (["benzodiazepine", "Z_drug", "muscle_relaxant"].includes(medClass)) {
      if (!pim_found.some(p => p.drug === med.name)) {
        pim_found.push({
          drug: med.name,
          category: medClass,
          severity: "AVOID",
          reason: "Beers Criteria: sedation, falls, cognitive impairment",
          acb: 0
        });
      }
    }

    // Count CNS-active drugs
    if (CNS_ACTIVE_CLASSES.includes(medClass)) {
      cns_count++;
    }
  }


  // Generate Table 1 alerts
  for (const pim of pim_found) {
    alerts.push({
      alert_code: ALERT_CODES.BEERS_PIM_TABLE1,
      drug: pim.drug,
      severity: pim.severity === "AVOID" ? "HIGH" : "MODERATE",
      message: `Beers Criteria PIM: ${pim.drug}`,
      reason: pim.reason,
      action: pim.severity === "AVOID" ? "Avoid; consider alternative" : "Use with caution",
      alternatives: pim.alternatives?.join(", ") || "Non-pharmacologic approaches"
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // TABLE 2: Drug-Disease Interactions
  // ═══════════════════════════════════════════════════════════════
  for (const condition of conditions) {
    const matrix_entry = CONDITION_PIM_MATRIX[condition];
    if (!matrix_entry) continue;

    for (const med of medications) {
      const medClass = med.class || "";
      if (matrix_entry.avoid_classes.includes(medClass)) {
        // Check exclusions (e.g., quetiapine OK in Parkinson's)
        if (matrix_entry.exclude?.some(ex => med.name?.toLowerCase().includes(ex))) {
          continue;
        }
        condition_pim_found.push({ drug: med.name, condition, reason: matrix_entry.reason });
      }
    }
  }

  for (const cpim of condition_pim_found) {
    alerts.push({
      alert_code: ALERT_CODES.BEERS_DISEASE_INTERACTION,
      drug: cpim.drug,
      severity: "HIGH",
      message: `Beers: ${cpim.drug} inappropriate with ${cpim.condition}`,
      reason: cpim.reason,
      action: "Avoid in this patient; consider alternative"
    });
  }


  // ═══════════════════════════════════════════════════════════════
  // ANTICHOLINERGIC BURDEN SCORE
  // ═══════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════
  // CNS POLYPHARMACY (≥3 CNS-active drugs)
  // ═══════════════════════════════════════════════════════════════
  if (cns_count >= 3) {
    const cns_drugs = medications.filter(m => CNS_ACTIVE_CLASSES.includes(m.class || ""));
    alerts.push({
      alert_code: ALERT_CODES.BEERS_CNS_POLYPHARMACY,
      drugs_involved: cns_drugs.map(m => m.name),
      severity: "HIGH",
      message: `CNS Polypharmacy: ${cns_count} CNS-active medications`,
      reason: "≥3 CNS-active drugs increases falls, fractures, and delirium risk",
      action: "Minimize CNS-active medications; review necessity of each"
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // PPI LONG-TERM USE
  // ═══════════════════════════════════════════════════════════════
  if (ppi_duration_weeks && ppi_duration_weeks > 8) {
    const has_ppi = medications.some(m => m.class === "PPI" || 
      ["omeprazole", "pantoprazole", "esomeprazole", "lansoprazole", "rabeprazole", "dexlansoprazole"]
        .some(ppi => m.name?.toLowerCase().includes(ppi))
    );
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


  return {
    alerts,
    metadata: {
      beers_applies: true,
      patient_age,
      pim_count: pim_found.length,
      condition_pim_count: condition_pim_found.length,
      acb_score: acb_total,
      cns_active_count: cns_count
    }
  };
}

module.exports = { BEERS_CRITERIA_CHECK };
