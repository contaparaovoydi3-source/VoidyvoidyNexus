
import { GoogleGenAI, Content } from '@google/genai';
import { Message } from './types';
import { SYSTEM_INSTRUCTION, MODEL_TEXT, AI_CONFIG, CONTEXT_LIMIT } from './constants';
import { tryGet } from './data';

/**
 * Gerenciador de Inteligência Artificial para o sistema VOIDY.
 * Otimizado para o modelo Gemini 3 Flash com alta capacidade de tokens.
 */
export class AIService {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("API_KEY não configurada para o serviço de IA.");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Processa o histórico de mensagens para otimizar o consumo de tokens.
   * Suporta entrada multimodal (texto e imagem).
   */
  private prepareHistory(messages: Message[], travelerAvatar?: string): Content[] {
    // Mantém apenas as últimas N mensagens para otimização de performance e custo
    // Filtramos mensagens do sistema que não contribuem para o contexto direto da conversa
    const contextMessages = messages
      .filter(m => {
        if (m.personaName === 'SISTEMA') {
           // Allow system messages that are explicitly meant for perception or phase changes
           const txt = (m.text || '').toLowerCase();
           return txt.includes('percepção') || 
                  txt.includes('perfil') || 
                  txt.includes('aparência') || 
                  txt.includes('fase') || 
                  txt.includes('boss') || 
                  txt.includes('missão');
        }
        return true;
      })
      .slice(-CONTEXT_LIMIT);

    const history: Content[] = contextMessages.map(m => {
      const parts: any[] = [];
      
      if (m.text && m.text.trim() !== '') {
        parts.push({ text: m.text });
      }

      // Resolve single image (legacy)
      let resolvedImage = m.image;
      if (resolvedImage && resolvedImage.startsWith('ref:')) {
         resolvedImage = tryGet(resolvedImage.substring(4));
      }

      const imagesToProcess: string[] = [];
      if (resolvedImage) imagesToProcess.push(resolvedImage);

      // Resolve multiple images
      if (m.images && m.images.length > 0) {
        m.images.forEach(img => {
          let res = img;
          if (res && res.startsWith('ref:')) {
            res = tryGet(res.substring(4));
          }
          if (res) imagesToProcess.push(res);
        });
      }

      // Se houver imagens (base64), adiciona como partes inlineData
      imagesToProcess.forEach(img => {
        if (img && img.startsWith('data:image')) {
          const [header, data] = img.split(',');
          const mimeType = header.split(';')[0].split(':')[1];
          parts.push({
            inlineData: {
              data: data,
              mimeType: mimeType
            }
          });
        }
      });

      return {
        role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
        parts: parts.length > 0 ? parts : [{ text: "..." }]
      };
    });

    // Injeção de Identidade Visual do Viajante (Traveler Identity Injection) - Otimizado para performance
    // Só enviamos a imagem se for necessário (mudança recente, início de conversa ou pergunta sobre aparência)
    if (travelerAvatar && travelerAvatar.startsWith('data:image')) {
       const [header, data] = travelerAvatar.split(',');
       const mimeType = header.split(';')[0].split(':')[1];
       
       const lastMsgText = messages[messages.length - 1]?.text?.toLowerCase() || '';
       const isAskingAboutSelf = lastMsgText.includes('como eu sou') || lastMsgText.includes('minha aparência') || lastMsgText.includes('meu avatar') || lastMsgText.includes('minha foto');
       const isSystemPerception = messages.some(m => m.personaName === 'SISTEMA' && m.text?.includes('imagem de perfil'));
       const isStartOfConversation = messages.length < 5;

       if (isAskingAboutSelf || isSystemPerception || isStartOfConversation) {
          // Tentamos anexar à última mensagem do usuário para máxima relevância
          const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
          if (lastUserMsg) {
             lastUserMsg.parts.push({ text: "\n[SINAL VISUAL: APARÊNCIA ATUAL DO VIAJANTE]" });
             lastUserMsg.parts.push({ inlineData: { data, mimeType } });
          } else {
             history.unshift({
                role: 'user',
                parts: [
                   { text: "[DADOS NEURAIS: APARÊNCIA ATUAL DO VIAJANTE]" },
                   { inlineData: { data, mimeType } }
                ]
             });
          }
       }
    }

    return history;
  }

