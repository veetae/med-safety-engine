/**
 * OPIOID SAFETY CHECK
 * Function 03 - Domain: OPIOID_SAFETY
 * 
 * Detects high-risk opioid combinations and naloxone eligibility
 * References: CDC Opioid Guidelines 2022, FDA Black Box Warnings
 */

const { ALERT_CODES } = require("../constants/alert_codes.js");

// MME conversion factors (oral morphine equivalents)
const MME_FACTORS = {
  "morphine": 1,
  "hydrocodone": 1,
  "oxycodone": 1.5,
  "hydromorphone": 4,
  "oxymorphone": 3,
  "methadone_1_20": 4,      // 1-20mg/day
  "methadone_21_40": 8,     // 21-40mg/day
  "methadone_41_60": 10,    // 41-60mg/day
  "methadone_61_plus": 12,  // >60mg/day
  "fentanyl_patch": 2.4,    // mcg/hr to MME: multiply by 2.4
  "codeine": 0.15,
  "tramadol": 0.1,
  "tapentadol": 0.4,
  "buprenorphine": 0       // Not included in MME for pain (partial agonist)
};

// CNS depressant classes
const CNS_DEPRESSANTS = ["benzodiazepine", "Z_drug", "gabapentinoid", "muscle_relaxant", "barbiturate"];
const OPIOID_CLASSES = ["opioid", "opioid_long_acting"];

// Name-based detection lists
const OPIOID_NAMES = ["morphine", "hydrocodone", "oxycodone", "hydromorphone", "oxymorphone", 
  "fentanyl", "codeine", "tramadol", "tapentadol", "methadone", "buprenorphine", "meperidine",
  "norco", "vicodin", "percocet", "dilaudid", "opana", "duragesic", "nucynta", "ultram"];

const BENZO_NAMES = ["alprazolam", "lorazepam", "diazepam", "clonazepam", "temazepam", 
  "triazolam", "midazolam", "chlordiazepoxide", "oxazepam", "clorazepate", "flurazepam",
  "xanax", "ativan", "valium", "klonopin", "restoril", "halcion"];

const Z_DRUG_NAMES = ["zolpidem", "eszopiclone", "zaleplon", "ambien", "lunesta", "sonata"];

const GABAPENTINOID_NAMES = ["gabapentin", "pregabalin", "neurontin", "lyrica"];

const MUSCLE_RELAXANT_NAMES = ["cyclobenzaprine", "carisoprodol", "methocarbamol", "tizanidine", 
  "baclofen", "orphenadrine", "metaxalone", "flexeril", "soma", "robaxin", "zanaflex"];

/**
 * Check if medication name matches any in the list
 */
function matchesDrugList(medName, drugList) {
  const name = (medName || "").toLowerCase();
  return drugList.some(drug => name.includes(drug));
}

/**
 * @param {Object} input
 * @param {Array} input.medications - [{name, class, dose, frequency}]
 * @param {number} input.patient_age
 * @param {number|null} input.egfr
 * @param {boolean} input.opioid_naive - Is patient opioid-naive?
 * @param {boolean} input.respiratory_disease - COPD, OSA, etc
 * @returns {{ alerts: Array, metadata: Object }}
 */
