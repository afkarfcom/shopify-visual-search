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

    // 1. Minta Gemini fokus pada 1-2 kata benda esensial
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const prompt = `Analisis foto ini untuk toko Home Basket Bali (fokus kategori: basket, bag, tray, placemat, cushion, decor, rattan).
    Kembalikan HANYA 1 atau maksimal 2 kata benda paling umum dalam bahasa Inggris yang menggambarkan jenis barang ini.
    JANGAN ada kata sifat berlebihan.
    Contoh jika tas: bag
    Contoh jika keranjang: basket
    Contoh jika tatakan meja: placemat
    DILARANG LEBIH DARI 2 KATA.`;

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

    // 2. Pencarian Pertama (Query Lengkap)
    let searchUrl = `https://homebasketbali.com/search/suggest.json?q=${encodeURIComponent(searchQuery)}&resources[type]=product&resources[limit]=6`;
    let shopifyRes = await fetch(searchUrl);
    let shopifyData = await shopifyRes.json();
    let rawProducts = shopifyData.resources?.results?.products || [];

    // 3. Fallback Cerdas: Jika 0 hasil, pecah kata dan cari kata kuncinya satu per satu
    if (rawProducts.length === 0 && searchQuery.includes(' ')) {
      const words = searchQuery.split(' ');
      for (const word of words) {
        if (word.length >= 3) {
          const fallbackRes = await fetch(`https://homebasketbali.com/search/suggest.json?q=${encodeURIComponent(word)}&resources[type]=product&resources[limit]=6`);
          const fallbackData = await fallbackRes.json();
          const fallbackProducts = fallbackData.resources?.results?.products || [];
          if (fallbackProducts.length > 0) {
            rawProducts = fallbackProducts;
            searchQuery = word; // perbarui kata kunci yang berhasil
            break;
          }
        }
      }
    }

    // 4. Susun data produk yang ditemukan
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
