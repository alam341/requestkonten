import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Validasi secret dari Supabase webhook header
  const secret = req.headers['x-webhook-secret'];
  if (secret !== process.env.WEBHOOK_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { record } = req.body;
  if (!record) return res.status(400).json({ error: 'no record' });

  // Ambil nama creator kalau ada
  let creator_name = '';
  if (record.creator_id) {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const { data: creator } = await supabase
      .from('creators')
      .select('name')
      .eq('id', record.creator_id)
      .maybeSingle();
    creator_name = creator?.name || '';
  }

  const payload = {
    id: record.id,
    advertiser_name: record.advertiser_name || '',
    team: record.team || '',
    content_type: record.content_type || '',
    brand: record.brand || '',
    referensi_konten: record.referensi_konten || '',
    brief: record.brief || '',
    creator_name,
    drive_link: record.drive_link || '',
    status: record.status || '',
  };

  try {
    const response = await fetch(process.env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    const result = await response.text();
    return res.status(200).json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
