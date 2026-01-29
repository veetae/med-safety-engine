# Technical Analysis: Potential Improvements

## 1. Input Validation Implementation

### File: `orchestrator.js`

Add validation function before processing:

```javascript
/**
 * Validate patient data input
 * @param {Object} patient_data 
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePatientData(patient_data) {
  const errors = [];
  
  // Age validation
  if (patient_data.patient_age !== undefined && patient_data.patient_age !== null) {
    if (typeof patient_data.patient_age !== 'number') {
      errors.push('patient_age must be a number');
    } else if (patient_data.patient_age < 0 || patient_data.patient_age > 120) {
      errors.push('patient_age must be between 0 and 120 years');
    }
  }
  
  // eGFR validation
  if (patient_data.egfr !== undefined && patient_data.egfr !== null) {
    if (typeof patient_data.egfr !== 'number') {
      errors.push('egfr must be a number');
    } else if (patient_data.egfr < 0 || patient_data.egfr > 200) {
      errors.push('egfr must be between 0 and 200 mL/min/1.73m²');
    }
  }
  
  // Weight validation
  if (patient_data.weight_kg !== undefined && patient_data.weight_kg !== null) {
    if (typeof patient_data.weight_kg !== 'number') {
      errors.push('weight_kg must be a number');
    } else if (patient_data.weight_kg < 1 || patient_data.weight_kg > 500) {
      errors.push('weight_kg must be between 1 and 500 kg');
    }
  }
  
  // Sex validation
  if (patient_data.patient_sex !== undefined && patient_data.patient_sex !== null) {
    const normalized = String(patient_data.patient_sex).toUpperCase();
    if (!['M', 'F', 'MALE', 'FEMALE'].includes(normalized)) {
      errors.push('patient_sex must be "M", "F", "male", or "female"');
    }
  }
  
  // Medications validation
  if (!Array.isArray(patient_data.current_medications)) {
    errors.push('current_medications must be an array');
  } else {
    if (patient_data.current_medications.length > 100) {
      errors.push('current_medications array too large (max 100)');
    }
    
    patient_data.current_medications.forEach((med, idx) => {
      if (!med.name) {
        errors.push(`Medication at index ${idx} missing required "name" field`);
      }
    });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// In MED_SAFETY_ENGINE function, add at the beginning:
function MED_SAFETY_ENGINE(patient_data) {
  const validation = validatePatientData(patient_data);
  if (!validation.valid) {
    return {
      alert_count: validation.errors.length,
      critical_count: validation.errors.length,
      high_count: 0,
      has_blocking_alerts: true,
      alerts: validation.errors.map(err => ({
        alert_code: ALERT_CODES.SYSTEM_ENGINE_ERROR,
        severity: "CRITICAL",
        message: `Validation Error: ${err}`,
        source: "VALIDATION"
      })),
      function_results: {},
      timing: {}
    };
  }
  
  // ... rest of function
}
```

---

## 2. Enhanced Deduplication

### File: `orchestrator.js`

Replace lines 118-123 with:

```javascript
// DEDUPLICATE AND MERGE
const seen = new Map();
for (const alert of all_alerts) {
  // Normalize drug identifier
  let drugKey = '';
  if (alert.drug) {
    drugKey = String(alert.drug).toLowerCase();
  } else if (alert.drugs_involved && Array.isArray(alert.drugs_involved)) {
    drugKey = alert.drugs_involved.map(d => String(d).toLowerCase()).sort().join(',');
  }
  
  const key = `${alert.alert_code || "UNKNOWN"}:${drugKey}`;
  
  if (!seen.has(key)) {
    seen.set(key, alert);
  } else {
    // If duplicate, keep the more severe one
    const existing = seen.get(key);
    const existingSeverity = SEVERITY_ORDER[existing.severity] || 99;
    const newSeverity = SEVERITY_ORDER[alert.severity] || 99;
    
    if (newSeverity < existingSeverity) {
      seen.set(key, alert);
    }
  }
}
all_alerts = Array.from(seen.values());
```

---

## 3. MME Calculation Improvements

### File: `functions/03_opioid_safety.js`

Enhance the `calculateMME()` function:

