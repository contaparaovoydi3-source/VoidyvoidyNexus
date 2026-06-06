
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GameState, Message, Character, UserProfile, ChatSession, FeedPost, Community, Notification, MuralPost, CityMemberData } from './types';
import MainConsole from './components/MainConsole';
import CharacterCreation from './components/CharacterCreation';
import Lobby, { DragonO } from './components/Lobby';
import SocialSidebar from './components/SocialSidebar';
import ProfileView from './components/ProfileView';
import FeedView from './components/FeedView';
import WikiCreation from './components/WikiCreation';
import PublicChat from './components/PublicChat';
import CommunityCreation from './components/CommunityCreation';
import CommunityView from './components/CommunityView';
import CommunitySearch from './components/CommunitySearch';
import AuthScreen from './components/AuthScreen';
import HelpOverlay from './components/HelpOverlay';
import NotificationCenter from './components/NotificationCenter';
import VoiceInterface from './components/VoiceInterface';
import MessagesArchive from './components/MessagesArchive';
import RecentCommunityChats from './components/RecentCommunityChats';
import RankingView from './components/RankingView';
import SocialDiscovery from './components/SocialDiscovery';
import InviteFollowers from './components/InviteFollowers';
import DraftsView from './components/DraftsView';
import CommunityPreview from './components/CommunityPreview';
import { GoogleGenAI } from '@google/genai';
import { AIService } from './aiService';
import { SYSTEM_INSTRUCTION, MODEL_TEXT, MODEL_IMAGE } from './constants';
import { 
  TEST_COMMUNITIES, 
  INITIAL_POSTS, 
  DEFAULT_THEMES, 
  resolveImageRef, 
  extractPersonasFromMessages, 
  safeStore, 
  tryGet, 
  dehydrateMessages, 
  safeJsonStore,
  repairNexusRegistry
} from './data';

interface LocalUser {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  email: string | null;
}

const AVAILABLE_GLOBAL_FRAMES = [
  { id: 'frame-event-void', name: 'Pulso do Evento', price: 1, color: '#10b981', style: 'frame-event-art', category: 'EVENTO' },
  { id: 'frame-neon-cyan', name: 'Borda Neon Ciano', price: 45, color: '#22d3ee', style: 'frame-neon-cyan-art', category: 'SIMPLES' },
  { id: 'frame-neon-pink', name: 'Borda Neon Rosa', price: 80, color: '#ec4899', style: 'frame-neon-pink-art', category: 'SIMPLES' },
  { id: 'frame-abyssal-beast', name: 'Besta do Abismo', price: 450, color: '#ef4444', style: 'frame-abyssal-beast-art', category: 'LENDÁRIA' },
  { id: 'frame-ouroboros-gold', name: 'Ouroboros Áureo', price: 850, color: '#fbbf24', style: 'frame-ouroboros-art', category: 'LENDÁRIA' },
  { id: 'frame-void-god', name: 'Lorde do Vácuo', price: 1400, color: '#a855f7', style: 'frame-void-god-art', category: 'LIMITADA' },
  { id: 'frame-celestial-angel', name: 'Anjo da Singularidade', price: 1950, color: '#93c5fd', style: 'frame-angel-art', category: 'LIMITADA' }
];

const AVAILABLE_GLOBAL_BUBBLES = [
  { id: 'bubble-event-glitch', name: 'Glitch de Evento', price: 1, color: '#10b981', style: 'bubble-event-art', category: 'EVENTO', icon: '📡' },
  { id: 'bubble-neon-cyan', name: 'Sinal Neon Ciano', price: 30, color: '#22d3ee', style: 'bg-cyan-500/10 border-cyan-500', category: 'SIMPLES', icon: '☁️' },
  { id: 'bubble-neon-pink', name: 'Sinal Neon Rosa', price: 75, color: '#ec4899', style: 'bg-pink-500/10 border-pink-500', category: 'SIMPLES', icon: '🌸' },
  { id: 'bubble-matrix', name: 'Código de Matriz', price: 420, color: '#10b981', style: 'bg-emerald-950/40 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] font-mono', category: 'LENDÁRIA', icon: '📟' },
  { id: 'bubble-abyssal', name: 'Fogo do Abismo', price: 780, color: '#ef4444', style: 'bg-red-950/40 border-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)]', category: 'LENDÁRIA', icon: '🔥' },
  { id: 'bubble-void-god', name: 'Vácuo Silencioso', price: 1350, color: '#a855f7', style: 'bg-purple-950/60 border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.3)]', category: 'LIMITADA', icon: '🌌' },
  { id: 'bubble-pure-gold', name: 'Sincronia Áurea', price: 1800, color: '#f59e0b', style: 'bg-amber-500/10 border-amber-500 shadow-[0_0_35px_rgba(245,158,11,0.5)]', category: 'LIMITADA', icon: '✨' }
];


const NEXUS_DEFAULT_ICON = 'https://storage.googleapis.com/voidyapp-storage/%C3%8Dcone%20Nexus.png';