function OPIOID_SAFETY_CHECK(input) {
  const { medications, patient_age, egfr, opioid_naive = true, respiratory_disease = false } = input;
  const alerts = [];

  // Identify drug categories (class-based OR name-based)
  const opioid_meds = medications.filter(m => 
    OPIOID_CLASSES.includes(m.class) || matchesDrugList(m.name, OPIOID_NAMES)
  );
  const benzo_meds = medications.filter(m => 
    m.class === "benzodiazepine" || matchesDrugList(m.name, BENZO_NAMES)
  );
  const z_drug_meds = medications.filter(m => 
    m.class === "Z_drug" || matchesDrugList(m.name, Z_DRUG_NAMES)
  );
  const gabapentinoid_meds = medications.filter(m => 
    m.class === "gabapentinoid" || matchesDrugList(m.name, GABAPENTINOID_NAMES)
  );
  const muscle_relaxant_meds = medications.filter(m =>
    m.class === "muscle_relaxant" || matchesDrugList(m.name, MUSCLE_RELAXANT_NAMES)
  );
  const cns_meds = [...benzo_meds, ...z_drug_meds, ...gabapentinoid_meds, ...muscle_relaxant_meds];

  if (opioid_meds.length === 0) {
    return { alerts: [], metadata: { has_opioid: false } };
  }

  // Calculate total MME
  let total_mme = 0;
  for (const med of opioid_meds) {
    const mme = calculateMME(med);
    total_mme += mme;
  }

  // ═══════════════════════════════════════════════════════════════
  // OPIOID + BENZODIAZEPINE (FDA Black Box)
  // ═══════════════════════════════════════════════════════════════
  if (opioid_meds.length > 0 && benzo_meds.length > 0) {
    alerts.push({
      alert_code: ALERT_CODES.OPIOID_BENZO_COMBINATION,
      drugs_involved: [...opioid_meds.map(m => m.name), ...benzo_meds.map(m => m.name)],
      severity: "CRITICAL",
      message: "⛔ OPIOID + BENZODIAZEPINE - FDA Black Box Warning",
      reason: "Concurrent use causes profound sedation, respiratory depression, coma, and death",
      action: "Avoid combination if possible; if necessary, use lowest doses for shortest duration",
      monitoring: "Monitor closely for sedation and respiratory depression",
      naloxone: "PRESCRIBE NALOXONE",
      guideline: "FDA Black Box Warning 2016"
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // CNS POLYPHARMACY (≥3 CNS depressants including opioid)
  // ═══════════════════════════════════════════════════════════════
  const total_cns = opioid_meds.length + cns_meds.length;
  if (total_cns >= 3) {
    alerts.push({
      alert_code: ALERT_CODES.OPIOID_CNS_POLYPHARMACY,
      drugs_involved: [...opioid_meds, ...cns_meds].map(m => m.name),
      severity: "HIGH",
      message: `CNS Polypharmacy: ${total_cns} CNS-active medications`,
      reason: "Multiple CNS depressants dramatically increase overdose risk",
      action: "Minimize CNS depressant count; taper unnecessary agents",
      naloxone: "PRESCRIBE NALOXONE"
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // HIGH MME (≥50 MME/day or ≥90 MME/day)
  // ═══════════════════════════════════════════════════════════════
  if (total_mme >= 90) {
    alerts.push({
      alert_code: ALERT_CODES.OPIOID_HIGH_MME,
      severity: "HIGH",
      message: `High opioid dose: ${total_mme.toFixed(0)} MME/day (≥90 threshold)`,
      reason: "≥90 MME/day associated with significantly increased overdose risk",
      action: "Evaluate for tapering; maximize non-opioid therapies",
      naloxone: "PRESCRIBE NALOXONE",
      guideline: "CDC Opioid Guidelines 2022"
    });
  } else if (total_mme >= 50) {
    alerts.push({
      alert_code: ALERT_CODES.OPIOID_HIGH_MME,
      severity: "MODERATE",
      message: `Moderate opioid dose: ${total_mme.toFixed(0)} MME/day (≥50 threshold)`,
      reason: "≥50 MME/day increases overdose risk; reassess benefits vs risks",
      action: "Consider dose reduction or rotation if efficacy declining",
      naloxone: "Consider prescribing naloxone"
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // NALOXONE CRITERIA (Co-prescribing recommendations)
  // ═══════════════════════════════════════════════════════════════
  const naloxone_criteria = [];
  
  if (total_mme >= 50) naloxone_criteria.push("MME ≥50");
  if (benzo_meds.length > 0) naloxone_criteria.push("Concurrent benzodiazepine");
  if (cns_meds.length >= 2) naloxone_criteria.push("Multiple CNS depressants");
  if (respiratory_disease) naloxone_criteria.push("Respiratory disease (COPD/OSA)");
  if (egfr && egfr < 30) naloxone_criteria.push("CKD stage 4-5");
  if (patient_age >= 65) naloxone_criteria.push("Age ≥65");

  if (naloxone_criteria.length > 0) {
    alerts.push({
      alert_code: ALERT_CODES.OPIOID_NALOXONE_NEEDED,
      severity: "HIGH",
      message: "Naloxone co-prescribing indicated",
      reason: `Criteria met: ${naloxone_criteria.join("; ")}`,
      action: "Prescribe naloxone (Narcan) 4mg nasal spray; educate patient/family on use",
      patient_education: [
        "Keep naloxone accessible",
        "Teach family/caregiver how to administer",
        "Signs of overdose: slow/stopped breathing, unresponsive, blue lips",
        "Call 911 after administering naloxone"
      ]
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // EXTENDED-RELEASE IN OPIOID-NAIVE PATIENT
  // ═══════════════════════════════════════════════════════════════
  const er_opioids = opioid_meds.filter(m => 
    m.class === "opioid_long_acting" || 
    (m.name || "").toLowerCase().match(/\b(er|xr|sr|cr|contin|duragesic|patch)\b/)
  );

  if (er_opioids.length > 0 && opioid_naive) {
    alerts.push({
      alert_code: ALERT_CODES.OPIOID_ER_NAIVE,
      drugs_involved: er_opioids.map(m => m.name),
      severity: "HIGH",
      message: "Extended-release opioid in opioid-naive patient",
      reason: "ER/LA opioids contraindicated in opioid-naive patients due to overdose risk",
      action: "Use immediate-release opioid first to establish tolerance",
      guideline: "FDA REMS; CDC Guidelines"
    });
  }

  return {
    alerts,
    metadata: {
      has_opioid: true,
      total_mme: total_mme,
      opioid_count: opioid_meds.length,
      benzo_count: benzo_meds.length,
      cns_depressant_count: total_cns,
      naloxone_indicated: naloxone_criteria.length > 0,
      naloxone_criteria: naloxone_criteria
    }
  };
}

/**
 * Calculate MME for a single medication
 */
function calculateMME(med) {
  const name_lower = (med.name || "").toLowerCase();
  const dose_str = (med.dose || "").toLowerCase();
  
  // Extract numeric dose
  const dose_match = dose_str.match(/(\d+(?:\.\d+)?)/);
  if (!dose_match) return 0;
  const dose_num = parseFloat(dose_match[1]);

  // Frequency multiplier
  let freq_mult = 1;
  if (dose_str.includes("bid") || dose_str.includes("q12") || dose_str.includes("twice")) freq_mult = 2;
  else if (dose_str.includes("tid") || dose_str.includes("q8") || dose_str.includes("three")) freq_mult = 3;
  else if (dose_str.includes("qid") || dose_str.includes("q6") || dose_str.includes("four")) freq_mult = 4;
  else if (dose_str.includes("q4")) freq_mult = 6;

  // Find conversion factor
  for (const [drug, factor] of Object.entries(MME_FACTORS)) {
    if (name_lower.includes(drug.split("_")[0])) {
      // Special handling for fentanyl patch (mcg/hr)
      if (drug === "fentanyl_patch" && (name_lower.includes("patch") || name_lower.includes("duragesic"))) {
        return dose_num * factor; // mcg/hr * 2.4 = daily MME
      }
      // Special handling for methadone (dose-dependent conversion)
      if (name_lower.includes("methadone")) {
        const daily_dose = dose_num * freq_mult;
        if (daily_dose <= 20) return daily_dose * 4;
        if (daily_dose <= 40) return daily_dose * 8;
        if (daily_dose <= 60) return daily_dose * 10;
        return daily_dose * 12;
      }
      return dose_num * factor * freq_mult;
    }
  }

  return 0; // Unknown opioid
}

module.exports = { OPIOID_SAFETY_CHECK };
