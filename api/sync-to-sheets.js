export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = req.headers['x-webhook-secret'];
  if (secret !== process.env.WEBHOOK_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { record } = req.body;
  if (!record) return res.status(400).json({ error: 'no record' });

  // Ambil nama creator via Supabase REST API
  let creator_name = '';
  if (record.creator_id) {
    try {
      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/creators?id=eq.${record.creator_id}&select=name`,
        {
          headers: {
            'apikey': process.env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          },
        }
      );
      const rows = await r.json();
      creator_name = rows?.[0]?.name || '';
    } catch (_) {}
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
    const body = JSON.stringify(payload);
    const headers = { 'Content-Type': 'application/json' };

    // POST pertama — tangkap redirect manual
    const first = await fetch(process.env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
    });

    console.log('first status:', first.status);
    console.log('location:', first.headers.get('location'));

    let response;
    if (first.status === 301 || first.status === 302) {
      const location = first.headers.get('location');
      // echo URL harus di-GET, bukan POST
      response = await fetch(location, { method: 'GET' });
    } else {
      response = first;
    }

    const result = await response.text();
    console.log('apps script result:', result);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    console.log('error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
