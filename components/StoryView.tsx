import React, { useState, useEffect, useRef } from 'react';
import { PageData } from '../types';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { generateImage, rewriteText } from '../services/geminiService';

interface Props {
  content: string;
  onReset: () => void;
  isStreaming: boolean;
  onUpdate?: (newContent: string) => void;
}

const CHARS_PER_PAGE = 1200; 

// Enhanced Rich Text Renderer with Markdown Image Support
const RichTextRenderer: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  
  // Split by double newline to handle paragraphs better
  const blocks = text.split(/\n\s*\n/);
  
  return (
    <div className="font-serif antialiased space-y-3 md:space-y-4">
      {blocks.map((block, idx) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        // Images: ![Alt](Base64)
        const imgMatch = trimmed.match(/^!\[(.*?)\]\((data:image\/.*?;base64,.*?)\)$/);
        if (imgMatch) {
            return (
                <div key={idx} className="my-4 md:my-6 flex justify-center">
                    <img 
                        src={imgMatch[2]} 
                        alt={imgMatch[1]} 
                        className="max-w-full h-auto max-h-[300px] rounded-lg shadow-md border border-brand-700/20" 
                    />
                </div>
            );
        }

        // Headers
        if (trimmed.startsWith('# ')) {
             return <h1 key={idx} className="text-2xl md:text-4xl font-bold font-serif text-brand-900 mb-6 md:mb-8 mt-2 md:mt-4 text-center leading-tight">{trimmed.replace('# ', '')}</h1>;
        }
        if (trimmed.startsWith('## ')) {
             return <h2 key={idx} className="text-xl md:text-2xl font-bold font-serif text-brand-800 mb-4 md:mb-6 mt-6 md:mt-8 border-b-2 border-brand-gold/20 pb-2">{trimmed.replace('## ', '')}</h2>;
        }
        if (trimmed.startsWith('### ')) {
             return <h3 key={idx} className="text-lg md:text-xl font-semibold font-serif text-brand-700 mb-3 md:mb-4 mt-4 md:mt-6 italic">{trimmed.replace('### ', '')}</h3>;
        }

        // Blockquotes
        if (trimmed.startsWith('> ')) {
            return (
                <blockquote key={idx} className="border-l-4 border-brand-gold pl-4 md:pl-6 italic text-gray-700 my-4 md:my-6 bg-yellow-50/50 p-3 md:p-4 rounded-r-lg text-base md:text-lg font-light leading-relaxed">
                    {parseInline(trimmed.replace(/> /g, ''))}
                </blockquote>
            );
        }

        // Horizontal Rule
        if (trimmed === '---') {
            return <div key={idx} className="flex justify-center my-6 md:my-8"><span className="text-brand-gold/60 text-xl md:text-2xl tracking-[0.5em]">❖ ❖ ❖</span></div>;
        }

        // Lists
        if (trimmed.startsWith('- ') || trimmed.match(/^\d+\. /)) {
            const items = trimmed.split('\n');
            return (
                <ul key={idx} className="space-y-2 mb-4 ml-4">
                    {items.map((item, i) => {
                        const cleanItem = item.replace(/^- /, '').replace(/^\d+\. /, '');
                        return <li key={i} className="list-disc ml-4 text-gray-800 leading-relaxed pl-2 marker:text-brand-gold text-base md:text-lg">{parseInline(cleanItem)}</li>
                    })}
                </ul>
            )
        }

        // Standard Paragraph
        return <p key={idx} className="text-gray-800 leading-relaxed text-base md:text-lg text-justify indent-6 md:indent-8">{parseInline(trimmed)}</p>;
      })}
    </div>
  );
};

