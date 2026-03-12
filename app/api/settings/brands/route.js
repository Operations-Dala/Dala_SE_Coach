import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('brand_partners').select('*').eq('deleted', 0).order('brand_name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request) {
  const { brand_name } = await request.json();
  if (!brand_name?.trim()) {
    return NextResponse.json({ error: 'brand_name is required' }, { status: 400 });
  }

  const { data: exists } = await supabase
    .from('brand_partners').select('id').eq('brand_name', brand_name.trim()).eq('deleted', 0).maybeSingle();
  if (exists) return NextResponse.json({ error: 'Brand already exists' }, { status: 409 });

  const { data, error } = await supabase
    .from('brand_partners').insert({ brand_name: brand_name.trim(), active: 1 }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data.id, brand_name: data.brand_name }, { status: 201 });
}
