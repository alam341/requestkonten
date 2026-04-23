export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: 'to dan message wajib diisi' });
  }

  try {
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

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
