
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FeedPost, PostComment } from '../types';

interface BlogCreationProps {
  onBack: () => void;
  onCreate: (post: FeedPost) => void;
  userName: string;
  userAvatar: string;
  verifySafety?: (content: string, type?: 'image' | 'text') => Promise<boolean>;
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
  let p = text;
  const tagRegex = /\[([cbisuBCISU]+)\](.*?)(\[\/\1\]|$)/gi;
  let oldP;
  do {
    oldP = p;
    p = p.replace(tagRegex, (match, tags, content) => {
      let res = content;
      const t = tags.toLowerCase();
      if (t.includes('i')) res = `<em class="italic not-italic-fix" style="opacity: 0.9;">${res}</em>`;
      if (t.includes('b')) res = `<strong class="font-black ${isOverlay ? 'text-[1.25em] inline-block' : ''}">${res}</strong>`;
      if (t.includes('u')) res = `<span class="underline">${res}</span>`;
      if (t.includes('s')) res = `<span class="line-through opacity-60">${res}</span>`;
      if (t.includes('c')) res = `<div style="text-align: center; width: 100%; display: block; margin: 2px 0;">${res}</div>`;
      return res;
    });
  } while (p !== oldP);
  return p;
};

const formatBioText = (text: string) => {
  if (!text) return "";
  return text.split('\n').map(line => {
    let p = line;
    const imgRegex = /\[(img_[a-z0-9]+)(?:\s+h=(\d+))?(?:\s+p=(\d+))?(?:\s+w=(\d+))?(?:\s+a=([lcr]))?\]\s*(?:"([^"]*)")?/gi;
    const images: { html: string, align: string }[] = [];
    p = p.replace(imgRegex, (match, id, height, pos, width, align, overlay) => {
      const savedSrc = localStorage.getItem('vimg_' + id);
      if (!savedSrc) return "";
      
      let finalHeight = height;
      if (finalHeight) {
        const hVal = Number(finalHeight);
        if (hVal > 1500) finalHeight = '1500';
      }
      
      let finalWidth = width;
      if (finalWidth) {
        const wVal = Number(finalWidth);
        if (wVal > 500) finalWidth = '500';
      }

      const isTransparent = savedSrc.includes('image/png') || savedSrc.includes('image/webp');
      const customHeight = finalHeight ? `${finalHeight}px` : (overlay !== undefined ? '150px' : 'auto');
      const customPos = pos ? `center ${pos}%` : 'center center';
      const customWidth = finalWidth ? `${finalWidth}%` : '100%';
      const borderStyle = isTransparent ? 'border: none; background: transparent; box-shadow: none;' : 'border: 1px solid rgba(255,255,255,0.1); background: transparent; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);';
      const renderStyleBase = `height: 100%; width: 100%; object-position: ${customPos}; image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; transform: translateZ(0); -webkit-backface-visibility: hidden; display: block;`;
      let imgHtml = "";
      if (overlay !== undefined && overlay.trim() !== "") {
        const formattedOverlay = formatTags(overlay, true);
        imgHtml = `<div class="relative rounded-2xl overflow-hidden flex items-center justify-center flex-1 min-w-0" style="height: ${customHeight}; ${finalWidth ? `max-width: ${customWidth};` : ''} ${borderStyle}">
                    <img src="${savedSrc}" class="absolute inset-0 w-full h-full object-cover" style="${renderStyleBase}" />
                    <div class="absolute inset-0 bg-black/15 flex items-center justify-center p-2">
                       <div class="text-white font-black uppercase tracking-[0.25em] text-center text-[8px] md:text-[10px] select-none leading-tight">${formattedOverlay}</div>
                    </div>
                  </div>`;
      } else {
        imgHtml = `<div class="flex-1 min-w-0" style="${finalWidth ? `max-width: ${customWidth};` : ''}">
                  <img src="${savedSrc}" class="w-full rounded-2xl object-cover block" style="${renderStyleBase} ${borderStyle} height: ${customHeight};" />
                </div>`;
      }
      images.push({ html: imgHtml, align: align || 'c' });
      return `__IMG_PLACEHOLDER_${images.length - 1}__`;
    });
    p = formatTags(p);
    
    // Grouping
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
        resultHtml += `<div class="w-full flex flex-wrap ${rowAlign} gap-2 my-2 leading-[0] m-0 p-0">${rowHtml}</div>`;
      }
      return resultHtml;
    });
    return `<div class="min-h-[1.2em] leading-tight mb-0 m-0 p-0">${p}</div>`;
  }).join('');
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

