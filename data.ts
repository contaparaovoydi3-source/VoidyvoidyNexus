
import { FeedPost, Community, UserProfile } from './types';

export const MOCK_FOLLOWERS: UserProfile[] = [
  { name: 'Kael.Null', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Kael&backgroundColor=050714', rank: 'A+', level: 12, isMe: false, reputation: 450, following: 12, followers: 89, bio: 'Explorador das fendas externas.', nameColor: '#22d3ee', statusIcon: '📡', panelColor: '#0a0c1a', contentColor: '#050714', frameColor: '#22d3ee', frameStyle: 'pulse' },
  { name: 'Nova_Prime', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nova&backgroundColor=050714', rank: 'S', level: 45, isMe: false, reputation: 2300, following: 5, followers: 1400, bio: 'Estrategista tática do Sindicato.', nameColor: '#ec4899', statusIcon: '⭐', panelColor: '#1e1b4b', contentColor: '#0f172a', frameColor: '#ec4899', frameStyle: 'glitch' },
  { name: 'Echo-01', avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Echo&backgroundColor=050714', rank: 'B', level: 8, isMe: false, reputation: 120, following: 150, followers: 20, bio: 'Apenas uma estática no vácuo.', nameColor: '#94a3b8', statusIcon: '🤖', panelColor: '#0f172a', contentColor: '#020617', frameColor: '#64748b', frameStyle: 'rainbow' },
];

export const TEST_COMMUNITIES: Community[] = [
  {
    id: 'test-1',
    name: 'Neo-Verona',
    description: 'Um refúgio para as almas românticas perdidas no vácuo. Aqui, a poesia é nossa única lei.',
    catchphrase: 'Onde o amor desafia a gravidade.',
    avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=NeoVerona',
    theme: 'Romance',
    banner: 'https://images.unsplash.com/photo-1518133910546-b6c2fb7d79e3?q=100&w=3840&auto=format&fit=crop',
    creator: 'Drake.OS',
    leaders: ['Drake.OS'],
    coLeaders: [],
    membersCount: 980,
    level: 5,
    posts: [],
    messages: [],
    tags: ['romance', 'poesia'],
    isPublic: true
  },
  {
    id: 'test-2',
    name: 'Setor de Combate 9',
    description: 'Arena de elite para gladiadores neurais.',
    catchphrase: 'Sangue e Neon no Vácuo.',
    avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=Sector9',
    theme: 'Luta',
    banner: 'https://images.unsplash.com/photo-1555617766-c94804975da3?q=100&w=3840&auto=format&fit=crop',
    creator: 'Drake.OS',
    leaders: ['Drake.OS'],
    coLeaders: [],
    membersCount: 1000,
    level: 12,
    posts: [],
    messages: [],
    tags: ['luta', 'arena'],
    isPublic: true
  }
];

export const INITIAL_POSTS: FeedPost[] = [
  {
    id: '1',
    author: 'Drake.OS',
    avatar: 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=DrakeMaster&backgroundColor=0a0c1a',
    content: '[c]AVISO CRÍTICO[/c]\nDetectamos flutuações anômalas no Setor 7. Operativos devem manter cautela absoluta ao cruzar a fenda quântica.',
    images: ['https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=100&w=3840&auto=format&fit=crop'],
    likes: 1240,
    time: '2h ago',
    tag: 'SISTEMA',
    timestamp: Date.now() - 7200000,
    comments: [],
    isFeatured: true
  }
];

export const DEFAULT_THEMES = [
  { id: 'geral', label: 'Geral', icon: '🌐', img: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=100&w=3840&auto=format&fit=crop' },
  { id: 'romance', label: 'Romance', icon: '💕', img: 'https://images.unsplash.com/photo-1534103362078-d07e750bd0c4?q=100&w=3840&auto=format&fit=crop' },
  { id: 'acao', label: 'Ação', icon: '⚡', img: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=100&w=3840&auto=format&fit=crop' },
  { id: 'luta', label: 'Luta', icon: '⚔️', img: 'https://images.unsplash.com/photo-1555617766-c94804975da3?q=100&w=3840&auto=format&fit=crop' },
  { id: 'suspense', label: 'Suspense', icon: '👁️', img: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?q=100&w=3840&auto=format&fit=crop' },
  { id: 'terror', label: 'Terror', icon: '💀', img: 'https://images.unsplash.com/photo-1505635330303-dfb307d4722c?q=100&w=3840&auto=format&fit=crop' },
  { id: 'escolar', label: 'Escolar', icon: '🏫', img: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?q=100&w=3840&auto=format&fit=crop' },
  { id: 'anime', label: 'Anime', icon: '🌸', img: 'https://images.unsplash.com/photo-1578632738980-4334635c894d?q=100&w=3840&auto=format&fit=crop' },
  { id: 'medieval', label: 'Medieval', icon: '🏰', img: 'https://images.unsplash.com/photo-1599408162165-8bca2943d0d1?q=100&w=3840&auto=format&fit=crop' },
  { id: 'futuro', label: 'Futuro', icon: '🛸', img: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=100&w=3840&auto=format&fit=crop' },
];

/**
 * Gera um hash simples para strings, usado para deduplicar imagens no storage.
 */
const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
};

export const safeStore = (key: string, value: string) => {
  try {
    if (!key || key.length > 512) return;
    if (value && value.length > 5 * 1024 * 1024) {
       console.warn("Value too large for safeStore (Max 5MB), skipping");
       return;
    }
    localStorage.setItem(key, value);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn("Storage full, cleaning up old chat images...");
      try {
        const allKeys = Object.keys(localStorage);
        // Prioritize deleting old vimg_chat_ images (temporary session media)
        const chatMediaKeys = allKeys.filter(k => k.startsWith('vimg_chat_'));
        
        if (chatMediaKeys.length > 20) {
           // Delete oldest 70% of chat media
           chatMediaKeys.sort().slice(0, Math.ceil(chatMediaKeys.length * 0.7)).forEach(k => localStorage.removeItem(k));
        } else {
           // Delete other images if chat media is already low
           const otherImgKeys = allKeys.filter(k => {
             const uk = k.toUpperCase();
             return (k.startsWith('vimg_') || k.startsWith('img_')) && 
                    !k.startsWith('vimg_chat_') &&
                    uk !== 'IMG_NEXUS' && 
                    uk !== 'VOID_USER_AVATAR' &&
                    uk !== 'VOID_NEXUS_CUSTOM_AVATAR' &&
                    !uk.includes('PERFIL') &&
                    !uk.includes('USUARIO');
           });
           otherImgKeys.sort().slice(0, Math.ceil(otherImgKeys.length / 2)).forEach(k => localStorage.removeItem(k));
        }
        
        localStorage.setItem(key, value);
      } catch (inner) {
        // Emergency purge of all non-critical images
        Object.keys(localStorage)
          .filter(k => {
            const uk = k.toUpperCase();
            return (k.startsWith('vimg_') || k.startsWith('img_') || k.startsWith('void_chat_img_')) && 
                   uk !== 'IMG_NEXUS' && 
                   uk !== 'VOID_USER_AVATAR' && 
                   uk !== 'VOID_NEXUS_CUSTOM_AVATAR' &&
                   !uk.includes('PERFIL') &&
                   !uk.includes('USUARIO');
          })
          .forEach(k => localStorage.removeItem(k));
        try { localStorage.setItem(key, value); } catch(e3) {}
      }
    }
  }
};

export const tryGet = (id: string | null | undefined): string | null => {
  if (!id) return null;
  try {
    let cleanKey = id.trim();
    if (cleanKey.toLowerCase().startsWith('ref:')) {
      cleanKey = cleanKey.substring(4).trim();
    }
    
    // Se a chave já for um base64 resolvido ou uma URL, retorna ela diretamente
    if (cleanKey.startsWith('data:') || cleanKey.includes('://') || cleanKey.startsWith('/')) {
      return cleanKey;
    }
    
    if (cleanKey.length > 512) return null;
    
    // Direct attempt
    const direct = localStorage.getItem(cleanKey) || 
                   localStorage.getItem(cleanKey.toLowerCase()) || 
                   localStorage.getItem(cleanKey.toUpperCase());
    
    if (direct) {
       if (direct.startsWith('ref:')) return tryGet(direct.substring(4));
       return direct;
    }

    // Tenta com e sem prefixos comumente usados
    const cleanId = cleanKey.replace(/^(ref:|vimg_|img_)/i, '');
    const searchKeys = [
       cleanKey,
       'vimg_' + cleanKey,
       'img_' + cleanKey,
       'vimg_' + cleanId,
       'img_' + cleanId
    ];

    for (const k of searchKeys) {
       const val = localStorage.getItem(k) || localStorage.getItem(k.toLowerCase()) || localStorage.getItem(k.toUpperCase());
       if (val) {
          if (val.startsWith('ref:')) return tryGet(val.substring(4));
          return val;
       }
    }

    const charStr = localStorage.getItem('void_character');
    if (charStr) {
      const char = JSON.parse(charStr);
      if (char.name === cleanKey || char.name === cleanId) return char.avatar;
    }
    return null;
  } catch (e) { return null; }
};

/**
 * Salva um objeto JSON no localStorage de forma segura, tratando quota e erros.
 */
export const safeJsonStore = (key: string, data: any) => {
  try {
    const stringified = JSON.stringify(data);
    safeStore(key, stringified);
  } catch (e) {
    console.error(`Falha ao serializar dados para ${key}`, e);
  }
};

/**
 * Move imagens base64 de mensagens para o storage de mídia (safeStore) 
 * e substitui por referências 'ref:vimg_...'.
 * Isso reduz drasticamente o tamanho do objeto sessions no localStorage.
 */
export const dehydrateMessages = (messages: any[]): any[] => {
  if (!messages) return [];
  // Evita dehydratar as últimas 15 mensagens para manter latência zero na visualização imediata
  const recentThreshold = Math.max(0, messages.length - 15);
  
  return messages.map((m, idx) => {
    if (idx >= recentThreshold) return m;

    if (m.image && m.image.startsWith('data:image') && m.image.length > 5000) {
      // Usa hash do conteúdo para evitar duplicatas no localStorage
      const hash = simpleHash(m.image);
      const id = `vimg_chat_${hash}`;
      safeStore(id, m.image);
      return { ...m, image: `ref:${id}` };
    }
    return m;
  });
};

const NEXUS_DEFAULT_ICON = 'https://storage.googleapis.com/voidyapp-storage/%C3%8Dcone%20Nexus.png';

export const resolveImageRef = (ref: string | undefined | null, optionalName?: string): string | null => {
  if (!ref && !optionalName) return null;
  const upperRef = ref && typeof ref === 'string' ? (ref.length < 100 ? ref.toUpperCase() : '') : '';
  const upperName = optionalName && typeof optionalName === 'string' ? optionalName.toUpperCase() : '';

  // 1. Critical Redirections (NEXUS and User)
  const isNexusExact = upperRef === 'NEXUS' || upperName === 'NEXUS' || ref === NEXUS_DEFAULT_ICON;
  
  if (isNexusExact) {
     // 1. Check explicit overrides first - Highest Priority
     const custom = tryGet('void_nexus_custom_avatar') || tryGet('img_NEXUS') || tryGet('vimg_NEXUS');
     if (custom && custom.length > 50) return custom;
     
     // 2. Visual Registry lookup - Checks for the specific form or the most recent one
     try {
       const regRaw = localStorage.getItem('void_nexus_visual_registry');
       if (regRaw) {
         const reg = JSON.parse(regRaw);
         if (Array.isArray(reg) && reg.length > 0) {
            // Find most recent matching name or just the absolute last entry (newest)
            const match = optionalName ? [...reg].reverse().find((p: any) => p.name.toUpperCase() === optionalName.toUpperCase()) : null;
            const target = match || reg[reg.length - 1]; 
            if (target && target.avatar) {
               const res = tryGet(target.avatar);
               if (res && res.length > 50) return res;
            }
         }
       }
     } catch(e) {}

     return NEXUS_DEFAULT_ICON;
  }

  // Handle subtle includes only if it's a short string (likely a key/name) and not a full URL/Base64
  const isNexusSubtle = typeof ref === 'string' && ref.length < 30 && ref.toUpperCase().includes('NEXUS');
  if (isNexusSubtle) {
      const custom = tryGet('void_nexus_custom_avatar') || tryGet('img_NEXUS') || tryGet('vimg_NEXUS');
      if (custom && custom.length > 50) return custom;
  }

  if (upperRef === 'USER_AVATAR' || upperRef === 'ME' || upperRef === 'MIM' || upperRef === 'USER' || upperName === 'ME' || upperRef === 'VIAJANTE' || upperName === 'VIAJANTE') {
     return tryGet('void_user_avatar') || tryGet('img_user_avatar') || tryGet('ME') || tryGet('img_VIAJANTE') || null;
  }

  // 2. Direct lookup for provided ref or name using global tryGet (handles refs)
  // CRITICAL CHANGE: If a name is provided and we are NOT in a fresh upload/data context,
  // we check the registry first to avoid reverting to an old URL passed in 'ref'.
  const nameOverride = (upperName && upperName.length > 1) ? (tryGet('img_' + upperName) || tryGet('vimg_' + upperName)) : null;
  if (nameOverride && nameOverride.length > 50 && (!ref || !ref.startsWith('data:'))) {
      return nameOverride;
  }

  const directMatch = tryGet(ref) || tryGet(optionalName) || tryGet('img_' + upperName) || tryGet('img_' + upperRef);
  if (directMatch) return directMatch;

  if (!ref || typeof ref !== 'string') return null;

  // 3. URLs and Data URIs
  if (ref && (ref.startsWith('data:') || ref.includes('ais-dev') || ref.includes('googleusercontent') || ref.includes('://') || ref.startsWith('/'))) {
    return ref;
  }
  
  // 4. Substring Search fallback (Heuristics)
  const cleanId = (ref || '').replace(/^(ref:|vimg_|img_)/i, '');
  if (cleanId.length > 2 && cleanId.length < 50) {
     for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('img_') || key.startsWith('vimg_'))) {
           if (key.toUpperCase().includes(cleanId.toUpperCase())) {
              const val = localStorage.getItem(key);
              if (val && val.length > 100) return val;
           }
        }
     }
  }

  // 5. Look for named images as last resort
  if (optionalName) {
     const byName = localStorage.getItem('img_' + optionalName.toUpperCase()) || localStorage.getItem('vimg_' + optionalName.toUpperCase());
     if (byName) return byName;
  }

  // 6. Final Identicon fallback - DISABLED for Nexus and common names to avoid user frustration
  if (ref && ref.length < 15 && !ref.startsWith('ref:') && !ref.startsWith('vimg_') && !ref.startsWith('img_') && !ref.includes(' ') && !ref.includes('/') && !ref.includes('.') && !ref.includes(',') && !['NEXUS', 'SISTEMA', 'VIAJANTE', 'USER'].includes(ref.toUpperCase())) {
    // Only use identicon for truly unknown, non-systemic short seeds
    return `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(ref)}`;
  }

  // Se chegou aqui e é um prefixo de referência, significa que ela está perdida (corrompida/deletada)
  // Retornar um fallback limpo evita imagens quebradas no navegador
  if (ref && (ref.startsWith('ref:') || ref.startsWith('vimg_') || ref.startsWith('img_'))) {
     const seedName = optionalName || ref.replace(/^(ref:|vimg_|img_)/i, '');
     if (seedName && seedName.toUpperCase().includes('NEXUS')) {
        return NEXUS_DEFAULT_ICON;
     }
     return `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(seedName || 'void')}`;
  }

  if (ref && (ref.startsWith('data:') || ref.includes('://') || ref.startsWith('/'))) {
     return ref;
  }

  // Fallback final para strings genéricas que não são URLs válidas
  const fallbackSeed = optionalName || ref || 'void';
  if (fallbackSeed.toUpperCase().includes('NEXUS')) {
     return NEXUS_DEFAULT_ICON;
  }
  return `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(fallbackSeed)}`;
};

/**
 * Extracts a deduplicated list of personas from a message history.
 * Prioritizes explicit labels and avoids duplicate entries for the same image or similar names.
 */
export const extractPersonasFromMessages = (messages: any[], currentSession?: { name?: string, avatar?: string }) => {
  const imageToName = new Map<string, { name: string, priority: number }>();
  const nameToImage = new Map<string, string>();
  
  const wipeTimestamp = Number(localStorage.getItem('void_persona_wipe_timestamp') || '0');

  // Helper to add/update persona with priority logic
  const addPersona = (name: string, img: string, priority: number) => {
    if (!name || (!img && priority < 5) || name.length < 2 || name.length > 50) return;
    const cleanName = name.trim();
    const upName = cleanName.toUpperCase();
    
    // Maintain a Name -> Image map for lookup by name
    if (img && (!nameToImage.has(upName) || priority >= 5)) {
       nameToImage.set(upName, img);
    }

    // Check if this image already has a name assignment
    if (img) {
      const existing = imageToName.get(img);
      // Only update if we have a higher priority OR if current priority is low and we have a better name
      if (!existing || priority > existing.priority || (priority === existing.priority && cleanName.length > existing.name.length)) {
         imageToName.set(img, { name: cleanName, priority });
      }
    }
  };

  messages.forEach((m, idx) => {
    // Skip extraction from messages produced BEFORE the last wipe
    if (m.timestamp && m.timestamp < wipeTimestamp) return;

    // 0. Use personaName and personaAvatar if available (Priority 15)
    if (m.personaName && m.personaName !== 'SISTEMA' && m.personaName !== 'NEXUS') {
      const avatar = m.personaAvatar || m.image;
      if (avatar) {
        addPersona(m.personaName, avatar, 15);
      }
    }

    if (m.image || m.text) {
      const txt = m.text || '';
      const saveMatch = txt.match(/(?:guarde|salve|save|como|chamá-la de|chamá-lo de)\s+(?:isso\s+)?(?:como\s+)?["']?([A-Z0-9\sÁÉÍÓÚÂÊÎÔÛÃÕÇ-áéíóúâêîôûãõç-]{2,40})["']?/i);
      const betweenBrackets = txt.match(/\[([A-Z0-9\s-]{2,30})\]/); // Matches common character headers [NAME]
      
      if (saveMatch && m.image) addPersona(saveMatch[1].trim(), m.image, 30); // Highest priority: user explicit mapping
      else if (saveMatch) addPersona(saveMatch[1].trim(), m.personaAvatar || '', 20);
      else if (betweenBrackets && m.image) addPersona(betweenBrackets[1].trim(), m.image, 25);
      else if (betweenBrackets) addPersona(betweenBrackets[1].trim(), m.personaAvatar || '', 12);

      // 2. Persona changes in text headers like "**NAME:**"
      const boldHeaderMatch = txt.match(/(?:\s*[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]\s*)?\*\*([^\*]{2,30})\*\*[:\s-]*/u);
      if (boldHeaderMatch) {
         const foundName = boldHeaderMatch[1].trim();
         if (m.image) addPersona(foundName, m.image, 22);
         else addPersona(foundName, m.personaAvatar || '', 15);
      }

      // 3. Fallback to message text only if it's VERY short and looks like a name (Priority 2)
      if (m.image) {
        const cleanText = txt.replace(/\[.*?\]/g, '').trim();
        if (cleanText.length > 2 && cleanText.length < 25 && !saveMatch && !m.personaName) {
           const wordCount = cleanText.split(/\s+/).length;
           const hasSentencePunctuation = /[.!?]$/.test(cleanText);
           if (wordCount <= 1 && !hasSentencePunctuation) {
              addPersona(cleanText, m.image, 2);
           }
        }
      }
    }
  });

  // Final pass: Build deduplicated visuals
  const uniqueVisuals: { name: string, avatar: string }[] = [];
  const seenNames = new Set<string>();

  // Add Nexus first (Base state)
  const nexusAvatar = resolveImageRef('NEXUS') || 'https://storage.googleapis.com/voidyapp-storage/%C3%8Dcone%20Nexus.png';
  uniqueVisuals.push({ name: 'NEXUS', avatar: nexusAvatar });
  seenNames.add('NEXUS');
  seenNames.add('SISTEMA');

  // Add personas collected from history
  // Priority: if a name is associated with an image, use that.
  nameToImage.forEach((img, name) => {
     if (!seenNames.has(name)) {
        uniqueVisuals.push({ name, avatar: img });
        seenNames.add(name);
     }
  });

  return uniqueVisuals.filter(p => {
    const upName = p.name.toUpperCase();
    if (upName === 'NEXUS' || upName === 'SISTEMA') return true;
    
    const resolved = resolveImageRef(p.avatar);
    if (!resolved) return false;
    
    // If it's still a ref-like string that didn't resolve to a real data URL or real URL, it's corrupted/lost
    const looksValid = resolved.startsWith('data:') || 
                       resolved.startsWith('http') || 
                       resolved.startsWith('/') || 
                       (resolved.length > 30 && !resolved.startsWith('ref:'));

    return looksValid;
  });
};

/**
 * Procura por todas as personas salvas no localStorage e garante que estejam no registro da Nexus.
 * Melhora a recuperação vasculhando o histórico de TODAS as sessões em busca de personas enviadas pela IA.
 */
export const repairNexusRegistry = () => {
    try {
        localStorage.removeItem('void_persona_wipe_timestamp'); // Clear wipe timestamp on repair to recover everything
        const registry = JSON.parse(localStorage.getItem('void_nexus_visual_registry') || '[]');
        const updated = [...registry];
        let hasChanges = false;

        const mergePersona = (name: string, avatar: string) => {
            if (!name || typeof name !== 'string') return;
            const upName = name.toUpperCase();
            if (upName.length < 2 || upName === 'SISTEMA') return;
            
            // Critical resolve: don't store broken refs or too short non-URL strings
            const resolved = resolveImageRef(avatar, name);
            if (!resolved || resolved.length < 20) return;
            if (upName === 'NEXUS') {
                if (resolved.length > 100) {
                   localStorage.setItem('img_NEXUS', resolved);
                   localStorage.setItem('void_nexus_custom_avatar', resolved);
                }
                return;
            }
            
            const existingIdx = updated.findIndex(p => p.name.toUpperCase() === upName);
            if (existingIdx === -1) {
                updated.push({ name: name, avatar: resolved });
                hasChanges = true;
            } else if (updated[existingIdx].avatar !== resolved && resolved.length > (updated[existingIdx].avatar?.length || 0)) {
                updated[existingIdx].avatar = resolved;
                hasChanges = true;
            }
        };

        // 1. Scan direct storage keys (The previous logic)
        const userChar = JSON.parse(localStorage.getItem('void_character') || '{}');
        const userName = (userChar.name || '').toUpperCase();
        const voidUserName = (localStorage.getItem('void_user_name') || '').toUpperCase();
        const profileExclusions = [userName, voidUserName, 'MEMBRO', 'DRAKE', 'OPERATIVO', 'SISTEMA'];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('img_') || key.startsWith('vimg_')) && key !== 'img_NEXUS') {
                const name = key.replace(/^(img_|vimg_)/i, '').toUpperCase();
                
                // Avoid systemic keys, user names, and short identifiers
                const isSystemic = name.includes('CHAT_') || name.includes('UPLOAD_') || name.includes('VOID_') || name.includes('DEFAULT');
                const isUser = profileExclusions.includes(name);

                if (name.length > 2 && name.length < 50 && !isSystemic && !isUser) {
                    const avatarData = localStorage.getItem(key);
                    if (avatarData && avatarData.length > 100) {
                        mergePersona(name, avatarData);
                    }
                }
            }
        }

        // 2. DEEP SCAN: Vasculha TODAS as sessões de chat em busca de personas enviadas pela IA no histórico
        const sessionsStr = localStorage.getItem('void_sessions');
        if (sessionsStr) {
            try {
                const sessions = JSON.parse(sessionsStr);
                if (Array.isArray(sessions)) {
                    sessions.forEach(s => {
                        const isNexusSession = s.id === 'nexus-default' || s.name === 'NEXUS';
                        if (s && Array.isArray(s.messages)) {
                            s.messages.forEach((m: any) => {
                                // Se a mensagem tem imagem e veio da Nexus (model)
                                if (m.image && m.role === 'model') {
                                    const txt = m.text || '';
                                    const betweenBrackets = txt.match(/\[([A-Z0-9\s-]{2,30})\]/);
                                    const boldHeaderMatch = txt.match(/^\*\*([A-Z\s-]{2,30}):\*\*/);
                                    
                                    let detectedName = m.personaName;
                                    if (betweenBrackets) detectedName = betweenBrackets[1].trim();
                                    else if (boldHeaderMatch) detectedName = boldHeaderMatch[1].trim();

                                    const upDetected = (detectedName || '').toUpperCase();
                                    if (upDetected && upDetected !== 'NEXUS' && !profileExclusions.includes(upDetected)) {
                                        const resolved = resolveImageRef(m.image, detectedName);
                                        if (resolved && resolved.length > 100) {
                                           mergePersona(detectedName, resolved);
                                        }
                                    }
                                }
                            });
                        }
                    });
                }
            } catch(e) {}
        }

        if (hasChanges) {
           localStorage.setItem('void_nexus_visual_registry', JSON.stringify(updated.slice(-500)));
           return true;
        }
    } catch (e) {}
    return false;
};

/**
 * Limpa completamente o registro visual da Nexus e o cache de imagens vinculadas a nomes (img_, vimg_).
 * Útil quando o usuário quer reiniciar o mapeamento de personas.
 */
export const wipePersonasRegistry = () => {
    try {
        localStorage.removeItem('void_nexus_visual_registry');
        localStorage.removeItem('img_NEXUS');
        localStorage.removeItem('void_nexus_custom_avatar');
        localStorage.setItem('void_persona_wipe_timestamp', Date.now().toString());
        
        // Remove all named image caches
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
           const key = localStorage.key(i);
           if (key && (key.startsWith('img_') || key.startsWith('vimg_'))) {
              keysToRemove.push(key);
           }
        }
        
        keysToRemove.forEach(k => localStorage.removeItem(k));
        return true;
    } catch (e) {
        return false;
    }
};
