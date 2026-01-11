/**
 * TRIPLE WHAMMY CHECK
 * Function 02 - Domain: TRIPLE_WHAMMY
 * 
 * Detects ACE/ARB + Diuretic + NSAID combination (AKI risk)
 * Also handles sick-day protocol triggers
 * References: KDIGO AKI Guidelines, Australian TGA Warning
 */

const { ALERT_CODES } = require("../constants/alert_codes.js");

// Drug class definitions
const RAAS_CLASSES = ["ACE_inhibitor", "ARB", "ARNI"];
const DIURETIC_CLASSES = ["thiazide", "loop_diuretic", "K_sparing_diuretic"];
const NSAID_CLASSES = ["NSAID", "COX2_inhibitor"];

/**
 * @param {Object} input
 * @param {Array} input.medications - [{name, class, dose}]
 * @param {Object} input.active_illness - { volume_depleted, vomiting_diarrhea, sepsis, etc }
 * @param {number|null} input.egfr
 * @returns {{ alerts: Array, metadata: Object }}
 */
function TRIPLE_WHAMMY_CHECK(input) {
  const { medications, active_illness = {}, egfr } = input;
  const alerts = [];

  // Identify drug categories
  const raas_meds = medications.filter(m => RAAS_CLASSES.includes(m.class));
  const diuretic_meds = medications.filter(m => DIURETIC_CLASSES.includes(m.class));
  const nsaid_meds = medications.filter(m => NSAID_CLASSES.includes(m.class));

  const has_raas = raas_meds.length > 0;
  const has_diuretic = diuretic_meds.length > 0;
  const has_nsaid = nsaid_meds.length > 0;

  // Check for active illness / volume depletion
  const has_volume_risk = active_illness.volume_depleted || 
                          active_illness.vomiting_diarrhea ||
                          active_illness.sepsis ||
                          active_illness.recent_surgery ||
                          active_illness.acute_infection;

  // ═══════════════════════════════════════════════════════════════
  // TRIPLE WHAMMY: ACE/ARB + Diuretic + NSAID
  // ═══════════════════════════════════════════════════════════════
  if (has_raas && has_diuretic && has_nsaid) {
    alerts.push({
      alert_code: ALERT_CODES.TRIPLE_WHAMMY_PRESENT,
      drugs_involved: [
        ...raas_meds.map(m => m.name),
        ...diuretic_meds.map(m => m.name),
        ...nsaid_meds.map(m => m.name)
      ],
      severity: "HIGH",
      message: "⚠️ TRIPLE WHAMMY - High AKI Risk",
      reason: "ACE/ARB + Diuretic + NSAID combination dramatically increases acute kidney injury risk",
      action: "STOP NSAID immediately; issue sick-day protocol",
      monitoring: "Check creatinine within 1 week if NSAID cannot be stopped",
      guideline: "Australian TGA Alert; KDIGO AKI Guidelines"
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // NSAID + CKD (even without full triple whammy)
  // ═══════════════════════════════════════════════════════════════
  if (has_nsaid && egfr && egfr < 60) {
    alerts.push({
      alert_code: ALERT_CODES.TRIPLE_WHAMMY_NSAID_CKD,
      drugs_involved: nsaid_meds.map(m => m.name),
      severity: "HIGH",
      message: "NSAID use in CKD - Avoid",
      reason: `eGFR ${egfr}: NSAIDs accelerate CKD progression and cause AKI`,
      action: "Discontinue NSAID; use acetaminophen",
      alternative: "Topical NSAIDs if needed (lower systemic absorption)"
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // VOLUME DEPLETION + RAAS (Sick Day Protocol Trigger)
  // ═══════════════════════════════════════════════════════════════
  if (has_volume_risk && (has_raas || has_diuretic)) {
    const hold_meds = [...raas_meds, ...diuretic_meds];
    
    // Escalate to CRITICAL if actual volume depletion
    const severity = active_illness.volume_depleted || active_illness.sepsis 
      ? "CRITICAL" 
      : "HIGH";

    alerts.push({
      alert_code: ALERT_CODES.TRIPLE_WHAMMY_VOLUME_DEPLETION,
      drugs_involved: hold_meds.map(m => m.name),
      severity: severity,
      message: "🚨 SICK DAY PROTOCOL - Hold nephrotoxic meds",
      reason: "Volume depletion + RAAS blockers/diuretics = high AKI risk",
      action: "HOLD: " + hold_meds.map(m => m.name).join(", "),
      sick_day_rules: generateSickDayProtocol(hold_meds, nsaid_meds),
      monitoring: "Resume when eating/drinking normally; check creatinine if prolonged illness"
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // DUAL RAAS BLOCKADE (ACE + ARB or ARNI overlap)
  // ═══════════════════════════════════════════════════════════════
  const ace_count = raas_meds.filter(m => m.class === "ACE_inhibitor").length;
  const arb_count = raas_meds.filter(m => m.class === "ARB").length;
  const arni_count = raas_meds.filter(m => m.class === "ARNI").length;

  if (ace_count > 0 && arb_count > 0) {
    alerts.push({
      alert_code: ALERT_CODES.DUAL_RAAS_ACE_ARB,
      drugs_involved: raas_meds.map(m => m.name),
      severity: "HIGH",
      message: "Dual RAAS Blockade: ACE + ARB",
      reason: "ONTARGET trial showed increased AKI, hyperkalemia without CV benefit",
      action: "Stop one agent; use single RAAS blocker only",
      guideline: "ONTARGET Trial; AHA/ACC Guidelines"
    });
  }

  if (arni_count > 0 && (ace_count > 0 || arb_count > 0)) {
    alerts.push({
      alert_code: ALERT_CODES.DUAL_RAAS_ARNI_OVERLAP,
      drugs_involved: raas_meds.map(m => m.name),
      severity: "CRITICAL",
      message: "⛔ ARNI + ACE/ARB - CONTRAINDICATED",
      reason: "Sacubitril/valsartan (ARNI) already contains ARB; adding ACE/ARB causes severe hypotension and angioedema",
      action: "STOP ACE/ARB immediately; 36-hour washout required before starting ARNI",
      guideline: "Entresto FDA labeling"
    });
  }

  return {
    alerts,
    metadata: {
      has_triple_whammy: has_raas && has_diuretic && has_nsaid,
      has_dual_raas: (ace_count > 0 && arb_count > 0) || (arni_count > 0 && (ace_count > 0 || arb_count > 0)),
      sick_day_triggered: has_volume_risk && (has_raas || has_diuretic),
      raas_count: raas_meds.length,
      diuretic_count: diuretic_meds.length,
      nsaid_count: nsaid_meds.length
    }
  };
}

/**
 * Generate sick day protocol instructions
 */
function generateSickDayProtocol(hold_meds, nsaid_meds) {
  const rules = [];
  
  rules.push("TEMPORARILY HOLD during illness with vomiting, diarrhea, or poor oral intake:");
  
  for (const med of hold_meds) {
    rules.push(`  • ${med.name} (${med.class})`);
  }
  
  if (nsaid_meds.length > 0) {
    rules.push("AVOID these NSAIDs:");
    for (const med of nsaid_meds) {
      rules.push(`  • ${med.name}`);
    }
  }

  rules.push("");
  rules.push("RESUME when:");
  rules.push("  • Eating and drinking normally for 24-48 hours");
  rules.push("  • No more vomiting or diarrhea");
  rules.push("");
  rules.push("SEEK CARE if:");
  rules.push("  • Unable to keep fluids down >24 hours");
  rules.push("  • Symptoms worsen or don't improve in 48 hours");
  rules.push("  • Signs of dehydration (dizziness, dark urine, confusion)");

  return rules.join("\n");
}

module.exports = { TRIPLE_WHAMMY_CHECK };
