// Script to test AI tools (ES Module)
// Node 18+ has native fetch

async function testTool(message) {
    console.log(`\n--- Testing: "${message}" ---`);
    try {
        const response = await fetch('http://localhost:3000/api/chat-tutorial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                storeId: 1
            })
        });
        const data = await response.json();
        console.log("Reply:", data.reply);
    } catch (error) {
        console.error("Error:", error.message);
    }
}

async function run() {
    await testTool("Quais produtos estão acabando?");
    await testTool("O que vendemos hoje?");
    await testTool("Qual o produto mais vendido esse mês?");
}

run();
