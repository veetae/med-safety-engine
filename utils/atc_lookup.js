/**
 * ATC-Based Drug Lookup
 * Uses static drug_mappings.json generated from WHO ATC database
 * 
 * 485 drugs mapped with: ATC code, class, pharmacological effects
 */

const path = require('path');
const DRUG_MAPPINGS = require('../data/drug_mappings.json');

// Build reverse lookup for faster access
const DRUG_LOOKUP = {};
for (const [drugName, info] of Object.entries(DRUG_MAPPINGS)) {
  DRUG_LOOKUP[drugName.toLowerCase()] = info;
}

/**
 * Look up drug by name
 * @param {string} drugName 
 * @returns {Object|null} {atc, class, effects} or null if not found
 */
function lookupDrug(drugName) {
  if (!drugName) return null;
  
  const name = drugName.toLowerCase().trim();
  
  // Exact match
  if (DRUG_LOOKUP[name]) {
    return DRUG_LOOKUP[name];
  }
  
  // Partial match (drug name might have dosage info)
  for (const [drug, info] of Object.entries(DRUG_LOOKUP)) {
    if (name.includes(drug) || drug.includes(name)) {
      return info;
    }
  }
  
  return null;
}

/**
 * Get drug class
 * @param {string} drugName 
 * @returns {string|null}
 */
function getDrugClass(drugName) {
  const info = lookupDrug(drugName);
  return info ? info.class : null;
}

/**
 * Get drug effects from ATC mapping
 * @param {string} drugName 
 * @returns {string[]}
 */
function getDrugEffectsFromATC(drugName) {
  const info = lookupDrug(drugName);
  return info ? info.effects : [];
}

/**
 * Get ATC code
 * @param {string} drugName 
 * @returns {string|null}
 */
function getATCCode(drugName) {
  const info = lookupDrug(drugName);
  return info ? info.atc : null;
}

/**
 * Check if drug is in a specific class
 * @param {string} drugName 
 * @param {string} drugClass 
 * @returns {boolean}
 */
function isDrugInClass(drugName, drugClass) {
  const info = lookupDrug(drugName);
  return info ? info.class === drugClass : false;
}

/**
 * Get all drugs in a class
 * @param {string} drugClass 
 * @returns {string[]}
 */
function getDrugsInClass(drugClass) {
  return Object.entries(DRUG_LOOKUP)
    .filter(([_, info]) => info.class === drugClass)
    .map(([name, _]) => name);
}

/**
 * Get stats about the mapping database
 */
function getMappingStats() {
  const classes = {};
  for (const info of Object.values(DRUG_LOOKUP)) {
    classes[info.class] = (classes[info.class] || 0) + 1;
  }
  return {
    totalDrugs: Object.keys(DRUG_LOOKUP).length,
    classCounts: classes
  };
}

module.exports = {
  lookupDrug,
  getDrugClass,
  getDrugEffectsFromATC,
  getATCCode,
  isDrugInClass,
  getDrugsInClass,
  getMappingStats,
  DRUG_MAPPINGS
};
