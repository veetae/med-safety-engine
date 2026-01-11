const {MED_SAFETY_ENGINE} = require('./orchestrator.js');

const patient = {
  patient_age: 75,
  patient_sex: 'F',
  egfr: 50,
  weight_kg: 77,
  heart_failure: true,
  atrial_fibrillation: true,
  current_medications: [
    {name: 'carisoprodol', class: 'muscle_relaxant'},
    {name: 'amlodipine'},
    {name: 'ipratropium'},
    {name: 'ondansetron'},
    {name: 'rosuvastatin'},
    {name: 'metoprolol'},
    {name: 'eluxadoline', class: 'opioid'},
    {name: 'famotidine'},
    {name: 'apixaban', class: 'anticoagulant_DOAC'},
    {name: 'ezetimibe'},
    {name: 'lisinopril', class: 'ACE_inhibitor'},
    {name: 'trazodone'}
  ],
  icd_codes: ['I50.32', 'I48.0', 'G31.9', 'I11.0', 'I63.9'],
  conditions: []
};

const result = MED_SAFETY_ENGINE(patient);

console.log('═'.repeat(60));
console.log('REAL PATIENT TEST - 75F HFpEF/AFib/Stroke/Cerebral Atrophy');
console.log('═'.repeat(60));
console.log('');

for (const alert of result.alerts) {
  const sev = alert.severity === 'CRITICAL' ? '🔴' : alert.severity === 'HIGH' ? '🟠' : '🟡';
  console.log(`${sev} [${alert.alert_code}]`);
  console.log(`   Drug: ${alert.drug || 'N/A'}`);
  console.log(`   Message: ${alert.message}`);
  if (alert.condition) console.log(`   Condition: ${alert.condition}`);
  if (alert.action) console.log(`   Action: ${alert.action}`);
  console.log('');
}

console.log('═'.repeat(60));
console.log(`SUMMARY: ${result.alert_count} alerts (${result.critical_count} critical, ${result.high_count} high)`);
console.log('═'.repeat(60));
