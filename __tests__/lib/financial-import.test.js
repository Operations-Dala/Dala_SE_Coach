import { describe, expect, it } from 'vitest';

import {
  parseExcelDate,
  parseExpenseUploadRows,
  parseInflowUploadRows,
} from '../../lib/financial-import.js';

describe('parseExcelDate', () => {
  it('parses PepUp-style short month dates', () => {
    expect(parseExcelDate('For 23-Mar-26', '2026-03-01')).toBe('2026-03-23');
    expect(parseExcelDate('25 Mar 2026', '2026-03-01')).toBe('2026-03-25');
  });
});

describe('parseExpenseUploadRows', () => {
  it('parses the PepUp expense export by header names', () => {
    const rows = [
      [
        'Salesman Name',
        'Salesman Code',
        'Salesman Designation',
        'Reporting to',
        ' Reporting Person Designation',
        ' Salesman Zone',
        'Salesman State',
        'Salesman City',
        'Remark',
        'Allowance Date',
        'Working City',
        'Daily Logistics Expenses',
        'Daily Logistics Expenses Remark',
        'Samples Purchase Expense',
        'Samples Purchase Expense Remark',
        'Product Defect/Expiry Purchase',
        'Product Defect/Expiry Purchase Remark',
        'Total Amount',
        'Photo Count',
        'Created on',
      ],
      [
        'Adeola Ganiyu',
        'E SE',
        'Junior Sales Executive',
        'Joseph Femi',
        'Sales Executive',
        '',
        'Ogun',
        'Ota',
        'na',
        '25 Mar 2026',
        'LASU ISHERI',
        4700,
        'na',
        '-',
        '-',
        '-',
        '-',
        '4,700.00',
        0,
        '25 Mar 2026 22:16',
      ],
    ];

    const { format, records, skipped } = parseExpenseUploadRows(
      rows,
      [{ se_name: 'Adeola Ganiyu' }],
      '2026-03-01'
    );

    expect(format).toBe('pepup-expense');
    expect(skipped).toEqual([]);
    expect(records).toEqual([
      { record_date: '2026-03-25', se_name: 'Adeola Ganiyu', amount: 4700 },
    ]);
  });
});

describe('parseInflowUploadRows', () => {
  it('assigns region-summary inflow to the matching SE and zone senior, then aggregates duplicates', () => {
    const rows = [
      ['A. DALA TECHNOLOGIES LTD (RC 7128226)', '', ''],
      ['Group Summary', '', ''],
      ['For 23-Mar-26', '', ''],
      ['', 'Lagos', ''],
      ['Reg 10b', 209450, ''],
      ['Reg 1a', 471625.58, ''],
      ['Reg 8a', 453664.93, ''],
      ['CORP Reg 5a', 8199.99, ''],
      ['Grand Total', 1148940.5, ''],
    ];

    const rosterRows = [
      { se_name: 'Joseph Femi', position: 'senior_se', zone: 'Zone 1', region: '1,5,10' },
      { se_name: 'Bright Marcus', position: 'sales_executive', zone: 'Zone 1', region: '1A,1B,1C' },
      { se_name: 'Toba Meafhase', position: 'senior_se', zone: 'Zone 2', region: '3,7,8' },
      { se_name: 'Folorunso Omotola', position: 'sales_executive', zone: 'Zone 2', region: '3A,8A,8B' },
      { se_name: 'Olajumoke Ganiyu', position: 'corporate_se', zone: 'All Corporate', region: 'All Corporate' },
    ];

    const { format, skipped, records } = parseInflowUploadRows(rows, rosterRows, '2026-03-01');

    expect(format).toBe('region-summary');
    expect(skipped).toEqual([]);
    expect(records).toEqual([
      { record_date: '2026-03-23', se_name: 'Bright Marcus', amount: 471625.58 },
      { record_date: '2026-03-23', se_name: 'Folorunso Omotola', amount: 453664.93 },
      { record_date: '2026-03-23', se_name: 'Joseph Femi', amount: 681075.58 },
      { record_date: '2026-03-23', se_name: 'Olajumoke Ganiyu', amount: 8199.99 },
      { record_date: '2026-03-23', se_name: 'Toba Meafhase', amount: 453664.93 },
    ]);
  });

  it('falls back to the legacy per-se shape when the sheet is already normalized', () => {
    const rows = [
      ['Date', 'SE Name', 'Amount'],
      ['2026-03-25', 'Adeola Ganiyu', '4700'],
    ];

    const { format, records } = parseInflowUploadRows(
      rows,
      [{ se_name: 'Adeola Ganiyu', position: 'sales_executive', zone: 'Zone 4', region: '9,2' }],
      '2026-03-01'
    );

    expect(format).toBe('per-se');
    expect(records).toEqual([
      { record_date: '2026-03-25', se_name: 'Adeola Ganiyu', amount: 4700 },
    ]);
  });
});