```javascript
function calculateMME(med) {
  const name_lower = (med.name || "").toLowerCase();
  let dose_str = (med.dose || "").toLowerCase();
  
  // Handle fractional doses
  dose_str = dose_str.replace(/½/g, '0.5')
                     .replace(/¼/g, '0.25')
                     .replace(/¾/g, '0.75')
                     .replace(/1\/2/g, '0.5')
                     .replace(/1\/4/g, '0.25')
                     .replace(/3\/4/g, '0.75');
  
  // Extract numeric dose - handle ranges by taking the maximum
  const dose_match = dose_str.match(/(\d+(?:\.\d+)?)\s*-?\s*(\d+(?:\.\d+)?)?/);
  if (!dose_match) {
    // Log warning if no dose found
    if (dose_str && !dose_str.includes('prn') && !dose_str.includes('as needed')) {
      console.warn(`Unable to parse dose for ${med.name}: "${med.dose}"`);
    }
    return 0;
  }
  
  // If range, use the higher value
  const dose_num = dose_match[2] ? parseFloat(dose_match[2]) : parseFloat(dose_match[1]);
  
  // Frequency multiplier
  let freq_mult = 1;
  if (dose_str.includes("bid") || dose_str.includes("q12") || dose_str.includes("twice")) {
    freq_mult = 2;
  } else if (dose_str.includes("tid") || dose_str.includes("q8") || dose_str.includes("three times")) {
    freq_mult = 3;
  } else if (dose_str.includes("qid") || dose_str.includes("q6") || dose_str.includes("four times")) {
    freq_mult = 4;
  } else if (dose_str.includes("q4")) {
    freq_mult = 6;
  } else if (dose_str.includes("daily") || dose_str.includes("once")) {
    freq_mult = 1;
  } else if (dose_str.includes("prn") || dose_str.includes("as needed")) {
    // For PRN, if max daily dose not specified, use conservative estimate
    // Check if max daily is specified
    const maxDaily = dose_str.match(/max(?:imum)?\s+(\d+)/);
    if (maxDaily) {
      // Use the max as total daily
      return parseFloat(maxDaily[1]);
    }
    // Default PRN to q6h dosing (4x daily) as conservative estimate
    freq_mult = 4;
  }
  
  // Find conversion factor
  for (const [drug, factor] of Object.entries(MME_FACTORS)) {
    const drugBase = drug.split("_")[0];
    if (name_lower.includes(drugBase)) {
      // Special handling for fentanyl patch (mcg/hr)
      if (drug === "fentanyl_patch" && (name_lower.includes("patch") || name_lower.includes("duragesic"))) {
        return dose_num * factor; // mcg/hr * 2.4 = daily MME
      }
      
      // Special handling for methadone (dose-dependent conversion)
      if (drugBase === "methadone") {
        const daily_dose = dose_num * freq_mult;
        if (daily_dose <= 20) return daily_dose * 4;
        if (daily_dose <= 40) return daily_dose * 8;
        if (daily_dose <= 60) return daily_dose * 10;
        return daily_dose * 12;
      }
      
      // Standard calculation
      return dose_num * freq_mult * factor;
    }
  }
  
  return 0;
}
```

---

## 4. Improved Drug Name Matching

### File: `utils/atc_lookup.js`

Replace the `lookupDrug()` function:

```javascript
function lookupDrug(drugName) {
  if (!drugName) return null;
  
  const name = drugName.toLowerCase().trim();
  
  // 1. Exact match
  if (DRUG_LOOKUP[name]) {
    return DRUG_LOOKUP[name];
  }
  
  // 2. Remove common dosage suffixes and try again
  const cleanName = name
    .replace(/\s+(er|xr|sr|cr|la|dr|od|cd)\b/gi, '')
    .replace(/\s+\d+(mg|mcg|g|ml|units?)?\b/gi, '')
    .trim();
    
  if (cleanName !== name && DRUG_LOOKUP[cleanName]) {
    return DRUG_LOOKUP[cleanName];
  }
  
  // 3. Partial match - but only if name starts with drug or drug is early in name
  for (const [drug, info] of Object.entries(DRUG_LOOKUP)) {
    // Name starts with drug (e.g., "metformin 500mg" matches "metformin")
    if (name.startsWith(drug)) {
      return info;
    }
    
    // Drug appears as whole word in name
    const nameWords = name.split(/[\s\-\/]+/);
    if (nameWords.includes(drug)) {
      return info;
    }
    
    // Check if first word of name matches drug
    if (nameWords.length > 0 && nameWords[0] === drug) {
      return info;
    }
  }
  
  // 4. Fuzzy match for common misspellings (optional)
  // Could add Levenshtein distance here if needed
  
  return null;
}
```

