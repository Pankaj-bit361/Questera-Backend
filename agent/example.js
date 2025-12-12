const { createImageAgent } = require('./index');


async function runExample() {
   const agent = createImageAgent({
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash-preview-09-2025'
   });

   const result = await agent.run({
      userId: 'user-123',
      chatId: 'chat-example',
      message: 'Create a beautiful sunset image over mountains',
      referenceImages: []
   });

   console.log('\n📤 Final Result:', result);
}


if (require.main === module) {
   runExample().catch(console.error);
}

