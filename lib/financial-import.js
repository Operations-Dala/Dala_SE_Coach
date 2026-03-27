import { parseSeRegions, tokenMatchesRegionKey } from './debt-import.js';

export function today() {
  return new Date().toISOString().split('T')[0];
}

export function parseExcelDate(value, fallbackDate = today()) {
  if (!value) return fallbackDate;

  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? fallbackDate : date.toISOString().split('T')[0];
  }

  const raw = String(value).trim();
  if (!raw) return fallbackDate;

  const forMatch = raw.match(/^for\s+(.+)$/i);
  if (forMatch) return parseExcelDate(forMatch[1], fallbackDate);

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(raw)) {
    const [day, month, year] = raw.split(/[\/\-]/);
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const shortMonthMatch = raw.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2}|\d{4})$/);
  if (shortMonthMatch) {
    const [, day, monthText, yearText] = shortMonthMatch;
    const monthMap = {
      jan: '01', feb: '02', mar: '03', apr: '04',
      may: '05', jun: '06', jul: '07', aug: '08',
      sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const month = monthMap[monthText.toLowerCase()];
    if (month) {
      const year = yearText.length === 2 ? `20${yearText}` : yearText;
      return `${year}-${month}-${day.padStart(2, '0')}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return fallbackDate;
}

export function parseMoney(value) {
  const normalised = String(value ?? '')
    .replace(/[₦â‚¦,\s]/g, '')
    .trim();

  if (!normalised || normalised === '-') return Number.NaN;
  return Number.parseFloat(normalised);
}

function normaliseHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function findHeaderIndex(row, label) {
  return row.findIndex(cell => normaliseHeader(cell) === label);
}

function aggregateRecords(records) {
  const byKey = new Map();

  for (const record of records) {
    const key = `${record.record_date}::${record.se_name}`;
    const existing = byKey.get(key);

    if (existing) {
      existing.amount += record.amount;
      continue;
    }

    byKey.set(key, { ...record });
  }

  return Array.from(byKey.values())
    .map(record => ({
      ...record,
      amount: Math.round(record.amount * 100) / 100,
    }))
    .sort((a, b) =>
      a.record_date.localeCompare(b.record_date) ||
      a.se_name.localeCompare(b.se_name)
    );
}

function rosterNameMap(rosterRows) {
  return Object.fromEntries(
    (rosterRows || []).map(row => [String(row.se_name || '').toLowerCase(), row])
  );
}

function normalisePosition(position) {
  return String(position || '').trim().toLowerCase();
}

function isSeniorPosition(position) {
  return normalisePosition(position) === 'senior_se';
}

function isCorporatePosition(position) {
  return normalisePosition(position) === 'corporate_se';
}

function parseExpensePepUpRows(rows, rosterRows, fallbackDate) {
  const headerIndex = rows.findIndex(row =>
    Array.isArray(row) &&
    row.some(cell => normaliseHeader(cell) === 'salesman name') &&
    row.some(cell => normaliseHeader(cell) === 'allowance date') &&
    row.some(cell => normaliseHeader(cell) === 'total amount')
  );

  if (headerIndex < 0) return null;

  const header = rows[headerIndex];
  const nameIndex = findHeaderIndex(header, 'salesman name');
  const dateIndex = findHeaderIndex(header, 'allowance date');
  const amountIndex = findHeaderIndex(header, 'total amount');
  const rosterMap = rosterNameMap(rosterRows);
  const records = [];
  const skipped = [];

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const rawName = String(row[nameIndex] || '').trim();
    const rawAmount = row[amountIndex];

    if (!rawName || rawAmount === '' || rawAmount === null) continue;

    const matched = rosterMap[rawName.toLowerCase()];
    if (!matched) {
      skipped.push(rawName);
      continue;
    }

    const amount = parseMoney(rawAmount);
    if (Number.isNaN(amount)) continue;

    records.push({
      record_date: row[dateIndex] ? parseExcelDate(row[dateIndex], fallbackDate) : fallbackDate,
      se_name: matched.se_name,
      amount,
    });
  }

  return {
    format: 'pepup-expense',
    records: aggregateRecords(records),
    skipped,
  };
}

function parseLegacyPersonAmountRows(rows, rosterRows, fallbackDate) {
  const rosterMap = rosterNameMap(rosterRows);
  const records = [];
  const skipped = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const rawDate = row[0];
    const rawName = String(row[1] || '').trim();
    const rawAmount = row[2];

    if (!rawName || rawAmount === '' || rawAmount === null) continue;

    const matched = rosterMap[rawName.toLowerCase()];
    if (!matched) {
      skipped.push(rawName);
      continue;
    }

    const amount = parseMoney(rawAmount);
    if (Number.isNaN(amount)) continue;

    records.push({
      record_date: rawDate ? parseExcelDate(rawDate, fallbackDate) : fallbackDate,
      se_name: matched.se_name,
      amount,
    });
  }

  return {
    format: 'per-se',
    records: aggregateRecords(records),
    skipped,
  };
}

function normaliseInflowRegionLabel(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/^corp\s+/, '')
    .replace(/^reg\s+/, '')
    .trim();
}

function isCorporateInflowLabel(label) {
  const value = String(label || '').trim().toLowerCase();
  return value.startsWith('corp ') || value.includes('brand partner');
}

function isGrandTotalLabel(label) {
  return /^grand total$/i.test(String(label || '').trim());
}

function isRegionSummaryLabel(label) {
  const value = String(label || '').trim();
  if (!value) return false;
  if (isGrandTotalLabel(value)) return true;
  if (isCorporateInflowLabel(value)) return true;
  return /^reg\s+\d+[a-z]?$/i.test(value);
}

function extractInflowSheetDate(rows, fallbackDate) {
  for (const row of rows) {
    for (const cell of (row || [])) {
      const value = String(cell || '').trim();
      if (/^for\s+/i.test(value)) return parseExcelDate(value, fallbackDate);
    }
  }
  return fallbackDate;
}

function matchInflowOwners(rawLabel, rosterRows) {
  const label = String(rawLabel || '').trim();
  if (!label || isGrandTotalLabel(label)) return [];

  if (isCorporateInflowLabel(label)) {
    return (rosterRows || [])
      .filter(row => row.zone === 'All Corporate' || isCorporatePosition(row.position))
      .map(row => row.se_name);
  }

  const regionKey = normaliseInflowRegionLabel(label);
  if (!/^\d+[a-z]?$/.test(regionKey)) return [];

  const directMatches = (rosterRows || []).filter(row =>
    row.zone !== 'All Corporate' &&
    parseSeRegions(row.region || '')?.some(token => tokenMatchesRegionKey(token, regionKey))
  );

  if (directMatches.length === 0) return [];

  const owners = new Map(directMatches.map(row => [row.se_name, row]));
  const zones = new Set(directMatches.map(row => row.zone).filter(Boolean));

  for (const row of (rosterRows || [])) {
    if (!zones.has(row.zone) || !isSeniorPosition(row.position)) continue;
    owners.set(row.se_name, row);
  }

  return Array.from(owners.values()).map(row => row.se_name);
}

function parseInflowRegionRows(rows, rosterRows, fallbackDate) {
  const summaryRows = rows.filter(row => isRegionSummaryLabel(row?.[0]));
  if (summaryRows.length === 0) return null;

  const recordDate = extractInflowSheetDate(rows, fallbackDate);
  const records = [];
  const skipped = [];

  for (const row of summaryRows) {
    const label = String(row[0] || '').trim();
    if (!label || isGrandTotalLabel(label)) continue;

    const amount = parseMoney(row[1]);
    if (Number.isNaN(amount)) continue;

    const owners = matchInflowOwners(label, rosterRows);
    if (owners.length === 0) {
      skipped.push(label);
      continue;
    }

    owners.forEach(se_name => {
      records.push({ record_date: recordDate, se_name, amount });
    });
  }

  return {
    format: 'region-summary',
    records: aggregateRecords(records),
    skipped,
  };
}

export function parseExpenseUploadRows(rows, rosterRows, fallbackDate) {
  return parseExpensePepUpRows(rows, rosterRows, fallbackDate) ||
    parseLegacyPersonAmountRows(rows, rosterRows, fallbackDate);
}

export function parseInflowUploadRows(rows, rosterRows, fallbackDate) {
  return parseInflowRegionRows(rows, rosterRows, fallbackDate) ||
    parseLegacyPersonAmountRows(rows, rosterRows, fallbackDate);
}
