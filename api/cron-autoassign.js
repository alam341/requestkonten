export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Ambil orders yang sudah pending > 24 jam
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const pendingResp = await fetch(
    `${SUPABASE_URL}/rest/v1/orders?status=eq.pending&pending_since=lt.${cutoff}&select=*`,
    { headers }
  );
  const pendingOrders = await pendingResp.json();

  if (!pendingOrders || pendingOrders.length === 0) {
    return res.status(200).json({ message: 'Tidak ada order pending > 24 jam.', count: 0 });
  }

  // Ambil semua creators
  const creatorsResp = await fetch(`${SUPABASE_URL}/rest/v1/creators?select=id,name,wa_number`, { headers });
  const creators = await creatorsResp.json();

  if (!creators || creators.length === 0) {
    return res.status(200).json({ message: 'Tidak ada creator terdaftar.', count: 0 });
  }

  // Hitung active dan queued per creator
  const activeResp = await fetch(
    `${SUPABASE_URL}/rest/v1/orders?status=in.(assigned,in_progress,revision,queued)&select=creator_id,status`,
    { headers }
  );
  const activeOrders = await activeResp.json();

  const countMap = {}; // creator_id -> { active, queued }
  creators.forEach(c => { countMap[c.id] = { active: 0, queued: 0 }; });
  (activeOrders || []).forEach(o => {
    if (!o.creator_id || !countMap[o.creator_id]) return;
    if (o.status === 'queued') countMap[o.creator_id].queued++;
    else countMap[o.creator_id].active++;
  });

  const results = [];

  for (const order of pendingOrders) {
    // Cari creator dengan active < 3, pilih yang paling sedikit
    const available = creators
      .filter(c => countMap[c.id].active < 3)
      .sort((a, b) => countMap[a.id].active - countMap[b.id].active);

    let assignedCreator = null;
    let newStatus = 'assigned';

    if (available.length > 0) {
      assignedCreator = available[0];
      newStatus = 'assigned';
      countMap[assignedCreator.id].active++;
    } else {
      // Semua active >= 3, cari yang queued < 2
      const canQueue = creators
        .filter(c => countMap[c.id].queued < 2)
        .sort((a, b) => (countMap[a.id].active + countMap[a.id].queued) - (countMap[b.id].active + countMap[b.id].queued));

      if (canQueue.length > 0) {
        assignedCreator = canQueue[0];
        newStatus = 'queued';
        countMap[assignedCreator.id].queued++;
      }
    }

    if (!assignedCreator) {
      results.push({ order_id: order.id, brand: order.brand, skipped: true, reason: 'Semua creator penuh' });
      continue;
    }

    // Update order
    const updateResp = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${order.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        status: newStatus,
        creator_id: assignedCreator.id,
        assigned_at: new Date().toISOString(),
      }),
    });

    if (!updateResp.ok) {
      results.push({ order_id: order.id, brand: order.brand, success: false });
      continue;
    }

    // Kirim WA notif
    try {
      if (newStatus === 'assigned') {
        await fetch(`${process.env.APP_URL}/api/send-wa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: assignedCreator.wa_number,
            type: 'creator_assigned',
            data: {
              creator_name: assignedCreator.name,
              brand: order.brand,
              content_type: order.content_type,
              platform: order.platform,
              deadline: order.deadline,
              brief: order.brief,
              advertiser_name: order.advertiser_name,
            },
          }),
        });
        await fetch(`${process.env.APP_URL}/api/send-wa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: order.wa_number,
            type: 'order_assigned',
            data: {
              brand: order.brand,
              content_type: order.content_type,
              creator_name: assignedCreator.name,
              advertiser_name: order.advertiser_name,
            },
          }),
        });
      }
    } catch (e) {
      // WA notif gagal, tapi order sudah di-assign
    }

    results.push({ order_id: order.id, brand: order.brand, success: true, status: newStatus, creator: assignedCreator.name });
  }

  return res.status(200).json({ message: 'Auto-assign selesai.', count: results.length, results });
}
