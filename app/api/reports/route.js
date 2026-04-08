import { NextResponse } from 'next/server';
import { requireAdminApiSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase';

export async function GET(request) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

  const { searchParams } = new URL(request.url);
  const date   = searchParams.get('date');
  const seName = searchParams.get('se');

  if (date && seName) {
    const { data: report }   = await supabase.from('daily_reports').select('*')
      .eq('report_date', date).eq('se_name', seName).maybeSingle();
    const { data: coaching } = await supabase.from('coaching_history').select('*')
      .eq('report_date', date).eq('se_name', seName).maybeSingle();
    return NextResponse.json({ report, coaching });
  }

  if (date) {
    const { data: reports }   = await supabase.from('daily_reports').select('*')
      .eq('report_date', date).order('rank');
    const { data: coachings } = await supabase.from('coaching_history').select('*')
      .eq('report_date', date);
    const coachMap = Object.fromEntries((coachings || []).map(c => [c.se_name, c]));
    const combined = (reports || []).map(r => ({ ...r, coaching: coachMap[r.se_name] || null }));
    return NextResponse.json(combined);
  }

  // List all dates
  const { data } = await supabase.from('daily_reports')
    .select('report_date').order('report_date', { ascending: false });
  const dates = [...new Set((data || []).map(r => r.report_date))];
  return NextResponse.json(dates);
}
