
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { UserProfile, Notification, MuralPost, FeedPost } from '../types';
import { resolveImageRef, safeStore } from '../data';
import { DragonO } from './Lobby';
import { GoogleGenAI } from "@google/genai";
import { MODEL_IMAGE } from "../constants";

interface ProfileViewProps {
  onBack: () => void;
  profile: UserProfile;
  onProfileUpdate: (name: string, avatar: string, panelColor?: string, contentColor?: string, panelImage?: string, contentImage?: string, frameColor?: string, fStyle?: string, bio?: string, sIcon?: string, hStats?: boolean, nCol?: string, mTop?: string, mFeed?: string, mImg?: string, mFeedImg?: string, mural?: MuralPost[], posts?: FeedPost[], voidyCoins?: number, dailyAdCount?: number, lastAdReset?: number, bStyle?: string, bCol?: string, sCol?: string) => void;
  verifySafety?: (content: string, type?: 'image' | 'text') => Promise<boolean>;
  addNotification: (notif: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  userAvatar: string;
  userName: string;
  onEditPost?: (post: FeedPost) => void;
  onDeletePost?: (id: string) => void;
}

const hexToHsla = (hex: string) => {
  if (!hex || hex === 'transparent') return { h: 0, s: 0, l: 0, a: 0 };
  let r = 0, g = 0, b = 0, a = 1;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length >= 7) {
    r = parseInt(hex.substring(1, 3), 16); g = parseInt(hex.substring(3, 5), 16); b = parseInt(hex.substring(5, 7), 16);
    if (hex.length === 9) a = parseInt(hex.substring(7, 9), 16) / 255;
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100), a };
};

const hslaToHex = (h: number, s: number, l: number, a: number) => {
  if (a === 0) return 'transparent';
  l /= 100;
  const a_val = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a_val * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const isWhite = (color?: string) => {
  if (!color) return false;
  const c = color.toLowerCase().trim();
  return c === '#ffffff' || c === '#fff' || c === 'white' || c === 'rgb(255, 255, 255)' || c === 'rgba(255, 255, 255, 1)';
};

const getAutoContrastHex = (hex: string) => {
  if (!hex || hex === 'transparent' || hex === '#00000000') return '#ffffff';
  const hsla = hexToHsla(hex);
  const isDarkBg = hsla.l < 55;
  // Refined for better contrast on white backgrounds
  const targetL = isDarkBg ? 94 : 10;
  const targetH = (hsla.h + 180) % 360;
  const targetS = hsla.s > 20 ? 40 : 5;
  return hslaToHex(targetH, targetS, targetL, 1);
};

const getContrastBase = (hex: string) => {
  if (!hex || hex.length < 7 || hex === 'transparent') return '255, 255, 255';
  const r = parseInt(hex.substring(1, 3), 16);
  const g = parseInt(hex.substring(3, 5), 16);
  const b = parseInt(hex.substring(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155 ? '0, 0, 0' : '255, 255, 255';
};

const stripBioTags = (text: string | undefined | null) => {
  if (!text) return "";
  // Removes all [tag] or [tag=attr] or [tag id attr] or [vimg_id] blocks
  let clean = text.replace(/\[\s*(?:vimg_|img_|ref:|header|capa|banner|imagem|image|atm|atmosfera|[^\]=]+=[^\]\s]+|[^\]\s]+\s+[^\]]+)[^\]]*\]/gi, "");
  // Removes simple formatting tags [b] [/b]
  clean = clean.replace(/\[\/?([a-z]+)[^\]]*\]/gi, "");
  return clean.trim();
};

const saveToMediaStorage = (base64: string): string => {
  if (!base64 || !base64.startsWith('data:')) return base64;
  const id = `vimg_perfil_${Math.random().toString(36).substring(2, 9)}`;
  safeStore(id, base64);
  return `ref:${id}`;
};


const formatTags = (text: string, isOverlay = false) => {
  if (!text) return "";
  let p = text;
  const tagRegex = /\[([cbisuBCISU]+)\]([\s\S]*?)(\[\/\1\]|$)/gi;
  let oldP;
  do {
    oldP = p;
    p = p.replace(tagRegex, (match, tags, content) => {
      let res = content;
      const t = tags.toLowerCase();
      if (t.includes('i')) res = `<em class="italic opacity-90">${res}</em>`;
      if (t.includes('b')) res = `<strong class="font-black ${isOverlay ? 'text-white text-[1.2em] inline-block' : ''}">${res}</strong>`;
      if (t.includes('u')) res = `<span class="underline">${res}</span>`;
      if (t.includes('s')) res = `<span class="line-through opacity-60">${res}</span>`;
      if (t.includes('c')) res = `<div style="text-align: center; width: 100%; display: block; margin: 2px 0;">${res}</div>`;
      return res;
    });
  } while (p !== oldP);
  return p;
};

const formatBioText = (text: string, customTextColor?: string, contextImages?: any[], isViewMode = false) => {
  if (!text) return "";
  let p = text;
  
  // Robust image regex: [vimg_ID attributes] or loose vimg_ references
  const mainVimgRegex = /\[\s*(vimg_[^\]\s]+|ref:[^\]\s]+|vimg_ref:[^\]\s]+)(\s+[^\]]*)?\](?:\s*(?:["']([^"']*)["']|\{([^}]*)\}))?/gi;
  const looseVimgRegex = /((?:vimg_|ref:)[a-zA-Z0-9_:-]+)/gi;
  const standardImgRegex = /\[\s*([^\]\s=]+)(?:\s*=\s*([^\]\s]*))?\s*([^\]]*)\](?:\s*(?:["']([^"']*)["']|\{([^}]*)\}))?/gi;
  
  const images: { html: string, align: string }[] = [];
  
  const tryGet = (id: string): string | null => {
    if (!id) return null;
    try {
      // Direct lookup
      let val = localStorage.getItem(id) || 
                  localStorage.getItem(id.toLowerCase()) || 
                  localStorage.getItem(id.toUpperCase());
      
      // If result is a ref, follow it
      if (val && val.startsWith('ref:')) {
        const refKey = val.replace('ref:', '');
        val = localStorage.getItem(refKey) || 
               localStorage.getItem(refKey.toLowerCase()) || 
               localStorage.getItem(refKey.toUpperCase());
      }
      
      if (val) return val;

      // Handle common prefix variations if not found
      const prefixes = ['vimg_', 'ref:', 'vimg_ref:', 'img_'];
      for (const p of prefixes) {
        if (id.startsWith(p)) {
            const stripped = id.substring(p.length);
            const found = tryGet(stripped);
            if (found) return found;
        }
      }
      return null;
    } catch (e) { return null; }
  };

  // Helper to parse attributes: w=100 x=50 h=300 a=c etc
  const parseAttrs = (attrStr: string) => {
    const attrs: any = {};
    if (!attrStr) return attrs;
    const parts = attrStr.trim().split(/\s+/);
    parts.forEach(p => {
      const match = p.match(/^([wxpha])\s*=\s*(.*)$/i);
      if (match) attrs[match[1].toLowerCase()] = match[2];
    });
    return attrs;
  };

  const processImage = (savedSrc: string, attrPart: string, overlay: string | null, isStandard = false, lowerTag = "img") => {
    const attrs = parseAttrs(attrPart || "");
    let height = '';
    let pos = attrs.p || '';
    let posX = attrs.x || '';
    let width = attrs.w || '';
    let align = attrs.a || 'c';

    const hVal = attrs.h;
    if (hVal) {
      const num = parseInt(hVal);
      height = (!isNaN(num) && num > 1500) ? '1500' : hVal.replace('px', '');
    }

    const isHeaderKeyword = ['header', 'capa', 'banner'].includes(lowerTag);
    const isAcervoKeyword = ['imagem', 'image', 'atm', 'atmosfera', 'acervo'].includes(lowerTag);
    const isTransparent = savedSrc.includes('image/png') || savedSrc.includes('image/webp');
    const defaultHeight = isHeaderKeyword ? '280px' : (overlay !== undefined ? '150px' : 'auto');
    const customHeight = height ? `${height}px` : defaultHeight;
    const customPX = posX ? `${posX}%` : 'center';
    const customPY = pos ? `${pos}%` : 'center';
    const customPos = `${customPX} ${customPY}`;
    
    const baseWidth = width ? Number(width) : 100;
    const effectiveWidth = isViewMode && !width ? 112 : baseWidth;
    const customWidth = effectiveWidth > 100 ? (effectiveWidth > 200 ? '200%' : `${effectiveWidth}%`) : `${effectiveWidth}%`;
    
    const canExpand = isHeaderKeyword || lowerTag === 'img' || (baseWidth > 100 && !isAcervoKeyword) || isViewMode;
    const marginX = (effectiveWidth > 100 && canExpand) ? `calc(-${(effectiveWidth - 100) / 2}%)` : '0';
    
    const borderStyle = isTransparent ? 'border: none;' : 'border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 0 20px rgba(0,0,0,0.5); box-sizing: border-box;';
    const renderStyleBase = `height: 100%; width: 100%; object-position: ${customPos}; image-rendering: auto; display: block;`;
    
    const hasOverlayText = overlay && overlay.trim() !== "";
    const flexClass = (width || effectiveWidth !== 100) ? 'flex-none' : 'flex-1';
    
    let imgHtml = "";
    if (overlay !== undefined && overlay !== null) {
      imgHtml = `<div class="relative rounded-2xl overflow-hidden flex items-center justify-center ${flexClass} min-w-0" style="height: ${customHeight}; width: ${customWidth}; max-width: none !important; margin-left: ${marginX}; margin-right: ${marginX}; border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 0 20px rgba(0,0,0,0.5);">
                  <img src="${savedSrc}" loading="lazy" decoding="async" class="absolute inset-0 w-full h-full object-cover" style="${renderStyleBase}" />
                  ${hasOverlayText ? `
                  <div class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
                     <div class="text-white font-syncopate font-black uppercase tracking-[0.2em] text-center text-[10px] leading-tight drop-shadow-lg">${formatTags(overlay.trim(), true)}</div>
                  </div>
                  ` : ''}
                </div>`;
    } else {
      imgHtml = `<div class="${flexClass} min-w-0" style="width: ${customWidth}; max-width: none !important; margin-left: ${marginX}; margin-right: ${marginX};">
                <img src="${savedSrc}" loading="lazy" decoding="async" class="w-full rounded-2xl object-cover block" style="${renderStyleBase} ${borderStyle} height: ${customHeight};" />
              </div>`;
    }
    return { html: imgHtml, align: align };
  };

  // First pass: Handle standard [tag attributes] or [ref: attributes]
  p = p.replace(mainVimgRegex, (match, vimgId, attrPart, overlayQ, overlayB) => {
      if (match.startsWith('__IMG_PLACEHOLDER_')) return match;
      const overlay = overlayQ || overlayB || null;
      const baseId = vimgId.replace(/^vimg_/i, '');
      
      let savedSrc = tryGet(vimgId) || 
                       tryGet(baseId) || 
                       tryGet('vimg_' + baseId) || 
                       tryGet('img_' + baseId) ||
                       tryGet('vimg_img_' + baseId);
      
      if (!savedSrc && vimgId.startsWith('ref:')) {
          const actualId = vimgId.replace('ref:', '');
          savedSrc = tryGet(actualId) || tryGet('vimg_' + actualId);
      }

      if (!savedSrc) return match;
      
      const res = processImage(savedSrc, attrPart, overlay, false, "img");
      images.push(res);
      return `__IMG_PLACEHOLDER_${images.length - 1}__`;
  });

  // Loose references (vimg_ID without brackets)
  p = p.replace(looseVimgRegex, (match, vimgId) => {
      const savedSrc = tryGet(vimgId);
      if (!savedSrc) return match;
      const res = processImage(savedSrc, "", null, false, "img");
      images.push(res);
      return `__IMG_PLACEHOLDER_${images.length - 1}__`;
  });

  p = p.replace(standardImgRegex, (match, tagOrId, idValue, attrs, overlayQ, overlayB) => {
      if (match.toLowerCase().includes('vimg_')) return match;
      const overlay = overlayQ || overlayB || null;
      let id = (idValue || tagOrId).trim();
      let finalAttrs = attrs || "";
      let savedSrc: string | null = null;

      // Keywords support
      const lowerTag = tagOrId.toLowerCase();
      const keywords = ['header', 'capa', 'banner', 'imagem', 'image', 'atm', 'atmosfera'];
      
      if (keywords.includes(lowerTag)) {
        if (contextImages && contextImages.length > 0) {
          let idx = 0;
          if (idValue && !isNaN(Number(idValue))) {
            idx = Number(idValue) - 1; // 1-based indexing
          }
          if (idx >= 0 && idx < contextImages.length) {
            const img = contextImages[idx];
            savedSrc = resolveImageRef(typeof img === 'string' ? img : img.src);
          }
        }
      }

      if (!savedSrc) {
        const lowerId = id.toLowerCase();
        if (['b', 'i', 'u', 's', 'c', '/b', '/i', '/u', '/s', '/c'].includes(lowerId)) return match;
        if (lowerId.length === 1 && 'biusc'.includes(lowerId)) return match;

        // Extensive lookup strategy: Priority 1 - contextImages match by ID
        if (contextImages && contextImages.length > 0) {
            const contextMatch = contextImages.find(img => typeof img === 'object' && img !== null && img.id === id);
            if (contextMatch) {
                savedSrc = resolveImageRef(contextMatch.src);
            }
        }

        // Priority 2 - LocalStorage with vimg_ prefix awareness
        if (!savedSrc) {
            const cleanId = id.replace(/^(vimg_|img_)/i, '');
            savedSrc = tryGet('vimg_' + cleanId) || 
                       tryGet(id) || 
                       tryGet('img_' + cleanId) ||
                       tryGet('vimg_img_' + cleanId) ||
                       tryGet('vimg_' + id);
        }
        
        // Priority 3 - Data URL, Direct link or ref:
        if (!savedSrc && (id.startsWith('data:image') || id.startsWith('http') || id.startsWith('ref:'))) {
            savedSrc = resolveImageRef(id);
        }
      }
      
      if (!savedSrc) return match; 
      
      const res = processImage(savedSrc, finalAttrs, overlay, true, lowerTag);
      images.push(res);
      return `__IMG_PLACEHOLDER_${images.length - 1}__`;
    });
    
    p = formatTags(p, false);
    
    // Lógica para agrupar placeholders consecutivos (sem quebra de linha)
    const placeholderClusterRegex = /((?:__IMG_PLACEHOLDER_\d+__[\t ]*)+)/g;
    p = p.replace(placeholderClusterRegex, (cluster) => {
      const ids = cluster.match(/\d+/g) || [];
      if (ids.length === 0) return cluster;
      
      let resultHtml = "";
      // Agrupar em blocos de no máximo 8
      for (let i = 0; i < ids.length; i += 8) {
        const chunk = ids.slice(i, i + 8);
        const firstImg = images[Number(chunk[0])];
        const rowAlign = firstImg.align === 'l' ? 'justify-start' : firstImg.align === 'r' ? 'justify-end' : 'justify-center';
        
        const rowHtml = chunk.map(id => images[Number(id)].html).join('');
        resultHtml += `<div class="w-full flex flex-wrap ${rowAlign} gap-1 my-1 leading-[0] m-0 p-0">${rowHtml}</div>`;
      }
      return resultHtml;
    });
    
    return `<div class="min-h-[1.2em] leading-relaxed whitespace-pre-wrap" style="${customTextColor ? `color: ${customTextColor}` : ''}">${p}</div>`;
};

const getWallpaperOpacity = (color: string) => {
  if (!color || color === 'transparent' || color === '#00000000') return 1;
  const hsla = hexToHsla(color);
  if (hsla.l < 10) return 0.25;
  return 0.75;
};

const getWallpaperFilter = (color: string) => {
  if (!color || color === 'transparent' || color === '#00000000') return 'none';
  const hsla = hexToHsla(color);
  if (hsla.l < 10) return 'saturate(0.5) brightness(0.4)';
  return 'none';
};

