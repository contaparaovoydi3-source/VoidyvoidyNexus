import React, { useState, useRef, useEffect } from 'react';
import { FeedPost } from '../types';
import { GoogleGenAI } from "@google/genai";
import { MODEL_IMAGE } from "../constants";
import { safeStore } from "../data";

interface WikiInfoRow {
  label: string;
  value: string;
  type?: 'text' | 'rating_star' | 'rating_heart';
}

const StarIcon = ({ active, className }: { active: boolean, className?: string }) => (
  <svg className={`${className} ${active ? 'text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]' : 'text-white/10'}`} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
  </svg>
);

const HeartIcon = ({ active, className }: { active: boolean, className?: string }) => (
  <svg className={`${className} ${active ? 'text-pink-500 drop-shadow-[0_0_5px_rgba(236,72,153,0.5)]' : 'text-white/10'}`} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
  </svg>
);

interface WikiCreationProps {
  onBack: () => void;
  onCreate: (post: FeedPost) => void;
  userName: string;
  userAvatar: string;
  verifySafety?: (content: string, type?: 'image' | 'text') => Promise<boolean>;
  isCharacterSheet?: boolean;
  initialData?: FeedPost;
}

const saveToMediaStorage = (base64: string): string => {
  const id = `vimg_draft_${Math.random().toString(36).substring(2, 9)}`;
  safeStore(id, base64);
  return `ref:${id}`;
};

const resolveMedia = (ref: string | undefined | null): string | null => {
  if (!ref) return null;
  if (typeof ref !== 'string') return null;
  
  const tryGet = (id: string) => {
    try {
      return localStorage.getItem(id) || 
             localStorage.getItem(id.toLowerCase()) || 
             localStorage.getItem(id.toUpperCase());
    } catch (e) { return null; }
  };

  if (ref.startsWith('ref:')) {
    const key = ref.replace('ref:', '');
    return tryGet(key) || tryGet('vimg_' + key) || tryGet('img_' + key) || null;
  }
  
  if (ref.toLowerCase().includes('vimg_')) {
    const match = ref.match(/vimg_[a-zA-Z0-9_-]+/i);
    if (match) {
      const vimgId = match[0];
      const baseId = vimgId.replace(/vimg_/i, '');
      return tryGet(vimgId) || tryGet(baseId) || tryGet('img_' + baseId) || null;
    }
  }

  if (ref.toLowerCase().startsWith('vimg_') || ref.toLowerCase().startsWith('img_')) {
    return tryGet(ref) || tryGet(ref.replace(/^(vimg_|img_)/i, '')) || null;
  }

  return ref;
};

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

