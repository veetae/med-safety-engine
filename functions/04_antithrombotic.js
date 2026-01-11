/**
 * ANTITHROMBOTIC COMBINATION CHECK
 * Function 04 - Domain: ANTITHROMBOTIC
 * 
 * Detects high-risk antithrombotic combinations (dual/triple therapy)
 * DOAC dosing verification, bleeding risk assessment
 * References: AHA/ACC AFib Guidelines, DAPT Guidelines, RE-DUAL PCI, AUGUSTUS
 */

const { ALERT_CODES } = require("../constants/alert_codes.js");

// Drug class definitions
const ANTICOAGULANT_CLASSES = ["anticoagulant_DOAC", "anticoagulant_warfarin"];
const ANTIPLATELET_CLASSES = ["antiplatelet_aspirin", "antiplatelet_P2Y12", "antiplatelet_other"];

// DOAC standard doses (for verification)
const DOAC_DOSES = {
  apixaban: {
    afib_standard: "5mg BID",
    afib_reduced: "2.5mg BID",
    vte_treatment: "10mg BID x7d then 5mg BID",
    vte_prevention: "2.5mg BID",
    reduce_if: "Age ≥80 + weight ≤60kg + Cr ≥1.5 (need 2 of 3)"
  },
  rivaroxaban: {
    afib_standard: "20mg daily with food",
    afib_reduced: "15mg daily with food (eGFR 15-50)",
    vte_treatment: "15mg BID x21d then 20mg daily",
    reduce_if: "eGFR 15-50"
  },
  dabigatran: {
    afib_standard: "150mg BID",
    afib_reduced: "75mg BID (eGFR 15-30)",
    reduce_if: "eGFR 30-50, age ≥75, or P-gp inhibitor"
  },
  edoxaban: {
    afib_standard: "60mg daily",
    afib_reduced: "30mg daily",
    reduce_if: "eGFR 15-50, weight ≤60kg, or P-gp inhibitor"
  }
};

/**
 * @param {Object} input
 * @param {Array} input.medications - [{name, class, dose}]
 * @param {number} input.patient_age
 * @param {number|null} input.egfr
 * @param {number|null} input.weight_kg
 * @param {boolean} input.atrial_fibrillation
 * @param {boolean} input.prior_gi_bleed
 * @param {string|null} input.recent_pci_date - ISO date string
 * @param {string|null} input.stent_type - "DES" or "BMS"
 * @param {boolean} input.liver_disease
 * @param {boolean} input.hb_low - Hemoglobin low/anemia
 * @param {boolean} input.on_chronic_nsaid
 * @returns {{ alerts: Array, metadata: Object }}
 */
