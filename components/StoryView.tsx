import React, { useState, useEffect, useRef } from 'react';
import { PageData } from '../types';

interface Props {
  content: string;
  onReset: () => void;
  isStreaming: boolean;
}

const CHARS_PER_PAGE = 1200; // Slightly reduced for better fit

// Enhanced Rich Text Renderer with cleaner logic
const RichTextRenderer: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  
  // Split by double newline to handle paragraphs better
  const blocks = text.split(/\n\s*\n/);
  
  return (
    <div className="font-serif antialiased space-y-4">
      {blocks.map((block, idx) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        // Headers
        if (trimmed.startsWith('# ')) {
             return <h1 key={idx} className="text-4xl font-bold font-serif text-brand-900 mb-8 mt-4 text-center leading-tight">{trimmed.replace('# ', '')}</h1>;
        }
        if (trimmed.startsWith('## ')) {
             return <h2 key={idx} className="text-2xl font-bold font-serif text-brand-800 mb-6 mt-8 border-b-2 border-brand-gold/20 pb-2">{trimmed.replace('## ', '')}</h2>;
        }
        if (trimmed.startsWith('### ')) {
             return <h3 key={idx} className="text-xl font-semibold font-serif text-brand-700 mb-4 mt-6 italic">{trimmed.replace('### ', '')}</h3>;
        }

        // Blockquotes
        if (trimmed.startsWith('> ')) {
            return (
                <blockquote key={idx} className="border-l-4 border-brand-gold pl-6 italic text-gray-700 my-6 bg-yellow-50/50 p-4 rounded-r-lg text-lg font-light leading-relaxed">
                    {parseInline(trimmed.replace(/> /g, ''))}
                </blockquote>
            );
        }

        // Horizontal Rule
        if (trimmed === '---') {
            return <div key={idx} className="flex justify-center my-8"><span className="text-brand-gold/60 text-2xl tracking-[0.5em]">❖ ❖ ❖</span></div>;
        }

        // Lists
        if (trimmed.startsWith('- ') || trimmed.match(/^\d+\. /)) {
            const items = trimmed.split('\n');
            return (
                <ul key={idx} className="space-y-2 mb-4 ml-4">
                    {items.map((item, i) => {
                        const cleanItem = item.replace(/^- /, '').replace(/^\d+\. /, '');
                        return <li key={i} className="list-disc ml-4 text-gray-800 leading-relaxed pl-2 marker:text-brand-gold">{parseInline(cleanItem)}</li>
                    })}
                </ul>
            )
        }

        // Standard Paragraph
        return <p key={idx} className="text-gray-800 leading-relaxed text-lg text-justify indent-8">{parseInline(trimmed)}</p>;
      })}
    </div>
  );
};

// Helper to parse bold/italic inline
const parseInline = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-bold text-brand-900">{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className="italic text-brand-800">{part.slice(1, -1)}</em>;
    return part;
  });
};

