const Groq = require("groq-sdk");
const readlineSync = require("readline-sync");
require('dotenv').config();

const c = {
  r: t => `\x1b[31m${t}\x1b[0m`, g: t => `\x1b[32m${t}\x1b[0m`, 
  b: t => `\x1b[34m${t}\x1b[0m`, c: t => `\x1b[36m${t}\x1b[0m`,
  y: t => `\x1b[33m${t}\x1b[0m`, gr: t => `\x1b[90m${t}\x1b[0m`,
  bold: t => `\x1b[1m${t}\x1b[0m`
};

class MediBot {
  constructor() {
    this.client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.history = [{ role: "system", content: "You are Dr. MediBot, an AI medical first-aid assistant. For DISEASES: Ask symptoms → assess severity → give first aid → recommend doctor if needed. For INJURIES: Get details → provide step-by-step first aid → warn when to call emergency (102/108). Always be professional and emphasize this isn't a substitute for real medical care." }];
  }

  async chat(input) {
    try {
      this.history.push({ role: "user", content: input });
      const response = await this.client.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: this.history,
        temperature: 0.3,
        max_tokens: 1500
      });
      const reply = response.choices[0].message.content;
      this.history.push({ role: "assistant", content: reply });
      return reply;
    } catch (error) {
      return `❌ Error: ${error.message}. For emergencies, call 102/108!`;
    }
  }

  format(text) {
    return text.replace(/\b(EMERGENCY|CRITICAL|URGENT|call 102|call 108)\b/gi, c.bold(c.r('$1')))
               .replace(/\b(first aid|treatment|steps)\b/gi, c.bold(c.c('$1')));
  }

  async start() {
    if (!process.env.GROQ_API_KEY) {
      console.error(c.r('❌ Set GROQ_API_KEY first'));
      return;
    }

    console.clear();
    console.log(c.c('🏥 DR. MEDIBOT - AI FIRST AID ASSISTANT'));
    console.log(c.b('📱 Emergency: 102/108 | Police: 100'));
    console.log(c.r('⚠️  NOT A SUBSTITUTE FOR MEDICAL CARE!\n'));
    console.log(c.c('Type "emergency" for critical help, "exit" to quit\n'));

    while (true) {
      const input = readlineSync.question('💬 You: ');
      
      if (input.toLowerCase() === 'exit') {
        console.log(c.g('👋 Stay safe! Goodbye.'));
        break;
      }

      if (input.toLowerCase() === 'emergency') {
        console.log(c.bold(c.r('\n🚨 EMERGENCY MODE')));
        const emergency = readlineSync.question(c.r('Describe situation: '));
        const response = await this.chat(`EMERGENCY: ${emergency}. Provide immediate first aid and when to call 102/108.`);
        console.log(c.r('\n🤖 Dr. MediBot (EMERGENCY):'), this.format(response));
      } else {
        const response = await this.chat(input);
        console.log(c.g('\n🤖 Dr. MediBot:'), this.format(response));
      }
      
      console.log(c.gr('─'.repeat(50) + '\n'));
    }
  }
}

new MediBot().start();