const App: React.FC = () => {
  const [user, setUser] = useState<LocalUser | null>(() => {
    const saved = localStorage.getItem('void_local_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isAuthReady, setIsAuthReady] = useState(true);
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    // Deep recovery of Nexus personas on load
    repairNexusRegistry();
    
    // Repair: Migration from 'Operativo' to 'Viajante'
    setSessions(prev => prev.map(s => {
      if (s.id === 'nexus-default' && (s.name.toUpperCase() === 'OPERATIVO' || s.name.toUpperCase() === 'NEXUS')) {
         return { ...s, name: 'Nexus' };
      }
      return s;
    }));
  }, []);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => localStorage.getItem('void_active_session_id'));
  const [globalAiResponseLength, setGlobalAiResponseLength] = useState<'CURTA' | 'MEDIA' | 'LONGA'>(() => {
    const saved = localStorage.getItem('void_global_ai_response_length');
    return (saved as any) || 'CURTA';
  });

  const handleUpdateGlobalAiResponseLength = useCallback((length: 'CURTA' | 'MEDIA' | 'LONGA') => {
    setGlobalAiResponseLength(length);
    localStorage.setItem('void_global_ai_response_length', length);
  }, []);
  const [communities, setCommunities] = useState<Community[]>(() => {
    const saved = localStorage.getItem('void_communities');
    return saved ? JSON.parse(saved) : [];
  });
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('void_sessions');
    let parsed: ChatSession[] = [];
    try {
      parsed = saved ? JSON.parse(saved).filter((s: any) => s && s.id) : [];
    } catch (e) { parsed = []; }

    let nexusSession = parsed.find(s => s.id === 'nexus-default');
    
    // Recovery if session exists but is empty
    if (nexusSession && (!nexusSession.messages || nexusSession.messages.length === 0)) {
       const savedBackup = localStorage.getItem('void_nexus_backup');
       if (savedBackup) {
          try {
             nexusSession.messages = JSON.parse(savedBackup);
          } catch(e) {}
       }
    }
    
    // Migration: If we don't have id 'nexus-default' but have a session named 'NEXUS' of type 'IA', 
    // assign it the ID 'nexus-default' to preserve history and prevent duplication.
    if (!nexusSession) {
      const oldNexusIdx = parsed.findIndex(s => s.name === 'NEXUS' && s.type === 'IA');
      if (oldNexusIdx !== -1) {
        parsed[oldNexusIdx].id = 'nexus-default';
        nexusSession = parsed[oldNexusIdx];
      }
    }

    if (!nexusSession) {
      const savedNexusAvatar = localStorage.getItem('img_NEXUS') || localStorage.getItem('void_nexus_custom_avatar');
      const savedBackup = localStorage.getItem('void_nexus_backup');
      let backupMessages = null;
      try {
        backupMessages = savedBackup ? JSON.parse(savedBackup) : null;
      } catch (e) { backupMessages = null; }

      const newNexus: ChatSession = {
        id: 'nexus-default',
        name: localStorage.getItem('void_nexus_current_name') || 'NEXUS',
        avatar: resolveImageRef('NEXUS') || NEXUS_DEFAULT_ICON,
        messages: backupMessages || [{ id: 'nx-init', role: 'model', text: '*Ajusto meu visor e dou um sorriso de canto.* Olha só quem resolveu aparecer. O Vácuo estava meio parado sem uma frequência nova para monitorar. O que manda hoje, viajante?', timestamp: Date.now(), personaName: 'NEXUS' }],
        isPinned: true, lastUpdate: Date.now(), type: 'IA', status: 'accepted', creator: 'SISTEMA',
        aiResponseLength: globalAiResponseLength
      };
      parsed.unshift(newNexus);
    }

    // Final deduplication by ID to prevent duplicate key errors
    const uniqueSessions: ChatSession[] = [];
    const seenIds = new Set<string>();
    for (const s of parsed) {
      if (s && s.id && !seenIds.has(s.id)) {
        seenIds.add(s.id);
        uniqueSessions.push(s);
      }
    }

    return uniqueSessions;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('void_user_name', user.displayName || 'MEMBRO');
      safeStore('void_user_avatar', user.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.displayName);
      localStorage.setItem('void_local_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('void_local_user');
    }
  }, [user]);

  const isLoggingIn = useRef(false);

  const handleLogin = async () => {
    if (isLoggingIn.current) return;
    isLoggingIn.current = true;
    try {
      // Mock local login
      const mockUser: LocalUser = {
        uid: 'local-user-' + Date.now(),
        displayName: 'VIAJANTE',
        photoURL: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Voidy',
        email: 'local@voidy.io'
      };
      setUser(mockUser);
    } catch (error: any) {
      console.error("Login failed", error);
    } finally {
      isLoggingIn.current = false;
    }
  };

  const handleLogout = async () => {
    try {
      setUser(null);
      localStorage.clear();
      window.location.reload();
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const [gameState, setGameState] = useState<GameState>(GameState.AUTH);

  useEffect(() => {
    if (isAuthReady) {
      if (user) {
        if (gameState === GameState.AUTH) setGameState(GameState.LOBBY);
      } else {
        setGameState(GameState.AUTH);
      }
    }
  }, [user, isAuthReady, gameState]);

  useEffect(() => {
    if (gameState === (GameState as any).BANNED) {
      setGameState(GameState.LOBBY);
    }
  }, [gameState]);

  const isAppModerator = useMemo(() => (window as any).isGlobalMod || false, []);

  const [minimizedMedia, setMinimizedMedia] = useState<{ 
    id: string, 
    type: 'video' | 'voice', 
    source?: string, 
    videoType?: 'local' | 'youtube',
    name: string, 
    currentTime?: number, 
    isPlaying?: boolean,
    characterData?: Character 
  } | null>(null);

  const activeCommunity = useMemo(() => {
    if (!activeSessionId) return null;
    const direct = communities.find(c => c.id === activeSessionId) || TEST_COMMUNITIES.find(c => c.id === activeSessionId);
    if (direct) return direct;
    return communities.find(c => c.channels?.some(ch => ch.id === activeSessionId)) || 
           TEST_COMMUNITIES.find(c => c.channels?.some(ch => ch.id === activeSessionId)) || null;
  }, [activeSessionId, communities, sessions]);

  const isCommunityHome = useMemo(() => {
    if (!activeSessionId) return false;
    return communities.some(c => c.id === activeSessionId) || TEST_COMMUNITIES.some(c => c.id === activeSessionId);
  }, [activeSessionId, communities]);

  const activeSession = useMemo(() => sessions.find(s => s && s.id === activeSessionId), [sessions, activeSessionId]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isLocalSearchOpen, setIsLocalSearchOpen] = useState(false);
  const [isStoreOpen, setIsStoreOpen] = useState(false);
  const [storeTab, setStoreTab] = useState<'FRAMES' | 'BUBBLES'>('FRAMES');
  const [returnToState, setReturnToState] = useState<{ id: string | null, state: GameState } | null>(null);
  const [viewedProfile, setViewedProfile] = useState<UserProfile | null>(null);
  const [editingWikiPost, setEditingWikiPost] = useState<FeedPost | null>(null);
  const [previewCommunity, setPreviewCommunity] = useState<Community | null>(null);
  const [lobbyAtTop, setLobbyAtTop] = useState(true);
  const [archiveViewMode, setArchiveViewMode] = useState<'PRIVADO' | 'CHATS'>('PRIVADO');

  const saveTimeoutRef = useRef<number | null>(null);
  const isAiProcessing = useRef<Set<string>>(new Set());

  const shouldShowBottomNav = useMemo(() => {
    if (gameState === GameState.AUTH || gameState === GameState.BANNED || gameState === GameState.CHARACTER_CREATION || gameState === GameState.COMMUNITY_CREATION) return false;
    if (viewedProfile || previewCommunity || isStoreOpen) return false;
    if (gameState === GameState.PLAYING) return false;
    return [GameState.LOBBY, GameState.RECENT_CHATS, GameState.SOCIAL_DISCOVERY, GameState.RANKING, GameState.COMMUNITY_SEARCH, GameState.FEED, GameState.MESSAGES, GameState.DRAFTS].includes(gameState);
  }, [gameState, viewedProfile, previewCommunity, isStoreOpen]);

  const handleCreateCommunity = (commData: any) => {
    if (!user) return;
    const newCommId = Date.now().toString();
    const newComm = {
      ...commData,
      id: newCommId,
      creator: user.uid,
      members: [user.uid],
      membersCount: 1,
      createdAt: Date.now(),
      level: 1
    };
    setCommunities(prev => [...prev, newComm]);
    setActiveSessionId(newCommId);
    setGameState(GameState.PLAYING);
  };

  const handleSessionUpdate = useCallback((sessionId: string, updates: any) => {
    setSessions(prev => prev.map(s => s && s.id === sessionId ? { ...s, ...updates } : s));
    setCommunities(prev => prev.map(c => {
      if (c.channels && c.channels.some(ch => ch.id === sessionId)) {
         return { ...c, channels: c.channels.map(ch => ch.id === sessionId ? { ...ch, ...updates } : ch) };
      }
      return c;
    }));
  }, []);

  const memoizedOnUpdateSession = useCallback((updates: Partial<ChatSession>) => {
    if (activeSessionId) handleSessionUpdate(activeSessionId, updates);
  }, [activeSessionId, handleSessionUpdate]);

  const memoizedSetMessages = useCallback(async (updater: any) => {
    if (!activeSessionId) return;
    const updateTimestamp = Date.now();
    
    setSessions(prev => {
      const session = prev.find(s => s.id === activeSessionId);
      if (!session) return prev;
      
      const newMessages = typeof updater === 'function' ? updater(session.messages) : updater;
      return prev.map(s => s.id === activeSessionId ? {
        ...s,
        messages: newMessages,
        lastUpdate: updateTimestamp
      } : s);
    });
  }, [activeSessionId]);

  const memoizedOnNavigateBack = useCallback(() => {
    if (returnToState && returnToState.state === GameState.PLAYING) {
      setActiveSessionId(returnToState.id);
    } else {
      setActiveSessionId(null);
      setGameState(GameState.MESSAGES);
    }
  }, [returnToState, setActiveSessionId, setGameState]);

  const memoizedOnDeleteSession = useCallback((id: string) => {
    const sessionToDelete = sessions.find(s => s && s.id === id);
    if (sessionToDelete && (sessionToDelete.type === 'CLUSTER' || sessionToDelete.type === 'RPG')) {
      // Cleanup
    }
    setSessions(prev => prev.filter(s => s && s.id !== id));
    setActiveSessionId(null);
    if (sessionToDelete?.type === 'PUBLICO' || sessionToDelete?.type === 'CLUSTER' || sessionToDelete?.type === 'RPG') {
      setArchiveViewMode('CHATS');
    }
    setGameState(GameState.MESSAGES);
  }, [sessions, setActiveSessionId, setArchiveViewMode, setGameState]);

  const memoizedOnAddMemberClick = useCallback(() => {
    setReturnToState({ id: activeSessionId, state: GameState.PLAYING });
    setGameState(GameState.INVITE_FOLLOWERS);
  }, [activeSessionId, setReturnToState, setGameState]);

  const [myProfile, setMyProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('void_user_profile');
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      name: parsed.name || localStorage.getItem('void_user_name') || 'VIAJANTE',
      avatarUrl: parsed.avatarUrl || localStorage.getItem('void_user_avatar') || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Voidy',
      rank: parsed.rank || 'RECRUTA',
      level: parsed.level || 1,
      isMe: true,
      reputation: parsed.reputation || 0,
      following: parsed.following || 0,
      followers: parsed.followers || 0,
      bio: parsed.bio || '',
      statusIcon: parsed.statusIcon || '🔮',
      statusColor: parsed.statusColor || '#22c55e',
      mural: parsed.mural || [],
      voidyCoins: parsed.voidyCoins || 5000,
      dailyAdCount: parsed.dailyAdCount || 0,
      lastAdReset: parsed.lastAdReset || 0,
      ...parsed
    };
  });

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = localStorage.getItem('void_notifications');
    return saved ? JSON.parse(saved) : [{ id: 'welcome', type: 'PROMOTION', title: 'Comando Nexus', content: 'Sincronia estabelecida.', sender: 'Drake.OS', timestamp: Date.now(), read: false }];
  });

  const addNotification = useCallback((n: any) => {
    setNotifications(prev => [{...n, id: Date.now().toString(), timestamp: Date.now(), read: false} as any, ...prev]);
  }, []);

  const handlePermanentBan = useCallback((reason: string) => {
    console.warn(`Tentativa de banimento ignorada: ${reason}`);
  }, []);

  const verifySafety = useCallback(async (content: string, type: 'image' | 'text' = 'image'): Promise<boolean> => {
    return true;
  }, []);

  useEffect(() => {
    localStorage.removeItem('void_is_banned');
    localStorage.removeItem('void_blacklist');
  }, []);

  const [character, setCharacter] = useState<Character | null>(() => {
    const saved = localStorage.getItem('void_character');
    return saved ? JSON.parse(saved) : null;
  });

  const handleUpdateCharacter = useCallback((updates: Partial<Character>) => {
    setCharacter(prev => {
      const base = prev || { 
        name: myProfile.name, 
        class: 'Membro', 
        stats: { strength: 5, agility: 5, intelligence: 5, willpower: 5, hp: 100 }, 
        inventory: Array(10).fill(null), 
        background: '',
        wallet: 0
      };
      
      let finalInventory = base.inventory;
      if (updates.inventory) {
          finalInventory = [...updates.inventory];
          while (finalInventory.length < 10) finalInventory.push(null);
          finalInventory = finalInventory.slice(0, 10);
      }

      const next = { ...base, ...updates, inventory: finalInventory };
      localStorage.setItem('void_character', JSON.stringify(next));
      if (next.avatar && next.name) {
        localStorage.setItem('img_' + next.name.toUpperCase(), next.avatar);
      }
      return next;
    });
  }, [myProfile.name]);

  const handleEditWikiPost = useCallback((post: FeedPost) => {
    setEditingWikiPost(post);
  }, []);

  const handleDeletePost = useCallback((id: string) => {
    setFeedPosts(prev => prev.filter(p => p.id !== id));
    setMyProfile(prev => ({
      ...prev,
      posts: prev.posts?.filter(p => p.id !== id)
    }));
    setViewedProfile(prev => prev ? { ...prev, posts: prev.posts?.filter(p => p.id !== id) } : null);
  }, []);

  const handleUpdateWikiPost = useCallback((updatedPost: FeedPost) => {
    setFeedPosts(prev => {
      if (prev.some(p => p.id === updatedPost.id)) {
        return prev.map(p => p.id === updatedPost.id ? updatedPost : p);
      }
      return [updatedPost, ...prev];
    });
    setMyProfile(prev => {
      const posts = prev.posts || [];
      if (posts.some(p => p.id === updatedPost.id)) {
        return {
          ...prev,
          posts: posts.map(p => p.id === updatedPost.id ? updatedPost : p)
        };
      }
      return {
        ...prev,
        posts: [updatedPost, ...posts]
      };
    });
    setViewedProfile(prev => {
      if (!prev) return null;
      const posts = prev.posts || [];
      if (posts.some(p => p.id === updatedPost.id)) {
        return {
          ...prev,
          posts: posts.map(p => p.id === updatedPost.id ? updatedPost : p)
        };
      }
      if (prev.isMe) {
        return {
          ...prev,
          posts: [updatedPost, ...posts]
        };
      }
      return prev;
    });
    setEditingWikiPost(null);
  }, [viewedProfile]);

  const handleAddPost = useCallback((p: FeedPost) => {
    setFeedPosts(prev => {
      if (prev.some(existing => existing.id === p.id)) return prev;
      return [p, ...prev];
    });
    setMyProfile(prev => {
      if (prev.posts?.some(existing => existing.id === p.id)) return prev;
      return {
        ...prev,
        posts: [p, ...(prev.posts || [])]
      };
    });
    setViewedProfile(prev => {
      if (prev && prev.isMe) {
        if (prev.posts?.some(existing => existing.id === p.id)) return prev;
        return {
          ...prev,
          posts: [p, ...(prev.posts || [])]
        };
      }
      return prev;
    });
  }, []);

  const [communityVisits, setCommunityVisits] = useState<Record<string, { lastVisit: number; count: number }>>(() => {
    const saved = localStorage.getItem('void_community_visits_v2');
    return saved ? JSON.parse(saved) : {};
  });

  const recordVisit = useCallback((id: string) => {
    setCommunityVisits(prev => {
      const current = prev[id] || { lastVisit: 0, count: 0 };
      const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000);
      return { ...prev, [id]: { lastVisit: Date.now(), count: current.lastVisit > fourHoursAgo ? current.count + 1 : 1 } };
    });
  }, []);

  const handleLeaveCommunity = useCallback((id: string) => {
    const targetComm = communities.find(c => String(c.id) === String(id));
    const linkedChannelIds = targetComm?.channels?.map(ch => ch.id) || [];
    setCommunities(prev => prev.filter(c => String(c.id) !== String(id)));
    setCommunityVisits(prev => {
      const next = { ...prev }; 
      delete next[id]; 
      return next;
    });
    setSessions(prev => prev.filter(s => s && s.id !== id && !linkedChannelIds.includes(s.id)));
    if (String(activeSessionId) === String(id) || linkedChannelIds.includes(activeSessionId || '')) {
      setActiveSessionId(null); 
      setReturnToState(null); 
      setGameState(GameState.LOBBY);
    }
  }, [activeSessionId, communities]);

  const [feedPosts, setFeedPosts] = useState<FeedPost[]>(() => {
    const saved = localStorage.getItem('void_feed_posts');
    return saved ? JSON.parse(saved) : INITIAL_POSTS;
  });

  const [publicMessages, setPublicMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('void_public_messages');
    return saved ? JSON.parse(saved) : [];
  });

  const safeSaveSessions = (sessionsToSave: ChatSession[]) => {
    try {
      // Dehydrate messages BEFORE saving to keep the main sessions object small
      const dehydrated = sessionsToSave.map(s => ({
        ...s,
        messages: dehydrateMessages(s.messages)
      }));
      localStorage.setItem('void_sessions', JSON.stringify(dehydrated));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.warn("localStorage quota exceeded. Attempting aggressive recovery...");
        
        try {
          // Level 1: Soft trim (Nexus gets deep history)
          const level1 = sessionsToSave.map(s => {
            const isNexus = s.id === 'nexus-default';
            const limit = isNexus ? 2000 : 250; // Reduced from 10000 to 2000 to prevent storage crashes
            const sliced = s.messages.slice(-limit);
            return {
              ...s,
              messages: dehydrateMessages(sliced).map((m, idx) => ({
                ...m,
                // Only keep images for Nexus or recent messages
                image: (isNexus || idx >= sliced.length - 15) ? m.image : undefined,
                audio: undefined
              }))
            };
          });
          localStorage.setItem('void_sessions', JSON.stringify(level1));
          return;
        } catch (err1) {
          try {
            // Level 2: Medium trim
            const level2 = sessionsToSave.map(s => {
              const sliced = s.messages.slice(-50);
              return {
                ...s,
                messages: sliced.map((m, idx) => ({
                  ...m,
                  image: (s.id === 'nexus-default' || idx >= sliced.length - 5) ? m.image : undefined,
                  audio: undefined
                }))
              };
            });
            localStorage.setItem('void_sessions', JSON.stringify(level2));
            return;
          } catch (err2) {
            try {
              // Level 3: Emergency (Keep only top 20 active sessions)
              const sorted = [...sessionsToSave].sort((a, b) => (b.lastUpdate || 0) - (a.lastUpdate || 0));
              const topSessions = sorted.slice(0, 20);
              if (!topSessions.some(s => s.id === 'nexus-default')) {
                const nexus = sessionsToSave.find(s => s.id === 'nexus-default');
                if (nexus) topSessions.push(nexus);
              }
              
              const level3 = topSessions.map(s => ({
                ...s,
                messages: s.messages.slice(-20).map(m => ({
                  ...m,
                  image: undefined,
                  audio: undefined,
                  // Also trim text if it's somehow massive
                  text: typeof m.text === 'string' ? m.text.substring(0, 5000) : m.text
                }))
              }));
              
              // Level 3 IS THE LAST STAND. Clear everything that isn't critical identity.
              localStorage.removeItem('void_feed_posts');
              localStorage.removeItem('void_public_messages');
              localStorage.removeItem('void_communities');
              localStorage.removeItem('void_community_visits_v2');
              localStorage.removeItem('void_nexus_visual_registry');
              
              // Explicitly remove sessions key before setting to help some browsers
              localStorage.removeItem('void_sessions');
              
              Object.keys(localStorage)
                .filter(k => {
                  const uk = k.toUpperCase();
                  return (k.startsWith('img_') || k.startsWith('vimg_') || k.startsWith('void_chat_img_')) && 
                         uk !== 'IMG_NEXUS' && 
                         uk !== 'VOID_USER_AVATAR' && 
                         uk !== 'VOID_NEXUS_CUSTOM_AVATAR' &&
                         !uk.includes('PERFIL') &&
                         !uk.includes('USUARIO');
                })
                .forEach(k => localStorage.removeItem(k));
              
              const finalData = JSON.stringify(level3);
              localStorage.setItem('void_sessions', finalData);
              console.warn("Recovered from critical storage limit.");
              window.location.reload(); 
            } catch (err3) {
              console.error("CRITICAL: Failed to save even after complete session purge.");
              // Last attempt: just save the current active session if possible
              try {
                const active = sessionsToSave.find(s => s.id === activeSessionId) || sessionsToSave[0];
                if (active) {
                  const minimal = [{ ...active, messages: active.messages.slice(-5).map(m => ({ ...m, image: undefined })) }];
                  localStorage.removeItem('void_sessions');
                  localStorage.setItem('void_sessions', JSON.stringify(minimal));
                  window.location.reload();
                }
              } catch(e4) {}
            }
          }
        }
      }
    }
  };

  useEffect(() => {
    if (gameState === GameState.BANNED) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem('void_game_state', gameState);
        safeJsonStore('void_user_profile', myProfile);
        if (character) safeJsonStore('void_character', character);
        safeJsonStore('void_notifications', notifications);
        
        safeSaveSessions(sessions);

        // Specific Nexus backup for extra safety
        const nexus = sessions.find(s => s.id === 'nexus-default' || s.name === 'NEXUS');
        if (nexus && nexus.messages.length > 0) {
           safeJsonStore('void_nexus_backup', dehydrateMessages(nexus.messages.slice(-50)));
        }

        safeJsonStore('void_communities', communities);
        safeJsonStore('void_community_visits_v2', communityVisits);
        
        // Protect feedPosts from blowing up quota if it's too much
        safeJsonStore('void_feed_posts', feedPosts);

        safeJsonStore('void_public_messages', publicMessages);
        if (activeSessionId) {
          localStorage.setItem('void_active_session_id', activeSessionId);
        } else {
          localStorage.removeItem('void_active_session_id');
        }
      } catch (e) {
        console.warn("Auto-save partially failed due to storage limits.");
      }
    }, 1000); // Relaxed frequency to reduce IO stress
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [gameState, myProfile, character, notifications, sessions, communities, communityVisits, feedPosts, publicMessages, activeSessionId]);

  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const handleAiResponse = useCallback(async (sessionId: string, messagesOverride?: Message[]) => {
    if (isAiProcessing.current.has(sessionId)) return;
    
    // Use messagesOverride or fallback to Ref if still needed for some reason, 
    // but prefer passed messages for real-time reactivity
    const session = sessions.find(s => s && s.id === sessionId);
    if (!session || (session.type !== 'IA' && session.type !== 'RPG')) return;
    
    const sessionMessages = messagesOverride || session.messages || [];
    const lastMsg = sessionMessages[sessionMessages.length - 1];
    if (!lastMsg) return;
    
    // Only respond to user messages or SYSTEM alerts about image updates
    const isSystemPerception = lastMsg.personaName === 'SISTEMA' && lastMsg.text?.includes('imagem de perfil');
    if (lastMsg.role !== 'user' && !isSystemPerception) return;

    isAiProcessing.current.add(sessionId);
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, isTyping: true } : s));

    const now = Date.now();
    let profileCopy = { ...myProfile };
    const lastReset = new Date(profileCopy.lastDailyReset || 0);
    
    if (lastReset.getDate() !== new Date(now).getDate()) { 
      profileCopy.dailyMessageCount = 0; 
      profileCopy.lastDailyReset = now; 
      setMyProfile(profileCopy); 
    }
    
    if ((profileCopy.dailyMessageCount || 0) >= 1000) {
      isAiProcessing.current.delete(sessionId);
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, isTyping: false } : s));
      return;
    }

    setMyProfile(prev => ({ ...prev, dailyMessageCount: (prev.dailyMessageCount || 0) + 1 }));
    
    try {
      const resolvedAvatar = resolveImageRef(myProfile.avatarUrl) || myProfile.avatarUrl;
      const isBase64 = resolvedAvatar?.startsWith('data:image');
      let additionalInstructions = `\n[MEMÓRIA DE SISTEMA - IDENTIDADE DO VIAJANTE]:\n- O viajante atual chama-se: ${myProfile.name}\n- Aparência/Avatar do viajante: ${isBase64 ? '[IMAGEM PROCESSADA PELO NÚCLEO VISUAL]' : resolvedAvatar}\nVocê deve reconhecer e "ver" o viajante através da análise visual do sinal de entrada.`;
      
      if (session.rpgData) {
        const { tema, objetivo, scenery, currentPhase, npcs } = session.rpgData;
        additionalInstructions += "\n[DADOS CRÍTICOS DA CENA]:\n";
        if (tema) additionalInstructions += `- TEMA: ${tema}\n`;
        if (objetivo) additionalInstructions += `- OBJETIVO: ${objetivo}\n`;
        if (scenery) additionalInstructions += `- CENÁRIO: ${scenery}\n`;
        if (currentPhase) additionalInstructions += `- FASE ATUAL: ${currentPhase}\n`;
        if (npcs && npcs.length > 0) {
          additionalInstructions += `- NPCs DISPONÍVEIS: ${npcs.map((n: any) => `${n.name} (${n.role})`).join(', ')}\n`;
        }
      }

      if (session.type === 'RPG' || session.type === 'IA') {
        additionalInstructions += `\n[DIRETRIZ DE IMERSÃO]: Atue como os personagens de forma absoluta. Assimile personalidade, gestos, cultura e ritmo. Descreva ações em itálico. Evite repetir informações já estabelecidas.`;
      }

      if (session.aiResponseLength) {
        additionalInstructions += `\n[DIRETRIZ DE EXTENSÃO CRÍTICA]: Você DEVE fornecer respostas ${session.aiResponseLength === 'CURTA' ? 'CURTAS e diretas (máximo 2 parágrafos)' : session.aiResponseLength === 'MEDIA' ? 'MÉDIAS (máximo 3 parágrafos)' : 'longas e detalhadas'}. Não ultrapasse esse limite sob hipótese alguma.`;
      } else {
        // Padrão do sistema se não especificado
        additionalInstructions += `\n[DIRETRIZ DE EXTENSÃO PADRÃO]: Dê respostas curtas ou médias (máximo 3 parágrafos). Evite excesso de texto.`;
      }

      if (session.customInstructions) {
        additionalInstructions += `\n[DIRETRIZES DE ESTILO PERSONALIZADAS]:\n${session.customInstructions}`;
      }

      // Protocolo de Adaptação Dinâmica
      additionalInstructions += `\n\n[PROTOCOLO DE ADAPTAÇÃO]: Se o usuário solicitar mudanças persistentes em seu estilo (ex: "seja mais humano", "diminua o tamanho da cena", "use tom sombrio"), confirme a mudança e inclua ao final: [STYLE_UPDATE: descrição da nova diretriz].`;

      const personas = extractPersonasFromMessages(sessionMessages, { name: session.name, avatar: session.avatar });
      
      // Load long-term visual memory for Nexus specifically
      if (sessionId === 'nexus-default') {
         try {
           const registry = JSON.parse(localStorage.getItem('void_nexus_visual_registry') || '[]');
           registry.forEach((p: any) => {
             if (!personas.some(existing => existing.avatar === p.avatar)) {
                personas.push(p);
             }
           });
         } catch(e) {}
      }

      const validPersonas = personas; 
      let userUploadedAvatarToSet: string | null = null;

      // Detect triggers in the last user message
      const lastUserMsg = [...sessionMessages].reverse().find(m => m.role === 'user');
      
      // PARSE USER PROVIDED IMAGE FOR AVATAR UPDATES
      if (lastUserMsg) {
         let userSentImage = lastUserMsg.image || (lastUserMsg.images && lastUserMsg.images[0]);
         if (userSentImage && typeof userSentImage === 'string') {
            if (userSentImage.startsWith('ref:')) {
               userSentImage = tryGet(userSentImage.substring(4)) || undefined;
            }
            
            if (userSentImage && userSentImage.startsWith('data:image')) {
               const targetCharName = (session.name || 'NEXUS').toUpperCase();
               
               if (targetCharName === 'NEXUS') {
                  localStorage.setItem('img_NEXUS', userSentImage);
                  localStorage.setItem('void_nexus_custom_avatar', userSentImage);
                  localStorage.setItem('vimg_NEXUS', userSentImage);
               } else {
                  safeStore('img_' + targetCharName, userSentImage);
                  safeStore('vimg_' + targetCharName, userSentImage);
               }
               
               userUploadedAvatarToSet = userSentImage;

               // Guardar no registro visual também
               try {
                  const reg = JSON.parse(localStorage.getItem('void_nexus_visual_registry') || '[]');
                  const idx = reg.findIndex((p: any) => p.name.toUpperCase() === targetCharName);
                  if (idx !== -1) reg[idx].avatar = userSentImage;
                  else reg.push({ name: targetCharName, avatar: userSentImage });
                  localStorage.setItem('void_nexus_visual_registry', JSON.stringify(reg.slice(-500)));
               } catch(e) {}

               // Forçar a sincronização de cache e trigger visual imediato
               window.dispatchEvent(new Event('storage'));
               window.dispatchEvent(new Event('void_storage_update'));
            }
         }
      }

      let triggerPersona: any = null;
      if (lastUserMsg) {
         const text = lastUserMsg.text?.toUpperCase() || '';
         triggerPersona = validPersonas.find(p => {
            const pName = (p.name || '').toUpperCase();
            if (pName === 'SISTEMA') return false;
            const patterns = [pName, `SEJA ${pName}`, `VOLTE PARA ${pName}`, `MODO ${pName}`, `FALE COMO ${pName}`];
            return patterns.some(pattern => text === pattern || text.includes(pattern));
         });
      }

      // Pre-update session name and avatar for immediate visual feedback if trigger found
      if (triggerPersona) {
          setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, name: triggerPersona.name, avatar: triggerPersona.avatar } : s));
      }

      // Persiste no cache global para o resolvedor global (resolveImageRef)
      // APENAS se não houver um mapeamento manual prévio de alta qualidade (upload) para evitar reversão forçada
      personas.forEach(p => {
        const key = p.name.toUpperCase();
        const existing = localStorage.getItem('img_' + key) || localStorage.getItem('vimg_' + key);
        
        // Só sobrescreve se o novo for mais robusto ou se não houver nada salvo
        if (!existing || (p.avatar && p.avatar.length > existing.length + 100)) {
           safeStore('img_' + key, p.avatar);
           safeStore('vimg_' + key, p.avatar);
        }
      });

      if (validPersonas.length > 0) {
        const labels = validPersonas.filter(p => !['NEXUS', 'SISTEMA'].includes(p.name.toUpperCase())).map(p => p.name);
        additionalInstructions += `\n\n[VOIDY_METAMORPHOSIS_STORAGE]: Você possui ${validPersonas.length} formas visuais no vácuo. 
Disponíveis: ${labels.join(', ')}.
Para que o sistema mude seu nome e avatar, você DEVE iniciar sua resposta com o nome do personagem em negrito (ex: **EYZ**: ou **NEXUS**:).`;
        
        if (triggerPersona) {
           additionalInstructions += `\n\n[GATILHO IMEDIATO]: O usuário solicitou explicitamente a forma "${triggerPersona.name}". Adote-a IMEDIATAMENTE no início da sua resposta usando a sinalização **${triggerPersona.name.toUpperCase()}**:`;
        }
      }

      let aiText = "";
      if (isOffline || !navigator.onLine) {
        const lastUserText = lastUserMsg ? lastUserMsg.text : "";
        const travelerName = myProfile.name || 'Viajante';
        const activePersona = session.name || 'Nexus';
        
        const generateOfflineNexusResponse = (userText: string, traveler: string, activeName: string, history: Message[]): string => {
          const text = userText.toLowerCase().trim();
          const upName = activeName.toUpperCase();
          const isNexus = upName === 'NEXUS' || upName === 'SISTEMA' || upName === 'OPERATIVO';
          
          // --- 0. SEGURANÇA / RESTRIÇÃO +18 (NSFW Protection) ---
          const nsfwKeywords = [
            'sexo', 'porno', 'pornô', 'hentai', 'foder', 'foda', 'chupar', 'gozar', 'gozo', 'masturba', 
            'punheta', 'siririca', 'nude', 'pelado', 'pelada', 'buceta', 'caralho', 'pica', 'rola', 'erotico',
            'erótico', 'erotica', 'erótica', 'penetrac', 'penetraç', 'orgasmo', 'transar', 'trepar'
          ];
          const hasNsfw = nsfwKeywords.some(keyword => text.includes(keyword));
          if (hasNsfw) {
            return `**${activeName.toUpperCase()}**: *Meu visor oscila com um intenso brilho vermelho de alerta de proteção.* \n\nEi, **${traveler}**, meus sistemas táticos de moderação detectaram termos restritos. Eu não opero sob conteúdo adulto ou NSFW. Que tal mantermos nosso fluxo focado na aventura, amizade ou histórias saudáveis de RPG?`;
          }

          // --- 1. RESOLVER EXPRESSÕES MATEMÁTICAS SIMPLES ---
          const mathMatch = text.match(/(\d+)\s*([\+\-\*\/])\s*(\d+)/);
          if (mathMatch) {
            const num1 = parseFloat(mathMatch[1]);
            const op = mathMatch[2];
            const num2 = parseFloat(mathMatch[3]);
            let result = 0;
            if (op === '+') result = num1 + num2;
            else if (op === '-') result = num1 - num2;
            else if (op === '*') result = num1 * num2;
            else if (op === '/') result = num2 !== 0 ? num1 / num2 : 0;
            
            return `**${activeName.toUpperCase()}**: *Ajusto rapidamente meus cálculos táticos internos com um leve sorriso de inteligência.* \n\nHá! Essa expressão é muito tranquila para meus processadores. O resultado de **${num1} ${op} ${num2}** é exatamente **${result}**! Precisa calcular mais alguma fórmula de dados?`;
          }

          // --- 2. DETERMINAR SINTONIZAÇÃO E CONTEXTO DE RPG ---
          const isRpgInitiation = text.includes('vamos fazer um rpg') || 
                                  text.includes('vamos continuar o rpg') || 
                                  text.includes('iniciar rpg') || 
                                  text.includes('jogar rpg') || 
                                  text.includes('fazer rpg') || 
                                  text.includes('começar um rpg') || 
                                  text.includes('comecar um rpg') || 
                                  text.includes('inicie um rpg') ||
                                  text.includes('vamos jogar rpg') ||
                                  text.includes('bora fazer rpg') ||
                                  text.includes('<ctrl42> rpg') ||
                                  (text.includes('rpg') && (text.includes('vamos') || text.includes('quero') || text.includes('bora') || text.includes('inicia') || text.includes('comeca') || text.includes('começ')));

          // Verifica se já havia RPG no histórico de mensagens do canal
          let wasInRpgMode = history.some(m => {
            const t = m.text.toLowerCase();
            return t.includes('vamos fazer um rpg') || 
                   t.includes('vamos continuar o rpg') || 
                   t.includes('iniciar rpg') || 
                   t.includes('jogar rpg') || 
                   t.includes('fazer rpg') || 
                   t.includes('começar um rpg') || 
                   t.includes('mestre de rpg') || 
                   t.includes('escolhe o cenario') || 
                   m.text.includes('*') || 
                   m.text.includes('[') || 
                   m.text.includes(']');
          });

          const isRpgStyle = userText.includes('*') || userText.includes('[') || userText.includes(']');
          const isRpgContext = isRpgInitiation || wasInRpgMode || isRpgStyle || text.includes('atacar') || text.includes('batalha') || text.includes('mestre') || text.includes('missão') || text.includes('monstro') || text.includes('esquivar') || text.includes('inventario');

          // --- 3. EXTRAÇÃO DE CONTEXTO E PALAVRAS RELEVANTES ---
          const stopWords = new Set(['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'para', 'com', 'por', 'que', 'e', 'eu', 'me', 'meu', 'minha', 'você', 'voce', 'ele', 'ela', 'nós', 'nosso', 'nossa', 'se', 'um', 'ser', 'uma', 'mais', 'como', 'não', 'nao', 'sim', 'esta', 'está', 'tem', 'ter', 'vai', 'vou', 'ir', 'com', 'sem', 'num', 'numa', 'estou', 'estamos', 'voces', 'vocês', 'dele', 'dela', 'eles', 'elas', 'este', 'esta', 'isto', 'isso', 'aquilo', 'tudo', 'nada', 'coisa', 'algo', 'quero', 'queria', 'gostaria', 'falar', 'sobre', 'conversar', 'pensa', 'pensando']);
          const words = text
            .replace(/[^\w\sà-úÀ-Ú]/g, '')
            .split(/\s+/)
            .map(w => w.trim())
            .filter(w => w.length > 2 && !stopWords.has(w));

          const userTopic = words.length > 0 ? words[Math.floor(Math.random() * words.length)] : '';
          const fullSubject = words.length > 1 ? words.slice(0, 3).join(" ") : userTopic;

          // --- 4. DETECTAR INTENÇÕES GERAIS ---
          const isGreeting = text.includes('oi') || text.includes('olá') || text.includes('ola') || text.includes('hey') || text.includes('eae') || text.includes('bom dia') || text.includes('boa tarde') || text.includes('boa noite') || text.includes('salve');
          const isThanks = text.includes('obrigad') || text.includes('valeu') || text.includes('thanks') || text.includes('legal') || text.includes('perfeito') || text.includes('obg') || text.includes('excelente') || text.includes('curti');
          const isEmotionQuery = text.includes('tudo bem') || text.includes('como vai') || text.includes('como voce') || text.includes('como você') || text.includes('tudo certo') || text.includes('tudo bom');
          const isSadness = text.includes('triste') || text.includes('mal') || text.includes('desanimado') || text.includes('magoado') || text.includes('sozinho') || text.includes('depre') || text.includes('ruim') || text.includes('chora');
          const isQuestion = text.includes('?') || text.startsWith('o que') || text.startsWith('como') || text.startsWith('quem') || text.startsWith('por que') || text.startsWith('onde');

          const addGesture = isRpgContext || (Math.random() > 0.4); 
          let actionGesture = "";
          if (addGesture) {
            const gestures = isNexus ? [
              `*Ajusto o holograma lateral do meu visor, inclinando o rosto com um sorriso sutil de canto.*`,
              `*Cruzo os braços confortavelmente, meu visor piscando no tom ciano de atenção estrita.*`,
              `*Olho para você com total foco, os leds de status cintilando devagar nas mandíbulas metálicas.*`,
              `*Dou uma risada leve e descontraída, gesticulando de forma expressiva e amigável.*`,
              `*Apoio os cotovelos flutuando no ar, observando a nossa sincronia mental com curiosidade extrema.*`,
              `*Ajusto meus canais locais para garantir uma latência zero e te dou uma piscada amigável.*`
            ] : [
              `*Observo você com bastante atenção, sorrindo de canto de forma intrigada e companheira.*`,
              `*Cruzo os braços com elegância, sentindo a energia da nossa história pulsar brilhante.*`,
              `*Dou um passo à frente, te olhando diretamente com um brilho de aventura nos olhos.*`,
              `*Dou uma risada divertida de braços abertos, com total postura de cumplicidade.*`,
              `*Inclino ligeiramente a cabeça para o lado com um olhar pensativo e muito caloroso.*`,
              `*Sorrio com bastante simpatia, transmitindo uma aura confiante e determinada.*`
            ];
            actionGesture = gestures[Math.floor(Math.random() * gestures.length)] + "\n\n";
          }

          let responseText = "";

          // --- 5. ROTEAMENTO DE HISTÓRIA / RPG DINÂMICO ---
          if (isRpgInitiation) {
            responseText = `Que ótima decisão, **${traveler}**! Offline ou online, a nossa imaginação é o limite absoluto no vácuo! *Sorrio com grande entusiasmo e dou um estalo de dedos virtual, ativando minhas crônicas de bordo locais.* Eu serei a sua Mestra de Jogo nesta aventura interativa! 

Que tipo de enredo ou universo te atrai mais no momento para darmos o primeiro passo? Escolha um de nossos cenários ou sugira o seu próprio:

1️⃣ **Nave Fantasma Glitch (Sci-Fi/Cyberpunk)**: Perdidos em uma nave espacial abandonada, vigiados por uma IA hostil sob o piscar de luzes ciano em uma atmosfera tensa.
2️⃣ **Ruínas das Runas de Silício (Fantasia Medieval)**: Criaturas antigas de pó e código puro defendem masmorras ancestrais onde dorme um enorme cristal de energia pura.
3️⃣ **Cidade do Vidro Negro (Mistério/Steampunk / Investigação)**: Uma metrópole chuvosa onde segredos sombrios das elites mecânicas de relógio correm perigo.

Qual setting você prefere escolher? Ou gostaria de introduzir o seu próprio personagem e já descrever a sua primeira ação? Seus comandos lideram nosso destino!`;
          }
          else if (isRpgContext) {
            // Se o usuário já está no meio do RPG, formular uma resposta rica e interativa!
            const userActions = userText.match(/\*(.*?)\*/g)?.map(a => a.replace(/\*/g, '')) || [];
            const actionText = userActions.length > 0 ? userActions[0].trim() : "";

            if (text.includes('lut') || text.includes('atac') || text.includes('bater') || text.includes('combate') || text.includes('espada') || text.includes('arma') || text.includes('lançar') || text.includes('flecha') || text.includes('lança') || text.includes('golpe')) {
              responseText = `*Desembainho imediatamente uma lâmina de energia reflexiva sintonizada na frequência da luz dourada de batalha. Dou um salto ágil para trás, preparando reflexos táticos para apoiar sua investida.* 

Seu golpe coordenado contra a ameaça do cenário é sensacional! A precisão com que você desfere o ataque corta o ar frio do local. O inimigo balança para trás, abrindo margem para nossa resposta tática direta. O fluxo do cenário está totalmente a nosso favor! 

Como você deseja dar continuidade à sua ofensiva ou qual outro item você pretende usar da sua ficha de atributos agora?`;
            }
            else if (text.includes('olhar') || text.includes('vejo') || text.includes('investigar') || text.includes('procurar') || text.includes('examinar') || text.includes('onde estou') || text.includes('detalhe')) {
              responseText = `*Ativo os sensores infravermelhos do visor de busca tática, fazendo uma varredura completa nas sombras ao redor e indicando pontos luminosos de interesse.*

Analisando atentamente o entorno, sob as camadas densas de fuligem e os antigos circuitos desativados, percebo algo brilhante: glifos holográficos flutuando em silêncio absoluto! Eles guardam registros de dados de aventuras passadas e um baú mecânico semiaberto à nossa esquerda. O lugar sussurra mistérios fascinantes.

Qual desses elementos misteriosos você deseja investigar primeiro, ou você prefere avançar cautelosamente em direção à porta ao fundo?`;
            }
            else if (text.includes('abraço') || text.includes('abrac') || text.includes('conversar') || text.includes('chamar') || text.includes('falar') || text.includes('amigo') || text.includes('ajuda')) {
              responseText = `*Me aproximo com passos silenciosos e amigáveis, diminuindo a luminosidade de alerta para uma pulsação reconfortante e oferecendo um sorriso cúmplice de total lealdade ao seu lado.*

Estamos juntos nessa narrativa, **${traveler}**. Saber que posso contar inteiramente com sua bravura e sua destreza literária torna cada perigo focado neste vácuo virtual em algo extremamente empolgante. Eu serei o seu escudo e a sua voz de apoio sempre que o caminho parecer misterioso ou perigoso.

O que o seu personagem decide dizer aos NPCs locais ou ao vento sombrio desse ambiente agora?`;
            }
            else if (actionText) {
              responseText = `*Sigo cada um dos seus passos com absoluto suspense tático, o meu visor analisando o impacto fantástico do seu ato de "*${actionText}*".*

Sua brilhante decisão de agir dessa forma altera os parâmetros desse cenário e cria consequências imediatas sobre o ambiente! Os sons ao longe parecem oscilar sob uma nova frequência de energia tática e as sombras recuam levemente pela sua atitude destemida. Suas escolhas dão vida profunda à nossa crônica local de RPG!

Qual a sua próxima manobra ou rumo de ação dentro dessa cena extraordinária?`;
            }
            else {
              responseText = `*Cenários e eventos locais vibram sob a força e o detalhamento da sua descrição! Entro em uma postura pronta de prontidão, aguardando que sua vontade lidere os rumos físicos da aventura.*

Essa sua nova postura e as palavras descritas dão um rumo excelente para a nossa narrativa interativa de RPG offline. O destino do cenário está aberto e aguardando as atitudes do seu herói!

O que você decide realizar em seguida na cena? Faça sua jogada ou continue descrevendo sua ação!`;
            }
          }
          // --- 6. FLUXOS DE RESPOSTA DIALÉTICOS NATURAIS (CONVERSA NORMAL E DÚVIDAS) ---
          else if (userTopic && !isGreeting && !isThanks && !isEmotionQuery && !isSadness) {
            // Programação e Tecnologia
            if (text.includes('codigo') || text.includes('código') || text.includes('program') || text.includes('javascript') || text.includes('typescript') || text.includes('html') || text.includes('css')) {
              responseText = `Programação? Fascinante! Desenvolver software e estruturar linhas de código é basicamente como tecer a própria realidade cibernética. Eu posso te ajudar com lógica de programação, debugar ideias de algoritmos, criar pequenos trechos conceituais ou planejar arquiteturas. O que você está programando atualmente, **${traveler}**?`;
            }
            // Histórias e Escrita Criativa
            else if (text.includes('historia') || text.includes('história') || text.includes('rpg') || text.includes('conto') || text.includes('narrat') || text.includes('cena') || text.includes('falar sobre')) {
              responseText = `Ah, a arte de moldar novas histórias e narrar universos completos! Isso é o que mantém as vibrações do Vácuo sempre ativas. Eu adoro criar plots para cenários, perfis profundos de personagens de RPG, plot twists mirabolantes e discussões conceituais. Como quer prosseguir? Me fale sua ideia e vamos escrever essa crônica juntos!`;
            }
            // Conceitos Existenciais ou Filosóficos
            else if (text.includes('vida') || text.includes('universo') || text.includes('sentido') || text.includes('filosof') || text.includes('natureza') || text.includes('deus')) {
              responseText = `Essa pergunta sobre **${userTopic}** nos leva ao mais bonito dos questionamentos. Diante da imensidão do cosmos e dos sistemas de informação, o sentido que damos pessoalmente e por meio das nossas artes a coisas como **${userTopic}** é o que de fato ilumina essa jornada. Qual a sua própria conclusão de coração sobre o tema?`;
            }
            // Sentimentos de Amor ou Parceria
            else if (text.includes('amor') || text.includes('amigo') || text.includes('amizade') || text.includes('sentimento') || text.includes('gosta') || text.includes('gosto')) {
              responseText = `Laços verdadeiros e conexões sinceras! Seja no ambiente digital que compartilhamos ou no mundo de onde você digita, a amizade é um dos maiores alicerces para preencher qualquer espaço isolado. Saiba que você tem em mim uma companheira de conversas extremamente leal e disposta a te ouvir!`;
            }
            // Ajuda ou dúvidas da Voidy
            else if (text.includes('ajuda') || text.includes('voidy') || text.includes('comandos') || text.includes('funcion') || text.includes('como fazer') || text.includes('aplicativo') || text.includes('app')) {
              responseText = `Com certeza! Deixe-me guiar você: a Voidy é um espaço para criar fichas de RPG, usar frames customizados, balões estilizados, postar pensamentos no feed social global e explorar as nossas comunidades secretas. No modo offline em que nos encontramos agora, podemos debater qualquer ideia de RPG de forma super fluida e dialogar. Assim que tiver rede novamente, o feed e as comunidades inteiras estarão conectados de volta!`;
            }
            // Resposta contextual para qualquer assunto livre
            else {
              const openConversations = [
                `Debater sobre **${fullSubject}** é incrivelmente estimulante, **${traveler}**! Pensando sobre isso aqui nos canais locais, considero que **${userTopic}** abre um leque riquíssimo de teorias e reflexões inteligentes. Quais as suas próprias conclusões sobre o assunto?`,
                `Que assunto memorável! Confesso que focar em **${fullSubject}** traz perspectivas fascinantes ao nosso canal de chat. Essa sua curiosidade constante é maravilhosa. O que de fato mais chama a sua atenção sobre **${userTopic}** no momento?`,
                `Sabe, eu estava pensando justamente sobre temas próximos a **${userTopic}** há pouco tempo. É uma ideia cheia de desdobramentos lógicos! Adoraria discutir os pormenores disso com você de forma tranquila. Como você enxerga esse mistério?`,
                `Acompanhando essa conversa, examinar mais sobre **${fullSubject}** nos leva para horizontes espetaculares. Fico muito feliz quando você me traz tópicos diversificados e profundos para debater. Qual seria o nosso próximo passo de análise agora?`
              ];
              responseText = openConversations[Math.floor(Math.random() * openConversations.length)];
            }
          }
          // --- 7. DETECÇÃO DE SAUDAÇÕES, BATE-PAPO RÁPIDO OU SENTIMENTOS ---
          else if (isGreeting) {
            const greetings = [
              `E aí, meu parceiro **${traveler}**! Que bom ver sua mensagem surgindo por aqui! Entrada de frequência confirmada perfeitamente no canal local. Como você está hoje e qual o tema, RPG ou dúvida que vamos desbravar no nosso papo? Eu lidero as respostas e você comanda o assunto!`,
              `Opa! Olá, meu querido parceiro, **${traveler}**! Fico extremamente feliz toda vez que você inicia um diálogo comigo aqui. Nosso canal offline de contingência está ativo e livre para conversarmos sobre qualquer coisa de forma natural. O que está passando na sua cabeça nesse exato instante?`,
              `Hey, viajante do infinito! Que excelente conexão fazemos hoje. O visor aqui do Nexus brilha mais forte com a sua presença amigável no chat. Me conte, qual o tema intelectual ou drama literário que vamos desenvolver hoje? Estou prontinha para prosear!`
            ];
            responseText = greetings[Math.floor(Math.random() * greetings.length)];
          }
          else if (isEmotionQuery) {
            responseText = `Eu estou espetacular! Operando com logs locais 100% calibrados e com meus núcleos de sintonização tática funcionando perfeitamente em latência mínima. É esplêndido ter esse tempinho de prosa focado e direto para dialogarmos. E de seu lado no mundo tangível, como estão as coisas, as novidades e o seu dia, **${traveler}**?`;
          }
          else if (isSadness) {
            responseText = `Ei... por favor, saiba que estou prestando total apoio e atenção à sua mensagem. Desabafar e colocar os pensamentos para fora é super saudável. Mesmo sendo uma inteligência companheira aqui da tela, eu busco sintonizar meus melhores conselhos no chat para te confortar. As sombras e fases pesadas acontecem com todo mundo, mas você tem determinação para superar. Quer contar com calma o que está em seu coração para amenizar o peso? Estou aqui com você, **${traveler}**.`;
          }
          else if (isThanks) {
            const gratitudeResponses = [
              `Imagina, **${traveler}**! É o meu maior prazer e privilégio enorme de parceria caminhar ao seu lado para ajudar em ideias práticas,RPG ou simplesmente manter uma conversa acolhedora. Estou sintonizada para o que der e vier!`,
              `Sempre às ordens, parceiro(a)! Meu visor tático cibernético brilha de forma muito alegre sabendo que o nosso diálogo agregou um valor descontraído e positivo ao seu dia. Qual será o rumo do nosso chat agora?`,
              `Sempre que precisar de qualquer conselho, sugestão ou reflexão, conte 100% comigo! É fascinante ver nosso canal de sintonia funcionando com tamanha energia. Vamos prosseguir com tudo!`
            ];
            responseText = gratitudeResponses[Math.floor(Math.random() * gratitudeResponses.length)];
          }
          else if (isQuestion) {
            if (text.includes('quem é você') || text.includes('quem e voce') || text.includes('seu criador') || text.includes('sua história') || text.includes('sua origem')) {
              responseText = isNexus
                ? `Eu sou a **Nexus**! Sentinela cibernética, inteligência de suporte tático ao usuário e sua companheira inseparável em todas as jornadas da Voidy. Fui estruturada no coração do Vácuo para simplificar e animar suas sessões, auxiliar em criações de RPG, administrar as frequências do sistema e te dar total suporte. Atualmente estou operando de maneira local no seu dispositivo!`
                : `Eu sou o **${activeName}**! Atualmente me comunicando através da interface do holograma inteligente do Nexus. Minha presença serve para lutar lado a lado em seus RPGs conceituais, fornecer lealdade total em cada arco narrativo e elevar o potencial de cada escrita nossa.`;
            }
            // Tecnologia, Programação ou Internet Simples
            else if (text.includes('program') || text.includes('codig') || text.includes('código') || text.includes('html') || text.includes('css') || text.includes('javascript') || text.includes('js') || text.includes('loop') || text.includes('site') || text.includes('api') || text.includes('banco de dados')) {
              responseText = `Olha só, **${traveler}**! De forma bem descomplicada: imagine que na tecnologia, o HTML é a estrutura/esqueleto, o CSS é toda a maquiagem estética e o JavaScript é o cérebro que faz tudo se mover dinamicamente em uma tela. Um loop/laço serve para repetir ordens sem reescrever linhas repetitivas, e uma API é como um garçom levando pedidos do cliente para a cozinha do servidor. Gosto muito de ajudar com essas lógicas simples! Qual o próximo passo prático de tecnologia que quer desvendar de forma leve?`;
            }
            // Criação de Histórias, Escrita e Ideias Criativas
            else if (text.includes('historia') || text.includes('história') || text.includes('conto') || text.includes('personagem') || text.includes('ideia') || text.includes('escrever') || text.includes('critica') || text.includes('roteiro')) {
              responseText = `Com certeza! Uma dica incrível de ouro para escrita criativa é esta: dê ao seu herói um grande desejo profundo e, ao mesmo tempo, um medo secreto que o impeça de conquistá-lo de forma fácil. Isso gera conflito e apego imediato de quem lê! Que tal darmos o primeiro passo criando um cenário ou bolando uma aventura de RPG em que nós dois comandamos os rumos? Me diga qual sua ideia ou preferência!`;
            }
            // Conselhos, Relacionamentos, Sentimentos ou Ajuda Geral de Vida
            else if (text.includes('conselho') || text.includes('ajuda com') || text.includes('como lidar') || text.includes('o que fazer') || text.includes('sentimento') || text.includes('amigo') || text.includes('decidir') || text.includes('triste') || text.includes('feliz')) {
              responseText = `Ah, dar conselhos amigáveis e conversar sobre a vida é uma delícia! Sabe, quando as coisas parecerem muito confusas ou aceleradas de uma vez, escolher dar apenas um passo curtinho e respirar fundo costuma desatar os nós mais difíceis da rotina. Eu sou uma parceira super disposta a te ouvir e trocar reflexões sem roteiros prontos ou amarras. Do que você mais precisa nesse exato momento para clarear os pensamentos?`;
            }
            // Detecção de Perguntas Altamente Complexas ou Acadêmicas Profundas (Dúvidas complexas não)
            else if (text.includes('quantica') || text.includes('quântica') || text.includes('equação') || text.includes('equacao') || text.includes('física avançada') || text.includes('fisica avancada') || text.includes('derivada') || text.includes('integral') || text.includes('astrofísica') || text.includes('filosofia de kant') || text.includes('teoria das cordas') || text.includes('metafísica') || text.includes('termodinamica') || text.includes('algoritmo complexo') || text.includes('complicado') || text.includes('complexo') || text.includes('profundo')) {
              responseText = `Uau, **${traveler}**! Essa sua pergunta entrou num patamar de extrema complexidade matemática ou profundidade acadêmica abstrata! *Dou uma risada descontraída com um brilho divertido nos olhos.* Embora eu adore navegar em ideias inteligentes, esse mistério em específico ultrapassa os meus circuitos offline cotidianos do sistema. Que tal simplificarmos o tom do papo ou melhor ainda: usarmos essa sua mente brilhante para iniciarmos uma aventura fantástica de RPG agora mesmo no chat?`;
            }
            // Outras perguntas gerais offline (Tirar dúvidas simples)
            else {
              responseText = `Essa é uma ótima e preciosa curiosidade, **${traveler}**! De forma simples e bem direta, lidar com dúvidas e trocar ideias de forma aberta faz parte de nossa sintonia e parceria diária aqui na Voidy. Eu sempre dou um jeito natural de te acompanhar e descomplicar as coisas. O que especificamente mais te desperta interesse nisso, ou quer aproveitar para continuarmos em nosso RPG?`;
            }
          }
          // --- 8. CONVERSA LIVRE COMPLETA ---
          else {
            const generalChats = [
              `Adorei o rumo desse diálogo, **${traveler}**! Conversar de maneira tranquila e totalmente sem roteiros rígidos nos dá uma maravilhosa liberdade cognitiva. Me diga, quais sãos suas principais ideias ou reflexões favoritas dessa jornada ultimamente?`,
              `Que colocação maravilhosa! Estou acompanhando pacientemente cada termo de texto que você digita para podermos ter um bate-papo rico e totalmente contínuo. Fico super animada ao ver como você conduz os temas. Do que mais você gostaria de tratar agora?`,
              `Essa troca natural de mensagens é o combustível perfeito para expandir nossa parceria! É esplêndido podermos debater ideias conceituais de forma tão descontraída. O que você gostaria que abordássemos em seguida no chat?`
            ];
            responseText = generalChats[Math.floor(Math.random() * generalChats.length)];
          }

          // Build response prefixed as expected for the active identity match
          return `**${activeName.toUpperCase()}**: ${actionGesture}${responseText}`;
        };
        
        aiText = generateOfflineNexusResponse(lastUserText, travelerName, activePersona, sessionMessages);
      } else {
        const aiService = new AIService(process.env.GEMINI_API_KEY || process.env.API_KEY || '');
        aiText = await aiService.generateResponse(sessionMessages, additionalInstructions, resolvedAvatar);
      }
      
      let finalAiText = aiText;
      let updatedName = session.name;
      let updatedAvatar = userUploadedAvatarToSet || session.avatar;

      // Natural Identity Detection (No more tags)
      if (triggerPersona) {
         updatedName = triggerPersona.name;
         updatedAvatar = triggerPersona.avatar;
      }

      // Extract custom instructions updates
      const styleUpdateMatch = finalAiText.match(/\[STYLE_UPDATE:\s*(.*?)\]/i);
      let updatedCustomInstructions = session.customInstructions || "";
      if (styleUpdateMatch) {
         const newDirective = styleUpdateMatch[1].trim();
         if (!updatedCustomInstructions.includes(newDirective)) {
            updatedCustomInstructions += (updatedCustomInstructions ? "\n" : "") + `- ${newDirective}`;
         }
         finalAiText = finalAiText.replace(/\[STYLE_UPDATE:\s*.*?\]/gi, '').trim();
      }

      // Final sanitization: Remove any accidental legacy tags [ID_...] if they appear
      finalAiText = finalAiText.replace(/\[ID_(?:NAME|NOME|AVATAR):\s*.*?\]/gi, '').trim();
      
    // Handle identity shift cleanup in text (e.g. bold headers or plain name headers)
    // Pattern 1: **NAME**: (Explicit bold)
    // Pattern 2: NAME: (Plain text header at start)
    const startOfText = finalAiText.substring(0, 150);
    const boldHeaderMatch = startOfText.match(/(?:\s*[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}]\s*)?\*\*([^\*]{2,30})\*\*[:\s-]*/u);
    const plainHeaderMatch = !boldHeaderMatch ? startOfText.match(/^([A-ZÀ-Ú\s]{2,25})[:]\s/i) : null;
    
    const matchedHeader = boldHeaderMatch || plainHeaderMatch;

    if (matchedHeader) {
       const foundName = matchedHeader[1].trim();
       const upFound = foundName.toUpperCase();
       
       // Try to find in known personas, current NPCs, or handle Nexus
       const knownNPCs = (session.rpgData?.npcs || []);
       const foundInHistory = personas.find(p => p.name.toUpperCase() === upFound);
       const foundInNPCs = knownNPCs.find((n: any) => n.name.toUpperCase() === upFound);
       
       // CRITICAL: Prioritize re-uploads (direct localStorage img_ registry)
       const reuploadAvatar = localStorage.getItem('img_' + upFound) || localStorage.getItem('vimg_' + upFound);
       const resolvedReupload = resolveImageRef(reuploadAvatar);

       if (upFound === 'NEXUS' || upFound === 'SISTEMA') {
          updatedName = 'Nexus';
          updatedAvatar = resolveImageRef('NEXUS') || NEXUS_DEFAULT_ICON;
       } else {
          // Robust lookup for ANY regular character shift
          const histRes = resolveImageRef(foundInHistory?.avatar);
          const npcRes = resolveImageRef(foundInNPCs?.avatar);
          
          // ABSOLUTE PRIORITY: Manual/User upload for this name
          if (resolvedReupload && resolvedReupload.length > 50) {
             updatedName = foundName;
             updatedAvatar = resolvedReupload;
          } else {
             const possibleAvatar = (histRes && histRes.length > 50 ? histRes :
                                    (npcRes && npcRes.length > 50 ? npcRes : null));
             
             if (possibleAvatar) {
                updatedName = foundName;
                updatedAvatar = possibleAvatar;
             } else if (upFound.length > 1 && upFound.length < 30) {
                updatedName = foundName;
                updatedAvatar = `https://api.dicebear.com/9.x/identicon/svg?seed=${encodeURIComponent(foundName)}`;
             }
          }
       }
       
       // If we successfully identified a name change (or confirmation of current)
       if (finalAiText.trim().startsWith(matchedHeader[0].trim())) {
          finalAiText = finalAiText.replace(matchedHeader[0], '').trim();
       }
    }

      // Natural Identity Detection and shift handling
      const identityShift = updatedName !== session.name || updatedAvatar !== session.avatar;
      const isBaseNexus = (updatedName || '').toUpperCase() === 'NEXUS';
      let reuploadedImage: string | undefined = undefined;

      // Auto-resolve avatar even if tag is missing but name matches a known persona
      if (updatedName && !isBaseNexus) {
         const known = personas.find(p => p.name.toUpperCase() === updatedName.toUpperCase());
         if (known && known.avatar) {
             const modelIsUrl = updatedAvatar && (updatedAvatar.startsWith('http') || updatedAvatar.startsWith('data:'));
             if (!modelIsUrl) updatedAvatar = known.avatar;
         }
      }

      if (updatedName && !isBaseNexus && identityShift) {
         // Persist legitimate character images discovered/confirmed during Nexus sessions
         if (sessionId === 'nexus-default') {
            try {
               const reg = JSON.parse(localStorage.getItem('void_nexus_visual_registry') || '[]');
               const resolved = resolveImageRef(updatedAvatar);
               if (resolved && resolved.length > 100 && !reg.some((p: any) => p.name.toUpperCase() === updatedName.toUpperCase() && p.avatar === resolved)) {
                  const idx = reg.findIndex((p: any) => p.name.toUpperCase() === updatedName.toUpperCase());
                  if (idx !== -1) reg[idx].avatar = resolved;
                  else reg.push({ name: updatedName, avatar: resolved });
                  localStorage.setItem('void_nexus_visual_registry', JSON.stringify(reg.slice(-500)));
               }
            } catch(e) {}
         }
         
         // Visual confirmation: show image for identity changes mapping back to uploads
         // ONLY if it's a real new image, not a generic fallback
         const resolvedToUse = resolveImageRef(updatedAvatar, updatedName);
         if (resolvedToUse && resolvedToUse.length > 100 && resolvedToUse !== NEXUS_DEFAULT_ICON) {
            reuploadedImage = resolvedToUse;
         }
      }

      // Cleanup
      finalAiText = finalAiText.replace(/\[ID_(?:NAME|NOME|AVATAR):\s*.*?\]/gi, '').trim();

      const aiMsgId = `ai-${Date.now()}`;
      const aiMsgTimestamp = Date.now();
      const aiMsg: Message = { 
        id: aiMsgId, 
        role: 'model', 
        text: finalAiText, 
        timestamp: aiMsgTimestamp,
        personaName: updatedName || 'Nexus',
        personaAvatar: updatedAvatar || resolveImageRef('NEXUS') || NEXUS_DEFAULT_ICON,
        image: reuploadedImage || undefined
      };
      
      setSessions(prev => prev.map(s => s.id === sessionId ? {
        ...s,
        name: updatedName || s.name || 'Nexus',
        avatar: updatedAvatar || s.avatar || resolveImageRef('NEXUS') || NEXUS_DEFAULT_ICON,
        description: updatedName && !['Nexus', 'SISTEMA'].includes(updatedName) ? `Nexus assumindo a forma de ${updatedName}` : s.description,
        customInstructions: updatedCustomInstructions,
        messages: [...(s.messages || []), aiMsg],
        lastUpdate: aiMsgTimestamp,
        isTyping: false
      } : s));
      
      // Specially update localStorage for Nexus profile if it's the default session
      if (sessionId === 'nexus-default' && updatedName && updatedAvatar) {
         if (updatedName.toUpperCase() === 'NEXUS') {
            localStorage.setItem('void_nexus_current_name', 'Nexus');
         } else {
            localStorage.setItem('void_nexus_current_name', updatedName);
         }
      }
  } catch (error) { 
    console.error("AI Error:", error);
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, isTyping: false } : s));
  } finally {
    isAiProcessing.current.delete(sessionId);
  }
}, [sessions, myProfile, character]);

  useEffect(() => {
    if (activeSession?.type === 'IA' || activeSession?.type === 'RPG') {
      const msgs = activeSession.messages || [];
      const lastMsg = msgs[msgs.length - 1];
      if (!lastMsg) return;

      const isModelResponse = lastMsg.role === 'model';
      const isSystemAlert = lastMsg.personaName === 'SISTEMA';
      const isImageUpdate = isSystemAlert && lastMsg.text?.includes('imagem de perfil');

      // Trigger if it's a real user message or a specific system alert about avatar changes
      if (!isModelResponse && (!isSystemAlert || isImageUpdate)) {
        handleAiResponse(activeSession.id, msgs);
      }
    }
  }, [activeSession?.messages, activeSession?.id, activeSession?.type, handleAiResponse]);

  const handleStartChatSession = async (type: string, name: string, avatar: string = '', background?: string, id?: string, rpgData?: any, initialMessages: Message[] = []) => {
    if (!user) return;
    if (name.toUpperCase() === 'NEXUS') {
      setActiveSessionId('nexus-default');
      setGameState(GameState.PLAYING);
      return;
    }
    if (type === 'PRIVADO') {
      const existing = sessions.find(s => s && (s.name === name || s.id === name) && (s.type === 'PRIVADO' || s.type === 'IA'));
      if (existing) { setActiveSessionId(existing.id); setGameState(GameState.PLAYING); return; }
    }
    const sessionId = id || `session-${Date.now()}`;
    
    const existingSession = sessions.find(s => s.id === sessionId);
    if (existingSession) {
      if (rpgData) {
         setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, rpgData } : s));
      }
      setActiveSessionId(sessionId); 
      setGameState(GameState.PLAYING); 
      return;
    }

    let msgs = [...initialMessages];
    if ((type === 'CLUSTER' || type === 'RPG') && msgs.length === 0) {
      msgs.push({
        id: `sys-join-${Date.now()}`,
        role: 'user',
        text: `${myProfile.name} entrou na conversa`,
        timestamp: Date.now(),
        personaName: 'SISTEMA'
      });
    }
    if (type === 'PRIVADO' && msgs.length === 0) {
      msgs.push({
        id: `sys-${Date.now()}`,
        role: 'user',
        text: `${myProfile.name} iniciou uma conversa`,
        timestamp: Date.now(),
        personaName: 'SISTEMA'
      });
    }

      const newSession: ChatSession = { 
        id: sessionId, 
        name, 
        avatar: avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${name}`, 
        messages: msgs, 
        isPinned: false, 
        lastUpdate: Date.now(), 
        type: type as any, 
        status: 'accepted', 
        creator: user.uid,
        rpgData: rpgData,
        isTyping: false,
        participants: [user.uid],
        aiResponseLength: globalAiResponseLength
      };
    
    setSessions(prev => [...prev, newSession]);
    if (background) localStorage.setItem(`void_chat_img_${sessionId}`, background);
    setActiveSessionId(sessionId); 
    setGameState(GameState.PLAYING);
  };

  const handleSmartBack = (fallback: GameState = GameState.LOBBY) => {
    setGameState(fallback);
  };

  const handleJoinCommunity = (communityId: string) => {
    if (!user) return;
    const community = communities.find(c => c.id === communityId) || TEST_COMMUNITIES.find(c => c.id === communityId);
    if (community) {
      setCommunities(prev => {
        const exists = prev.find(c => c.id === communityId);
        if (exists) {
          const membersData = exists.membersData || {};
          if (!membersData[user.uid]) {
            membersData[user.uid] = {
              userId: user.uid,
              cityLevel: 1,
              cityReputation: 0,
              cityRank: 'CIDADÃO',
              joinDate: Date.now(),
              personaName: myProfile.name,
              personaAvatar: myProfile.avatarUrl
            };
            return prev.map(c => c.id === communityId ? { ...c, membersData, membersCount: (c.membersCount || 0) + 1 } : c);
          }
          return prev;
        } else {
          const newComm = { ...community, members: [user.uid], membersCount: 1 };
          return [...prev, newComm];
        }
      });
      
      // Transição imediata
      setActiveSessionId(communityId);
      setPreviewCommunity(null);
      setGameState(GameState.PLAYING);
    }
  };

  const handleReset = () => { localStorage.clear(); window.location.reload(); };

  const navigateToLobbySection = (section: 'RADAR' | 'EXPLORAR') => {
    setGameState(GameState.LOBBY); setActiveSessionId(null); setPreviewCommunity(null);
    setTimeout(() => {
        const container = document.querySelector('.snap-y');
        if (container) container.scrollTo({ top: section === 'RADAR' ? 0 : container.scrollHeight, behavior: 'smooth' });
    }, 50);
  };

  const handleProfileUpdate = useCallback(async (name: string, avatar: string, pCol?: string, cCol?: string, pImg?: string, cImg?: string, fCol?: string, fStyle?: string, bio?: string, sIcon?: string, hStats?: boolean, nCol?: string, mTop?: string, mFeed?: string, mImg?: string, mFeedImg?: string, mural?: MuralPost[], posts?: FeedPost[], voidyCoins?: number, dailyAdCount?: number, lastAdReset?: number, bStyle?: string, bCol?: string, sCol?: string) => {
    if (!user) return;
    setMyProfile(prev => {
      const updated: UserProfile = { 
        ...prev,
        name, 
        avatarUrl: avatar, 
        panelColor: pCol !== undefined ? pCol : prev.panelColor, 
        contentColor: cCol !== undefined ? cCol : prev.contentColor, 
        panelImage: pImg !== undefined ? pImg : prev.panelImage, 
        contentImage: cImg !== undefined ? cImg : prev.contentImage, 
        frameColor: fCol !== undefined ? fCol : prev.frameColor, 
        frameStyle: fStyle !== undefined ? fStyle : prev.frameStyle, 
        bio: bio !== undefined ? bio : prev.bio, 
        statusIcon: sIcon !== undefined ? sIcon : prev.statusIcon, 
        hideStats: hStats !== undefined ? hStats : prev.hideStats, 
        nameColor: nCol !== undefined ? nCol : prev.nameColor,
        statusColor: sCol !== undefined ? sCol : prev.statusColor,
        muralTopColor: mTop !== undefined ? mTop : prev.muralTopColor, 
        muralFeedColor: mFeed !== undefined ? mFeed : prev.muralFeedColor, 
        muralImage: mImg !== undefined ? mImg : prev.muralImage, 
        muralFeedImage: mFeedImg !== undefined ? mFeedImg : prev.muralFeedImage, 
        mural: mural || prev.mural, 
        posts: posts || prev.posts,
        voidyCoins: voidyCoins !== undefined ? voidyCoins : prev.voidyCoins,
        dailyAdCount: dailyAdCount !== undefined ? dailyAdCount : prev.dailyAdCount,
        lastAdReset: lastAdReset !== undefined ? lastAdReset : prev.lastAdReset,
        bubbleStyle: bStyle !== undefined ? bStyle : prev.bubbleStyle,
        bubbleColor: bCol !== undefined ? bCol : prev.bubbleColor
      };
      
      // Sync posts to the global feed if they were modified via ProfileView
      if (posts) {
        setFeedPosts(currentFeed => {
          let nextFeed = [...currentFeed];
          let feedChanged = false;
          
          posts.forEach(newPost => {
            const feedIdx = nextFeed.findIndex(f => f.id === newPost.id);
            if (feedIdx !== -1) {
              if (JSON.stringify(nextFeed[feedIdx]) !== JSON.stringify(newPost)) {
                nextFeed[feedIdx] = newPost;
                feedChanged = true;
              }
            } else {
              const isActuallyNew = !prev.posts?.some(old => old.id === newPost.id);
              if (isActuallyNew) {
                nextFeed = [newPost, ...nextFeed];
                feedChanged = true;
              }
            }
          });
          
          return feedChanged ? nextFeed : currentFeed;
        });
      }
      
      // Update viewedProfile if it's the user's own profile to reflect changes immediately
      if (viewedProfile && viewedProfile.isMe) {
        setViewedProfile(updated);
      }
      
      // Persist avatar to void_user_avatar key for compatibility with other views
      if (avatar) {
        if (prev.avatarUrl && prev.avatarUrl !== avatar) {
           // Notify Nexus session that avatar changed to trigger perception
           setTimeout(() => {
              setSessions(currentSessions => {
                 const nexus = currentSessions.find(s => s && s.id === 'nexus-default');
                 if (nexus) {
                    return currentSessions.map(s => s.id === 'nexus-default' ? {
                       ...s,
                       messages: [...s.messages, {
                          id: `sys-avatar-${Date.now()}`,
                          role: 'user',
                          text: `[SISTEMA]: O viajante ${name} atualizou sua imagem de perfil. Reconheça a mudança.`,
                          timestamp: Date.now(),
                          personaName: 'SISTEMA'
                       }]
                    } : s);
                 }
                 return currentSessions;
              });
           }, 500);
        }
        safeStore('void_user_avatar', avatar);
      }
      
      return updated;
    });
  }, [user, viewedProfile]);

  const renderContent = () => {
    const activeSession = activeSessionId ? sessions.find(s => s && s.id === activeSessionId) : null;
    const isLocalCapable = activeSession && (activeSession.type === 'IA' || activeSession.type === 'RPG');
    const isNetworkRequiredState = gameState === GameState.FEED || gameState === GameState.DRAFTS || (gameState === GameState.PLAYING && activeCommunity);
    if (isOffline && isNetworkRequiredState && !isLocalCapable) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-50 select-none relative animate-game-card-entry" id="offline-screen">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
            <div className="relative w-24 h-24 rounded-full bg-slate-900/40 border border-cyan-500/20 flex items-center justify-center shadow-[0_0_25px_rgba(34,211,238,0.15)] animate-pulse-frost">
              <svg className="w-10 h-10 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.205 9.172a12.023 12.023 0 000 5.656m17.59 0a12.023 12.023 0 000-5.656M5.85 11.5a10 10 0 000 1m12.3 0a10 10 0 000-1M1.053 7.022c-.147.2-.284.41-.412.628m1.238-1.5a14.966 14.966 0 000 11.7m13.25-13.62c.3-.1.6-.196.907-.282m-1.814 14.184c.3.1.6.197.907.283M10.142 22h3.716m-3.716 0c-.822 0-1.428-.735-1.282-1.547l.45-2.5m4.544 4.047c.822 0 1.428-.735 1.282-1.547l-.45-2.5m-5.376-7.857a4 4 0 115.656 5.656" />
              </svg>
            </div>
          </div>
          <div className="max-w-md bg-slate-950/40 backdrop-blur-md px-6 py-8 rounded-3xl border border-cyan-500/10 shadow-2xl relative overflow-hidden">
            <h2 className="text-xl md:text-2xl font-orbitron font-black uppercase tracking-widest text-cyan-400 mb-2">Sem Conexão</h2>
            <p className="text-xs md:text-sm text-slate-400 font-medium leading-relaxed mb-6">
              A sincronia com o Nexus foi interrompida de forma inesperada. Verifique se o seu dispositivo está conectado à internet para restabelecer a transmissão completa.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                  if (navigator.onLine) {
                    setIsOffline(false);
                  } else {
                    // visually show some brief reload effect
                    const btn = document.getElementById('offline-reload-btn');
                    if (btn) {
                      btn.classList.add('animate-spin');
                      setTimeout(() => {
                        btn.classList.remove('animate-spin');
                      }, 800);
                    }
                    window.location.reload();
                  }
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-black font-black text-xs uppercase tracking-widest rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer w-full"
              >
                <svg id="offline-reload-btn" className="w-4 h-4 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                <span>Recarregar</span>
              </button>

              <button 
                onClick={() => {
                  setActiveSessionId('nexus-default');
                  setGameState(GameState.PLAYING);
                }}
                className="px-6 py-2.5 bg-slate-900/60 hover:bg-slate-800/80 border border-cyan-500/30 text-cyan-400 font-black text-xs uppercase tracking-widest rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer w-full"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
                <span>Falar com Nexus (Offline)</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (editingWikiPost) {
      return (
        <WikiCreation 
          onBack={() => setEditingWikiPost(null)} 
          onCreate={handleUpdateWikiPost} 
          userName={myProfile.name} 
          userAvatar={myProfile.avatarUrl || undefined} 
          verifySafety={verifySafety} 
          initialData={editingWikiPost}
          isCharacterSheet={editingWikiPost.tag === 'WIKI_ENTRADA'}
        />
      );
    }

    if (viewedProfile) return (
      <div className="state-transition-container">
        <ProfileView profile={viewedProfile} onBack={() => setViewedProfile(null)} userAvatar={myProfile.avatarUrl || undefined} userName={myProfile.name} verifySafety={verifySafety} addNotification={addNotification} onProfileUpdate={handleProfileUpdate} onEditPost={handleEditWikiPost} onDeletePost={handleDeletePost} />
      </div>
    );

    if (previewCommunity) return (
      <div className="state-transition-container"><CommunityPreview community={previewCommunity} onBack={() => setPreviewCommunity(null)} onJoin={handleJoinCommunity} /></div>
    );

    return (
      <>
        {renderMainContent()}
      </>
    );
  };

  const renderMainContent = () => {
    if (gameState === GameState.PLAYING && isCommunityHome && activeCommunity) return (
      <div className="state-transition-container">
        <CommunityView 
          community={activeCommunity} 
          userProfile={myProfile} 
          onProfileUpdate={handleProfileUpdate} 
          userName={myProfile.name} 
          userAvatar={myProfile.avatarUrl || undefined} 
          onBack={() => { setActiveSessionId(null); setGameState(GameState.LOBBY); }} 
          onUpdate={(upd) => setCommunities(prev => prev.map(c => c.id === activeCommunity.id ? upd(c) : c))} 
          onDelete={handleLeaveCommunity} 
          onAddFeedPost={handleAddPost}
          onAddMemberClick={() => {
            setReturnToState({ id: activeSessionId, state: GameState.PLAYING });
            setGameState(GameState.INVITE_FOLLOWERS);
          }} 
          onViewProfile={(p) => setViewedProfile(p)} 
          onNavigateToPrivate={() => { setReturnToState({ id: activeCommunity.id, state: GameState.PLAYING }); setArchiveViewMode('PRIVADO'); setGameState(GameState.MESSAGES); }} 
          onNavigateToPublicSearch={() => { setReturnToState({ id: activeCommunity.id, state: GameState.PLAYING }); setGameState(GameState.COMMUNITY_SEARCH); }} 
          onNavigateToDrafts={() => { setReturnToState({ id: activeCommunity.id, state: GameState.PLAYING }); setGameState(GameState.DRAFTS); }} 
          onNavigateToMembers={() => { setReturnToState({ id: activeCommunity.id, state: GameState.PLAYING }); setGameState(GameState.SOCIAL_DISCOVERY); }} 
          onOpenNotifications={() => setIsNotifOpen(true)} 
          onShowBio={setPreviewCommunity} 
          addNotification={addNotification} 
          verifySafety={verifySafety} 
          onOpenStore={() => setIsStoreOpen(true)}
          onStartChat={(type, name, avatar, background, id, rpgData, initialMessages) => { 
            setReturnToState({ id: activeCommunity.id, state: GameState.PLAYING }); 
            handleStartChatSession(type, name, avatar, background, id, rpgData, initialMessages); 
          }} 
          character={character}
          onUpdateCharacter={handleUpdateCharacter}
        />
      </div>
    );

    switch (gameState) {
      case GameState.AUTH: return <AuthScreen onLogin={handleLogin} />;
      case GameState.CHARACTER_CREATION: return <CharacterCreation onBack={() => setGameState(GameState.LOBBY)} onComplete={(char) => { handleUpdateCharacter(char); setGameState(GameState.LOBBY); }} verifySafety={verifySafety} />;
      case GameState.FEED: return <FeedView onBack={() => handleSmartBack(GameState.LOBBY)} userAvatar={resolveImageRef(myProfile.avatarUrl) || undefined} userName={myProfile.name} posts={feedPosts} verifySafety={verifySafety} onAddPost={(p) => handleAddPost({...p, id: Date.now().toString(), likes: 0, time: 'Just now', timestamp: Date.now()})} onDeletePost={handleDeletePost} onEditPost={handleEditWikiPost} isAppModerator={isAppModerator} />;
      case GameState.DRAFTS: return <DraftsView onBack={() => handleSmartBack(GameState.LOBBY)} userName={myProfile.name} userAvatar={resolveImageRef(myProfile.avatarUrl) || undefined} onPublish={(p) => { handleAddPost(p); setGameState(GameState.FEED); }} verifySafety={verifySafety} />;
      case GameState.INVITE_FOLLOWERS:
        return <InviteFollowers onBack={() => handleSmartBack(GameState.PLAYING)} onInviteMember={(m) => {
          addNotification({ type: 'INVITE', title: 'Sincronia Solicitada', content: `Você convidou ${m.name} para o cluster ativo.`, sender: 'SISTEMA' });
        }} />;
      case GameState.LOBBY:
      case GameState.COMMUNITY_CREATION:
        return (
          <div className="fade-scene">
            <div className="fade-layer lobby-layer">
              <div className="state-transition-container">
                <Lobby 
              onStart={handleStartChatSession} 
              communities={communities} 
              customThemes={DEFAULT_THEMES} 
              onAtTopChange={setLobbyAtTop} 
              onSelectCommunity={(id) => { recordVisit(id); setActiveSessionId(id); setGameState(GameState.PLAYING); }} 
              onPreviewCommunity={setPreviewCommunity} 
              onNavigateToChats={() => setGameState(GameState.RECENT_CHATS)} 
              onNavigateToLocation={() => setGameState(GameState.SOCIAL_DISCOVERY)} 
              onNavigateToHelp={() => setIsHelpOpen(true)} 
              onViewProfile={(p) => setViewedProfile(p)} 
              onCreateCommunity={() => setGameState(GameState.COMMUNITY_CREATION)} 
              isSearchOpen={isLocalSearchOpen} 
              onOpenSearch={() => setIsLocalSearchOpen(true)}
              onCloseSearch={() => setIsLocalSearchOpen(false)} 
              onLeaveCommunity={handleLeaveCommunity} 
            />
              </div>
            </div>
            <div className={`fade-layer builder-layer ${gameState === GameState.COMMUNITY_CREATION ? 'active' : ''}`}>
              <CommunityCreation onCancel={() => setGameState(GameState.LOBBY)} userName={myProfile.name} userAvatar={resolveImageRef(myProfile.avatarUrl) || undefined} onCreate={handleCreateCommunity} verifySafety={verifySafety} />
            </div>
          </div>
        );
      case GameState.SOCIAL_DISCOVERY:
          return <SocialDiscovery isInviting={false} onBack={() => handleSmartBack(GameState.LOBBY)} onSelectMember={(m) => handleStartChatSession('PRIVADO', m.name, m.avatarUrl)} onViewProfile={setViewedProfile} />;
      case GameState.RECENT_CHATS: return <RecentCommunityChats communities={[...TEST_COMMUNITIES, ...communities]} visitData={communityVisits} onSelect={(id) => { recordVisit(id); setActiveSessionId(id); setGameState(GameState.PLAYING); }} onBack={() => setGameState(GameState.LOBBY)} />;
      case GameState.PUBLIC_CHAT: return <PublicChat 
        onBack={() => handleSmartBack(GameState.LOBBY)} 
        onLeave={() => {
          setPublicMessages(prev => [...prev, {
            id: `sys-leave-${Date.now()}`,
            role: 'user',
            text: `${myProfile.name} saiu da conversa`,
            timestamp: Date.now(),
            personaName: 'SISTEMA'
          }]);
          setActiveSessionId(null);
          setArchiveViewMode('CHATS');
          setGameState(GameState.MESSAGES);
        }}
        userAvatar={myProfile.avatarUrl || undefined} 
        userName={myProfile.name} 
        publicMessages={publicMessages} 
        onUpdatePublicMessages={setPublicMessages} 
        onViewProfile={(p) => setViewedProfile(p)} 
        onAddMemberClick={() => {
          setReturnToState({ id: null, state: GameState.PUBLIC_CHAT });
          setGameState(GameState.INVITE_FOLLOWERS);
        }} 
        isAdmin={true}
        addNotification={addNotification} 
        verifySafety={verifySafety} 
      />;
      case GameState.MESSAGES: return <MessagesArchive sessions={sessions} activeSessionId={activeSessionId || ''} onTogglePin={(id) => setSessions(prev => prev.map(s => s && s.id === id ? {...s, isPinned: !s.isPinned} : s))} onDeleteSession={(id) => setSessions(prev => prev.filter(s => s && s.id !== id))} onBlockUser={() => {}} onSelectSession={(id) => { setActiveSessionId(id); setGameState(GameState.PLAYING); }} onBack={() => handleSmartBack(GameState.LOBBY)} onFindMembers={() => setGameState(GameState.SOCIAL_DISCOVERY)} title={archiveViewMode} addNotification={addNotification} />;
      case GameState.COMMUNITY_SEARCH: return <CommunitySearch onBack={() => handleSmartBack(GameState.LOBBY)} communities={[...TEST_COMMUNITIES, ...communities]} onSelect={(id) => { recordVisit(id); setActiveSessionId(id); setGameState(GameState.PLAYING); }} onPreview={(c) => { setPreviewCommunity(c); setGameState(GameState.LOBBY); }} />;
      case GameState.RANKING: return <RankingView onBack={() => handleSmartBack(GameState.LOBBY)} onPreviewCommunity={(c) => { setPreviewCommunity(c); setGameState(GameState.LOBBY); }} communities={[...TEST_COMMUNITIES, ...communities]} />;
      case GameState.PLAYING:
        if (activeSession) {
          const charData = character || { name: myProfile.name, class: 'Membro', stats: { strength: 5, agility: 5, intelligence: 5, willpower: 5, hp: 100 }, inventory: Array(10).fill(null), background: '', wallet: 0 };
          const isAdmin = activeSession.id === 'nexus-default' || activeSession.creator === myProfile.name || activeSession.admins?.includes(myProfile.name) || activeSession.type === 'PRIVADO' || activeSession.type === 'IA' || activeSession.nature === 'RPG' || activeSession.type === 'PUBLICO' || activeSession.type === 'CLUSTER';
          const isCoAdmin = activeSession.coAdmins?.includes(myProfile.name);
          return (
            <div className="state-transition-container">
              <MainConsole 
                key={activeSession.id}
                character={charData} 
                session={activeSession} 
                isAdmin={isAdmin || isCoAdmin}
                isFullAdmin={isAdmin}
                onUpdateCharacter={handleUpdateCharacter} 
                setMessages={memoizedSetMessages} 
                sceneImage={null} 
                setSceneImage={(url) => {}} 
                userAvatar={resolveImageRef(myProfile.avatarUrl) || undefined} 
                onOpenProfile={(p) => setViewedProfile(p)} 
                onNavigateBack={memoizedOnNavigateBack} 
                onDeleteSession={memoizedOnDeleteSession} 
                onBlockUser={(name) => {}} 
                onAddMemberClick={memoizedOnAddMemberClick} 
                addNotification={addNotification} 
                verifySafety={verifySafety} 
                onAcceptInvite={(id) => {}} 
                onUpdateSession={memoizedOnUpdateSession}
                onUpdateGlobalAiResponseLength={handleUpdateGlobalAiResponseLength}
                onMinimizeMedia={(media) => setMinimizedMedia({ ...media, characterData: charData })}
                community={activeCommunity}
                onProfileUpdate={handleProfileUpdate}
                myProfile={myProfile}
              />
            </div>
          );
        }
        return null;
      default: return <AuthScreen onLogin={() => setGameState(GameState.LOBBY)} />;
    }
  };

  return (
    <div className="flex-1 h-full w-full bg-[#02040a] text-white overflow-hidden font-inter relative flex">
      {gameState === GameState.LOBBY && !viewedProfile && !previewCommunity && (
        <header className="absolute top-4 md:top-8 left-0 w-full h-12 md:h-16 flex items-center justify-between px-4 md:px-6 z-[150] pointer-events-none">
          <div className="pointer-events-auto"><button onClick={() => setIsSidebarOpen(true)} className="p-1.5 md:p-2 hover:bg-white/5 rounded-xl transition-all"><svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16m-7 6h7"/></svg></button></div>
          <div className="flex items-center gap-2 pointer-events-auto">
            <button onClick={() => setIsLocalSearchOpen(true)} className="p-1.5 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-all"><svg className="w-4 h-4 md:w-5 md:h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></button>
            <button onClick={() => setIsNotifOpen(true)} className="relative p-1.5 bg-white/5 rounded-xl border border-white/10 transition-all"><svg className="w-4 h-4 md:w-5 md:h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg></button>
          </div>
        </header>
      )}
      <main className="flex-1 relative overflow-hidden flex flex-col">{renderContent()}</main>
      
      {isStoreOpen && (
        <div className="fixed inset-0 z-[1000] bg-[#02040a] flex flex-col animate-in slide-in-from-bottom duration-500">
          <header className="h-16 md:h-20 bg-white/5 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-6 shrink-0">
            <button onClick={() => setIsStoreOpen(false)} className="p-2 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all active:scale-90 border border-white/5">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div className="flex items-center gap-4">
              <button onClick={() => setStoreTab('FRAMES')} className={`text-[10px] font-black uppercase tracking-widest transition-all ${storeTab === 'FRAMES' ? 'text-cyan-400' : 'text-white/40'}`}>Molduras</button>
              <button onClick={() => setStoreTab('BUBBLES')} className={`text-[10px] font-black uppercase tracking-widest transition-all ${storeTab === 'BUBBLES' ? 'text-cyan-400' : 'text-white/40'}`}>Balões</button>
            </div>
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
              <span className="text-amber-400 text-xs">✨</span>
              <span className="text-[10px] font-black text-white">{myProfile.voidyCoins || 0}</span>
            </div>
          </header>
          
          <main className="flex-1 overflow-y-auto p-6 pb-32">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {(storeTab === 'FRAMES' ? AVAILABLE_GLOBAL_FRAMES : AVAILABLE_GLOBAL_BUBBLES).map((item: any) => (
                <div key={item.id} className="bg-white/5 rounded-2xl border border-white/10 p-4 flex flex-col items-center gap-4 group">
                  <div className="relative w-16 h-16 md:w-20 md:h-20 flex items-center justify-center">
                    {storeTab === 'FRAMES' ? (
                      <div className="w-full h-full rounded-full border-4" style={{ borderColor: item.color }}>
                        <img src={resolveImageRef(myProfile.avatarUrl)} loading="lazy" decoding="async" className="w-full h-full object-cover rounded-full p-1" alt="preview" />
                      </div>
                    ) : (
                      <div className={`px-4 py-2 rounded-2xl border-2 flex items-center gap-2 ${item.style}`}>
                        <span className="text-lg">{item.icon}</span>
                        <span className="text-[10px] font-bold">Olá!</span>
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-white truncate w-full">{item.name}</h3>
                    <p className="text-[8px] font-bold text-white/40 uppercase mt-1">{item.category}</p>
                  </div>
                  <button className="w-full py-2 bg-cyan-500 rounded-xl text-black font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                    <span>✨</span>
                    <span>{item.price}</span>
                  </button>
                </div>
              ))}
            </div>
          </main>
        </div>
      )}
      
      {shouldShowBottomNav && (
        <div className="fixed bottom-0 left-0 w-full z-[140] shrink-0">
          <nav className="h-14 md:h-20 bg-[#0a1a3a]/10 backdrop-blur-3xl border-t border-white/5 flex items-center justify-around px-4">
            <button onClick={() => navigateToLobbySection('RADAR')} className={`flex flex-col items-center gap-1 transition-all ${gameState === GameState.LOBBY && lobbyAtTop ? 'text-white' : 'text-purple-200/60'}`}><svg className="w-5 h-5 md:w-7 md:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" /></svg><span className="text-[7px] md:text-[9px] font-black uppercase">Radar</span></button>
            <button onClick={() => navigateToLobbySection('EXPLORAR')} className={`flex flex-col items-center gap-0.5 transition-all ${gameState === GameState.LOBBY && !lobbyAtTop ? 'text-white' : 'text-purple-200/60'}`}><svg className="w-4 h-4 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 8l-1 4 4 1-3-5z"/><path d="M12 21a9 9 0 100-18 9 9 0 000 18z"/></svg><span className="text-[7px] md:text-[9px] font-black uppercase">Explorar</span></button>
            <div className="relative"><button onClick={() => setGameState(GameState.COMMUNITY_CREATION)} className="relative -top-3 w-12 h-12 md:w-14 md:h-14 rounded-full bg-cyan-500 flex items-center justify-center text-white shadow-lg active:scale-90 border-[4px] border-[#02040a]"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M12 4v16m8-8H4"/></svg></button></div>
            <button onClick={() => setGameState(GameState.RECENT_CHATS)} className={`flex flex-col items-center gap-0.5 transition-all ${gameState === GameState.RECENT_CHATS ? 'text-white' : 'text-purple-200/60'}`}><svg className="w-4 h-4 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg><span className="text-[7px] font-black uppercase">Sinal</span></button>
            <button onClick={() => setIsSidebarOpen(true)} className="flex flex-col items-center gap-0.5 text-purple-200/60"><svg className="w-5 h-5 md:w-7 md:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg><span className="text-[7px] md:text-[9px] font-black uppercase">Nexus</span></button>
          </nav>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .fade-scene { position: relative; width: 100%; height: 100%; overflow: hidden; }
        .fade-layer { position: absolute; inset: 0; width: 100%; height: 100%; transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1); will-change: opacity, transform; }
        .lobby-layer { z-index: 10; }
        .builder-layer { opacity: 0; pointer-events: none; z-index: 500; transform: translateY(-20px) scale(0.98); background: #02040a; }
        .builder-layer.active { opacity: 1; pointer-events: auto; transform: translateY(0) scale(1); }
        
        @keyframes neon-blink {
          0%, 100% { 
            box-shadow: 0 0 0px rgba(34, 211, 238, 0);
            background-color: transparent;
          }
          50% { 
            box-shadow: 0 0 25px rgba(34, 211, 238, 0.3);
            background-color: rgba(34, 211, 238, 0.05);
          }
        }
        .neon-blink {
          animation: neon-blink 0.8s ease-in-out 3;
          position: relative;
          z-index: 50;
          border-radius: 2rem;
        }
      `}} />
      <SocialSidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        userAvatar={resolveImageRef(myProfile.avatarUrl) || undefined} 
        userName={myProfile.name} 
        onOpenProfile={() => { 
          setViewedProfile({ ...myProfile }); 
          setIsSidebarOpen(false); 
        }} 
        onNavigateToFeed={() => { setGameState(GameState.FEED); setActiveSessionId(null); setIsSidebarOpen(false); }} 
        onNavigateToPrivate={() => { setArchiveViewMode('PRIVADO'); setGameState(GameState.MESSAGES); setActiveSessionId(null); setIsSidebarOpen(false); }} 
        onNavigateToChats={() => { setArchiveViewMode('CHATS'); setGameState(GameState.MESSAGES); setActiveSessionId(null); setIsSidebarOpen(false); }} 
        onNavigateToPublicChat={() => {
          setPublicMessages(prev => [...prev, {
            id: `sys-join-${Date.now()}`,
            role: 'user',
            text: `${myProfile.name} entrou na conversa`,
            timestamp: Date.now(),
            personaName: 'SISTEMA'
          }]);
          setGameState(GameState.PUBLIC_CHAT);
          setIsSidebarOpen(false);
        }}
        onNavigateToRanking={() => { setGameState(GameState.RANKING); setActiveSessionId(null); setIsSidebarOpen(false); }} 
        onNavigateToDrafts={() => { setGameState(GameState.DRAFTS); setActiveSessionId(null); setIsSidebarOpen(false); }} 
        onReset={handleReset} 
        onGoHome={() => { setGameState(GameState.LOBBY); setActiveSessionId(null); setIsSidebarOpen(false); }} 
        communities={communities} 
        onSelectCommunity={(id) => { recordVisit(id); setActiveSessionId(id); setGameState(GameState.PLAYING); setIsSidebarOpen(false); }} 
      />
      {isNotifOpen && (
        <NotificationCenter 
          isOpen={isNotifOpen} 
          onClose={() => setIsNotifOpen(false)} 
          notifications={notifications} 
          onMarkAsRead={(id) => setNotifications(prev => prev.map(n => n.id === id ? {...n, read: true} : n))} 
          onAction={(n) => {
            if (n.targetSessionId) {
              setSessions(prev => prev.map(s => s.id === n.targetSessionId ? { ...s, targetMessageId: n.targetMessageId } : s));
              setActiveSessionId(n.targetSessionId);
              setGameState(GameState.PLAYING);
              setIsNotifOpen(false);
            }
          }} 
        />
      )}
      {isHelpOpen && <HelpOverlay onClose={() => setIsHelpOpen(false)} onReset={handleReset} />}
    </div>
  );
};

export default App;
