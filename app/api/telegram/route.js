import { NextResponse } from 'next/server';
import { requireAdminApiSession } from '@/lib/admin-auth';
import { supabase } from '@/lib/supabase';

export async function POST(request) {
  const unauthorizedResponse = await requireAdminApiSession(request);
  if (unauthorizedResponse) return unauthorizedResponse;

  const body     = await request.json();
  const date     = body.date || yesterdayDate();
  const targetSE = body.se_name || null;

  const { data: urlRow }     = await supabase.from('settings').select('value').eq('key', 'telegram_webhook_url').maybeSingle();
  const { data: enabledRow } = await supabase.from('settings').select('value').eq('key', 'telegram_enabled').maybeSingle();
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL || urlRow?.value;
  const telegramEnabled = process.env.TELEGRAM_ENABLED || enabledRow?.value;

  if (!webhookUrl || telegramEnabled !== 'true') {
    return NextResponse.json(
      { error: 'Telegram is not configured or not enabled. Check Settings.' },
      { status: 400 }
    );
  }

  let query = supabase.from('coaching_history').select('*').eq('report_date', date);
  if (targetSE) query = query.eq('se_name', targetSE);
  const { data: coachings } = await query;

  if (!coachings || coachings.length === 0) {
    return NextResponse.json(
      { error: 'No coaching messages found. Generate coaching first.' },
      { status: 404 }
    );
  }

  const sent = [], errors = [];

  for (const c of coachings) {
    const text = `*SE Coach — ${c.report_date}*\n\n*${c.se_name}*\n\n${c.coaching_message}`;
    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, parse_mode: 'Markdown' }),
      });
      if (res.ok) sent.push(c.se_name);
      else errors.push({ se_name: c.se_name, error: await res.text() });
    } catch (err) {
      errors.push({ se_name: c.se_name, error: err.message });
    }
  }

  return NextResponse.json({ success: true, sent, errors });
}

function yesterdayDate() {
  const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0];
}