const saveToMediaStorage = (base64: string): string => {
  const id = `vimg_draft_${Math.random().toString(36).substring(2, 9)}`;
  try {
    localStorage.setItem(id, base64);
    return `ref:${id}`;
  } catch (e) {
    return base64; 
  }
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

const BlogCreation: React.FC<BlogCreationProps> = ({ onBack, onCreate, userName, userAvatar, verifySafety }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');
  const [showStyleHub, setShowStyleHub] = useState(false);
  
  // Style states
  const [topColor, setTopColor] = useState('#1a2036');
  const [feedColor, setFeedColor] = useState('#02040a');
  const [topImage, setTopImage] = useState<string | null>(null);
  const [feedImage, setFeedImage] = useState<string | null>(null);
  const [gallery, setGallery] = useState<{src: string, position: number}[]>([]);
  const [hideTopOverlay, setHideTopOverlay] = useState(false);

  const [activePicker, setActivePicker] = useState<{ field: string, label: string } | null>(null);
  const [pickerHsla, setPickerHsla] = useState({ h: 0, s: 100, l: 50, a: 1 });

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const topImageInputRef = useRef<HTMLInputElement>(null);
  const feedImageInputRef = useRef<HTMLInputElement>(null);
  const editorTextAreaRef = useRef<HTMLTextAreaElement>(null);

  const textColor = useMemo(() => getAutoContrastHex(feedColor), [feedColor]);
  const topTextColor = useMemo(() => getAutoContrastHex(topColor), [topColor]);

  useEffect(() => {
    const key = `void_draft_blog_${userName}`;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.title) setTitle(data.title);
        if (data.content) setContent(data.content);
        if (data.topColor) setTopColor(data.topColor);
        if (data.feedColor) setFeedColor(data.feedColor);
        if (data.topImage) setTopImage(data.topImage);
        if (data.feedImage) setFeedImage(data.feedImage);
        if (data.gallery) setGallery(data.gallery);
        if (data.hideTopOverlay !== undefined) setHideTopOverlay(data.hideTopOverlay);
      }
    } catch (e) {
      console.error("Failed to recover blog draft", e);
    }
  }, [userName]);

  useEffect(() => {
    const key = `void_draft_blog_${userName}`;
    const timeout = setTimeout(() => {
      try {
        const data = { title, content, topColor, feedColor, topImage, feedImage, gallery, hideTopOverlay };
        localStorage.setItem(key, JSON.stringify(data));
      } catch (e) {
        console.error("Failed to save blog draft", e);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [title, content, topColor, feedColor, topImage, feedImage, gallery, hideTopOverlay, userName]);

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
             setGallery(prev => [...prev, {src: savedRef, position: 50}]);
             if (!feedImage) setFeedImage(compressed);
             if (verifySafety) verifySafety(compressed).catch(console.error);
          } else {
             const savedRef = saveToMediaStorage(base64);
             setGallery(prev => [...prev, {src: savedRef, position: 50}]);
          }
        };
        img.onerror = () => { 
          const savedRef = saveToMediaStorage(base64);
          setGallery(prev => [...prev, {src: savedRef, position: 50}]); 
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    });
    target.value = '';
  };

  const handleImageInput = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const target = e.target;
    const file = target.files?.[0];
    if (file) {
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
              setter(compressedBase64);
              if (verifySafety) verifySafety(compressedBase64).catch(console.error);
            } else {
              setter(base64);
            }
          } catch (err) {
            console.error("Scale error", err);
            setter(base64);
          }
          target.value = '';
        };
        img.onerror = () => {
          setter(base64);
          target.value = '';
        };
        img.src = base64;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleInsertBioImage = (e: React.ChangeEvent<HTMLInputElement>, isBio: boolean) => {
    const target = e.target;
    const file = target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        const imgId = Math.random().toString(36).substring(2, 7);
        const fullId = `img_${imgId}`;
        try {
          localStorage.setItem('vimg_' + fullId, base64);
          if (!feedImage) setFeedImage(base64);
          setContent(prev => {
              const start = editorTextAreaRef.current?.selectionStart ?? prev.length;
              const end = editorTextAreaRef.current?.selectionEnd ?? start;
              const before = prev.substring(0, start);
              const after = prev.substring(end);
              return `${before}[${fullId} h=150 p=50 w=100 a=c] ""${after}`;
          });
          if (verifySafety) verifySafety(base64).catch(console.error);
        } catch (err) { alert("Erro ao gravar dados: Limite de armazenamento local excedido."); }
        target.value = '';
      };
      reader.readAsDataURL(file);
    }
  };

  const openPicker = (field: string, label: string, currentHex: string) => {
    setActivePicker({ field, label });
    const hsla = hexToHsla(currentHex === 'transparent' ? '#1a2036' : currentHex);
    setPickerHsla(hsla);
  };

  const updatePickerColor = (h: number, s: number, l: number, a: number) => {
    const newHex = hslaToHex(h, s, l, a);
    setPickerHsla({ h, s, l, a });
    if (activePicker?.field === 'top') setTopColor(newHex);
    else if (activePicker?.field === 'feed') setFeedColor(newHex);
  };

  const handleResetColor = (field: string) => {
    if (field === 'top') setTopColor('#1a2036');
    else if (field === 'feed') setFeedColor('#02040a');
    setActivePicker(null);
  };

  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) return;
    
    if (verifySafety) {
      const isTitleSafe = await verifySafety(title, 'text');
      if (!isTitleSafe) return;
      const isContentSafe = await verifySafety(content, 'text');
      if (!isContentSafe) return;
    }

    const newPost: FeedPost = {
      id: `blog-${Date.now()}`,
      author: userName,
      avatar: userAvatar,
      title: title.toUpperCase(),
      content: content,
      likes: 0,
      time: 'Agora',
      tag: 'BLOG',
      timestamp: Date.now(),
      comments: [],
      customTopColor: topColor,
      customBgColor: feedColor,
      customTopImage: topImage || undefined,
      customBgImage: feedImage || undefined,
      customBgType: feedImage ? 'image' : 'color',
      customGallery: gallery.length > 0 ? gallery : undefined,
      hideTopOverlay: hideTopOverlay
    };
    onCreate(newPost);
    localStorage.removeItem(`void_draft_blog_${userName}`);
  };

  return (
    <div className="fixed inset-0 z-[500] flex flex-col animate-in slide-in-from-bottom duration-500 overflow-hidden font-inter transition-colors duration-500" style={{ backgroundColor: feedColor === 'transparent' ? '#02040a' : feedColor }}>
      
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {feedImage && (
          <div className="absolute inset-0 w-full h-full bg-cover bg-center transition-all duration-500" style={{ backgroundImage: `url(${feedImage})`, WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black 320px)', maskImage: 'linear-gradient(to bottom, transparent 0px, black 320px)', opacity: getWallpaperOpacity(feedColor), filter: getWallpaperFilter(feedColor), imageRendering: 'high-quality' }} />
        )}
      </div>

      <div className="w-full min-h-full flex flex-col relative z-10">
        <div className="absolute top-0 inset-x-0 h-[460px] z-0 overflow-hidden transition-all duration-500" style={{ background: hideTopOverlay ? 'transparent' : `linear-gradient(to bottom, ${topColor === 'transparent' ? '#00000000' : topColor} 0%, ${topColor === 'transparent' ? '#00000000' : topColor} 30%, ${feedColor === 'transparent' ? '#00000000' : (feedColor === '#02040a' ? '#000' : feedColor)} 92%, ${feedColor === 'transparent' ? '#00000000' : (feedColor === '#02040a' ? '#000' : feedColor)} 100%)`, WebkitMaskImage: 'linear-gradient(to bottom, black 240px, transparent 460px)', maskImage: 'linear-gradient(to bottom, black 240px, transparent 460px)' }} >
           {topImage && ( <img src={topImage} className={`w-full h-full object-cover transition-all duration-500`} style={{ opacity: getWallpaperOpacity(topColor), filter: getWallpaperFilter(topColor), imageRendering: 'high-quality' }} /> )}
           <div className="absolute bottom-0 left-0 w-full h-full z-[5] pointer-events-none" style={{ backgroundImage: `linear-gradient(to top, ${feedColor === 'transparent' ? '#02040a' : feedColor} 0%, transparent 60%)` }} />
        </div>

        <header className="relative z-[1000] px-6 py-6 flex items-center justify-between shrink-0">
          <button onClick={onBack} className="p-2 bg-black/40 backdrop-blur-md rounded-xl text-white border border-white/10 active:scale-90 transition-all">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M15 19l-7-7 7-7"/></svg>
          </button>
          
          <div className="flex flex-col items-center flex-1 mx-4">
             {viewMode === 'preview' ? (
               <h2 className="text-[10px] font-syncopate font-black text-white uppercase tracking-[0.4em] animate-in fade-in slide-in-from-top-1 duration-500">
                 {title || "SEM TÍTULO"}
               </h2>
             ) : (
               <div className="flex gap-4 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                  <button onClick={() => setViewMode('editor')} className={`text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'editor' ? 'text-cyan-400' : 'text-slate-400'}`}>Editor</button>
                  <button onClick={() => setViewMode('preview')} className={`text-[10px] font-black uppercase tracking-widest transition-all ${viewMode === 'preview' ? 'text-cyan-400' : 'text-slate-400'}`}>Prévia</button>
               </div>
             )}
          </div>

          <div className="flex gap-2">
             <button onClick={() => setShowStyleHub(!showStyleHub)} className={`p-2 rounded-xl transition-all border backdrop-blur-md ${showStyleHub ? 'bg-cyan-500 border-cyan-400 text-black' : 'bg-black/40 border-white/10 text-white'}`}>🎨</button>
             <button 
               onClick={handlePublish}
               disabled={!title.trim() || !content.trim()}
               className="px-6 py-2.5 bg-white text-black rounded-full text-[9px] font-black uppercase tracking-widest active:scale-95 disabled:opacity-10 transition-all shadow-lg"
             >
               Publicar
             </button>
          </div>
        </header>

        <main className={`relative z-10 flex-1 overflow-y-auto no-scrollbar ${viewMode === 'preview' ? 'p-0' : 'p-6 pt-12 pb-48'}`}>
          {viewMode === 'preview' ? (
            <div className="flex-1 overflow-y-auto no-scrollbar bg-transparent text-white animate-in fade-in duration-700">
              <div className="fixed inset-0 z-0 pointer-events-none">
                  {feedImage && (
                    <img 
                      src={feedImage} 
                      className="absolute inset-0 w-full h-full object-cover opacity-80" 
                      style={{ filter: 'brightness(1.1)', imageRendering: 'high-quality' }} 
                    />
                  )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-[#02040a]" />
              </div>
              
              <div className="relative z-10 w-full h-[320px] overflow-hidden">
                <SlideshowWallpaper 
                  images={gallery.length > 0 ? gallery.map(g => resolveMedia(g.src) || '') : (topImage ? [topImage] : [])} 
                  color={topColor || '#02040a'} 
                  opacity={hideTopOverlay ? 1 : 0.95} 
                  filter="brightness(1.1)" 
                  noGradient={hideTopOverlay} 
                  bottomColor="transparent"
                />
                <div className="absolute inset-0 flex items-center justify-center pt-20">
                  <div className="w-44 h-44 rounded-[3rem] border-[4px] border-white/10 p-1 bg-[#02040a] shadow-[0_0_60px_rgba(255,255,255,0.1)] overflow-hidden">
                    <img src={resolveMedia(userAvatar) || ''} className="w-full h-full object-cover rounded-[2.5rem]" />
                  </div>
                </div>
              </div>

              <div className="p-4 md:p-10 space-y-12 max-w-3xl mx-auto pb-60 bg-black/40 backdrop-blur-sm rounded-[3rem] mt-10 border border-white/5 text-left relative z-[20]">
                <div className="text-center space-y-2">
                   {(() => {
                      const titleColor = getAutoContrastHex(topColor || '#1a2036');
                      const isTitleDark = hexToHsla(titleColor).l < 30;
                      return (
                        <h1 
                          className={`text-4xl md:text-6xl font-syncopate font-black uppercase tracking-tighter break-words w-full ${isTitleDark ? '' : 'drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]'}`}
                          style={{ color: titleColor }}
                        >
                          {title || 'SEM_TÍTULO'}
                        </h1>
                      );
                   })()}
                  <div className="w-20 h-1 bg-gradient-to-r from-transparent via-white/40 to-transparent mx-auto rounded-full"></div>
                </div>

                <div className="pt-12 border-t border-white/5 relative text-left">
                  <div className="absolute -top-3.5 left-6 px-6 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-[10px] font-black text-white/70 uppercase tracking-widest shadow-lg">Transmissão Blog</div>
                  <div className="text-[15px] font-medium leading-relaxed px-1 w-full" style={{ color: textColor }} dangerouslySetInnerHTML={{ __html: formatBioText(content) }} />
                </div>
                 
                 {gallery.length > 0 && (() => {
                      const galleryContrast = getAutoContrastHex(topColor || '#1a2036');
                      const isBgLight = hexToHsla(galleryContrast).l < 40;
                      const neumorphicHeader = isBgLight ? { boxShadow: '-4px -4px 10px #ffffff, 4px 4px 10px #aeaec040' } : { boxShadow: 'inset -2px -2px 5px rgba(255,255,255,0.05), inset 2px 2px 5px rgba(0,0,0,0.3)' };
                      return (
                        <div className="pt-8 space-y-4">
                          <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-3 px-2">
                               <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_#22d3ee]"></div>
                               <h4 className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full ${isBgLight ? 'bg-black/[0.03]' : 'bg-white/5'}`} style={{ color: galleryContrast, opacity: 0.8, ...neumorphicHeader }}>Acervo Visual</h4>
                            </div>
                            <div className={`h-px w-full ${isBgLight ? 'bg-black/5' : 'bg-white/10'}`} />
                          </div>
                          
                          <div className={`w-full overflow-hidden rounded-[2rem] p-4 ${isBgLight ? 'bg-[#f0f0f3] shadow-[inset_-8px_-8px_20px_#ffffff,inset_8px_8px_20px_#aeaec040]' : 'bg-black/20 shadow-[inset_-4px_-4px_12px_rgba(255,255,255,0.05),inset_4px_4px_12px_rgba(0,0,0,0.4)] border border-white/5'}`}>
                            <div className="flex gap-4 overflow-x-auto no-scrollbar w-full pb-2 px-1">
                              {gallery.map((img, i) => (
                                <div 
                                  key={i} 
                                  className={`aspect-video w-48 shrink-0 rounded-2xl overflow-hidden cursor-pointer hover:scale-[1.02] transition-all text-left ${isBgLight ? 'bg-white shadow-[-8px_-8px_20px_#ffffff,8px_8px_20px_#aeaec040]' : 'bg-black/40 border border-white/10 shadow-xl'}`}
                                >
                                  <img src={resolveMedia(img.src) || ''} className="w-full h-full object-cover" alt={`Gallery Image ${i}`} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                  })()}

                  <div className="pt-4 -mx-4 md:-mx-10 mt-6 text-left">
                    {(() => {
                       const creatorContrast = getAutoContrastHex(topColor || '#1a2036');
                       const isBgLight = hexToHsla(creatorContrast).l < 40;
                       
                       return (
                         <>
                            <div className={`h-[0.5px] w-full mb-4 ${isBgLight ? 'bg-black/5' : 'bg-white/10'}`} />
                            <div className="flex items-center self-start relative">
                               <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-10 rounded-full z-10" style={{ backgroundColor: creatorContrast, opacity: 0.2 }} />
                               <div className="flex items-center gap-2 px-3 h-7 rounded-r-xl bg-white/5 border border-white/5 ml-[1px] relative z-0 backdrop-blur-md shadow-xl">
                                  <div className="w-5 h-5 rounded-md border border-white/10 overflow-hidden shadow-lg shrink-0">
                                     <img src={resolveMedia(userAvatar) || ''} className="w-full h-full object-cover" alt="Author" />
                                  </div>
                                  <div className="flex flex-col select-none leading-none pb-0.5">
                                     <span className="text-[5px] font-black uppercase tracking-widest opacity-40" style={{ color: creatorContrast }}>PUBLICADO POR</span>
                                     <span className="text-[10px] font-black tracking-widest leading-none mt-0.5" style={{ color: creatorContrast }}>{userName}</span>
                                  </div>
                               </div>
                            </div>
                         </>
                       );
                    })()}
                  </div>

                  {/* Flow of thoughts placeholder for preview */}
                  <div className="pt-4 border-t border-white/5 space-y-6">
                    <div className="flex flex-col gap-4 mt-1">
                      <div className="flex items-center gap-3 px-2">
                         <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_8px_#22d3ee] animate-pulse"></div>
                         <div className={`px-4 py-1.5 rounded-full bg-white/5`}>
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 text-white/60">Sinais de Consciência</h4>
                         </div>
                      </div>
                      <div className={`h-px w-full bg-white/5`} />
                    </div>
                    <div className="px-2 py-8 text-center text-[10px] font-black uppercase tracking-[0.3em] opacity-20 italic">
                      Comentários serão habilitados após a publicação
                    </div>
                  </div>
                </div>
              </div>
            ) : (
            <div className="max-w-2xl mx-auto space-y-6 relative">
              {showStyleHub && (
                 <section className="animate-in slide-in-from-top-4 duration-500 pointer-events-auto relative z-[100] mb-8">
                    <div className="bg-[#e0f2f1]/95 backdrop-blur-2xl rounded-[1.8rem] p-4 border border-white/10 shadow-2xl">
                       <div className="flex justify-between items-start mb-4">
                         <div className="flex flex-col"> 
                           <h3 className="text-[#1a2036] font-black text-[9px] tracking-widest uppercase">SISTEMA_V_2.4</h3> 
                           <span className="text-[#1a2036]/40 text-[5px] font-bold uppercase">MATRIZ DE ESTILO TRANSMISSÃO...</span> 
                         </div>
                         <button onClick={() => { setShowStyleHub(false); setActivePicker(null); }} className="text-[#1a2036] font-black text-[8px] uppercase px-3 py-1 bg-black/10 rounded-full">FECHAR</button>
                       </div>
                       
                       <div className="space-y-4">
                          <div className="space-y-3">
                             <span className="text-[5px] font-black text-[#1a2036]/60 uppercase ml-1 tracking-[0.2em]">MATRIZ CROMÁTICA</span>
                             <div className="flex justify-center gap-8">
                               <div className="flex flex-col items-center gap-1.5 relative group/color">
                                 <button onClick={() => openPicker('top', 'COR_TOPO', topColor)} className={`w-12 h-12 rounded-full border-2 p-0.5 transition-all hover:scale-105 shadow-md ${activePicker?.field === 'top' ? 'ring-2 ring-cyan-500 ring-offset-2' : ''}`} style={{ borderColor: topColor }}>
                                   <div className="w-full h-full rounded-full" style={{ backgroundColor: topColor }} />
                                 </button>
                                 {topColor !== '#1a2036' && (
                                   <button onClick={() => handleResetColor('top')} className="absolute -top-2 -right-2 w-4 h-4 bg-black/40 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-[10px] text-white hover:text-white transition-all shadow-md z-[120]">✕</button>
                                 )}
                                 <span className="text-[4px] font-black text-[#1a2036] uppercase">TOPO_HUB</span>
                               </div>
                               <div className="flex flex-col items-center gap-1.5 relative group/color">
                                 <button onClick={() => openPicker('feed', 'COR_FEED', feedColor)} className={`w-12 h-12 rounded-full border-2 p-0.5 transition-all hover:scale-105 shadow-md ${activePicker?.field === 'feed' ? 'ring-2 ring-cyan-500 ring-offset-2' : ''}`} style={{ borderColor: feedColor }}>
                                   <div className="w-full h-full rounded-full" style={{ backgroundColor: feedColor }} />
                                 </button>
                                 {feedColor !== '#02040a' && (
                                   <button onClick={() => handleResetColor('feed')} className="absolute -top-2 -right-2 w-4 h-4 bg-black/40 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-[10px] text-white hover:text-white transition-all shadow-md z-[120]">✕</button>
                                 )}
                                 <span className="text-[4px] font-black text-[#1a2036] uppercase">FUNDO_HUB</span>
                               </div>
                             </div>

                             {activePicker && (
                               <div className="mt-4 p-4 bg-white/40 rounded-2xl border border-white/40 animate-in zoom-in">
                                 <div className="flex justify-between items-center mb-3 px-1"> 
                                   <span className="text-[7px] font-black text-[#1a2036] uppercase tracking-widest">{activePicker.label}</span> 
                                   <button onClick={() => setActivePicker(null)} className="text-[#1a2036] font-bold text-[12px]">✕</button> 
                                 </div>
                                 <div className="space-y-4">
                                   <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                     <div className="space-y-1">
                                       <div className="flex justify-between items-center px-1"><span className="text-[5px] font-bold text-[#1a2036]/60 uppercase">Matiz</span><span className="text-[5px] font-black text-[#1a2036]">{pickerHsla.h}°</span></div>
                                       <input type="range" min="0" max="360" value={pickerHsla.h} onChange={(e) => updatePickerColor(Number(e.target.value), pickerHsla.s, pickerHsla.l, 1)} className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-cyan-500 via-blue-500 to-purple-500" />
                                     </div>
                                     <div className="space-y-1">
                                       <div className="flex justify-between items-center px-1"><span className="text-[5px] font-bold text-[#1a2036]/60 uppercase">Saturação</span><span className="text-[5px] font-black text-[#1a2036]">{pickerHsla.s}%</span></div>
                                       <input type="range" min="0" max="100" value={pickerHsla.s} onChange={(e) => updatePickerColor(pickerHsla.h, Number(e.target.value), pickerHsla.l, 1)} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, hsl(${pickerHsla.h}, 0%, ${pickerHsla.l}%), hsl(${pickerHsla.h}, 100%, ${pickerHsla.l}%))` }} />
                                     </div>
                                   </div>
                                   <div className="space-y-1">
                                     <div className="flex justify-between items-center px-1"><span className="text-[5px] font-bold text-[#1a2036]/60 uppercase">Brilho</span><span className="text-[5px] font-black text-[#1a2036]">{pickerHsla.l}%</span></div>
                                     <input type="range" min="0" max="100" value={pickerHsla.l} onChange={(e) => updatePickerColor(pickerHsla.h, pickerHsla.s, Number(e.target.value), 1)} className="w-full h-1.5 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, #000, hsl(${pickerHsla.h}, ${pickerHsla.s}%, 50%), #fff)` }} />
                                   </div>
                                 </div>
                               </div>
                             )}
                          </div>

                          <div className="space-y-1.5">
                             <span className="text-[5px] font-black text-[#1a2036]/60 uppercase ml-1 tracking-[0.2em]">ATIVOS VISUAIS</span>
                             <div className="flex gap-4 px-1">
                                <div className="relative"> 
                                   <div onClick={() => topImageInputRef.current?.click()} className={`w-14 h-14 rounded-2xl bg-slate-900 border-2 overflow-hidden flex flex-col items-center justify-center cursor-pointer shadow-sm transition-all shrink-0 border-white/20 hover:border-[#1a2036]`}>
                                      {topImage ? <img src={topImage} className="w-full h-full object-cover" /> : <span className="text-xl opacity-20">🖼️</span>}
                                      <div className="absolute inset-x-0 bottom-0 bg-black/40 text-[4px] font-bold text-white text-center uppercase py-0.5">Topo</div>
                                   </div> 
                                   {topImage && <button onClick={() => setTopImage(null)} className="absolute -top-2 -right-2 w-5 h-5 bg-black/60 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-[12px] text-white hover:text-white transition-all shadow-md z-[120]">✕</button>}
                                </div>
                                <div className="relative"> 
                                   <div onClick={() => feedImageInputRef.current?.click()} className={`w-14 h-14 rounded-2xl bg-slate-900 border-2 overflow-hidden flex flex-col items-center justify-center cursor-pointer shadow-sm transition-all shrink-0 border-white/20 hover:border-[#1a2036]`}>
                                      {feedImage ? <img src={feedImage} className="w-full h-full object-cover" /> : <span className="text-xl opacity-20">🎨</span>}
                                      <div className="absolute inset-x-0 bottom-0 bg-black/40 text-[4px] font-bold text-white text-center uppercase py-0.5">Fundo</div>
                                   </div> 
                                   {feedImage && <button onClick={() => setFeedImage(null)} className="absolute -top-2 -right-2 w-5 h-5 bg-black/60 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center text-[10px] text-white hover:text-white transition-all shadow-md z-[120]">✕</button>}
                                </div>
                                <div className="flex flex-col items-center gap-1.5 relative">
                                   <button 
                                     onClick={() => setHideTopOverlay(!hideTopOverlay)}
                                     className={`w-14 h-14 rounded-2xl border-2 flex flex-col items-center justify-center transition-all shadow-sm relative overflow-hidden ${hideTopOverlay ? 'bg-cyan-500 border-cyan-400 text-black' : 'bg-slate-900 border-white/20 text-white/40'}`}
                                   >
                                     <span className="text-lg">{hideTopOverlay ? '👁️' : '🕶️'}</span>
                                     <div className="absolute inset-x-0 bottom-0 bg-black/40 text-[4px] font-bold text-white text-center uppercase py-0.5">Overlay</div>
                                   </button>
                                   <span className="text-[4px] font-black text-[#1a2036] uppercase">{hideTopOverlay ? 'OCULTO' : 'VISÍVEL'}</span>
                                </div>
                             </div>
                             <input type="file" ref={topImageInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageInput(e, setTopImage)} />
                             <input type="file" ref={feedImageInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageInput(e, setFeedImage)} />
                          </div>
                       </div>
                    </div>
                 </section>
              )}
             {viewMode === 'editor' && (
                <div className="grid grid-cols-3 border border-white/10 rounded-[2rem] divide-x divide-white/10 bg-black/40 backdrop-blur-md overflow-hidden shadow-2xl mb-8">
                   {/* Fundo do Blog */}
                   <section className="flex flex-col relative">
                      <div 
                        onClick={() => feedImageInputRef.current?.click()}
                        className="p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-white/[0.05] transition-all group"
                      >
                         <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white transition-all text-xl">
                            🎨
                         </div>
                         <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest text-center">Fundo do Blog</span>
                      </div>

                      <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                         <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-2.5 py-1 shadow-2xl">
                            <div className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: feedColor }} />
                            <input 
                              value={feedColor} 
                              onChange={(e) => setFeedColor(e.target.value)} 
                              maxLength={7}
                              className="w-12 bg-transparent text-[8px] font-mono text-white outline-none uppercase"
                              placeholder="#000"
                            />
                         </div>
                         <button 
                           onClick={() => setFeedColor('#02040a')}
                           className="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded-md text-[6px] font-black text-white uppercase transition-all border border-white/5 shadow-lg"
                         >
                           Resetar Cor
                         </button>
                      </div>

                      <div className="px-6 pb-6 mt-auto">
                        {feedImage ? (
                           <div className="relative w-full h-16 rounded-xl border border-white/10 overflow-hidden shadow-lg group">
                              <img src={feedImage} className="w-full h-full object-cover" />
                              <button onClick={(e) => { e.stopPropagation(); setFeedImage(null); }} className="absolute top-1 right-1 w-6 h-6 bg-black/60 backdrop-blur-md rounded-lg flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                           </div>
                        ) : (
                           <div className="w-full h-16 rounded-xl border border-dashed border-white/10 flex items-center justify-center opacity-30">
                              <span className="text-[8px] uppercase font-black tracking-widest">Nenhum Ativo</span>
                           </div>
                        )}
                      </div>
                   </section>

                   {/* Topo e Cor */}
                   <section className="flex flex-col relative">
                      <div 
                        onClick={() => topImageInputRef.current?.click()}
                        className="p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-white/[0.05] transition-all group"
                      >
                         <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white transition-all text-xl">
                            🖼️
                         </div>
                         <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest text-center">Topo e Overlay</span>
                      </div>
                      
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
                           onClick={() => setTopColor('#1a2036')}
                           className="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded-md text-[6px] font-black text-white uppercase transition-all border border-white/5 shadow-lg"
                         >
                           Resetar Cor
                         </button>
                      </div>

                      <div className="px-6 pb-6 mt-auto">
                        {topImage ? (
                           <div className="relative w-full h-16 rounded-xl border border-white/10 overflow-hidden shadow-lg group">
                              <img src={topImage} className="w-full h-full object-cover" />
                              <button onClick={(e) => { e.stopPropagation(); setTopImage(null); }} className="absolute top-1 right-1 w-6 h-6 bg-black/60 backdrop-blur-md rounded-lg flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                           </div>
                        ) : (
                           <div className="w-full h-16 rounded-xl border border-dashed border-white/10 flex items-center justify-center opacity-30">
                              <span className="text-[8px] uppercase font-black tracking-widest">Nenhum Ativo</span>
                           </div>
                        )}
                      </div>
                   </section>

                   {/* Acervo da Galeria */}
                   <section className="flex flex-col relative">
                      <div 
                        onClick={() => galleryInputRef.current?.click()}
                        className="p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-white/[0.05] transition-all group"
                      >
                         <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/40 group-hover:text-white transition-all text-xl">
                            📦
                         </div>
                         <span className="text-[9px] font-bold text-white/50 uppercase tracking-widest text-center">Acervo da Galeria</span>
                         <input type="file" ref={galleryInputRef} className="hidden" accept="image/*" multiple onChange={handleGalleryUpload} />
                      </div>
                      
                      <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                         <button 
                           onClick={() => setGallery([])}
                           className="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded-md text-[6px] font-black text-white uppercase transition-all border border-white/5 shadow-lg"
                         >
                           Resetar Acervo
                         </button>
                      </div>

                      <div className="px-6 pb-6 mt-auto">
                        {gallery.length > 0 ? (
                           <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 h-16">
                              {gallery.map((img, i) => (
                                 <div key={i} className="relative w-16 h-14 shrink-0 rounded-xl border border-white/10 overflow-hidden shadow-lg group">
                                    <img src={resolveMedia(img.src) || ''} className="w-full h-full object-cover" />
                                    <button onClick={(e) => { e.stopPropagation(); setGallery(prev => prev.filter((_, idx) => idx !== i)); }} className="absolute top-1 right-1 w-6 h-6 bg-black/60 backdrop-blur-md rounded-lg flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                                 </div>
                              ))}
                           </div>
                        ) : (
                           <div className="w-full h-16 rounded-xl border border-dashed border-white/10 flex items-center justify-center opacity-30">
                              <span className="text-[8px] uppercase font-black tracking-widest text-center">Vazio</span>
                           </div>
                        )}
                      </div>
                   </section>
                </div>
             )}
            <div className="space-y-2 mb-10">
               {viewMode === 'editor' ? (
                 <input 
                   value={title} 
                   onChange={(e) => setTitle(e.target.value)} 
                   placeholder="TÍTULO DA TRANSMISSÃO" 
                   className="w-full bg-transparent border-none text-xl font-bold outline-none p-0 uppercase drop-shadow-2xl text-center" 
                   style={{ color: topTextColor }}
                 />
               ) : (
                 <h1 className="text-3xl font-black uppercase tracking-tight leading-none text-center drop-shadow-2xl animate-in fade-in" style={{ color: topTextColor }}>
                   {title || "SEM TÍTULO"}
                 </h1>
               )}
            </div>

            <div className="relative pt-6">
               {viewMode === 'editor' ? (
                 <>
                   <textarea 
                     ref={editorTextAreaRef}
                     value={content} 
                     onChange={(e) => setContent(e.target.value)} 
                     placeholder="Sua história começa aqui..." 
                     className="w-full bg-transparent border-none text-base leading-relaxed outline-none placeholder:text-white/10 resize-none min-h-[300px] p-0" 
                     style={{ color: textColor }}
                   />
                   <button 
                     onClick={() => galleryInputRef.current?.click()} 
                     className="fixed bottom-10 right-10 w-16 h-16 bg-cyan-600 text-white rounded-2xl shadow-2xl flex items-center justify-center active:scale-90 transition-all z-[100] border border-cyan-400/50"
                   >
                     <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                     <input type="file" ref={galleryInputRef} className="hidden" accept="image/*" onChange={(e) => handleInsertBioImage(e, false)} />
                   </button>
                 </>
               ) : (
                 <div className="text-lg leading-relaxed font-medium animate-in fade-in" style={{ color: textColor }} dangerouslySetInnerHTML={{ __html: formatBioText(content) }} />
               )}
            </div>
          </div>
        )}
        </main>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .hd-4k-rendering { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
        .not-italic-fix { font-style: italic !important; }
      `}} />
    </div>
  );
};

export default BlogCreation;
