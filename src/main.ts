import { PlaywrightCrawler, Dataset } from '@crawlee/playwright';
import { Actor } from 'apify';

// 1. Definimos la interfaz de nuestros datos (Tipado fuerte en TS)
interface ProductData {
    category: string;
    title: string;
    price: number;
    rating: number;
    url: string;
}

await Actor.init();

const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 10, // Límite para una demo rápida y segura
    async requestHandler({ request, page, log }) {
        log.info(`Scraping: ${request.url}`);

        // EXTRACT (Extracción)
        // Nota: Selectores adaptados a books.toscrape (demo segura), lógica 1:1 con Amazon
        const category = (await page.locator('.breadcrumb li.active').textContent())?.trim() || 'Unknown';
        
        const products: ProductData[] = [];
        const productElements = await page.locator('article.product_pod').all();

        for (const el of productElements) {
            const title = (await el.locator('h3 a').getAttribute('title'))?.trim() || 'Unknown';
            
            // Limpieza de datos: convertir "£51.77" a 51.77 (Number)
            const priceText = (await el.locator('.price_color').textContent())?.trim() || '0';
            const price = parseFloat(priceText.replace(/[^\d.]/g, ''));
            
            // Mapeo de puntuación: "star-rating Three" -> 3
            const ratingClass = (await el.locator('p.star-rating').getAttribute('class')) || '';
            const ratingMap: Record<string, number> = { 'One': 1, 'Two': 2, 'Three': 3, 'Four': 4, 'Five': 5 };
            const rating = ratingMap[ratingClass.split(' ')[1]] || 0;
            
            const url = (await el.locator('h3 a').getAttribute('href')) || '';

            products.push({ category, title, price, rating, url });
        }

        // LOAD (Carga inicial): Guardamos los datos crudos en el Dataset de Apify
        await Dataset.pushData(products);
    },
});

// Ejecutamos el crawler en una URL de ejemplo (Categoría "Travel")
  await crawler.run(['https://books.toscrape.com/catalogue/category/books/travel_2/index.html']);
//await crawler.run(['https://books.toscrape.com/catalogue/category/books/mystery_3/index.html']);

// ==========================================
// 2. ETL: TRANSFORM (Transformación y Análisis)
// ==========================================
const dataset = await Dataset.open();
const { items } = await dataset.getData();
const scrapedProducts = items as ProductData[];

if (scrapedProducts.length > 0) {
    // Encontrar el más barato
    const cheapest = scrapedProducts.reduce((prev, curr) => prev.price < curr.price ? prev : curr);
    
    // Encontrar el más caro
    const mostExpensive = scrapedProducts.reduce((prev, curr) => prev.price > curr.price ? prev : curr);
    
    // Encontrar el mejor puntuado
    const highestRated = scrapedProducts.reduce((prev, curr) => prev.rating > curr.rating ? prev : curr);

    const analysisResult = {
        reportType: 'ETL_ANALYSIS_SUMMARY',
        totalProductsAnalyzed: scrapedProducts.length,
        cheapest,
        mostExpensive,
        highestRated,
        timestamp: new Date().toISOString()
    };

    // LOAD (Carga final): Guardamos el análisis como un registro separado
    await dataset.pushData(analysisResult);
    
    console.log('\n✅ ETL Analysis Complete!');
    console.log('Cheapest:', cheapest.title, '$', cheapest.price);
    console.log('Most Expensive:', mostExpensive.title, '$', mostExpensive.price);
    console.log('Highest Rated:', highestRated.title, 'Rating:', highestRated.rating);
} else {
    console.log('⚠️ No products found to analyze.');
}

await Actor.exit();