---

## 5. Extract Magic Numbers to Constants

### File: `orchestrator.js`

Add at top:

```javascript
// Clinical thresholds
const CLINICAL_THRESHOLDS = Object.freeze({
  RENAL_CHECK_EGFR: 90,      // Run renal check if eGFR < 90
  BEERS_CRITERIA_AGE: 65,     // Beers criteria applies at age >= 65
  MAX_MEDICATIONS: 100,       // Maximum medications in array
  MAX_ICD_CODES: 50          // Maximum ICD codes
});
```

Then replace hardcoded values:
- Line 45: `if (egfr !== null && egfr < 90)` → `if (egfr !== null && egfr < CLINICAL_THRESHOLDS.RENAL_CHECK_EGFR)`
- Line 106: `if (patient_age >= 65)` → `if (patient_age >= CLINICAL_THRESHOLDS.BEERS_CRITERIA_AGE)`

---

## 6. Add Unit Tests

### New file: `tests/unit/test_renal_dosing.js`

```javascript
const { RENAL_DOSING_CHECK } = require("../../functions/01_renal_dosing.js");

describe('Renal Dosing Check', () => {
  
  test('metformin contraindicated at eGFR < 30', () => {
    const result = RENAL_DOSING_CHECK({
      egfr: 25,
      medications: [{ name: 'metformin' }]
    });
    
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].severity).toBe('CRITICAL');
    expect(result.alerts[0].alert_code).toContain('METFORMIN');
  });
  
  test('metformin dose reduction at eGFR 30-45', () => {
    const result = RENAL_DOSING_CHECK({
      egfr: 40,
      medications: [{ name: 'metformin' }]
    });
    
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].severity).toBe('HIGH');
    expect(result.alerts[0].action).toContain('Reduce');
  });
  
  test('no alerts for normal eGFR', () => {
    const result = RENAL_DOSING_CHECK({
      egfr: 70,
      medications: [{ name: 'lisinopril' }]
    });
    
    expect(result.alerts).toHaveLength(0);
  });
  
  test('handles empty medication list', () => {
    const result = RENAL_DOSING_CHECK({
      egfr: 25,
      medications: []
    });
    
    expect(result.alerts).toHaveLength(0);
  });
  
  test('handles null eGFR', () => {
    const result = RENAL_DOSING_CHECK({
      egfr: null,
      medications: [{ name: 'metformin' }]
    });
    
    expect(result.alerts).toHaveLength(0);
  });
});
```

---

## 7. Add Error Boundaries

### File: `orchestrator.js`

Improve error handling:

```javascript
// Replace try-catch blocks with more detailed error handling
timing.renal = Date.now();
if (egfr !== null && egfr < CLINICAL_THRESHOLDS.RENAL_CHECK_EGFR) {
  try {
    const result = RENAL_DOSING_CHECK({ egfr, medications: current_medications });
    all_alerts = all_alerts.concat(result.alerts.map(a => ({ ...a, source: "RENAL" })));
    function_results.renal = result.metadata;
  } catch (err) {
    // Log error for debugging
    console.error('[MED_SAFETY_ENGINE] Renal check error:', err);
    
    // Add system alert
    all_alerts.push({ 
      alert_code: ALERT_CODES.SYSTEM_FUNCTION_ERROR, 
      severity: "HIGH", 
      message: "Renal dosing check failed to complete", 
      reason: process.env.NODE_ENV === 'development' ? err.message : 'System error',
      source: "SYSTEM",
      function: "RENAL_DOSING_CHECK"
    });
    
    // Store error in metadata
    function_results.renal = { error: true, message: err.message };
  }
}
timing.renal = Date.now() - timing.renal;
```

---

## 8. Add Logging Utility

### New file: `utils/logger.js`

