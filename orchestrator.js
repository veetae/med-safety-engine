/**
 * MED SAFETY ENGINE ORCHESTRATOR
 * Version 3.0.0
 */

const { ALERT_CODES } = require("./constants/alert_codes.js");
const { RENAL_DOSING_CHECK } = require("./functions/01_renal_dosing.js");
const { TRIPLE_WHAMMY_CHECK } = require("./functions/02_triple_whammy.js");
const { OPIOID_SAFETY_CHECK } = require("./functions/03_opioid_safety.js");
const { ANTITHROMBOTIC_COMBINATION_CHECK } = require("./functions/04_antithrombotic.js");
const { SEROTONIN_SYNDROME_CHECK } = require("./functions/05_serotonin.js");
const { BEERS_CRITERIA_CHECK } = require("./functions/06_beers.js");

const SEVERITY_ORDER = { "CRITICAL": 1, "HIGH": 2, "MODERATE": 3, "LOW": 4, "INFO": 5 };

function MED_SAFETY_ENGINE(patient_data) {
  const {
    patient_age = null,
    patient_sex = null,
    weight_kg = null,
    egfr = null,
    liver_disease = false,
    heart_failure = false,
    atrial_fibrillation = false,
    prior_gi_bleed = false,
    recent_pci_date = null,
    stent_type = null,
    hb_low = false,
    respiratory_disease = false,
    opioid_naive = true,
    active_illness = {},
    current_medications = [],
    conditions = [],
    icd_codes = [],
    recent_maoi_use = null,
    ppi_duration_weeks = null
  } = patient_data;

  let all_alerts = [];
  const function_results = {};
  const timing = {};

  // FUNCTION 1: RENAL DOSING (always run if egfr provided)
  timing.renal = Date.now();
  if (egfr !== null && egfr < 90) {
    try {
      const result = RENAL_DOSING_CHECK({ egfr, medications: current_medications });
      all_alerts = all_alerts.concat(result.alerts.map(a => ({ ...a, source: "RENAL" })));
      function_results.renal = result.metadata;
    } catch (err) {
      all_alerts.push({ alert_code: ALERT_CODES.SYSTEM_FUNCTION_ERROR, severity: "HIGH", message: `Renal: ${err.message}`, source: "SYSTEM" });
    }
  }
  timing.renal = Date.now() - timing.renal;

  // FUNCTION 2: TRIPLE WHAMMY (always run - checks internally)
  timing.triple = Date.now();
  try {
    const result = TRIPLE_WHAMMY_CHECK({ medications: current_medications, active_illness, egfr });
    all_alerts = all_alerts.concat(result.alerts.map(a => ({ ...a, source: "TRIPLE_WHAMMY" })));
    function_results.triple = result.metadata;
  } catch (err) {
    all_alerts.push({ alert_code: ALERT_CODES.SYSTEM_FUNCTION_ERROR, severity: "HIGH", message: `Triple: ${err.message}`, source: "SYSTEM" });
  }
  timing.triple = Date.now() - timing.triple;

  // FUNCTION 3: OPIOID SAFETY (always run - checks internally)
  timing.opioid = Date.now();
  try {
    const result = OPIOID_SAFETY_CHECK({ medications: current_medications, patient_age, egfr, opioid_naive, respiratory_disease });
    all_alerts = all_alerts.concat(result.alerts.map(a => ({ ...a, source: "OPIOID" })));
    function_results.opioid = result.metadata;
  } catch (err) {
    all_alerts.push({ alert_code: ALERT_CODES.SYSTEM_FUNCTION_ERROR, severity: "HIGH", message: `Opioid: ${err.message}`, source: "SYSTEM" });
  }
  timing.opioid = Date.now() - timing.opioid;

  // FUNCTION 4: ANTITHROMBOTIC (always run - checks internally)
  timing.antithromb = Date.now();
  try {
    const result = ANTITHROMBOTIC_COMBINATION_CHECK({
      medications: current_medications, patient_age, egfr, weight_kg, atrial_fibrillation,
      prior_gi_bleed, recent_pci_date, stent_type, liver_disease, hb_low,
      on_chronic_nsaid: current_medications.some(m => ["NSAID", "COX2_inhibitor"].includes(m.class))
    });
    all_alerts = all_alerts.concat(result.alerts.map(a => ({ ...a, source: "ANTITHROMB" })));
    function_results.antithromb = result.metadata;
  } catch (err) {
    all_alerts.push({ alert_code: ALERT_CODES.SYSTEM_FUNCTION_ERROR, severity: "HIGH", message: `Antithromb: ${err.message}`, source: "SYSTEM" });
  }
  timing.antithromb = Date.now() - timing.antithromb;

  // FUNCTION 5: SEROTONIN (always run - checks internally)
  timing.serotonin = Date.now();
  try {
    const result = SEROTONIN_SYNDROME_CHECK({ medications: current_medications, patient_age, egfr, liver_disease, recent_maoi_use });
    all_alerts = all_alerts.concat(result.alerts.map(a => ({ ...a, source: "SEROTONIN" })));
    function_results.serotonin = result.metadata;
  } catch (err) {
    all_alerts.push({ alert_code: ALERT_CODES.SYSTEM_FUNCTION_ERROR, severity: "HIGH", message: `Serotonin: ${err.message}`, source: "SYSTEM" });
  }
  timing.serotonin = Date.now() - timing.serotonin;

  // FUNCTION 6: BEERS (age >= 65)
  timing.beers = Date.now();
  if (patient_age >= 65) {
    try {
      const result = BEERS_CRITERIA_CHECK({ patient_age, medications: current_medications, conditions, icd_codes, egfr, ppi_duration_weeks });
      all_alerts = all_alerts.concat(result.alerts.map(a => ({ ...a, source: "BEERS" })));
      function_results.beers = result.metadata;
    } catch (err) {
      all_alerts.push({ alert_code: ALERT_CODES.SYSTEM_FUNCTION_ERROR, severity: "HIGH", message: `Beers: ${err.message}`, source: "SYSTEM" });
    }
  }
  timing.beers = Date.now() - timing.beers;

  // DEDUPLICATE
  const seen = new Map();
  for (const alert of all_alerts) {
    const key = `${alert.alert_code || ""}:${alert.drug || ""}`.toLowerCase();
    if (!seen.has(key)) seen.set(key, alert);
  }
  all_alerts = Array.from(seen.values());

  // SORT BY SEVERITY
  all_alerts.sort((a, b) => (SEVERITY_ORDER[a.severity] || 99) - (SEVERITY_ORDER[b.severity] || 99));

  return {
    alert_count: all_alerts.length,
    critical_count: all_alerts.filter(a => a.severity === "CRITICAL").length,
    high_count: all_alerts.filter(a => a.severity === "HIGH").length,
    has_blocking_alerts: all_alerts.some(a => a.severity === "CRITICAL"),
    alerts: all_alerts,
    function_results,
    timing
  };
}

module.exports = { MED_SAFETY_ENGINE };