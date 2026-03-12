import * as XLSX from 'xlsx';

/**
 * Parse a file buffer into a 2D array of rows.
 */
function parseSheet(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

/**
 * Convert a column letter (A, B, ... Z, AA, AB ...) to 0-based index.
 */
function colIndex(letter) {
  let n = 0;
  for (const ch of letter.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

const COL = {
  // Checkin & Checkout
  CIO_SALESMAN:  colIndex('A'),   // Salesman Name
  CIO_STORE:     colIndex('E'),   // Retailer/Store Name
  CIO_CHECKIN:   colIndex('U'),   // Check-in Time

  // Product Report
  PR_SALESMAN:   colIndex('Q'),   // Salesman Name
  PR_BRAND:      colIndex('W'),   // Brand Name
  PR_ORDER_ID:   colIndex('D'),   // Retailer Code (used as order ID)
  PR_VALUE:      colIndex('AB'),  // Total Order Value

  // Feedback Activity DETAILED report (feedback_activity_detail_report)
  // NOTE: Column layout differs from the standard feedback_activity_report
  FA_SALESMAN:   colIndex('B'),   // Salesman Name  (standard used col C)
  FA_SURVEY:     colIndex('G'),   // Survey Name    (standard used col F)
  FA_STORE:      colIndex('K'),   // Store Name     (standard used col J)
  FA_QUESTION:   colIndex('P'),   // Question text  (detailed only)
  FA_ANSWER:     colIndex('S'),   // Answer text    (detailed only)
};

/**
 * Parse checkin/checkout report.
 * Returns Map<seName, { stores: Set, checkInTimes: number[] }>
 */
function parseCheckinReport(buffer) {
  const rows = parseSheet(buffer);
  const data = new Map();

  for (let i = 1; i < rows.length; i++) {
    const row  = rows[i];
    const name = String(row[COL.CIO_SALESMAN] || '').trim();
    if (!name) continue;

    const store   = String(row[COL.CIO_STORE]   || '').trim();
    const checkIn = row[COL.CIO_CHECKIN];

    if (!data.has(name)) data.set(name, { stores: new Set(), checkInTimes: [] });
    const entry = data.get(name);
    if (store) entry.stores.add(store);

    if (checkIn) {
      let minutes = null;
      if (checkIn instanceof Date) {
        minutes = checkIn.getHours() * 60 + checkIn.getMinutes() + checkIn.getSeconds() / 60;
      } else {
        const str   = String(checkIn).trim();
        const match = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (match) {
          minutes = parseInt(match[1]) * 60 + parseInt(match[2]) + (parseInt(match[3] || 0)) / 60;
        }
      }
      if (minutes !== null) entry.checkInTimes.push(minutes);
    }
  }

  return data;
}

/**
 * Parse product report.
 * Returns Map<seName, { brands: Set, orderIds: Set, value: number, brandRows: {brand, value}[] }>
 */
function parseProductReport(buffer) {
  const rows = parseSheet(buffer);
  const data = new Map();

  for (let i = 1; i < rows.length; i++) {
    const row  = rows[i];
    const name = String(row[COL.PR_SALESMAN] || '').trim();
    if (!name) continue;

    const brand   = String(row[COL.PR_BRAND]   || '').trim();
    const orderId = String(row[COL.PR_ORDER_ID] || '').trim();
    const rawVal  = row[COL.PR_VALUE];
    const value   = parseFloat(String(rawVal).replace(/[^0-9.-]/g, '')) || 0;

    if (!data.has(name)) data.set(name, { brands: new Set(), orderIds: new Set(), value: 0, brandRows: [] });
    const entry = data.get(name);
    if (brand) entry.brands.add(brand);
    if (orderId) entry.orderIds.add(orderId);
    if (value > 0) {
      entry.value += value;
      entry.brandRows.push({ brand, value });
    }
  }

  return data;
}

/**
 * Parse the DETAILED feedback activity report.
 * Each survey submission has multiple rows (one per question/answer).
 *
 * Returns:
 *   perSE: Map<seName, { surveys: Set<surveyName> }>  — for complete_report scoring
 *   rows:  { se_name, store_name, brand_name, survey_name, question, answer }[]  — for DB storage + AI
 *
 * Excludes "Outlet Feedback" rows entirely (same logic as original).
 */
function parseFeedbackDetailReport(buffer) {
  const raw  = parseSheet(buffer);
  const perSE = new Map();   // for scoring
  const rows  = [];          // for detailed storage

  for (let i = 1; i < raw.length; i++) {
    const row    = raw[i];
    const name   = String(row[COL.FA_SALESMAN] || '').trim();
    if (!name) continue;

    const surveyName = String(row[COL.FA_SURVEY]   || '').trim();
    const store      = String(row[COL.FA_STORE]    || '').trim();
    const question   = String(row[COL.FA_QUESTION] || '').trim();
    const answer     = String(row[COL.FA_ANSWER]   || '').trim();

    if (!surveyName || surveyName === 'Outlet Feedback') continue;

    // Scoring: count unique survey types per SE (same logic as before)
    if (!perSE.has(name)) perSE.set(name, { surveys: new Set() });
    perSE.get(name).surveys.add(surveyName);

    // Brand name: strip " Feedback" suffix from survey name
    const brandName = surveyName.replace(/ Feedback$/i, '').trim();

    // Only store rows that have a non-empty question and answer
    if (question && answer) {
      rows.push({ se_name: name, store_name: store, brand_name: brandName, survey_name: surveyName, question, answer });
    }
  }

  return { perSE, rows };
}

/**
 * Minutes-since-midnight to "HH:MM" string.
 */
function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Build brand coverage matrix: for each SE, which active brands did they order?
 *
 * Matching is fuzzy: PepUp may export "Kitchen Smith International Foods Ltd"
 * while the DB stores "Kitchen Smith". We match if either name contains the other
 * (case-insensitive), with a minimum 4-char overlap to avoid false positives.
 */
function buildBrandCoverage(productData, activeBrands) {
  const coverage = new Map();
  for (const [name, entry] of productData) {
    const row = {};
    for (const brand of activeBrands) {
      const brandLower = brand.toLowerCase();
      row[brand] = entry.brandRows.some(r => {
        if (!r.value) return false;
        const reportBrand = r.brand.toLowerCase();
        return (
          reportBrand === brandLower ||
          (brandLower.length >= 4 && reportBrand.includes(brandLower)) ||
          (reportBrand.length >= 4 && brandLower.includes(reportBrand))
        );
      });
    }
    coverage.set(name, row);
  }
  return coverage;
}

/**
 * Main entry point.
 * @param {Buffer} checkinBuffer
 * @param {Buffer} productBuffer
 * @param {Buffer} feedbackDetailBuffer  — the detailed feedback report
 * @param {string[]} seRoster
 * @param {string[]} activeBrands
 * @returns {{ seMetrics: Object[], feedbackRows: Object[] }}
 */
export function processReports(checkinBuffer, productBuffer, feedbackDetailBuffer, seRoster, activeBrands) {
  const checkinData   = parseCheckinReport(checkinBuffer);
  const productData   = parseProductReport(productBuffer);
  const { perSE: feedbackData, rows: feedbackRows } = parseFeedbackDetailReport(feedbackDetailBuffer);
  const brandCoverage = buildBrandCoverage(productData, activeBrands);

  const seMetrics = [];

  for (const seName of seRoster) {
    const checkin  = findEntry(checkinData,   seName);
    const product  = findEntry(productData,   seName);
    const feedback = findEntry(feedbackData,  seName);
    const coverage = findEntry(brandCoverage, seName) || {};

    const storesVisited   = checkin  ? checkin.stores.size   : 0;
    const brandsOrdered   = product  ? product.brands.size   : 0;
    const ordersGenerated = product  ? product.orderIds.size : 0;
    const valueOfOrders   = product  ? product.value         : 0;
    const completeReport  = feedback ? feedback.surveys.size : 0;

    const avgValuePerBp    = brandsOrdered > 0 ? valueOfOrders / brandsOrdered  : 0;
    const avgValuePerStore = storesVisited > 0 ? valueOfOrders / storesVisited  : 0;

    let resumptionTime = null;
    if (checkin && checkin.checkInTimes.length > 0) {
      resumptionTime = minutesToTime(Math.min(...checkin.checkInTimes));
    }

    const missedBrands = activeBrands.filter(b => !coverage[b]);

    seMetrics.push({
      se_name:            seName,
      resumption_time:    resumptionTime,
      stores_visited:     storesVisited,
      brands_ordered:     brandsOrdered,
      orders_generated:   ordersGenerated,
      value_of_orders:    valueOfOrders,
      complete_report:    completeReport,
      avg_value_per_bp:   avgValuePerBp,
      avg_value_per_store: avgValuePerStore,
      brand_coverage:     JSON.stringify(coverage),
      missed_brands:      missedBrands,
    });
  }

  return { seMetrics, feedbackRows };
}

/**
 * Case-insensitive name lookup with fallback to partial match.
 */
function findEntry(map, name) {
  if (map.has(name)) return map.get(name);

  const lower = name.toLowerCase();
  for (const [key, val] of map) {
    if (key.toLowerCase() === lower) return val;
  }

  const firstName = lower.split(' ')[0];
  for (const [key, val] of map) {
    if (key.toLowerCase().startsWith(firstName)) return val;
  }

  return null;
}
