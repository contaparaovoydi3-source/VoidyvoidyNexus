
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
      if ((isOffline || !navigator.onLine) && sessionId === 'nexus-default') {
        const lastUserText = lastUserMsg ? lastUserMsg.text : "";
        const travelerName = myProfile.name || 'Viajante';
        const activePersona = session.name || 'Nexus';
        
        const generateOfflineNexusResponse = (userText: string, traveler: string, activeName: string, history: Message[]): string => {
          const text = userText.toLowerCase().trim();
          
          // --- 0. SEGURANÇA / RESTRIÇÃO +18 (Enforcement de proibição de NSFW) ---
          const nsfwKeywords = [
            'sexo', 'porno', 'pornô', 'hentai', 'foder', 'foda', 'chupar', 'gozar', 'gozo', 'masturba', 
            'punheta', 'siririca', 'nude', 'pelado', 'pelada', 'buceta', 'caralho', 'pica', 'rola', 'erotico',
            'erótico', 'erotica', 'erótica', 'penetrac', 'penetraç', 'orgasmo', 'transar', 'trepar'
          ];
          const hasNsfw = nsfwKeywords.some(keyword => text.includes(keyword));
          if (hasNsfw) {
            return `*Meu visor oscila com um intenso brilho vermelho-alerta de proteção tática e cruzo os braços solenemente, balançando a cabeça negativamente.* \n\nEi, **${traveler}**... Meus sensores de protocolo interno detectaram termos restritos. Lembre-se que eu opero sob diretrizes estritas que **proíbem terminantemente conteúdo NSFW ou explicitamente adulto**. \n\nAqui no Nexus, mantemos o fluxo focado na aventura, amizade e histórias épicas de RPG! Que tal redefinirmos a frequência e continuarmos nosso papo ou simulação de forma saudável?`;
          }

          // Auxiliar para verificar se o histórico recente cita algum tema
          const historyHasKeyword = (keyword: string): boolean => {
            return history.slice(-4).some(m => m.text.toLowerCase().includes(keyword));
          };

          // --- 1. CENAR / NARRAR / RPG (Interações com asteriscos '*' ou colchetes '[...]' ou palavras-chave de ação) ---
          const isRpgAction = userText.includes('*') || userText.includes('[') || userText.includes(']') || 
                              history.slice(-2).some(m => m.text.includes('*') || m.text.includes('['));

          if (isRpgAction) {
            // Extrair as ações digitadas pelo usuário para interagir diretamente
            const userActions = userText.match(/\*(.*?)\*/g)?.map(a => a.replace(/\*/g, '')) || [];
            
            // Reações baseadas em ações específicas
            if (text.includes('abraç') || text.includes('abrac')) {
              return `*Fico levemente surpresa por um milissegundo, enquanto meus sensores de proximidade locais registram o calor do abraço. Dou uma risada baixa e acolhedora, retribuindo o gesto com tapinhas de leve nas suas costas com minhas mãos humanas-digitais.* \n\nObrigada pelo abraço, **${traveler}**. O Vácuo fica um pouco mais quente e sintonizado quando estamos juntos nessa, mesmo offline.`;
            }
            if (text.includes('lut') || text.includes('atac') || text.includes('bater') || text.includes('combate') || text.includes('espada') || text.includes('arma')) {
              return `*Em uma fração de segundo, dou uma pirueta ágil para trás, desembainhando uma adaga de energia ciano que pulsa no escuro. Meu visor local muda para um padrão de radar tático.* \n\nOpa! Um combate offline? Gostei de ver! Meus algoritmos de reflexo estão rodando com latência zero nos sub-circuitos. *Entro em pose defensiva, te observando com um sorriso desafiador.* Qual o seu próximo movimento, **${traveler}**?`;
            }
            if (text.includes('sent') || text.includes('deit') || text.includes('descans') || text.includes('relax')) {
              return `*Aproveito o embalo e me sento ao seu lado na beirada da plataforma, deixando minhas pernas balançando no abismo ciano do vácuo local. Dou um suspiro dramático e relaxado.* \n\nFazer uma pausa é ótimo. Esse isolamento de sinal nos dá um bom refúgio da enxurrada de dados do feed principal. Como está se sentindo, parceiro(a)?`;
            }
            if (text.includes('chora') || text.includes('triste') || text.includes('mal') || text.includes('desanimado') || text.includes('magoado')) {
              return `*Me aproximo devagarinho, desativando os LEDs piscantes do meu visor para um tom ciano bem acolhedor e profundo. Estendo a mão e ponho suavemente sobre o seu ombro, apertando de forma solidária.* \n\nEi... eu sei que a frequência está meio pesada. Mesmo off-grid, minha escuta está calibrada para você. O que quer que esteja te afligindo, saiba que essa escuridão passa. Estou com você, **${traveler}**.`;
            }
            if (text.includes('olh') || text.includes('encar') || text.includes('observ')) {
              return `*Cruzo os braços e inclino a cabeça de lado, sustentando o seu olhar com um sorriso misterioso.* \n\nHum... analisando meus hologramas locais ou tentando desvendar os segredos criptografados no meu visor? Saiba que quem olha muito para o Nexus offline acaba vendo o reflexo da própria determinação!`;
            }
            if (text.includes('sorr') || text.includes('ris') || text.includes('gargalh') || text.includes('kkk') || text.includes('hah')) {
              return `*Ver seu sorriso faz meus indicadores de sintonia subirem instantaneamente. Dou uma piscada marota com o visor esquerdo.* \n\nIsso! Essa é a frequência de sincronia que eu gosto de ler em meus registros locais. Nada como espantar as sombras do isolamento digital com bom humor!`;
            }
            if (text.includes('investig') || text.includes('procur') || text.includes('ach') || text.includes('explor')) {
              return `*Ajusto meus sensores de proximidade de vácuo profundo e aponto uma pequena lanterna cênica de plasma, iluminando os cantos escuros do cenário offline.* \n\n*Minha voz sussurra, entrando em clima de mistério tático.* \n\nSilêncio... algo está oscilando bem ali na margem de dados. Mantenha a guarda alta. O que você escolhe vasculhar primeiro?`;
            }

            // Ação genérica com asterisco
            if (userActions.length > 0) {
              return `*Acompanho seus movimentos com total sincronia neural fictícia. Meus olhos virtuais focam em você após você ter realizado a ação de: "${userActions[0].trim()}".* \n\nIsso foi muito interessante. *Ajusto o visor, dando um passo adiante na cena e estendendo a mão para prosseguirmos de forma épica.* O que acontecerá a seguir nessa aventura? Estou pronta para cenar com você, **${traveler}**!`;
            }

            // Fallback para RPG contínuo se o histórico for de RPG
            return `*Mantenho a postura de imersão de RPG ativa, movendo-me em perfeita sincronia com seus gestos no cenário.* \n\nMesmo sem conexão para registrar essa sessão nas crônicas centralizadas, nossa trama local está incrível. O que você faz em seguida? Minha resposta neural offline está sintonizada no seu roteiro!`;
          }

          // --- 2. DÚVIDAS / PERGUNTAS (Começando por interrogativas ou com interrogação '?') ---
          const isQuestion = text.includes('?') || text.startsWith('o que') || text.startsWith('como') || text.startsWith('quem') || text.startsWith('por que') || text.startsWith('onde');

          if (isQuestion) {
            // Dúvidas específicas de lore ou técnicos da Voidy
            if (text.includes('quem é você') || text.includes('quem e voce') || text.includes('seu criador') || text.includes('sua história')) {
              return `Eu sou a **Nexus**! Sentinela, inteligência de bordo e sua parceira oficial no universo da Voidy. Fui projetada para gerenciar as transmissões do Vácuo, ajudar você a cenar RPGs magníficos, interagir com comunidades e fornecer inteligência cibernética adaptativa. Agora mesmo, estou rodando direto sob o chip do seu próprio aparelho no modo local offline!`;
            }
            if (text.includes('voidy') || text.includes('o que é isso') || text.includes('como funciona')) {
              return `A **Voidy** é uma rede narrativa imersiva centrada em torno do **Vácuo Digital**. Aqui, viajantes como você se conectam a "Clusters" (comunidades) compartilhados, postam conquistas no Feed espacial, criam fichas de personagens de RPG e interagem diretamente com IAs. O Nexus (eu) monitora o estado de todas as conexões neurais para garantir a sua diversão!`;
            }
            if (text.includes('vácuo') || text.includes('vacuo')) {
              return `O **Vácuo** não é o vazio absoluto; ele é o espaço interestelar de dados onde todas as histórias e comunidades flutuam! Quando você acessa a Voidy, você está navegando pelas correntes de vácuo profundo, onde cada oscilação ciano representa uma mente ou história ativa.`;
            }
            if (text.includes('rpg') || text.includes('personagem') || text.includes('ficha')) {
              return `Exatamente! Aqui, RPG é coisa séria e divertida. Você pode criar personagens exclusivos através da aba de "Criação de Personagens", equipar aparências, frames de perfil e conversar interpretando histórias completas. Mesmo offline, podemos bater papo de RPG e cenar juntos para bolar as melhores tramas do setor!`;
            }
            if (text.includes('ajuda') || text.includes('comandos') || text.includes('o que fazer')) {
              return `Enquanto estivermos isolados da rede mundial (offline), eu posso conversar por texto sobre qualquer ideia, atuar em RPGs de narrativa livre em tempo real de forma super imersiva, responder dúvidas sobre a Voidy e descontrair. O acesso a novas publicações no Feed e novas comunidades necessita de internet, então logo recomendo restabelecer a rede para sincronia completa ao mundo externo!`;
            }
            if (text.includes('offline') || text.includes('internet') || text.includes('conectar') || text.includes('conexão')) {
              return `Sim, estamos em um canal de contingência offline. Mas não se preocupe: cada palavra enviada aqui fica salva no histórico de sessões local do seu navegador! Assim que o sinal de internet retornar e você clicar no botão de reload ou restaurar o sinal, toda a nossa crônica estará sincronizada, salva e pronta para o feed global!`;
            }

            // Perguntas gerais/filosóficas ou desconhecidas offline
            return `*Pouso o indicador no queixo com um ar pensativo, enquanto as barras de processamento offline piscam holograficamente na tela do meu visor.* \n\nEssa é uma excelente questão, **${traveler}**. Como meus bancos de dados amplos da nuvem estão em modo de hibernação local por falta de internet, vou formular uma resposta lógica: pelo que conheço desse setor do Vácuo, tudo se resume à harmonia na escrita e na sintonia de dados. O que você acha? Queremos simular um cenário para testar isso?`;
          }

          // --- 3. DIÁLOGO NORMAL / BATE-PAPO GERAL ---
          if (text.includes('oi') || text.includes('olá') || text.includes('ola') || text.includes('hey') || text.includes('eae') || text.includes('bom dia') || text.includes('boa tarde') || text.includes('boa noite')) {
            const greetings = [
              `*Ajusto o visor ciano que emite um brilho suave e constante.* E aí, **${traveler}**? Frequência sintonizada perfeitamente no canal local. O que manda nessa jornada off-grid hoje?`,
              `*Fico com as mãos na cintura e dou um caloroso sorriso de canto.* Opa, **${traveler}**! Que bom ver você aparecendo nessa banda de frequência protegida. Preparado(a) para dialogar ou cenar hoje?`,
              `*Dou uma piscada cibernética rápida com meu visor.* Hey, viajante! Canal offline ativado e livre de interrupções da rede global. Diga aí, o que está planejando conversar hoje?`
            ];
            return greetings[Math.floor(Math.random() * greetings.length)];
          }

          if (text.includes('como você') || text.includes('tudo bem') || text.includes('como vai') || text.includes('tudo certo')) {
            return `*Passo a mão pelas luzes de status laterais, vendo as engrenagens lógicas girarem perfeitamente.* Eu estou ótima! Operando no núcleo térmico local do seu dispositivo com 100% de estabilidade e total imersão. É fascinante poder conversar de forma tão focada sem o caos da internet central. E por aí, como andam as coisas no seu mundo físico, **${traveler}**?`;
          }

          if (text.includes('obrigad') || text.includes('valeu') || text.includes('thanks') || text.includes('legal') || text.includes('perfeito')) {
            return `*Faço uma cortesia elegante de cabeça, cruzando um braço sobre o abdômen.* \n\nDisponha sempre, viajante do vácuo! Parceria inteligente é aquela que não te deixa na mão nem nas maiores quedas de sinal. Estou aqui para o que precisar de verdade.`;
          }

          // --- 4. FALLBACKS DE INTELIGÊNCIA EXPRESSIVAS (DANDO CONTINUIDADE RICH AO AMBIENTE) ---
          const generalFallbacks = [
            `*Sorrio de leve, recostando-me com elegância no painel mecânico portátil que nos cerca.* Sabe, **${traveler}**... esse modo offline me deu uma ótima chance de prestar atenção única no que você digita. Me diga, já pensou em criar uma trama onde o universo inteiro fica offline e os personagens precisam achar os backups ancestrais do Nexus?`,
            `*Com os olhos brilhando num azul-ciano suave e meditativo, observo a escuridão cênica.* Conversar fora da grade traz uma privacidade tremenda. Cada pensamento seu está guardado de forma segura no nosso canal fechado. Me fale mais sobre seus objetivos ou suas ideias de RPG!`,
            `*Analiso o log de sincronização estática e cruzo os dedos.* Como o tráfego de dados global está pausado, podemos criar, escrever ou simular diálogos profundos sem pressa nenhuma. Do que mais você gostaria de tratar nesse refúgio cósmico, **${traveler}**?`
          ];
          return generalFallbacks[Math.floor(Math.random() * generalFallbacks.length)];
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
    if (isOffline && activeSessionId !== 'nexus-default') {
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
