/**
 * RENAL DOSING CHECK
 * Function 01 - Domain: RENAL_DOSING
 * 
 * Adjusts medication recommendations based on eGFR/CKD stage
 * References: KDIGO 2024, FDA labeling, UpToDate
 */

const { ALERT_CODES } = require("../constants/alert_codes.js");

// Renal dosing thresholds by drug
const RENAL_DRUG_RULES = {
  // Metformin (KDIGO 2024)
  metformin: {
    thresholds: [
      { egfr_max: 30, action: "CONTRAINDICATED", severity: "CRITICAL", code: "RENAL_METFORMIN_CONTRAINDICATED" },
      { egfr_max: 45, action: "REDUCE", severity: "HIGH", code: "RENAL_METFORMIN_REDUCE", 
        message: "Reduce to max 1000mg/day; hold if acute illness" },
      { egfr_max: 60, action: "CAUTION", severity: "MODERATE",
        message: "Monitor eGFR every 3-6 months; may need dose reduction" }
    ],
    class: "biguanide"
  },

  // Gabapentinoids
  gabapentin: {
    thresholds: [
      { egfr_max: 15, action: "REDUCE", severity: "HIGH", code: "RENAL_GABAPENTINOID_ADJUST",
        message: "Max 300mg daily; give post-dialysis dose on HD days" },
      { egfr_max: 30, action: "REDUCE", severity: "HIGH", code: "RENAL_GABAPENTINOID_ADJUST",
        message: "Max 300mg BID" },
      { egfr_max: 60, action: "REDUCE", severity: "MODERATE",
        message: "Max 600mg BID" }
    ],
    class: "gabapentinoid"
  },
  pregabalin: {
    thresholds: [
      { egfr_max: 15, action: "REDUCE", severity: "HIGH", code: "RENAL_GABAPENTINOID_ADJUST",
        message: "Max 75mg daily" },
      { egfr_max: 30, action: "REDUCE", severity: "HIGH", code: "RENAL_GABAPENTINOID_ADJUST",
        message: "Max 150mg daily in 1-2 doses" },
      { egfr_max: 60, action: "REDUCE", severity: "MODERATE",
        message: "Max 300mg daily in 2-3 doses" }
    ],
    class: "gabapentinoid"
  },

  // DOACs
  apixaban: {
    thresholds: [
      { egfr_max: 15, action: "CAUTION", severity: "HIGH", code: "RENAL_DOAC_ADJUST",
        message: "Limited data <15; consider 2.5mg BID if 2+ of: age≥80, weight≤60kg, Cr≥1.5" },
      { egfr_max: 25, action: "REDUCE", severity: "HIGH", code: "RENAL_DOAC_ADJUST",
        message: "Use 2.5mg BID if also age≥80 or weight≤60kg" }
    ],
    class: "anticoagulant_DOAC"
  },
  rivaroxaban: {
    thresholds: [
      { egfr_max: 15, action: "AVOID", severity: "CRITICAL", code: "RENAL_DOAC_CONTRAINDICATED",
        message: "Avoid rivaroxaban if eGFR <15" },
      { egfr_max: 50, action: "REDUCE", severity: "HIGH", code: "RENAL_DOAC_ADJUST",
        message: "Use 15mg daily (not 20mg) for AFib" }
    ],
    class: "anticoagulant_DOAC"
  },
  dabigatran: {
    thresholds: [
      { egfr_max: 30, action: "AVOID", severity: "CRITICAL", code: "RENAL_DOAC_CONTRAINDICATED",
        message: "Contraindicated if eGFR <30" },
      { egfr_max: 50, action: "REDUCE", severity: "HIGH", code: "RENAL_DOAC_ADJUST",
        message: "Use 75mg BID (not 150mg BID)" }
    ],
    class: "anticoagulant_DOAC"
  },
  edoxaban: {
    thresholds: [
      { egfr_max: 15, action: "AVOID", severity: "CRITICAL", code: "RENAL_DOAC_CONTRAINDICATED",
        message: "Avoid if eGFR <15" },
      { egfr_max: 50, action: "REDUCE", severity: "HIGH", code: "RENAL_DOAC_ADJUST",
        message: "Use 30mg daily (not 60mg)" }
    ],
    class: "anticoagulant_DOAC"
  },

  // NSAIDs
  ibuprofen: {
    thresholds: [
      { egfr_max: 30, action: "AVOID", severity: "HIGH", code: "RENAL_NSAID_AVOID",
        message: "Avoid NSAIDs in CKD 4-5; use acetaminophen" },
      { egfr_max: 60, action: "CAUTION", severity: "MODERATE",
        message: "Limit NSAID use; monitor kidney function" }
    ],
    class: "NSAID"
  },
  naproxen: {
    thresholds: [
      { egfr_max: 30, action: "AVOID", severity: "HIGH", code: "RENAL_NSAID_AVOID",
        message: "Avoid NSAIDs in CKD 4-5" },
      { egfr_max: 60, action: "CAUTION", severity: "MODERATE",
        message: "Limit use; prefer acetaminophen" }
    ],
    class: "NSAID"
  },
  celecoxib: {
    thresholds: [
      { egfr_max: 30, action: "AVOID", severity: "HIGH", code: "RENAL_NSAID_AVOID",
        message: "Avoid in severe CKD" }
    ],
    class: "COX2_inhibitor"
  },

  // Sulfonylureas
  glyburide: {
    thresholds: [
      { egfr_max: 60, action: "AVOID", severity: "HIGH", code: "RENAL_GLYBURIDE_AVOID",
        message: "Avoid glyburide in CKD; active metabolites accumulate → prolonged hypoglycemia. Use glipizide instead." }
    ],
    class: "sulfonylurea"
  },

  // Antibiotics
  nitrofurantoin: {
    thresholds: [
      { egfr_max: 30, action: "AVOID", severity: "HIGH", code: "RENAL_NITROFURANTOIN_AVOID",
        message: "Ineffective and risk of pulmonary toxicity if eGFR <30" }
    ],
    class: "antibiotic"
  }
};

