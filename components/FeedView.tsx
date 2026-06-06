
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { FeedPost, PostComment, PollOption } from '../types';
import { resolveImageRef } from '../data';

interface FeedViewProps {
  onBack: () => void;
  userAvatar: string;
  userName: string;
  posts: FeedPost[];
  onAddPost: (post: Omit<FeedPost, 'id' | 'likes' | 'time' | 'likedBy' | 'timestamp'>) => void;
  verifySafety?: (base64: string) => Promise<boolean>;
  followedUsers?: string[];
  onDeletePost?: (id: string) => void;
  onEditPost?: (post: FeedPost) => void;
  isAppModerator?: boolean;
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
  const alpha = Math.round(a * 255).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}${alpha === 'ff' ? '' : alpha}`;
};

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
      if (t.includes('b')) res = `<strong class="font-black text-white ${isOverlay ? 'text-[1.2em] inline-block' : ''}">${res}</strong>`;
      if (t.includes('u')) res = `<span class="underline">${res}</span>`;
      if (t.includes('s')) res = `<span class="line-through opacity-60">${res}</span>`;
      if (t.includes('c')) res = `<div style="text-align: center; width: 100%; display: block; margin: 2px 0;">${res}</div>`;
      return res;
    });
  } while (p !== oldP);
  return p;
};

const formatBioText = (text: string, customTextColor?: string, contextImages?: any[]) => {
  if (!text) return "";
  let p = text;
  
  const images: { html: string, align: string }[] = [];
  
  const tryGet = (id: string | null | undefined) => {
    if (!id) return null;
    try {
      const cleanId = id.replace(/^(ref:|vimg_|img_)/i, '');
      const val = localStorage.getItem(id) || 
                  localStorage.getItem(id.toLowerCase()) || 
                  localStorage.getItem(id.toUpperCase()) ||
                  localStorage.getItem('vimg_' + id) || 
                  localStorage.getItem('img_' + id) ||
                  localStorage.getItem('vimg_' + cleanId) || 
                  localStorage.getItem('img_' + cleanId) ||
                  localStorage.getItem('vimg_img_' + cleanId);
      
      if (val && val.startsWith('ref:')) {
        const refKey = val.replace('ref:', '');
        return localStorage.getItem(refKey) || 
               localStorage.getItem(refKey.toLowerCase()) || 
               localStorage.getItem(refKey.toUpperCase());
      }
      return val;
    } catch (e) { return null; }
  };

  const imgRegex = /\[\s*([^\]\s=]+)(?:\s*=\s*([^\]\s]*))?\s*([^\]]*)\](?:\s*(?:["']([^"']*)["']|\{([^}]*)\}))?/gi;

  p = p.replace(imgRegex, (match, tagOrId, idValue, attrs, overlayQ, overlayB) => {
      if (match.startsWith('__IMG_PLACEHOLDER_')) return match;
      
      const overlay = overlayQ || overlayB;
      let id = (idValue || tagOrId).trim();
      let finalAttrs = attrs || "";
      let savedSrc: string | null = null;

      const lowerTag = tagOrId.toLowerCase();
      const keywords = ['header', 'capa', 'banner', 'imagem', 'image', 'atm', 'atmosfera'];
      
      if (keywords.includes(lowerTag)) {
        if (contextImages && contextImages.length > 0) {
          let idx = 0;
          if (idValue && !isNaN(Number(idValue))) {
            idx = Number(idValue) - 1;
          }
          if (idx >= 0 && idx < contextImages.length) {
            const img = contextImages[idx];
            savedSrc = resolveImageRef(typeof img === 'string' ? img : img.src);
          }
        }
      }

      if (!savedSrc) {
        if (idValue) id = idValue;
        const lowerId = id.toLowerCase();
        
        if (['b', 'i', 'u', 's', 'c', '/b', '/i', '/u', '/s', '/c'].includes(lowerId)) return match;
        if (lowerId.length === 1 && 'biusc'.includes(lowerId)) return match;

        if (contextImages && contextImages.length > 0) {
            const contextMatch = contextImages.find(img => typeof img === 'object' && img !== null && img.id === id);
            if (contextMatch) {
                savedSrc = resolveImageRef(contextMatch.src);
            }
        }

        if (!savedSrc) {
            const cleanId = id.replace(/^(vimg_|img_)/i, '');
            const raw = tryGet(id) || tryGet(cleanId) || tryGet('vimg_' + cleanId) || tryGet('img_' + cleanId);
            savedSrc = resolveImageRef(raw || id);
        }
      }
      
      if (!savedSrc) return match; 
      
      let height = '';
      let pos = '';
      let width = '';
      let align = '';
      
      if (finalAttrs) {
        const hMatch = finalAttrs.match(/h=(\d+)/);
        const pMatch = finalAttrs.match(/p=(\d+)/);
        const wMatch = finalAttrs.match(/w=(\d+)/);
        const aMatch = finalAttrs.match(/a=([lcr])/);
        if (hMatch) {
          const hVal = Number(hMatch[1]);
          height = hVal > 1500 ? '1500' : hMatch[1];
        }
        if (pMatch) pos = pMatch[1];
        if (wMatch) {
          const wVal = Number(wMatch[1]);
          width = (wVal > 500 ? 500 : wVal).toString();
        }
        if (aMatch) align = aMatch[1];
      }
      
      const isHeaderKeyword = keywords.includes(lowerTag);
      const isTransparent = savedSrc.includes('image/png') || savedSrc.includes('image/webp');
      const defaultHeight = isHeaderKeyword ? '280px' : (overlay !== undefined ? '150px' : 'auto');
      const customHeight = height ? `${height}px` : defaultHeight;
      const customPos = pos ? `center ${pos}%` : 'center center';
      const customWidth = width ? `${width}%` : '100%';
      const borderStyle = isTransparent ? 'border: none;' : 'border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 0 20px rgba(0,0,0,0.5);';
      const renderStyleBase = `height: 100%; width: 100%; object-position: ${customPos}; image-rendering: auto; display: block;`;
      
      let imgHtml = "";
      const hasOverlayText = overlay && overlay.trim() !== "";
      if (overlay !== undefined && overlay !== null) {
        const formattedOverlay = formatTags(overlay.trim(), true);
        imgHtml = `<div class="relative rounded-2xl overflow-hidden flex items-center justify-center flex-1 min-w-0" style="height: ${customHeight}; ${width ? `max-width: ${customWidth};` : ''} ${borderStyle}">
                    <img src="${savedSrc}" loading="lazy" decoding="async" class="absolute inset-0 w-full h-full object-cover" style="${renderStyleBase}" />
                    ${hasOverlayText ? `
                    <div class="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
                       <div class="text-white font-syncopate font-black uppercase tracking-[0.2em] text-center text-[10px] leading-tight drop-shadow-lg">${formattedOverlay}</div>
                    </div>
                    ` : ''}
                  </div>`;
      } else {
        imgHtml = `<div class="flex-1 min-w-0" style="${width ? `max-width: ${customWidth};` : ''}">
                  <img src="${savedSrc}" loading="lazy" decoding="async" class="w-full rounded-2xl object-cover block" style="${renderStyleBase} ${borderStyle} height: ${customHeight};" />
                </div>`;
      }
      images.push({ html: imgHtml, align: align || 'c' });
      const viewerAttr = `onclick="window.showVoidImgViewer('${savedSrc.replace(/'/g, "\\'")}')" style="cursor: pointer;"`;
      return `<div ${viewerAttr}>__IMG_PLACEHOLDER_${images.length - 1}__</div>`;
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
      resultHtml += `<div class="w-full flex flex-wrap ${rowAlign} gap-3 my-4 leading-[0] m-0 p-0">${rowHtml}</div>`;
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
          src={img} 
          loading={i === 0 ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={i === 0 ? "high" : "low"}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out`}
          style={{ 
            opacity: i === index ? opacity : 0, 
            filter: filter, 
            imageRendering: 'high-quality',
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

const FormattedOutput: React.FC<{ text: string; className?: string; color?: string }> = ({ text, className, color }) => (
  <div className={className} dangerouslySetInnerHTML={{ __html: formatBioText(text, color) }} />
);

type FeedTab = 'feed' | 'noticias';

const FeedView: React.FC<FeedViewProps> = ({ 
  onBack, userAvatar, userName, posts, onAddPost, verifySafety, followedUsers = [], onDeletePost, onEditPost, isAppModerator
}) => {
  const [activeTab, setActiveTab] = useState<FeedTab>('feed');
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
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
  const [activePostMenuId, setActivePostMenuId] = useState<string | null>(null);
  const [activeModSubMenuId, setActiveModSubMenuId] = useState<string | null>(null);
  const [reportingPost, setReportingPost] = useState<FeedPost | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const handleStorageChange = () => setNow(Date.now());
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('void_storage_update', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('void_storage_update', handleStorageChange);
    };
  }, []);
  
  const [isCreatingNews, setIsCreatingNews] = useState(false);
  const [newsTitle, setNewsTitle] = useState('');
  const [newsContent, setNewsContent] = useState('');

  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      if (activeTab === 'feed') return post.tag !== 'NOTÍCIA' && post.tag !== 'SISTEMA'; 
      if (activeTab === 'noticias') return post.tag === 'NOTÍCIA' || post.tag === 'SISTEMA'; 
      return true;
    });
  }, [posts, activeTab]);

  const handleShare = (post: FeedPost) => {
    if (navigator.share) {
      navigator.share({
        title: post.title || 'Post Voidy',
        url: window.location.href
      });
    } else {
      alert("Link copiado.");
    }
    setActivePostMenuId(null);
  };

  const handleSave = (post: FeedPost) => {
    alert("Post salvo.");
    setActivePostMenuId(null);
  };

  const handleReport = (post: FeedPost) => {
    setReportingPost(post);
    setActivePostMenuId(null);
  };

  const submitReport = (reason: string) => {
    if (reportingPost) {
      alert(`Relatório enviado para análise: ${reason}`);
      setReportingPost(null);
    }
  };

  const handleEdit = (post: FeedPost) => {
    onEditPost?.(post);
    setSelectedPost(null);
    setIsWikiMenuOpen(false);
    setActivePostMenuId(null);
  };

  const handleDelete = (post: FeedPost) => {
    onDeletePost?.(post.id);
    setActivePostMenuId(null);
  };

  const handleAddNews = () => {
    if (!newsTitle.trim() || !newsContent.trim()) return;
    onAddPost({
      author: userName,
      avatar: userAvatar,
      title: newsTitle.toUpperCase(),
      content: newsContent,
      tag: 'NOTÍCIA',
      isFeatured: true
    });
    setNewsTitle('');
    setNewsContent('');
    setIsCreatingNews(false);
    alert("Transmissão oficial de notícia disparada.");
  };

  return (
    <div className="flex-1 h-full w-full bg-[#050714] relative overflow-hidden flex flex-col animate-in slide-in-from-right duration-500" onClick={() => { setActivePostMenuId(null); setActiveModSubMenuId(null); }}>
      {selectedPost && (
        <div className="fixed inset-0 z-[600] flex flex-col animate-in slide-in-from-bottom duration-500 font-inter text-white overflow-hidden" 
             style={{ 
               background: (selectedPost.tag === 'WIKI' || selectedPost.tag === 'WIKI_ENTRADA' || selectedPost.tag === 'BLOG')
                 ? (selectedPost.customBgColor || '#02040a')
                 : `linear-gradient(to bottom, ${selectedPost.customTopColor || '#1a2036'} 0%, ${selectedPost.customBgColor || '#02040a'} 100%)` 
             }}>
          
          <div className={`absolute inset-0 z-0 pointer-events-none overflow-hidden ${(selectedPost.tag === 'WIKI' || selectedPost.tag === 'WIKI_ENTRADA' || selectedPost.tag === 'BLOG') ? 'hidden' : ''}`}>
             {selectedPost.customBgImage && (
               <div className="absolute inset-0 w-full h-full">
                  <img 
                    src={selectedPost.customBgImage} 
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-cover transition-all duration-500" 
                    style={{ 
                      opacity: (selectedPost.tag === 'WIKI' || selectedPost.tag === 'WIKI_ENTRADA' || selectedPost.tag === 'BLOG') ? 1 : getWallpaperOpacity(selectedPost.customBgColor || '#02040a'), 
                      filter: (selectedPost.tag === 'WIKI' || selectedPost.tag === 'WIKI_ENTRADA' || selectedPost.tag === 'BLOG') ? 'brightness(1.1)' : getWallpaperFilter(selectedPost.customBgColor || '#02040a'),
                      imageRendering: 'high-quality',
                      WebkitOptimizeContrast: 'initial',
                      transform: 'translateZ(0) scale(1.02)'
                    }} 
                    alt="Post Bg" 
                  />
                  <div className="absolute inset-0 z-10" style={{ background: (selectedPost.tag === 'WIKI' || selectedPost.tag === 'WIKI_ENTRADA' || selectedPost.tag === 'BLOG') ? 'transparent' : `linear-gradient(to bottom, ${selectedPost.customTopColor || '#1a2036'} 0%, transparent 20%, transparent 80%, ${selectedPost.customBgColor || '#02040a'} 100%)` }}></div>
               </div>
             )}
          </div>

          <div className="relative z-10 w-full h-full flex flex-col overflow-hidden">
            {(selectedPost.tag === 'WIKI' || selectedPost.tag === 'WIKI_ENTRADA' || selectedPost.tag === 'BLOG') && (
              <header 
                className="relative px-6 py-4 flex items-center justify-between z-50 border-b border-white/10"
                style={{ backgroundColor: `${selectedPost.customTopColor || '#1a2036'}CC`, backdropFilter: 'blur(12px)' }}
              >
                <button onClick={() => setSelectedPost(null)} className="p-2 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all active:scale-90 border border-white/10">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
                </button>
                
                {selectedPost.author === userName && (
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
                        {(selectedPost.tag === 'WIKI' || selectedPost.tag === 'WIKI_ENTRADA') ? (
                          <button 
                            onClick={() => handleEdit(selectedPost)}
                            className="w-full px-4 py-3 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-cyan-400 hover:bg-white/5 transition-all border-b border-white/5"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            Editar Wiki
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleEdit(selectedPost)}
                            className="w-full px-4 py-3 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-cyan-400 hover:bg-white/5 transition-all border-b border-white/5"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                            Editar Blog
                          </button>
                        )}
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
              {(selectedPost.tag === 'WIKI' || selectedPost.tag === 'WIKI_ENTRADA' || selectedPost.tag === 'BLOG') ? (
                <main className="flex-1 overflow-y-auto no-scrollbar bg-transparent text-white animate-in fade-in duration-700">
                  <div className="fixed inset-0 z-0 pointer-events-none">
                      {selectedPost.customBgImage && (
                        <img 
                          src={resolveImageRef(selectedPost.customBgImage)} 
                          className="absolute inset-0 w-full h-full object-cover opacity-80" 
                          style={{ filter: 'brightness(1.1)', imageRendering: 'high-quality' }} 
                        />
                      )}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-[#02040a]" />
                  </div>
                  <div className="relative z-10 w-full h-[320px] overflow-hidden">
                    <SlideshowWallpaper 
                      images={(selectedPost.customGallery && selectedPost.customGallery.length > 0) ? selectedPost.customGallery : (selectedPost.galleryImages && selectedPost.galleryImages.length > 0 ? selectedPost.galleryImages : (selectedPost.customBgImage || selectedPost.avatar ? [selectedPost.customBgImage || selectedPost.avatar] : []))} 
                      color={selectedPost.customTopColor || '#02040a'} 
                      opacity={selectedPost.hideTopOverlay || selectedPost.customHideOverlay ? 1 : 0.95} 
                      filter="brightness(1.1)" 
                      noGradient={selectedPost.hideTopOverlay || selectedPost.customHideOverlay} 
                      bottomColor="transparent"
                    />
                    <div className="absolute inset-0 flex items-center justify-center pt-20">
                      <div className="w-44 h-44 rounded-[3rem] border-[4px] border-white/10 p-1 bg-[#02040a] shadow-[0_0_60px_rgba(255,255,255,0.1)] overflow-hidden">
                        <img src={resolveImageRef(selectedPost.customAvatar || selectedPost.avatar)} className="w-full h-full object-cover rounded-[2.5rem]" />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 md:p-10 space-y-12 max-w-3xl mx-auto pb-60 bg-black/40 backdrop-blur-sm rounded-[3rem] mt-10 border border-white/5 text-left relative z-[20]">
                    <div className="text-center space-y-2">
                       {(() => {
                          const titleColor = getAutoContrastHex(selectedPost.customTopColor || '#1a2036');
                          const isTitleDark = hexToHsla(titleColor).l < 30;
                          return (
                            <h1 
                              className={`text-4xl md:text-6xl font-syncopate font-black uppercase tracking-tighter break-words w-full ${isTitleDark ? '' : 'drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]'}`}
                              style={{ color: titleColor }}
                            >
                              {selectedPost.title || (selectedPost.tag === 'BLOG' ? 'SEM_TÍTULO' : 'NOME_DO_REGISTRO')}
                            </h1>
                          );
                       })()}
                      <div className="w-20 h-1 bg-gradient-to-r from-transparent via-white/40 to-transparent mx-auto rounded-full"></div>
                      
                      {selectedPost.tag !== 'BLOG' && selectedPost.customKeywords && (
                        <div className="flex flex-wrap justify-center gap-3 pt-0 opacity-40">
                          {selectedPost.customKeywords.split(',').map(tag => (
                            <span key={tag} className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[7px] font-black uppercase tracking-widest">#{tag.trim()}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {selectedPost.tag !== 'BLOG' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {selectedPost.customInfoRows && selectedPost.customInfoRows.map((row, i) => row.label && row.value && (
                          <div key={i} className="bg-white/[0.03] border border-white/5 p-6 rounded-[2.2rem] flex flex-col gap-1.5 shadow-xl transition-all hover:bg-white/[0.05]">
                             <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full w-fit bg-white/5" style={{ color: getAutoContrastHex(selectedPost.customTopColor || '#1a2036'), opacity: 0.7 }}>{row.label}</span>
                            {row.type === 'rating_star' || row.type === 'rating_heart' ? (
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map(v => (
                                  <span key={v} className={`${Number(row.value) >= v ? 'text-cyan-400' : 'text-white/10'}`}>
                                    {row.type === 'rating_star' ? <StarIcon active={Number(row.value) >= v} className="w-3 h-3" /> : <HeartIcon active={Number(row.value) >= v} className="w-3 h-3" />}
                                  </span>
                                ))}
                              </div>
                            ) : (
                               <span className="text-sm font-bold uppercase tracking-widest" style={{ color: getAutoContrastHex(selectedPost.customTopColor || '#1a2036') }}>{row.value}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="pt-12 border-t border-white/5 relative text-left">
                      <div className="absolute -top-3.5 left-6 px-6 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-[10px] font-black text-white/70 uppercase tracking-widest shadow-lg">
                        {selectedPost.tag === 'BLOG' ? 'Transmissão Blog' : 'Registro de Informações'}
                      </div>
                      <div className="text-[15px] font-medium leading-relaxed px-1 w-full" style={{ color: selectedPost.tag === 'BLOG' ? (selectedPost.customTextColor || '#cbd5e1') : getAutoContrastHex(selectedPost.customTopColor || '#1a2036') }} dangerouslySetInnerHTML={{ __html: formatBioText(selectedPost.tag === 'BLOG' ? selectedPost.content : getWikiNarrative(selectedPost.content), undefined, [...(selectedPost.customTopImages || []), ...(selectedPost.galleryImages || [])]) }} />

                      {/* Imagens Salvas / Acervo Visual Section */}
                      {((selectedPost.tag === 'BLOG' && selectedPost.customGallery && selectedPost.customGallery.length > 0) || (selectedPost.tag !== 'BLOG' && selectedPost.customTopImages && selectedPost.customTopImages.length > 0)) && (() => {
                        const galleryContrast = getAutoContrastHex(selectedPost.customTopColor || '#1a2036');
                        const isBgLight = hexToHsla(galleryContrast).l < 40;
                        const neumorphicHeader = isBgLight ? { boxShadow: '-4px -4px 10px #ffffff, 4px 4px 10px #aeaec040' } : { boxShadow: 'inset -2px -2px 5px rgba(255,255,255,0.05), inset 2px 2px 5px rgba(0,0,0,0.3)' };
                        const imagesToRender = selectedPost.tag === 'BLOG' ? selectedPost.customGallery : selectedPost.customTopImages;
                        
                        return (
                          <div className="pt-8 space-y-4">
                            <div className="flex flex-col gap-4">
                              <div className="flex items-center gap-3 px-2">
                                 <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_#22d3ee]"></div>
                                 <h4 className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full ${isBgLight ? 'bg-black/[0.03]' : 'bg-white/5'}`} style={{ color: galleryContrast, opacity: 0.8, ...neumorphicHeader }}>
                                   {selectedPost.tag === 'BLOG' ? 'Acervo Visual' : 'Imagens Salvas'}
                                 </h4>
                              </div>
                              <div className={`h-px w-full ${isBgLight ? 'bg-black/5' : 'bg-white/10'}`} />
                            </div>
                            
                            <div className={`w-full overflow-hidden rounded-[2rem] p-4 ${isBgLight ? 'bg-[#f0f0f3] shadow-[inset_-8px_-8px_20px_#ffffff,inset_8px_8px_20px_#aeaec040]' : 'bg-black/20 shadow-[inset_-4px_-4px_12px_rgba(255,255,255,0.05),inset_4px_4px_12px_rgba(0,0,0,0.4)] border border-white/5'}`}>
                              <div className="flex gap-4 overflow-x-auto no-scrollbar w-full pb-2 px-1">
                                {imagesToRender.map((imgObj: any, i: number) => {
                                  const src = resolveImageRef(typeof imgObj === 'string' ? imgObj : imgObj.src) || (typeof imgObj === 'string' ? imgObj : imgObj.src) || '';
                                  return (
                                    <div 
                                      key={i} 
                                      onClick={() => setSelectedFullImage(src)}
                                      className={`aspect-video w-48 shrink-0 rounded-2xl overflow-hidden cursor-pointer hover:scale-[1.02] transition-all text-left ${isBgLight ? 'bg-white shadow-[-8px_-8px_20px_#ffffff,8px_8px_20px_#aeaec040]' : 'bg-black/40 border border-white/10 shadow-xl'}`}
                                    >
                                      <img src={src} className="w-full h-full object-cover" alt={`Gallery Image ${i}`} />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="pt-4 -mx-4 md:-mx-10 mt-6">
                        {(() => {
                           const creatorContrast = getAutoContrastHex(selectedPost.customTopColor || '#1a2036');
                           const isBgLight = hexToHsla(creatorContrast).l < 40;
                           
                           return (
                             <>
                                <div className={`h-[0.5px] w-full mb-4 ${isBgLight ? 'bg-black/5' : 'bg-white/10'}`} />
                                <div className="flex items-center self-start relative">
                                   <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-10 rounded-full z-10" style={{ backgroundColor: creatorContrast, opacity: 0.2 }} />
                                   <div className="flex items-center gap-2 px-3 h-7 rounded-r-xl bg-white/5 border border-white/5 ml-[1px] relative z-0 backdrop-blur-md shadow-xl">
                                      <div className="w-5 h-5 rounded-md border border-white/10 overflow-hidden shadow-lg shrink-0">
                                         <img src={resolveImageRef(selectedPost.avatar) || ''} className="w-full h-full object-cover" alt="Author" />
                                      </div>
                                      <div className="flex flex-col select-none leading-none pb-0.5">
                                         <span className="text-[5px] font-black uppercase tracking-widest opacity-40" style={{ color: creatorContrast }}>{selectedPost.tag === 'BLOG' ? 'PUBLICADO POR' : 'REGISTRADO POR'}</span>
                                         <span className="text-[10px] font-black tracking-widest leading-none mt-0.5" style={{ color: creatorContrast }}>{selectedPost.author}</span>
                                      </div>
                                   </div>
                                </div>
                             </>
                           );
                        })()}
                      </div>

                      {/* Fluxo de Pensamentos / Sinais de Consciência (Comments) Section */}
                      {(() => {
                        const commentsContrast = getAutoContrastHex(selectedPost.customTopColor || '#1a2036');
                        const isBgLight = hexToHsla(commentsContrast).l < 40;
                        const neumorphicHeader = isBgLight ? { boxShadow: '-5px -5px 15px #ffffff, 5px 5px 15px #aeaec040' } : {};
                        return (
                          <div className="pt-4 border-t border-white/5 space-y-6">
                            <div className="flex flex-col gap-4 mt-1">
                              <div className="flex items-center gap-3 px-2">
                                 <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_#22d3ee] animate-pulse"></div>
                                 <div className={`px-4 py-1.5 rounded-full ${isBgLight ? 'bg-black/[0.03]' : 'bg-white/5'}`} style={neumorphicHeader}>
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80" style={{ color: isBgLight ? '#000000' : commentsContrast }}>
                                      {selectedPost.tag === 'BLOG' ? 'Sinais de Consciência' : 'Fluxo de Pensamentos'}
                                    </h4>
                                 </div>
                              </div>
                              <div className={`h-px w-full ${isBgLight ? 'bg-black/5' : 'bg-white/5'}`} />
                            </div>

                            {/* Comment Input */}
                            <div className="px-2">
                              <div className={`flex gap-3 items-center border rounded-2xl p-2 transition-all ${isBgLight ? 'bg-black/[0.03] border-black/5 focus-within:border-black/20' : 'bg-white/5 border-white/10 focus-within:border-cyan-500/50'}`}>
                                <img src={resolveImageRef(userAvatar) || ''} loading="lazy" decoding="async" className="w-8 h-8 rounded-full border border-white/10" alt="Me" />
                                <input 
                                  type="text" 
                                  placeholder="Adicionar ao fluxo..." 
                                  className={`flex-1 bg-transparent border-none outline-none text-[14px] ${isBgLight ? 'text-black placeholder:text-black/40' : 'text-white placeholder:text-slate-500'}`}
                                />
                                <button className="p-2 text-cyan-500 hover:text-cyan-400 transition-colors">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                                </button>
                              </div>
                            </div>

                            <div className="space-y-4 pb-10">
                              {(!selectedPost.comments || selectedPost.comments.length === 0) ? (
                                <div className="flex flex-col items-center justify-center py-10 opacity-30">
                                  <span className="text-3xl mb-4 grayscale">📡</span>
                                  <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: commentsContrast }}>Aguardando Sinais de Consciência</p>
                                </div>
                              ) : (
                                selectedPost.comments.map((comment: any, idx: number) => (
                                  <div key={idx} className="flex gap-4 px-2 items-start animate-in slide-in-from-left duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                                    <div className="w-8 h-8 rounded-full border border-white/10 overflow-hidden bg-slate-900 shrink-0 shadow-md">
                                      <img src={resolveImageRef(comment.avatar) || ''} loading="lazy" decoding="async" className="w-full h-full object-cover" alt={comment.author} />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest">{comment.author}</span>
                                        <span className="text-[6px] font-bold uppercase tracking-widest" style={{ color: commentsContrast, opacity: 0.5 }}>{new Date(comment.timestamp).toLocaleDateString()}</span>
                                      </div>
                                      <p className={`text-[14px] leading-relaxed ${isBgLight ? 'text-black/80' : 'text-slate-300'}`}>{comment.text || comment.content}</p>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </main>
              ) : (
                <div className="relative">
                  <div className="sticky top-0 h-[460px] z-[5] overflow-hidden pointer-events-none" style={{ WebkitMaskImage: 'linear-gradient(to bottom, black 65%, transparent 100%)', maskImage: 'linear-gradient(to bottom, black 65%, transparent 100%)' }}>
                     {selectedPost.customTopImage && ( <img src={resolveImageRef(selectedPost.customTopImage)} loading="eager" decoding="async" fetchPriority="high" className="w-full h-full object-cover 4k-texture transition-all duration-500" style={{ opacity: getWallpaperOpacity(selectedPost.customTopColor || '#1a2036'), filter: getWallpaperFilter(selectedPost.customTopColor || '#1a2036') }} /> )}
                     <div className="absolute inset-0 z-10" style={{ background: selectedPost.hideTopOverlay ? 'transparent' : `linear-gradient(to bottom, ${(selectedPost.customTopColor || '#1a2036') + 'B3'} 0%, transparent 35%, transparent 75%, ${selectedPost.customBgColor || '#02040a'} 100%)` }}></div>
                  </div>

                  <div className="relative z-10 -mt-[460px] flex flex-col min-h-screen">
                    <header className="px-6 py-6 flex items-center justify-between shrink-0 pointer-events-auto">
                       <button onClick={() => setSelectedPost(null)} className="p-2 bg-black/50 backdrop-blur-md rounded-xl text-white border border-white/20 active:scale-90 transition-all"><svg className="w-5 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg></button>
                       <div className="flex flex-col items-center"><span className="text-[10px] font-black text-white uppercase tracking-[0.4em] drop-shadow-md">{selectedPost.author}</span></div>
                       <div className="flex items-center gap-2">
                         <button className="p-2 bg-black/50 backdrop-blur-md rounded-xl text-white border border-white/20 active:scale-90 transition-all flex items-center gap-2">
                           <svg className={`w-5 h-5 transition-all ${selectedPost.likedBy?.includes(userName) ? 'text-pink-500 drop-shadow-[0_0_8px_pink]' : 'text-white/60'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                           <span className="text-[10px] font-black">{selectedPost.likes}</span>
                         </button>
                         <div className="relative">
                            <button 
                              onClick={(e) => { e.stopPropagation(); setActivePostMenuId(activePostMenuId === selectedPost.id ? null : selectedPost.id); setActiveModSubMenuId(null); }}
                              className={`p-2 bg-black/50 backdrop-blur-md rounded-xl transition-all border border-white/20 ${activePostMenuId === selectedPost.id ? 'bg-cyan-500 text-black' : 'text-white/60'}`}
                            >
                               <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2 s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2 s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
                            </button>
                            {activePostMenuId === selectedPost.id && (
                              <div className="absolute top-12 right-0 w-44 bg-[#0a0c1a]/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-[700] animate-in zoom-in-95 duration-200">
                                 {(selectedPost.author === userName || isAppModerator) && (
                                   <>
                                     <button onClick={(e) => { e.stopPropagation(); handleDelete(selectedPost); }} className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-red-500/10 transition-colors">
                                       <span className="text-red-500 text-sm">🗑️</span>
                                       <span className="text-[9px] font-black uppercase text-red-500">Apagar</span>
                                     </button>
                                   </>
                                 )}
                                 <button onClick={(e) => { e.stopPropagation(); handleShare(selectedPost); }} className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-white/5 transition-colors">
                                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="18" cy="5" r="3" />
                                    <circle cx="6" cy="12" r="3" />
                                    <circle cx="18" cy="19" r="3" />
                                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                                  </svg>
                                   <span className="text-[9px] font-black uppercase text-white">Compartilhar</span>
                                 </button>
                                 <button onClick={(e) => { e.stopPropagation(); handleReport(selectedPost); }} className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-white/5 transition-colors border-t border-white/5">
                                   <span className="text-white text-sm">⚠️</span>
                                   <span className="text-[9px] font-black uppercase text-white">Denunciar</span>
                                 </button>
                                 <button onClick={(e) => { e.stopPropagation(); handleSave(selectedPost); }} className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-white/5 transition-colors border-t border-white/5">
                                   <span className="text-white text-sm">💾</span>
                                   <span className="text-[9px] font-black uppercase text-white">Salvar</span>
                                 </button>
                              </div>
                            )}
                         </div>
                       </div>
                    </header>

                    <main className="flex-1 p-8 pt-10 space-y-8 pb-48 pointer-events-auto">
                       <div className="max-w-2xl mx-auto space-y-6">
                          <h1 className="text-3xl font-black uppercase tracking-tight leading-none text-shadow-lg" style={{ color: getAutoContrastHex(selectedPost.customTopColor || '#1a2036') }}>{selectedPost.title}</h1>
                          <div className="space-y-4 text-[14px] leading-relaxed font-medium" style={{ color: getAutoContrastHex(selectedPost.customBgColor || '#02040a') }}>
                             <FormattedOutput text={selectedPost.content} color={getAutoContrastHex(selectedPost.customBgColor || '#02040a')} />

                             <div className="pt-8 flex flex-col items-start gap-4 ml-6">
                             <div className="flex items-center self-start relative">
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-10 bg-slate-500/30 rounded-full z-10" />
                                <div className="flex items-center gap-2 bg-white/[0.02] border border-white/5 px-3 h-7 rounded-r-lg ml-[1px] relative z-0 backdrop-blur-md shadow-xl">
                                   <div className="w-5 h-5 rounded-md border border-white/10 overflow-hidden shrink-0 shadow-lg">
                                      <img 
                                        src={resolveImageRef(selectedPost.avatar)} 
                                        loading="lazy"
                                        decoding="async"
                                        className="w-full h-full object-cover" 
                                        alt="Author" 
                                      />
                                   </div>
                                   <div className="flex flex-col select-none leading-none pb-0.5">
                                      <span className="text-[4px] font-black text-slate-600 uppercase tracking-[0.2em] opacity-40">REGISTRADO POR</span>
                                      <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none mt-0.5">{selectedPost.author}</span>
                                   </div>
                                </div>
                             </div>
                             </div>
                             {selectedPost.images && selectedPost.images.length > 0 && (<div className="grid grid-cols-1 gap-6 mt-8">{selectedPost.images.map((img, i) => (<img key={i} src={resolveImageRef(img)} loading="lazy" decoding="async" className="w-full rounded-[2rem] border border-white/10 shadow-2xl" alt="Post Content" />))}</div>)}
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

      {reportingPost && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setReportingPost(null)} />
           <div className="relative w-full max-w-[320px] bg-[#0a0c1a] border border-red-500/40 rounded-[2.5rem] p-8 shadow-[0_0_50px_rgba(239,68,68,0.2)] flex flex-col items-center gap-6 animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-3xl">⚠️</div>
              <div className="text-center space-y-1">
                 <h3 className="text-sm font-syncopate font-black text-red-500 uppercase tracking-widest">Sinalizar Dissonância</h3>
                 <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Selecione o motivo da denúncia</p>
              </div>
              <div className="flex flex-col w-full gap-2">
                 {[
                   'Spam ou Inundação de Dados',
                   'Discurso de Ódio / Preconceito',
                   'Conteúdo Impróprio (NSFW)',
                   'Assédio ou Comportamento Hostil',
                   'Violação das Diretrizes do Setor'
                 ].map(reason => (
                    <button 
                      key={reason} 
                      onClick={() => submitReport(reason)}
                      className="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[9px] font-black uppercase text-slate-300 hover:text-red-400 hover:border-red-500/40 transition-all active:scale-95"
                    >
                      {reason}
                    </button>
                 ))}
              </div>
              <button onClick={() => setReportingPost(null)} className="text-[8px] font-black text-slate-600 uppercase tracking-widest hover:text-white transition-colors">Cancelar</button>
           </div>
        </div>
      )}

      <header className="px-6 py-10 flex flex-col gap-8 shrink-0 z-10">
        <div className="flex items-center justify-between">
           <button onClick={onBack} className="p-3 bg-white/5 rounded-2xl text-slate-400 hover:text-white transition-all active:scale-90 border border-white/5">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
           </button>
           <h2 className="text-2xl font-syncopate font-black text-white uppercase tracking-[0.3em]">Feed</h2>
           <div className="w-12"></div>
        </div>
        
        <div className="flex bg-white/[0.03] p-1 rounded-full border border-white/5 mx-auto overflow-x-auto no-scrollbar max-w-full">
           {(['feed', 'noticias'] as FeedTab[]).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`px-8 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab ? 'bg-white text-black shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>{tab === 'feed' ? 'Transmissões' : 'Notícias'}</button>
           ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6 pb-40">
         {isAppModerator && !isCreatingNews && (
            <button 
              onClick={() => setIsCreatingNews(true)}
              className="w-full py-6 rounded-[2rem] bg-cyan-500 text-black font-black text-[10px] uppercase tracking-[0.4em] shadow-[0_0_30px_rgba(34,211,238,0.2)] active:scale-95 transition-all border-2 border-cyan-400/50 flex items-center justify-center gap-3"
            >
               <span>📢</span> Lançar Notícia Oficial
            </button>
         )}

         {isCreatingNews && (
            <div className="bg-[#0a0c1a] border-2 border-cyan-500/40 rounded-[2.5rem] p-6 space-y-4 animate-in slide-in-from-top duration-500">
               <div className="flex justify-between items-center mb-2">
                  <h3 className="text-[9px] font-black text-cyan-400 uppercase tracking-[0.3em]">Editor de Transmissão Oficial</h3>
                  <button onClick={() => setIsCreatingNews(false)} className="text-slate-500">✕</button>
               </div>
               <input 
                  value={newsTitle} 
                  onChange={(e) => setNewsTitle(e.target.value)} 
                  placeholder="TÍTULO DA NOTÍCIA..." 
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs font-black text-white uppercase outline-none focus:border-cyan-500"
               />
               <textarea 
                  value={newsContent} 
                  onChange={(e) => setNewsContent(e.target.value)} 
                  placeholder="Descreva o comunicado oficial para a rede..." 
                  className="w-full h-32 bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-slate-300 outline-none focus:border-cyan-500 resize-none"
               />
               <button 
                  onClick={handleAddNews}
                  disabled={!newsTitle.trim() || !newsContent.trim()}
                  className="w-full py-4 bg-cyan-600 text-white rounded-2xl font-black text-[9px] uppercase tracking-[0.2em] shadow-lg disabled:opacity-30"
               >
                  Transmitir para Global
               </button>
            </div>
         )}

         {filteredPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 opacity-20">
               <span className="text-4xl mb-4">📡</span>
               <p className="text-[10px] font-black uppercase tracking-[0.4em]">Frequência Silenciosa</p>
            </div>
         ) : (
            filteredPosts.map(post => (
              <div key={post.id} onClick={() => setSelectedPost(post)} className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 cursor-pointer hover:bg-white/[0.04] transition-all animate-in slide-in-from-bottom duration-500 overflow-hidden relative group" style={{ backgroundColor: post.customBgColor || undefined }}>
                  {(post.tag === 'WIKI' || post.tag === 'WIKI_ENTRADA') && post.customBgImage && (
                    <div className="absolute inset-0 z-0 pointer-events-none">
                      <img src={resolveImageRef(post.customBgImage)} loading="lazy" decoding="async" className="w-full h-full object-cover opacity-20" alt="Wiki Background" />
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#02040a]/80" />
                    </div>
                  )}
                  {(post.tag === 'WIKI' || post.tag === 'WIKI_ENTRADA' || post.tag === 'BLOG') ? (
                    <div className="flex flex-col relative z-10">
                      {/* Banner */}
                      <div className="h-32 -mx-6 -mt-6 mb-4 relative overflow-hidden">
                        {(() => {
                          const getInitialImages = () => {
                            const getFirst = (arr?: (string | {src: string})[]) => {
                              if (!arr || arr.length === 0) return null;
                              const item = arr[0];
                              return typeof item === 'string' ? item : (item as any)?.src || null;
                            };

                            const found = getFirst(post.customGallery) || 
                                          getFirst(post.galleryImages) || 
                                          getFirst(post.customTopImages) || 
                                          getFirst(post.customBgImages) || 
                                          (post.images && post.images.length > 0 ? post.images[0] : null) ||
                                          post.customBgImage ||
                                          post.customTopImage ||
                                          (post.content.match(/\[(img_[a-z0-9]+|vimg_[a-z0-9]+)/i)?.[1]) ||
                                          null;
                            return found ? [found] : [];
                          };
                          
                          const imagesToUse = getInitialImages();
                          
                          return (
                            <SlideshowWallpaper 
                              images={imagesToUse.map((img: any) => resolveImageRef(typeof img === 'string' ? img : img.src) || '')} 
                              color={post.customTopColor || '#1a2036'} 
                              opacity={0.9} 
                              filter="none" 
                            />
                          );
                        })()}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#02040a] to-transparent opacity-60" />
                      </div>
                      
                      <div className="flex gap-4 relative z-10 -mt-12 mb-2">
                        {/* Foto de Registro */}
                        <div className="w-16 h-16 rounded-2xl border-2 border-white/20 overflow-hidden shadow-2xl bg-[#02040a] shrink-0">
                          <img src={resolveImageRef(post.customAvatar || post.avatar)} loading="lazy" decoding="async" className="w-full h-full object-cover" alt="Registro" />
                        </div>
                        <div className="flex flex-col justify-end pb-1">
                          <h5 className="text-[11px] font-black text-white uppercase tracking-widest">{post.title}</h5>
                          <span className="text-[6px] font-black text-cyan-500 uppercase tracking-[0.2em]">{post.tag === 'BLOG' ? 'SINAL BLOG' : 'REGISTRO WIKI'}</span>
                        </div>
                      </div>

                      {/* Semi-transparent content preview */}
                      <div className="flex flex-col mb-3">
                        <div className="text-[8px] font-medium leading-relaxed opacity-40 line-clamp-3" style={{ color: getAutoContrastHex(post.customBgColor || '#02040a') }} dangerouslySetInnerHTML={{ __html: formatBioText(post.tag === 'BLOG' ? post.content : getWikiNarrative(post.content), undefined, [...(post.customTopImages || []), ...(post.galleryImages || []), ...(post.customGallery || [])]) }} />
                        
                        {/* Rating Preview */}
                        {(post.tag !== 'BLOG') && post.customInfoRows && post.customInfoRows.some(r => r.type === 'rating_star' || r.type === 'rating_heart') && (
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
                        <span className="text-[6px] font-black text-cyan-500/50 uppercase tracking-widest">{post.tag === 'BLOG' ? 'TRANSMISSÃO BLOG' : 'WIKI MESTRE'}</span>
                        <span className="text-[6px] font-bold text-slate-600 uppercase">{post.time}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                           <img src={resolveImageRef(post.avatar)} loading="lazy" decoding="async" className="w-10 h-10 rounded-full border border-white/10" alt={post.author} />
                           <div className="flex flex-col">
                              <span className="text-xs font-black text-white uppercase tracking-tight">{post.author}</span>
                              <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">{post.time} • {post.tag}</span>
                           </div>
                        </div>
                        <div className="relative">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setActivePostMenuId(activePostMenuId === post.id ? null : post.id); setActiveModSubMenuId(null); }}
                            className={`p-1 rounded-full transition-all ${activePostMenuId === post.id ? 'bg-cyan-500 text-black' : 'text-slate-500 hover:text-white'}`}
                          >
                             <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2 s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2 s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
                          </button>
                          {activePostMenuId === post.id && (
                            <div className="absolute top-10 right-0 w-44 bg-[#0a0c1a]/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-[100] animate-in zoom-in-95 duration-200">
                               {(post.author === userName || isAppModerator) && (
                                 <>
                                   {(post.tag === 'WIKI' || post.tag === 'WIKI_ENTRADA') && post.author === userName && (
                                     <button onClick={(e) => { e.stopPropagation(); handleEdit(post); }} className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-white/5 transition-colors border-b border-white/5">
                                       <span className="text-cyan-400 text-xs">📝</span>
                                       <span className="text-[9px] font-black uppercase text-cyan-400">Editar Wiki</span>
                                     </button>
                                   )}
                                   <button onClick={(e) => { e.stopPropagation(); handleDelete(post); }} className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-red-500/10 transition-colors">
                                     <span className="text-red-500 text-xs">🗑️</span>
                                     <span className="text-[9px] font-black uppercase text-red-500">Apagar</span>
                                   </button>
                                 </>
                               )}
                               <button onClick={(e) => { e.stopPropagation(); handleShare(post); }} className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-white/5 transition-colors">
                                 <span className="text-white text-xs">📡</span>
                                 <span className="text-[9px] font-black uppercase text-white">Compartilhar</span>
                               </button>
                               <button onClick={(e) => { e.stopPropagation(); handleReport(post); }} className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-white/5 transition-colors border-t border-white/5">
                                 <span className="text-white text-xs">⚠️</span>
                                 <span className="text-[9px] font-black uppercase text-white">Denunciar</span>
                               </button>
                               <button onClick={(e) => { e.stopPropagation(); handleSave(post); }} className="w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-white/5 transition-colors border-t border-white/5">
                                 <span className="text-white text-sm">💾</span>
                                 <span className="text-[9px] font-black uppercase text-white">Salvar</span>
                               </button>
                            </div>
                          )}
                        </div>
                     </div>
                     {post.title && <h3 className="text-lg font-black text-white uppercase mb-2 tracking-tight">{post.title}</h3>}
                     <div className="text-sm text-slate-400 line-clamp-3 leading-relaxed">
                       <FormattedOutput text={post.content.substring(0, 300) + (post.content.length > 300 ? '...' : '')} />
                     </div>
                     <div className="mt-4 flex items-center gap-6 opacity-60">
                        <div className="flex items-center gap-1.5"><span className="text-pink-500">❤️</span><span className="text-[10px] font-bold text-slate-500">{post.likes}</span></div>
                        <div className="flex items-center gap-1.5"><span className="text-cyan-500">💬</span><span className="text-[10px] font-bold text-slate-500">{post.comments?.length || 0}</span></div>
                     </div>
                    </>
                  )}
               </div>
             ))
          )}
       </div>
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
    </div>
  );
};

export default FeedView;
