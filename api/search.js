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

    const browserHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    };

    // =========================================================================
    // LANGKAH 1: Deteksi Kategori Utama untuk Menarik Produk Nyata dari Toko
    // =========================================================================
    const categoryPrompt = `Look at this product photo. Identify the broad category in 1 word only: 
    bag, basket, vase, pottery, tray, placemat, cushion, mirror, or decor.
    Output ONLY that single word.`;

    const catRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: categoryPrompt },
            { inline_data: { mime_type: "image/jpeg", data: base64Data } }
          ]
        }]
      })
    });

    const catData = await catRes.json();
    const broadCategory = catData.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase().replace(/[^a-z]/g, '') || 'pottery';

    // =========================================================================
    // LANGKAH 2: Ambil Daftar Produk Nyata dari Katalog Home Basket Bali
    // =========================================================================
    let catalogUrl = `https://homebasketbali.com/search/suggest.json?q=${encodeURIComponent(broadCategory)}&resources[type]=product&resources[limit]=20`;
    let shopifyRes = await fetch(catalogUrl, { headers: browserHeaders });
    let shopifyData = await shopifyRes.json();
    let realProducts = shopifyData.resources?.results?.products || [];

    // Jika kategori terlalu spesifik dan kosong, ambil produk terpopuler
    if (realProducts.length === 0) {
      catalogUrl = `https://homebasketbali.com/search/suggest.json?q=rattan&resources[type]=product&resources[limit]=20`;
      shopifyRes = await fetch(catalogUrl, { headers: browserHeaders });
      shopifyData = await shopifyRes.json();
      realProducts = shopifyData.resources?.results?.products || [];
    }

    // Susun daftar judul produk yang ADA di toko
    const productTitles = realProducts.map((p, index) => `${index + 1}. ${p.title}`).join('\n');

    // =========================================================================
    // LANGKAH 3: AI Membaca Daftar Produk dan Memilih Nama Barang yang Presisi
    // =========================================================================
    const matchPrompt = `You are the product catalog expert for Home Basket Bali.
Look at the user's uploaded photo carefully.
Here is the ACTUAL list of products available in the store:
---
${productTitles}
---

TASK:
Which product from the list above is the EXACT match or the closest visual match to the item in the photo?

STRICT RULES:
1. Return ONLY the exact product title from the list above (do not modify the words, do not include the number).
2. If none of them match, return the 2 most distinct words describing the item.
3. No explanation, no punctuation, no extra words.`;

    const matchRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: matchPrompt },
            { inline_data: { mime_type: "image/jpeg", data: base64Data } }
          ]
        }]
      })
    });

    const matchData = await matchRes.json();
    let preciseTitle = matchData.candidates?.[0]?.content?.parts?.[0]?.text?.trim().replace(/['"\n\r]/g, '') || broadCategory;

    // Bersihkan jika ada nomor di awal (misal: "1. MINI POTTERY...")
    preciseTitle = preciseTitle.replace(/^\d+[\.\)]\s*/, '');

    return res.status(200).json({
      keywords: preciseTitle
    });

  } catch (error) {
    console.error('Error Visual Search:', error);
    return res.status(500).json({ error: 'Gagal memproses gambar' });
  }
}
