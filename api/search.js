import { GoogleGenAI } from '@google/genai';

// Inisialisasi Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async function handler(req, res) {
  // CORS Configuration agar tema Shopify Anda bisa mengakses API ini
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { image } = req.body;
  if (!image) return res.status(400).json({ error: 'No image provided' });

  try {
    // 1. Ekstrak data base64 murni
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    // 2. Analisis visual atribut dengan Gemini 1.5 Flash (~400ms)
    const prompt = `Analisis gambar produk fashion/barang ini. 
    Kembalikan HANYA kata kunci pencarian e-commerce yang paling spesifik (maksimal 4 kata) 
    berisi: tipe barang, warna dominan, motif/potongan utama. 
    DILARANG membuat kalimat panjang. Contoh hasil: 'kemeja flanel merah pria' atau 'sepatu sneaker putih'`;

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

    const searchQuery = geminiResponse.text.trim().replace(/['"\n]/g, '');

    // 3. Query katalog Shopify menggunakan Storefront API
    const shopifyDomain = process.env.SHOPIFY_STORE_DOMAIN; // contoh: toko-anda.myshopify.com
    const storefrontToken = process.env.SHOPIFY_STOREFRONT_TOKEN;

    const storefrontQuery = `
      query searchProducts($query: String!) {
        predictiveSearch(query: $query, limit: 6, types: [PRODUCT]) {
          products {
            id
            title
            handle
            onlineStoreUrl
            featuredImage {
              url
            }
            priceRange {
              minVariantPrice {
                amount
                currencyCode
              }
            }
          }
        }
      }
    `;

    const shopifyRes = await fetch(`https://${shopifyDomain}/api/2024-04/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontToken
      },
      body: JSON.stringify({
        query: storefrontQuery,
        variables: { query: searchQuery }
      })
    });

    const shopifyData = await shopifyRes.json();
    const rawProducts = shopifyData.data?.predictiveSearch?.products || [];

    // 4. Format hasil untuk tema Shopify
    const formattedProducts = rawProducts.map(p => ({
      id: p.id,
      title: p.title,
      url: `/products/${p.handle}`,
      featured_image: p.featuredImage ? p.featuredImage.url : '',
      price: new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: p.priceRange.minVariantPrice.currencyCode
      }).format(p.priceRange.minVariantPrice.amount),
      score: 0.95 // Indikator kemiripan
    }));

    return res.status(200).json({
      keywords: searchQuery,
      products: formattedProducts
    });

  } catch (error) {
    console.error('Visual Search Backend Error:', error);
    return res.status(500).json({ error: 'Failed to process visual search' });
  }
}
