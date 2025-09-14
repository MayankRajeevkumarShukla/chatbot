const express = require('express');
const swaggerUi = require('swagger-ui-express');
const Groq = require("groq-sdk");
require('dotenv').config();

const app = express();
app.use(express.json());

// In-memory conversation storage
const conversations = new Map();

class MediBot {
  constructor() {
    this.client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.systemPrompt = "You are Dr. MediBot, an AI medical first-aid assistant. For DISEASES: Ask symptoms → assess severity → give first aid → recommend doctor if needed. For INJURIES: Get details → provide step-by-step first aid → warn when to call emergency (102/108). Always be professional and emphasize this isn't a substitute for real medical care.";
  }

  async chat(sessionId, input, isEmergency = false) {
    try {
      if (!conversations.has(sessionId)) {
        conversations.set(sessionId, [{ role: "system", content: this.systemPrompt }]);
      }
      
      const history = conversations.get(sessionId);
      const userMessage = isEmergency ? `EMERGENCY: ${input}. Provide immediate first aid and when to call 102/108.` : input;
      
      history.push({ role: "user", content: userMessage });
      
      const response = await this.client.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: history,
        temperature: 0.3,
        max_tokens: 1500
      });

      const reply = response.choices[0].message.content;
      history.push({ role: "assistant", content: reply });
      
      return {
        success: true,
        response: reply,
        sessionId,
        isEmergency,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        fallback: "❌ Error occurred. For emergencies, call 102/108!",
        sessionId,
        timestamp: new Date().toISOString()
      };
    }
  }

  getHistory(sessionId) {
    return conversations.get(sessionId)?.filter(msg => msg.role !== 'system') || [];
  }

  clearHistory(sessionId) {
    conversations.delete(sessionId);
    return { success: true, message: 'Conversation history cleared' };
  }
}

const mediBot = new MediBot();

// Swagger documentation
const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: '🏥 MediBot API',
    description: 'AI-powered medical first-aid assistant API\n\n⚠️ **NOT A SUBSTITUTE FOR MEDICAL CARE**\n\n🚨 **Emergency Numbers (India):** 102/108',
    version: '1.0.0'
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local server' }],
  paths: {
    '/api/chat': {
      post: {
        summary: '💬 Chat with MediBot',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message', 'sessionId'],
                properties: {
                  message: { type: 'string', example: 'I have a headache and fever' },
                  sessionId: { type: 'string', example: 'user123' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Successful response' }
        }
      }
    },
    '/api/emergency': {
      post: {
        summary: '🚨 Emergency Chat',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message', 'sessionId'],
                properties: {
                  message: { type: 'string', example: 'Someone is choking' },
                  sessionId: { type: 'string', example: 'emergency123' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Emergency response with first-aid steps' }
        }
      }
    },
    '/api/history/{sessionId}': {
      get: {
        summary: '📋 Get History',
        parameters: [{
          name: 'sessionId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          example: 'user123'
        }],
        responses: {
          200: { description: 'Conversation history' }
        }
      }
    },
    '/api/clear/{sessionId}': {
      delete: {
        summary: '🗑️ Clear History',
        parameters: [{
          name: 'sessionId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          example: 'user123'
        }],
        responses: {
          200: { description: 'History cleared' }
        }
      }
    }
  }
};

// Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/', (req, res) => res.redirect('/docs'));

// API Routes
app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    return res.status(400).json({ success: false, error: 'Missing message or sessionId' });
  }
  const result = await mediBot.chat(sessionId, message);
  res.json(result);
});

app.post('/api/emergency', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message || !sessionId) {
    return res.status(400).json({ success: false, error: 'Missing message or sessionId' });
  }
  const result = await mediBot.chat(sessionId, message, true);
  res.json(result);
});

app.get('/api/history/:sessionId', (req, res) => {
  const history = mediBot.getHistory(req.params.sessionId);
  res.json({ success: true, history, sessionId: req.params.sessionId });
});

app.delete('/api/clear/:sessionId', (req, res) => {
  const result = mediBot.clearHistory(req.params.sessionId);
  res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🏥 MediBot API running on http://localhost:${PORT}`);
  console.log(`📖 Swagger docs: http://localhost:${PORT}/docs`);
});