export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image } = req.body;
  if (!image) return res.status(400).json({ error: 'No image provided' });

  try {
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const apiKey = process.env.GEMINI_API_KEY;

    // 1. Gemini 3.8 Flash dengan Prompt Akurasi Tinggi
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    const prompt = `You are a high-precision visual search AI for Home Basket Bali (homeware, crafts, pottery, bags, and rattan decor).
Analyze this uploaded product image carefully.
Generate 2 or 3 highly specific search terms combining:
[Distinctive Shape, Material, or Color] + [Product Type]

Rules for high accuracy:
- If it's a ceramic/terracotta/clay vase with a specific shape (e.g. donut, jug, ribbed): use "pottery vase" or "donut vase" or "terracotta vase" (DO NOT just say "vase").
- If it's a woven bag: use "rattan bag" or "pandan bag" or "leather bag" (DO NOT just say "bag").
- If it's a basket: use "rattan basket" or "laundry basket" or "storage basket".
- If it's a placemat: use "round placemat" or "rattan placemat".

Output ONLY the 2-3 words search query in lowercase without punctuation, quotes, or markdown.`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "image/jpeg", data: base64Data } }
            ]
          }
        ]
      })
    });

    const geminiData = await geminiRes.json();
    let searchQuery = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase().replace(/[^a-zA-Z0-9 ]/g, '') || '';

    // Jika Gemini menghasilkan lebih dari 3 kata, ambil 2 kata pertama paling relevan
    const queryWords = searchQuery.split(/\s+/).slice(0, 3).join(' ');

    return res.status(200).json({
      keywords: queryWords || searchQuery
    });

  } catch (error) {
    console.error('Error Visual Search:', error);
    return res.status(500).json({ error: 'Gagal memproses gambar' });
  }
}
