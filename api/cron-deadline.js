export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Ambil orders yang deadline besok dan masih in_progress
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/orders?deadline=eq.${tomorrowStr}&status=eq.in_progress&select=*,creators(name,wa_number)`,
    {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  );

  const orders = await resp.json();

  if (!orders || orders.length === 0) {
    return res.status(200).json({ message: 'Tidak ada deadline besok.', count: 0 });
  }

  const results = [];

  for (const order of orders) {
    if (!order.creators?.wa_number) continue;

    try {
      const waResp = await fetch(`${process.env.APP_URL}/api/send-wa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: order.creators.wa_number,
          type: 'deadline_reminder',
          data: {
            creator_name: order.creators.name,
            brand: order.brand,
            content_type: order.content_type,
            deadline: tomorrowStr,
            advertiser_name: order.advertiser_name,
          },
        }),
      });

      const result = await waResp.json();
      results.push({ order_id: order.id, brand: order.brand, success: true, result });
    } catch (err) {
      results.push({ order_id: order.id, brand: order.brand, success: false, error: err.message });
    }
  }

  return res.status(200).json({ message: 'Reminder terkirim.', count: results.length, results });
}
