import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  // Atur CORS agar toko Anda bisa memanggil API ini
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image } = req.body;
  if (!image) return res.status(400).json({ error: 'No image provided' });

  try {
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    // 1. Minta Gemini mengekstrak kata kunci produk dari foto (hanya 2-3 kata kunci penting)
    const prompt = `Analisis produk ini untuk pencarian e-commerce homeware/fashion/decor. 
    Kembalikan HANYA 2 atau 3 kata kunci pencarian paling akurat (nama barang, bahan, atau warna).
    DILARANG membuat kalimat atau tanda baca. 
    Contoh: basket rattan atau ceramic vase atau cushion cover`;

    const geminiResponse = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
          ]
        }
      ]
    });

    const searchQuery = geminiResponse.text.trim().replace(/['"\n\r]/g, '');

    // 2. Cari langsung ke toko Home Basket TANPA butuh token!
    const searchUrl = `https://homebasketbali.com/search/suggest.json?q=${encodeURIComponent(searchQuery)}&resources[type]=product&resources[limit]=6`;
    
    const shopifyRes = await fetch(searchUrl);
    const shopifyData = await shopifyRes.json();
    const rawProducts = shopifyData.resources?.results?.products || [];

    // 3. Susun data untuk dikirim balik ke modal di toko
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
