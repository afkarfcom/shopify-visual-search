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

    // 1. Panggil Gemini 3.8 Flash
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    const prompt = `You are a high-precision product identifier for Home Basket Bali (homeware, pottery, bags, and rattan craft).
Your mission: Look at this photo and output the EXACT distinctive search keywords so the customer finds this specific item at the TOP of the search results.

CRITICAL INSTRUCTIONS:
1. Detect unique shapes and materials that distinguish this exact product:
   - If it is a vase with a circular hole/ring in the middle: MUST include "donat" or "donut".
   - If it is a traditional pitcher/jug vase: MUST include "kendi".
   - If it is made of clay/terracotta/ceramic: MUST include "pottery".
   - If it is water hyacinth: MUST include "eceng".
   - If it is woven cane/rattan: MUST include "rattan".
   - If it is pandanus leaf: MUST include "pandan".

2. Combine the UNIQUE FEATURE + ITEM NAME:
   Examples of ideal queries:
   - For a donut vase: "pottery donat"
   - For a kendi jug: "pottery kendi"
   - For a rattan bag: "bag rattan"
   - For an eceng basket: "eceng jumbo" or "basket eceng"

3. Output ONLY 2 or 3 words in lowercase. Put the most specific unique word first.
DO NOT use generic words like just "vase" or "decor" alone!`;

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

    // Ambil 2-3 kata paling spesifik
    const cleanQuery = searchQuery.split(/\s+/).slice(0, 3).join(' ');

    return res.status(200).json({
      keywords: cleanQuery || searchQuery
    });

  } catch (error) {
    console.error('Error Visual Search:', error);
    return res.status(500).json({ error: 'Gagal memproses gambar' });
  }
}