// Helper to parse bold/italic/strikethrough/code inline
const parseInline = (text: string) => {
  // Extended regex to capture strikethrough (~~) and inline code (`)
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|~~.*?~~|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-bold text-brand-900">{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className="italic text-brand-800">{part.slice(1, -1)}</em>;
    if (part.startsWith('~~') && part.endsWith('~~')) return <span key={i} className="line-through text-gray-500 decoration-gray-400 decoration-2">{part.slice(2, -2)}</span>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="font-mono text-[0.9em] bg-black/5 text-brand-900 px-1.5 py-0.5 rounded border border-black/10 mx-0.5">{part.slice(1, -1)}</code>;
    return part;
  });
};

// --- Writer Studio Components ---

interface EditableBlockProps {
    content: string;
    onUpdate: (val: string) => void;
    onIllustrate: () => void;
    onRewrite: (instruction: string) => void;
    isProcessing: boolean;
}

const EditableBlock: React.FC<EditableBlockProps> = ({ content, onUpdate, onIllustrate, onRewrite, isProcessing }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [showRewrite, setShowRewrite] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto resize
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [content]);

    // Handle styles based on markdown type
    let styles = "w-full bg-transparent border-none focus:ring-0 p-0 resize-none text-gray-300 font-serif leading-relaxed text-lg";
    if (content.startsWith('# ')) styles += " text-3xl font-bold text-center text-white mb-4";
    else if (content.startsWith('## ')) styles += " text-2xl font-bold text-brand-gold mt-6 mb-2 border-b border-brand-700/50 pb-2";
    else if (content.startsWith('> ')) styles += " italic pl-4 border-l-4 border-brand-accent text-gray-400";
    else if (content.startsWith('![')) styles = "hidden"; // Hide raw image text in this view, handle differently? No, let's just show it as raw for now to keep it simple, or render a preview.
    
    // Determine if we can illustrate (paragraphs only)
    const canIllustrate = content.length > 50 && !content.startsWith('#') && !content.startsWith('![') && !content.startsWith('---');

    const handleSelect = () => {
        const selection = window.getSelection();
        if (selection && selection.toString().length > 5) {
            setShowRewrite(true);
        } else {
            setShowRewrite(false);
        }
    };

    if (content.startsWith('![')) {
        const imgMatch = content.match(/^!\[(.*?)\]\((data:image\/.*?;base64,.*?)\)$/);
        if (imgMatch) {
             return (
                 <div className="relative group my-4 flex justify-center">
                    <img src={imgMatch[2]} alt={imgMatch[1]} className="max-h-[300px] rounded-lg" />
                    <button 
                        onClick={() => onUpdate('')} // Delete image
                        className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                 </div>
             )
        }
    }

    return (
        <div 
            className="relative group mb-4 pl-8 md:pl-12 pr-4 transition-all hover:bg-white/5 rounded-lg -ml-4"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Sidebar Actions */}
            <div className={`absolute left-0 top-2 flex flex-col gap-1 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                {canIllustrate && (
                    <button 
                        onClick={onIllustrate}
                        className="text-gray-500 hover:text-brand-gold p-1 rounded hover:bg-white/10"
                        title="Illustrate this paragraph"
                        disabled={isProcessing}
                    >
                        <span className="material-symbols-outlined text-lg">{isProcessing ? 'hourglass_top' : 'image'}</span>
                    </button>
                )}
            </div>

            {/* Rewrite Popover */}
            {showRewrite && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-brand-800 shadow-xl border border-brand-700 rounded-lg p-1 flex gap-2 z-20 animate-fade-in-up">
                    <button onClick={() => onRewrite("Make it darker and more gritty")} className="px-3 py-1 text-xs hover:bg-brand-700 rounded text-gray-300">Darker</button>
                    <button onClick={() => onRewrite("Make it more descriptive and flowery")} className="px-3 py-1 text-xs hover:bg-brand-700 rounded text-gray-300">Expand</button>
                    <button onClick={() => onRewrite("Make it concise and punchy")} className="px-3 py-1 text-xs hover:bg-brand-700 rounded text-gray-300">Shorten</button>
                </div>
            )}

            <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => onUpdate(e.target.value)}
                onSelect={handleSelect}
                className={styles}
                rows={1}
            />
        </div>
    );
};

export const StoryView: React.FC<Props> = ({ content, onReset, isStreaming, onUpdate }) => {
  const [mode, setMode] = useState<'READER' | 'STUDIO'>('READER');
  const [pages, setPages] = useState<PageData[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev'>('next');
  const [storyTitle, setStoryTitle] = useState('Untitled Story');
  const [blocks, setBlocks] = useState<string[]>([]);
  const [processingBlockIdx, setProcessingBlockIdx] = useState<number | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  
  // Initialize Blocks for Studio Mode
  useEffect(() => {
      // Split by double newline to maintain paragraph structure for editing
      const splitBlocks = content.split(/\n\s*\n/);
      setBlocks(splitBlocks);

      // Extract Title
      const mainTitleMatch = content.match(/^# (.+)$/m);
      if (mainTitleMatch) setStoryTitle(mainTitleMatch[1]);
      
  }, [content]);

  // Sync Studio edits back to main content string
  const handleBlockUpdate = (idx: number, newText: string) => {
      const newBlocks = [...blocks];
      if (newText.trim() === '') {
          // Remove empty blocks if desired, or keep empty
          newBlocks.splice(idx, 1);
      } else {
          newBlocks[idx] = newText;
      }
      setBlocks(newBlocks);
      if (onUpdate) onUpdate(newBlocks.join('\n\n'));
  };

  const handleIllustrate = async (idx: number) => {
      setProcessingBlockIdx(idx);
      try {
          const prompt = blocks[idx];
          const imageBase64 = await generateImage(prompt, "16:9"); // Landscape for book illustrations
          const imageBlock = `![Illustration for: ${prompt.substring(0, 20)}...](${imageBase64})`;
          
          const newBlocks = [...blocks];
          newBlocks.splice(idx + 1, 0, imageBlock);
          
          setBlocks(newBlocks);
          if (onUpdate) onUpdate(newBlocks.join('\n\n'));
      } catch (e) {
          alert("Failed to generate illustration.");
      } finally {
          setProcessingBlockIdx(null);
      }
  };

  const handleRewrite = async (idx: number, instruction: string) => {
      setProcessingBlockIdx(idx);
      try {
        const text = blocks[idx];
        const rewritten = await rewriteText(text, instruction);
        handleBlockUpdate(idx, rewritten);
      } catch (e) {
          alert("Rewrite failed.");
      } finally {
        setProcessingBlockIdx(null);
      }
  };

  // --- Pagination Logic (Same as before but handles image markdown size loosely) ---
  useEffect(() => {
    const lines = content.split('\n');
    const newPages: PageData[] = [];
    
    let currentChunk = '';
    let currentLength = 0;
    let currentChapterTitle = 'Prologue';
    
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
        }
        
        // Image Handling: Images take up a lot of "visual" space but little text space. 
        // We force a page break if an image is encountered to keep layout clean.
        if (line.startsWith('![')) {
             if (currentChunk.trim().length > 0) {
                 newPages.push({ content: currentChunk, chapterTitle: currentChapterTitle, pageNumber: newPages.length + 1 });
             }
             // Image gets its own page or top of next page usually
             newPages.push({ content: line, chapterTitle: currentChapterTitle, pageNumber: newPages.length + 1 });
             currentChunk = '';
             currentLength = 0;
             return;
        }

        const lineLen = line.length;
        
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
  }, [content]);

  // --- TOC Extraction ---
  const tocItems = blocks
    .map((b, i) => ({ text: b, index: i }))
    .filter(item => item.text.startsWith('## ')); // Get chapters

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

  const navigateToChapter = (chapterTitle: string) => {
      // Find page with this chapter title
      const pageIdx = pages.findIndex(p => p.chapterTitle === chapterTitle.replace('## ', '').trim());
      if (pageIdx !== -1) {
          setCurrentPage(pageIdx);
          setTocOpen(false);
          setMode('READER');
      }
  };
  
  const scrollInStudio = (idx: number) => {
      // Simple scroll to rough position
      const element = document.getElementById(`block-${idx}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTocOpen(false);
  };

  // Helper getters
  const getPageData = (idx: number) => (idx < 0 || idx >= pages.length) ? null : pages[idx];
  const leftIdx = isFlipping && flipDirection === 'next' ? currentPage - 1 : (isFlipping ? currentPage - 2 : currentPage - 1);
  const rightIdx = isFlipping && flipDirection === 'next' ? currentPage + 1 : (isFlipping ? currentPage : currentPage);
  const staticLeft = getPageData(leftIdx);
  const staticRight = getPageData(rightIdx);
  const flippingIdx = flipDirection === 'next' ? currentPage : currentPage - 1;
  const flippingPage = getPageData(flippingIdx);
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
    <div className="flex flex-col items-center justify-center min-h-screen pb-10 overflow-hidden bg-brand-900 print:bg-white print:h-auto print:overflow-visible relative">
        
        {/* --- TOC Sidebar --- */}
        <div className={`fixed left-0 top-0 bottom-0 bg-brand-800 border-r border-brand-700 z-50 w-64 transform transition-transform duration-300 shadow-2xl ${tocOpen ? 'translate-x-0' : '-translate-x-full'}`}>
             <div className="p-4 flex justify-between items-center border-b border-brand-700">
                 <h3 className="font-serif text-white font-bold">Chapters</h3>
                 <button onClick={() => setTocOpen(false)} className="text-gray-400 hover:text-white"><span className="material-symbols-outlined">close</span></button>
             </div>
             <div className="overflow-y-auto h-full p-2">
                 {tocItems.map((item, i) => (
                     <button 
                        key={i} 
                        onClick={() => mode === 'READER' ? navigateToChapter(item.text) : scrollInStudio(item.index)}
                        className="w-full text-left p-3 rounded hover:bg-brand-700 text-gray-300 hover:text-white text-sm truncate font-medium mb-1"
                     >
                         {item.text.replace(/#/g, '').trim()}
                     </button>
                 ))}
             </div>
        </div>

        {/* --- Top Controls --- */}
        <div className="w-full max-w-6xl flex flex-wrap justify-between items-center mb-4 md:mb-6 px-4 animate-fade-in-down z-20 no-print gap-2 mt-4">
             <div className="flex gap-2">
                 <button onClick={onReset} className="flex items-center gap-2 text-gray-400 hover:text-white text-xs uppercase font-bold bg-brand-800/50 px-4 py-2 rounded-full hover:bg-brand-700">
                    <span className="material-symbols-outlined text-sm">arrow_back</span> Library
                 </button>
                 <button onClick={() => setTocOpen(true)} className="flex items-center gap-2 text-gray-400 hover:text-white text-xs uppercase font-bold bg-brand-800/50 px-4 py-2 rounded-full hover:bg-brand-700">
                    <span className="material-symbols-outlined text-sm">menu_book</span> Chapters
                 </button>
             </div>

             {/* Mode Toggle */}
             <div className="bg-brand-800/80 p-1 rounded-full border border-brand-700 flex">
                 <button 
                    onClick={() => setMode('READER')} 
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1 ${mode === 'READER' ? 'bg-brand-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                 >
                     <span className="material-symbols-outlined text-sm">book_2</span> Read
                 </button>
                 <button 
                    onClick={() => setMode('STUDIO')} 
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1 ${mode === 'STUDIO' ? 'bg-brand-accent text-white shadow' : 'text-gray-400 hover:text-white'}`}
                 >
                     <span className="material-symbols-outlined text-sm">edit_note</span> Studio
                 </button>
             </div>
        </div>

        {/* --- STUDIO MODE (Writer) --- */}
        {mode === 'STUDIO' && (
            <div className="w-full max-w-3xl flex-1 bg-[#1e2330] rounded-xl border border-brand-700 shadow-2xl p-8 md:p-12 overflow-y-auto min-h-[80vh] animate-fade-in">
                <div className="mb-8 pb-4 border-b border-brand-700/50 flex justify-between items-end">
                    <div>
                        <h2 className="text-2xl font-serif text-white font-bold">{storyTitle}</h2>
                        <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">Writer Studio • {blocks.length} Blocks</p>
                    </div>
                    {isStreaming && <span className="text-brand-gold animate-pulse text-sm font-bold flex items-center gap-1"><span className="material-symbols-outlined text-base">edit</span> Generating...</span>}
                </div>
                
                <div className="space-y-2">
                    {blocks.map((block, idx) => (
                        <div key={idx} id={`block-${idx}`}>
                            <EditableBlock 
                                content={block} 
                                onUpdate={(val) => handleBlockUpdate(idx, val)}
                                onIllustrate={() => handleIllustrate(idx)}
                                onRewrite={(instr) => handleRewrite(idx, instr)}
                                isProcessing={processingBlockIdx === idx}
                            />
                        </div>
                    ))}
                    {/* Add new paragraph button */}
                    <div className="opacity-0 hover:opacity-100 transition-opacity flex justify-center py-2">
                        <button onClick={() => handleBlockUpdate(blocks.length, "New paragraph...")} className="text-gray-600 hover:text-brand-accent text-sm flex items-center gap-1">
                            <span className="material-symbols-outlined text-base">add_circle</span> Add Paragraph
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- READER MODE (Book) --- */}
        {mode === 'READER' && (
            <>
                {/* 3D Book Container (Hidden on Print) */}
                <div className="relative w-full max-w-[1200px] aspect-[1.6/1] perspective-2000 z-10 hidden md:block no-print mt-4">
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

                {/* Mobile View (Hidden on Print) */}
                <div className="md:hidden w-full px-2 no-print flex-1 flex flex-col mt-4">
                    <div className="bg-[#f4ecd8] text-gray-900 rounded-lg shadow-xl p-6 min-h-[60vh] relative border-r-4 border-gray-300 flex flex-col">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-b from-black/5 to-transparent"></div>
                        <div className="flex-1">
                            {activePage && <RichTextRenderer text={activePage.content} />}
                        </div>
                        <div className="flex justify-between mt-6 pt-4 border-t border-gray-300/50">
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                                disabled={currentPage === 0}
                                className="text-brand-900 disabled:opacity-30 font-bold uppercase text-xs px-3 py-2 bg-black/5 rounded hover:bg-black/10"
                            >
                                Previous
                            </button>
                            <span className="text-gray-500 text-xs font-serif italic flex items-center">{currentPage + 1} / {pages.length}</span>
                            <button 
                                onClick={() => setCurrentPage(p => Math.min(pages.length - 1, p + 1))}
                                disabled={currentPage === pages.length - 1}
                                className="text-brand-900 disabled:opacity-30 font-bold uppercase text-xs px-3 py-2 bg-black/5 rounded hover:bg-black/10"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>

                {/* Controls (Hidden on Print) */}
                <div className="hidden md:flex items-center gap-8 mt-8 z-20 no-print">
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
            </>
        )}

        <style>{`
            .perspective-2000 { perspective: 2500px; }
            .transform-style-3d { transform-style: preserve-3d; }
            .backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
            .rotate-y-180 { transform: rotateY(180deg); }
            .custom-scrollbar::-webkit-scrollbar { width: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1cbb8; border-radius: 10px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #beb7a1; }
            .page-break-after-always { page-break-after: always; }
            .animate-flip-next { animation: flipNext 0.9s forwards ease-in-out; }
            .animate-flip-prev { animation: flipPrev 0.9s forwards ease-in-out; }
            @keyframes flipNext {
                0% { transform: rotateY(0); }
                100% { transform: rotateY(-180deg); }
            }
            @keyframes flipPrev {
                0% { transform: rotateY(-180deg); }
                100% { transform: rotateY(0); }
            }
        `}</style>
    </div>
  );
};