const SlideshowWallpaper = ({ images, color, opacity, filter, noGradient = false, bottomColor = 'transparent' }: { images: (string | {src: string, position?: number})[], color: string, opacity: number, filter: string, noGradient?: boolean, bottomColor?: string }) => {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => {
      setIndex(prev => (prev + 1) % images.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [images.length]);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden">
      {images.length > 0 ? images.map((img, i) => {
        const src = resolveImageRef(typeof img === 'string' ? img : img.src);
        const position = typeof img === 'string' ? 'center center' : `center ${img.position ?? 50}%`;
        return (
          <img 
            key={i} 
            src={src} 
            loading={i === 0 ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={i === 0 ? "high" : "low"}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out 4k-texture`}
            style={{ 
              opacity: i === index ? opacity : 0, 
              filter: filter, 
              objectPosition: position,
              imageRendering: 'high-quality',
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden'
            }} 
            alt="Wallpaper"
          />
        );
      }) : (
         <div className="absolute inset-0 bg-slate-900 opacity-20" />
      )}
      {!noGradient && (
        <div className="absolute inset-0 z-10" style={{ background: `linear-gradient(to bottom, ${color} 0%, ${bottomColor} 100%)` }}></div>
      )}
    </div>
  );
};

// Ícones de Avaliação Customizados
const StarIcon = ({ active, className }: { active: boolean, className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const HeartIcon = ({ active, className }: { active: boolean, className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const getWikiNarrative = (content: string) => {
  if (!content) return "";
  const registroMarker = '[B]REGISTRO:[/B]';
  const tagMarker = '[B]TAGS:[/B]';
  
  if (content.includes(registroMarker)) {
    const afterRegistro = content.split(registroMarker)[1];
    if (afterRegistro) {
      const cleaned = afterRegistro.trim();
      if (cleaned.includes(tagMarker)) {
        return cleaned.split(tagMarker)[0].trim();
      }
      return cleaned;
    }
  }
  return content;
};

const ProfileView: React.FC<ProfileViewProps> = ({ onBack, profile, onProfileUpdate, verifySafety, userAvatar, userName, addNotification, onEditPost, onDeletePost }) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent | Event) => {
      setNow(Date.now());
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('void_storage_update', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('void_storage_update', handleStorageChange);
    };
  }, []);

   const avatarInputRef = useRef<HTMLInputElement>(null);
  const hub01InputRef = useRef<HTMLInputElement>(null);
  const hub02InputRef = useRef<HTMLInputElement>(null);
  const bioImageInputRef = useRef<HTMLInputElement>(null);
  const editorImageInputRef = useRef<HTMLInputElement>(null);
  const bioTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const editorTextAreaRef = useRef<HTMLTextAreaElement>(null);
  
  const muralWallInputRef = useRef<HTMLInputElement>(null);
  const muralFeedInputRef = useRef<HTMLInputElement>(null);

  const wikiAvatarRef = useRef<HTMLInputElement>(null);
  const wikiTopRef = useRef<HTMLInputElement>(null);
  const wikiBgRef = useRef<HTMLInputElement>(null);
  const wikiGalleryRef = useRef<HTMLInputElement>(null);
  const wikiNarrativeImageRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('POSTS');
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const [showGradients, setShowGradients] = useState(true);
  const [isMuralExpanded, setIsMuralExpanded] = useState(false);
  const [isMuralHubActive, setIsMuralHubActive] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [selectedFullImage, setSelectedFullImage] = useState<string | null>(null);

  useEffect(() => {
    (window as any).showVoidImgViewer = (src: string) => {
      setSelectedFullImage(src);
    };
    return () => {
      delete (window as any).showVoidImgViewer;
    };
  }, []);

  const handleDownload = (src: string) => {
    const link = document.createElement('a');
    link.href = src;
    link.download = `voidy_image_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShareImageOverlay = async (src: string) => {
    if (navigator.share) {
      try {
        const response = await fetch(src);
        const blob = await response.blob();
        const file = new File([blob], 'voidy_image.png', { type: blob.type });
        await navigator.share({
          files: [file],
          title: 'Vácuo Profundo',
        });
      } catch (e) {
        alert("Erro ao compartilhar.");
      }
    } else {
      alert("Compartilhamento não suportado.");
    }
  };
  const [isWikiMenuOpen, setIsWikiMenuOpen] = useState(false);
  const [isBlogMenuOpen, setIsBlogMenuOpen] = useState(false);
  const [activeMuralMenu, setActiveMuralMenu] = useState<string | null>(null);

  const [showEditor, setShowEditor] = useState<'BLOG' | 'WIKI' | 'POST' | null>(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorViewMode, setEditorViewMode] = useState<'editor' | 'preview'>('editor');

  const [wikiAvatar, setWikiAvatar] = useState<string | null>(null);
  const [wikiAvatarPosition, setWikiAvatarPosition] = useState(50);
  const [wikiTopColor, setWikiTopColor] = useState('#1a2036');
  const [wikiBgColor, setWikiBgColor] = useState('#02040a');
  const [wikiTopImages, setWikiTopImages] = useState<{id: string, src: string}[]>([]);
  const [wikiBgImages, setWikiBgImages] = useState<{src: string, position: number}[]>([]);
  const [wikiGallery, setWikiGallery] = useState<{src: string, position: number}[]>([]);
  const [wikiKeywords, setWikiKeywords] = useState('');
  const [wikiHideOverlay, setWikiHideOverlay] = useState(false);
  const [wikiWideMode, setWikiWideMode] = useState(false);

  useEffect(() => {
    if (showEditor === 'BLOG') {
      setWikiWideMode(true);
    }
  }, [showEditor]);
  const [isSavingWiki, setIsSavingWiki] = useState(false);
  const [wikiSaveProgress, setWikiSaveProgress] = useState(0);
  const [editingWikiId, setEditingWikiId] = useState<string | null>(null);
  const [fullViewImage, setFullViewImage] = useState<{ src: string, id?: string, type: 'SAVED' | 'GALLERY' } | null>(null);
  const [wikiInfoRows, setWikiInfoRows] = useState<{label: string, value: string, type?: 'text' | 'rating_star' | 'rating_heart'}[]>([
    { label: 'Avaliação', value: '0', type: 'rating_star' },
    { label: 'O que gosta', value: '', type: 'text' },
    { label: 'O que odeia', value: '', type: 'text' }
  ]);

  const isAiProcessing = useRef<Set<string>>(new Set());

  useEffect(() => {
     const generateWikiNarrativeImages = async () => {
        const contentToScan = showEditor === 'WIKI' ? editorContent : (selectedPost?.tag === 'WIKI' ? selectedPost.content : '');
        const titleToUse = showEditor === 'WIKI' ? editorTitle : (selectedPost?.title || 'Wiki');
        
        if (!contentToScan) return;
        const vimgMatches = contentToScan.matchAll(/vimg_[a-zA-Z0-9_-]+/gi);
        
        for (const match of vimgMatches) {
           const vimgId = match[0];
           if (localStorage.getItem(vimgId) || localStorage.getItem(vimgId.toLowerCase()) || localStorage.getItem(vimgId.toUpperCase())) continue;
           if (isAiProcessing.current.has(vimgId)) continue;
           isAiProcessing.current.add(vimgId);

           try {
              const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
              const prompt = `Gere uma ilustração cinematográfica e imersiva para o RPG VOIDY:\n\nAssunto: ${titleToUse}\nContexto: ${contentToScan.substring(0, 500)}\n\nEstilo: Sci-fi, Cyberpunk, Neo-noir, luzes neon, sombras profundas, alta fidelidade.`;
              
              const result = await ai.models.generateContent({
                 model: MODEL_IMAGE,
                 contents: [{ role: 'user', parts: [{ text: prompt }] }],
                 config: { imageConfig: { aspectRatio: "16:9" } }
              });

              for (const part of result.candidates[0].content.parts) {
                 if (part.inlineData) {
                    const base64 = `data:image/png;base64,${part.inlineData.data}`;
                    localStorage.setItem(vimgId, base64);
                    // Force re-render of components using this image
                    window.dispatchEvent(new Event('storage'));
                    window.dispatchEvent(new Event('void_storage_update'));
                    break;
                 }
              }
           } catch (err) {
              console.error("Wiki Narrative Image Gen Error:", err);
           } finally {
              isAiProcessing.current.delete(vimgId);
           }
        }
     };

     const timeout = setTimeout(() => {
        generateWikiNarrativeImages();
     }, 2000);
     
     return () => clearTimeout(timeout);
  }, [editorContent, selectedPost, editorTitle, showEditor]);

  const resetEditorState = () => {
    setEditorTitle('');
    setEditorContent('');
    setWikiAvatar(null);
    setWikiTopColor('#1a2036');
    setWikiBgColor('#02040a');
    setWikiTopImages([]);
    setWikiBgImages([]);
    setWikiGallery([]);
    setWikiKeywords('');
    setWikiHideOverlay(false);
    setEditingWikiId(null);
    setShowEditor(null);
    setWikiInfoRows([
      { label: 'Avaliação', value: '0', type: 'rating_star' },
      { label: 'O que gosta', value: '', type: 'text' },
      { label: 'O que odeia', value: '', type: 'text' }
    ]);
    setEditorMuralInput('');
    setTempWikiMural([]);
  };

  const [muralInput, setMuralInput] = useState('');
  const [wikiMuralInput, setWikiMuralInput] = useState('');
  const [editorMuralInput, setEditorMuralInput] = useState('');
  const [tempWikiMural, setTempWikiMural] = useState<MuralPost[]>([]);

  const handleDelete = (post: FeedPost) => {
    onDeletePost?.(post.id);
  };

  const insertTag = (tag: string) => {
    const textarea = editorTextAreaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const selected = text.substring(start, end);
      const before = text.substring(0, start);
      const after = text.substring(end);
      
      const openTag = `[${tag}]`;
      setEditorContent(before + openTag + selected + after);
    }
  };

  const [tempName, setTempName] = useState(profile.name);
  const [tempBio, setTempBio] = useState(profile.bio || '');
  const [tempAvatar, setTempAvatar] = useState(profile.avatarUrl);
  const [tempPanelColor, setTempPanelColor] = useState(profile.panelColor || '#1a2036');
  const [tempContentColor, setTempContentColor] = useState(profile.contentColor || '#02040a');
  const [tempFrameColor, setTempFrameColor] = useState(profile.frameColor || '#22d3ee');
  const [tempNameColor, setTempNameColor] = useState(profile.nameColor || '#ffffff');
  const [tempMuralTopColor, setTempMuralTopColor] = useState(profile.muralTopColor || 'transparent');
  const [tempMuralFeedColor, setTempMuralFeedColor] = useState(profile.muralFeedColor || '#02040a');
  const [tempPanelImage, setTempPanelImage] = useState(profile.panelImage || '');
  const [tempContentImage, setTempContentImage] = useState(profile.contentImage || '');
  const [tempMuralImage, setTempMuralImage] = useState(profile.muralImage || '');
  const [tempMuralFeedImage, setTempMuralFeedImage] = useState(profile.muralFeedImage || '');
  const [tempFrameStyle, setTempFrameStyle] = useState(profile.frameStyle || 'NEON');
  const [tempStatusIcon, setTempStatusIcon] = useState(profile.statusIcon || '🔮');
  const [tempStatusColor, setTempStatusColor] = useState(profile.statusColor || '#22c55e');

  useEffect(() => {
    if (!isEditing) {
      setTempName(profile.name);
      setTempBio(profile.bio || '');
      setTempAvatar(profile.avatarUrl);
      setTempPanelColor(profile.panelColor || '#1a2036');
      setTempContentColor(profile.contentColor || '#02040a');
      setTempFrameColor(profile.frameColor || '#22d3ee');
      setTempNameColor(profile.nameColor || '#ffffff');
      setTempMuralTopColor(profile.muralTopColor || 'transparent');
      setTempMuralFeedColor(profile.muralFeedColor || '#02040a');
      setTempPanelImage(profile.panelImage || '');
      setTempContentImage(profile.contentImage || '');
      setTempMuralImage(profile.muralImage || '');
      setTempMuralFeedImage(profile.muralFeedImage || '');
      setTempFrameStyle(profile.frameStyle || 'NEON');
      setTempStatusIcon(profile.statusIcon || '🔮');
      setTempStatusColor(profile.statusColor || '#22c55e');
    }
  }, [profile, isEditing]);

  const activeMainBgColor = isEditing 
    ? (isMuralHubActive ? tempMuralFeedColor : tempContentColor)
    : (profile.contentColor || '#02040a');
    
  const activeTopBgColor = isEditing 
    ? (isMuralHubActive ? tempMuralTopColor : tempPanelColor)
    : (profile.panelColor || '#1a2036');

    const activeTopWallpaper = useMemo(() => {
        const raw = isEditing 
            ? (isMuralHubActive ? tempMuralImage : tempPanelImage)
            : (profile.panelImage || '');
        return resolveImageRef(raw);
    }, [isEditing, isMuralHubActive, tempMuralImage, tempPanelImage, profile.panelImage]);

    const activeFeedWallpaper = useMemo(() => {
        const raw = isEditing 
            ? (isMuralHubActive ? tempMuralFeedImage : tempContentImage)
            : (profile.contentImage || '');
        return resolveImageRef(raw);
    }, [isEditing, isMuralHubActive, tempMuralFeedImage, tempContentImage, profile.contentImage]);

  const feedContrast = getContrastBase(activeMainBgColor);
  const topContrast = getContrastBase(activeTopBgColor);

  const [activePicker, setActivePicker] = useState<{ field: string, label: string } | null>(null);
  const [pickerHsla, setPickerHsla] = useState({ h: 0, s: 100, l: 50, a: 1 });
  const [tempHexInput, setTempHexInput] = useState('');

  const [plusRotation, setPlusRotation] = useState(0);
  const [fabRotation, setFabRotation] = useState(0);
  const [spinCount, setSpinCount] = useState(0);
  const [isMorphing, setIsMorphing] = useState(false);

  const defaultColors = useMemo(() => ({
    panel: 'transparent',
    content: 'transparent',
    frame: 'transparent',
    name: 'transparent',
    muralTop: 'transparent',
    muralFeed: 'transparent',
    wikiTop: '#1a2036',
    wikiBg: '#02040a'
  }), []);

  const { firstBioImageSrc, isFirstBioImageTransparent } = useMemo(() => {
    if (!profile.bio) return { firstBioImageSrc: null, isFirstBioImageTransparent: false };
    const match = /\[(?:vimg_)?(img_[a-z0-9]+)/i.exec(profile.bio);
    if (match) {
      const src = localStorage.getItem('vimg_' + match[1]);
      const isTransparent = src ? (src.includes('image/png') || src.includes('image/webp')) : false;
      return { firstBioImageSrc: src, isFirstBioImageTransparent: isTransparent };
    }
    return { firstBioImageSrc: null, isFirstBioImageTransparent: false };
  }, [profile.bio]);

  const fabTheme = useMemo(() => {
    const hsla = hexToHsla(activeMainBgColor);
    const h = hsla.h;
    const s = hsla.s;
    const l = hsla.l;
    const iconCls = 'text-white';
    let dynamicGradient = '';
    if (s < 10) dynamicGradient = 'bg-[linear-gradient(135deg,#64748b_0%,#334155_60%,#0f172a_100%)]';
    else if (h >= 35 && h < 80) dynamicGradient = 'bg-[linear-gradient(135deg,#fbbf24_0%,#9a3412_70%,#451a03_100%)]';
    else if (h >= 240 && h < 280) dynamicGradient = 'bg-[linear-gradient(135deg,#a855f7_0%,#581c87_70%,#2e1065_100%)]';
    else if (h >= 280 && h <= 345) dynamicGradient = 'bg-[linear-gradient(135deg,#db2777_0%,#831843_70%,#500724_100%)]';
    else if (l < 15) dynamicGradient = 'bg-[linear-gradient(135deg,#475569_0%,#1e293b_60%,#020617_100%)]';
    else if (h >= 345 || h <= 20) dynamicGradient = 'bg-[linear-gradient(135deg,#ef4444_0%,#7f1d1d_70%,#450a0a_100%)]';
    else if (h >= 80 && h <= 160) dynamicGradient = 'bg-[linear-gradient(135deg,#22c55e_0%,#14532d_70%,#052e16_100%)]';
    else if (h > 160 && h < 240) dynamicGradient = 'bg-[linear-gradient(135deg,#3b82f6_0%,#1e3a8a_70%,#0a1931_100%)]';
    else dynamicGradient = 'bg-[linear-gradient(135deg,#06b6d4_0%,#155e75_70%,#020617_100%)]';
    if (l > 85) return { shape: 'circle', gradient: dynamicGradient, cls: 'rounded-full', clip: '', style: { borderRadius: '9999px' }, baseRot: 0, scale: 1, iconRot: '', iconCls };
    if (h >= 75 && h <= 165 && s > 20) return { shape: 'drop', gradient: dynamicGradient, cls: '', clip: '', style: { borderRadius: '0% 50% 50% 50%' }, baseRot: 0, scale: 0.85, iconRot: '', iconCls };
    if ((h > 340 || h <= 25) && s > 25) return { shape: 'rounded-square', gradient: dynamicGradient, cls: '', clip: '', style: { borderRadius: '1.4rem' }, baseRot: 0, scale: 1, iconRot: '', iconCls };
    if (h >= 35 && h < 80 && s > 20) return { shape: 'triangle', gradient: dynamicGradient, cls: '', clip: 'url(#rounded-triangle-clip-v2)', style: { }, baseRot: 0, scale: 1, iconRot: 'mt-3', iconCls };
    if (h >= 280 && h <= 345 && s > 20) return { shape: 'diamond', gradient: dynamicGradient, cls: '', clip: '', style: { borderRadius: '0.6rem' }, baseRot: 45, scale: 0.85, iconRot: '', iconCls };
    return { shape: 'circle-colored', gradient: dynamicGradient, cls: 'rounded-full', clip: '', style: { borderRadius: '9999px' }, baseRot: 0, scale: 1, iconRot: '', iconCls };
  }, [activeMainBgColor]);

  const fabIconUrl = useMemo(() => {
    const hsla = hexToHsla(activeMainBgColor);
    const h = hsla.h;
    const s = hsla.s;
    const l = hsla.l;
    if (l > 92) return "https://storage.googleapis.com/voidyapp-storage/%C3%8Dcone%20circulo%20chocolate.png";
    if (s < 10 && l < 15) return "https://storage.googleapis.com/voidyapp-storage/%C3%8Dcone%20vermelho%20quadrado.png"; 
    if (h >= 80 && h < 165 && s > 20) return "https://storage.googleapis.com/voidyapp-storage/%C3%8Dcone%20quadrado%20verde.png";
    if (h >= 10 && h < 50 && s > 20) return "https://storage.googleapis.com/voidyapp-storage/Losango%20%C3%ADcone%20laranja.png";
    if (h >= 240 && h < 285 && s > 20) return "https://storage.googleapis.com/voidyapp-storage/Losango%20roxo%20%C3%ADcone.png";
    if (h >= 50 && h < 80 && s > 20) return "https://storage.googleapis.com/voidyapp-storage/Losango%20amarelo%20%C3%ADcone.png";
    if (h >= 285 && h < 345 && s > 20) return "https://storage.googleapis.com/voidyapp-storage/Losango%20rosa%20%C3%ADcone.png";
    if (h >= 170 && h < 205 && s > 20) return "https://storage.googleapis.com/voidyapp-storage/Quadrado%20azul%20claro%20%C3%ADcone.png";
    if (h >= 205 && h < 240 && s > 20) return "https://storage.googleapis.com/voidyapp-storage/Quadrado%20azul%20escuro%20icone.png";
    return "https://storage.googleapis.com/voidyapp-storage/%C3%8Dcone%20vermelho%20quadrado.png";
  }, [activeMainBgColor]);

  const isPurpleIcon = fabIconUrl.includes('roxo');
  const isPinkDiamond = fabIconUrl.includes('rosa') && fabIconUrl.includes('Losango');

  const activeMainShadowColor = useMemo(() => {
    const hsla = hexToHsla(activeMainBgColor);
    return `hsla(${hsla.h}, ${hsla.s}%, 2%, 0.5)`;
  }, [activeMainBgColor]);

  const iconScale = useMemo(() => {
    if (fabIconUrl.includes('chocolate')) return 0.65; 
    if (fabIconUrl.includes('azul%20escuro') || fabIconUrl.includes('azul%20claro') || fabIconUrl.includes('verde')) return 0.85; 
    return 1;
  }, [fabIconUrl]);

  useEffect(() => {
    setIsMorphing(true);
    const timer = setTimeout(() => setIsMorphing(false), 600);
    return () => clearTimeout(timer);
  }, [fabIconUrl]);

  // Persistent Wiki Draft
  useEffect(() => {
    if (showEditor === 'WIKI') {
      const draft = {
        editorTitle,
        editorContent,
        wikiAvatar,
        wikiTopColor,
        wikiBgColor,
        wikiTopImages,
        wikiBgImages,
        wikiGallery,
        wikiKeywords,
        wikiHideOverlay,
        wikiWideMode,
        wikiInfoRows,
        editingWikiId
      };
      try {
        localStorage.setItem('voidy_wiki_draft_v1', JSON.stringify(draft));
      } catch (e) {
        console.warn("Draft too large for storage");
      }
    }
  }, [showEditor, editorTitle, editorContent, wikiAvatar, wikiTopColor, wikiBgColor, wikiTopImages, wikiBgImages, wikiGallery, wikiKeywords, wikiHideOverlay, wikiInfoRows, editingWikiId]);

  useEffect(() => {
    const savedDraft = localStorage.getItem('voidy_wiki_draft_v1');
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft);
        if (draft.editorTitle) setEditorTitle(draft.editorTitle);
        if (draft.editorContent) setEditorContent(draft.editorContent);
        if (draft.wikiAvatar) setWikiAvatar(draft.wikiAvatar);
        if (draft.wikiTopColor) setWikiTopColor(draft.wikiTopColor);
        if (draft.wikiBgColor) setWikiBgColor(draft.wikiBgColor);
        if (draft.wikiTopImages) setWikiTopImages(draft.wikiTopImages);
        if (draft.wikiBgImages) setWikiBgImages(draft.wikiBgImages);
        if (draft.wikiGallery) setWikiGallery(draft.wikiGallery);
        if (draft.wikiKeywords) setWikiKeywords(draft.wikiKeywords);
        if (draft.wikiWideMode !== undefined) setWikiWideMode(draft.wikiWideMode);
        if (draft.wikiHideOverlay !== undefined) setWikiHideOverlay(draft.wikiHideOverlay);
        if (draft.wikiInfoRows) setWikiInfoRows(draft.wikiInfoRows);
        if (draft.editingWikiId) setEditingWikiId(draft.editingWikiId);
      } catch (e) {
        console.error("Draft recovery error", e);
      }
    }
  }, []);

  const compressAndInsertImage = (base64: string, isBio: boolean) => {
    const processImage = (data: string) => {
      const imgId = Math.random().toString(36).substring(2, 7);
      const fullId = `img_${imgId}`;
      try {
        const savedRef = saveToMediaStorage(data);
        localStorage.setItem('vimg_' + fullId, data);
        
        if (showEditor === 'WIKI') {
          setWikiTopImages(prev => [...prev, { id: fullId, src: savedRef }]);
          setEditorContent(prev => {
            const textarea = editorTextAreaRef.current;
            const start = textarea?.selectionStart ?? prev.length;
            const end = textarea?.selectionEnd ?? start;
            const insertId = fullId.startsWith('vimg_') ? fullId : `vimg_${fullId}`;
            return prev.substring(0, start) + `[${insertId} h=150 p=50 x=50 w=100 a=c] ""` + prev.substring(end);
          });
        } else if (isBio) {
          setTempBio(prev => {
            const textarea = bioTextAreaRef.current;
            const start = textarea?.selectionStart ?? prev.length;
            const end = textarea?.selectionEnd ?? start;
            const insertId = fullId.startsWith('vimg_') ? fullId : `vimg_${fullId}`;
            return prev.substring(0, start) + `[${insertId} h=150 p=50 x=50 w=100 a=c] ""` + prev.substring(end);
          });
        } else {
          setEditorContent(prev => {
            const textarea = editorTextAreaRef.current;
            const start = textarea?.selectionStart ?? prev.length;
            const end = textarea?.selectionEnd ?? start;
            const insertId = fullId.startsWith('vimg_') ? fullId : `vimg_${fullId}`;
            return prev.substring(0, start) + `[${insertId} h=150 p=50 x=50 w=100 a=c] ""` + prev.substring(end);
          });
        }
        if (verifySafety) verifySafety(data).catch(console.error);
      } catch (err) { 
        alert("Ativo visual pesado demais ou memória cheia."); 
      }
    };

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 1024;
        let width = img.width;
        let height = img.height;
        if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
        else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          const mime = base64.split(';')[0]?.split(':')[1]?.split(';')[0] || 'image/jpeg';
          const outputMime = (mime === 'image/png' || mime === 'image/webp') ? mime : 'image/jpeg';
          const compressed = canvas.toDataURL(outputMime, 0.82);
          processImage(compressed);
        } else {
          processImage(base64);
        }
      } catch (e) {
        processImage(base64);
      }
    };
    img.onerror = () => processImage(base64);
    img.src = base64;
  };

  const handleInsertBioImage = (e: React.ChangeEvent<HTMLInputElement>, isBio: boolean) => {
    const target = e.target;
    const file = target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        compressAndInsertImage(base64, isBio);
        target.value = '';
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageInput = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const target = e.target;
    const file = target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 1024;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
          } else {
            if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const mime = base64.split(';')[0]?.split(':')[1]?.split(';')[0] || 'image/jpeg';
            const outputMime = (mime === 'image/png' || mime === 'image/webp') ? mime : 'image/jpeg';
            const compressedBase64 = canvas.toDataURL(outputMime, 0.82);
            setter(saveToMediaStorage(compressedBase64));
            if (verifySafety) verifySafety(compressedBase64).catch(console.error);
          } else {
            setter(saveToMediaStorage(base64));
          }
        } catch (err) {
          console.error("Scale error", err);
          setter(saveToMediaStorage(base64));
        }
      };
      img.onerror = () => {
        setter(saveToMediaStorage(base64));
      };
      img.src = base64;
    };
    reader.readAsDataURL(file);
    target.value = '';
  };

  const handleWikiTopUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target;
    const files = Array.from(target.files || []).slice(0, 10) as File[];
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 1200;
          let width = img.width;
          let height = img.height;
          if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
          else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const mime = base64.split(';')[0]?.split(':')[1]?.split(';')[0] || 'image/jpeg';
            const outputMime = (mime === 'image/png' || mime === 'image/webp') ? mime : 'image/jpeg';
            const compressedBase64 = canvas.toDataURL(outputMime, 0.82);
            const imgId = Math.random().toString(36).substring(2, 7);
            const fullId = `img_${imgId}`;
            try {
              const savedRef = saveToMediaStorage(compressedBase64);
              setWikiTopImages(prev => [...prev, { id: fullId, src: savedRef }]);
              if (verifySafety) verifySafety(compressedBase64).catch(console.error);
            } catch (err) { alert("Ativo visual pesado demais."); }
          }
        };
        img.onerror = () => { console.error("Loading error for wiki top"); };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    });
    target.value = '';
  };

  const handleInsertWikiGallery = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target;
    const files = Array.from(target.files || []).slice(0, 10) as File[];
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 1024;
          let width = img.width;
          let height = img.height;
          if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
          else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const mime = base64.split(';')[0]?.split(':')[1]?.split(';')[0] || 'image/jpeg';
            const outputMime = (mime === 'image/png' || mime === 'image/webp') ? mime : 'image/jpeg';
            const compressedBase64 = canvas.toDataURL(outputMime, 0.82);
            try {
              const savedRef = saveToMediaStorage(compressedBase64);
              if (showEditor === 'BLOG') {
                // For Blog, insert tag into content and add to gallery for the "Imagens Salvas" row
                setWikiGallery(prev => [...prev, { id: savedRef, src: savedRef, position: 50 }]);
                setEditorContent(prev => prev + (prev.endsWith('\n') ? '' : '\n') + `[vimg_${savedRef} w=100 x=50 p=50 h=300]\n`);
              } else {
                setWikiGallery(prev => [...prev, { src: savedRef, position: 50 }]);
              }
              if (verifySafety) verifySafety(compressedBase64).catch(console.error);
            } catch (err) { alert("Galeria pesada demais."); }
          }
        };
        img.onerror = () => { console.error("Error loading image for wiki gallery"); };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    });
    target.value = '';
  };

  const handleInsertWikiBg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target;
    const files = Array.from(target.files || []).slice(0, 10) as File[];
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 1200;
          let width = img.width;
          let height = img.height;
          if (width > height) { if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } } 
          else { if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; } }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const mime = base64.split(';')[0]?.split(':')[1]?.split(';')[0] || 'image/jpeg';
            const outputMime = (mime === 'image/png' || mime === 'image/webp') ? mime : 'image/jpeg';
            const compressedBase64 = canvas.toDataURL(outputMime, 0.72);
            try {
              const savedRef = saveToMediaStorage(compressedBase64);
              setWikiBgImages(prev => [...prev, { src: savedRef, position: 50 }]);
              if (verifySafety) verifySafety(compressedBase64).catch(console.error);
            } catch (err) { alert("Fundo pesado demais."); }
          }
        };
        img.onerror = () => { console.error("Error loading wiki background"); };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    });
    target.value = '';
  };

  const openPicker = (field: string, label: string, currentHex: string) => {
    setActivePicker({ field, label });
    const hex = currentHex === 'transparent' ? '#00000000' : currentHex;
    setTempHexInput(hex === '#00000000' ? '' : hex);
    const hsla = hexToHsla(hex);
    setPickerHsla(hsla);
  };

  const updatePickerColor = (h: number, s: number, l: number, a: number) => {
    const newHex = hslaToHex(h, s, l, a);
    setPickerHsla({ h, s, l, a });
    setTempHexInput(newHex === 'transparent' ? '' : newHex);
    if (activePicker?.field === 'panel') setTempPanelColor(newHex);
    else if (activePicker?.field === 'content') setTempContentColor(newHex);
    else if (activePicker?.field === 'frame') setTempFrameColor(newHex);
    else if (activePicker?.field === 'name') setTempNameColor(newHex);
    else if (activePicker?.field === 'muralTop') setTempMuralTopColor(newHex);
    else if (activePicker?.field === 'muralFeed') setTempMuralFeedColor(newHex);
    else if (activePicker?.field === 'statusColor') setTempStatusColor(newHex);
    else if (activePicker?.field === 'wikiTop') setWikiTopColor(newHex);
    else if (activePicker?.field === 'wikiBg') setWikiBgColor(newHex);
  };

  const handleHexInput = (hex: string) => {
    if (hex.length > 7) return;
    setTempHexInput(hex);
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      const hsla = hexToHsla(hex);
      setPickerHsla(hsla);
      const newHex = hslaToHex(hsla.h, hsla.s, hsla.l, hsla.a);
      if (activePicker?.field === 'panel') setTempPanelColor(newHex);
      else if (activePicker?.field === 'content') setTempContentColor(newHex);
      else if (activePicker?.field === 'frame') setTempFrameColor(newHex);
      else if (activePicker?.field === 'name') setTempNameColor(newHex);
      else if (activePicker?.field === 'muralTop') setTempMuralTopColor(newHex);
      else if (activePicker?.field === 'muralFeed') setTempMuralFeedColor(newHex);
      else if (activePicker?.field === 'statusColor') setTempStatusColor(newHex);
      else if (activePicker?.field === 'wikiTop') setWikiTopColor(newHex);
      else if (activePicker?.field === 'wikiBg') setWikiBgColor(newHex);
    }
  };

  const handleResetColor = (field: string) => {
    if (field === 'panel') setTempPanelColor('transparent');
    else if (field === 'content') setTempContentColor('transparent');
    else if (field === 'frame') setTempFrameColor('transparent');
    else if (field === 'name') setTempNameColor('transparent');
    else if (field === 'muralTop') setTempMuralTopColor('transparent');
    else if (field === 'muralFeed') setTempMuralFeedColor('transparent');
    else if (field === 'statusColor') setTempStatusColor('#22c55e');
    else if (field === 'wikiTop') setWikiTopColor('#1a2036');
    else if (field === 'wikiBg') setWikiBgColor('#02040a');
    setActivePicker(null);
  };

  const handleSave = () => {
    try {
      onProfileUpdate(tempName, tempAvatar, tempPanelColor, tempContentColor, tempPanelImage, tempContentImage, tempFrameColor, tempFrameStyle, tempBio, tempStatusIcon, profile.hideStats, tempNameColor, tempMuralTopColor, tempMuralFeedColor, tempMuralImage, tempMuralFeedImage, profile.mural, profile.posts, undefined, undefined, undefined, undefined, undefined, tempStatusColor);
    } catch (e) {
      console.warn("Save trigger failed in profile persistence:", e);
    } finally {
      setIsEditing(false);
      setIsMuralHubActive(false);
      setActivePicker(null);
    }
  };

  const handleSavePost = async () => {
    if (showEditor === 'WIKI' || showEditor === 'BLOG') {
      if (!editorTitle.trim()) return;

      setIsSavingWiki(true);
      setWikiSaveProgress(0);

      // Parallel safety checks
      const safetyPromise = verifySafety ? Promise.all([
        verifySafety(editorTitle, 'text'),
        verifySafety(editorContent, 'text'),
        verifySafety(wikiKeywords, 'text')
      ]) : Promise.resolve([true, true, true]);

      // Progress bar filling up (faster)
      const progressInterval = setInterval(() => {
        setWikiSaveProgress(prev => {
          if (prev >= 90) return 90;
          return prev + 10;
        });
      }, 50);

      try {
        const results = await safetyPromise;
        if (results.some(r => !r)) {
          alert("O conteúdo sinalizou dissonância nos protocolos de segurança Drake.OS.");
          setIsSavingWiki(false);
          clearInterval(progressInterval);
          return;
        }

        clearInterval(progressInterval);
        setWikiSaveProgress(100);
        await new Promise(resolve => setTimeout(resolve, 100));

        let contentFinal = editorContent;
        if (showEditor === 'WIKI') {
          const infoContent = wikiInfoRows
            .filter(r => r.label.trim() || r.value.trim())
            .map(r => `[B]${r.label}:[/B] ${r.value}`)
            .join('\n');
          
          contentFinal = `${infoContent}\n\n[B]REGISTRO:[/B]\n${editorContent}\n\n[B]TAGS:[/B] ${wikiKeywords}`;
        }
        
        const newPost: FeedPost = {
          id: editingWikiId || `${showEditor.toLowerCase()}-${Date.now()}`,
          author: profile.name,
          avatar: wikiAvatar || userAvatar,
          title: editorTitle,
          content: contentFinal,
          likes: editingWikiId ? (profile.posts?.find(p => p.id === editingWikiId)?.likes || 0) : 0,
          time: editingWikiId ? (profile.posts?.find(p => p.id === editingWikiId)?.time || 'Agora') : 'Agora',
          tag: showEditor || 'POST',
          timestamp: editingWikiId ? (profile.posts?.find(p => p.id === editingWikiId)?.timestamp || Date.now()) : Date.now(),
          comments: editingWikiId ? (profile.posts?.find(p => p.id === editingWikiId)?.comments || []) : [],
          wideMode: wikiWideMode,
          customAvatarPosition: wikiAvatarPosition,
          customBgType: wikiBgImages.length > 0 ? 'image' : 'color',
          customBgImage: wikiBgImages[0] ? (typeof wikiBgImages[0] === 'string' ? wikiBgImages[0] : wikiBgImages[0].src) : undefined,
          customBgImages: wikiBgImages,
          customBgColor: wikiBgColor,
          customTopColor: wikiTopColor,
          customTopImages: wikiTopImages,
          galleryImages: wikiGallery,
          customGallery: wikiGallery.length > 0 ? wikiGallery : undefined,
          customKeywords: wikiKeywords,
          customInfoRows: showEditor === 'WIKI' ? wikiInfoRows.filter(r => r.label.trim() || r.value.trim()) : undefined,
          hideTopOverlay: wikiHideOverlay,
          mural: tempWikiMural
        };
        const updatedPosts = editingWikiId 
          ? (profile.posts || []).map(p => p.id === editingWikiId ? newPost : p)
          : [newPost, ...(profile.posts || [])];
        onProfileUpdate(profile.name, profile.avatarUrl, profile.panelColor, profile.contentColor, profile.panelImage, profile.contentImage, profile.frameColor, profile.frameStyle, profile.bio, profile.statusIcon, profile.hideStats, tempNameColor, tempMuralTopColor, profile.muralFeedColor, profile.muralImage, profile.muralFeedImage, profile.mural, updatedPosts);
        
        setSelectedPost(newPost);

        setIsSavingWiki(false);
        setWikiSaveProgress(0);
      } catch (error) {
        console.error("Error saving wiki/blog:", error);
        clearInterval(progressInterval);
        setIsSavingWiki(false);
      }
    } else {
      if (!editorContent.trim() && !editorTitle.trim()) return;

      if (verifySafety) {
        if (editorTitle.trim()) {
          const isTitleSafe = await verifySafety(editorTitle, 'text');
          if (!isTitleSafe) return;
        }
        if (editorContent.trim()) {
          const isContentSafe = await verifySafety(editorContent, 'text');
          if (!isContentSafe) return;
        }
      }

      const newPost: FeedPost = {
        id: `${showEditor?.toLowerCase()}-${Date.now()}`,
        author: profile.name,
        avatar: userAvatar,
        title: editorTitle || undefined,
        content: editorContent,
        likes: 0,
        time: 'Agora',
        tag: showEditor || 'POST',
        timestamp: Date.now(),
        comments: [],
        wideMode: wikiWideMode,
        customBgType: wikiBgImages.length > 0 ? 'image' : 'color',
        customBgImage: wikiBgImages[0] ? (typeof wikiBgImages[0] === 'string' ? wikiBgImages[0] : wikiBgImages[0].src) : undefined,
        customBgImages: wikiBgImages,
        customBgColor: wikiBgColor,
        customTopColor: wikiTopColor,
        customTopImages: wikiTopImages,
        galleryImages: wikiGallery,
        customGallery: wikiGallery.length > 0 ? wikiGallery : undefined,
        customKeywords: wikiKeywords,
      };
      const updatedPosts = [newPost, ...(profile.posts || [])];
      onProfileUpdate(profile.name, profile.avatarUrl, profile.panelColor, profile.contentColor, profile.panelImage, profile.contentImage, profile.frameColor, profile.frameStyle, profile.bio, profile.statusIcon, profile.hideStats, tempNameColor, tempMuralTopColor, profile.muralFeedColor, profile.muralImage, profile.muralFeedImage, profile.mural, updatedPosts);
    }
    setShowEditor(null);
    setEditingWikiId(null);
    setEditorTitle('');
    setEditorContent('');
    setWikiAvatar(null);
    setWikiKeywords('');
    setWikiInfoRows([{ label: 'Avaliação', value: '0', type: 'rating_star' }, { label: 'O que gosta', value: '', type: 'text' }, { label: 'O que odeia', value: '', type: 'text' }]);
    setWikiTopImages([]);
    setWikiGallery([]);
    setWikiWideMode(false);
  };

  const handleSendMuralComment = () => {
    if (!muralInput.trim()) return;

    const textToVerify = muralInput;

    const authorName = userName || 'OPERATIVO';
    const authorAvatar = userAvatar || '';
    const newPost: MuralPost = {
      id: Date.now().toString(),
      author: authorName,
      avatar: authorAvatar,
      text: muralInput,
      timestamp: Date.now()
    };
    const updatedMural = [newPost, ...(profile.mural || [])];
    onProfileUpdate(profile.name, profile.avatarUrl, profile.panelColor, profile.contentColor, profile.panelImage, profile.contentImage, profile.frameColor, profile.frameStyle, profile.bio, profile.statusIcon, profile.hideStats, tempNameColor, tempMuralTopColor, profile.muralFeedColor, profile.muralImage, profile.muralFeedImage, updatedMural, profile.posts);
    setMuralInput('');
    if (navigator.vibrate) navigator.vibrate(10);
    if (!profile.isMe) {
      addNotification({ type: 'MURAL', title: 'Novo Comentário', content: `${authorName} deixou um sinal no seu mural.`, sender: authorName });
    }

    if (verifySafety) {
      verifySafety(textToVerify, 'text');
    }
  };

  const handleSendPostMuralComment = (postId: string) => {
    if (!wikiMuralInput.trim()) return;
    const authorName = userName || 'OPERATIVO';
    const authorAvatar = userAvatar || '';
    const newComm: MuralPost = {
      id: Date.now().toString(),
      author: authorName,
      avatar: authorAvatar,
      text: wikiMuralInput,
      timestamp: Date.now()
    };
    
    const updatedPosts = (profile.posts || []).map(p => {
        if (p.id === postId) {
            return { ...p, mural: [newComm, ...(p.mural || [])] };
        }
        return p;
    });

    onProfileUpdate(profile.name, profile.avatarUrl, profile.panelColor, profile.contentColor, profile.panelImage, profile.contentImage, profile.frameColor, profile.frameStyle, profile.bio, profile.statusIcon, profile.hideStats, tempNameColor, tempMuralTopColor, profile.muralFeedColor, profile.muralImage, profile.muralFeedImage, profile.mural, updatedPosts);
    setWikiMuralInput('');
    
    if (selectedPost && selectedPost.id === postId) {
        setSelectedPost({ ...selectedPost, mural: [newComm, ...(selectedPost.mural || [])] });
    }
    
    if (!profile.isMe) {
        addNotification({ type: 'MURAL', title: 'Comentário em Wiki', content: `${authorName} comentou em sua wiki.`, sender: authorName });
    }
    if (verifySafety) verifySafety(wikiMuralInput, 'text');
  };

  const handleDeletePostMuralComment = (postId: string, commentId: string) => {
    const updatedPosts = (profile.posts || []).map(p => {
        if (p.id === postId) {
            return { ...p, mural: (p.mural || []).filter(m => m.id !== commentId) };
        }
        return p;
    });
    onProfileUpdate(profile.name, profile.avatarUrl, profile.panelColor, profile.contentColor, profile.panelImage, profile.contentImage, profile.frameColor, profile.frameStyle, profile.bio, profile.statusIcon, profile.hideStats, tempNameColor, tempMuralTopColor, profile.muralFeedColor, profile.muralImage, profile.muralFeedImage, profile.mural, updatedPosts);
    
    if (selectedPost && selectedPost.id === postId) {
        setSelectedPost({ ...selectedPost, mural: (selectedPost.mural || []).filter(m => m.id !== commentId) });
    }
    setActiveMuralMenu(null);
  };

  const handleSendEditorMuralComment = () => {
    if (!editorMuralInput.trim()) return;
    const authorName = userName || 'OPERATIVO';
    const authorAvatar = userAvatar || '';
    const newComm: MuralPost = {
      id: Date.now().toString(),
      author: authorName,
      avatar: authorAvatar,
      text: editorMuralInput,
      timestamp: Date.now()
    };
    setTempWikiMural([newComm, ...tempWikiMural]);
    setEditorMuralInput('');
    if (verifySafety) verifySafety(editorMuralInput, 'text');
  };

  const handleDeleteEditorMuralComment = (id: string) => {
    setTempWikiMural(tempWikiMural.filter(m => m.id !== id));
    setActiveMuralMenu(null);
  };

  const handleDeleteMuralComment = (commentId: string) => {
    const updatedMural = (profile.mural || []).filter(m => m.id !== commentId);
    onProfileUpdate(profile.name, profile.avatarUrl, profile.panelColor, profile.contentColor, profile.panelImage, profile.contentImage, profile.frameColor, profile.frameStyle, profile.bio, profile.statusIcon, profile.hideStats, tempNameColor, tempMuralTopColor, profile.muralFeedColor, profile.muralImage, profile.muralFeedImage, updatedMural, profile.posts);
    setActiveMuralMenu(null);
  };

  const renderCommentsSection = (mural: MuralPost[], input: string, setInput: (v: string) => void, onSend: () => void, onDelete: (id: string) => void, color: string, contextImages?: any[], currentBgColor?: string) => {
    const isBackgroundLight = hexToHsla(color).l < 40; // If text is dark, bg is light
    const isBgWhite = isWhite(currentBgColor);
    const neumorphicConvex = isBackgroundLight ? { boxShadow: isBgWhite ? '-5px -5px 15px #ffffff, 5px 5px 15px #aeaec040' : '5px 5px 15px #aeaec040' } : {};
    
    return (
    <div className="pt-5 border-t border-white/10 space-y-6">
      <div className="flex flex-col gap-5 mt-0">
        <div className="flex items-center gap-3 px-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_#22d3ee] animate-pulse"></div>
          <div className={`px-4 py-1.5 rounded-full ${isBackgroundLight ? 'bg-black/[0.15] shadow-inner' : 'bg-white/10 shadow-lg'}`} style={neumorphicConvex}>
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] relative z-20" style={{ color: color }}>Fluxo de Pensamentos</h4>
          </div>
        </div>
        <div className={`h-px w-full ${isBackgroundLight ? 'bg-black/10' : 'bg-white/10'} opacity-30`} />
      </div>
      <div className="flex gap-3 px-2 items-center">
        <div className="w-10 h-10 rounded-full border-2 border-white/10 overflow-hidden bg-slate-900 shrink-0 shadow-lg"><img src={resolveImageRef(userAvatar)} className="w-full h-full object-cover" alt="Me" /></div>
        <div className="flex-1 flex gap-2.5 items-center">
          <div className="flex-1 relative">
            <input 
              type="text"
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              placeholder="Transmitir pensamento para o Mural..." 
              className={`w-full backdrop-blur-xl border border-white/10 rounded-2xl px-5 text-[14px] outline-none transition-all h-[45px] shadow-[0_10px_25px_rgba(0,0,0,0.1)] focus:border-cyan-500/20 ${isBackgroundLight ? 'bg-black/[0.03] placeholder:text-black/30' : 'bg-white/5 text-white placeholder:text-white/20'}`}
              style={{ color: color }}
            />
          </div>
          <button 
            onClick={onSend} 
            disabled={!input.trim()}
            className={`w-[46px] h-[46px] rounded-2xl flex items-center justify-center transition-all duration-300 shrink-0 border backdrop-blur-xl active:scale-95 shadow-[0_10px_25px_rgba(0,0,0,0.1)] ${
              input.trim() 
                ? 'bg-cyan-500/10 border-cyan-500/30' 
                : 'bg-white/5 border-white/10'
            }`}
            style={{ color: input.trim() ? undefined : color }}
          >
            <svg className={`w-5 h-5 transition-transform duration-500 ${input.trim() ? 'translate-x-[1px] text-cyan-400' : 'translate-x-0'}`} style={{ opacity: input.trim() ? 1 : 0.4 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
      <div className="space-y-4 pb-10">
        {(!mural || mural.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-10 opacity-30">
            <span className="text-3xl mb-4 grayscale">📡</span>
            <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: color }}>Aguardando Sinais de Consciência</p>
          </div>
        ) : (
          mural.map((m) => {
            const isBackgroundLight = hexToHsla(color).l < 40;
            const isBgWhite = isWhite(currentBgColor);
            const neumorphicConvex = isBackgroundLight ? { boxShadow: isBgWhite ? '-5px -5px 15px #ffffff, 5px 5px 15px #aeaec040' : '5px 5px 15px #aeaec040' } : {};
            const neumorphicConcave = isBackgroundLight ? { boxShadow: isBgWhite ? 'inset -4px -4px 8px #aeaec025, inset 4px 4px 8px #ffffff' : 'inset -4px -4px 8px #aeaec025' } : {};

            return (
              <div key={m.id} className="flex gap-4 px-2 items-start animate-in fade-in slide-in-from-bottom-2 duration-500 group/comment">
                 <div className="w-10 h-10 rounded-full border-2 border-white/10 overflow-hidden bg-slate-900 shrink-0 shadow-md"><img src={resolveImageRef(m.avatar)} className="w-full h-full object-cover" alt={m.author} /></div>
                 <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                       <span className={`text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${isBackgroundLight ? 'bg-black/[0.03]' : 'bg-white/5'}`} style={{ color: color, ...neumorphicConvex }}>{m.author}</span>
                       <div className="flex items-center gap-3">
                          <span className="text-[6px] font-bold uppercase tracking-tighter" style={{ color: color, opacity: 0.5 }}>{new Date(m.timestamp).toLocaleDateString()}</span>
                          {(profile.isMe || m.author === userName) && (
                            <div className="relative">
                              <button 
                                onClick={() => setActiveMuralMenu(activeMuralMenu === m.id ? null : m.id)}
                                className="p-1 hover:text-white transition-all active:scale-90"
                                style={{ color: color, opacity: 0.5 }}
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                                  <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                                  <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                                </svg>
                              </button>
                              
                              {activeMuralMenu === m.id && (
                                <div className={`absolute right-0 top-6 w-32 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[100] animate-in fade-in zoom-in duration-200 ${isBackgroundLight ? 'bg-white' : 'bg-[#0a0c1a]'}`}>
                                  <button 
                                    onClick={() => handleDeleteMuralComment(m.id)}
                                    className="w-full px-3 py-2 flex items-center gap-2 text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-red-400 hover:bg-white/5 transition-all"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    Excluir
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                       </div>
                    </div>
                    <div className={`border border-white/10 rounded-2xl p-4 shadow-sm relative ${isBackgroundLight ? 'bg-black/[0.02]' : 'bg-white/5'}`} style={neumorphicConcave}>
                      <div className="text-[14px] font-light leading-relaxed break-words" style={{ color: color }} dangerouslySetInnerHTML={{ __html: formatBioText(m.text, undefined, contextImages) }} />
                    </div>
                 </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};


  const renderGeometricButton = (content: React.ReactNode, onClick: (e: React.MouseEvent) => void, isSmall = false, label?: string, gradientOverride?: string, wrapperStyle?: React.CSSProperties) => {
    const isCircle = fabTheme.shape.includes('circle');
    const size = isSmall ? 'w-11 h-11' : (isCircle ? 'w-[54px] h-[54px]' : 'w-[58px] h-[58px]');
    const gradient = gradientOverride || fabTheme.gradient;
    const isParentTriangle = fabTheme.shape === 'triangle';
    const forceDiamond = isSmall && (isParentTriangle || fabTheme.shape === 'diamond');
    const shapeStyle = forceDiamond ? { borderRadius: '0.6rem' } : fabTheme.style;
    const baseRot = forceDiamond ? 45 : fabTheme.baseRot;
    const clipPath = forceDiamond ? '' : fabTheme.clip;
    const currentPlusRotation = (!isSmall && isFabOpen) ? 405 : 0;
    
    return (
      <div className={`relative ${size} flex items-center justify-center group pointer-events-auto transition-all duration-300`} style={{ ...wrapperStyle, perspective: '1000px', filter: isSmall ? 'none' : `drop-shadow(0 14px 20px ${activeMainShadowColor})` }}>
        <div className={`absolute inset-0 ${gradient} transition-all duration-700 pointer-events-none blur-[8px] opacity-[0.03]`} style={{ transform: `rotate(${baseRot + (isSmall ? 0 : plusRotation) + currentPlusRotation}deg) scale(${(fabTheme.scale || 1) * 1.15})`, clipPath, ...shapeStyle }} />
        <div className={`relative z-10 w-full h-full transition-all duration-700 ease-out active:scale-90 ring-1 ring-white/10 overflow-hidden flex items-center justify-center`} style={{ transform: `rotate(${baseRot + (isSmall ? 0 : currentPlusRotation) + (isSmall ? 0 : plusRotation)}deg) scale(${isSmall ? 1 : (fabTheme.scale || 1)})`, clipPath, ...shapeStyle }}>
           <div className={`absolute inset-0 ${gradient}`}></div>
           <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-transparent pointer-events-none"></div>
           <div className={`absolute inset-0 border-[2.5px] border-white/20`} style={{ transform: 'scale(0.85)', clipPath, ...shapeStyle }} />
           <button onClick={onClick} className={`relative z-10 w-full h-full flex items-center justify-center outline-none cursor-pointer text-white`} style={{ transform: `rotate(${-baseRot + (isSmall ? 0 : -currentPlusRotation)}deg)` }}> <div> {content} </div> </button>
        </div>
        {label && ( <span className="absolute -left-12 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded text-[7px] font-black text-white uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"> {label} </span> )}
      </div>
    );
  };

  if (isMuralExpanded && !isEditing) {
    const muralFeedColorReal = profile.muralFeedColor || profile.contentColor || '#02040a';
    const muralTopColorReal = profile.muralTopColor || profile.panelColor || '#02040a';
    const muralTextColor = getAutoContrastHex(muralTopColorReal);
    const muralFeedTextColor = getAutoContrastHex(muralFeedColorReal);
    return (
      <div className="fixed inset-0 z-[1000] flex flex-col font-inter text-white overflow-hidden animate-mural-slide-up" style={{ background: `linear-gradient(to bottom, ${muralTopColorReal === 'transparent' ? '#000' : muralTopColorReal} 0%, ${muralFeedColorReal === 'transparent' ? '#000' : muralFeedColorReal} 100%)` }}>
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          {resolveImageRef(profile.muralFeedImage) && (
            <div className="absolute inset-0 w-full h-full">
               <img key={resolveImageRef(profile.muralFeedImage)} src={resolveImageRef(profile.muralFeedImage)} className="absolute inset-0 w-full h-full object-cover 4k-texture transition-all duration-500" style={{ opacity: getWallpaperOpacity(muralFeedColorReal), filter: getWallpaperFilter(muralFeedColorReal), imageRendering: 'high-quality' }} alt="Background" />
               <div className="absolute inset-0 z-10" style={{ background: `linear-gradient(to bottom, ${muralTopColorReal} 0%, transparent 20%, transparent 80%, ${muralFeedColorReal} 100%)` }}></div>
            </div>
          )}
        </div>
        <div className="relative z-20 w-full h-full overflow-y-auto no-scrollbar flex flex-col">
          <div className="relative">
            <div className="sticky top-0 h-screen z-[5] overflow-hidden pointer-events-none" style={{ WebkitMaskImage: 'linear-gradient(to bottom, black 65%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 65%, transparent 100%)' }}>
               {resolveImageRef(profile.muralImage) && ( <img key={resolveImageRef(profile.muralImage)} src={resolveImageRef(profile.muralImage)} className="w-full h-full object-cover 4k-texture transition-all duration-500" style={{ opacity: getWallpaperOpacity(muralTopColorReal), filter: getWallpaperFilter(muralTopColorReal), imageRendering: 'high-quality' }} alt="Mural Top" /> )}
               <div className="absolute inset-0 z-10" style={{ background: `linear-gradient(to bottom, ${muralTopColorReal} 0%, transparent 35%, transparent 75%, ${muralFeedColorReal} 100%)` }}></div>
            </div>
            <div className="relative z-10 -mt-[100vh] flex flex-col pointer-events-auto">
              <header className="p-6 flex items-center justify-between shrink-0 pointer-events-auto">
                <button onClick={() => { setIsMuralExpanded(false); setActiveTab('POSTS'); }} className="p-2 bg-black/50 backdrop-blur-md rounded-xl text-white border border-white/20 active:scale-90 transition-all shadow-2xl"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg></button>
              </header>
              <div className="relative px-4 md:px-6 pt-2 md:pt-4 pb-0 max-w-7xl mx-auto w-full flex flex-col pointer-events-auto">
                <div className={`text-[14px] md:text-[17px] font-light break-words transition-all duration-700 ${!profile.bio ? 'text-center opacity-30' : 'opacity-100'}`} style={{ color: muralTextColor }} dangerouslySetInnerHTML={{ __html: profile.bio ? formatBioText(profile.bio) : 'Sintonizando biografia...' }} />
              </div>
            </div>
          </div>
          <section className="relative z-20 px-8 md:px-14 -mt-12 space-y-6 bg-transparent pb-48">{renderCommentsSection(profile.mural || [], muralInput, setMuralInput, handleSendMuralComment, handleDeleteMuralComment, muralFeedTextColor, undefined, profile.muralFeedColor)}</section>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center overflow-y-auto no-scrollbar font-inter text-white select-none hd-4k-rendering transition-colors duration-500" style={{ backgroundColor: activeMainBgColor === 'transparent' ? '#02040a' : activeMainBgColor }}>
      <svg width="0" height="0" className="absolute pointer-events-none"> <defs> <clipPath id="rounded-triangle-clip-v2" clipPathUnits="objectBoundingBox"> <path d="M 0.5 0.05 C 0.47 0.05 0.44 0.08 0.42 0.12 L 0.05 0.85 C 0.03 0.89 0.04 0.95 0.1 0.95 L 0.9 0.95 C 0.96 0.95 0.97 0.89 0.95 0.85 L 0.58 0.12 C 0.56 0.08 0.53 0.05 0.5 0.05 Z" /> </clipPath> </defs> </svg>

      <input type="file" ref={avatarInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageInput(e, setTempAvatar)} />
      <input type="file" ref={hub01InputRef} className="hidden" accept="image/*" onChange={(e) => handleImageInput(e, setTempPanelImage)} />
      <input type="file" ref={hub02InputRef} className="hidden" accept="image/*" onChange={(e) => handleImageInput(e, setTempContentImage)} />
      <input type="file" ref={muralWallInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageInput(e, setTempMuralImage)} />
      <input type="file" ref={muralFeedInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageInput(e, setTempMuralFeedImage)} />
      
      {/* Wiki Context Inputs */}
      <input type="file" ref={wikiAvatarRef} className="hidden" accept="image/*" onChange={(e) => handleImageInput(e, setWikiAvatar)} />
      <input type="file" ref={wikiTopRef} className="hidden" accept="image/*" multiple onChange={handleWikiTopUpload} />
      <input type="file" ref={wikiBgRef} className="hidden" accept="image/*" multiple onChange={handleInsertWikiBg} />
      <input type="file" ref={wikiGalleryRef} className="hidden" accept="image/*" multiple onChange={handleInsertWikiGallery} />
      <input type="file" ref={wikiNarrativeImageRef} className="hidden" accept="image/*" onChange={(e) => handleInsertBioImage(e, false)} />
      
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {activeFeedWallpaper && (
          <div className="absolute inset-0 w-full h-full">
            <img key={activeFeedWallpaper} src={resolveImageRef(activeFeedWallpaper)} className="absolute inset-0 w-full h-full object-cover transition-all duration-500" style={{ opacity: getWallpaperOpacity(activeMainBgColor), filter: getWallpaperFilter(activeMainBgColor), imageRendering: 'high-quality' }} alt="Background" />
            <div className="absolute inset-0 z-10" style={{ backgroundImage: 'linear-gradient(to bottom, transparent 0px, rgba(2, 4, 10, 0.4) 320px)' }}></div>
          </div>
        )}
      </div>

      <div className="absolute top-0 left-0 z-[1000] w-full flex flex-col pointer-events-auto">
        <header className="flex items-center justify-between px-4 pt-4 pb-4 shrink-0 bg-transparent">
          {isEditing ? (
            <div className="flex gap-2 w-full justify-between items-center animate-in fade-in pointer-events-auto">
               <button onClick={() => { setIsEditing(false); setIsMuralHubActive(false); }} className="px-5 py-2.5 bg-black/60 backdrop-blur-md border border-white/20 rounded-full text-[8px] font-black text-white uppercase tracking-widest transition-all active:scale-95 shadow-xl cursor-pointer">CANCELAR</button>
               <button onClick={handleSave} className="px-6 py-2.5 bg-cyan-500/90 backdrop-blur-md border border-cyan-400/50 rounded-full text-[8px] font-black text-white uppercase tracking-widest transition-all active:scale-95 shadow-2xl shadow-cyan-500/40 cursor-pointer">SALVAR</button>
            </div>
          ) : (
            <>
              <button onClick={onBack} className="p-1 active:scale-90 transition-all" style={{ color: `rgba(${topContrast}, 0.9)` }}> <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg> </button>
              <div className="flex items-center gap-3">
                 {profile.isMe && (
                   <div className="bg-transparent rounded-full px-4 py-1.5 flex items-center gap-2 transition-all pointer-events-auto">
                      <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center text-[7px] text-black font-black shadow-[0_0_8px_rgba(34,211,238,0.5)]">V</div>
                      <span className="text-[12px] font-black tracking-tighter" style={{ color: `rgba(${topContrast}, 1)` }}>{(profile.voidyCoins || 0).toLocaleString()}</span>
                   </div>
                 )}
              </div>
            </>
          )}
        </header>
      </div>

      <div className="w-full min-h-full flex flex-col relative pb-32 z-10">
        <div className="relative">
          <div className="absolute top-0 inset-x-0 h-[460px] z-0 overflow-hidden transition-all duration-500" style={{ background: `linear-gradient(to bottom, ${activeTopBgColor === 'transparent' ? '#00000000' : activeTopBgColor} 0%, ${activeTopBgColor === 'transparent' ? '#00000000' : activeTopBgColor} 30%, ${activeMainBgColor === 'transparent' ? '#00000000' : (activeMainBgColor === '#02040a' ? '#000' : activeMainBgColor)} 92%, ${activeMainBgColor === 'transparent' ? '#00000000' : (activeMainBgColor === '#02040a' ? '#000' : activeMainBgColor)} 100%)`, WebkitMaskImage: 'linear-gradient(to bottom, black 240px, transparent 460px)', maskImage: 'linear-gradient(to bottom, black 240px, transparent 460px)' }} >
             {activeTopWallpaper && ( <img key={activeTopWallpaper} src={resolveImageRef(activeTopWallpaper)} className={`w-full h-full object-cover transition-all duration-500`} style={{ opacity: getWallpaperOpacity(activeTopBgColor), filter: getWallpaperFilter(activeTopBgColor), imageRendering: 'high-quality' }} alt="Top Wallpaper" /> )}
             {showGradients && !isMuralHubActive && ( <div className="absolute inset-0 z-[10] pointer-events-none" style={{ background: `linear-gradient(to top, ${activeMainBgColor === 'transparent' ? '#02040a' : activeMainBgColor} 0%, transparent 60%)` }} /> )}
          </div>
          <section className="flex flex-col items-center px-4 relative mt-24 z-10 w-full transition-all duration-500">
            <div className="relative mb-6 flex justify-center">
               <div className="w-20 h-20 rounded-full border-[2.5px] shadow-[0_0_25px_rgba(255,255,255,0.15)] relative z-10 overflow-hidden bg-black flex-shrink-0" style={{ borderColor: isEditing ? tempFrameColor : (profile.frameColor || '#fff') }}>
                  <img 
                    src={resolveImageRef(isEditing ? tempAvatar : profile.avatarUrl)} 
                    loading="lazy"
                    decoding="async"
                    fetchPriority="high"
                    className="absolute inset-0 w-full h-full object-cover" 
                    style={{ imageRendering: 'high-quality' }} 
                    alt="Perfil" 
                  />
                  {isEditing && (<button onClick={() => avatarInputRef.current?.click()} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-100 transition-opacity z-20"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 101.664.89l.812-1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg></button>)}
               </div>
            </div>
            <div className="flex items-center justify-center w-full min-h-[1.5rem] relative">
               {isEditing ? (
                 <input 
                   value={tempName} 
                   onChange={(e) => setTempName(e.target.value)} 
                   style={{ color: tempNameColor, letterSpacing: 'normal' }} 
                   className="bg-black/30 backdrop-blur-md rounded-full px-4 border-b border-cyan-500/50 outline-none text-center font-black text-sm w-48 pb-0.5" 
                 />
               ) : (
                 <div className="relative inline-flex items-center">
                   <h2 className="text-sm font-black tracking-normal text-center" style={{ color: profile.nameColor || (topContrast === '0, 0, 0' ? '#000' : '#fff') }}>{profile.name}</h2>
                   {profile.isMe && (
                     <button onClick={() => setIsEditing(true)} style={{ color: '#22d3ee' }} className="absolute -right-6 p-1 bg-white/5 rounded-lg active:scale-90 transition-transform z-20">
                       <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> 
                     </button>
                   )}
                 </div>
               )}
            </div>
          </section>

          {isEditing && (
            <section className="px-4 mt-8 mb-4 animate-in slide-in-from-top-4 duration-500 pointer-events-auto relative z-[100]">
               <div className="bg-[#e0f2f1]/95 backdrop-blur-2xl rounded-[1.8rem] p-4 border border-white/10 shadow-2xl">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col"> <h3 className="text-[#1a2036] font-black text-[9px] tracking-widest uppercase">SISTEMA_V_2.4</h3> <span className="text-[#1a2036]/40 text-[5px] font-bold uppercase">EDITOR COMPACTO ATIVO...</span> </div>
                    <div className="flex items-center gap-2"> <div className="bg-black/10 rounded-full p-0.5 flex border border-[#1a2036]/10"> <button onClick={() => { setIsMuralHubActive(false); setActivePicker(null); }} className={`px-4 py-1 rounded-full text-[6px] font-black uppercase transition-all ${!isMuralHubActive ? 'bg-[#1a2036] text-white shadow-sm' : 'text-[#1a2036]/40'}`}>PERFIL</button> <button onClick={() => { setIsMuralHubActive(true); setActivePicker(null); }} className={`px-4 py-1 rounded-full text-[6px] font-black uppercase transition-all ${isMuralHubActive ? 'bg-amber-600 text-white shadow-sm' : 'text-[#1a2036]/40'}`}>MURAL</button> </div> </div>
                  </div>
                  <div className="space-y-4">
                     <div className="space-y-3">
                        <span className="text-[5px] font-black text-[#1a2036]/60 uppercase ml-1 tracking-[0.2em]">MATRIZ CROMÁTICA</span>
                        <div className="flex justify-center gap-4">
                          {!isMuralHubActive ? ( 
                            [ 
                              { id: 'panel', label: 'COR_TOPO', val: tempPanelColor, def: defaultColors.panel }, 
                              { id: 'content', label: 'COR_FUNDO', val: tempContentColor, def: defaultColors.content }, 
                              { id: 'frame', label: 'MOLDURA', val: tempFrameColor, def: defaultColors.frame }, 
                              { id: 'name', label: 'NOME_PERFIL', val: tempNameColor, def: defaultColors.name }
                            ].map((item) => ( 
                              <div key={item.id} className="flex flex-col items-center gap-1.5 relative group/color"> 
                                <button onClick={() => openPicker(item.id, item.label, item.val)} className={`w-10 h-10 rounded-full border-2 p-0.5 transition-all hover:scale-105 shadow-md ${activePicker?.field === item.id ? 'ring-1 ring-cyan-500 ring-offset-1' : ''}`} style={{ borderColor: item.val === 'transparent' ? '#ccc' : item.val, borderStyle: item.val === 'transparent' ? 'dashed' : 'solid' }}><div className="w-full h-full rounded-full flex items-center justify-center overflow-hidden" style={{ backgroundColor: item.val === 'transparent' ? 'rgba(0,0,0,0.1)' : item.val }}>{item.val === 'transparent' && <span className="text-[10px] text-slate-400">✕</span>}</div></button> 
                                {item.val !== item.def && ( 
                                  <button onClick={() => handleResetColor(item.id)} className="absolute -top-2 -right-2 w-4 h-4 bg-black/40 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-[10px] text-white hover:text-white transition-all shadow-md z-[120]">✕</button> 
                                )} 
                                <span className="text-[4px] font-black text-[#1a2036] uppercase">{item.label}</span> 
                              </div> 
                            )) 
                          ) : ( 
                            [ 
                              { id: 'muralTop', label: 'COR_MURAL_T', val: tempMuralTopColor, def: defaultColors.muralTop }, 
                              { id: 'muralFeed', label: 'COR_MURAL_F', val: tempMuralFeedColor, def: defaultColors.muralFeed } 
                            ].map((item) => ( 
                              <div key={item.id} className="flex flex-col items-center gap-1.5 relative group/color"> 
                                <button onClick={() => openPicker(item.id, item.label, item.val)} className={`w-10 h-10 rounded-full border-2 p-0.5 transition-all hover:scale-105 shadow-md ${activePicker?.field === 'muralTop' || activePicker?.field === 'muralFeed' ? 'ring-1 ring-cyan-500 ring-offset-1' : ''}`} style={{ borderColor: item.val === 'transparent' ? '#ccc' : item.val, borderStyle: item.val === 'transparent' ? 'dashed' : 'solid' }}><div className="w-full h-full rounded-full flex items-center justify-center overflow-hidden" style={{ backgroundColor: item.val === 'transparent' ? 'rgba(0,0,0,0.1)' : item.val }}>{item.val === 'transparent' && <span className="text-[10px] text-slate-400">✕</span>}</div></button> 
                                {item.val !== item.def && ( 
                                  <button onClick={() => handleResetColor(item.id)} className="absolute -top-2 -right-2 w-4 h-4 bg-black/40 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-[10px] text-white hover:text-white transition-all shadow-md z-[120]">✕</button> 
                                )} 
                                <span className="text-[4px] font-black text-[#1a2036] uppercase">{item.label}</span> 
                              </div> 
                            )) 
                          )}
                        </div>
                        {activePicker && (
                          <div className="mt-2 p-2 bg-white/40 rounded-xl border border-white/40 animate-in zoom-in">
                            <div className="flex justify-between items-center mb-1.5 px-1"> <span className="text-[6px] font-black text-[#1a2036] uppercase tracking-widest">{activePicker.label}</span> <button onClick={() => setActivePicker(null)} className="text-[#1a2036] font-bold text-[10px]">✕</button> </div>
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                                <div className="space-y-0.5"><div className="flex justify-between items-center px-0.5"><span className="text-[4px] font-bold text-[#1a2036]/60 uppercase">Matiz</span><span className="text-[4px] font-black text-[#1a2036]">{pickerHsla.h}°</span></div><input type="range" min="0" max="360" value={pickerHsla.h} onChange={(e) => updatePickerColor(Number(e.target.value), pickerHsla.s, pickerHsla.l, pickerHsla.a || 1)} className="w-full h-1 rounded-full appearance-none cursor-pointer" style={{ background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }} /></div>
                                <div className="space-y-0.5"><div className="flex justify-between items-center px-0.5"><span className="text-[4px] font-bold text-[#1a2036]/60 uppercase">Saturação</span><span className="text-[4px] font-black text-[#1a2036]">{pickerHsla.s}%</span></div><input type="range" min="0" max="100" value={pickerHsla.s} onChange={(e) => updatePickerColor(pickerHsla.h, Number(e.target.value), pickerHsla.l, pickerHsla.a || 1)} className="w-full h-1 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, hsl(${pickerHsla.h}, 0%, ${pickerHsla.l}%), hsl(${pickerHsla.h}, 100%, ${pickerHsla.l}%))` }} /></div>
                              </div>
                              <div className="space-y-0.5">
                                <div className="flex justify-between items-center px-0.5"><span className="text-[4px] font-bold text-[#1a2036]/60 uppercase">Brilho</span><span className="text-[4px] font-black text-[#1a2036]">{pickerHsla.l}%</span></div>
                                <input type="range" min="0" max="100" value={pickerHsla.l} onChange={(e) => updatePickerColor(pickerHsla.h, pickerHsla.s, Number(e.target.value), 1)} className="w-full h-1 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #000, hsl(${pickerHsla.h}, ${pickerHsla.s}%, 50%), #fff)` }} />
                              </div>
                              <div className="flex items-center gap-2 pt-1">
                                <input 
                                  type="text" 
                                  value={tempHexInput} 
                                  onChange={(e) => handleHexInput(e.target.value)}
                                  className="flex-1 bg-black/10 border border-black/5 rounded px-2 py-0.5 text-[6px] font-bold text-[#1a2036] uppercase outline-none focus:border-cyan-500"
                                  placeholder="#000000"
                                />
                                <button 
                                  onClick={() => handleResetColor(activePicker.field)}
                                  className="px-2 py-0.5 bg-black/10 hover:bg-black/20 rounded text-[5px] font-black text-[#1a2036] uppercase transition-all"
                                >
                                  Resetar
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                     </div>
                     <div className="space-y-1.5">
                        <span className="text-[5px] font-black text-[#1a2036]/60 uppercase ml-1 tracking-[0.2em]">ATIVOS VISUAIS</span>
                        <div className="flex gap-3 px-1">
                          <div className="relative"> <div onClick={() => hub01InputRef.current?.click()} className={`w-10 h-10 rounded-xl bg-slate-900 border overflow-hidden flex items-center justify-center cursor-pointer transition-all shrink-0 ${!isMuralHubActive ? 'border-white/20 hover:border-cyan-500' : 'border-white/5 opacity-40'}`}>{tempPanelImage ? <img src={resolveImageRef(tempPanelImage)} className="w-full h-full object-cover" /> : <span className="text-[8px] opacity-20"></span>}<div className="absolute inset-x-0 bottom-0 bg-black/40 text-[3px] font-bold text-white text-center uppercase py-0.5 rounded-b-xl">Topo</div></div> {tempPanelImage && !isMuralHubActive && <button onClick={() => setTempPanelImage("")} className="absolute -top-2 -right-2 w-4 h-4 bg-black/40 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-[10px] text-white hover:text-white transition-all z-[120]">✕</button>} </div>
                          <div className="relative"> <div onClick={() => hub02InputRef.current?.click()} className={`w-10 h-10 rounded-xl bg-slate-900 border overflow-hidden flex flex-col items-center justify-center transition-all shrink-0 ${!isMuralHubActive ? 'border-white/20 hover:border-cyan-500' : 'border-white/5 opacity-40'}`}>{tempContentImage ? <img src={resolveImageRef(tempContentImage)} className="w-full h-full object-cover" /> : <span className="text-[8px] opacity-20"></span>}<div className="absolute inset-x-0 bottom-0 bg-black/40 text-[3px] font-bold text-white text-center uppercase py-0.5 rounded-b-xl">Fundo</div></div> {tempContentImage && !isMuralHubActive && <button onClick={() => setTempContentImage("")} className="absolute -top-2 -right-2 w-4 h-4 bg-black/40 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-[10px] text-white hover:text-white transition-all z-[120]">✕</button>} </div>
                          <div className="relative"> <div onClick={() => muralWallInputRef.current?.click()} className={`w-10 h-10 rounded-xl bg-slate-900 border overflow-hidden flex flex-col items-center justify-center cursor-pointer transition-all shrink-0 ${isMuralHubActive ? 'border-amber-500' : 'border-white/5 opacity-40'}`}>{tempMuralImage ? <img src={resolveImageRef(tempMuralImage)} className="w-full h-full object-cover" /> : <span className="text-[8px] text-amber-500/30"></span>}<div className="absolute inset-x-0 bottom-0 bg-amber-500/20 text-[3px] font-bold text-amber-600 text-center uppercase py-0.5 rounded-b-xl">Mural_T</div></div> {tempMuralImage && isMuralHubActive && <button onClick={() => setTempMuralImage("")} className="absolute -top-2 -right-2 w-4 h-4 bg-black/40 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-[10px] text-white hover:text-white transition-all z-[120]">✕</button>} </div>
                          <div className="relative"> <div onClick={() => muralFeedInputRef.current?.click()} className={`w-10 h-10 rounded-xl bg-slate-900 border overflow-hidden flex flex-col items-center justify-center cursor-pointer transition-all shrink-0 ${isMuralHubActive ? 'border-amber-500' : 'border-white/5 opacity-40'}`}>{tempMuralFeedImage ? <img src={resolveImageRef(tempMuralFeedImage)} className="w-full h-full object-cover" /> : <span className="text-[8px] text-amber-500/30"></span>}<div className="absolute inset-x-0 bottom-0 bg-amber-500/20 text-[3px] font-bold text-amber-600 text-center uppercase py-0.5 rounded-b-xl">Mural_F</div></div> {tempMuralFeedImage && isMuralHubActive && <button onClick={() => setTempMuralFeedImage("")} className="absolute -top-2 -right-2 w-4 h-4 bg-black/40 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-[10px] text-white hover:text-white transition-all z-[120]">✕</button>} </div>
                        </div>
                     </div>
                  </div>
               </div>
            </section>
          )}
        </div>

        {!isEditing && (
          <section className="px-4 mt-16 mb-8 flex items-center justify-between z-10 relative">
             <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 shadow-md active:scale-95 transition-transform"><span className="text-[10px]">🏆</span><span className="text-[6px] font-black uppercase tracking-wider" style={{ color: `rgba(${feedContrast}, 1)` }}>CONQUISTAS</span></div>
             <div className="flex items-center gap-2.5 pr-1"><div className="flex flex-col items-center"><span className="text-sm font-black leading-none tracking-tighter" style={{ color: `rgba(${feedContrast}, 1)` }}>{profile.reputation}</span><span className="text-[6px] font-black uppercase tracking-widest mt-0.5" style={{ color: `rgba(${feedContrast}, 0.3)` }}>REPUTAÇÃO</span></div><div className="w-[1px] h-4 bg-white/5"></div><div className="flex flex-col items-center"><span className="text-sm font-black leading-none tracking-tighter" style={{ color: `rgba(${feedContrast}, 1)` }}>{profile.following}</span><span className="text-[6px] font-black uppercase tracking-widest mt-0.5" style={{ color: `rgba(${feedContrast}, 0.3)` }}>SEGUINDO</span></div><div className="w-[1px] h-4 bg-white/5"></div><div className="flex flex-col items-center"><span className="text-sm font-black leading-none tracking-tighter" style={{ color: `rgba(${feedContrast}, 1)` }}>{profile.followers}</span><span className="text-[6px] font-black uppercase tracking-widest mt-0.5" style={{ color: `rgba(${feedContrast}, 0.3)` }}>SEGUIDORES</span></div></div>
          </section>
        )}

        <section className="px-6 relative mb-0 z-10">
           <div className="flex justify-between items-start mb-2"><div><h3 className="text-xs font-black uppercase tracking-tight" style={{ color: `rgba(${feedContrast}, 1)` }}>Biografia</h3><p className="text-[5px] font-black uppercase tracking-[0.15em]" style={{ color: `rgba(${feedContrast}, 0.2)` }}>MEMBRO DESDE AGOSTO 2022</p></div></div>
           {isEditing ? (
             <div className="flex flex-col gap-4 w-full">
               <div className="relative w-full">
                 <textarea ref={bioTextAreaRef} value={tempBio} onChange={(e) => setTempBio(e.target.value)} placeholder="Sua lenda começa no silêncio do Vácuo..." className="w-full bg-black/30 backdrop-blur-md border border-white/10 rounded-2xl p-4 text-[10px] text-white outline-none focus:border-cyan-500 h-40 resize-none transition-all placeholder:text-white/10" />
                 <button type="button" onClick={() => bioImageInputRef.current?.click()} className="absolute bottom-4 right-4 p-2.5 bg-cyan-500 border border-cyan-400 rounded-xl text-white active:scale-90 transition-all z-[130] shadow-xl shadow-cyan-500/20">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
                 </button>
                 <input type="file" ref={bioImageInputRef} className="hidden" accept="image/*" onChange={(e) => handleInsertBioImage(e, true)} />
               </div>
             </div>
           ) : (
             <div className="flex items-center gap-2 overflow-hidden max-w-full min-w-0">
               <div className={`text-[10px] font-light leading-normal transition-all duration-300 text-left truncate flex-1 flex items-center gap-1.5 ${!profile.bio ? 'opacity-30' : 'opacity-100'}`} style={{ color: `rgba(${feedContrast}, 1)`, overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                 {profile.bio ? (
                    <>
                      {firstBioImageSrc && ( 
                         <div className={`w-14 h-12 rounded-lg overflow-hidden shrink-0 inline-block align-middle mb-0 shadow-lg border border-white/10 ${isFirstBioImageTransparent ? '' : 'bg-slate-900/40 backdrop-blur-sm'}`}> 
                           <img src={resolveImageRef(firstBioImageSrc)} className="w-full h-full object-cover" alt="Mini Card" /> 
                         </div> 
                       )}
                       <div className="truncate inline-block align-middle flex-1"> 
                         <span className="line-clamp-1 break-words">{stripBioTags(profile.bio)}</span> 
                       </div>
                    </>
                 ) : "Posso pensar em algo aqui..."}
               </div>
               {profile.bio && (<button onClick={() => { setIsMuralExpanded(true); setActiveTab('MURAL'); }} className="text-cyan-400 font-black text-xs px-1 hover:scale-110 transition-transform active:scale-95 shrink-0">...</button>)}
             </div>
           )}
        </section>

        {!isEditing && (
          <nav className="flex justify-around items-center px-1 z-10 relative">
             {['POSTS', 'MURAL', 'SALVOS'].map(t => (<button key={t} onClick={() => { if (t === 'MURAL') { setIsMuralExpanded(true); setActiveTab('MURAL'); } else { setActiveTab(t); } }} className="text-[7px] font-black uppercase tracking-0.2em transition-all relative py-2.5" style={{ color: activeTab === t ? `rgba(${feedContrast}, 1)` : `rgba(${feedContrast}, 0.2)` }}>{t}{activeTab === t && <div className="absolute bottom-0 left-0 w-full h-[1px] rounded-full shadow-[0_0_8px_rgba(255,255,255,0.4)]" style={{ backgroundColor: `rgba(${feedContrast}, 1)` }} />}</button>))}
          </nav>
        )}

        {((!isEditing) || (isEditing && isMuralHubActive)) && (
          <main 
            className={`px-4 pt-4 space-y-6 z-10 relative pb-20 rounded-t-[3rem] transition-all duration-500`}
          >
             {(!isEditing && activeTab === 'POSTS') && (
               <>
                  <div className="flex items-center justify-between"><h4 className="text-[7px] font-black uppercase tracking-[0.15em]" style={{ color: `rgba(${feedContrast}, 0.15)` }}>ENTRADAS WIKI</h4></div>
                  {(!profile.posts || profile.posts.length === 0) ? (
                    <div className="w-full aspect-[21/9] border rounded-[1.2rem] flex flex-col items-center justify-center text-center p-4 shadow-inner" style={{ backgroundColor: `rgba(${feedContrast}, 0.02)`, borderColor: `rgba(${feedContrast}, 0.05)` }}><div className="w-7 h-7 rounded-full border flex items-center justify-center mb-1.5 bg-white/[0.01]" style={{ borderColor: `rgba(${feedContrast}, 0.05)` }}><svg className="w-3.5 h-3.5" style={{ color: `rgba(${feedContrast}, 0.05)` }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg></div><p className="text-[6px] font-black uppercase tracking-[0.3em] heavyweight leading-tight max-w-[140px]" style={{ color: `rgba(${feedContrast}, 0.05)` }}>NENHUMA TRANSMISSÃO CAPTADA NESTE SETOR</p></div>
                  ) : (
                      <div className="space-y-4">
                        {profile.posts.map(post => (
                          <div key={post.id} onClick={() => { setSelectedPost(post); setWikiMuralInput(''); }} className="p-5 rounded-[1.8rem] border border-white/5 bg-white/[0.02] shadow-xl animate-in slide-in-from-bottom duration-500 overflow-hidden relative group cursor-pointer hover:bg-white/[0.04] transition-all" style={{ backgroundColor: post.customBgColor || undefined }}>
                            {post.tag === 'WIKI' && (post.customBgImages?.length || post.customBgImage) && (
                              <div className="absolute inset-0 z-0 pointer-events-none">
                                <img src={resolveImageRef(post.customBgImages?.[0] || post.customBgImage)} className="w-full h-full object-cover opacity-20" alt="Wiki Background" />
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#02040a]/80" />
                              </div>
                            )}
                            {post.tag === 'WIKI' ? (
                              <div className="flex flex-col relative z-10">
                                {/* Banner */}
                                <div className="h-32 -mx-5 -mt-5 mb-4 relative overflow-hidden">
                                  <SlideshowWallpaper 
                                    images={post.galleryImages && post.galleryImages.length > 0 ? post.galleryImages : []} 
                                    color={post.customTopColor || '#1a2036'} 
                                    opacity={0.6} 
                                    filter="none" 
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-t from-[#02040a] to-transparent opacity-60" />
                                </div>
                              
                              <div className="flex gap-4 relative z-10 -mt-12 mb-2">
                                {/* Foto de Registro */}
                                <div className="w-16 h-16 rounded-2xl border-2 border-white/20 overflow-hidden shadow-2xl bg-[#02040a] shrink-0">
                                  <img 
                                    src={resolveImageRef(post.avatar)} 
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-cover" 
                                    alt="Registro" 
                                  />
                                </div>
                                <div className="flex flex-col justify-end pb-1">
                                  <h5 className="text-[11px] font-black text-white uppercase tracking-widest">{post.title}</h5>
                                  <span className="text-[6px] font-black text-cyan-500 uppercase tracking-[0.2em]">REGISTRO WIKI</span>
                                </div>
                              </div>

                              {/* Semi-transparent content preview */}
                              <div className="flex flex-col mb-3 max-h-24 overflow-hidden">
                                <div className="text-[8px] font-medium leading-relaxed opacity-40 line-clamp-3 text-white" dangerouslySetInnerHTML={{ __html: formatBioText(getWikiNarrative(post.content), undefined, [...(post.customTopImages || []), ...(post.galleryImages || [])]) }} />
                                
                                {/* Rating Preview */}
                                {post.customInfoRows && post.customInfoRows.some(r => r.type === 'rating_star' || r.type === 'rating_heart') && (
                                  <div className="flex gap-2 mt-2">
                                    {post.customInfoRows.filter(r => r.type === 'rating_star' || r.type === 'rating_heart').slice(0, 1).map((row, i) => (
                                      <div key={i} className="flex items-center gap-1.5">
                                        <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest">{row.label}:</span>
                                        <div className="flex gap-0.5">
                                          {[1, 2, 3, 4, 5].map(v => (
                                            <span key={v} className={`${Number(row.value) >= v ? 'text-cyan-400' : 'text-white/10'}`}>
                                              {row.type === 'rating_star' ? <StarIcon active={Number(row.value) >= v} className="w-2 h-2" /> : <HeartIcon active={Number(row.value) >= v} className="w-2 h-2" />}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex justify-between items-center pt-3 border-t border-white/5">
                                <span className="text-[6px] font-black text-cyan-500/50 uppercase tracking-widest">WIKI MESTRE</span>
                                <span className="text-[6px] font-bold text-slate-600 uppercase">{new Date(post.timestamp).toLocaleDateString()}</span>
                              </div>
                            </div>
                          ) : (
                            <>
                              {post.customTopImages && post.customTopImages.length > 0 ? (
                                <div className="w-full h-32 -mx-5 -mt-5 mb-4 relative overflow-hidden">
                                   <SlideshowWallpaper images={post.customTopImages} color={post.customTopColor || '#1a2036'} opacity={0.6} filter="none" />
                                </div>
                              ) : post.title && <h5 className="text-[10px] font-black text-white uppercase tracking-widest mb-2">{post.title}</h5>}
                              
                              <div className="text-[9px] font-medium leading-relaxed line-clamp-3 max-h-24 overflow-hidden" 
                                   style={{ color: `rgba(${feedContrast}, 0.8)` }} 
                                   dangerouslySetInnerHTML={{ __html: formatBioText(post.content, undefined, [...(post.customTopImages || []), ...(post.galleryImages || [])]) }} />
                              
                              {post.galleryImages && post.galleryImages.length > 0 && (
                                <div className="grid grid-cols-4 gap-2 mt-4">
                                  {post.galleryImages.map((img, i) => (
                                    <div key={i} className="aspect-square rounded-lg border border-white/10 overflow-hidden bg-black/20 shadow-lg">
                                       <img src={resolveImageRef(img)} className="w-full h-full object-cover" alt="Gallery" />
                                    </div>
                                  ))}
                                </div>
                              )}

                              <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5"><span className="text-[6px] font-black text-cyan-500 uppercase tracking-widest">{post.tag}</span><span className="text-[6px] font-bold text-slate-600 uppercase">{new Date(post.timestamp).toLocaleDateString()}</span></div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
               </>
             )}
             {(isMuralHubActive || (!isEditing && activeTab === 'MURAL')) && (
               <div className="animate-in fade-in duration-500">
                  {isEditing && isMuralHubActive && (
                    <div className="px-2 animate-in fade-in duration-700 mb-2">
                       <div className="text-[14px] md:text-[17px] font-light leading-normal transition-all duration-300 text-left flex items-center gap-1.5" style={{ color: getAutoContrastHex(tempMuralTopColor) }}>
                          <div className="w-full break-words" dangerouslySetInnerHTML={{ __html: tempBio ? formatBioText(tempBio) : 'Posso pensar em algo aqui...' }} />
                       </div>
                    </div>
                  )}
                  {renderCommentsSection(tempWikiMural, editorMuralInput, setEditorMuralInput, handleSendEditorMuralComment, handleDeleteEditorMuralComment, getAutoContrastHex(isEditing ? tempMuralFeedColor : profile.muralFeedColor || '#02040a'), undefined, isEditing ? tempMuralFeedColor : profile.muralFeedColor)}
               </div>
             )}
             {(!isEditing && activeTab === 'SALVOS') && (
               <div className="animate-in fade-in duration-500 space-y-4 flex flex-col items-center py-12"><div className="w-16 h-16 rounded-full border-2 border-dashed flex items-center justify-center mb-6" style={{ borderColor: `rgba(${feedContrast}, 0.05)` }}><span className="text-2xl grayscale opacity-20">📑</span></div><h4 className="text-[9px] font-black uppercase tracking-[0.4em]" style={{ color: `rgba(${feedContrast}, 0.2)` }}>COLEÇÃO DE DADOS VAZIA</h4><p className="text-[8px] text-center max-w-200px font-bold uppercase heavyweight leading-relaxed" style={{ color: `rgba(${feedContrast}, 0.1)` }}>Sinais marcados para análise futura aparecerão neste setor criptografado.</p></div>
             )}
          </main>
        )}
      </div>

      {showEditor && (
        <div 
          className="fixed inset-0 z-[2000] flex flex-col animate-in slide-in-from-bottom duration-500 overflow-hidden" 
          style={{ 
            background: (showEditor === 'WIKI' || showEditor === 'BLOG') && editorViewMode === 'editor' 
              ? '#000000' 
              : ((showEditor === 'WIKI' || showEditor === 'BLOG') && editorViewMode === 'preview' 
                  ? `linear-gradient(to bottom, ${wikiTopColor === 'transparent' ? '#000' : wikiTopColor} 0%, ${wikiBgColor === 'transparent' ? '#000' : wikiBgColor} 100%)` 
                  : '#02040a')
          }}
        >
          <header className={`relative z-[2100] p-6 flex items-center justify-between shrink-0 transition-all duration-500 ${showEditor === 'WIKI' && editorViewMode === 'preview' ? 'bg-transparent border-transparent shadow-none' : 'bg-black/40 backdrop-blur-xl border-b border-white/5 shadow-2xl'}`}>
            <button onClick={() => { 
                if (editingWikiId) {
                  const originalPost = profile.posts?.find(p => p.id === editingWikiId);
                  if (originalPost) setSelectedPost(originalPost);
                }
                setShowEditor(null); 
                setEditingWikiId(null); 
              }} className="p-2.5 bg-white/5 rounded-2xl text-slate-400 hover:text-white transition-all active:scale-90 border border-white/5">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div className="flex flex-col items-center flex-1 mx-4">
               <h2 className="text-[10px] font-bold text-white uppercase tracking-[0.1em]">
                  {editorViewMode === 'preview' ? (editorTitle || "SEM TÍTULO") : (showEditor === 'WIKI' ? 'Nova Entrada Wiki' : `Novo ${showEditor}`)}
               </h2>
               <div className="flex gap-6 mt-3">
                  <button onClick={() => setEditorViewMode('editor')} className={`text-[8px] font-black uppercase tracking-widest transition-all ${editorViewMode === 'editor' ? 'text-cyan-400' : 'text-slate-600'}`}>Configurar</button>
                  <button onClick={() => setEditorViewMode('preview')} className={`text-[8px] font-black uppercase tracking-widest transition-all ${editorViewMode === 'preview' ? 'text-cyan-400' : 'text-slate-600'}`}>Visualizar</button>
               </div>
            </div>
            <div className="flex gap-3">
               <button onClick={handleSavePost} disabled={isSavingWiki} className="p-2.5 bg-white text-black rounded-2xl hover:bg-cyan-50 transition-all disabled:opacity-50 shadow-[0_0_25px_rgba(255,255,255,0.3)] active:scale-95 border border-white/50 relative overflow-hidden">
                  {isSavingWiki ? (
                    <div className="w-6 h-6 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
                  )}
               </button>
            </div>
            {isSavingWiki && (
              <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10 z-[2200]">
                <div 
                  className="h-full bg-cyan-500 transition-all duration-300 shadow-[0_0_10px_rgba(34,211,238,0.5)]" 
                  style={{ width: `${wikiSaveProgress}%` }}
                />
              </div>
            )}
          </header>
          
          <main className={`flex-1 overflow-y-auto no-scrollbar flex flex-col ${(showEditor === 'WIKI' || showEditor === 'BLOG') && editorViewMode === 'preview' ? 'bg-transparent' : 'bg-[#02040a]'}`}>
            {(showEditor === 'WIKI' || showEditor === 'BLOG') ? (
              editorViewMode === 'editor' ? (
                <div className={`${(showEditor === 'WIKI' || showEditor === 'BLOG') && editorViewMode === 'preview' ? (wikiWideMode ? 'w-full' : 'max-w-3xl mx-auto') : 'max-w-3xl mx-auto'} flex flex-col pb-40 ${(showEditor === 'WIKI' || showEditor === 'BLOG') && editorViewMode === 'preview' ? 'bg-transparent' : 'bg-[#02040a]'}`}>
                   {activePicker && activePicker.field.startsWith('wiki') && (
                     <div className="mx-8 mt-4 p-3 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 animate-in zoom-in duration-300 shadow-2xl relative z-[200]">
                       <div className="flex justify-between items-center mb-2 px-1"> 
                         <span className="text-[8px] font-black text-white uppercase tracking-widest">{activePicker.label}</span> 
                         <button onClick={() => setActivePicker(null)} className="text-white/60 hover:text-white font-bold text-xs transition-colors">✕</button> 
                       </div>
                       <div className="space-y-3">
                         <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                           <div className="space-y-1">
                             <div className="flex justify-between items-center px-0.5">
                               <span className="text-[5px] font-bold text-white/40 uppercase">Matiz</span>
                               <span className="text-[5px] font-black text-white">{pickerHsla.h}°</span>
                             </div>
                             <input type="range" min="0" max="360" value={pickerHsla.h} onChange={(e) => updatePickerColor(Number(e.target.value), pickerHsla.s, pickerHsla.l, pickerHsla.a || 1)} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }} />
                           </div>
                           <div className="space-y-1">
                             <div className="flex justify-between items-center px-0.5">
                               <span className="text-[5px] font-bold text-white/40 uppercase">Saturação</span>
                               <span className="text-[5px] font-black text-white">{pickerHsla.s}%</span>
                             </div>
                             <input type="range" min="0" max="100" value={pickerHsla.s} onChange={(e) => updatePickerColor(pickerHsla.h, Number(e.target.value), pickerHsla.l, pickerHsla.a || 1)} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, hsl(${pickerHsla.h}, 0%, ${pickerHsla.l}%), hsl(${pickerHsla.h}, 100%, ${pickerHsla.l}%))` }} />
                           </div>
                         </div>
                         <div className="space-y-1">
                           <div className="flex justify-between items-center px-0.5">
                             <span className="text-[5px] font-bold text-white/40 uppercase">Brilho</span>
                             <span className="text-[5px] font-black text-white">{pickerHsla.l}%</span>
                           </div>
                           <input type="range" min="0" max="100" value={pickerHsla.l} onChange={(e) => updatePickerColor(pickerHsla.h, pickerHsla.s, Number(e.target.value), 1)} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #000, hsl(${pickerHsla.h}, ${pickerHsla.s}%, 50%), #fff)` }} />
                         </div>
                         <div className="flex items-center gap-3 pt-1">
                           <input 
                             type="text" 
                             value={tempHexInput} 
                             onChange={(e) => handleHexInput(e.target.value)}
                             className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[8px] font-bold text-white uppercase outline-none focus:border-cyan-500 transition-all"
                             placeholder="#000000"
                           />
                           <button 
                             onClick={() => handleResetColor(activePicker.field)}
                             className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-[6px] font-black text-white uppercase transition-all border border-white/5"
                           >
                             Resetar
                           </button>
                         </div>
                                                  </div>
                      </div>
                    )}
                    {showEditor !== 'BLOG' && (
                      <section className="pt-10 pb-10 flex items-center gap-12 border-b border-white/5 relative">
                        <div className="flex flex-col items-center gap-8 shrink-0 w-40">
                          <div 
                            onClick={() => wikiAvatarRef.current?.click()}
                            className="w-32 h-32 rounded-[2.5rem] bg-white/[0.03] border border-white/10 flex items-center justify-center shrink-0 cursor-pointer overflow-hidden relative group shadow-2xl transition-all hover:border-cyan-500/50 hover:shadow-cyan-500/20"
                          >
                            {wikiAvatar ? (
                              <div className="relative w-full h-full group">
                                <img src={resolveImageRef(wikiAvatar)} className="w-full h-full object-cover transition-transform group-hover:scale-110" style={{ objectPosition: `center ${wikiAvatarPosition}%` }} />
                                <div className="absolute inset-0 bg-cyan-500/0 group-hover:bg-cyan-500/10 transition-colors" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 backdrop-blur-[1px]">
                                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                </div>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setWikiAvatar(null); }} 
                                  className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white transition-all z-20 backdrop-blur-md opacity-0 group-hover:opacity-100"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                <span className="text-[6px] font-black uppercase tracking-widest text-white">Adicionar</span>
                              </div>
                            )}
                            <input type="file" ref={wikiAvatarRef} className="hidden" accept="image/*" onChange={(e) => handleImageInput(e, setWikiAvatar)} />
                          </div>
                          {wikiAvatar && (
                            <div className="flex flex-col gap-2 w-28">
                               <div className="flex justify-between items-center px-1">
                                 <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em]">Vertical</span>
                                 <span className="text-[7px] font-black text-cyan-500 tabular-nums">{wikiAvatarPosition}%</span>
                               </div>
                               <input 
                                 type="range" 
                                 min="0" max="100" 
                                 value={wikiAvatarPosition} 
                                 onChange={(e) => setWikiAvatarPosition(Number(e.target.value))} 
                                 className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-500 hover:bg-white/20 transition-colors"
                               />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[8px] font-black text-slate-600 uppercase tracking-[0.5em] ml-1">Assinatura Digital</label>
                            <button 
                              onClick={() => setWikiWideMode(!wikiWideMode)} 
                              className={`flex items-center gap-2 group transition-all`}
                            >
                               <div className={`w-8 h-4 rounded-full border border-white/20 relative transition-all ${wikiWideMode ? 'bg-cyan-500' : 'bg-white/5'}`}>
                                  <div className={`absolute top-0.5 bottom-0.5 w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-all ${wikiWideMode ? 'left-[1.1rem]' : 'left-0.5'}`} />
                               </div>
                               <span className="text-[7px] font-black uppercase tracking-widest text-slate-500 group-hover:text-cyan-400 transition-colors">Margem Livre</span>
                            </button>
                          </div>
                          <input 
                            value={editorTitle} 
                            onChange={(e) => setEditorTitle(e.target.value.slice(0, 35))} 
                            placeholder="NOME DE REGISTRO..." 
                            maxLength={35}
                            className="w-full bg-transparent border-b border-white/10 py-3 text-base font-bold text-white outline-none focus:border-cyan-500 transition-all placeholder:text-slate-600 uppercase tracking-tight"
                          />
                        </div>
                     </section>
                    )}

                    {showEditor === 'BLOG' && (
                      <section className="pt-10 pb-10 flex flex-col gap-8 relative overflow-hidden">
                        {/* Background for Blog Config */}
                        <div className="absolute inset-0 z-0 pointer-events-none h-full">
                           <SlideshowWallpaper 
                             images={wikiBgImages} 
                             color={wikiTopColor} 
                             opacity={wikiBgImages.length > 0 ? (getWallpaperOpacity(wikiBgColor) || 0.4) : 1} 
                             filter={getWallpaperFilter(wikiBgColor)} 
                             noGradient={true}
                           />
                           <div className={`absolute inset-0 z-10 transition-opacity duration-700 ${wikiBgImages.length > 0 ? 'opacity-40' : 'opacity-100'}`} style={{ background: `linear-gradient(to bottom, ${(wikiTopColor || '#1a2036') + 'B3'} 0%, transparent 35%, transparent 75%, ${wikiBgColor || '#02040a'} 100%)` }} />
                        </div>

                        <div className="flex-1 space-y-3 px-8 relative z-20">
                          <label className="text-[8px] font-black text-slate-600 uppercase tracking-[0.5em] ml-1">Título do Blog</label>
                          <input 
                            value={editorTitle} 
                            onChange={(e) => setEditorTitle(e.target.value.slice(0, 35))} 
                            placeholder="TÍTULO DA POSTAGEM..." 
                            maxLength={35}
                            className="w-full bg-transparent border-none py-3 text-base font-bold text-white outline-none focus:border-none transition-all placeholder:text-slate-600 uppercase tracking-tight"
                          />
                        </div>
                      </section>
                    )}

                    <div className={`grid grid-cols-1 ${showEditor === 'BLOG' ? '' : 'border-b border-white/5'}`}>
                     {showEditor !== 'BLOG' && (
                      <section className="px-8 py-6 space-y-4">
                      <div className="flex items-center justify-between">
                         <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Imagens da Narrativa (img_+)</span>
                         <div className="flex items-center gap-2">
                            <button 
                              onClick={() => setWikiHideOverlay(!wikiHideOverlay)} 
                              className={`px-3 py-1 rounded-full text-[7px] font-black uppercase transition-all ${wikiHideOverlay ? 'bg-cyan-500 text-black' : 'bg-white/5 border border-white/10 text-white'}`}
                            >
                              {wikiHideOverlay ? 'Overlay: OFF' : 'Overlay: ON'}
                            </button>
                            <button onClick={() => wikiTopRef.current?.click()} className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[7px] font-black uppercase">+ Adicionar</button>
                         </div>
                      </div>
                      {wikiTopImages.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
                           {wikiTopImages.map((imgObj, i) => (
                             <div 
                               key={i} 
                               onClick={() => {
                                 const textarea = editorTextAreaRef.current;
                                 const start = textarea?.selectionStart ?? editorContent.length;
                                 const end = textarea?.selectionEnd ?? start;
                                 const before = editorContent.substring(0, start);
                                 const after = editorContent.substring(end);
                                 const insertId = imgObj.id.startsWith('vimg_') ? imgObj.id : `vimg_${imgObj.id}`;
                                 const tag = `[${insertId} h=150 p=50 x=50 w=100 a=c] ""`;
                                 setEditorContent(`${before}${tag}${after}`);
                                 setTimeout(() => {
                                   textarea?.focus();
                                   textarea?.setSelectionRange(start + tag.length, start + tag.length);
                                 }, 0);
                               }}
                               className="relative w-20 h-14 shrink-0 rounded-xl border border-white/20 overflow-hidden group cursor-pointer hover:border-cyan-500 transition-all shadow-lg active:scale-95 bg-white/[0.02]"
                             >
                                <img src={resolveImageRef(imgObj.src)} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                                <div className="absolute inset-0 bg-cyan-500/0 group-hover:bg-cyan-500/10 transition-colors" />
                                <button onClick={(e) => { e.stopPropagation(); setWikiTopImages(prev => prev.filter((_, idx) => idx !== i)); }} className="absolute top-0 right-0 p-1 bg-black/60 rounded-bl-lg text-[8px] opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-500">✕</button>
                             </div>
                           ))}
                        </div>
                      )}
                      <input type="file" ref={wikiTopRef} className="hidden" accept="image/*" multiple onChange={handleWikiTopUpload} />
                    </section>
                    )}

                      <div className="grid grid-cols-2 border-t border-white/5 divide-x divide-white/5">
                        {/* Fundo de Perfil */}
                        <section className="flex flex-col relative">
                           <div 
                             onClick={() => wikiBgRef.current?.click()}
                             className="px-8 pt-14 pb-8 flex flex-col items-center gap-3 cursor-pointer hover:bg-white/[0.02] transition-all group"
                           >
                             <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white group-hover:bg-white/5 transition-all">
                               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                             </div>
                             <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Fundo de Perfil</span>
                             <input type="file" ref={wikiBgRef} className="hidden" accept="image/*" multiple onChange={handleInsertWikiBg} />
                           </div>

                           {/* Color + Reset for Top (Top Right) */}
                           <div className="absolute top-4 right-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <div 
                                onClick={() => openPicker('wikiTop', 'Cor do Topo', wikiTopColor)}
                                className="w-8 h-8 rounded-full border-2 border-white/20 transition-all shadow-md shrink-0 cursor-pointer hover:scale-110 active:scale-90 shadow-white/5" 
                                style={{ backgroundColor: wikiTopColor === 'transparent' ? 'rgba(0,0,0,0.1)' : wikiTopColor }} 
                              />
                              <button 
                                onClick={() => handleResetColor('wikiTop')}
                                className="p-1 px-2.5 bg-white/10 hover:bg-white/20 rounded-md text-[6px] font-black text-white uppercase transition-all border border-white/5 flex items-center justify-center h-8"
                              >
                                Resetar
                              </button>
                           </div>
                           
                           {wikiBgImages.length > 0 && (
                             <div className="px-6 pb-8 flex overflow-x-auto no-scrollbar gap-4">
                               {wikiBgImages.map((img, idx) => (
                                 <div key={idx} className="shrink-0 flex flex-col gap-2 group/gall items-center">
                                   <div 
                                     className="relative w-32 h-20 rounded-xl overflow-hidden border border-white/10 group-hover/gall:border-cyan-400 transition-all shadow-lg bg-white/5"
                                   >
                                     <img src={resolveImageRef(img.src)} className="w-full h-full object-cover transition-transform group-hover/gall:scale-110" style={{ objectPosition: `center ${img.position}%` }} />
                                     <div className="absolute inset-0 bg-black/0 group-hover/gall:bg-black/10 transition-colors" />
                                     <button 
                                       onClick={(e) => { e.stopPropagation(); setWikiBgImages(wikiBgImages.filter((_, i) => i !== idx)); }}
                                       className="absolute top-1 right-1 p-1 bg-red-500 rounded-lg text-white opacity-0 group-hover/gall:opacity-100 transition-all active:scale-90 z-10"
                                     >
                                       <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
                                     </button>
                                   </div>
                                 </div>
                               ))}
                             </div>
                           )}
                        </section>

                        {/* Acervo da Galeria */}
                        <section className="flex flex-col relative">
                           <div 
                             onClick={() => wikiGalleryRef.current?.click()}
                             className="px-8 pt-14 pb-8 flex flex-col items-center gap-3 cursor-pointer hover:bg-white/[0.02] transition-all group"
                           >
                             <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white group-hover:bg-white/5 transition-all">
                               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6.75a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6.75v11.25a1.5 1.5 0 001.5 1.5zM12 12.75h.007v.007H12v-.007z" /></svg>
                             </div>
                             <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{showEditor === 'BLOG' ? 'Imagens Salvas' : 'Acervo da Galeria'}</span>
                             <input type="file" ref={wikiGalleryRef} className="hidden" accept="image/*" multiple onChange={handleInsertWikiGallery} />
                           </div>
                           
                           {wikiGallery.length > 0 && (
                               <div className="px-6 pb-8 flex overflow-x-auto no-scrollbar gap-4">
                                 {wikiGallery.map((img, idx) => (
                                   <div key={idx} className="shrink-0 flex flex-col gap-2 group/gall items-center">
                                     <div 
                                       className="relative w-32 h-20 rounded-xl overflow-hidden border border-white/10 group-hover/gall:border-cyan-400 transition-all shadow-lg bg-white/5"
                                     >
                                       <img src={resolveImageRef(img.src)} className="w-full h-full object-cover transition-transform group-hover/gall:scale-110" style={{ objectPosition: `center ${img.position}%` }} />
                                       <div className="absolute inset-0 bg-black/0 group-hover/gall:bg-black/10 transition-colors" />
                                       <button 
                                         onClick={(e) => { e.stopPropagation(); setWikiGallery(wikiGallery.filter((_, i) => i !== idx)); }}
                                         className="absolute top-1 right-1 p-1 bg-red-500 rounded-lg text-white opacity-0 group-hover/gall:opacity-100 transition-all active:scale-90 z-10"
                                       >
                                         <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
                                       </button>
                                     </div>
                                     {showEditor !== 'BLOG' && (
                                       <div className="w-full flex flex-col gap-1 items-center px-1">
                                          <span className="text-[6px] font-black text-slate-500 uppercase tracking-widest">Posição: {img.position}%</span>
                                          <input 
                                            type="range" 
                                            min="0" max="100" 
                                            value={img.position} 
                                            onChange={(e) => {
                                              const newGall = [...wikiGallery];
                                              newGall[idx].position = Number(e.target.value);
                                              setWikiGallery(newGall);
                                            }}
                                            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-500"
                                          />
                                       </div>
                                     )}
                                   </div>
                                 ))}
                               </div>
                             )}

                             {/* Color + Reset for Gallery (Top Right) */}
                             <div className="absolute top-4 right-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                <div 
                                  onClick={() => openPicker('wikiBg', 'Cor do Fundo', wikiBgColor)}
                                  className="w-8 h-8 rounded-full border-2 border-white/20 transition-all shadow-md shrink-0 cursor-pointer hover:scale-110 active:scale-90 shadow-white/5" 
                                  style={{ backgroundColor: wikiBgColor === 'transparent' ? 'rgba(0,0,0,0.1)' : wikiBgColor }} 
                                />
                                <button 
                                  onClick={() => handleResetColor('wikiBg')}
                                  className="p-1 px-2.5 bg-white/10 hover:bg-white/20 rounded-md text-[6px] font-black text-white uppercase transition-all border border-white/5 flex items-center justify-center h-8"
                                >
                                  Resetar
                                </button>
                             </div>
                          </section>

                      </div>
                    </div>

                    <section className="px-8 py-8 space-y-3 border-b border-white/5">
                      <label className="text-[8px] font-black uppercase tracking-[0.4em] ml-1" style={{ color: getAutoContrastHex(selectedPost ? selectedPost.customBgColor || '#02040a' : wikiBgColor || '#02040a') }}>Sinais de Indexação (Tags)</label>
                      <input 
                        value={wikiKeywords} 
                        onChange={(e) => setWikiKeywords(e.target.value)} 
                        placeholder="EX: HUMANO, SETOR_FROST, REBELDE..." 
                        className="w-full bg-white/[0.03] border border-white/10 rounded-2xl p-5 text-[10px] font-black text-cyan-400 outline-none focus:border-cyan-500/40 placeholder:text-slate-800 uppercase tracking-widest shadow-inner" 
                      />
                   </section>

                   <section className="px-8 py-10 space-y-4 border-b border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[8px] font-black uppercase tracking-[0.4em] ml-1" style={{ color: getAutoContrastHex(selectedPost ? selectedPost.customBgColor || '#02040a' : wikiBgColor || '#02040a') }}>Iniciar relatório narrativo</label>
                        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
                          <button onClick={() => insertTag('B')} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-white font-black text-[10px] hover:bg-white/10 transition-all">B</button>
                          <button onClick={() => insertTag('I')} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-white italic text-[10px] hover:bg-white/10 transition-all">I</button>
                          <button onClick={() => insertTag('U')} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-white underline text-[10px] hover:bg-white/10 transition-all">U</button>
                          <button onClick={() => insertTag('S')} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-white line-through text-[10px] hover:bg-white/10 transition-all">S</button>
                          <button onClick={() => insertTag('C')} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 text-white text-[10px] hover:bg-white/10 transition-all">C</button>
                          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />
                          <button onClick={() => wikiNarrativeImageRef.current?.click()} className="w-7 h-7 flex items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-all">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </button>
                          <input type="file" ref={wikiNarrativeImageRef} className="hidden" accept="image/*" onChange={(e) => handleInsertBioImage(e, false)} />
                        </div>
                      </div>
                      <textarea 
                        ref={editorTextAreaRef}
                        value={editorContent} 
                        onChange={(e) => setEditorContent(e.target.value)} 
                        placeholder="Narre a trajetória, as sombras e os segredos deste registro no vácuo galáctico..." 
                        className="w-full bg-white/[0.02] border border-white/10 rounded-[2.5rem] p-8 text-sm text-slate-300 outline-none focus:border-white/20 min-h-[350px] resize-none leading-relaxed shadow-inner" 
                      />
                   </section>

                   {showEditor !== 'BLOG' && (
                     <section className="bg-black/40">
                      <div className="px-8 py-5 border-y border-white/5 flex items-center justify-between bg-white/[0.02]">
                        <h3 className="text-[9px] font-black uppercase tracking-[0.5em]" style={{ color: getAutoContrastHex(selectedPost ? selectedPost.customBgColor || '#02040a' : wikiBgColor || '#02040a') }}>Matriz de Dados Técnicos</h3>
                        <button 
                          onClick={() => setWikiInfoRows([...wikiInfoRows, { label: '', value: '' }])} 
                          className="w-10 h-10 rounded-2xl bg-white/10 text-white flex items-center justify-center shadow-lg active:scale-90 transition-all border border-white/20"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        </button>
                      </div>
                      <div className="divide-y divide-white/5">
                        {wikiInfoRows.map((row, idx) => (
                          <div key={idx} className="flex flex-col md:flex-row items-stretch md:items-center px-8 py-4 group hover:bg-white/[0.02] transition-colors gap-4">
                            <div className="flex-1 flex flex-col gap-1 min-w-0">
                                <span className="text-[7px] font-black uppercase tracking-[0.2em] ml-1" style={{ color: getAutoContrastHex(selectedPost ? selectedPost.customBgColor || '#02040a' : wikiBgColor || '#02040a'), opacity: 0.6 }}>Protocolo / Rótulo</span>
                                <input 
                                  value={row.label} 
                                  onChange={(e) => {
                                    const newRows = [...wikiInfoRows];
                                    newRows[idx].label = e.target.value;
                                    if (e.target.value.toLowerCase().includes('avalia')) {
                                        newRows[idx].type = 'rating_star';
                                    }
                                    setWikiInfoRows(newRows);
                                  }} 
                                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-[11px] font-black text-white outline-none focus:border-cyan-500/50 transition-all uppercase placeholder:text-slate-800" 
                                  placeholder="EX: CLASSIFICAÇÃO" 
                                />
                            </div>
                            <div className="flex-[1.5] flex flex-col gap-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[7px] font-black uppercase tracking-[0.2em] ml-1" style={{ color: getAutoContrastHex(selectedPost ? selectedPost.customBgColor || '#02040a' : wikiBgColor || '#02040a'), opacity: 0.6 }}>Dados / Frequência</span>
                                  <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10 scale-75 origin-right">
                                      {['text', 'rating_star', 'rating_heart'].map(t => (
                                          <button 
                                              key={t}
                                              onClick={() => {
                                                  const newRows = [...wikiInfoRows];
                                                  newRows[idx].type = t as any;
                                                  if (t !== 'text') newRows[idx].value = '0';
                                                  setWikiInfoRows(newRows);
                                              }}
                                              className={`p-1.5 rounded transition-all ${row.type === t ? 'bg-cyan-500 text-black' : 'text-white/40 hover:text-white/60'}`}
                                          >
                                              {t === 'text' ? <span className="text-[7px] font-black px-1">TXT</span> : t === 'rating_star' ? <StarIcon active={true} className="w-3.5 h-3.5" /> : <HeartIcon active={true} className="w-3.5 h-3.5" />}
                                          </button>
                                      ))}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 h-[46px]">
                                    {row.type === 'rating_star' || row.type === 'rating_heart' ? (
                                        <div className="flex-1 flex items-center justify-center gap-2 h-full bg-black/20 rounded-xl px-4 border border-white/5">
                                            {[1, 2, 3, 4, 5].map(v => (
                                                <button 
                                                    key={v}
                                                    onClick={() => {
                                                        const newRows = [...wikiInfoRows];
                                                        newRows[idx].value = String(v);
                                                        setWikiInfoRows(newRows);
                                                    }}
                                                    className={`transition-all ${Number(row.value) >= v ? 'text-cyan-400 scale-110 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'text-white/10 scale-90 hover:text-white/30'}`}
                                                >
                                                    {row.type === 'rating_star' ? <StarIcon active={Number(row.value) >= v} className="w-6 h-6" /> : <HeartIcon active={Number(row.value) >= v} className="w-6 h-6" />}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <input 
                                          value={row.value} 
                                          onChange={(e) => {
                                            const newRows = [...wikiInfoRows];
                                            newRows[idx].value = e.target.value;
                                            setWikiInfoRows(newRows);
                                          }} 
                                          className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 h-full text-[11px] font-bold text-white outline-none focus:border-cyan-500/50 transition-all placeholder:text-slate-800" 
                                          placeholder="EX: OPERATIVO" 
                                        />
                                    )}
                                    <button 
                                      onClick={() => setWikiInfoRows(wikiInfoRows.filter((_, i) => i !== idx))} 
                                      className="w-11 h-full flex items-center justify-center bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all active:scale-90 shrink-0 border border-red-500/20"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12"/></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                      </div>
                   </section>
                   )}
                </div>
              ) : (
                <div className="relative z-10 w-full animate-in fade-in duration-700 pb-40">
                    {(showEditor === 'WIKI' || showEditor === 'BLOG') && editorViewMode === 'preview' && (
                       <div className="fixed inset-0 z-0 pointer-events-none">
                          {wikiBgImages.length > 0 && (
                            <SlideshowWallpaper 
                              images={wikiBgImages.map(img => ({ src: resolveImageRef(img.src), position: img.position }))} 
                              color={wikiTopColor || '#1a2036'} 
                              opacity={0.4} 
                              filter="none" 
                              noGradient={true}
                            />
                          )}
                          <div className={`absolute inset-0 z-10 transition-opacity duration-700 ${wikiBgImages.length > 0 ? 'opacity-40' : 'opacity-100'}`} style={{ background: `linear-gradient(to bottom, ${(wikiTopColor || '#1a2036') + 'B3'} 0%, transparent 35%, transparent 75%, ${wikiBgColor || '#02040a'} 100%)` }} />
                       </div>
                    )}
                   {/* Banner / Header Section */}
                   {showEditor !== 'BLOG' && (
                     <div className="relative w-full h-56 md:h-80 overflow-hidden">
                        <SlideshowWallpaper 
                          images={wikiGallery.map(img => typeof img === 'object' ? { ...img, src: resolveImageRef(img.src) } : resolveImageRef(img))} 
                          color={wikiTopColor} 
                          opacity={0.95} 
                          filter="none" 
                          noGradient={wikiHideOverlay}
                        />
                        {!wikiHideOverlay && <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-black/20" />}
                     </div>
                   )}

                   <div className={`${wikiWideMode ? 'w-full px-4' : 'max-w-3xl mx-auto px-6'} ${showEditor !== 'BLOG' ? '-mt-12' : 'pt-10'} relative z-20 space-y-4`}>
                      {/* Header: Avatar and Title left aligned */}
                      <div className="flex items-end gap-6">
                         {wikiAvatar && (
                           <div className="w-28 h-28 rounded-3xl border-4 overflow-hidden shadow-2xl shrink-0 bg-[#1a2036]" style={{ borderColor: wikiBgColor === 'transparent' ? '#02040a' : wikiBgColor }}>
                             <img src={resolveImageRef(wikiAvatar)} className="w-full h-full object-cover" style={{ objectPosition: `center ${wikiAvatarPosition}%` }} />
                           </div>
                         )}
                         <div className="flex flex-col pb-2 min-w-0 flex-1">
                            {(() => {
                               const titleColor = getAutoContrastHex(wikiTopColor || '#1a2036');
                               const isTitleDark = hexToHsla(titleColor).l < 30;
                               return (
                                 <>
                                   <h1 
                                     className={`text-xl font-black uppercase tracking-tight break-words w-full ${isTitleDark ? '' : 'drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]'}`} 
                                     style={{ color: titleColor }}
                                   >
                                     {editorTitle || "SEM TÍTULO"}
                                   </h1>
                                 </>
                               );
                            })()}
                         </div>
                      </div>

                      {/* Tags centered below title section */}
                      {wikiKeywords && (
                        <div className="flex justify-start pl-1 -mt-2">
                           <div className="opacity-60 text-[8px] font-black uppercase tracking-[0.3em] text-left bg-white/5 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                              {wikiKeywords.split(',').map(tag => `#${tag.trim()}`).join(' ')}
                           </div>
                        </div>
                      )}

                      {/* Creator info and Narrative content */}
                      <div className={`space-y-4 ${showEditor !== 'BLOG' ? 'pt-6 border-t border-white/5' : ''}`}>
                          {/* Technical Data Matrix */}
                          {showEditor !== 'BLOG' && (
                            <div className="flex flex-col gap-1.5">
                               {wikiInfoRows.map((row, i) => {
                                 if (!row.label || !row.value) return null;
                                 const isRatingType = row.type === 'rating_star' || row.type === 'rating_heart' || (!isNaN(Number(row.value)) && row.value.trim() !== '');
                                 
                                 if (isRatingType) {
                                   return (
                                     <div key={i} className="bg-white/[0.03] px-5 py-3 rounded-xl flex items-center justify-between gap-4 border border-white/10 backdrop-blur-sm group hover:bg-white/5 transition-colors">
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                           <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full w-fit bg-white/5 shadow-sm" style={{ color: getAutoContrastHex(wikiBgColor || '#02040a'), opacity: 0.8 }}>{row.label}</span>
                                           <span className="text-[10px] font-black opacity-20 uppercase" style={{ color: getAutoContrastHex(wikiBgColor || '#02040a') }}>=</span>
                                        </div>
                                        <div className="flex-1 flex justify-end items-center min-w-0">
                                           {row.type === 'rating_star' || row.type === 'rating_heart' ? (
                                               <div className="flex gap-1">
                                                   {[1, 2, 3, 4, 5].map(v => (
                                                       <span key={v} className={`${Number(row.value) >= v ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'text-white/5'}`}>
                                                           {row.type === 'rating_star' ? <StarIcon active={Number(row.value) >= v} className="w-3.5 h-3.5" /> : <HeartIcon active={Number(row.value) >= v} className="w-3.5 h-3.5" />}
                                                       </span>
                                                   ))}
                                               </div>
                                           ) : (
                                               <span className="text-[11px] font-bold tracking-tight break-words text-left" style={{ color: getAutoContrastHex(wikiBgColor || '#02040a') }}>{row.value}</span>
                                           )}
                                        </div>
                                     </div>
                                   );
                                 }

                                 return (
                                   <div key={i} className="flex items-center justify-between gap-4 py-1 px-1 group transition-colors">
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                         <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full w-fit bg-white/5 shadow-sm" style={{ color: getAutoContrastHex(wikiBgColor || '#02040a'), opacity: 0.8 }}>{row.label}</span>
                                         <span className="text-[10px] font-black opacity-20 uppercase" style={{ color: getAutoContrastHex(wikiBgColor || '#02040a') }}>=</span>
                                      </div>
                                      <div className="flex-1 flex justify-end items-center min-w-0 text-left">
                                         <span className="text-[11px] font-bold tracking-tight break-words" style={{ color: getAutoContrastHex(wikiBgColor || '#02040a') }}>{row.value}</span>
                                      </div>
                                   </div>
                                 );
                               })}
                            </div>
                          )}

                          <div className="text-[14px] leading-relaxed px-1 font-inter" style={{ color: getAutoContrastHex(wikiBgColor || '#02040a') }} dangerouslySetInnerHTML={{ __html: formatBioText(editorContent, undefined, [...wikiTopImages, ...(wikiGallery || [])], true) }} />

                          {(showEditor === 'BLOG' ? wikiGallery.length > 0 : wikiTopImages.length > 0) && (() => {
                             const wikiSavedImagesContrast = getAutoContrastHex(wikiBgColor || '#02040a');
                             const isLightBgWikiSaved = hexToHsla(wikiSavedImagesContrast).l < 40;
                             return (
                               <div className="text-left mt-8">
                                 <h3 className={`text-[10px] font-black uppercase tracking-widest mb-2 px-4 py-1.5 rounded-full inline-block ${isLightBgWikiSaved ? 'bg-black/5 shadow-sm border border-black/5' : 'bg-white/5 border border-white/10'}`} style={{ color: wikiSavedImagesContrast, opacity: 0.8 }}>Imagens Salvas</h3>
                                 <div className={`border-t ${isLightBgWikiSaved ? 'border-black/5' : 'border-white/10'} mb-4`} />
                               </div>
                             );
                          })()}

                          {/* Wiki/Blog Tag Images as Medium Cards */}
                          {(showEditor === 'BLOG' ? wikiGallery.length > 0 : wikiTopImages.length > 0) && (
                            <div className="flex gap-4 overflow-x-auto no-scrollbar w-full pb-2">
                              {(showEditor === 'BLOG' ? wikiGallery : wikiTopImages).map((imgObj, i) => {
                                const src = resolveImageRef(typeof imgObj === 'string' ? imgObj : imgObj.src) || '';
                                return (
                                  <div 
                                    key={i} 
                                    onClick={() => setSelectedFullImage(src)}
                                    className="aspect-video w-48 shrink-0 rounded-2xl border border-white/10 overflow-hidden bg-black/20 shadow-xl cursor-pointer hover:border-cyan-500/50 transition-all text-left"
                                  >
                                    <img src={src} className="w-full h-full object-cover" alt={`Image ${i}`} />
                                  </div>
                                );
                              })}
                            </div>
                          )}

                           <div className="flex flex-col items-start gap-4 pt-8">
                                {(() => {
                                   const wikiCreatorContrast = getAutoContrastHex(wikiBgColor || '#02040a');
                                   const isReallyLightBgWikiCreator = hexToHsla(wikiCreatorContrast).l < 40;
                                   const isWikiBgWhite = isWhite(wikiBgColor || '#02040a');
                                   const neumorphicCreator = isReallyLightBgWikiCreator ? { boxShadow: isWikiBgWhite ? '-6px -6px 15px #ffffff, 6px 6px 15px #aeaec040' : '6px 6px 15px #aeaec040' } : {};
                                   
                                   return (
                                     <div className="flex items-center self-start relative">
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-10 rounded-full z-10" style={{ backgroundColor: getAutoContrastHex(wikiBgColor || '#02040a'), opacity: 0.2 }} />
                                        <div className={`flex items-center gap-2 px-3 h-7 rounded-r-xl transition-all ml-[1px] relative z-0 ${isReallyLightBgWikiCreator ? 'bg-black/[0.02]' : 'bg-white/5 border border-white/5 backdrop-blur-md shadow-xl'}`} style={neumorphicCreator}>
                                           <div className="w-5 h-5 rounded-md border border-white/10 overflow-hidden shadow-lg shrink-0">
                                               <img src={resolveImageRef(userAvatar || profile.avatarUrl)} className="w-full h-full object-cover" alt="Creator" />
                                           </div>
                                           <div className="flex flex-col select-none leading-none pb-0.5">
                                             <span className="text-[5px] font-black uppercase tracking-widest opacity-40 shrink-0" style={{ color: getAutoContrastHex(wikiBgColor || '#02040a') }}>REGISTRADO POR</span>
                                             <span className="text-[11px] font-black tracking-widest leading-none mt-0.5 text-left" style={{ color: getAutoContrastHex(wikiBgColor || '#02040a') }}>{profile.name}</span>
                                           </div>
                                        </div>
                                     </div>
                                   );
                                })()}
                           </div>
                       </div>
                      
                      {renderCommentsSection(tempWikiMural, editorMuralInput, setEditorMuralInput, handleSendEditorMuralComment, handleDeleteEditorMuralComment, getAutoContrastHex(wikiBgColor || '#02040a'), wikiTopImages, wikiBgColor || '#02040a')}
                   </div>
                </div>
              )
            ) : (
              editorViewMode === 'editor' ? (
                <div className="max-w-3xl mx-auto space-y-4 pt-4">
                  <div className="flex justify-center mb-8">
                    <input value={editorTitle} onChange={(e) => setEditorTitle(e.target.value.slice(0, 35))} maxLength={35} placeholder="TÍTULO DA HISTÓRIA" className="w-full bg-transparent border-none text-2xl font-inter font-bold text-white outline-none placeholder:text-white/10 p-0 mb-0 uppercase leading-tight drop-shadow-2xl text-center" />
                  </div>
                  <div className="relative">
                    <textarea ref={editorTextAreaRef} value={editorContent} onChange={(e) => setEditorContent(e.target.value)} placeholder="Sua história começa aqui..." className="w-full bg-transparent border-none text-[14px] leading-relaxed text-white outline-none placeholder:text-white/5 resize-none min-h-[300px] p-0 font-inter" />
                    <button onClick={() => editorImageInputRef.current?.click()} className="absolute bottom-4 right-0 p-3 bg-cyan-600 text-white rounded-2xl shadow-2xl active:scale-90 transition-all border border-cyan-400/50">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    </button>
                    <input type="file" ref={editorImageInputRef} className="hidden" accept="image/*" onChange={(e) => handleInsertBioImage(e, false)} />
                  </div>
                </div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-700 pb-40 pt-10 relative">
                   {/* Background for Blog View Mode */}
                   <div className="fixed inset-0 z-0 pointer-events-none">
                      <SlideshowWallpaper 
                        images={wikiBgImages} 
                        color={wikiTopColor} 
                        opacity={wikiBgImages.length > 0 ? (getWallpaperOpacity(wikiBgColor) || 0.4) : 1} 
                        filter={getWallpaperFilter(wikiBgColor)} 
                        noGradient={true}
                      />
                      <div className={`absolute inset-0 z-10 transition-opacity duration-700 ${wikiBgImages.length > 0 ? 'opacity-40' : 'opacity-100'}`} style={{ background: `linear-gradient(to bottom, ${(wikiTopColor || '#1a2036') + 'B3'} 0%, transparent 35%, transparent 75%, ${wikiBgColor || '#02040a'} 100%)` }} />
                   </div>

                   <div className="space-y-2 relative z-10">
                     <h1 className="text-3xl font-black uppercase tracking-tight leading-none drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] break-words w-full" style={{ color: (getAutoContrastHex(wikiTopColor || '#1a2036') === '#ffffff' || getAutoContrastHex(wikiBgColor || '#02040a') === '#ffffff') ? '#ffffff' : '#000000' }}>
                       {editorTitle || "SEM TÍTULO"}
                     </h1>
                     <div className="h-px w-full bg-white/10" />
                   </div>
                   <div className="space-y-4 text-[14px] leading-relaxed font-medium relative z-10" style={{ color: getAutoContrastHex(wikiBgColor || '#02040a') }} dangerouslySetInnerHTML={{ __html: formatBioText(editorContent, undefined, [...wikiTopImages, ...(wikiGallery || [])], true) }} />
                   
                   <div className="relative z-10 pt-8 flex flex-col items-center gap-4">
                      {(() => {
                        const isReallyLightBgWikiCreator = isWhite(wikiBgColor || '#02040a');
                        const neumorphicCreator = isReallyLightBgWikiCreator ? { boxShadow: isReallyLightBgWikiCreator ? '-6px -6px 15px #ffffff, 6px 6px 15px #aeaec040' : '6px 6px 15px #aeaec040' } : {};
                        const authorContrast = getAutoContrastHex(wikiBgColor || '#02040a');

                        return (
                          <div className="flex items-center self-start relative">
                             <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-10 rounded-full z-10" style={{ backgroundColor: authorContrast, opacity: 0.2 }} />
                             <div className={`flex items-center gap-2 px-3 h-7 rounded-r-xl transition-all ml-[1px] relative z-0 ${isReallyLightBgWikiCreator ? 'bg-black/[0.02]' : 'bg-white/5 border border-white/5 backdrop-blur-md shadow-xl'}`} style={neumorphicCreator}>
                                <div className="w-5 h-5 rounded-md border border-white/10 overflow-hidden shadow-lg shrink-0">
                                    <img src={resolveImageRef(userAvatar || profile.avatarUrl)} className="w-full h-full object-cover" alt="Creator" />
                                </div>
                                <div className="flex flex-col select-none leading-none pb-0.5">
                                  <span className="text-[5px] font-black uppercase tracking-widest opacity-40 shrink-0" style={{ color: authorContrast }}>REGISTRADO POR</span>
                                  <span className="text-[11px] font-black tracking-widest leading-none mt-0.5 text-left" style={{ color: authorContrast }}>{profile.name}</span>
                                </div>
                             </div>
                          </div>
                        );
                      })()}
                   </div>
                   {renderCommentsSection(tempWikiMural, editorMuralInput, setEditorMuralInput, handleSendEditorMuralComment, handleDeleteEditorMuralComment, getAutoContrastHex(wikiBgColor || '#02040a'), wikiTopImages, wikiBgColor || '#02040a')}
                </div>
              )
            )}
          </main>
        </div>
      )}

      {/* FAB AND STYLES REMAIN SAME */}
      {!(isEditing && isMuralHubActive) && (
        <div className="fixed bottom-24 right-[-15px] z-[200] pointer-events-none flex items-center justify-center w-[145px] h-[145px]">
           <button onClick={() => { setIsFabOpen(!isFabOpen); setFabRotation(prev => prev + 360); setSpinCount(prev => prev + 1); if (navigator.vibrate) navigator.vibrate(20); }} className="relative z-50 w-full h-full flex items-center justify-center pointer-events-auto active:scale-95 transition-all duration-300 outline-none">
             <div style={{ transform: `scale(${iconScale})` }} className="w-full h-full transition-transform duration-500 relative flex items-center justify-center">
               {isPinkDiamond ? (
                 <div className="w-full h-full relative transition-transform duration-300 ease-out" style={{ transform: `rotate(${fabRotation}deg)` }}>
                    <img src="https://storage.googleapis.com/voidyapp-storage/Orelhas%20do%20losango%20rosa.png" className="absolute inset-0 w-full h-full object-contain animate-subtle-ears" />
                    <img src="https://storage.googleapis.com/voidyapp-storage/Losango%20rosa%20%C3%ADcone.png" className="absolute inset-0 w-full h-full object-contain" />
                    <img src="https://storage.googleapis.com/voidyapp-storage/Olhosfechandolosangorosa.png" className={`absolute inset-0 w-full h-full object-contain animate-blink-eyes`} />
                 </div>
               ) : (
                 <img src={fabIconUrl} style={{ transform: `rotate(${fabRotation}deg)`, filter: isPurpleIcon ? 'saturate(0.95) hue-rotate(-2deg) brightness(1.02)' : 'none' }} className={`w-full h-full object-contain transition-all duration-700 ease-in-out ${isMorphing ? 'animate-fab-morph' : ''}`} alt="Menu" />
               )}
             </div>
           </button>
           <div className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ${isFabOpen ? 'opacity-100' : 'opacity-0'}`}>
              <div className={`absolute transition-all duration-500 ease-out ${isFabOpen ? '-translate-x-[110px] scale-100 visible' : 'translate-x-0 scale-0 invisible'}`}>{renderGeometricButton(<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>, () => { setIsFabOpen(false); resetEditorState(); setShowEditor('BLOG'); setEditorViewMode('editor'); }, true, "BLOG")}</div>
              <div className={`absolute transition-all duration-500 ease-out delay-[50ms] ${isFabOpen ? '-translate-x-[80px] -translate-y-[80px] scale-100 visible' : 'translate-x-0 translate-y-0 scale-0 invisible'}`}>{renderGeometricButton(<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5S19.832 5.477 21 6.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>, () => { setIsFabOpen(false); resetEditorState(); setShowEditor('WIKI'); setEditorViewMode('editor'); }, true, "WIKI", 'bg-[linear-gradient(135deg,#d8b4fe_0%,#a855f7_50%,#7e22ce_100%)]')}</div>
              <div className={`absolute transition-all duration-500 ease-out delay-[100ms] ${isFabOpen ? '-translate-y-[110px] scale-100 visible' : 'translate-x-0 translate-y-0 scale-0 invisible'}`}>{renderGeometricButton(<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>, () => { setIsFabOpen(false); resetEditorState(); setShowEditor('POST'); setEditorViewMode('editor'); }, true, "POST", 'bg-[linear-gradient(135deg,#7dd3fc_0%,#0ea5e9_50%,#0369a1_100%)]')}</div>
           </div>
        </div>
      )}

      {selectedPost && (
        <div className="fixed inset-0 z-[3000] flex flex-col animate-in slide-in-from-bottom duration-500 font-inter text-white overflow-hidden" 
             style={{ 
               background: `linear-gradient(to bottom, ${selectedPost.customTopColor || '#1a2036'} 0%, ${selectedPost.customBgColor || '#02040a'} 100%)` 
             }}>
          
          <div className={`absolute inset-0 z-0 pointer-events-none overflow-hidden ${(selectedPost.tag === 'WIKI' || selectedPost.tag === 'WIKI_ENTRADA') ? 'hidden' : ''}`}>
             {(selectedPost.customBgImages && selectedPost.customBgImages.length > 0) ? (
                <SlideshowWallpaper 
                  images={selectedPost.customBgImages.map((img: any) => ({ src: resolveImageRef(typeof img === 'string' ? img : img.src), position: typeof img === 'string' ? 50 : (img.position ?? 50) }))} 
                  color={selectedPost.customTopColor || '#1a2036'} 
                  opacity={selectedPost.tag === 'BLOG' ? 0.8 : 1} 
                  filter="none" 
                  noGradient={true}
                />
             ) : selectedPost.customBgImage && (
               <div className="absolute inset-0 w-full h-full">
                    <img 
                      src={resolveImageRef(selectedPost.customBgImage)} 
                      className="absolute inset-0 w-full h-full object-cover transition-all duration-500" 
                      style={{ 
                        opacity: 1, 
                        filter: 'none', 
                        imageRendering: 'high-quality',
                        transform: 'translateZ(0) scale(1.02)'
                      }} 
                      alt="Post Bg" 
                    />
                  <div className="absolute inset-0 z-10 bg-transparent" />
               </div>
             )}
          </div>

          <div className="relative z-10 w-full h-full flex flex-col overflow-hidden">
            {(selectedPost.tag === 'WIKI' || selectedPost.tag === 'WIKI_ENTRADA') && (
              <header 
                className="relative z-[2100] p-6 flex items-center justify-between shrink-0 transition-all duration-500 bg-transparent border-transparent shadow-none"
              >
                <button onClick={() => setSelectedPost(null)} className="p-2 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all active:scale-90 border border-white/10">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
                </button>
                
                {((selectedPost.author?.toLowerCase() === userName?.toLowerCase()) || profile.isMe) && (
                  <div className="relative">
                    <button 
                      onClick={() => setIsWikiMenuOpen(!isWikiMenuOpen)}
                      className="p-2 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all active:scale-90 border border-white/10 backdrop-blur-md"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
                        <path d="M12 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
                        <path d="M12 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
                      </svg>
                    </button>
                    
                    {isWikiMenuOpen && (
                      <div className="absolute right-0 mt-2 w-48 bg-[#0a0c1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[100] animate-in fade-in zoom-in duration-200">
                        <button 
                          onClick={() => {
                            setEditorTitle(selectedPost.title || '');
                            setEditorContent(getWikiNarrative(selectedPost.content));
                            setWikiAvatar(selectedPost.avatar || null);
                            setWikiAvatarPosition(selectedPost.customAvatarPosition ?? 50);
                            setWikiTopColor(selectedPost.customTopColor || '#1a2036');
                             setWikiBgColor(selectedPost.customBgColor || '#02040a');
                             const rawBg = (selectedPost.customBgImages || (selectedPost.customBgImage ? [selectedPost.customBgImage] : [])) as (string | {src: string, position?: number})[];
                             setWikiBgImages(rawBg.map(img => typeof img === 'string' ? { src: img, position: 50 } : { src: img.src, position: img.position ?? 50 }));
                             const rawGall = (selectedPost.galleryImages || []) as (string | {src: string, position?: number})[];
                             setWikiGallery(rawGall.map(img => typeof img === 'string' ? { src: img, position: 50 } : { src: img.src, position: img.position ?? 50 }));
                             setWikiKeywords(selectedPost.customKeywords || '');
                             setWikiHideOverlay(selectedPost.hideTopOverlay || false);
                             setWikiInfoRows(selectedPost.customInfoRows || []);
                             const rawTop = (selectedPost.customTopImages || []) as (string | {id?: string, src: string, position?: number})[];
                             setWikiTopImages(rawTop.map(img => {
                               const src = typeof img === 'string' ? img : img.src;
                               const existingId = (typeof img === 'object' && img.id) ? img.id : null;
                               return { 
                                 id: existingId || `img_${Math.random().toString(36).substring(2, 7)}`, 
                                 src: src
                               };
                             }));
                             setTempWikiMural(selectedPost.mural || []);
                            
                            setShowEditor('WIKI');
                            setEditingWikiId(selectedPost.id);
                            setSelectedPost(null);
                            setIsWikiMenuOpen(false);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-cyan-400 hover:bg-white/5 transition-all border-b border-white/5"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          Editar Wiki
                        </button>
                        <button 
                          onClick={() => {
                            handleDelete(selectedPost);
                            setSelectedPost(null);
                            setIsWikiMenuOpen(false);
                          }}
                          className="w-full px-4 py-3 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-400 hover:bg-white/5 transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {selectedPost.author !== userName && <div className="w-10"></div>}
              </header>
            )}

            <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col">
                {(selectedPost.tag === 'WIKI' || selectedPost.tag === 'WIKI_ENTRADA') ? (
                  <div className="relative z-10 w-full animate-in fade-in duration-700 pb-40">
                     <div className="fixed inset-0 z-0 pointer-events-none">
                          {selectedPost.customBgImages && selectedPost.customBgImages.length > 0 && (
                            <SlideshowWallpaper 
                              images={selectedPost.customBgImages}
                              color="transparent"
                              opacity={0.4}
                              filter="none"
                              noGradient={true}
                            />
                          )}
                       <div className={`absolute inset-0 z-10 ${selectedPost.customBgImages && selectedPost.customBgImages.length > 0 ? 'opacity-40' : 'opacity-100'}`} style={{ background: `linear-gradient(to bottom, ${(selectedPost.customTopColor || '#1a2036') + 'B3'} 0%, transparent 35%, transparent 75%, ${selectedPost.customBgColor || '#02040a'} 100%)` }} />
                     </div>
                 {/* Banner / Header Section */}
                  <div className="relative w-full h-56 md:h-80 overflow-hidden">
                     <SlideshowWallpaper 
                       images={selectedPost.galleryImages && selectedPost.galleryImages.length > 0 ? selectedPost.galleryImages : []} 
                       color={selectedPost.customTopColor || '#1a2036'} 
                       opacity={0.95} 
                       filter="none" 
                       noGradient={selectedPost.hideTopOverlay}
                     />
                     {!selectedPost.hideTopOverlay && <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-black/20" />}
                  </div>

                 <div className="max-w-3xl mx-auto px-6 -mt-12 relative z-20 space-y-4">
                    {/* Header: Avatar and Title left aligned */}
                    <div className="flex items-end gap-6">
                       {selectedPost.avatar && (
                         <div className="w-28 h-28 rounded-3xl border-4 overflow-hidden shadow-2xl shrink-0 bg-[#1a2036]" style={{ borderColor: (selectedPost.customBgColor === 'transparent' || !selectedPost.customBgColor) ? '#02040a' : selectedPost.customBgColor }}>
                           <img src={resolveImageRef(selectedPost.avatar)} className="w-full h-full object-cover" alt="Wiki Avatar" />
                         </div>
                       )}
                       <div className="flex flex-col pb-2 min-w-0">
                          {(() => {
                             const titleColor = getAutoContrastHex(selectedPost.customTopColor || '#1a2036');
                             const isTitleDark = hexToHsla(titleColor).l < 30;
                             return (
                               <h1 
                                 className={`text-xl font-black uppercase tracking-tight break-words w-full ${isTitleDark ? '' : 'drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]'}`} 
                                 style={{ color: titleColor }}
                               >
                                 {selectedPost.title || "SEM TÍTULO"}
                               </h1>
                             );
                          })()}
                       </div>
                    </div>

                    {/* Tags centered below title section */}
                    {selectedPost.customKeywords && (
                      <div className="flex justify-start pl-1 -mt-2">
                         <div className="opacity-60 text-[8px] font-black uppercase tracking-[0.3em] text-left bg-white/5 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                            {selectedPost.customKeywords.split(',').map(tag => `#${tag.trim()}`).join(' ')}
                         </div>
                      </div>
                    )}

                    {/* Creator info and Narrative content */}
                     <div className="space-y-4 pt-6 border-t border-white/5">
                        {/* Technical Data Matrix */}
                        {selectedPost.customInfoRows && selectedPost.customInfoRows.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                             {selectedPost.customInfoRows.map((row, i) => {
                               if (!row.label || !row.value) return null;
                               const isRatingType = row.type === 'rating_star' || row.type === 'rating_heart' || (!isNaN(Number(row.value)) && row.value.trim() !== '');
                               const labelColorMode = getAutoContrastHex(selectedPost.customBgColor || '#02040a');
                               const isLightBgMode = hexToHsla(labelColorMode).l < 40;
                               
                               if (isRatingType) {
                                 return (
                                   <div key={i} className="bg-white/[0.03] px-5 py-3 rounded-xl flex items-center justify-between gap-4 border border-white/10 backdrop-blur-sm group hover:bg-white/5 transition-colors">
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                         <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${isLightBgMode ? 'bg-black/5 shadow-sm' : 'bg-white/5'}`} style={{ color: labelColorMode }}>{row.label}</span>
                                         <span className="text-[10px] font-black opacity-20 uppercase" style={{ color: labelColorMode }}>=</span>
                                      </div>
                                      <div className="flex-1 flex justify-end items-center min-w-0">
                                         {row.type === 'rating_star' || row.type === 'rating_heart' ? (
                                             <div className="flex gap-1">
                                                 {[1, 2, 3, 4, 5].map(v => (
                                                     <span key={v} className={`${Number(row.value) >= v ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'text-white/5'}`}>
                                                         {row.type === 'rating_star' ? <StarIcon active={Number(row.value) >= v} className="w-3.5 h-3.5" /> : <HeartIcon active={Number(row.value) >= v} className="w-3.5 h-3.5" />}
                                                     </span>
                                                 ))}
                                             </div>
                                         ) : (
                                             <span className="text-[11px] font-bold tracking-tight break-words text-left" style={{ color: getAutoContrastHex(selectedPost.customBgColor || '#02040a') }}>{row.value}</span>
                                         )}
                                      </div>
                                   </div>
                                 );
                               }

                               return (
                                 <div key={i} className="flex items-center justify-between gap-4 py-1.5 px-1 group transition-colors">
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                       <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full w-fit bg-white/5 shadow-sm`} style={{ color: labelColorMode, opacity: 0.8 }}>{row.label}</span>
                                       <span className="text-[10px] font-black opacity-20 uppercase" style={{ color: labelColorMode }}>=</span>
                                    </div>
                                    <div className="flex-1 flex justify-end items-center min-w-0 text-left">
                                       <span className="text-[11px] font-bold tracking-tight break-words" style={{ color: getAutoContrastHex(selectedPost.customBgColor || '#02040a') }}>{row.value}</span>
                                    </div>
                                 </div>
                               );
                             })}
                          </div>
                         )}

                       <div className="text-[14px] leading-relaxed px-1 font-inter" style={{ color: getAutoContrastHex(selectedPost.customBgColor || '#02040a') }} dangerouslySetInnerHTML={{ __html: formatBioText(getWikiNarrative(selectedPost.content), undefined, [...(selectedPost.customTopImages || []), ...(selectedPost.galleryImages || [])], true) }} />

                       {((selectedPost.tag === 'BLOG' ? (selectedPost.galleryImages || []) : (selectedPost.customTopImages || [])).length > 0) && (() => {
                         const postSavedImagesContrast = getAutoContrastHex(selectedPost.customBgColor || '#02040a');
                         const isLightBgPostSaved = hexToHsla(postSavedImagesContrast).l < 40;
                         const isPostBgWhite = isWhite(selectedPost.customBgColor || '#02040a');
                         return (
                           <div className="text-left mt-8">
                             <h3 className={`text-[10px] font-black uppercase tracking-widest mb-4 px-4 py-1.5 rounded-full inline-block transition-all ${isLightBgPostSaved ? 'bg-black/[0.03]' : 'bg-white/5 border border-white/10'}`} style={{ color: postSavedImagesContrast, ...(isLightBgPostSaved ? { boxShadow: isPostBgWhite ? '-4px -4px 10px #ffffff, 4px 4px 10px #aeaec040' : '4px 4px 10px #aeaec040' } : {}) }}>Imagens Salvas</h3>
                             <div className={`h-px w-full ${isLightBgPostSaved ? 'bg-black/5' : 'bg-white/10'} mb-6`} />
                           </div>
                         );
                       })()}

              {/* Wiki/Blog Tag Images as Medium Cards */}
              {((selectedPost.tag === 'BLOG' ? (selectedPost.galleryImages || []) : (selectedPost.customTopImages || [])).length > 0) && (
                <div className="flex gap-4 overflow-x-auto no-scrollbar w-full pb-2">
                  {(selectedPost.tag === 'BLOG' ? (selectedPost.galleryImages || []) : (selectedPost.customTopImages || [])).map((img, i) => {
                    const postSavedImagesContrast = getAutoContrastHex(selectedPost.customBgColor || '#02040a');
                    const isReallyLightBgPost = hexToHsla(postSavedImagesContrast).l < 40;
                    return (
                      <div key={i} 
                           onClick={() => setSelectedFullImage(resolveImageRef(typeof img === 'string' ? img : (img as any).src) || '')}
                           className={`aspect-video w-48 shrink-0 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] cursor-pointer ${isReallyLightBgPost ? 'bg-white shadow-[-8px_-8px_20px_#ffffff,8px_8px_20px_#aeaec040]' : 'bg-black/20 border border-white/10 shadow-xl'}`}
                           style={isReallyLightBgPost ? { boxShadow: isWhite(selectedPost.customBgColor || '#02040a') ? '-8px -8px 20px #ffffff, 8px 8px 20px #aeaec040' : '8px 8px 20px #aeaec040' } : {}}>
                        <img src={resolveImageRef(typeof img === 'string' ? img : (img as any).src) || ''} className="w-full h-full object-cover" alt={`Gallery ${i}`} />
                      </div>
                    );
                  })}
                </div>
              )}

                       <div className="flex flex-col items-start gap-4 pt-8">
                          {(() => {
                             const postCreatorContrast = getAutoContrastHex(selectedPost.customBgColor || '#02040a');
                             const isReallyLightBgPostCreator = hexToHsla(postCreatorContrast).l < 40;
                             const isPostCreatorBgWhite = isWhite(selectedPost.customBgColor || '#02040a');
                             const neumorphicCreator = isReallyLightBgPostCreator ? { boxShadow: isPostCreatorBgWhite ? '-6px -6px 15px #ffffff, 6px 6px 15px #aeaec040' : '6px 6px 15px #aeaec040' } : {};
                             
                             return (
                               <div className="flex items-center self-start relative">
                                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-10 rounded-full z-10" style={{ backgroundColor: postCreatorContrast, opacity: 0.2 }} />
                                  <div className={`flex items-center gap-2 px-3 h-7 rounded-r-xl transition-all ml-[1px] relative z-0 ${isReallyLightBgPostCreator ? 'bg-black/[0.02]' : 'bg-white/5 border border-white/5 backdrop-blur-md shadow-xl'}`} style={neumorphicCreator}>
                                     <div className="w-5 h-5 rounded-md border border-white/10 overflow-hidden shadow-lg shrink-0">
                                        <img src={resolveImageRef(selectedPost.author === profile.name ? profile.avatarUrl : selectedPost.avatar)} className="w-full h-full object-cover" alt="Creator" />
                                     </div>
                                     <div className="flex flex-col select-none leading-none pb-0.5">
                                       <span className="text-[5px] font-black uppercase tracking-widest opacity-40 shrink-0" style={{ color: postCreatorContrast }}>REGISTRADO POR</span>
                                       <span className="text-[11px] font-black tracking-widest leading-none mt-0.5 text-left" style={{ color: postCreatorContrast }}>{selectedPost.author}</span>
                                     </div>
                                  </div>
                               </div>
                             );
                          })()}
                       </div>

                     </div>
                    
                    {renderCommentsSection(selectedPost.mural || [], wikiMuralInput, setWikiMuralInput, () => handleSendPostMuralComment(selectedPost.id), (cid) => handleDeletePostMuralComment(selectedPost.id, cid), getAutoContrastHex(selectedPost.customBgColor || '#02040a'), selectedPost.customTopImages, selectedPost.customBgColor || '#02040a')}
                 </div>
              </div>
            ) : (
              <div className="relative">
                {selectedPost.tag === 'BLOG' ? (
                   <div className="fixed inset-0 z-0 pointer-events-none">
                      {selectedPost.customBgImages && selectedPost.customBgImages.length > 0 ? (
                        <SlideshowWallpaper 
                          images={selectedPost.customBgImages.map((img: any) => ({ src: resolveImageRef(typeof img === 'string' ? img : img.src), position: typeof img === 'string' ? 50 : (img.position ?? 50) }))} 
                          color={selectedPost.customTopColor || '#1a2036'} 
                          opacity={selectedPost.customBgImages.length > 0 ? (getWallpaperOpacity(selectedPost.customBgColor) || 0.4) : 1} 
                          filter={getWallpaperFilter(selectedPost.customBgColor)} 
                          noGradient={true}
                        />
                      ) : selectedPost.customBgImage && (
                        <div className="absolute inset-0 w-full h-full">
                           <img 
                              src={resolveImageRef(selectedPost.customBgImage)} 
                              className="absolute inset-0 w-full h-full object-cover transition-all duration-500 opacity-40" 
                              style={{ imageRendering: 'high-quality', transform: 'translateZ(0) scale(1.02)' }} 
                              alt="Blog Bg" 
                           />
                        </div>
                      )}
                      <div className={`absolute inset-0 z-10 transition-opacity duration-700 ${((selectedPost.customBgImages && selectedPost.customBgImages.length > 0) || selectedPost.customBgImage) ? 'opacity-40' : 'opacity-100'}`} style={{ background: `linear-gradient(to bottom, ${(selectedPost.customTopColor || '#1a2036') + 'B3'} 0%, transparent 35%, transparent 75%, ${selectedPost.customBgColor || '#02040a'} 100%)` }} />
                   </div>
                ) : (
                  <div className="sticky top-0 h-[460px] z-[5] overflow-hidden pointer-events-none" style={{ WebkitMaskImage: 'linear-gradient(to bottom, black 65%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 65%, transparent 100%)' }}>
                     {selectedPost.customTopImage && ( <img src={resolveImageRef(selectedPost.customTopImage)} className="w-full h-full object-cover 4k-texture transition-all duration-500" style={{ opacity: getWallpaperOpacity(selectedPost.customTopColor || '#1a2036'), filter: getWallpaperFilter(selectedPost.customTopColor || '#1a2036') }} /> )}
                     <div className="absolute inset-0 z-10" style={{ background: selectedPost.hideTopOverlay ? 'transparent' : `linear-gradient(to bottom, ${(selectedPost.customTopColor || '#1a2036') + 'B3'} 0%, transparent 35%, transparent 75%, ${selectedPost.customBgColor || '#02040a'} 100%)` }}></div>
                  </div>
                )}

                <div className={`relative z-10 ${selectedPost.tag === 'BLOG' ? 'pt-4' : '-mt-[460px]'} flex flex-col min-h-screen`}>
                  <header className={`relative z-[2100] px-6 pb-2 pt-6 flex items-center justify-between shrink-0 pointer-events-auto transition-all duration-500 bg-transparent border-transparent shadow-none`}>
                     <button onClick={() => setSelectedPost(null)} className="p-2 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all active:scale-90 border border-white/10 backdrop-blur-md shadow-xl"><svg className="w-5 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg></button>
                     <div className="flex flex-col items-center"><span className="text-[10px] font-bold text-white uppercase tracking-[0.1em] drop-shadow-md">{selectedPost.author}</span></div>
                     
                     {((selectedPost.author?.toLowerCase() === userName?.toLowerCase()) || profile.isMe) && (
                        <div className="relative">
                          <button 
                            onClick={() => setIsBlogMenuOpen(!isBlogMenuOpen)}
                            className="p-2 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all active:scale-90 border border-white/10 backdrop-blur-md shadow-xl"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                              <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
                              <path d="M12 19m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
                              <path d="M12 5m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
                            </svg>
                          </button>
                          
                          {isBlogMenuOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-[#0a0c1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-[100] animate-in fade-in zoom-in duration-200">
                              <button 
                                onClick={() => {
                                  setEditorTitle(selectedPost.title || '');
                                  setEditorContent(getWikiNarrative(selectedPost.content));
                                  setWikiAvatar(selectedPost.avatar || null);
                                  setWikiAvatarPosition(selectedPost.customAvatarPosition ?? 50);
                                  setWikiTopColor(selectedPost.customTopColor || '#1a2036');
                                  setWikiBgColor(selectedPost.customBgColor || '#02040a');
                                  const rawBg = (selectedPost.customBgImages || (selectedPost.customBgImage ? [selectedPost.customBgImage] : [])) as (string | {src: string, position?: number})[];
                                  setWikiBgImages(rawBg.map(img => typeof img === 'string' ? { src: img, position: 50 } : { src: img.src, position: img.position ?? 50 }));
                                  const rawGall = (selectedPost.galleryImages || []) as (string | {src: string, position?: number})[];
                                  setWikiGallery(rawGall.map(img => typeof img === 'string' ? { src: img, position: 50 } : { src: img.src, position: img.position ?? 50 }));
                                  setWikiKeywords(selectedPost.customKeywords || '');
                                  setWikiHideOverlay(selectedPost.hideTopOverlay || false);
                                  setWikiInfoRows(selectedPost.customInfoRows || []);
                                  const rawTop = (selectedPost.customTopImages || []) as (string | {id?: string, src: string, position?: number})[];
                                  setWikiTopImages(rawTop.map(img => {
                                    const src = typeof img === 'string' ? img : img.src;
                                    const existingId = (typeof img === 'object' && img.id) ? img.id : null;
                                    return { 
                                      id: existingId || `img_${Math.random().toString(36).substring(2, 7)}`, 
                                      src: src
                                    };
                                  }));
                                  
                                  setShowEditor('BLOG');
                                  setEditingWikiId(selectedPost.id);
                                  setSelectedPost(null);
                                  setIsBlogMenuOpen(false);
                                }}
                                className="w-full px-4 py-3 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-cyan-400 hover:bg-white/5 transition-all border-b border-white/5"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                Editar Blog
                              </button>
                              <button 
                                onClick={() => {
                                  handleDelete(selectedPost);
                                  setSelectedPost(null);
                                  setIsBlogMenuOpen(false);
                                }}
                                className="w-full px-4 py-3 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-400 hover:bg-white/5 transition-all"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                Excluir
                              </button>
                            </div>
                          )}
                        </div>
                     )}

                     {selectedPost.author !== userName && <div className="w-10"></div>}
                  </header>

                  <main className={`flex-1 ${selectedPost.tag === 'BLOG' ? 'pt-0' : 'pt-10'} space-y-6 pb-48 pointer-events-auto ${selectedPost.wideMode ? 'px-4' : 'px-8'}`}>
                     <div className={`${selectedPost.wideMode ? 'w-full' : 'max-w-3xl mx-auto px-6'} ${selectedPost.tag !== 'BLOG' ? '-mt-12' : 'pt-6'} relative z-20 space-y-4`}>
                        <div className="flex items-end gap-6">
                           {selectedPost.avatar && (
                             <div className="w-28 h-28 rounded-3xl border-4 overflow-hidden shadow-2xl shrink-0 bg-[#1a2036]" style={{ borderColor: selectedPost.customBgColor === 'transparent' ? '#02040a' : selectedPost.customBgColor || '#02040a' }}>
                               <img src={resolveImageRef(selectedPost.avatar)} className="w-full h-full object-cover" style={{ objectPosition: `center ${selectedPost.customAvatarPosition ?? 50}%` }} alt="Avatar" />
                             </div>
                           )}
                           <div className="flex flex-col pb-2 min-w-0 flex-1">
                              {(() => {
                                 const titleColor = getAutoContrastHex(selectedPost.customTopColor || '#1a2036');
                                 const isTitleDark = hexToHsla(titleColor).l < 30;
                                 return (
                                   <h1 
                                     className={`text-xl font-black uppercase tracking-tight break-words w-full ${isTitleDark ? '' : 'drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]'}`} 
                                     style={{ color: titleColor }}
                                   >
                                     {selectedPost.title}
                                   </h1>
                                 );
                              })()}
                           </div>
                        </div>

                        {selectedPost.customKeywords && (
                          <div className="flex justify-start pl-1 -mt-2">
                             <div className="opacity-60 text-[8px] font-black uppercase tracking-[0.3em] text-left bg-white/5 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                                {selectedPost.customKeywords.split(',').map((tag: string) => `#${tag.trim()}`).join(' ')}
                             </div>
                          </div>
                        )}

                        <div className={`space-y-4 ${selectedPost.tag !== 'BLOG' ? 'pt-6 border-t border-white/5' : ''}`}>
                           {/* Technical Data Matrix (only for WIKI) */}
                           {selectedPost.tag === 'WIKI' && selectedPost.customInfoRows && (
                             <div className="flex flex-col gap-1.5">
                                {selectedPost.customInfoRows.map((row: any, i: number) => {
                                  if (!row.label || !row.value) return null;
                                  const isRatingType = row.type === 'rating_star' || row.type === 'rating_heart' || (!isNaN(Number(row.value)) && row.value.trim() !== '');
                                  
                                  if (isRatingType) {
                                    return (
                                      <div key={i} className="bg-white/[0.03] px-5 py-3 rounded-xl flex items-center justify-between gap-4 border border-white/10 backdrop-blur-sm group hover:bg-white/5 transition-colors">
                                         <div className="flex items-center gap-2 flex-shrink-0">
                                            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full w-fit bg-white/5 shadow-sm" style={{ color: getAutoContrastHex(selectedPost.customBgColor || '#02040a'), opacity: 0.8 }}>{row.label}</span>
                                            <span className="text-[10px] font-black opacity-20 uppercase" style={{ color: getAutoContrastHex(selectedPost.customBgColor || '#02040a') }}>=</span>
                                         </div>
                                         <div className="flex-1 flex justify-end items-center min-w-0">
                                            {row.type === 'rating_star' || row.type === 'rating_heart' ? (
                                                <div className="flex gap-1">
                                                    {[1, 2, 3, 4, 5].map(v => (
                                                        <span key={v} className={`${Number(row.value) >= v ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'text-white/5'}`}>
                                                            {row.type === 'rating_star' ? <StarIcon active={Number(row.value) >= v} className="w-3.5 h-3.5" /> : <HeartIcon active={Number(row.value) >= v} className="w-3.5 h-3.5" />}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-[11px] font-bold tracking-tight break-words text-left" style={{ color: getAutoContrastHex(selectedPost.customBgColor || '#02040a') }}>{row.value}</span>
                                            )}
                                         </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div key={i} className="flex items-center justify-between gap-4 py-1 px-1 group transition-colors">
                                       <div className="flex items-center gap-2 flex-shrink-0">
                                          <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full w-fit bg-white/5 shadow-sm" style={{ color: getAutoContrastHex(selectedPost.customBgColor || '#02040a'), opacity: 0.8 }}>{row.label}</span>
                                          <span className="text-[10px] font-black opacity-20 uppercase" style={{ color: getAutoContrastHex(selectedPost.customBgColor || '#02040a') }}>=</span>
                                       </div>
                                       <div className="flex-1 flex justify-end items-center min-w-0 text-left">
                                          <span className="text-[11px] font-bold tracking-tight break-words" style={{ color: getAutoContrastHex(selectedPost.customBgColor || '#02040a') }}>{row.value}</span>
                                       </div>
                                    </div>
                                  );
                                })}
                             </div>
                           )}

                           <div className="text-[14px] leading-relaxed px-1 font-inter relative z-10" style={{ color: getAutoContrastHex(selectedPost.customBgColor || '#02040a') }} dangerouslySetInnerHTML={{ __html: formatBioText(getWikiNarrative(selectedPost.content), undefined, [...(selectedPost.customTopImages || []), ...(selectedPost.galleryImages || [])], true) }} />

                           {((selectedPost.tag === 'BLOG' ? (selectedPost.galleryImages || []) : (selectedPost.customTopImages || [])).length > 0) && (() => {
                              const wikiSavedImagesContrast = getAutoContrastHex(selectedPost.customBgColor || '#02040a');
                              const isLightBgWikiSaved = hexToHsla(wikiSavedImagesContrast).l < 40;
                              return (
                                <div className="text-left mt-8">
                                  <h3 className={`text-[10px] font-black uppercase tracking-widest mb-2 px-4 py-1.5 rounded-full inline-block ${isLightBgWikiSaved ? 'bg-black/5 shadow-sm border border-black/5' : 'bg-white/5 border border-white/10'}`} style={{ color: wikiSavedImagesContrast, opacity: 0.8 }}>Imagens Salvas</h3>
                                  <div className={`border-t ${isLightBgWikiSaved ? 'border-black/5' : 'border-white/10'} mb-4`} />
                                </div>
                              );
                           })()}

                           {((selectedPost.tag === 'BLOG' ? (selectedPost.galleryImages || []) : (selectedPost.customTopImages || [])).length > 0) && (
                             <div className="flex gap-4 overflow-x-auto no-scrollbar w-full pb-2">
                               {(selectedPost.tag === 'BLOG' ? (selectedPost.galleryImages || []) : (selectedPost.customTopImages || [])).map((img: any, i: number) => {
                                 const src = resolveImageRef(typeof img === 'string' ? img : img.src) || '';
                                 return (
                                   <div 
                                     key={i} 
                                     onClick={() => setSelectedFullImage(src)}
                                     className="aspect-video w-48 shrink-0 rounded-2xl border border-white/10 overflow-hidden bg-black/20 shadow-xl cursor-pointer hover:border-cyan-500/50 transition-all text-left"
                                   >
                                     <img src={src} className="w-full h-full object-cover" alt={`Image ${i}`} />
                                   </div>
                                 );
                               })}
                             </div>
                           )}

                           <div className="relative z-10 pt-8 flex flex-col items-center gap-4">
                              {(() => {
                                 const authorContrast = getAutoContrastHex(selectedPost.customBgColor || '#02040a');
                                 const isReallyLightBgPostCreator = isWhite(selectedPost.customBgColor || '#02040a');
                                 const neumorphicCreator = isReallyLightBgPostCreator ? { boxShadow: isReallyLightBgPostCreator ? '-6px -6px 15px #ffffff, 6px 6px 15px #aeaec040' : '6px 6px 15px #aeaec040' } : {};

                                 return (
                                   <div className="flex items-center self-start relative">
                                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-10 rounded-full z-10" style={{ backgroundColor: authorContrast, opacity: 0.2 }} />
                                      <div className={`flex items-center gap-2 px-3 h-7 rounded-r-xl transition-all ml-[1px] relative z-0 ${isReallyLightBgPostCreator ? 'bg-black/[0.02]' : 'bg-white/5 border border-white/5 backdrop-blur-md shadow-xl'}`} style={neumorphicCreator}>
                                         <div className="w-5 h-5 rounded-md border border-white/10 overflow-hidden shadow-lg shrink-0">
                                             <img src={resolveImageRef(selectedPost.author === profile.name ? profile.avatarUrl : (selectedPost.avatar || profile.avatarUrl))} className="w-full h-full object-cover" alt="Author" />
                                         </div>
                                         <div className="flex flex-col select-none leading-none pb-0.5">
                                            <span className="text-[5px] font-black uppercase tracking-widest opacity-40 shrink-0" style={{ color: authorContrast }}>REGISTRADO POR</span>
                                            <span className="text-[11px] font-black tracking-widest leading-none mt-0.5 text-left" style={{ color: authorContrast }}>{selectedPost.author}</span>
                                         </div>
                                      </div>
                                   </div>
                                 );
                              })()}
                           </div>
                           {renderCommentsSection(selectedPost.mural || [], wikiMuralInput, setWikiMuralInput, () => handleSendPostMuralComment(selectedPost.id), (cid) => handleDeletePostMuralComment(selectedPost.id, cid), getAutoContrastHex(selectedPost.customBgColor || '#02040a'), selectedPost.customTopImages, selectedPost.customBgColor || '#02040a')}
                        </div>
                     </div>
                  </main>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
      {fullViewImage && (
        <div className="fixed inset-0 z-[3000] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
          <div className="absolute top-6 right-6 flex items-center gap-4">
            <button 
              onClick={() => {
                const src = resolveImageRef(fullViewImage.src) || '';
                const link = document.createElement('a');
                link.href = src;
                link.download = `wiki_image_${Date.now()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                addNotification({ title: 'Download Iniciado', message: 'A imagem está sendo salva...', type: 'SYSTEM' });
              }}
              className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all backdrop-blur-md border border-white/10 active:scale-90"
              title="Baixar Imagem"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </button>
            <button 
              onClick={() => {
                const src = resolveImageRef(fullViewImage.src) || '';
                if (navigator.share) {
                  navigator.share({ url: src }).catch(() => {
                    navigator.clipboard.writeText(src);
                    addNotification({ title: 'Link Copiado', message: 'O link da imagem foi copiado!', type: 'SYSTEM' });
                  });
                } else {
                  navigator.clipboard.writeText(src);
                  addNotification({ title: 'Link Copiado', message: 'O link da imagem foi copiado!', type: 'SYSTEM' });
                }
              }}
              className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all backdrop-blur-md border border-white/10 active:scale-90"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
            </button>
            <button 
              onClick={() => setFullViewImage(null)}
              className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all backdrop-blur-md border border-white/10 active:scale-90"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          
          <div className="w-full max-w-4xl max-h-[80vh] flex items-center justify-center p-4">
             <img src={resolveImageRef(fullViewImage.src) || ''} className="max-w-full max-h-full object-contain rounded-xl shadow-2xl drop-shadow-[0_0_50px_rgba(34,211,238,0.2)]" />
          </div>

          <div className="fixed bottom-10 flex items-center gap-4 animate-in slide-in-from-bottom duration-500 delay-200">
             {fullViewImage.type === 'SAVED' && (
               <>
                 <button 
                    onClick={() => {
                      const fullId = fullViewImage.id;
                      setEditorContent(prev => {
                        const textarea = editorTextAreaRef.current;
                        const start = textarea?.selectionStart ?? prev.length;
                        const end = textarea?.selectionEnd ?? start;
                        const before = prev.substring(0, start);
                        const after = prev.substring(end);
                        return `${before}[${fullId} h=150 p=50 w=100 a=c] ""${after}`;
                      });
                      setFullViewImage(null);
                    }}
                    className="px-6 py-4 bg-cyan-500 rounded-2xl text-black font-black uppercase tracking-widest text-[10px] shadow-xl shadow-cyan-500/20 active:scale-95 transition-all hover:bg-cyan-400 flex items-center justify-center"
                    title="Inserir na Narrativa"
                 >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                 </button>
                 {!wikiGallery.some(g => g.src === fullViewImage.src) && (
                   <button 
                      onClick={() => {
                        setWikiGallery(prev => [...prev, { src: fullViewImage.src, position: 50 }]);
                        addNotification({ title: 'Galeria', message: 'Imagem salva no acervo!', type: 'SYSTEM' });
                        setFullViewImage(null);
                      }}
                      className="px-6 py-4 bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl text-white font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all hover:bg-white/20 flex items-center justify-center"
                   >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                   </button>
                 )}
               </>
             )}
             {fullViewImage.type === 'GALLERY' && null}
          </div>
        </div>
      )}

      {selectedFullImage && (
        <div className="fixed inset-0 z-[4000] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
          <header className="p-6 flex items-center justify-between border-b border-white/10 bg-black/40">
            <button onClick={() => setSelectedFullImage(null)} className="p-2.5 bg-white/5 rounded-2xl text-slate-400 hover:text-white border border-white/5 transition-all active:scale-90">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => handleDownload(selectedFullImage)}
                className="px-6 py-2.5 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white border border-white/10 transition-all active:scale-95 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                Guardar
              </button>
              <button 
                onClick={() => handleShareImageOverlay(selectedFullImage)}
                className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 rounded-2xl text-[10px] font-black uppercase tracking-widest text-black transition-all active:scale-95 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
                Compartilhar
              </button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
            <img 
              src={selectedFullImage} 
              className="max-w-full max-h-full object-contain rounded-xl shadow-[0_0_100px_rgba(0,0,0,0.5)] animate-in zoom-in duration-500" 
              alt="Full view"
            />
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        input[type="range"] { accent-color: #22d3ee; }
        @keyframes mural-slide-up { 0% { transform: translateY(100%); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
        .animate-mural-slide-up { animation: mural-slide-up 0.6s cubic-bezier(0.19, 1, 0.22, 1) forwards; }
        .hd-4k-rendering { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
        .4k-texture { image-rendering: high-quality; transform: translateZ(0); }
        .not-italic-fix { font-style: italic !important; }
        @keyframes fabMorph { 0% { transform: scale(1) translateZ(0); filter: brightness(1) contrast(1); opacity: 1; } 45% { transform: scale(0.85) translateZ(0); filter: brightness(1.4) contrast(1.1); opacity: 0.6; } 100% { transform: scale(1) translateZ(0); filter: brightness(1) contrast(1); opacity: 1; } }
        .animate-fab-morph { animation: fabMorph 0.65s cubic-bezier(0.4, 0, 0.2, 1) forwards; will-change: transform, filter, opacity; }
        @keyframes subtle-ears { 0%, 80%, 100% { transform: rotate(0deg); } 82%, 86%, 90%, 94%, 98% { transform: rotate(-3deg); } 84%, 88%, 92%, 96% { transform: rotate(3deg); } }
        .animate-subtle-ears { animation: subtle-ears 5s ease-in-out infinite; transform-origin: center center; will-change: transform; }
        @keyframes blink-eyes { 0%, 88%, 100% { opacity: 0; } 92%, 96% { opacity: 1; } }
        .animate-blink-eyes { animation: blink-eyes 1.2s infinite; }
        @keyframes dizzy-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-dizzy-rotate { animation: dizzy-rotate 1.5s linear infinite; }
      `}} />
    </div>
  );
};

export default ProfileView;
