export default async function handler(req, res) {
  // CORS Configuration
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

    // 1. Menggunakan Model Terbaru: gemini-3.8-flash
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;

    const prompt = `You are a product visual search assistant for Home Basket Bali (homeware & craft store).
Identify the main item in this image.
Return ONLY ONE keyword from this list that best matches the item:
- bag
- clutch
- basket
- tray
- placemat
- cushion
- mirror
- vase
- decor

If it is a woven bag, tote bag, or rattan handbag, return: bag
Return ONLY the single word without punctuation, quotes, or markdown.`;

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
    let searchQuery = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase().replace(/[^a-zA-Z]/g, '') || 'bag';

    // 2. Fetch ke Katalog Home Basket Bali dengan Browser Headers (Anti-Block)
    const browserHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9,id;q=0.8'
    };

    let searchUrl = `https://homebasketbali.com/search/suggest.json?q=${encodeURIComponent(searchQuery)}&resources[type]=product&resources[limit]=8`;
    let shopifyRes = await fetch(searchUrl, { headers: browserHeaders });
    let rawProducts = [];

    if (shopifyRes.ok) {
      const shopifyData = await shopifyRes.json();
      rawProducts = shopifyData.resources?.results?.products || [];
    }

    // 3. Fallback: Jika kategori spesifik tidak keluar, cari produk rotan/craft terpopuler
    if (rawProducts.length === 0) {
      const fallbackUrl = `https://homebasketbali.com/search/suggest.json?q=rattan&resources[type]=product&resources[limit]=6`;
      const fallbackRes = await fetch(fallbackUrl, { headers: browserHeaders });
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        rawProducts = fallbackData.resources?.results?.products || [];
      }
    }

    // 4. Format hasil untuk modal
    const formattedProducts = rawProducts.map(p => ({
      id: p.id,
      title: p.title,
      url: p.url,
      featured_image: p.featured_image ? p.featured_image.url : (p.image || ''),
      price: new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR'
      }).format(p.price),
      score: 0.98
    }));

    return res.status(200).json({
      keywords: searchQuery,
      products: formattedProducts
    });

  } catch (error) {
    console.error('Error Visual Search:', error);
    return res.status(500).json({ error: 'Gagal memproses gambar' });
  }
}
