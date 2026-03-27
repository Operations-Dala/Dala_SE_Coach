// Default configuration — seeded into Supabase on first boot via GET /api/seed

export const DEFAULT_ROSTER = [
  { se_name: 'Olajumoke Ganiyu',        region: 'All Corporate', zone: 'All Corporate', status: 'full',  position: 'corporate_se'    },
  { se_name: 'Omodolapo Alumona',       region: '6,12',          zone: 'Zone 3',        status: 'full',  position: 'sales_executive' },
  { se_name: 'Adeola Ganiyu',           region: '9,2',           zone: 'Zone 4',        status: 'full',  position: 'sales_executive' },
  { se_name: 'Joseph Femi',             region: '1,5,10',        zone: 'Zone 1',        status: 'full',  position: 'senior_se'       },
  { se_name: 'Okonofua Amina',          region: '6, 12',         zone: 'Zone 3',        status: 'full',  position: 'sales_executive' },
  { se_name: 'Toba Meafhase',           region: '3,7,8',         zone: 'Zone 2',        status: 'full',  position: 'senior_se'       },
  { se_name: 'Bright Marcus',           region: '1A, 1B, 1C',    zone: 'Zone 1',        status: 'full',  position: 'sales_executive' },
  { se_name: 'Folorunso Omotola',       region: '3A, 8A, 8B',    zone: 'Zone 2',        status: 'full',  position: 'sales_executive' },
  { se_name: 'Ngoyo Blessing Thomas',   region: 'Trial',         zone: 'Trial',         status: 'trial', position: 'trial'           },
];

export const DEFAULT_BRANDS = [
  'AMAN Blessed', 'Atun Foods', 'AugustSecrets', 'B-boon',
  'Cevo Crystal Services', 'Cressolife', 'Eloha', 'Eti Farms', 'Felon',
  'Jkb Foods', 'Kezia Foods', 'Kitchen Smith', 'Mazara Foods',
  'Orisirisi', 'Prothrive', 'Respite Tea', 'Skiddo',
  'Sooyah', 'Tosh Cocodia', 'WholeEats', 'Wilsons',
  'Zayith', 'Zeef', 'Biniowan Enterprises', 'Dizauregi',
  'Madala Beverages Limited',
];

export const DEFAULT_SETTINGS = {
  min_store_target:      '8',
  advanced_store_target: '10',
  min_cash_inflow:       '100000',
  advanced_cash_inflow:  '500000',
  surveys_target:        '15',
  score_time:            '5',
  score_visits:          '10',
  score_brands:          '40',
  score_efficiency:      '15',
  score_debt:            '30',
  telegram_webhook_url:  '',
  telegram_enabled:      'false',
  tier_config: JSON.stringify([
    { tier: 1, label: 'Elite',      color: 'yellow', rankRange: [1, 3],   minScore: 80, minBrandPct: 85, minStores: 11 },
    { tier: 2, label: 'Strong',     color: 'green',  rankRange: [4, 7],   minScore: 65, minBrandPct: 70, minStores: 10 },
    { tier: 3, label: 'Developing', color: 'blue',   rankRange: [8, 11],  minScore: 50, minBrandPct: 55, minStores: 9  },
    { tier: 4, label: 'At Risk',    color: 'red',    rankRange: [12, 15], minScore: 40, minBrandPct: 40, minStores: 8  },
  ]),
};

export async function seedDefaults(supabase) {
  // Seed team roster (insert new SEs, skip existing)
  const { error: rosterErr } = await supabase
    .from('team_roster')
    .upsert(DEFAULT_ROSTER, { onConflict: 'se_name', ignoreDuplicates: true });
  if (rosterErr) throw rosterErr;

  // Backfill position for existing SEs that don't have it set yet
  for (const se of DEFAULT_ROSTER) {
    await supabase
      .from('team_roster')
      .update({ position: se.position })
      .eq('se_name', se.se_name)
      .is('position', null);
  }

  // Seed brand partners
  const brandRows = DEFAULT_BRANDS.map(brand_name => ({ brand_name }));
  const { error: brandsErr } = await supabase
    .from('brand_partners')
    .upsert(brandRows, { onConflict: 'brand_name', ignoreDuplicates: true });
  if (brandsErr) throw brandsErr;

  // Seed settings
  const settingRows = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value }));
  const { error: settingsErr } = await supabase
    .from('settings')
    .upsert(settingRows, { onConflict: 'key', ignoreDuplicates: true });
  if (settingsErr) throw settingsErr;
}
