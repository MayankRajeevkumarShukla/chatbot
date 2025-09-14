const Groq = require("groq-sdk");
const readlineSync = require("readline-sync");
require('dotenv').config(); // Add this to load .env file

// Simple color function (no external dependency needed)
const colors = {
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  gray: (text) => `\x1b[90m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`
};

class MediBot {
  constructor() {
    this.client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.history = [{
      role: "system",
      content: `You are Dr. MediBot, an AI medical first-aid assistant.

PROTOCOLS:
- DISEASES: Ask symptoms → assess severity (mild/moderate/severe) → give first aid → recommend doctor if needed
- INJURIES: Get details → provide step-by-step first aid → warn when to call emergency (102/108)
- Always be professional, clear, and emphasize this isn't a substitute for real medical care
- For emergencies, immediately advise calling 102/108`
    }];
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
      return `❌ Error: ${error.message}. For emergencies, call 102/108 immediately!`;
    }
  }

  formatResponse(text) {
    // Highlight important terms
    return text
      .replace(/\b(EMERGENCY|CRITICAL|URGENT|call 102|call 108)\b/gi, colors.bold(colors.red('$1')))
      .replace(/\b(first aid|treatment|steps)\b/gi, colors.bold(colors.cyan('$1')));
  }

  displayBanner() {
    console.clear();
    console.log(colors.cyan('🏥 ════════════════════════════════════════'));
    console.log(colors.green('    DR. MEDIBOT - AI FIRST AID ASSISTANT'));
    console.log(colors.blue('📱 India Emergency: 102/108 | Police: 100'));
    console.log(colors.cyan('════════════════════════════════════════'));
    console.log(colors.red('⚠️  NOT A SUBSTITUTE FOR MEDICAL CARE!\n'));
  }

  async start() {
    // Check API key
    if (!process.env.GROQ_API_KEY) {
      console.error(colors.red('❌ Set GROQ_API_KEY first: set GROQ_API_KEY=your_key'));
      console.log(colors.yellow('For PowerShell: $env:GROQ_API_KEY="your_key"'));
      return;
    }

    this.displayBanner();
    console.log(colors.cyan('Type "emergency" for critical help, "exit" to quit\n'));

    while (true) {
      const input = readlineSync.question('💬 You: ');
      
      if (input.toLowerCase() === 'exit') {
        console.log(colors.green('👋 Stay safe! Goodbye.'));
        break;
      }

      if (input.toLowerCase() === 'emergency') {
        console.log(colors.bold(colors.red('\n🚨 EMERGENCY MODE')));
        const emergency = readlineSync.question(colors.red('Describe the situation: '));
        const response = await this.chat(`EMERGENCY: ${emergency}. Provide immediate first aid steps and when to call 102/108.`);
        console.log(colors.red('\n🤖 Dr. MediBot (EMERGENCY):'), this.formatResponse(response));
      } else {
        const response = await this.chat(input);
        console.log(colors.green('\n🤖 Dr. MediBot:'), this.formatResponse(response));
      }
      
      console.log(colors.gray('─'.repeat(50) + '\n'));
    }
  }
}

// Start the bot
const bot = new MediBot();
bot.start();