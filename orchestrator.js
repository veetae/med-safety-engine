/**
 * MED SAFETY ENGINE ORCHESTRATOR
 * Version 2.6.0
 * 
 * Central router that calls all safety functions and aggregates alerts.
 * All alert codes come from constants/alert_codes.js
 */

const { ALERT_CODES, ALERT_CODE_META } = require("./constants/alert_codes.js");
const { SEROTONIN_SYNDROME_CHECK } = require("./functions/06_serotonin.js");
const { BEERS_CRITERIA_CHECK } = require("./functions/07_beers.js");

// Severity ranking for sorting
const SEVERITY_ORDER = { "CRITICAL": 1, "HIGH": 2, "MODERATE": 3, "LOW": 4, "INFO": 5 };

/**
 * @param {Object} patient_data
 * @returns {{ alert_count, critical_count, high_count, has_blocking_alerts, alerts, summary }}
 */
function MED_SAFETY_ENGINE(patient_data) {
  const {
    patient_age,
    patient_sex,
    weight_kg,
    egfr,
    ckd_stage,
    liver_disease = false,
    heart_failure = false,
    atrial_fibrillation = false,
    prior_gi_bleed = false,
    active_illness = {},
    current_medications = [],
    conditions = [],
    recent_maoi_use = null,
    ppi_duration_weeks = null
  } = patient_data;

  let all_alerts = [];

  // ═══════════════════════════════════════════════════════════════
  // FUNCTION 5: SEROTONIN SYNDROME (06_serotonin.js)
  // Trigger: Patient on serotonergic agent
  // ═══════════════════════════════════════════════════════════════
  const on_serotonergic = current_medications.some(m =>
    ["SSRI", "SNRI", "TCA", "MAOI", "tramadol", "triptan", "mirtazapine", "buspirone", "trazodone"]
      .includes(m.class)
  );

  if (on_serotonergic) {
    try {
      const result = SEROTONIN_SYNDROME_CHECK({
        medications: current_medications,
        patient_age,
        egfr,
        liver_disease,
        recent_maoi_use
      });
      all_alerts = all_alerts.concat(
        result.alerts.map(a => ({ ...a, source: "SEROTONIN_SYNDROME" }))
      );
    } catch (err) {
      all_alerts.push({
        alert_code: ALERT_CODES.SYSTEM_FUNCTION_ERROR,
        severity: "HIGH",
        message: `Serotonin check failed: ${err.message}`,
        source: "SYSTEM"
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // FUNCTION 6: BEERS CRITERIA (07_beers.js)
  // Trigger: Patient age ≥65
  // ═══════════════════════════════════════════════════════════════
  if (patient_age >= 65) {
    try {
      const result = BEERS_CRITERIA_CHECK({
        patient_age,
        medications: current_medications,
        conditions,
        egfr,
        ppi_duration_weeks
      });
      all_alerts = all_alerts.concat(
        result.alerts.map(a => ({ ...a, source: "BEERS_CRITERIA" }))
      );
    } catch (err) {
      all_alerts.push({
        alert_code: ALERT_CODES.SYSTEM_FUNCTION_ERROR,
        severity: "HIGH",
        message: `Beers check failed: ${err.message}`,
        source: "SYSTEM"
      });
    }
  }


  // ═══════════════════════════════════════════════════════════════
  // AGGREGATE AND DEDUPLICATE
  // ═══════════════════════════════════════════════════════════════
  all_alerts = deduplicateAlerts(all_alerts);

  // Sort by severity
  all_alerts.sort((a, b) => 
    (SEVERITY_ORDER[a.severity] || 99) - (SEVERITY_ORDER[b.severity] || 99)
  );

  return {
    alert_count: all_alerts.length,
    critical_count: all_alerts.filter(a => a.severity === "CRITICAL").length,
    high_count: all_alerts.filter(a => a.severity === "HIGH").length,
    has_blocking_alerts: all_alerts.some(a => a.severity === "CRITICAL"),
    alerts: all_alerts,
    summary: generateAlertSummary(all_alerts)
  };
}

function deduplicateAlerts(alerts) {
  const seen = new Map();
  for (const alert of alerts) {
    const key = (alert.drug || alert.alert_code || "unknown").toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, alert);
    } else {
      const existing = seen.get(key);
      if (SEVERITY_ORDER[alert.severity] < SEVERITY_ORDER[existing.severity]) {
        seen.set(key, alert);
      } else if (SEVERITY_ORDER[alert.severity] === SEVERITY_ORDER[existing.severity]) {
        existing.source = existing.source + ", " + alert.source;
      }
    }
  }
  return Array.from(seen.values());
}

function generateAlertSummary(alerts) {
  if (alerts.length === 0) return "✓ No medication safety alerts identified.";
  const critical = alerts.filter(a => a.severity === "CRITICAL");
  const high = alerts.filter(a => a.severity === "HIGH");
  const summary = [];
  if (critical.length > 0) {
    summary.push(`🚨 ${critical.length} CRITICAL alert(s):`);
    critical.forEach(a => summary.push(`   • ${a.drug || a.message}`));
  }
  if (high.length > 0) {
    summary.push(`⚠️ ${high.length} HIGH priority alert(s):`);
    high.forEach(a => summary.push(`   • ${a.drug || a.message}`));
  }
  return summary.join("\n");
}

module.exports = { MED_SAFETY_ENGINE };
