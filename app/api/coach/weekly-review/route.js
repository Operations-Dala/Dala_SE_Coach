import { NextResponse } from 'next/server';
import { requireAdminApiSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase';
import { runWeeklyReviewAgent } from '@/lib/agents/weekly-review-agent';

/**
 * GET /api/coach/weekly-review?se=NAME&week_ending=DATE
 * Returns the stored weekly review for an SE for the given week.
 * week_ending defaults to the most recent Sunday.
 *
 * POST /api/coach/weekly-review
 * Body: { se_name, week_ending? }
 * Generates (or regenerates) a weekly review for the SE.
 */

export async function GET(request) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

  const { searchParams } = new URL(request.url);
  const seName     = searchParams.get('se');
  const weekEnding = searchParams.get('week_ending') || lastSundayStr();

  if (!seName) return NextResponse.json({ error: 'se param required' }, { status: 400 });

  const { data, error } = await supabase
    .from('weekly_reviews')
    .select('*')
    .eq('se_name', seName)
    .eq('week_ending', weekEnding)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || null);
}

export async function POST(request) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

  try {
    const body       = await request.json();
    const seName     = body.se_name;
    const weekEnding = body.week_ending || lastSundayStr();

    if (!seName) return NextResponse.json({ error: 'se_name required' }, { status: 400 });

    // API key
    const { data: keyRow } = await supabase
      .from('settings').select('value').eq('key', 'gemini_api_key').maybeSingle();
    const apiKey = process.env.GEMINI_API_KEY || keyRow?.value;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured. Set GEMINI_API_KEY or save it in Settings.' },
        { status: 400 }
      );
    }

    // Compute week start (7 days back from weekEnding)
    const endDate   = new Date(weekEnding);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    const weekStart = startDate.toISOString().split('T')[0];

    // Fetch this week's daily reports for the SE
    const { data: weekReports, error: repErr } = await supabase
      .from('daily_reports')
      .select('report_date, total_score, stores_visited, resumption_time, brands_ordered, brand_coverage, value_of_orders, debt_score')
      .eq('se_name', seName)
      .gte('report_date', weekStart)
      .lte('report_date', weekEnding)
      .order('report_date', { ascending: false });

    if (repErr) return NextResponse.json({ error: repErr.message }, { status: 500 });
    if (!weekReports || weekReports.length === 0) {
      return NextResponse.json({ error: `No reports found for ${seName} in week ${weekStart}–${weekEnding}` }, { status: 404 });
    }

    // Attach coaching messages for the week
    const { data: coachRows } = await supabase
      .from('coaching_history')
      .select('report_date, coaching_message')
      .eq('se_name', seName)
      .gte('report_date', weekStart)
      .lte('report_date', weekEnding);

    const coachMap = Object.fromEntries((coachRows || []).map(c => [c.report_date, c.coaching_message]));
    const weekDays = weekReports.map(r => ({ ...r, coaching_message: coachMap[r.report_date] || null }));

    // Fetch supporting data
    const [
      { data: brandRows },
      { data: rosterRow },
      { data: memoryRow },
      { data: profileRow },
    ] = await Promise.all([
      supabase.from('brand_partners').select('brand_name').eq('active', 1).eq('deleted', 0),
      supabase.from('team_roster').select('position, zone').eq('se_name', seName).eq('deleted', 0).maybeSingle(),
      supabase.from('agent_memory').select('memory_json').eq('se_name', seName).maybeSingle(),
      supabase.from('se_profiles').select('traits_text').eq('se_name', seName).maybeSingle(),
    ]);

    const activeBrands  = (brandRows || []).map(r => r.brand_name);
    const positionLabel = {
      corporate_se:    'Corporate SE',
      senior_se:       'Senior SE',
      sales_executive: 'Sales Executive',
      junior_se:       'Junior SE',
      trial:           'Trial',
    }[rosterRow?.position] || 'Sales Executive';
    const zone = rosterRow?.zone || 'Unknown';

    // Run the review agent
    const result = await runWeeklyReviewAgent(apiKey, {
      seName,
      positionLabel,
      zone,
      weekDays,
      activeBrands,
      recorderMemory: memoryRow?.memory_json || null,
      traitsText:     profileRow?.traits_text || null,
    });

    // Persist to weekly_reviews table
    const { error: upsertErr } = await supabase
      .from('weekly_reviews')
      .upsert(
        {
          se_name:       seName,
          week_ending:   weekEnding,
          week_start:    weekStart,
          review_text:   result.reviewText,
          review_json:   result.reviewJson,
          avg_score:     result.avgScore,
          high_score:    result.highScore,
          low_score:     result.lowScore,
          days_on_record: result.daysOnRecord,
          generated_at:  new Date().toISOString(),
        },
        { onConflict: 'se_name,week_ending' }
      );

    if (upsertErr) {
      // Table may not exist yet — return result without persisting
      console.warn('weekly_reviews upsert failed (table may not exist):', upsertErr.message);
    }

    return NextResponse.json({
      se_name:    seName,
      week_ending: weekEnding,
      week_start:  weekStart,
      ...result,
    });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Returns the date of the most recent Sunday (or today if today is Sunday)
function lastSundayStr() {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return d.toISOString().split('T')[0];
}
