/**
 * MED SAFETY ENGINE - TEST CASES
 * Run: node tests/test_cases.js
 */

const { MED_SAFETY_ENGINE } = require("../orchestrator.js");

// ═══════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════

const TEST_CASES = [
  {
    name: "TEST 1: Renal + Beers (78F, CKD4, metformin + glyburide)",
    patient: {
      patient_age: 78,
      patient_sex: "F",
      egfr: 25,
      current_medications: [
        { name: "metformin", dose: "1000mg BID", class: "biguanide" },
        { name: "glyburide", dose: "5mg daily", class: "sulfonylurea" }
      ],
      conditions: []
    },
    expected: ["RENAL_METFORMIN", "RENAL_GLYBURIDE", "BEERS_PIM"]
  },
  {
    name: "TEST 2: Triple Whammy (70M, ACE + diuretic + NSAID)",
    patient: {
      patient_age: 70,
      patient_sex: "M",
      egfr: 55,
      current_medications: [
        { name: "lisinopril", dose: "40mg daily", class: "ACE_inhibitor" },
        { name: "furosemide", dose: "40mg daily", class: "loop_diuretic" },
        { name: "ibuprofen", dose: "600mg TID", class: "NSAID" }
      ],
      conditions: []
    },
    expected: ["TRIPLE_WHAMMY_PRESENT"]
  },
  {
    name: "TEST 3: Serotonin + Opioid + Beers (82F, SSRI + tramadol + benzo)",
    patient: {
      patient_age: 82,
      patient_sex: "F",
      egfr: 45,
      current_medications: [
        { name: "sertraline", dose: "100mg daily", class: "SSRI" },
        { name: "tramadol", dose: "50mg TID", class: "opioid" },
        { name: "lorazepam", dose: "0.5mg QHS", class: "benzodiazepine" }
      ],
      conditions: []
    },
    expected: ["SEROTONIN_MODERATE", "OPIOID_BENZO", "BEERS_PIM"]
  },
  {
    name: "TEST 4: MAOI Contraindication (65M, phenelzine + sertraline)",
    patient: {
      patient_age: 65,
      patient_sex: "M",
      egfr: 80,
      current_medications: [
        { name: "phenelzine", dose: "15mg TID", class: "MAOI" },
        { name: "sertraline", dose: "50mg daily", class: "SSRI" }
      ],
      conditions: []
    },
    expected: ["SEROTONIN_MAOI_COMBINATION"]
  },
  {
    name: "TEST 5: Dual Anticoag (75F, apixaban + warfarin)",
    patient: {
      patient_age: 75,
      patient_sex: "F",
      egfr: 50,
      atrial_fibrillation: true,
      current_medications: [
        { name: "apixaban", dose: "5mg BID", class: "anticoagulant_DOAC" },
        { name: "warfarin", dose: "5mg daily", class: "anticoagulant_warfarin" }
      ],
      conditions: []
    },
    expected: ["ANTITHROMB_DUAL_ANTICOAG"]
  },
  {
    name: "TEST 6: High ACB Score (80F, diphenhydramine + oxybutynin + amitriptyline)",
    patient: {
      patient_age: 80,
      patient_sex: "F",
      egfr: 60,
      current_medications: [
        { name: "diphenhydramine", dose: "25mg QHS", class: "first_gen_antihistamine" },
        { name: "oxybutynin", dose: "5mg BID", class: "anticholinergic_bladder" },
        { name: "amitriptyline", dose: "25mg QHS", class: "TCA" }
      ],
      conditions: ["dementia"]
    },
    expected: ["BEERS_ACB_HIGH", "BEERS_PIM", "BEERS_DISEASE_INTERACTION"]
  },
  {
    name: "TEST 7: Clean Patient (55M, no issues)",
    patient: {
      patient_age: 55,
      patient_sex: "M",
      egfr: 95,
      current_medications: [
        { name: "lisinopril", dose: "10mg daily", class: "ACE_inhibitor" },
        { name: "atorvastatin", dose: "40mg daily", class: "statin" }
      ],
      conditions: []
    },
    expected: []
  }
];

// ═══════════════════════════════════════════════════════════════
// RUN TESTS
// ═══════════════════════════════════════════════════════════════

function runTests() {
  console.log("═".repeat(60));
  console.log("MED SAFETY ENGINE - TEST SUITE");
  console.log("═".repeat(60));
  console.log("");

  let passed = 0;
  let failed = 0;

  for (const test of TEST_CASES) {
    console.log(`▶ ${test.name}`);
    
    try {
      const result = MED_SAFETY_ENGINE(test.patient);
      const alert_codes = result.alerts.map(a => a.alert_code);
      
      // Check expected alerts present
      const missing = test.expected.filter(exp => 
        !alert_codes.some(code => code.includes(exp))
      );
      
      if (missing.length === 0) {
        console.log(`  ✅ PASS - ${result.alert_count} alerts, ${result.critical_count} critical`);
        passed++;
      } else {
        console.log(`  ❌ FAIL - Missing: ${missing.join(", ")}`);
        console.log(`     Got: ${alert_codes.join(", ") || "(none)"}`);
        failed++;
      }
      
      // Show timing
      const totalMs = Object.values(result.timing).reduce((a, b) => a + b, 0);
      console.log(`  ⏱️  ${totalMs}ms total`);
      
    } catch (err) {
      console.log(`  ❌ ERROR: ${err.message}`);
      failed++;
    }
    
    console.log("");
  }

  console.log("═".repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(60));
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
