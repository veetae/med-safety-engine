/**
 * UNKNOWN DRUG TRACKER
 * Logs unrecognized medications for future expansion of drug database
 * 
 * Self-improving: Each unrecognized drug gets logged once with context
 * Review logs periodically to expand DRUG_EFFECTS, OPIOID_NAMES, etc.
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../logs/unknown_drugs.json');

// In-memory cache to avoid duplicate logging in same session
const sessionLogged = new Set();

/**
 * Log an unrecognized drug for future database expansion
 * @param {string} drugName - The drug name that wasn't recognized
 * @param {string} context - Which function tried to classify it
 * @param {Object} patientContext - Optional context to help classify later
 */
function logUnknownDrug(drugName, context, patientContext = {}) {
  if (!drugName) return;
  
  const normalizedName = drugName.toLowerCase().trim();
  const key = `${normalizedName}:${context}`;
  
  // Skip if already logged this session
  if (sessionLogged.has(key)) return;
  sessionLogged.add(key);
  
  // Skip common non-drugs (supplements, vitamins)
  const skipList = ['vitamin', 'calcium', 'magnesium', 'iron', 'zinc', 'fish oil', 
                    'omega', 'probiotic', 'fiber', 'd3', 'b12', 'b6', 'folic'];
  if (skipList.some(s => normalizedName.includes(s))) return;
  
  const entry = {
    drug: normalizedName,
    context,
    timestamp: new Date().toISOString(),
    patientAge: patientContext.age || null,
    conditions: patientContext.conditions || []
  };
  
  try {
    let existing = [];
    if (fs.existsSync(LOG_FILE)) {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      existing = JSON.parse(content);
    }
    
    // Check if drug already in log (from previous sessions)
    const alreadyLogged = existing.some(e => e.drug === normalizedName && e.context === context);
    if (alreadyLogged) return;
    
    existing.push(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(existing, null, 2));
    
  } catch (err) {
    // Silent fail - logging shouldn't break main functionality
  }
}

/**
 * Get all unknown drugs from log
 */
function getUnknownDrugs() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
  } catch (err) {}
  return [];
}

/**
 * Clear log after review
 */
function clearUnknownDrugs() {
  try {
    fs.writeFileSync(LOG_FILE, '[]');
  } catch (err) {}
}

/**
 * Summary report for review
 */
function getUnknownDrugsSummary() {
  const drugs = getUnknownDrugs();
  const byContext = {};
  
  for (const entry of drugs) {
    byContext[entry.context] = (byContext[entry.context] || 0) + 1;
  }
  
  return {
    total: drugs.length,
    byContext,
    drugs: [...new Set(drugs.map(d => d.drug))]
  };
}

module.exports = {
  logUnknownDrug,
  getUnknownDrugs,
  clearUnknownDrugs,
  getUnknownDrugsSummary
};