const getAutoContrastHex = (hex: string) => {
  if (!hex || hex === 'transparent' || hex === '#00000000') return '#ffffff';
  const hsla = hexToHsla(hex);
  const isDarkBg = hsla.l < 55;
  const targetL = isDarkBg ? 92 : 12;
  const targetH = (hsla.h + 180) % 360;
  const targetS = hsla.s > 20 ? 40 : 10;
  return hslaToHex(targetH, targetS, targetL, 1);
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

const formatBioText = (text: string | null | undefined, customTextColor?: string, contextImages: any[] = [], isViewMode = false) => {
  if (!text) return "";
  let p = text;
  
  // Robust image regex: [ID attributes] "Overlay" OR loose vimg_ references
  const mainVimgRegex = /(\[?\s*vimg_[a-zA-Z0-9_-]+(?:\s+[^\]]*)?\]?(?:\s*"")?)/gi;
  const standardImgRegex = /\[\s*([^\]\s=]+)(?:\s*=\s*([^\]\s]*))?\s*([^\]]*)\](?:\s*(?:["']([^"']*)["']|\{([^}]*)\}))?/gi;
  
  const images: { html: string, align: string }[] = [];
  
  // First pass: Handle standard [tag] or [tag=val] or loose vimg_
  p = p.replace(mainVimgRegex, (match) => {
      // Check if it's already a processed placeholder
      if (match.startsWith('__IMG_PLACEHOLDER_')) return match;
      
      const vimgMatch = match.match(/vimg_([a-zA-Z0-9_-]+)/i);
      if (!vimgMatch) return match;
      
      const vimgId = vimgMatch[0];
      const baseId = vimgMatch[1];
      
      const tryGet = (id: string) => {
        try {
          const val = localStorage.getItem(id) || 
                      localStorage.getItem(id.toLowerCase()) || 
                      localStorage.getItem(id.toUpperCase());
          if (val && val.startsWith('ref:')) {
            const refKey = val.replace('ref:', '');
            return localStorage.getItem(refKey) || 
                   localStorage.getItem(refKey.toLowerCase()) || 
                   localStorage.getItem(refKey.toUpperCase());
          }
          return val;
        } catch (e) { return null; }
      };

      let savedSrc = tryGet(vimgId) || 
                       tryGet(baseId) || 
                       tryGet('vimg_' + baseId) ||
                       tryGet('img_' + baseId) ||
                       tryGet('vimg_img_' + baseId);
      
      if (!savedSrc) return match;
      
      const viewerAttr = '';
      const imgHtml = `<div class="my-1 w-full flex justify-center" ${viewerAttr}>
                        <div class="max-w-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                          <img src="${savedSrc}" class="w-full h-auto object-cover max-h-[500px]" alt="Narrativa" />
                        </div>
                      </div>`;
      images.push({ html: imgHtml, align: 'c' });
      return `__IMG_PLACEHOLDER_${images.length - 1}__`;
  });

  p = p.replace(standardImgRegex, (match, tagOrId, idValue, attrs, overlayQ, overlayB) => {
      // Avoid re-processing vimg tags already handled
      if (match.toLowerCase().includes('vimg_')) return match;
      const overlay = overlayQ || overlayB;
      let id = (idValue || tagOrId).trim();
      let finalAttrs = attrs || "";
      let savedSrc: string | null = null;

      // Keywords support
      const lowerTag = tagOrId.toLowerCase();
      const keywords = ['header', 'capa', 'banner', 'imagem', 'image', 'atm', 'atmosfera', 'acervo'];
      
      if (keywords.includes(lowerTag)) {
        if (contextImages && contextImages.length > 0) {
          let idx = 0;
          if (idValue && !isNaN(Number(idValue))) {
            idx = Number(idValue) - 1; // 1-based indexing
          }
          if (idx >= 0 && idx < contextImages.length) {
            const img = contextImages[idx];
            savedSrc = resolveMedia(typeof img === 'string' ? img : img.src);
          }
        }
      }

      if (!savedSrc) {
        const tryGet = (id: string) => {
          try {
            const val = localStorage.getItem(id) || 
                        localStorage.getItem(id.toLowerCase()) || 
                        localStorage.getItem(id.toUpperCase());
            if (val && val.startsWith('ref:')) {
                const refKey = val.replace('ref:', '');
                return localStorage.getItem(refKey) || 
                       localStorage.getItem(refKey.toLowerCase()) || 
                       localStorage.getItem(refKey.toUpperCase());
            }
            return val;
          } catch (e) { return null; }
        };

        const lowerId = id.toLowerCase();
        
        if (['b', 'i', 'u', 's', 'c', '/b', '/i', '/u', '/s', '/c'].includes(lowerId)) return match;
        if (lowerId.length === 1 && 'biusc'.includes(lowerId)) return match;

        // Extensive lookup strategy: Priority 1 - contextImages match by ID
        if (contextImages && contextImages.length > 0) {
            const contextMatch = contextImages.find(img => typeof img === 'object' && img !== null && img.id === id);
            if (contextMatch) {
                savedSrc = resolveMedia(contextMatch.src);
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
            savedSrc = resolveMedia(id);
        }
      }
      
      if (!savedSrc) return match; 
      
      // Parse attributes
      let height = '';
      let pos = '';
      let posX = '';
      let width = '';
      let align = '';
      
      if (finalAttrs) {
        const hMatch = finalAttrs.match(/h=(\d+)/);
        const pMatch = finalAttrs.match(/p=(\d+)/);
        const xMatch = finalAttrs.match(/x=(\d+)/);
        const wMatch = finalAttrs.match(/w=(\d+)/);
        const aMatch = finalAttrs.match(/a=([lcr])/);
        if (hMatch) {
          const hVal = Number(hMatch[1]);
          height = hVal > 1500 ? '1500' : hMatch[1];
        }
        if (pMatch) pos = pMatch[1];
        if (xMatch) posX = xMatch[1];
        if (wMatch) {
          const wVal = Number(wMatch[1]);
          width = (wVal > 500 ? 500 : wVal).toString();
        }
        if (aMatch) align = aMatch[1];
      }
      
      const isHeaderKeyword = ['header', 'capa', 'banner'].includes(lowerTag);
      const isAcervoKeyword = ['imagem', 'image', 'atm', 'atmosfera', 'acervo'].includes(lowerTag);
      const isTransparent = savedSrc.includes('image/png') || savedSrc.includes('image/webp');
      const defaultHeight = isHeaderKeyword ? '280px' : (overlay !== undefined ? '150px' : 'auto');
      const customHeight = height ? `${height}px` : defaultHeight;
      const customPX = posX ? `${posX}%` : 'center';
      const customPY = pos ? `${pos}%` : 'center';
      const customPos = `${customPX} ${customPY}`;
      
      // Ajuste de largura para modo visualizar: aumentar largura e extremidades horizontais
      const baseWidth = width ? Number(width) : 100;
      const effectiveWidth = isViewMode && !width ? 112 : baseWidth;
      const customWidth = `${effectiveWidth}%`;
      
      // Permitir expansão para headers e imagens genéricas, mas não para o acervo padrão, exceto em view mode
      const canExpand = isHeaderKeyword || lowerTag === 'img' || (baseWidth > 100 && !isAcervoKeyword) || isViewMode;
      const marginX = (effectiveWidth > 100 && canExpand) ? `calc(-${(effectiveWidth - 100) / 2}%)` : '0';
      
      const borderStyle = isTransparent ? 'border: none;' : 'border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 0 20px rgba(0,0,0,0.5); box-sizing: border-box;';
      const renderStyleBase = `height: 100%; width: 100%; object-position: ${customPos}; image-rendering: auto; display: block;`;
      
      let imgHtml = "";
      const hasOverlayText = overlay && overlay.trim() !== "";
      const flexClass = (width || effectiveWidth !== 100) ? 'flex-none' : 'flex-1';
      
      const viewerAttr = '';
      if (overlay !== undefined && overlay !== null) {
        const formattedOverlay = formatTags(overlay.trim(), true);
        imgHtml = `<div class="relative rounded-2xl overflow-hidden flex items-center justify-center ${flexClass} min-w-0" style="height: ${customHeight}; width: ${customWidth}; max-width: none !important; margin-left: ${marginX}; margin-right: ${marginX}; border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 0 20px rgba(0,0,0,0.5);" ${viewerAttr}>
                    <img src="${savedSrc}" loading="lazy" decoding="async" class="absolute inset-0 w-full h-full object-cover" style="${renderStyleBase}" />
                    ${hasOverlayText ? `
                    <div class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
                       <div class="text-white font-syncopate font-black uppercase tracking-[0.2em] text-center text-[10px] leading-tight drop-shadow-lg">${formattedOverlay}</div>
                    </div>
                    ` : ''}
                  </div>`;
      } else {
        imgHtml = `<div class="${flexClass} min-w-0" style="width: ${customWidth}; max-width: none !important; margin-left: ${marginX}; margin-right: ${marginX};" ${viewerAttr}>
                  <img src="${savedSrc}" loading="lazy" decoding="async" class="w-full rounded-2xl object-cover block" style="${renderStyleBase} ${borderStyle} height: ${customHeight};" />
                </div>`;
      }
      images.push({ html: imgHtml, align: align || 'c' });
      return `__IMG_PLACEHOLDER_${images.length - 1}__`;
  });
  
  p = formatTags(p, false);
  
  // Agrupar placeholders consecutivos (máximo 8 por linha)
  const placeholderClusterRegex = /((?:__IMG_PLACEHOLDER_\d+__[\t ]*)+)/g;
  p = p.replace(placeholderClusterRegex, (cluster) => {
    const ids = cluster.match(/\d+/g) || [];
    if (ids.length === 0) return cluster;
    
    let resultHtml = "";
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

const SlideshowWallpaper = ({ images, color, opacity, filter, noGradient = false, bottomColor = 'transparent' }: { images: string[], color: string, opacity: number, filter: string, noGradient?: boolean, bottomColor?: string }) => {
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
      {images.length > 0 ? images.map((img, i) => (
        <img 
          key={i} 
          src={resolveMedia(img) || img || undefined} 
          loading={i === 0 ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={i === 0 ? "high" : "low"}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out 4k-texture`}
          style={{ 
            opacity: i === index ? opacity : 0, 
            filter: filter, 
            imageRendering: '-webkit-optimize-contrast',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden'
          }} 
          alt="Wallpaper"
        />
      )) : (
         <div className="absolute inset-0 bg-slate-900 opacity-20" />
      )}
      {!noGradient && (
        <div className="absolute inset-0 z-10" style={{ background: `linear-gradient(to bottom, ${color} 0%, ${bottomColor} 100%)` }}></div>
      )}
    </div>
  );
};

const WikiCreation: React.FC<WikiCreationProps> = ({ onBack, onCreate, userName, userAvatar, verifySafety, isCharacterSheet, initialData }) => {
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

  const [name, setName] = useState(initialData?.title || '');
  const [topColor, setTopColor] = useState(initialData?.customTopColor || initialData?.topColor || '#02040a');
  const [description, setDescription] = useState(() => {
    if (!initialData?.content) return '';
    const registroMarker = '[B]REGISTRO:[/B]';
    const tagMarker = '[B]TAGS:[/B]';
    let extracted = initialData.content;
    if (initialData.content.includes(registroMarker)) {
      const parts = initialData.content.split(registroMarker);
      if (parts.length > 1) {
        extracted = parts[1].split(tagMarker)[0] || parts[1];
      }
    }
    return extracted.trim().substring(0, 100);
  });
  const [avatar, setAvatar] = useState<string | null>(initialData?.customAvatar || initialData?.avatar || null);
  const [avatarPosition, setAvatarPosition] = useState(initialData?.customAvatarPosition ?? 50);
  const [background, setBackground] = useState<string | null>(initialData?.customBgImage || null);
  const [topImages, setTopImages] = useState<any[]>(initialData?.customTopImages || (initialData?.galleryImages ? [...initialData.galleryImages] : []));
  const [gallery, setGallery] = useState<string[]>(initialData?.customGallery || []);
  const [keywords, setKeywords] = useState(initialData?.customKeywords || '');
  const [narrativeContent, setNarrativeContent] = useState(() => {
    if (!initialData?.content) return '';
    // Tenta encontrar o marcador [B]REGISTRO:[/B]
    const registroMarker = '[B]REGISTRO:[/B]';
    const tagMarker = '[B]TAGS:[/B]';
    
    if (initialData.content.includes(registroMarker)) {
      const afterRegistro = initialData.content.split(registroMarker)[1];
      if (afterRegistro) {
        const cleaned = afterRegistro.trim();
        if (cleaned.includes(tagMarker)) {
          return cleaned.split(tagMarker)[0].trim();
        }
        return cleaned;
      }
    }
    return initialData.content;
  });
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');
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

  const handleShareImage = async (src: string) => {
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
  const [hideOverlay, setHideOverlay] = useState(initialData?.customHideOverlay || initialData?.hideTopOverlay || false);
  const [infoRows, setInfoRows] = useState<WikiInfoRow[]>(initialData?.customInfoRows || [
    { label: 'Classe de Risco', value: '' },
    { label: 'Afinidade Neural', value: '' },
    { label: 'Setor de Origem', value: '' }
  ]);

  const avatarRef = useRef<HTMLInputElement>(null);
  const bgRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const narrativeImageRef = useRef<HTMLInputElement>(null);
  const editorTextAreaRef = useRef<HTMLTextAreaElement>(null);

  const insertTag = (tag: string) => {
    if (!editorTextAreaRef.current) return;
    const textarea = editorTextAreaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    const before = text.substring(0, start);
    const after = text.substring(end);
    
    // Improved logic: wrap selection or just insert tag
    const openTag = `[${tag.toUpperCase()}]`;
    const closeTag = `[/${tag.toUpperCase()}]`;
    
    if (selected) {
      setNarrativeContent(before + openTag + selected + closeTag + after);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + openTag.length + selected.length + closeTag.length, start + openTag.length + selected.length + closeTag.length);
      }, 0);
    } else {
      setNarrativeContent(before + openTag + after);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + openTag.length, start + openTag.length);
      }, 0);
    }
  };

  const compressAndInsertImage = (base64: string) => {
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
        const imgId = Math.random().toString(36).substring(2, 9);
        const fullId = `img_${imgId}`;
        try {
          localStorage.setItem('vimg_' + fullId, compressedBase64);
          if (!background) setBackground(compressedBase64);
          
          if (!editorTextAreaRef.current) return;
          const textarea = editorTextAreaRef.current;
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const text = textarea.value;
          const before = text.substring(0, start);
          const after = text.substring(end);
          
          const tag = `[${fullId} h=150 p=50 x=50 w=100 a=c] ""`;
          setNarrativeContent(`${before}${tag}${after}`);
          
          setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + tag.length, start + tag.length);
          }, 0);
          if (verifySafety) verifySafety(compressedBase64).catch(console.error);
        } catch (err) { alert("Ativo visual pesado demais."); }
      }
    };
    img.onerror = () => { console.error("Compression error"); };
    img.src = base64;
  };

  const handleInsertNarrativeImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (verifySafety) {
      const isSafe = await verifySafety('', 'image');
      if (!isSafe) return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      compressAndInsertImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (initialData) return;
    const key = isCharacterSheet ? `void_draft_char_${userName}` : `void_draft_wiki_${userName}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.name) setName(data.name);
        if (data.topColor) setTopColor(data.topColor);
        if (data.description) setDescription(data.description);
        if (data.avatar) setAvatar(data.avatar);
        if (data.avatarPosition !== undefined) setAvatarPosition(data.avatarPosition);
        if (data.background) setBackground(data.background);
        if (data.topImages) setTopImages(data.topImages);
        if (data.gallery) setGallery(data.gallery);
        if (data.keywords) setKeywords(data.keywords);
        if (data.infoRows) setInfoRows(data.infoRows);
        if (data.narrativeContent) setNarrativeContent(data.narrativeContent);
      } catch (e) {}
    }
  }, [userName, isCharacterSheet, initialData]);

  useEffect(() => {
    const key = isCharacterSheet ? `void_draft_char_${userName}` : `void_draft_wiki_${userName}`;
    const timeout = setTimeout(() => {
      localStorage.setItem(key, JSON.stringify({ 
        name, topColor, description, avatar, avatarPosition, background, topImages, gallery, keywords, infoRows, narrativeContent 
      }));
    }, 1000);
    return () => clearTimeout(timeout);
  }, [name, topColor, description, avatar, background, topImages, gallery, keywords, infoRows, narrativeContent, userName, isCharacterSheet]);

  useEffect(() => {
     // Generate missing narrative images found in the Wiki content
     const generateWikiNarrativeImages = async () => {
        if (!narrativeContent) return;
        const vimgMatches = narrativeContent.matchAll(/vimg_[a-zA-Z0-9_-]+/gi);
        
        for (const match of vimgMatches) {
           const vimgId = match[0];
           if (localStorage.getItem(vimgId) || localStorage.getItem(vimgId.toLowerCase()) || localStorage.getItem(vimgId.toUpperCase())) continue;
           if (isAiProcessing.current.has(vimgId)) continue;
           isAiProcessing.current.add(vimgId);

           try {
              const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
              const prompt = `Gere uma ilustração cinematográfica e imersiva para o RPG VOIDY:\n\nAssunto: ${name}\nContexto: ${narrativeContent.substring(0, 500)}\n\nEstilo: Sci-fi, Cyberpunk, Neo-noir, luzes neon, sombras profundas, alta fidelidade.`;
              
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
  }, [narrativeContent, name]);

  const isAiProcessing = useRef<Set<string>>(new Set());

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: any) => void) => {
    const target = e.target;
    const file = target.files?.[0];
    if (!file) return;
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
          const compressed = canvas.toDataURL(outputMime, 0.82);
          setter(saveToMediaStorage(compressed));
          if (verifySafety) verifySafety(compressed).catch(console.error);
        } else {
          setter(saveToMediaStorage(base64));
        }
      };
      img.onerror = () => { setter(saveToMediaStorage(base64)); };
      img.src = base64;
    };
    reader.readAsDataURL(file);
    target.value = '';
  };

  const handleTopImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target;
    const files = target.files;
    if (!files) return;
    Array.from(files).forEach((file: any) => {
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
              setTopImages(prev => [...prev, { id: fullId, src: savedRef }]);
              if (!background) setBackground(compressedBase64);
              if (verifySafety) verifySafety(compressedBase64).catch(console.error);
            } catch (err) { alert("Ativo visual pesado demais."); }
          }
        };
        img.onerror = () => { console.error("Wiki top image upload error"); };
        img.src = base64;
      };
      reader.readAsDataURL(file as Blob);
    });
    target.value = '';
  };

  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const target = e.target;
    const files = target.files;
    if (!files) return;
    const remaining = 20 - gallery.length;
    Array.from(files).slice(0, remaining).forEach((file: any) => {
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
             const compressed = canvas.toDataURL(outputMime, 0.82);
             const savedRef = saveToMediaStorage(compressed);
             setGallery(prev => [...prev, savedRef]);
             if (verifySafety) verifySafety(compressed).catch(console.error);
          } else {
             const savedRef = saveToMediaStorage(base64);
             setGallery(prev => [...prev, savedRef]);
          }
        };
        img.onerror = () => { 
          const savedRef = saveToMediaStorage(base64);
          setGallery(prev => [...prev, savedRef]); 
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    });
    target.value = '';
  };

  const [isPublishing, setIsPublishing] = useState(false);

  const handlePublish = async () => {
    if (!name.trim() || isPublishing) return;
    setIsPublishing(true);

    try {
      if (verifySafety) {
        const [isNameSafe, isDescSafe, isKeywordsSafe] = await Promise.all([
          verifySafety(name, 'text'),
          verifySafety(description, 'text'),
          verifySafety(keywords, 'text')
        ]);
        
        if (!isNameSafe || !isDescSafe || !isKeywordsSafe) {
          setIsPublishing(false);
          return;
        }
      }

      const infoContent = infoRows
        .filter(r => r.label.trim() || r.value.trim())
        .map(r => `[B]${r.label}:[/B] ${r.value}`)
        .join('\n');
      
      const contentFinal = `${infoContent}\n\n[B]REGISTRO:[/B]\n${narrativeContent || description}\n\n[B]TAGS:[/B] ${keywords}`;
      
      const newPost: FeedPost = {
        id: initialData?.id || `wiki-${Date.now()}`,
        author: userName,
        avatar: resolveMedia(avatar) || userAvatar,
        title: name.toUpperCase(),
        content: contentFinal,
        likes: initialData?.likes || 0,
        time: initialData?.time || 'Agora',
        tag: isCharacterSheet ? 'WIKI_ENTRADA' : 'WIKI',
        timestamp: initialData?.timestamp || Date.now(),
        comments: initialData?.comments || [],
        customAvatar: resolveMedia(avatar) || undefined,
        customAvatarPosition: avatarPosition,
        customBgImage: resolveMedia(background) || undefined,
        customTopColor: topColor,
        customKeywords: keywords,
        customInfoRows: infoRows,
        customGallery: gallery,
        customTopImages: topImages,
        customHideOverlay: hideOverlay,
      };
      onCreate(newPost);
      localStorage.removeItem(isCharacterSheet ? `void_draft_char_${userName}` : `void_draft_wiki_${userName}`);
    } catch (error) {
      console.error('Erro ao publicar wiki:', error);
    } finally {
      setIsPublishing(false);
    }
  };

  const resolvedAvatar = resolveMedia(avatar);
  const resolvedBackground = resolveMedia(background);

  return (
    <div className="fixed inset-0 z-[600] bg-[#02040a] flex flex-col font-inter text-white overflow-hidden">
      <header 
        className={`px-6 flex items-center justify-between shrink-0 z-50 transition-colors duration-500 ${viewMode === 'preview' ? 'py-4 border-b border-white/10' : 'py-5 bg-black/40 backdrop-blur-xl border-b border-white/5 shadow-2xl'}`}
        style={viewMode === 'preview' ? { backgroundColor: `${topColor}CC`, backdropFilter: 'blur(12px)' } : {}}
      >
        <button onClick={viewMode === 'preview' ? () => setViewMode('editor') : onBack} className={`transition-all active:scale-90 border ${viewMode === 'preview' ? 'p-2 bg-white/5 rounded-xl text-slate-400 hover:text-white border-white/10' : 'p-2.5 bg-white/5 rounded-2xl text-slate-400 hover:text-white border-white/5'}`}>
           <svg className={viewMode === 'preview' ? "w-5 h-5" : "w-6 h-6"} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
        </button>
        
        {viewMode === 'editor' ? (
          <>
            <div className="flex flex-col items-center">
               <h2 className="text-[10px] font-syncopate font-black text-white uppercase tracking-[0.4em]">Nova Entrada Wiki</h2>
               <div className="flex gap-6 mt-3">
                  <button 
                    onClick={() => setViewMode('editor')}
                    className={`text-[8px] font-black uppercase tracking-widest transition-all ${viewMode === 'editor' ? 'text-cyan-400' : 'text-slate-600'}`}
                  >
                    Configurar
                  </button>
                  <button 
                    onClick={() => setViewMode('preview')}
                    className={`text-[8px] font-black uppercase tracking-widest transition-all ${viewMode === 'preview' ? 'text-cyan-400' : 'text-slate-600'}`}
                  >
                    Visualizar
                  </button>
               </div>
            </div>

            <button 
              onClick={handlePublish} 
              disabled={!name.trim() || isPublishing} 
              className="p-2.5 bg-white text-black rounded-2xl hover:bg-cyan-50 transition-all disabled:opacity-50 shadow-[0_0_25px_rgba(255,255,255,0.3)] active:scale-95 border border-white/50 flex items-center justify-center min-w-[44px]"
            >
              {isPublishing ? (
                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>
              )}
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center flex-1 mx-4">
             <h2 className="text-[10px] font-syncopate font-black text-white uppercase tracking-[0.4em] animate-in fade-in slide-in-from-top-1 duration-500">
               {name || "SEM TÍTULO"}
             </h2>
          </div>
        )}
      </header>

      {viewMode === 'editor' ? (
        <main className="flex-1 overflow-y-auto no-scrollbar bg-black">
          <div className="max-w-2xl mx-auto flex flex-col pb-32 bg-black">
            <section className="px-8 pt-0 pb-8 flex flex-col items-center border-b border-white/5">
              <div className="w-full flex items-center gap-8 mb-6">
                <div className="flex flex-col gap-2 shrink-0">
                  <div 
                    onClick={() => avatarRef.current?.click()}
                    className="w-28 h-28 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center cursor-pointer overflow-hidden relative group shadow-2xl"
                  >
                    {resolvedAvatar ? (
                      <img 
                        src={resolvedAvatar} 
                        loading="lazy"
                        decoding="async"
                        fetchPriority="high"
                        className="w-full h-full object-cover" 
                        style={{ objectPosition: `center ${avatarPosition}%` }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 text-xl font-black shadow-lg">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 4.5v15m7.5-7.5h-15"/></svg>
                      </div>
                    )}
                    <input type="file" ref={avatarRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, setAvatar)} />
                  </div>
                  {resolvedAvatar && (
                    <div className="flex flex-col gap-1 px-1 w-28">
                      <span className="text-[7px] font-black text-white/30 uppercase tracking-widest text-center">Posição: {avatarPosition}%</span>
                      <input 
                        type="range" 
                        min="0" max="100" 
                        value={avatarPosition} 
                        onChange={(e) => setAvatarPosition(Number(e.target.value))} 
                        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-500"
                      />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.3em] mb-2 block">Nome do Registro</span>
                  <input 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    placeholder="Identificação..." 
                    maxLength={20}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-lg p-4 text-base font-bold text-white outline-none focus:border-white/30 placeholder:text-white/20 uppercase"
                  />
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 border-b border-white/5">
                <section className="px-8 py-6 space-y-4">
                  <div className="flex items-center justify-between">
                     <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Atmosfera Visual</span>
                     <div className="flex items-center gap-4">
                        <button 
                          onClick={() => setHideOverlay(!hideOverlay)} 
                          className={`px-3 py-1 rounded-full text-[7px] font-black uppercase transition-all ${hideOverlay ? 'bg-cyan-500 text-black' : 'bg-white/5 border border-white/10 text-white'}`}
                        >
                          {hideOverlay ? 'Overlay: OFF' : 'Overlay: ON'}
                        </button>
                        <button onClick={() => topRef.current?.click()} className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors uppercase tracking-widest">Adicionar</button>
                     </div>
                  </div>
                  {topImages.length > 0 && (
                    <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
                       {topImages.map((imgObj, i) => (
                         <div 
                           key={i} 
                           onClick={() => {
                             let fullId;
                             if (typeof imgObj === 'object' && imgObj.id) {
                               fullId = imgObj.id;
                             } else {
                               // If it's just a src string, we need to ensure it has an ID
                               const src = typeof imgObj === 'string' ? imgObj : imgObj.src;
                               const existingId = Object.keys(localStorage).find(key => key.startsWith('vimg_') && localStorage.getItem(key) === src);
                               if (existingId) {
                                 fullId = existingId.replace('vimg_', '');
                               } else {
                                 fullId = `img_${Math.random().toString(36).substring(2, 9)}`;
                                 localStorage.setItem(`vimg_${fullId}`, src);
                               }
                             }
                             const textarea = editorTextAreaRef.current;
                             const start = textarea?.selectionStart ?? narrativeContent.length;
                             const end = textarea?.selectionEnd ?? start;
                             const before = narrativeContent.substring(0, start);
                             const after = narrativeContent.substring(end);
                             const tagString = `[${fullId} h=150 p=50 x=50 w=100 a=c] ""`;
                             setNarrativeContent(`${before}${tagString}${after}`);
                             setTimeout(() => {
                               textarea?.focus();
                               textarea?.setSelectionRange(start + tagString.length, start + tagString.length);
                             }, 0);
                           }}
                           className="relative w-20 h-14 shrink-0 rounded-xl border border-white/10 overflow-hidden group shadow-lg cursor-pointer hover:border-cyan-500 transition-all"
                         >
                            <img src={resolveMedia(typeof imgObj === 'string' ? imgObj : imgObj.src)} className="w-full h-full object-cover" />
                            <button onClick={(e) => { e.stopPropagation(); setTopImages(prev => prev.filter((_, idx) => idx !== i)); }} className="absolute top-1 right-1 w-6 h-6 bg-black/60 backdrop-blur-md rounded-lg flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                         </div>
                       ))}
                    </div>
                  )}
                  <input type="file" ref={topRef} className="hidden" accept="image/*" multiple onChange={handleTopImagesUpload} />
                </section>

                <div className="grid grid-cols-2 border-t border-white/5 divide-x divide-white/5">
                   {/* Fundo de Perfil */}
                   <section className="flex flex-col relative">
                      <div 
                        onClick={() => bgRef.current?.click()}
                        className="px-8 py-8 flex flex-col items-center gap-3 cursor-pointer hover:bg-white/[0.02] transition-all group"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white group-hover:bg-white/5 transition-all">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Fundo de Perfil</span>
                        <input type="file" ref={bgRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, setBackground)} />
                      </div>
                      
                      <div className="px-6 pb-6 mt-auto min-h-[80px]">
                        {resolvedBackground ? (
                           <div className="flex gap-2 py-1">
                              <div className="relative w-20 h-14 shrink-0 rounded-xl border border-white/10 overflow-hidden shadow-lg group">
                                 <img src={resolvedBackground || undefined} className="w-full h-full object-cover" />
                                 <button onClick={(e) => { e.stopPropagation(); setBackground(null); }} className="absolute top-1 right-1 w-6 h-6 bg-black/60 backdrop-blur-md rounded-lg flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                              </div>
                           </div>
                        ) : (
                           <div className="w-full h-14 rounded-xl border border-dashed border-white/5 flex items-center justify-center opacity-20">
                              <span className="text-[8px] uppercase font-black tracking-widest">Nenhum Ativo</span>
                           </div>
                        )}
                      </div>
                   </section>

                   {/* Acervo da Galeria */}
                   <section className="flex flex-col relative">
                      <div 
                        onClick={() => galleryRef.current?.click()}
                        className="px-8 py-8 flex flex-col items-center gap-3 cursor-pointer hover:bg-white/[0.02] transition-all group"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white group-hover:bg-white/5 transition-all">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6.75a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6.75v11.25a1.5 1.5 0 001.5 1.5zM12 12.75h.007v.007H12v-.007z" /></svg>
                        </div>
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Acervo da Galeria</span>
                        
                        <input type="file" ref={galleryRef} className="hidden" accept="image/*" multiple onChange={handleGalleryUpload} />
                      </div>

                      {/* Cor + Reset ao lado (posicionado absolutamente no topo do acervo) */}
                      <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                         <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-2.5 py-1 shadow-2xl">
                            <div className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: topColor }} />
                            <input 
                              value={topColor} 
                              onChange={(e) => setTopColor(e.target.value)} 
                              maxLength={7}
                              className="w-12 bg-transparent text-[8px] font-mono text-white outline-none uppercase"
                              placeholder="#000"
                            />
                         </div>
                         <button 
                           onClick={() => setTopColor('#02040a')}
                           className="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded-md text-[6px] font-black text-white uppercase transition-all border border-white/5 shadow-lg"
                         >
                           Resetar Cor
                         </button>
                      </div>

                      <div className="px-6 pb-6 mt-auto min-h-[80px]">
                        {gallery.length > 0 ? (
                           <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                              {gallery.map((img, i) => (
                                <div key={i} className="relative w-20 h-14 shrink-0 rounded-xl border border-white/10 overflow-hidden shadow-lg group">
                                   <img src={resolveMedia(img)} className="w-full h-full object-cover" />
                                   <button onClick={(e) => { e.stopPropagation(); setGallery(prev => prev.filter((_, idx) => idx !== i)); }} className="absolute top-1 right-1 w-6 h-6 bg-black/60 backdrop-blur-md rounded-lg flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                                </div>
                              ))}
                           </div>
                        ) : (
                          <div className="w-full h-14 rounded-xl border border-dashed border-white/5 flex items-center justify-center opacity-20">
                             <span className="text-[8px] uppercase font-black tracking-widest">Nenhum Ativo</span>
                          </div>
                        )}
                      </div>
                   </section>
                </div>
            </div>

            <section className="px-8 py-6 space-y-4 border-b border-white/5">
              <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Palavras-chave</label>
              <input 
                value={keywords} 
                onChange={(e) => setKeywords(e.target.value)} 
                placeholder="Ex: humano, herói, guerreiro, nexus..." 
                className="w-full bg-transparent text-sm text-white/80 outline-none placeholder:text-white/10" 
              />
            </section>

            <section className="px-8 py-6 space-y-4">
               <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-white/50 uppercase tracking-widest">Relatório Narrativo</span>
                  <div className="flex gap-2">
                     <button onClick={() => insertTag('b')} className="p-2 hover:bg-white/5 rounded text-white/60">B</button>
                     <button onClick={() => insertTag('i')} className="p-2 hover:bg-white/5 rounded text-white/60 italic">I</button>
                     <button onClick={() => insertTag('u')} className="p-2 hover:bg-white/5 rounded text-white/60 underline">U</button>
                     <button onClick={() => insertTag('s')} className="p-2 hover:bg-white/5 rounded text-white/60 line-through">S</button>
                     <button onClick={() => insertTag('c')} className="p-2 hover:bg-white/5 rounded text-white/60">C</button>
                     <button onClick={() => narrativeImageRef.current?.click()} className="p-2 hover:bg-white/5 rounded text-white/60">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                     </button>
                     <input type="file" ref={narrativeImageRef} className="hidden" accept="image/*" onChange={handleInsertNarrativeImage} />
                  </div>
               </div>
               <textarea 
                 ref={editorTextAreaRef}
                 value={narrativeContent} 
                 onChange={(e) => setNarrativeContent(e.target.value)} 
                 placeholder="Inicie o relatório narrativo..." 
                 className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-4 text-[14px] text-white/80 min-h-[300px] outline-none focus:border-white/30 placeholder:text-white/10" 
               />
            </section>

            <section className="bg-white/[0.02]">
              <div className="px-8 py-5 bg-white/[0.08] border-y border-white/5 flex items-center justify-between">
                <h3 className="text-xs font-bold text-white/50 uppercase tracking-widest">Informações do Registro</h3>
                <button 
                  onClick={() => setInfoRows([...infoRows, { label: '', value: '' }])} 
                  className="w-10 h-10 rounded-2xl bg-white/10 text-white flex items-center justify-center shadow-lg active:scale-90 transition-all border border-white/20"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M12 4.5v15m7.5-7.5h-15" /></svg>
                </button>
              </div>
              <div className="divide-y divide-white/5">
                {infoRows.map((row, idx) => (
                  <div key={idx} className="flex flex-col px-8 py-5 group hover:bg-white/[0.03] transition-colors">
                    <div className="flex items-center gap-4 mb-4">
                      <input 
                        value={row.label} 
                        onChange={(e) => {
                          const n = [...infoRows]; n[idx].label = e.target.value; setInfoRows(n);
                        }} 
                        className="flex-1 bg-transparent text-sm font-bold text-white/90 outline-none focus:text-white transition-colors" 
                        placeholder="Rótulo" 
                      />
                      <div className="flex gap-1">
                        <button 
                          onClick={() => { const n = [...infoRows]; n[idx].type = 'text'; setInfoRows(n); }}
                          className={`px-2 py-1 rounded text-[6px] font-black uppercase transition-all ${(!row.type || row.type === 'text') ? 'bg-white text-black' : 'bg-white/5 text-white/40'}`}
                        >Texto</button>
                        <button 
                          onClick={() => { const n = [...infoRows]; n[idx].type = 'rating_star'; setInfoRows(n); }}
                          className={`px-2 py-1 rounded text-[6px] font-black uppercase transition-all ${row.type === 'rating_star' ? 'bg-cyan-500 text-black' : 'bg-white/5 text-white/40'}`}
                        >Estrela</button>
                        <button 
                          onClick={() => { const n = [...infoRows]; n[idx].type = 'rating_heart'; setInfoRows(n); }}
                          className={`px-2 py-1 rounded text-[6px] font-black uppercase transition-all ${row.type === 'rating_heart' ? 'bg-pink-500 text-black' : 'bg-white/5 text-white/40'}`}
                        >Coração</button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <input 
                        value={row.value} 
                        onChange={(e) => {
                          const n = [...infoRows]; n[idx].value = e.target.value; setInfoRows(n);
                        }} 
                        className="flex-1 bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-sm text-white/60 outline-none transition-all focus:border-white/20 focus:bg-white/[0.08]" 
                        placeholder={row.type?.startsWith('rating') ? "Valor (1-5)" : "Valor"} 
                      />
                      <button 
                        onClick={() => setInfoRows(infoRows.filter((_, i) => i !== idx))} 
                        className="w-8 h-8 flex items-center justify-center bg-purple-500/10 hover:bg-purple-500 text-purple-500 hover:text-white rounded-xl transition-all active:scale-90 shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
      ) : (
         <main className="flex-1 overflow-y-auto no-scrollbar bg-transparent text-white animate-in fade-in duration-700">
          <div className="fixed inset-0 z-0 pointer-events-none">
             {resolvedBackground && (
               <img 
                 src={resolvedBackground} 
                 className="absolute inset-0 w-full h-full object-cover opacity-80" 
                 style={{ filter: 'brightness(1.1)', imageRendering: 'high-quality' }} 
               />
             )}
             <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-[#02040a]" />
          </div>
          <div className="relative z-10 w-full h-[320px] overflow-hidden">
             <SlideshowWallpaper 
               images={topImages.length > 0 ? topImages.map(img => typeof img === 'object' && img.src ? img.src : img) : (gallery.length > 0 ? gallery : (resolvedBackground || resolvedAvatar ? [resolvedBackground || resolvedAvatar] : []))} 
               color={topColor} 
               opacity={hideOverlay ? 1 : 0.95} 
               filter="brightness(1.1)" 
               noGradient={hideOverlay} 
               bottomColor="transparent"
             />
             <div className="absolute inset-0 flex items-center justify-center pt-20">
               <div className="w-44 h-44 rounded-[3rem] border-[4px] border-white/10 p-1 bg-[#02040a] shadow-[0_0_60px_rgba(255,255,255,0.1)] overflow-hidden">
                 <img src={resolvedAvatar || userAvatar || undefined} className="w-full h-full object-cover rounded-[2.5rem]" style={{ objectPosition: `center ${avatarPosition}%` }} />
               </div>
             </div>
          </div>

          <div className="p-4 md:p-10 space-y-12 max-w-3xl mx-auto pb-60 bg-black/40 backdrop-blur-sm rounded-[3rem] mt-10 border border-white/5">
             <div className="text-center space-y-2">
                 {(() => {
                    const titleColor = getAutoContrastHex(topColor || '#1a2036');
                    const isTitleDark = hexToHsla(titleColor).l < 30;
                    return (
                      <h1 
                        className={`text-4xl md:text-6xl font-syncopate font-black uppercase tracking-tighter break-words w-full ${isTitleDark ? '' : 'drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]'}`}
                        style={{ color: titleColor }}
                      >
                        {name || 'NOME_DO_REGISTRO'}
                      </h1>
                    );
                 })()}
                <div className="w-20 h-1 bg-gradient-to-r from-transparent via-white/40 to-transparent mx-auto rounded-full"></div>
                
                {keywords && (
                   <div className="flex flex-wrap justify-center gap-3 pt-0 opacity-40">
                      {keywords.split(',').map(tag => (
                         <span key={tag} className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[7px] font-black uppercase tracking-widest">#{tag.trim()}</span>
                      ))}
                   </div>
                )}
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {infoRows.map((row, i) => row.label && row.value && (
                   <div key={i} className="bg-white/[0.03] border border-white/5 p-6 rounded-[2.2rem] flex flex-col gap-1.5 shadow-xl transition-all hover:bg-white/[0.05]">
                      <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full w-fit bg-white/5" style={{ color: getAutoContrastHex(topColor || '#1a2036'), opacity: 0.7 }}>{row.label}</span>
                      {row.type === 'rating_star' || row.type === 'rating_heart' ? (
                          <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map(v => (
                                  <span key={v} className={`${Number(row.value) >= v ? 'text-cyan-400' : 'text-white/10'}`}>
                                      {row.type === 'rating_star' ? <StarIcon active={Number(row.value) >= v} className="w-3 h-3" /> : <HeartIcon active={Number(row.value) >= v} className="w-3 h-3" />}
                                  </span>
                              ))}
                          </div>
                      ) : (
                          <span className="text-sm font-bold uppercase tracking-widest" style={{ color: getAutoContrastHex(topColor || '#1a2036') }}>{row.value}</span>
                      )}
                   </div>
                ))}
             </div>
             
             <div className="pt-12 border-t border-white/5 relative">
                <div className="absolute -top-3.5 left-6 px-6 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-[10px] font-black text-white/70 uppercase tracking-widest shadow-lg">Registro de Informações</div>
                <div className="text-[15px] font-medium leading-relaxed px-1 text-left w-full" style={{ color: getAutoContrastHex(topColor || '#1a2036') }} dangerouslySetInnerHTML={{ __html: formatBioText(narrativeContent || 'Sem descrição disponível.', undefined, [...topImages, ...(gallery || [])], true) }} />

                {/* Imagens Salvas Section */}
                {topImages.length > 0 && (() => {
                  const wikiSavedContrast = getAutoContrastHex(topColor || '#1a2036');
                  const isBgLight = hexToHsla(wikiSavedContrast).l < 40;
                  const neumorphicHeader = isBgLight ? { boxShadow: '-4px -4px 10px #ffffff, 4px 4px 10px #aeaec040' } : { boxShadow: 'inset -2px -2px 5px rgba(255,255,255,0.05), inset 2px 2px 5px rgba(0,0,0,0.3)' };
                  return (
                    <div className="pt-8 space-y-4">
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-3 px-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_#22d3ee]"></div>
                           <h4 className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full ${isBgLight ? 'bg-black/[0.03]' : 'bg-white/5'}`} style={{ color: wikiSavedContrast, opacity: 0.8, ...neumorphicHeader }}>Imagens Salvas</h4>
                        </div>
                        <div className={`h-px w-full ${isBgLight ? 'bg-black/5' : 'bg-white/10'}`} />
                      </div>
                      
                      <div className={`w-full overflow-hidden rounded-[2rem] p-4 ${isBgLight ? 'bg-[#f0f0f3] shadow-[inset_-8px_-8px_20px_#ffffff,inset_8px_8px_20px_#aeaec040]' : 'bg-black/20 shadow-[inset_-4px_-4px_12px_rgba(255,255,255,0.05),inset_4px_4px_12px_rgba(0,0,0,0.4)] border border-white/5'}`}>
                        <div className="flex gap-4 overflow-x-auto no-scrollbar w-full pb-2 px-1">
                          {topImages.map((imgObj, i) => {
                            const src = resolveMedia(typeof imgObj === 'string' ? imgObj : imgObj.src) || (typeof imgObj === 'string' ? imgObj : imgObj.src) || '';
                            return (
                              <div 
                                key={i} 
                                onClick={() => setSelectedFullImage(src)}
                                className={`aspect-video w-48 shrink-0 rounded-2xl overflow-hidden cursor-pointer hover:scale-[1.02] transition-all text-left ${isBgLight ? 'bg-white shadow-[-8px_-8px_20px_#ffffff,8px_8px_20px_#aeaec040]' : 'bg-black/40 border border-white/10 shadow-xl'}`}
                              >
                                <img src={src} className="w-full h-full object-cover" alt={`Top Image ${i}`} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="pt-4 -mx-4 md:-mx-10">
                   {(() => {
                     const creatorContrast = getAutoContrastHex(topColor || '#1a2036');
                     const isBgLight = hexToHsla(creatorContrast).l < 40;
                     const neumorphicBar = isBgLight 
                        ? { boxShadow: 'inset -6px -6px 15px #ffffff, inset 6px 6px 15px #aeaec040' } 
                        : { boxShadow: 'inset -4px -4px 12px rgba(255,255,255,0.03), inset 4px 4px 12px rgba(0,0,0,0.5)', background: 'rgba(5, 8, 15, 0.4)' };
                     
                     return (
                       <>
                          <div className={`h-[0.5px] w-full mb-4 ${isBgLight ? 'bg-black/5' : 'bg-white/10'}`} />
                          <div className="flex items-center self-start relative">
                             <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-10 rounded-full z-10" style={{ backgroundColor: creatorContrast, opacity: 0.2 }} />
                             <div className="flex items-center gap-2 px-3 h-7 rounded-r-xl bg-white/5 border border-white/5 ml-[1px] relative z-0 backdrop-blur-md shadow-xl">
                                <div className="w-5 h-5 rounded-md border border-white/10 overflow-hidden shadow-lg shrink-0">
                                   <img src={userAvatar || undefined} loading="lazy" className="w-full h-full object-cover" alt="Author" />
                                </div>
                                <div className="flex flex-col select-none leading-none pb-0.5">
                                   <span className="text-[5px] font-black uppercase tracking-widest opacity-40" style={{ color: creatorContrast }}>REGISTRADO POR</span>
                                   <span className="text-[10px] font-black tracking-widest leading-none mt-0.5" style={{ color: creatorContrast }}>{userName}</span>
                                </div>
                             </div>
                          </div>
                       </>
                     );
                   })()}
                </div>

                {/* Fluxo de Pensamentos (Comments) Section Placeholder */}
                {(() => {
                  const commentsContrast = getAutoContrastHex(topColor || '#1a2036');
                  const isBgLight = hexToHsla(commentsContrast).l < 40;
                  const neumorphicHeader = isBgLight ? { boxShadow: '-5px -5px 15px #ffffff, 5px 5px 15px #aeaec040' } : {};
                  return (
                    <div className="pt-4 border-t border-white/5 space-y-6">
                       <div className="flex flex-col gap-4 mt-1">
                          <div className="flex items-center gap-3 px-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_#22d3ee] animate-pulse"></div>
                             <div className={`px-4 py-1.5 rounded-full ${isBgLight ? 'bg-black/[0.03]' : 'bg-white/5'}`} style={neumorphicHeader}>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80" style={{ color: isBgLight ? '#000000' : commentsContrast }}>Fluxo de Pensamentos</h4>
                             </div>
                          </div>
                          <div className={`h-px w-full ${isBgLight ? 'bg-black/5' : 'bg-white/5'}`} />
                       </div>
                       <div className="flex flex-col items-center justify-center py-10 opacity-30">
                          <span className="text-3xl mb-4 grayscale">📡</span>
                          <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: commentsContrast }}>Aguardando Sinais de Consciência</p>
                       </div>
                    </div>
                  );
                })()}
             </div>



             {/* GALERIA NA PREVIEW REMOVIDA POIS AGORA ESTÁ ACIMA DO CRIADOR */}

          </div>
        </main>
      )}

      {selectedFullImage && (
        <div className="fixed inset-0 z-[1000] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
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
                onClick={() => handleShareImage(selectedFullImage)}
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
        .4k-texture {
          image-rendering: high-quality;
          image-rendering: -webkit-optimize-contrast;
          transform: translateZ(0);
          backface-visibility: hidden;
        }
      `}} />
    </div>
  );
};

export default WikiCreation;