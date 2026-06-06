
import React, { useState, useMemo } from 'react';
import { UserProfile } from '../types';
import { MOCK_FOLLOWERS as SYSTEM_MOCK_FOLLOWERS } from '../data';

interface SocialDiscoveryProps {
  onSelectMember: (member: UserProfile) => void;
  onViewProfile: (member: UserProfile) => void;
  onBack: () => void;
  isSearchMode?: boolean;
  isInviting?: boolean;
  onInviteMember?: (member: UserProfile) => void;
  members?: UserProfile[];
}

const stripBioTags = (text: string | undefined | null) => {
  if (!text) return "";
  // Removes all [tag] or [tag=attr] or [tag id attr] or [vimg_id] blocks
  let clean = text.replace(/\[\s*(?:vimg_|img_|ref:|header|capa|banner|imagem|image|atm|atmosfera|[^\]=]+=[^\]\s]+|[^\]\s]+\s+[^\]]+)[^\]]*\]/gi, "");
  // Removes simple formatting tags [b] [/b]
  clean = clean.replace(/\[\/?([a-z]+)[^\]]*\]/gi, "");
  return clean.trim();
};

const SocialDiscovery: React.FC<SocialDiscoveryProps> = ({ 
  onSelectMember, 
  onViewProfile, 
  onBack, 
  members 
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);

  const selectedBioImage = useMemo(() => {
    if (!selectedProfile?.bio) return null;
    const match = /\[(?:vimg_|img_)?(img_[a-z0-9]+)/i.exec(selectedProfile.bio);
    if (match) {
      // Direct lookup in localStorage as these images are stored there
      return localStorage.getItem('vimg_' + match[1]);
    }
    return null;
  }, [selectedProfile?.bio]);

  const displayPool = useMemo(() => {
    return members || SYSTEM_MOCK_FOLLOWERS;
  }, [members]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return displayPool;
    return displayPool.filter(m => m.name.toLowerCase().includes(q));
  }, [searchQuery, displayPool]);

  const handleToggleFollow = (name: string) => {
    setFollowedIds(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
    if (navigator.vibrate) navigator.vibrate(10);
  };

  return (
    <div className="flex-1 h-full w-full bg-[#02040a] relative overflow-hidden flex flex-col animate-in fade-in duration-500 font-inter">
      {/* Camada Estelar */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_20%_30%,_rgba(34,211,238,0.15)_0%,_transparent_50%)]"></div>
        <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_80%_70%,_rgba(168,85,247,0.1)_0%,_transparent_50%)]"></div>
      </div>

      <header className="px-6 py-8 flex items-center justify-between relative z-50 shrink-0 bg-black/40 backdrop-blur-xl border-b border-white/5 shadow-2xl">
        <button onClick={onBack} className="p-2.5 bg-white/5 rounded-2xl text-slate-400 hover:text-white transition-all active:scale-90 border border-white/5">
           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path d="M15 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex flex-col items-center">
           <h2 className="text-xs font-syncopate font-black text-white uppercase tracking-[0.4em]">Diretório Operativo</h2>
           <div className="flex items-center gap-2 mt-1">
              <div className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse"></div>
              <span className="text-[7px] font-black text-cyan-400 uppercase tracking-[0.2em]">Scanner de Frequência</span>
           </div>
        </div>
        <div className="w-12"></div>
      </header>

      <div className="px-6 pt-6 relative z-50">
         <div className="relative group">
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Sintonizar identidade..."
              className="w-full bg-white/[0.03] border border-white/10 rounded-2xl p-4 pl-12 text-[14px] text-white outline-none focus:border-cyan-500/40 transition-all uppercase tracking-widest font-bold placeholder:text-slate-800 shadow-inner relative z-10 backdrop-blur-md"
            />
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-cyan-400 transition-colors z-20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-6 pb-40 relative z-10">
          <div className="grid grid-cols-3 gap-x-2 gap-y-10">
             {filteredMembers.map((member, idx) => (
               <button 
                 key={member.name}
                 onClick={() => setSelectedProfile(member)}
                 className="flex flex-col items-center gap-3 transition-all group active:scale-95 animate-in slide-in-from-bottom duration-500"
                 style={{ animationDelay: `${idx * 30}ms` }}
               >
                  <div className="relative">
                     <div className="w-20 h-20 rounded-full border-2 border-white/10 p-0.5 bg-black overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.5)] group-hover:border-cyan-500/50 transition-all duration-500">
                        <img src={member.avatarUrl} className="w-full h-full object-cover rounded-full grayscale-[0.2] group-hover:grayscale-0 transition-all duration-700" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-40 group-hover:opacity-10 transition-opacity"></div>
                     </div>
                     <div className="absolute -bottom-1 -right-1 flex items-center gap-1 bg-[#02040a] backdrop-blur-md px-1.5 py-0.5 rounded-full border border-white/10 shadow-md">
                        <span className="text-[6px] font-black text-cyan-400 font-orbitron">LVL {member.level}</span>
                     </div>
                  </div>
                  
                  <div className="text-center w-full px-1 flex flex-col items-center">
                     <h4 className="text-[9px] font-black text-white uppercase truncate w-full group-hover:text-cyan-400 transition-colors tracking-tighter leading-tight">{member.name}</h4>
                     <div className="flex items-center justify-center gap-1.5 opacity-50">
                        <p className="text-[6px] font-black text-slate-500 uppercase tracking-widest">{member.rank}</p>
                     </div>
                  </div>
               </button>
             ))}
          </div>

        {filteredMembers.length === 0 && (
           <div className="py-32 flex flex-col items-center justify-center opacity-20 text-center space-y-4">
              <span className="text-4xl">📡</span>
              <p className="text-[10px] font-black uppercase tracking-[0.4em]">Frequência Nula</p>
           </div>
        )}
      </div>

      {/* POPUP CENTRAL DE PERFIL */}
      {selectedProfile && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={() => setSelectedProfile(null)} />
          
          <div className="relative w-full max-w-[320px] bg-[#0a0c1a] border border-cyan-500/30 rounded-[3rem] p-8 shadow-[0_0_80px_rgba(34,211,238,0.2)] flex flex-col items-center gap-6 animate-in zoom-in-95 duration-300 pointer-events-auto">
            <div className="relative">
              <div className="w-24 h-24 rounded-full border-[3px] border-cyan-500 p-1 bg-black shadow-2xl overflow-hidden">
                <img src={selectedProfile.avatarUrl} className="w-full h-full object-cover rounded-full" />
              </div>
              <div className="absolute -bottom-2 -right-2 bg-cyan-500 text-black px-2.5 py-1 rounded-full text-[8px] font-black font-orbitron shadow-lg border-2 border-[#0a0c1a]">
                LVL {selectedProfile.level}
              </div>
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-sm font-syncopate font-black text-white uppercase tracking-widest drop-shadow-md">{selectedProfile.name}</h3>
              <div className="px-2 flex flex-col items-center gap-3 w-full">
                <div className="flex items-center gap-3 w-full justify-center">
                  {selectedBioImage && (
                    <div className="w-14 h-12 rounded-lg overflow-hidden border border-white/10 shadow-xl bg-slate-900/40 backdrop-blur-sm shrink-0 transform -rotate-1">
                      <img src={selectedBioImage} className="w-full h-full object-cover" alt="Bio" />
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 font-bold leading-relaxed underline-offset-4 line-clamp-2 text-left flex-1">
                    {selectedProfile.bio ? stripBioTags(selectedProfile.bio) : "Este operativo prefere manter sua biografia oculta no vácuo."}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col w-full gap-3 mt-2">
              <button 
                onClick={() => handleToggleFollow(selectedProfile.name)}
                className={`w-full py-4 rounded-2xl text-[9px] font-black uppercase tracking-[0.3em] transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2 ${followedIds.has(selectedProfile.name) ? 'bg-white/10 text-cyan-400 border border-cyan-500/30' : 'bg-white text-black hover:bg-cyan-50'}`}
              >
                {followedIds.has(selectedProfile.name) ? (
                  <><span>✓</span> Segue</>
                ) : (
                  <><span>+</span> Seguir</>
                )}
              </button>
              
              <button 
                onClick={() => { onSelectMember(selectedProfile); setSelectedProfile(null); }}
                className="w-full py-4 bg-cyan-600 text-white rounded-2xl text-[9px] font-black uppercase tracking-[0.3em] active:scale-95 shadow-xl shadow-cyan-900/20 transition-all border border-cyan-400/30 flex items-center justify-center gap-2"
              >
                <span>💬</span> Conversar
              </button>
            </div>

            <button onClick={() => setSelectedProfile(null)} className="text-[8px] font-black text-slate-600 uppercase tracking-widest hover:text-white transition-colors">Voltar</button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
};

export default SocialDiscovery;
