export default async function handler(req, res) {
  // CORS Header agar tema Shopify bisa memanggil API
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

    // 1. Panggil Gemini 1.5 Flash via REST API Resmi (Super Cepat, Tanpa Package)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: "Analisis produk ini untuk toko homeware, dekorasi rumah, dan fashion. Kembalikan HANYA 2 atau 3 kata kunci pencarian paling akurat dalam bahasa inggris atau indonesia (misal nama barang, material, atau warna). DILARANG membuat kalimat panjang. Contoh: rattan basket atau ceramic vase atau placemat"
              },
              {
                inline_data: {
                  mime_type: "image/jpeg",
                  data: base64Data
                }
              }
            ]
          }
        ]
      })
    });

    const geminiData = await geminiRes.json();
    const searchQuery = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim().replace(/['"\n\r]/g, '') || '';

    // 2. Cari langsung produk di katalog Home Basket (Tanpa perlu token)
    const searchUrl = `https://homebasketbali.com/search/suggest.json?q=${encodeURIComponent(searchQuery)}&resources[type]=product&resources[limit]=6`;
    
    const shopifyRes = await fetch(searchUrl);
    const shopifyData = await shopifyRes.json();
    const rawProducts = shopifyData.resources?.results?.products || [];

    // 3. Susun data produk yang ditemukan
    const formattedProducts = rawProducts.map(p => ({
      id: p.id,
      title: p.title,
      url: p.url,
      featured_image: p.featured_image ? p.featured_image.url : (p.image || ''),
      price: new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR'
      }).format(p.price),
      score: 0.96
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
