import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '../services/geminiService';
import { ChatMessage, ChatSession } from '../types';

// --- Markdown Parsers & Renderers ---

const parseInline = (text: string) => {
    if (!text) return null;
    // Handle Bold (**text**), Italic (*text*), Code (`text`)
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
        if (part.startsWith('*') && part.endsWith('*')) return <em key={i} className="italic text-gray-300">{part.slice(1, -1)}</em>;
        if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="relative rounded bg-gray-800 px-[0.3rem] py-[0.2rem] font-mono text-xs md:text-sm font-semibold text-brand-gold">{part.slice(1, -1)}</code>;
        return part;
    });
};

const TableBlock: React.FC<{ lines: string[] }> = ({ lines }) => {
    const headers = lines[0].split('|').filter((c, i, arr) => i > 0 && i < arr.length - 1 || c.trim()).map(c => c.trim());
    const separatorLine = lines[1];
    const hasSeparator = separatorLine?.includes('---');
    const bodyLines = lines.slice(hasSeparator ? 2 : 1);

    const alignments = hasSeparator ? separatorLine.split('|').filter((c, i, arr) => i > 0 && i < arr.length - 1 || c.trim()).map(c => {
        const trimmed = c.trim();
        if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
        if (trimmed.endsWith(':')) return 'right';
        return 'left';
    }) : [];

    return (
        <div className="my-3 w-full overflow-hidden rounded-md border border-gray-800 bg-[#020617]">
            <div className="overflow-x-auto">
                <table className="w-full text-xs md:text-sm">
                    <thead className="bg-gray-900/50 [&_tr]:border-b [&_tr]:border-gray-800">
                        <tr className="border-b border-gray-800 transition-colors hover:bg-gray-900/50">
                            {headers.map((h, i) => (
                                <th key={i} className={`h-8 md:h-10 px-3 md:px-4 text-left align-middle font-medium text-gray-200 [&:has([role=checkbox])]:pr-0 ${
                                    alignments[i] === 'center' ? 'text-center' : alignments[i] === 'right' ? 'text-right' : 'text-left'
                                }`}>
                                    {parseInline(h)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                         {bodyLines.map((line, i) => {
                             const cells = line.split('|').filter((c, idx, arr) => idx > 0 && idx < arr.length - 1 || c.trim()).map(c => c.trim());
                             return (
                                 <tr key={i} className="border-b border-gray-800 transition-colors hover:bg-gray-900/50">
                                     {cells.map((cell, j) => (
                                         <td key={j} className={`p-3 md:p-4 align-middle [&:has([role=checkbox])]:pr-0 text-gray-300 ${
                                             alignments[j] === 'center' ? 'text-center' : alignments[j] === 'right' ? 'text-right' : 'text-left'
                                         }`}>
                                            {parseInline(cell)}
                                        </td>
                                     ))}
                                 </tr>
                             );
                         })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ListBlock: React.FC<{ lines: string[] }> = ({ lines }) => {
    const isOrdered = /^\d+\./.test(lines[0].trim());
    const Wrapper = isOrdered ? 'ol' : 'ul';
    
    return (
        <Wrapper className={`my-3 ml-5 md:ml-6 space-y-1.5 ${isOrdered ? 'list-decimal text-gray-300' : 'list-disc marker:text-gray-500'}`}>
            {lines.map((line, i) => (
                <li key={i} className="pl-1 text-gray-300 leading-relaxed text-xs md:text-sm">
                    {parseInline(line.replace(/^[-*] |\d+\. /, ''))}
                </li>
            ))}
        </Wrapper>
    );
};

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
    if (!content) return null;
    
    // Split code blocks first to protect them
    const parts = content.split(/(```[\s\S]*?```)/g);

    return (
        <div className="space-y-3 text-xs md:text-sm leading-6 md:leading-7 text-slate-200 font-sans tracking-wide">
            {parts.map((part, idx) => {
                if (part.startsWith('```')) {
                    // Code Block
                    const match = part.match(/^```(\w+)?\n([\s\S]*?)```$/);
                    const lang = match ? match[1] : '';
                    const code = match ? match[2] : part.slice(3, -3);
                    return (
                        <div key={idx} className="rounded-lg bg-[#020617] border border-gray-800 overflow-hidden my-4 shadow-sm">
                           {lang && (
                               <div className="px-3 py-1.5 md:px-4 md:py-2 bg-[#0f172a] border-b border-gray-800 text-[10px] md:text-xs font-mono text-gray-500 uppercase tracking-wider flex items-center justify-between">
                                   <span>{lang}</span>
                                   <button 
                                      className="hover:text-white transition-colors p-1 rounded hover:bg-white/5"
                                      onClick={() => navigator.clipboard.writeText(code)}
                                      title="Copy code"
                                   >
                                      <span className="material-symbols-outlined text-[14px] md:text-[16px]">content_copy</span>
                                   </button>
                               </div>
                           )}
                           <div className="overflow-x-auto p-3 md:p-4 custom-scrollbar">
                                <pre className="font-mono text-[10px] md:text-sm text-blue-100/90 whitespace-pre">
                                    {code}
                                </pre>
                           </div>
                        </div>
                    );
                }

                // Render structured blocks (Tables, Lists, Headers)
                const lines = part.split('\n');
                const nodes = [];
                let currentTable: string[] = [];
                let currentList: string[] = [];

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const trimmed = line.trim();

                    // Table Detection
                    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                        currentTable.push(line);
                        continue;
                    } else if (currentTable.length > 0) {
                        nodes.push(<TableBlock key={`table-${i}`} lines={currentTable} />);
                        currentTable = [];
                    }

                    // List Detection
                    if (trimmed.match(/^[-*] /) || trimmed.match(/^\d+\. /)) {
                        currentList.push(line);
                        continue;
                    } else if (currentList.length > 0) {
                        nodes.push(<ListBlock key={`list-${i}`} lines={currentList} />);
                        currentList = [];
                    }

                    if (trimmed === '') continue;

                    // Headers & Paragraphs
                    if (line.startsWith('# ')) {
                        nodes.push(<h1 key={i} className="scroll-m-20 text-xl md:text-3xl font-extrabold tracking-tight lg:text-4xl text-white mt-6 mb-3 border-b border-gray-800 pb-2">{parseInline(line.slice(2))}</h1>);
                    } else if (line.startsWith('## ')) {
                        nodes.push(<h2 key={i} className="scroll-m-20 border-b border-gray-800 pb-2 text-lg md:text-2xl font-semibold tracking-tight first:mt-0 text-white mt-6 mb-3">{parseInline(line.slice(3))}</h2>);
                    } else if (line.startsWith('### ')) {
                        nodes.push(<h3 key={i} className="scroll-m-20 text-base md:text-xl font-semibold tracking-tight text-brand-gold mt-4 mb-2">{parseInline(line.slice(4))}</h3>);
                    } else if (line.startsWith('> ')) {
                        nodes.push(<blockquote key={i} className="mt-3 border-l-2 border-brand-accent/50 pl-4 md:pl-6 italic text-gray-400 py-1 text-xs md:text-sm">{parseInline(line.slice(2))}</blockquote>);
                    } else if (line.startsWith('---')) {
                         nodes.push(<hr key={i} className="my-4 border-gray-800" />);
                    } else {
                        nodes.push(<p key={i} className="mb-3 text-slate-300 leading-6 md:leading-7 [&:not(:first-child)]:mt-3 text-xs md:text-sm">{parseInline(line)}</p>);
                    }
                }
                
                // Flush remaining buffers
                if (currentTable.length > 0) nodes.push(<TableBlock key={`table-end-${idx}`} lines={currentTable} />);
                if (currentList.length > 0) nodes.push(<ListBlock key={`list-end-${idx}`} lines={currentList} />);

                return <div key={idx}>{nodes}</div>;
            })}
        </div>
    );
};

// --- Message Actions Component ---
const MessageActions: React.FC<{ 
    text: string; 
    isLast: boolean; 
    onRetry: () => void; 
    onCopy: () => void;
    onLike: () => void;
    onDislike: () => void;
    likedStatus: 'liked' | 'disliked' | null;
}> = ({ text, isLast, onRetry, onCopy, onLike, onDislike, likedStatus }) => {
    
    // Animation states
    const [clickState, setClickState] = useState<{
        copy: boolean;
        retry: boolean;
        like: boolean;
        dislike: boolean;
    }>({ copy: false, retry: false, like: false, dislike: false });

    const triggerAnim = (key: keyof typeof clickState, cb: () => void) => {
        setClickState(prev => ({ ...prev, [key]: true }));
        setTimeout(() => setClickState(prev => ({ ...prev, [key]: false })), 200);
        cb();
    };

    return (
        <div className="flex items-center gap-1 mt-2 md:mt-3 opacity-90">
            <button 
                onClick={() => triggerAnim('copy', onCopy)} 
                className={`p-1.5 rounded-md text-gray-500 transition-all duration-200 ${clickState.copy ? 'scale-75 text-brand-accent bg-white/10' : 'hover:scale-110 hover:text-white hover:bg-white/5'}`} 
                title="Copy"
            >
                <span className="material-symbols-outlined text-[16px] md:text-[18px]">{clickState.copy ? 'check' : 'content_copy'}</span>
            </button>
            
            {isLast && (
                <button 
                    onClick={() => triggerAnim('retry', onRetry)} 
                    className={`p-1.5 rounded-md text-gray-500 transition-all duration-200 ${clickState.retry ? 'scale-75 text-brand-accent rotate-180 bg-white/10' : 'hover:scale-110 hover:text-white hover:bg-white/5'}`} 
                    title="Regenerate"
                >
                    <span className="material-symbols-outlined text-[16px] md:text-[18px]">refresh</span>
                </button>
            )}
            
            <div className="w-px h-3 bg-gray-800 mx-1"></div>
            
            <button 
                onClick={() => triggerAnim('like', onLike)} 
                className={`p-1.5 rounded-md transition-all duration-200 ${clickState.like ? 'scale-125' : 'hover:scale-110 hover:bg-white/5'} ${likedStatus === 'liked' ? 'text-brand-gold' : 'text-gray-500 hover:text-green-400'}`} 
                title="Good response"
            >
                <span className={`material-symbols-outlined text-[16px] md:text-[18px] ${likedStatus === 'liked' ? 'fill-current' : ''}`}>{likedStatus === 'liked' ? 'thumb_up' : 'thumb_up_off_alt'}</span>
            </button>
            
            <button 
                onClick={() => triggerAnim('dislike', onDislike)} 
                className={`p-1.5 rounded-md transition-all duration-200 ${clickState.dislike ? 'scale-125' : 'hover:scale-110 hover:bg-white/5'} ${likedStatus === 'disliked' ? 'text-red-400' : 'text-gray-500 hover:text-red-400'}`} 
                title="Bad response"
            >
                <span className={`material-symbols-outlined text-[16px] md:text-[18px] ${likedStatus === 'disliked' ? 'fill-current' : ''}`}>{likedStatus === 'disliked' ? 'thumb_down' : 'thumb_down_off_alt'}</span>
            </button>
        </div>
    )
}

// --- Main Chat Component ---

export const ChatSection: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]); // Changed to array
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [isFastMode, setIsFastMode] = useState(false); 
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Feedback state map (msgIndex -> status) for current session view
  const [feedbackMap, setFeedbackMap] = useState<Record<number, 'liked' | 'disliked'>>({});

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('mythos_chat_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
            setSessions(parsed);

            // Auto-load last active session if available
            const lastSessionId = localStorage.getItem('mythos_last_session_id');
            if (lastSessionId) {
                const lastSession = parsed.find((s: ChatSession) => s.id === lastSessionId);
                if (lastSession) {
                    setMessages(lastSession.messages);
                    setCurrentSessionId(lastSession.id);
                }
            }
        }
      } catch (e) {
        console.error("Failed to load chat history", e);
      }
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, attachments.length]);

  // Reset feedback map when session changes
  useEffect(() => {
      setFeedbackMap({});
  }, [currentSessionId]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const createNewSession = (firstMessage: ChatMessage) => {
      const id = Date.now().toString();
      const title = firstMessage.text.length > 30 
        ? firstMessage.text.substring(0, 30) + '...' 
        : (firstMessage.attachments?.length ? 'Image Analysis' : firstMessage.text);
      
      const newSession: ChatSession = {
          id,
          title,
          timestamp: Date.now(),
          messages: [firstMessage]
      };

      setSessions(prev => {
          const updated = [newSession, ...prev];
          localStorage.setItem('mythos_chat_history', JSON.stringify(updated));
          return updated;
      });
      
      setCurrentSessionId(id);
      localStorage.setItem('mythos_last_session_id', id);
      return id;
  };

  const updateSessionInStorage = (id: string, msgs: ChatMessage[]) => {
      setSessions(prev => {
          const sessionExists = prev.some(s => s.id === id);
          if (!sessionExists) {
              return prev;
          }

          const updatedSessions = prev.map(s => {
              if (s.id === id) {
                  return { ...s, messages: msgs, timestamp: Date.now() };
              }
              return s;
          });
          
          // Reorder: active to top
          const current = updatedSessions.find(s => s.id === id);
          const others = updatedSessions.filter(s => s.id !== id);
          
          const final = current ? [current, ...others] : updatedSessions;
          localStorage.setItem('mythos_chat_history', JSON.stringify(final));
          return final;
      });
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setSessions(prev => {
          const updated = prev.filter(s => s.id !== id);
          localStorage.setItem('mythos_chat_history', JSON.stringify(updated));
          return updated;
      });
      
      if (currentSessionId === id) {
          setMessages([]);
          setCurrentSessionId(null);
          localStorage.removeItem('mythos_last_session_id');
      }
  };

  const loadSession = (session: ChatSession) => {
      setMessages(session.messages);
      setCurrentSessionId(session.id);
      localStorage.setItem('mythos_last_session_id', session.id);
      if (window.innerWidth < 768) {
          setSidebarOpen(false);
      }
  };

  const startNewChat = () => {
      setMessages([]);
      setCurrentSessionId(null);
      localStorage.removeItem('mythos_last_session_id');
      setAttachments([]);
      if (window.innerWidth < 768) {
          setSidebarOpen(false);
      }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
          (Array.from(event.target.files) as File[]).forEach(file => {
             const reader = new FileReader();
             reader.onload = (e) => {
                 const result = e.target?.result as string;
                 setAttachments(prev => [...prev, result]);
             };
             reader.readAsDataURL(file);
          });
          event.target.value = '';
      }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      (Array.from(e.clipboardData.files) as File[]).forEach(file => {
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
               setAttachments(prev => [...prev, event.target?.result as string]);
            };
            reader.readAsDataURL(file);
          }
      });
    }
  };

  const removeAttachment = (index: number) => {
      setAttachments(prev => prev.filter((_, i) => i !== index));
  }

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if ((!textToSend.trim() && attachments.length === 0) || isLoading) return;

    const userMsg: ChatMessage = { 
        role: 'user', 
        text: textToSend, 
        timestamp: Date.now(),
        attachments: attachments.length > 0 ? [...attachments] : undefined
    };
    
    const newMessages = [...messages, userMsg];
    
    setMessages(newMessages);
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    let activeId = currentSessionId;

    // Handle Session Creation/Update immediately
    if (!activeId) {
        activeId = createNewSession(userMsg);
    } else {
        updateSessionInStorage(activeId, newMessages);
    }

    const history = messages.map(m => {
        const parts: any[] = [{ text: m.text }];
        if (m.attachments) {
            m.attachments.forEach(att => {
                parts.push({
                    inlineData: {
                        mimeType: "image/jpeg",
                        data: att.split(',')[1]
                    }
                });
            })
        }
        return {
            role: m.role,
            parts: parts
        };
    });

    // Use Gemini 3 Flash Preview for "Smart" mode, and Gemini 2.5 Flash for "Fast" mode
    const model = isFastMode ? 'gemini-2.5-flash' : 'gemini-3-flash-preview';
    
    const response = await sendChatMessage(history, userMsg.text, model, userMsg.attachments);
    
    const modelMsg: ChatMessage = {
      role: 'model',
      text: response.text,
      timestamp: Date.now(),
      generatedImage: response.generatedImage
    };
    
    const finalMessages = [...newMessages, modelMsg];
    setMessages(finalMessages);
    
    if (activeId) {
        updateSessionInStorage(activeId, finalMessages);
    }
    
    setIsLoading(false);
  };

  const handleRegenerate = async () => {
      if (messages.length === 0) return;
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role !== 'model') return;

      // Remove last model message
      const historyForRetry = messages.slice(0, -1);
      setMessages(historyForRetry);
      setIsLoading(true);

      // Get last user message to use as the prompt for regeneration
      const lastUserMsg = historyForRetry[historyForRetry.length - 1];
      
      // We need to pass the history *before* the last user message, and the last user message as the new input
      const previousHistory = historyForRetry.slice(0, -1).map(m => {
           const parts: any[] = [{ text: m.text }];
           if (m.attachments) {
               m.attachments.forEach(att => {
                   parts.push({
                        inlineData: {
                            mimeType: "image/jpeg",
                            data: att.split(',')[1]
                        }
                   });
               });
           }
           return { role: m.role, parts };
      });

      const model = isFastMode ? 'gemini-2.5-flash' : 'gemini-3-flash-preview';
      
      // Call API
      const response = await sendChatMessage(previousHistory, lastUserMsg.text, model, lastUserMsg.attachments);
      
      // Add response
      const modelMsg: ChatMessage = {
          role: 'model',
          text: response.text,
          timestamp: Date.now(),
          generatedImage: response.generatedImage
      };
      
      const finalMessages = [...historyForRetry, modelMsg];
      setMessages(finalMessages);
      
      if (currentSessionId) {
          updateSessionInStorage(currentSessionId, finalMessages);
      }
      setIsLoading(false);
  };

  const handleCopy = (text: string) => {
      navigator.clipboard.writeText(text);
  };

  const toggleFeedback = (idx: number, type: 'liked' | 'disliked') => {
      setFeedbackMap(prev => {
          if (prev[idx] === type) {
              const newState = { ...prev };
              delete newState[idx];
              return newState;
          }
          return { ...prev, [idx]: type };
      });
  };

  return (
    <div className="flex h-full w-full bg-[#0f172a] overflow-hidden relative font-sans">
      
      {/* Sidebar Overlay (Mobile) */}
      {sidebarOpen && (
          <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity" onClick={() => setSidebarOpen(false)}></div>
      )}

      {/* Sidebar */}
      <div 
        className={`
            fixed inset-y-0 left-0 z-50 flex flex-col
            bg-[#0a0f1c] border-r border-gray-800 shadow-2xl md:shadow-none
            transition-all duration-300 ease-in-out
            md:relative 
            ${sidebarOpen ? 'translate-x-0 w-72 md:w-64' : '-translate-x-full w-72 md:translate-x-0 md:w-0 md:border-none'}
        `}
      >
        <div className={`p-3 flex flex-col h-full w-full overflow-hidden transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'md:opacity-0 opacity-100'}`}>
            <button 
                onClick={startNewChat}
                className="flex items-center gap-2 w-full bg-brand-800/30 hover:bg-brand-800 text-white p-3 rounded-lg mb-4 transition-colors font-medium border border-gray-800 text-sm group active:scale-95 transform duration-150"
            >
                <span className="material-symbols-outlined text-brand-gold text-xl group-hover:rotate-90 transition-transform">add</span>
                <span className="whitespace-nowrap">New Chat</span>
            </button>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 px-2">History</h3>
                <div className="space-y-1">
                    {sessions.length === 0 && (
                        <p className="px-2 text-xs text-gray-600 italic">No previous chats</p>
                    )}
                    {sessions.map(session => (
                        <div 
                            key={session.id}
                            onClick={() => loadSession(session)}
                            className={`p-3 rounded-md text-xs cursor-pointer transition-all flex items-center gap-2 group truncate relative pr-8 touch-manipulation
                                ${currentSessionId === session.id 
                                    ? 'bg-brand-800 text-white border border-gray-700 shadow-sm' 
                                    : 'text-gray-400 hover:bg-brand-800/30 hover:text-gray-300'
                                }`}
                        >
                            <span className="material-symbols-outlined text-[16px] flex-shrink-0">chat_bubble_outline</span>
                            <span className="truncate">{session.title}</span>
                            
                            <button 
                                onClick={(e) => deleteSession(e, session.id)}
                                className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 hover:text-red-400 p-2 transition-opacity"
                                title="Delete Chat"
                            >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-auto pt-3 border-t border-gray-800 text-[10px] text-gray-600 text-center whitespace-nowrap">
                Strong Mind v1.5
            </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0f172a] relative h-full">
        
        {/* Toggle Sidebar Button */}
        <div className="absolute top-2 left-2 z-10 md:top-3 md:left-3">
            <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 md:p-1.5 bg-brand-800/80 hover:bg-brand-700 text-gray-400 hover:text-white rounded-md transition-colors shadow-sm border border-gray-800 active:scale-90 transform duration-150 backdrop-blur-sm"
                aria-label="Toggle Sidebar"
            >
                <span className="material-symbols-outlined text-xl md:text-lg">
                    {sidebarOpen ? 'chevron_left' : 'menu'}
                </span>
            </button>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto px-3 md:px-0 py-4 pt-14 md:pt-4 scroll-smooth custom-scrollbar" ref={scrollRef}>
            {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center px-4 pb-20">
                     <div className="w-12 h-12 md:w-16 md:h-16 bg-brand-800/30 rounded-2xl flex items-center justify-center mb-4 shadow-lg border border-gray-700">
                        <span className="material-symbols-outlined text-3xl md:text-4xl text-brand-gold">auto_awesome</span>
                     </div>
                     <h2 className="text-xl md:text-2xl font-serif text-white mb-2">Hey! What's up?</h2>
                     <p className="text-sm text-gray-500 mb-8 max-w-xs md:max-w-none mx-auto">Ready to craft another epic story, brainstorm, or analyze images?</p>
                </div>
            ) : (
                <div className="flex flex-col w-full max-w-3xl mx-auto pt-4 pb-2 px-2 md:px-0">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex gap-4 mb-6 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                             {/* Avatar */}
                             <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 shadow-md border 
                                ${msg.role === 'user' ? 'bg-brand-accent border-brand-accent text-white' : 'bg-brand-gold border-brand-gold text-brand-900'}`}>
                                <span className="material-symbols-outlined text-sm font-bold">
                                    {msg.role === 'user' ? 'person' : 'auto_awesome'}
                                </span>
                             </div>
                             
                             <div className={`flex flex-col gap-2 max-w-[85%] md:max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                 {/* User Attachments Display (Grid) */}
                                 {msg.attachments && msg.attachments.length > 0 && (
                                     <div className={`grid gap-2 ${msg.attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} max-w-[300px]`}>
                                         {msg.attachments.map((att, i) => (
                                             <div key={i} className="rounded-lg overflow-hidden border border-gray-700 shadow-md">
                                                 <img src={att} alt={`User Upload ${i+1}`} className="w-full h-auto object-cover max-h-[200px]" />
                                             </div>
                                         ))}
                                     </div>
                                 )}

                                 <div className={`w-full break-words ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                     {msg.role === 'user' ? (
                                         <div className="bg-[#1e293b] text-white px-4 py-3 rounded-2xl rounded-tr-none inline-block text-left text-sm border border-gray-700/50 shadow-sm">
                                             {msg.text}
                                         </div>
                                     ) : (
                                         <>
                                            <div className="prose prose-invert max-w-none">
                                                <MarkdownRenderer content={msg.text} />
                                            </div>
                                            {/* Message Actions */}
                                            <MessageActions 
                                                text={msg.text} 
                                                isLast={idx === messages.length - 1} 
                                                onRetry={handleRegenerate}
                                                onCopy={() => handleCopy(msg.text)}
                                                onLike={() => toggleFeedback(idx, 'liked')}
                                                onDislike={() => toggleFeedback(idx, 'disliked')}
                                                likedStatus={feedbackMap[idx]}
                                            />
                                         </>
                                     )}
                                 </div>

                                 {/* Generated Image Display */}
                                 {msg.generatedImage && (
                                     <div className="mt-2 rounded-xl overflow-hidden border border-gray-700 shadow-xl max-w-full md:max-w-md bg-black/50">
                                         <img src={msg.generatedImage} alt="Generated Content" className="w-full h-auto" />
                                         <div className="px-3 py-2 bg-brand-900/80 flex justify-between items-center border-t border-gray-800">
                                             <span className="text-[10px] text-brand-gold font-bold uppercase tracking-wider">AI Generated</span>
                                             <a href={msg.generatedImage} download={`generated_${Date.now()}.png`} className="text-gray-400 hover:text-white p-2">
                                                 <span className="material-symbols-outlined text-lg">download</span>
                                             </a>
                                         </div>
                                     </div>
                                 )}
                             </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex gap-4 mb-6">
                             <div className="w-8 h-8 rounded-full bg-brand-gold flex items-center justify-center flex-shrink-0 mt-1 animate-pulse">
                                <span className="material-symbols-outlined text-brand-900 text-sm font-bold">auto_awesome</span>
                             </div>
                             <div className="flex items-center gap-1 py-2">
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-75"></div>
                                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-150"></div>
                             </div>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Input Bar */}
        <div className="w-full flex justify-center pb-safe-bottom pb-2 md:pb-6 bg-transparent relative z-10 px-2 md:px-4">
            <div className="w-full max-w-4xl relative bg-[#1e2330] rounded-3xl border border-gray-700/50 shadow-2xl transition-all p-2 md:p-3 flex flex-col group focus-within:ring-1 focus-within:ring-gray-600 focus-within:border-gray-600">
                 {/* Attachments Preview (Scrollable) */}
                 {attachments.length > 0 && (
                     <div className="flex items-start gap-2 mb-2 px-1 overflow-x-auto custom-scrollbar pb-2">
                         {attachments.map((att, idx) => (
                             <div key={idx} className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-gray-600 group/preview animate-fade-in">
                                 <img src={att} alt={`Preview ${idx}`} className="w-full h-full object-cover" />
                                 <button 
                                     onClick={() => removeAttachment(idx)}
                                     className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity text-white hover:text-red-400"
                                 >
                                     <span className="material-symbols-outlined text-xl">close</span>
                                 </button>
                             </div>
                         ))}
                     </div>
                 )}

                 <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onPaste={handlePaste}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder={attachments.length > 0 ? "Ask about these images..." : "Type a message or ask to generate..."}
                    className="w-full bg-transparent border-none text-gray-200 text-base placeholder-gray-500 px-3 py-2 focus:ring-0 focus:outline-none resize-none max-h-[120px] scrollbar-hide mb-1 min-h-[44px]"
                    rows={1}
                 />
                 
                 <div className="flex justify-between items-center px-1 pt-1">
                    {/* Model Selector / Tools */}
                    <div className="flex items-center gap-1">
                         <input 
                            type="file" 
                            ref={fileInputRef} 
                            accept="image/*" 
                            multiple
                            className="hidden" 
                            onChange={handleFileSelect} 
                         />
                         <button 
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-full transition-colors relative active:scale-90 transform min-w-[40px] flex items-center justify-center"
                            title="Upload Images"
                         >
                             <span className="material-symbols-outlined text-2xl">add_photo_alternate</span>
                         </button>
                         <button
                            type="button"
                            className="flex items-center bg-black/20 rounded-full p-0.5 border border-gray-700 cursor-pointer ml-1 active:scale-95 transition-transform select-none disabled:opacity-70 disabled:cursor-not-allowed"
                            onClick={() => setIsFastMode(!isFastMode)}
                            disabled={attachments.length > 0}
                         >
                             <div className={`px-3 py-1.5 rounded-full text-[10px] md:text-[11px] font-bold transition-all flex items-center gap-1 ${isFastMode && attachments.length === 0 ? 'bg-brand-accent text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
                                 <span className="material-symbols-outlined text-[14px]">bolt</span>
                                 Fast
                             </div>
                             <div className={`px-3 py-1.5 rounded-full text-[10px] md:text-[11px] font-bold transition-all flex items-center gap-1 ${(!isFastMode || attachments.length > 0) ? 'bg-brand-gold text-brand-900 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
                                 <span className="material-symbols-outlined text-[14px]">{attachments.length > 0 ? 'visibility' : 'psychology'}</span>
                                 {attachments.length > 0 ? 'Pro Vision' : 'Smart (Flash)'}
                             </div>
                         </button>
                    </div>

                    {/* Send Button */}
                    <button 
                        type="button"
                        onClick={() => handleSend()}
                        disabled={(!input.trim() && attachments.length === 0) || isLoading}
                        className={`w-10 h-10 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all active:scale-90 transform shadow-md ${(input.trim() || attachments.length > 0) ? 'bg-white text-black hover:bg-gray-200' : 'bg-brand-800 text-gray-600 cursor-not-allowed border border-gray-700'}`}
                    >
                        <span className="material-symbols-outlined text-xl">arrow_upward</span>
                    </button>
                 </div>
            </div>
        </div>

      </div>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .pb-safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
      `}</style>
    </div>
  );
};