export const StoryView: React.FC<Props> = ({ content, onReset, isStreaming }) => {
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev'>('next');
  
  // Advanced Pagination Logic with Chapter Title Tracking
  useEffect(() => {
    const lines = content.split('\n');
    const newPages: PageData[] = [];
    
    let currentChunk = '';
    let currentLength = 0;
    let currentChapterTitle = 'Prologue';
    
    // Scan for main title
    const mainTitleMatch = content.match(/^# (.+)$/m);
    let storyTitle = mainTitleMatch ? mainTitleMatch[1] : 'Untitled Story';

    lines.forEach((line) => {
        // Update Chapter Title context when we hit a header
        if (line.startsWith('## ')) {
            currentChapterTitle = line.replace('## ', '').trim();
            // Force break on new chapter
            if (currentChunk.trim().length > 0) {
                 newPages.push({ content: currentChunk, chapterTitle: currentChapterTitle, pageNumber: newPages.length + 1 });
                 currentChunk = '';
                 currentLength = 0;
            }
        }
        // Force break on Main Title
        if (line.startsWith('# ')) {
             if (currentChunk.trim().length > 0) {
                 newPages.push({ content: currentChunk, chapterTitle: currentChapterTitle, pageNumber: newPages.length + 1 });
                 currentChunk = '';
                 currentLength = 0;
            }
            storyTitle = line.replace('# ', '').trim();
        }

        const lineLen = line.length;
        
        // Soft limit for page break
        if (currentLength + lineLen > CHARS_PER_PAGE) {
            if (currentChunk.trim().length > 0) {
                newPages.push({ content: currentChunk, chapterTitle: currentChapterTitle, pageNumber: newPages.length + 1 });
            }
            currentChunk = line + '\n';
            currentLength = lineLen;
        } else {
            currentChunk += line + '\n';
            currentLength += lineLen;
        }
    });

    if (currentChunk.trim().length > 0) {
        newPages.push({ content: currentChunk, chapterTitle: currentChapterTitle, pageNumber: newPages.length + 1 });
    }
    
    if (newPages.length === 0) newPages.push({ content: '', chapterTitle: '', pageNumber: 1 });
    setPages(newPages);
    
    // Auto-advance if streaming and near end
    if (isStreaming && currentPage === pages.length - 2) {
        // Optional: Auto flip? Might be annoying. Let's just keep pages updated.
    }
  }, [content]);

  const turnPage = (dir: 'next' | 'prev') => {
    if (isFlipping) return;
    
    if (dir === 'next' && currentPage < pages.length - 1) {
        setFlipDirection('next');
        setIsFlipping(true);
        setTimeout(() => {
            setCurrentPage(prev => prev + 1);
            setIsFlipping(false);
        }, 900); 
    } else if (dir === 'prev' && currentPage > 0) {
        setFlipDirection('prev');
        setIsFlipping(true);
        setTimeout(() => {
            setCurrentPage(prev => prev - 1);
            setIsFlipping(false);
        }, 900);
    }
  };

  const downloadStory = () => {
    const element = document.createElement("a");
    const file = new Blob([content], {type: 'text/markdown'});
    element.href = URL.createObjectURL(file);
    element.download = "mythos_story.md";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const getPageData = (idx: number) => {
      if (idx < 0 || idx >= pages.length) return null;
      return pages[idx];
  };

  // Static Layers
  const leftIdx = isFlipping && flipDirection === 'next' ? currentPage - 1 : (isFlipping ? currentPage - 2 : currentPage - 1);
  const rightIdx = isFlipping && flipDirection === 'next' ? currentPage + 1 : (isFlipping ? currentPage : currentPage);
  
  const staticLeft = getPageData(leftIdx);
  const staticRight = getPageData(rightIdx);

  // Flipping Layer
  const flippingIdx = flipDirection === 'next' ? currentPage : currentPage - 1;
  const flippingPage = getPageData(flippingIdx);

  // Active (Non-flipping) Layer
  const activePage = getPageData(currentPage);
  const prevPage = getPageData(currentPage - 1);

  const PageHeader = ({ title }: { title: string }) => (
      <div className="absolute top-6 left-0 right-0 text-center text-[10px] text-gray-400 font-serif uppercase tracking-widest opacity-60 border-b border-gray-200 mx-12 pb-2">
         {title}
      </div>
  );

  const PageFooter = ({ num }: { num: number }) => (
       <div className="absolute bottom-6 left-0 right-0 text-center text-xs font-serif text-gray-500 tracking-widest">
            {num > 0 ? `~ ${num} ~` : ''}
       </div>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen pb-10 overflow-hidden bg-brand-900">
        
        {/* Controls Header */}
        <div className="w-full max-w-6xl flex justify-between items-center mb-6 px-4 animate-fade-in-down z-20">
            <button 
                onClick={onReset}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-xs uppercase tracking-widest font-bold bg-brand-800/50 px-4 py-2 rounded-full backdrop-blur-sm hover:bg-brand-700"
            >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                Library
            </button>
            <div className="text-gray-400 text-sm font-serif italic flex items-center gap-2">
                {isStreaming && currentPage === pages.length - 1 ? (
                    <span className="flex items-center gap-2 text-brand-gold animate-pulse bg-brand-800/50 px-4 py-1 rounded-full">
                        <span className="material-symbols-outlined text-sm">edit_note</span>
                        Writing...
                    </span>
                ) : (
                    <span className="bg-brand-800/50 px-4 py-1 rounded-full">{currentPage + 1} of {pages.length}</span>
                )}
            </div>
            <div className="flex gap-2">
                <button 
                    onClick={downloadStory}
                    className="text-gray-400 hover:text-brand-accent transition-colors text-xs flex items-center gap-2 uppercase tracking-widest font-bold bg-brand-800/50 px-4 py-2 rounded-full backdrop-blur-sm hover:bg-brand-700"
                    title="Download Story"
                >
                    <span className="material-symbols-outlined text-sm">download</span> <span className="hidden sm:inline">Save</span>
                </button>
                <button 
                    onClick={() => window.print()}
                    className="text-gray-400 hover:text-white transition-colors text-xs flex items-center gap-2 uppercase tracking-widest font-bold bg-brand-800/50 px-4 py-2 rounded-full backdrop-blur-sm hover:bg-brand-700"
                >
                    <span className="material-symbols-outlined text-sm">print</span> <span className="hidden sm:inline">Print</span>
                </button>
            </div>
        </div>

        {/* 3D Book Container */}
        <div className="relative w-full max-w-[1200px] aspect-[1.6/1] perspective-2000 z-10 hidden md:block">
            {/* The Book */}
            <div className="relative w-full h-full transform-style-3d flex justify-center shadow-2xl">
                
                {/* Book Spine Shadow */}
                <div className="absolute left-1/2 top-0 bottom-0 w-8 -ml-4 z-0 bg-gradient-to-r from-gray-900/40 via-gray-800/20 to-gray-900/40 blur-sm rounded-sm"></div>

                {/* --- Static Left Page (Underneath) --- */}
                <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-[#f4ecd8] rounded-l-lg border-r border-gray-300 shadow-md overflow-hidden z-0 flex flex-col">
                    <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-black/10 to-transparent pointer-events-none z-10"></div>
                    <div className="flex-1 p-12 overflow-hidden relative">
                         <PageHeader title={staticLeft?.chapterTitle || ''} />
                         <div className="h-full overflow-hidden pt-6">
                            <RichTextRenderer text={staticLeft?.content || ''} />
                         </div>
                         <PageFooter num={staticLeft?.pageNumber || 0} />
                    </div>
                </div>

                {/* --- Static Right Page (Underneath) --- */}
                <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-[#f4ecd8] rounded-r-lg border-l border-gray-300 shadow-md overflow-hidden z-0 flex flex-col">
                    <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-black/10 to-transparent pointer-events-none z-10"></div>
                     <div className="flex-1 p-12 overflow-hidden relative">
                         <PageHeader title={staticRight?.chapterTitle || ''} />
                         <div className="h-full overflow-hidden pt-6">
                            <RichTextRenderer text={staticRight?.content || ''} />
                         </div>
                         <PageFooter num={staticRight?.pageNumber || 0} />
                    </div>
                </div>

                {/* --- The Flipping Page --- */}
                {isFlipping && flippingPage && (
                    <div 
                        className={`absolute right-0 top-0 bottom-0 w-1/2 h-full origin-left transform-style-3d z-20 transition-transform duration-[900ms] ease-in-out bg-[#f4ecd8] rounded-r-lg
                        ${flipDirection === 'next' ? 'animate-flip-next' : 'animate-flip-prev'}
                        `}
                        style={{ 
                            transform: flipDirection === 'next' ? 'rotateY(-180deg)' : 'rotateY(0deg)',
                            borderRadius: flipDirection === 'next' ? '8px 0 0 8px' : '0 8px 8px 0'
                        }}
                    >
                         {/* Front Face */}
                         <div className="absolute inset-0 backface-hidden bg-[#f4ecd8] overflow-hidden rounded-r-lg border-l border-gray-300">
                             <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-black/10 to-transparent pointer-events-none z-10"></div>
                             <div className="p-12 h-full relative">
                                <PageHeader title={flippingPage.chapterTitle} />
                                <div className="h-full overflow-hidden pt-6">
                                    <RichTextRenderer text={flippingPage.content} />
                                </div>
                                <PageFooter num={flippingPage.pageNumber} />
                             </div>
                         </div>

                         {/* Back Face */}
                         <div className="absolute inset-0 backface-hidden rotate-y-180 bg-[#f4ecd8] overflow-hidden rounded-l-lg border-r border-gray-300">
                             <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-black/10 to-transparent pointer-events-none z-10"></div>
                             <div className="p-12 h-full relative">
                                <PageHeader title={flippingPage.chapterTitle} />
                                <div className="h-full overflow-hidden pt-6">
                                    <RichTextRenderer text={flippingPage.content} />
                                </div>
                                <PageFooter num={flippingPage.pageNumber} />
                             </div>
                         </div>
                    </div>
                )}
                
                {/* --- Static Active Page (When not flipping) --- */}
                {!isFlipping && activePage && (
                    <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-[#f4ecd8] rounded-r-lg border-l border-gray-300 shadow-xl overflow-hidden z-10">
                        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-black/5 to-transparent pointer-events-none z-10"></div>
                        <div className="p-12 h-full relative overflow-y-auto custom-scrollbar">
                             <PageHeader title={activePage.chapterTitle} />
                             <div className="pt-6">
                                <RichTextRenderer text={activePage.content} />
                             </div>
                             {isStreaming && currentPage === pages.length - 1 && (
                                <div className="mt-4 flex justify-center opacity-50">
                                    <span className="text-2xl text-brand-gold animate-bounce">...</span>
                                </div>
                             )}
                             <PageFooter num={activePage.pageNumber} />
                        </div>
                    </div>
                )}
                 {!isFlipping && prevPage && (
                    <div className="absolute left-0 top-0 bottom-0 w-1/2 bg-[#f4ecd8] rounded-l-lg border-r border-gray-300 shadow-sm overflow-hidden z-10">
                         <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-black/5 to-transparent pointer-events-none z-10"></div>
                         <div className="p-12 h-full relative overflow-y-auto custom-scrollbar">
                            <PageHeader title={prevPage.chapterTitle} />
                            <div className="pt-6">
                                <RichTextRenderer text={prevPage.content} />
                            </div>
                            <PageFooter num={prevPage.pageNumber} />
                        </div>
                    </div>
                )}
            </div>
            
            {/* Click Zones */}
            <div 
                className={`absolute top-0 bottom-0 left-0 w-24 cursor-pointer z-30 hover:bg-gradient-to-r from-black/5 to-transparent transition-all ${currentPage === 0 ? 'pointer-events-none' : ''}`}
                onClick={() => turnPage('prev')}
                title="Previous Page"
            />
            <div 
                className={`absolute top-0 bottom-0 right-0 w-24 cursor-pointer z-30 hover:bg-gradient-to-l from-black/5 to-transparent transition-all ${currentPage >= pages.length - 1 ? 'pointer-events-none' : ''}`}
                onClick={() => turnPage('next')}
                title="Next Page"
            />
        </div>

        {/* Mobile View */}
        <div className="md:hidden w-full px-4 max-w-lg">
             <div className="bg-[#f4ecd8] text-gray-900 rounded-lg shadow-xl p-6 min-h-[60vh] relative border-r-4 border-gray-300">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-b from-black/5 to-transparent"></div>
                {activePage && <RichTextRenderer text={activePage.content} />}
                <div className="flex justify-between mt-8 pt-4 border-t border-gray-300/50">
                    <button 
                        onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        className="text-brand-900 disabled:opacity-30 font-bold uppercase text-xs"
                    >
                        Previous
                    </button>
                    <span className="text-gray-500 text-xs font-serif italic">{currentPage + 1} / {pages.length}</span>
                    <button 
                        onClick={() => setCurrentPage(p => Math.min(pages.length - 1, p + 1))}
                        disabled={currentPage === pages.length - 1}
                        className="text-brand-900 disabled:opacity-30 font-bold uppercase text-xs"
                    >
                        Next
                    </button>
                </div>
             </div>
        </div>

        {/* Desktop Controls */}
        <div className="hidden md:flex items-center gap-8 mt-8 z-20">
             <button 
                onClick={() => turnPage('prev')}
                disabled={currentPage === 0 || isFlipping}
                className="w-14 h-14 bg-brand-800 hover:bg-brand-700 text-white rounded-full shadow-lg flex items-center justify-center disabled:opacity-50 transition-all group border border-brand-700 hover:scale-110"
             >
                 <span className="material-symbols-outlined group-hover:-translate-x-1 transition-transform">arrow_back</span>
             </button>
             
             <div className="flex flex-col items-center">
                 <span className="text-white font-serif text-lg">{currentPage + 1}</span>
                 <span className="text-gray-500 text-xs uppercase tracking-widest">Page</span>
             </div>
             
             <button 
                onClick={() => turnPage('next')}
                disabled={currentPage >= pages.length - 1 || isFlipping}
                className="w-14 h-14 bg-brand-800 hover:bg-brand-700 text-white rounded-full shadow-lg flex items-center justify-center disabled:opacity-50 transition-all group border border-brand-700 hover:scale-110"
             >
                 <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
             </button>
        </div>
        
        <style>{`
            .perspective-2000 { perspective: 2500px; }
            .transform-style-3d { transform-style: preserve-3d; }
            .backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
            .rotate-y-180 { transform: rotateY(180deg); }
            .custom-scrollbar::-webkit-scrollbar { width: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1cbb8; border-radius: 10px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #beb7a1; }
        `}</style>
    </div>
  );
};