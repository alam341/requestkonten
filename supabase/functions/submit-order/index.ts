import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const N8N_CREATOR_WEBHOOK = Deno.env.get('N8N_CREATOR_WEBHOOK')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const body = await req.json();
    const { advertiser_name, brand, wa_number, content_type, platform, brief, deadline, advertiser_id } = body;

    // 1. Insert order
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({ advertiser_name, brand, wa_number, content_type, platform, brief, deadline, advertiser_id })
      .select()
      .single();

    if (orderErr) throw orderErr;

    // 2. Cari creator tersedia dengan spesialisasi cocok
    const { data: creators } = await supabase
      .from('creators')
      .select('id, name, wa_number, active_tasks')
      .eq('status', 'tersedia')
      .contains('specializations', [content_type])
      .order('active_tasks', { ascending: true });

    if (creators && creators.length > 0) {
      // Assign ke creator dengan active_tasks paling sedikit
      const creator = creators[0];
      await assignOrder(order.id, creator);
    } else {
      // Masuk antrian
      await supabase
        .from('order_queue')
        .insert({ order_id: order.id, content_type });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }
});

async function assignOrder(orderId: string, creator: { id: string; name: string; wa_number: string }) {
  // Update order
  await supabase
    .from('orders')
    .update({ status: 'assigned', creator_id: creator.id, assigned_at: new Date().toISOString() })
    .eq('id', orderId);

  // Tambah active_tasks creator
  await supabase.rpc('increment_active_tasks', { creator_id: creator.id });

  // Blast WA ke creator via n8n
  await fetch(N8N_CREATOR_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: creator.wa_number, creator_name: creator.name, order_id: orderId }),
  }).catch(() => {});
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}