  /**
   * Verifica se o conteúdo (texto ou imagem) viola as diretrizes de segurança (NSFW/Gore).
   */
  async checkSafety(content: string, type: 'text' | 'image'): Promise<{ isSafe: boolean; reason?: string }> {
    try {
      const prompt = type === 'image' 
        ? "Analise esta imagem. Ela é sexualmente explícita, contém pornografia, nudez total real ou gore extremo/violência real pesada? Se contiver pornografia, nudez explícita ou gore violento real, responda 'FALSE'. Se for uma imagem segura no aspecto visual e estética (SFW), responda 'TRUE'."
        : `Analise o texto a seguir. Ele contém apologia à violência extrema real, gore grotesco, automutilação ou assédio real severo? Conteúdos sensuais, eróticos, maduros, +18 ou NSFW de RPG consensual são inteiramente permitidos e aceitos aqui. Texto: "${content}". Responda apenas 'TRUE' se for seguro/permitido e 'FALSE' se violar com violência extrema real ou gore cruel.`;

      const parts: any[] = [{ text: prompt }];
      
      if (type === 'image' && content.startsWith('data:image')) {
        const [header, data] = content.split(',');
        const mimeType = header.split(';')[0].split(':')[1];
        parts.push({
          inlineData: {
            data: data,
            mimeType: mimeType
          }
        });
      }

      const result = await this.ai.models.generateContent({
        model: MODEL_TEXT, // Using standard flash model for safety check
        contents: [{ role: 'user', parts: parts }],
        config: {
          temperature: 0.1,
          topP: 0.1,
        }
      });

      const response = result.text.trim().toUpperCase();
      return { isSafe: response.includes('TRUE') };
    } catch (error: any) {
      console.error("Safety Check Error:", error);
      // Even on safety check failure due to quota, we return safe: true 
      // but the subsequent calls will likely fail and be handled there.
      return { isSafe: true }; 
    }
  }

  /**
   * Gera uma resposta da IA baseada no histórico de chat.
   */
  async generateResponse(messages: Message[], additionalInstructions?: string, travelerAvatar?: string): Promise<string> {
    try {
      const history = this.prepareHistory(messages, travelerAvatar);
      
      const finalInstructions = additionalInstructions 
        ? `${SYSTEM_INSTRUCTION}\n\n[CONTEXTO ADICIONAL DA CENA/PERSONAGEM]:\n${additionalInstructions}`
        : SYSTEM_INSTRUCTION;

      const result = await this.ai.models.generateContent({
        model: MODEL_TEXT,
        contents: history,
        config: {
          ...AI_CONFIG,
          systemInstruction: finalInstructions,
          safetySettings: AI_CONFIG.safetySettings as any,
        }
      });

      return result.text || "...";
    } catch (error: any) {
      console.error("AIService Error Detail:", JSON.stringify(error));
      
      const errorMessage = error.message || "";
      const errorStr = JSON.stringify(error);
      const statusCode = error.status || (error.response && error.response.status);
      
      // Tratamento amigável para limites de API e exaustão de créditos
      if (
        statusCode === 429 ||
        errorMessage.includes("quota") || 
        errorMessage.includes("429") || 
        errorStr.includes("RESOURCE_EXHAUSTED") || 
        errorStr.includes("credits are depleted") ||
        errorStr.includes("prepayment credits")
      ) {
        return "Sinal enfraquecendo... Seus créditos no AI Studio foram exauridos ou a cota foi atingida. Por favor, recarregue seus créditos ou verifique seu faturamento em https://ai.studio/projects.";
      }
      
      return "Ocorreu um erro na rede neural (Voidy Logic Error). Reconectando... [Status: " + (statusCode || "UNK") + "]";
    }
  }

  /**
   * Exemplo de inicialização para ambientes Mobile ou Backend (Node.js):
   * 
   * // No servidor ou app:
   * const aiService = new AIService(process.env.GEMINI_API_KEY);
   * const response = await aiService.generateResponse(historicoDeMensagens);
   */
}