function ANTITHROMBOTIC_COMBINATION_CHECK(input) {
  const {
    medications,
    patient_age,
    egfr,
    weight_kg,
    atrial_fibrillation,
    prior_gi_bleed,
    recent_pci_date,
    stent_type,
    liver_disease,
    hb_low,
    on_chronic_nsaid
  } = input;

  const alerts = [];

  // Identify antithrombotics
  const anticoag_meds = medications.filter(m => ANTICOAGULANT_CLASSES.includes(m.class));
  const doac_meds = anticoag_meds.filter(m => m.class === "anticoagulant_DOAC");
  const warfarin_meds = anticoag_meds.filter(m => m.class === "anticoagulant_warfarin");
  const antiplatelet_meds = medications.filter(m => ANTIPLATELET_CLASSES.includes(m.class));
  const aspirin_meds = antiplatelet_meds.filter(m => m.class === "antiplatelet_aspirin");
  const p2y12_meds = antiplatelet_meds.filter(m => m.class === "antiplatelet_P2Y12");

  const on_anticoag = anticoag_meds.length > 0;
  const on_doac = doac_meds.length > 0;
  const on_warfarin = warfarin_meds.length > 0;
  const on_aspirin = aspirin_meds.length > 0;
  const on_p2y12 = p2y12_meds.length > 0;

  // ═══════════════════════════════════════════════════════════════
  // DUAL ANTICOAGULATION (DOAC + Warfarin or 2 DOACs)
  // ═══════════════════════════════════════════════════════════════
  if (anticoag_meds.length >= 2) {
    alerts.push({
      alert_code: ALERT_CODES.ANTITHROMB_DUAL_ANTICOAG,
      drugs_involved: anticoag_meds.map(m => m.name),
      severity: "CRITICAL",
      message: "⛔ DUAL ANTICOAGULATION - Never indicated",
      reason: "Multiple anticoagulants have no added benefit and dramatically increase bleeding",
      action: "STOP one anticoagulant immediately; choose single agent based on indication"
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // TRIPLE THERAPY (Anticoagulant + Aspirin + P2Y12)
  // ═══════════════════════════════════════════════════════════════
  if (on_anticoag && on_aspirin && on_p2y12) {
    const days_since_pci = recent_pci_date ? daysSince(recent_pci_date) : null;
    
    let severity = "CRITICAL";
    let action = "Minimize duration; transition to dual therapy ASAP";
    
    // If recent PCI, triple therapy may be appropriate short-term
    if (days_since_pci !== null && days_since_pci < 30 && stent_type === "DES") {
      severity = "HIGH";
      action = "Triple therapy appropriate post-DES but limit to 1-4 weeks; then drop aspirin (AUGUSTUS trial)";
    }

    alerts.push({
      alert_code: ALERT_CODES.ANTITHROMB_TRIPLE_THERAPY,
      drugs_involved: [...anticoag_meds, ...aspirin_meds, ...p2y12_meds].map(m => m.name),
      severity: severity,
      message: "⚠️ TRIPLE ANTITHROMBOTIC THERAPY",
      reason: "Anticoagulant + aspirin + P2Y12 inhibitor = very high bleeding risk",
      action: action,
      guideline: "AUGUSTUS, RE-DUAL PCI trials: drop aspirin first, continue DOAC + P2Y12",
      ppi_required: true
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // DOAC DOSE VERIFICATION
  // ═══════════════════════════════════════════════════════════════
  for (const doac of doac_meds) {
    const name_lower = (doac.name || "").toLowerCase();
    const dose_lower = (doac.dose || "").toLowerCase();

    // Apixaban dose check
    if (name_lower.includes("apixaban") || name_lower.includes("eliquis")) {
      const needs_reduction = (patient_age >= 80 ? 1 : 0) + 
                              (weight_kg && weight_kg <= 60 ? 1 : 0) + 
                              (egfr && egfr < 25 ? 1 : 0); // Using Cr ≥1.5 as proxy

      if (needs_reduction >= 2 && dose_lower.includes("5")) {
        alerts.push({
          alert_code: ALERT_CODES.ANTITHROMB_DOAC_DOSE_CHECK,
          drug: doac.name,
          severity: "HIGH",
          message: "Apixaban dose reduction may be needed",
          reason: `Patient has ${needs_reduction} of 3 dose-reduction criteria (age≥80, weight≤60kg, Cr≥1.5)`,
          action: "Consider reducing to 2.5mg BID per FDA labeling"
        });
      }
    }

    // Rivaroxaban dose check
    if (name_lower.includes("rivaroxaban") || name_lower.includes("xarelto")) {
      if (egfr && egfr <= 50 && dose_lower.includes("20")) {
        alerts.push({
          alert_code: ALERT_CODES.ANTITHROMB_DOAC_DOSE_CHECK,
          drug: doac.name,
          severity: "HIGH",
          message: "Rivaroxaban dose reduction needed for renal function",
          reason: `eGFR ${egfr}: use 15mg daily (not 20mg) for AFib`,
          action: "Reduce to rivaroxaban 15mg daily with evening meal"
        });
      }
    }

    // Dabigatran check
    if (name_lower.includes("dabigatran") || name_lower.includes("pradaxa")) {
      if (egfr && egfr < 30) {
        alerts.push({
          alert_code: ALERT_CODES.ANTITHROMB_DOAC_DOSE_CHECK,
          drug: doac.name,
          severity: "CRITICAL",
          message: "Dabigatran contraindicated at this eGFR",
          reason: `eGFR ${egfr} <30: dabigatran contraindicated`,
          action: "Switch to apixaban (renally safer) or warfarin"
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // BLEEDING RISK ASSESSMENT (HAS-BLED components)
  // ═══════════════════════════════════════════════════════════════
  if (on_anticoag || on_aspirin) {
    let bleed_risk_factors = [];
    
    if (patient_age >= 65) bleed_risk_factors.push("Age ≥65");
    if (prior_gi_bleed) bleed_risk_factors.push("Prior GI bleed");
    if (liver_disease) bleed_risk_factors.push("Liver disease");
    if (egfr && egfr < 30) bleed_risk_factors.push("CKD stage 4-5");
    if (hb_low) bleed_risk_factors.push("Anemia");
    if (on_chronic_nsaid) bleed_risk_factors.push("Chronic NSAID use");
    if (on_anticoag && on_aspirin) bleed_risk_factors.push("Anticoag + aspirin");

    if (bleed_risk_factors.length >= 3) {
      alerts.push({
        alert_code: ALERT_CODES.ANTITHROMB_HIGH_BLEED_RISK,
        severity: "HIGH",
        message: `High bleeding risk: ${bleed_risk_factors.length} risk factors`,
        reason: bleed_risk_factors.join("; "),
        action: "Ensure PPI co-prescribed; minimize antithrombotic intensity; close monitoring",
        ppi_required: true
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ANTICOAGULANT WITHOUT CLEAR INDICATION
  // ═══════════════════════════════════════════════════════════════
  if (on_anticoag && !atrial_fibrillation && !recent_pci_date) {
    // This is a soft warning - there may be other indications (VTE, mechanical valve, etc)
    alerts.push({
      alert_code: ALERT_CODES.ANTITHROMB_NO_INDICATION,
      drugs_involved: anticoag_meds.map(m => m.name),
      severity: "MODERATE",
      message: "Anticoagulant prescribed - verify indication",
      reason: "No AFib or recent PCI documented; ensure indication is current",
      action: "Confirm indication (AFib, VTE, mechanical valve, etc); document clearly"
    });
  }

  return {
    alerts,
    metadata: {
      on_anticoagulant: on_anticoag,
      on_doac: on_doac,
      on_warfarin: on_warfarin,
      on_dual_antiplatelet: on_aspirin && on_p2y12,
      on_triple_therapy: on_anticoag && on_aspirin && on_p2y12,
      anticoag_count: anticoag_meds.length,
      antiplatelet_count: antiplatelet_meds.length
    }
  };
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

module.exports = { ANTITHROMBOTIC_COMBINATION_CHECK };
