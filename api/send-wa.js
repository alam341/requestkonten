export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, type, data } = req.body;

  if (!to || !type || !data) {
    return res.status(400).json({ error: 'to, type, dan data wajib diisi' });
  }

  try {
    const message = await generateMessage(type, data);
    const result = await sendWA(to, message);
    return res.status(200).json({ success: true, message, fonnte: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function generateMessage(type, data) {
  const prompts = {
    creator_assigned: `Kamu adalah asisten notifikasi WhatsApp untuk platform content creator bernama Adsy.
Tulis pesan WhatsApp untuk content creator bernama "${data.creator_name}" yang baru dapat tugas baru.

WAJIB cantumkan semua info berikut dalam pesan:
- Dari advertiser: ${data.advertiser_name}
- Brand/Produk: ${data.brand}
- Yang harus dibuat: ${data.content_type}${data.platform ? ` untuk ${data.platform}` : ''}
${data.deadline ? `- Deadline: ${data.deadline}` : ''}
${data.brief ? `- Brief tugas: ${data.brief}` : ''}

Format pesan:
1. Sapa nama creator dengan semangat
2. Kasih tau ada tugas baru dari advertiser siapa
3. Jelaskan detail tugasnya (brand, jenis konten, platform, deadline)
4. Tampilkan brief tugasnya dengan jelas
5. Minta cek dashboard untuk mulai

Gaya: santai, semangat, pakai bahasa Indonesia. Maksimal 10 baris.`,

    order_assigned: `Kamu adalah asisten notifikasi WhatsApp untuk platform content creator bernama Adsy.
Tulis pesan WhatsApp singkat dan menggembirakan untuk advertiser bernama "${data.advertiser_name}" bahwa creator sudah ditemukan untuk order mereka.
Detail:
- Brand: ${data.brand}
- Creator yang di-assign: ${data.creator_name}
- Jenis konten: ${data.content_type}
Pesan harus: singkat (max 4 baris), pakai bahasa Indonesia santai, terasa personal, meyakinkan advertiser bahwa ordernya dalam proses yang baik.`,

    order_started: `Kamu adalah asisten notifikasi WhatsApp untuk platform content creator bernama Adsy.
Tulis pesan WhatsApp singkat dan menyenangkan untuk advertiser bernama "${data.advertiser_name}" bahwa creator sudah mulai mengerjakan konten mereka.
Detail:
- Brand: ${data.brand}
- Creator: ${data.creator_name}
- Jenis konten: ${data.content_type}
Pesan harus: singkat (max 4 baris), pakai bahasa Indonesia santai, membuat advertiser excited, minta mereka pantau di dashboard.`,

    order_queued: `Kamu adalah asisten notifikasi WhatsApp untuk platform content creator bernama Adsy.
Tulis pesan WhatsApp untuk advertiser bernama "${data.advertiser_name}" bahwa order mereka sudah diterima tapi semua creator sedang sibuk, jadi masuk antrian dulu.
Detail order:
- Brand: ${data.brand}
- Jenis konten: ${data.content_type}
Pesan harus: singkat (max 4 baris), tenangkan advertiser, beritahu mereka akan dapat notif WA segera saat creator tersedia, pakai bahasa Indonesia santai.`,

    order_done: `Kamu adalah asisten notifikasi WhatsApp untuk platform content creator bernama Adsy.
Tulis pesan WhatsApp singkat dan meriah untuk advertiser bernama "${data.advertiser_name}" bahwa konten mereka sudah selesai.
Detail:
- Brand: ${data.brand}
- Creator: ${data.creator_name}
- Jenis konten: ${data.content_type}
- Link Google Drive: ${data.drive_link}
Pesan harus: singkat (max 5 baris), pakai bahasa Indonesia santai, excited dan merayakan, sertakan link drive dengan jelas, ajak advertiser untuk review.`,
  };

  const prompt = prompts[type];
  if (!prompt) throw new Error('Tipe notifikasi tidak dikenal: ' + type);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const result = await response.json();
  return result.content[0].text;
}

async function sendWA(to, message) {
  const response = await fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: {
      'Authorization': process.env.FONNTE_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target: to,
      message: message,
      countryCode: '62',
    }),
  });
  return response.json();
}