/**
 * @param {Object} input
 * @param {number} input.egfr - Estimated GFR in mL/min/1.73m²
 * @param {Array} input.medications - [{name, dose, class}]
 * @returns {{ alerts: Array, metadata: Object }}
 */
function RENAL_DOSING_CHECK(input) {
  const { egfr, medications } = input;
  const alerts = [];

  if (egfr === null || egfr === undefined) {
    alerts.push({
      alert_code: ALERT_CODES.VALIDATION_EGFR_MISSING,
      severity: "INFO",
      message: "eGFR not provided; renal dosing checks skipped"
    });
    return { alerts, metadata: { checked: false } };
  }

  const flagged_drugs = [];

  for (const med of medications) {
    const name_lower = (med.name || "").toLowerCase();
    
    // Check each known drug
    for (const [drug, rules] of Object.entries(RENAL_DRUG_RULES)) {
      if (name_lower.includes(drug)) {
        // Find applicable threshold
        for (const threshold of rules.thresholds) {
          if (egfr < threshold.egfr_max) {
            flagged_drugs.push({
              drug: med.name,
              dose: med.dose,
              egfr_threshold: threshold.egfr_max,
              action: threshold.action,
              message: threshold.message
            });

            alerts.push({
              alert_code: ALERT_CODES[threshold.code] || ALERT_CODES.RENAL_GABAPENTINOID_ADJUST,
              drug: med.name,
              severity: threshold.severity,
              message: `${threshold.action}: ${med.name} at eGFR ${egfr}`,
              reason: threshold.message,
              action: threshold.action === "CONTRAINDICATED" || threshold.action === "AVOID" 
                ? `STOP ${med.name}` 
                : `Adjust dose per renal guidelines`,
              egfr_threshold: threshold.egfr_max,
              current_egfr: egfr
            });
            break; // Only apply first (most restrictive) matching threshold
          }
        }
        break; // Found the drug, move to next medication
      }
    }

    // Class-based NSAID check (catch-all)
    if ((med.class === "NSAID" || med.class === "COX2_inhibitor") && egfr < 30) {
      if (!alerts.some(a => a.drug === med.name)) {
        alerts.push({
          alert_code: ALERT_CODES.RENAL_NSAID_AVOID,
          drug: med.name,
          severity: "HIGH",
          message: `Avoid ${med.name} (NSAID) with eGFR <30`,
          reason: "NSAIDs cause AKI and accelerate CKD progression",
          action: "Discontinue; use acetaminophen for pain"
        });
      }
    }
  }

  return {
    alerts,
    metadata: {
      checked: true,
      egfr: egfr,
      ckd_stage: getCKDStage(egfr),
      drugs_flagged: flagged_drugs.length
    }
  };
}

function getCKDStage(egfr) {
  if (egfr >= 90) return "1";
  if (egfr >= 60) return "2";
  if (egfr >= 45) return "3a";
  if (egfr >= 30) return "3b";
  if (egfr >= 15) return "4";
  return "5";
}

module.exports = { RENAL_DOSING_CHECK };
