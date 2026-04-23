import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  // Vercel cron kirim header x-vercel-cron, tolak request lain
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Cari orders yang deadline-nya besok dan masih in_progress
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

  const { data: orders, error } = await supabase
    .from('orders')
    .select('*, creators(name, wa_number)')
    .eq('deadline', tomorrowStr)
    .eq('status', 'in_progress');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  if (!orders || orders.length === 0) {
    return res.status(200).json({ message: 'Tidak ada deadline besok.', count: 0 });
  }

  const results = [];

  for (const order of orders) {
    if (!order.creators?.wa_number) continue;

    try {
      const response = await fetch(`${process.env.APP_URL}/api/send-wa`, {
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

      const result = await response.json();
      results.push({ order_id: order.id, brand: order.brand, success: true, result });
    } catch (err) {
      results.push({ order_id: order.id, brand: order.brand, success: false, error: err.message });
    }
  }

  return res.status(200).json({ message: 'Reminder terkirim.', count: results.length, results });
}