```javascript
/**
 * Simple logging utility for Med Safety Engine
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLevel = process.env.LOG_LEVEL 
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] 
  : LOG_LEVELS.ERROR;

function log(level, module, message, data = null) {
  if (LOG_LEVELS[level] <= currentLevel) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      module,
      message,
      ...(data && { data })
    };
    
    const output = JSON.stringify(logEntry);
    
    if (level === 'ERROR') {
      console.error(output);
    } else if (level === 'WARN') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }
}

module.exports = {
  error: (module, message, data) => log('ERROR', module, message, data),
  warn: (module, message, data) => log('WARN', module, message, data),
  info: (module, message, data) => log('INFO', module, message, data),
  debug: (module, message, data) => log('DEBUG', module, message, data)
};
```

---

## 9. Performance Monitoring

### File: `orchestrator.js`

Add performance metrics:

```javascript
function MED_SAFETY_ENGINE(patient_data) {
  const startTime = Date.now();
  
  // ... existing code ...
  
  // At the end, before return:
  const totalTime = Date.now() - startTime;
  
  // Log slow executions
  if (totalTime > 100) {
    console.warn(`[MED_SAFETY_ENGINE] Slow execution: ${totalTime}ms`);
  }
  
  return {
    alert_count: all_alerts.length,
    critical_count: all_alerts.filter(a => a.severity === "CRITICAL").length,
    high_count: all_alerts.filter(a => a.severity === "HIGH").length,
    has_blocking_alerts: all_alerts.some(a => a.severity === "CRITICAL"),
    alerts: all_alerts,
    function_results,
    timing: {
      ...timing,
      total: totalTime
    },
    metadata: {
      engine_version: "3.0.0",
      timestamp: new Date().toISOString(),
      medication_count: current_medications.length
    }
  };
}
```

---

## 10. Add TypeScript Definitions

### New file: `types/index.d.ts`

```typescript
export interface Medication {
  name: string;
  class?: string;
  dose?: string;
  frequency?: string;
}

export interface PatientData {
  patient_age?: number | null;
  patient_sex?: 'M' | 'F' | null;
  weight_kg?: number | null;
  egfr?: number | null;
  liver_disease?: boolean;
  heart_failure?: boolean;
  atrial_fibrillation?: boolean;
  prior_gi_bleed?: boolean;
  recent_pci_date?: string | null;
  stent_type?: 'DES' | 'BMS' | null;
  hb_low?: boolean;
  respiratory_disease?: boolean;
  opioid_naive?: boolean;
  active_illness?: {
    volume_depleted?: boolean;
    vomiting_diarrhea?: boolean;
    sepsis?: boolean;
    recent_surgery?: boolean;
    acute_infection?: boolean;
  };
  current_medications: Medication[];
  conditions?: string[];
  icd_codes?: string[];
  recent_maoi_use?: {
    drug: string;
    stopped_date: string;
  } | null;
  ppi_duration_weeks?: number | null;
}

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW' | 'INFO';

export interface Alert {
  alert_code: string;
  severity: AlertSeverity;
  message: string;
  reason?: string;
  action?: string;
  drug?: string;
  drugs_involved?: string[];
  source: string;
  monitoring?: string;
  guideline?: string;
}

export interface EngineResult {
  alert_count: number;
  critical_count: number;
  high_count: number;
  has_blocking_alerts: boolean;
  alerts: Alert[];
  function_results: Record<string, any>;
  timing: Record<string, number>;
}

export function MED_SAFETY_ENGINE(patient_data: PatientData): EngineResult;
```

---

## Priority Implementation Order

1. **Phase 1 (Critical):**
   - Input validation
   - Enhanced error handling
   - Unit tests for core functions

2. **Phase 2 (High):**
   - Improved MME calculation
   - Enhanced deduplication
   - Extract magic numbers

3. **Phase 3 (Medium):**
   - Logging utility
   - Performance monitoring
   - TypeScript definitions

4. **Phase 4 (Low):**
   - Additional unit tests
   - Improved drug matching
   - Documentation improvements

---

## Estimated Implementation Time

- Phase 1: 4-6 hours
- Phase 2: 3-4 hours
- Phase 3: 2-3 hours
- Phase 4: 4-6 hours

**Total:** 13-19 hours for complete implementation
