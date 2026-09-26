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
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    // Prompt cerdas yang memahami katalog asli Home Basket Bali
    const prompt = `You are an expert AI visual search engine for Home Basket Bali (homeware, pottery, bags, crafts).
Look closely at this uploaded photo.
Your mission is to generate the EXACT 2-word search query to find this item at the TOP of the store's search results.

Catalog Naming Rules of Home Basket Bali:
1. POTTERY / CERAMICS:
   - If the pottery/vase has a circular donut-like hole in the middle: MUST return "pottery donat"
   - If the pottery has a jug/pitcher/kendi neck: MUST return "pottery kendi"
   - If it is other pottery/terracotta/clay vases: return "mini pottery" or "pottery vase"
2. BAGS / CRAFTS:
   - If it is a rattan woven bag: return "bag rattan"
   - If it is a pandan leaf bag: return "bag pandan"
   - If it is water hyacinth vase/basket: return "vase eceng" or "basket eceng"
3. BASKETS:
   - Return "basket rattan" or "storage basket"

Return ONLY the 2 or 3 most accurate search words in lowercase. No quotes, no markdown, no explanation.`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: base64Data } }
          ]
        }]
      })
    });

    const geminiData = await geminiRes.json();
    let searchQuery = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase().replace(/[^a-zA-Z0-9 ]/g, '') || 'pottery';

    // Ambil maksimal 2-3 kata kunci paling presisi
    const cleanQuery = searchQuery.split(/\s+/).slice(0, 3).join(' ');

    return res.status(200).json({
      keywords: cleanQuery
    });

  } catch (error) {
    console.error('Error Visual Search:', error);
    return res.status(500).json({ error: 'Gagal memproses gambar' });
  }
}
