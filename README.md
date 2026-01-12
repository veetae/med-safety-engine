# Med Safety Engine

A clinical medication safety checking engine designed for primary care and nephrology practices. Detects high-risk drug combinations, renal dosing issues, and Beers Criteria violations.

## Features

- **Renal Dosing** - Flags medications requiring adjustment for CKD stages
- **Triple Whammy** - Detects ACE/ARB + Diuretic + NSAID combinations (AKI risk)
- **Opioid Safety** - Opioid + benzo detection, MME calculation, naloxone criteria
- **Antithrombotic** - Dual anticoagulation, antiplatelet + anticoagulant combinations
- **Serotonin Syndrome** - MAOI contraindications, serotonergic drug combinations
- **Beers Criteria** - AGS 2023 PIMs, anticholinergic burden, CNS polypharmacy
- **ICD-10 Integration** - Auto-derives conditions from diagnosis codes

## Installation

```bash
npm install
```

## Usage

```javascript
const { MED_SAFETY_ENGINE } = require('./orchestrator.js');

const patient = {
  patient_age: 78,
  patient_sex: 'F',
  egfr: 25,
  weight_kg: 65,
  current_medications: [
    { name: 'metformin' },
    { name: 'lisinopril' },
    { name: 'furosemide' },
    { name: 'ibuprofen' }
  ],
  icd_codes: ['N18.4', 'I10', 'E11.9'],
  conditions: []
};

const result = MED_SAFETY_ENGINE(patient);

console.log(`Alerts: ${result.alert_count}`);
console.log(`Critical: ${result.critical_count}`);
result.alerts.forEach(a => console.log(a.severity, a.message));
```

## Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| patient_age | number | Yes | Patient age in years |
| patient_sex | string | Yes | 'M' or 'F' |
| egfr | number | Yes | eGFR in mL/min/1.73m² |
| weight_kg | number | No | Weight in kg (for dosing) |
| current_medications | array | Yes | Array of {name: string} objects |
| icd_codes | array | No | ICD-10 diagnosis codes |
| conditions | array | No | Legacy condition strings |

## Output

```javascript
{
  alerts: [...],           // Array of alert objects
  alert_count: number,     // Total alerts
  critical_count: number,  // Critical severity count
  metadata: {...}          // Function-specific metadata
}
```

## Alert Severities

- **CRITICAL** - Contraindicated combination, immediate action needed
- **HIGH** - Significant risk, clinical review required
- **MODERATE** - Monitor closely, consider alternatives
- **LOW** - Informational, document awareness

## Privacy

This engine is **PHI-free by design**. It requires only:
- Age (not DOB)
- Sex
- Lab values (eGFR)
- Medication names
- ICD-10 codes

No patient identifiers (name, MRN, DOB, address) are needed or processed.

## References

- AGS Beers Criteria 2023
- CDC Opioid Prescribing Guidelines 2022
- FDA Black Box Warnings
- Hunter Criteria (Serotonin Syndrome)
- KDIGO CKD Guidelines

## License

MIT License - See LICENSE file

## Disclaimer

See DISCLAIMER.md for important clinical use limitations.
