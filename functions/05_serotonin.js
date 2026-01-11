/**
 * SEROTONIN SYNDROME CHECK
 * Function 06 - Domain: SEROTONIN_SYNDROME
 * 
 * Detects combinations that increase serotonin syndrome risk.
 * References: Hunter Criteria, FDA Drug Safety Communications
 */

const { ALERT_CODES } = require("../constants/alert_codes.js");

// Serotonergic drug categories by potency
const SEROTONIN_DRUGS = {
  high: ["MAOI", "SSRI", "SNRI", "methylene_blue", "linezolid"],
  moderate: ["TCA", "tramadol", "fentanyl", "meperidine", "tapentadol", 
             "trazodone", "mirtazapine", "buspirone", "lithium", "St_Johns_wort"],
  lower: ["triptan", "ondansetron", "metoclopramide", "cyclobenzaprine",
          "dextromethorphan", "carbamazepine", "valproate"]
};

// Washout periods for MAOIs (in days)
const MAOI_WASHOUT = {
  "phenelzine": 14,
  "tranylcypromine": 14,
  "isocarboxazid": 14,
  "selegiline": 14,
  "rasagiline": 14,
  "linezolid": 14,
  "methylene_blue": 14,
  "fluoxetine_to_maoi": 35,
  "default": 14
};

/**
 * @param {Object} input
 * @param {Array} input.medications
 * @param {number|null} input.patient_age
 * @param {number|null} input.egfr
 * @param {boolean} input.liver_disease
 * @param {Object|null} input.recent_maoi_use - { drug: string, stopped_date: string }
 * @returns {{ alerts: Array, metadata: Object }}
 */
