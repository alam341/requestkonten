import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const N8N_CREATOR_WEBHOOK = Deno.env.get('N8N_CREATOR_WEBHOOK')!;
const N8N_ADVERTISER_WEBHOOK = Deno.env.get('N8N_ADVERTISER_WEBHOOK')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    const { order_id, status, creator_id } = await req.json();

    // Update status order
    await supabase
      .from('orders')
      .update({ status })
      .eq('id', order_id);

    // Kalau selesai: kurangi active_tasks, cek antrian
    if (status === 'done') {
      await supabase.rpc('decrement_active_tasks', { creator_id });
      await processQueue(creator_id);
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

async function processQueue(creatorId: string) {
  const { data: creator } = await supabase
    .from('creators')
    .select('id, name, wa_number, specializations, status')
    .eq('id', creatorId)
    .single();

  // Hanya proses antrian kalau creator masih tersedia
  if (!creator || creator.status !== 'tersedia') return;

  const { data: queued } = await supabase
    .from('order_queue')
    .select('*, orders(advertiser_name, wa_number, brand)')
    .in('content_type', creator.specializations)
    .order('queued_at', { ascending: true })
    .limit(1);

  if (!queued || queued.length === 0) return;

  const queueItem = queued[0];
  const order = queueItem.orders;

  await supabase
    .from('orders')
    .update({ status: 'assigned', creator_id: creator.id, assigned_at: new Date().toISOString() })
    .eq('id', queueItem.order_id);

  await supabase.from('order_queue').delete().eq('id', queueItem.id);

  await supabase.rpc('increment_active_tasks', { creator_id: creator.id });

  await fetch(N8N_CREATOR_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: creator.wa_number, creator_name: creator.name, order_id: queueItem.order_id }),
  }).catch(() => {});

  await fetch(N8N_ADVERTISER_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: order.wa_number, advertiser_name: order.advertiser_name, creator_name: creator.name }),
  }).catch(() => {});
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}
