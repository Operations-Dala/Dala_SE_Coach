import { NextResponse } from 'next/server';
import { supabase }     from '@/lib/supabase';

/**
 * POST /api/test/financial?date=YYYY-MM-DD
 * Seeds dummy expense and inflow records for all SEs on a given date.
 * Uses real SE names from team_roster.
 *
 * DELETE /api/test/financial?date=YYYY-MM-DD
 * Clears all expense and inflow records for that date.
 */

// Random amount in a range
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || todayStr();

  const { data: roster, error } = await supabase
    .from('team_roster')
    .select('se_name, position')
    .eq('deleted', 0);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!roster?.length) return NextResponse.json({ error: 'No SEs found in roster' }, { status: 404 });

  // Generate varied dummy data — a few SEs over the ₦4k daily limit to trigger flags
  const expenseRows = roster.map((se, i) => ({
    record_date: date,
    se_name:     se.se_name,
    // Every 3rd SE goes over ₦4,000 daily limit; 1 SE goes very high
    amount: i % 3 === 0 ? rand(4200, 7500) : rand(1500, 3800),
  }));

  const inflowRows = roster.map((se, i) => ({
    record_date: date,
    se_name:     se.se_name,
    // Every 4th SE has zero inflow (to test inflow gap flags for Senior/Corp)
    amount: i % 4 === 0 ? 0 : rand(15000, 120000),
  }));

  const [expRes, infRes] = await Promise.all([
    supabase.from('expense_records').upsert(expenseRows, { onConflict: 'record_date,se_name' }),
    supabase.from('inflow_records').upsert(inflowRows,  { onConflict: 'record_date,se_name' }),
  ]);

  if (expRes.error) return NextResponse.json({ error: expRes.error.message }, { status: 500 });
  if (infRes.error) return NextResponse.json({ error: infRes.error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    date,
    seeded: roster.length,
    expense_records:  expenseRows.length,
    inflow_records:   inflowRows.length,
    note: 'Dummy data seeded. Call DELETE /api/test/financial?date=... to clear it.',
    preview: {
      expenses: expenseRows.slice(0, 5).map(r => ({ se: r.se_name, amount: r.amount })),
      inflow:   inflowRows.slice(0, 5).map(r => ({ se: r.se_name, amount: r.amount })),
    },
  });
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || todayStr();

  const [expRes, infRes] = await Promise.all([
    supabase.from('expense_records').delete().eq('record_date', date),
    supabase.from('inflow_records').delete().eq('record_date', date),
  ]);

  if (expRes.error) return NextResponse.json({ error: expRes.error.message }, { status: 500 });
  if (infRes.error) return NextResponse.json({ error: infRes.error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    date,
    cleared: ['expense_records', 'inflow_records'],
    message: `All expense and inflow records for ${date} have been deleted.`,
  });
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}
