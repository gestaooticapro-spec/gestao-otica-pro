
import { getInadimplentes } from '../src/lib/actions/collection.actions';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
    console.log('--- START DEBUG ---');
    try {
        const storeId = 1; // Assuming store 1
        console.log(`Fetching inadimplentes for store ${storeId}...`);
        const results = await getInadimplentes(storeId, 'cobrar');
        console.log(`Results count: ${results.length}`);
        if (results.length > 0) {
            console.log('First result:', JSON.stringify(results[0], null, 2));
        } else {
            console.log('No results found.');
        }
    } catch (error) {
        console.error('Error:', error);
    }
    console.log('--- END DEBUG ---');
}

main();
