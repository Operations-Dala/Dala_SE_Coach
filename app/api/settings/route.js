import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase.from('settings').select('key, value');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const settings = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  if (process.env.GEMINI_API_KEY || settings.gemini_api_key) {
    settings.gemini_api_key_set = 'true';
    settings.gemini_api_key_source = process.env.GEMINI_API_KEY ? 'environment' : 'settings';
    delete settings.gemini_api_key;
  }
  if (process.env.TELEGRAM_WEBHOOK_URL || settings.telegram_webhook_url) {
    settings.telegram_webhook_url_set = 'true';
    settings.telegram_webhook_source = process.env.TELEGRAM_WEBHOOK_URL ? 'environment' : 'settings';
    delete settings.telegram_webhook_url;
  }
  return NextResponse.json(settings);
}

export async function PUT(request) {
  const body = await request.json();
  const rows = Object.entries(body)
    .filter(([key, value]) => {
      if (['gemini_api_key_set', 'gemini_api_key_source', 'telegram_webhook_url_set', 'telegram_webhook_source'].includes(key)) {
        return false;
      }
      if ((key === 'gemini_api_key' || key === 'telegram_webhook_url') && !String(value ?? '').trim()) {
        return false;
      }
      return value !== undefined;
    })
    .map(([key, value]) => ({ key, value: String(value) }));

  const { error } = await supabase
    .from('settings')
    .upsert(rows, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