function SEROTONIN_SYNDROME_CHECK(input) {
  const { medications, patient_age, egfr, liver_disease, recent_maoi_use } = input;
  const alerts = [];

  const high_risk = [];
  const moderate_risk = [];
  const lower_risk = [];

  for (const med of medications) {
    const medClass = med.class || "";
    const name = (med.name || "").toLowerCase();

    if (SEROTONIN_DRUGS.high.includes(medClass) || 
        name.includes("linezolid") || name.includes("methylene blue")) {
      high_risk.push(med);
    } else if (SEROTONIN_DRUGS.moderate.includes(medClass) ||
               name.includes("tramadol") || name.includes("trazodone") ||
               name.includes("mirtazapine")) {
      moderate_risk.push(med);
    } else if (SEROTONIN_DRUGS.lower.includes(medClass) ||
               name.includes("triptan") || name.includes("ondansetron")) {
      lower_risk.push(med);
    } else if (medClass === "SSRI" || medClass === "SNRI") {
      high_risk.push(med);
    }
  }

  const has_maoi = high_risk.some(m => 
    m.class === "MAOI" || m.name?.toLowerCase().includes("linezolid") ||
    m.name?.toLowerCase().includes("methylene blue")
  );

  // MAOI + ANY SEROTONERGIC (CONTRAINDICATED)
  if (has_maoi) {
    const other_serotonergics = [
      ...high_risk.filter(m => m.class !== "MAOI" && 
        !m.name?.toLowerCase().includes("linezolid") &&
        !m.name?.toLowerCase().includes("methylene blue")),
      ...moderate_risk, ...lower_risk
    ];

    if (other_serotonergics.length > 0) {
      const maoi_drugs = high_risk.filter(m => 
        m.class === "MAOI" || m.name?.toLowerCase().includes("linezolid") ||
        m.name?.toLowerCase().includes("methylene blue")
      );
      alerts.push({
        alert_code: ALERT_CODES.SEROTONIN_MAOI_COMBINATION,
        drugs_involved: [...maoi_drugs, ...other_serotonergics].map(m => m.name),
        severity: "CRITICAL",
        message: "⛔ MAOI + SEROTONERGIC DRUG - CONTRAINDICATED",
        reason: "Life-threatening serotonin syndrome risk",
        action: "STOP one immediately. If MAOI needed, wait appropriate washout period.",
        monitoring: "Monitor for hyperthermia, rigidity, autonomic instability",
        guideline: "FDA Black Box Warning"
      });
    }
  }

  // MAOI WASHOUT VIOLATION
  if (recent_maoi_use && recent_maoi_use.stopped_date) {
    const days_since = daysSince(recent_maoi_use.stopped_date);
    const maoi_drug = (recent_maoi_use.drug || "").toLowerCase();
    let required_washout = MAOI_WASHOUT.default;
    if (maoi_drug.includes("fluoxetine")) {
      required_washout = MAOI_WASHOUT.fluoxetine_to_maoi;
    } else {
      for (const [drug, days] of Object.entries(MAOI_WASHOUT)) {
        if (maoi_drug.includes(drug)) { required_washout = days; break; }
      }
    }

    if (days_since !== null && days_since < required_washout) {
      const current_serotonergics = [...high_risk, ...moderate_risk];
      if (current_serotonergics.length > 0) {
        alerts.push({
          alert_code: ALERT_CODES.SEROTONIN_WASHOUT_VIOLATION,
          drugs_involved: [recent_maoi_use.drug, ...current_serotonergics.map(m => m.name)],
          severity: "CRITICAL",
          message: `⛔ MAOI WASHOUT NOT COMPLETE - ${days_since}/${required_washout} days`,
          reason: `${recent_maoi_use.drug} stopped ${days_since} days ago; requires ${required_washout} day washout`,
          action: "Wait until washout complete before starting serotonergic",
          guideline: "FDA labeling; clinical pharmacology"
        });
      }
    }
  }

  // HIGH-RISK COMBINATIONS (Multiple high-potency agents)
  if (!has_maoi && high_risk.length >= 2) {
    alerts.push({
      alert_code: ALERT_CODES.SEROTONIN_HIGH_RISK,
      drugs_involved: high_risk.map(m => m.name),
      severity: "HIGH",
      message: "⚠️ MULTIPLE HIGH-POTENCY SEROTONERGIC DRUGS",
      reason: "Elevated serotonin syndrome risk with concurrent use",
      action: "Avoid combination if possible; use lowest doses; monitor closely",
      monitoring: "Watch for: tremor, hyperreflexia, agitation, hyperthermia, diaphoresis",
      guideline: "Hunter Criteria for diagnosis"
    });
  }

  // MODERATE-RISK COMBINATIONS
  const total_serotonergic = high_risk.length + moderate_risk.length;
  if (!has_maoi && high_risk.length === 1 && moderate_risk.length >= 1) {
    let severity = "MODERATE";
    if (liver_disease || (egfr && egfr < 30)) severity = "HIGH";
    alerts.push({
      alert_code: ALERT_CODES.SEROTONIN_MODERATE_RISK,
      drugs_involved: [...high_risk, ...moderate_risk].map(m => m.name),
      severity: severity,
      message: "⚠️ SEROTONERGIC COMBINATION - Monitor",
      reason: `${total_serotonergic} serotonergic agents concurrent`,
      action: "Use caution; counsel on serotonin syndrome symptoms",
      monitoring: "Educate patient on warning signs; reassess if dose changes"
    });
  }

  // TRIPTAN + SSRI/SNRI (FDA Warning)
  const has_triptan = lower_risk.some(m => 
    m.class === "triptan" || m.name?.toLowerCase().includes("triptan")
  );
  const has_ssri_snri = high_risk.some(m => ["SSRI", "SNRI"].includes(m.class));

  if (has_triptan && has_ssri_snri) {
    const triptans = lower_risk.filter(m => 
      m.class === "triptan" || m.name?.toLowerCase().includes("triptan")
    );
    const ssri_snri = high_risk.filter(m => ["SSRI", "SNRI"].includes(m.class));
    alerts.push({
      alert_code: ALERT_CODES.SEROTONIN_MODERATE_RISK,
      drugs_involved: [...ssri_snri, ...triptans].map(m => m.name),
      severity: "MODERATE",
      message: "Triptan + SSRI/SNRI combination",
      reason: "FDA warning exists though clinical risk appears low",
      action: "Generally acceptable with monitoring; counsel on symptoms",
      guideline: "FDA Safety Communication 2006 (risk lower than initially reported)"
    });
  }

  return {
    alerts,
    metadata: {
      high_risk_count: high_risk.length,
      moderate_risk_count: moderate_risk.length,
      has_maoi: has_maoi,
      total_serotonergic: total_serotonergic + lower_risk.length
    }
  };
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const then = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

module.exports = { SEROTONIN_SYNDROME_CHECK };
